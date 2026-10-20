//! Google Meet extension speaker-tracking bridge (`meet_bridge`).
//! Receives remote speaking names from the Chrome/Brave Meet extension over loopback WS.

mod clock;
mod protocol;
mod registry;
mod server;

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::speakers::identity::app_identity;
use crate::speakers::sink::SpeakerSink;

use clock::wall_now_ms;
use protocol::ClientMessage;
use registry::Registry;

/// Status row for Settings and `get_speaker_tags_status`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleMeetExtensionStatus {
    pub connected: bool,
    pub browsers: Vec<String>,
    pub in_call_tabs: u32,
    pub extension_version: Option<String>,
    pub health: String,
    /// Remote Meet display names currently speaking.
    pub remote_speaking: Vec<String>,
    /// Local user speaking (extension still sends self ids; not used for remote transcript labels).
    pub self_speaking: Vec<String>,
}

impl Default for GoogleMeetExtensionStatus {
    fn default() -> Self {
        Self {
            connected: false,
            browsers: Vec::new(),
            in_call_tabs: 0,
            extension_version: None,
            health: "unknown".into(),
            remote_speaking: Vec::new(),
            self_speaking: Vec::new(),
        }
    }
}

struct Inner {
    registry: Registry,
    session: Option<SpeakerSink>,
    listen_port: Option<u16>,
    last_names: BTreeSet<String>,
}

/// Owns the DEV loopback server, the Meet tab registry, and the session sink.
#[derive(Clone)]
pub struct MeetBridge {
    inner: Arc<Mutex<Inner>>,
    started: Arc<AtomicBool>,
}

static INSTALLED: Mutex<Option<MeetBridge>> = Mutex::new(None);

impl MeetBridge {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                registry: Registry::default(),
                session: None,
                listen_port: None,
                last_names: BTreeSet::new(),
            })),
            started: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Remember this instance so speaker-tag status can see it without an `AppHandle`.
    pub fn install_status_source(&self) {
        *INSTALLED.lock().expect("meet_bridge install") = Some(self.clone());
    }

    /// Bind `127.0.0.1:47821–47825` in DEV only. Release builds of `com.pavel.amie` do not listen.
    pub fn start_listening(&self) {
        if !dev_listen_enabled() {
            tracing::info!(
                "meet_bridge idle (release build; Google Meet extension speaker-tracking is DEV-only)"
            );
            return;
        }
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }
        let meet_bridge = self.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = server::listen(meet_bridge).await {
                tracing::error!(%error, "meet_bridge failed to listen");
            }
        });
    }

    pub fn is_live(&self) -> bool {
        let now = unix_ms();
        self.inner
            .lock()
            .expect("meet_bridge")
            .registry
            .is_live(now)
    }

    pub fn is_recording(&self) -> bool {
        self.inner.lock().expect("meet_bridge").session.is_some()
    }

    pub fn snapshot(&self) -> GoogleMeetExtensionStatus {
        let now = unix_ms();
        let snapshot = self
            .inner
            .lock()
            .expect("meet_bridge")
            .registry
            .snapshot(now);
        GoogleMeetExtensionStatus {
            connected: snapshot.connected,
            browsers: snapshot.browsers,
            in_call_tabs: snapshot.in_call_tabs,
            extension_version: snapshot.extension_version,
            health: snapshot.health,
            remote_speaking: snapshot.remote_speaking,
            self_speaking: snapshot.self_speaking,
        }
    }

    pub fn attach_session(&self, sink: SpeakerSink) {
        self.inner.lock().expect("meet_bridge").session = Some(sink);
    }

    pub fn detach_session(&self) {
        let mut inner = self.inner.lock().expect("meet_bridge");
        inner.session = None;
        inner.last_names.clear();
    }

    pub(crate) fn set_listen_port(&self, port: u16) {
        self.inner.lock().expect("meet_bridge").listen_port = Some(port);
    }

    pub(crate) fn on_hello(
        &self,
        browser: &str,
        extension_version: &str,
        instance_id: &str,
    ) -> u64 {
        let _ = instance_id;
        self.inner
            .lock()
            .expect("meet_bridge")
            .registry
            .connect(browser, extension_version)
    }

    pub(crate) fn on_disconnect(&self, id: u64) {
        self.inner
            .lock()
            .expect("meet_bridge")
            .registry
            .disconnect(id);
    }

    pub(crate) fn on_message(&self, id: u64, message: ClientMessage) {
        let pending = {
            let mut inner = self.inner.lock().expect("meet_bridge");
            let now = unix_ms();
            let _changed = inner.registry.apply(id, message, now);
            if !inner.registry.is_live(now) {
                return;
            }
            let Some(sink) = inner.session.clone() else {
                return;
            };
            let (names, observed_at) = inner.registry.selected_remote_names(now);
            if names != inner.last_names {
                tracing::info!(?names, "meet_bridge speakers (Google Meet extension)");
                inner.last_names = names.clone();
            }
            Some((sink, names, observed_at))
        };
        if let Some((sink, names, observed_at)) = pending {
            let observed = if observed_at > 0.0 {
                observed_at
            } else {
                wall_now_ms()
            };
            let at_ms =
                clock::wall_to_sample_ms(sink.sample_clock_now_ms(), wall_now_ms(), observed);
            sink.record(names, at_ms);
        }
    }
}

impl Default for MeetBridge {
    fn default() -> Self {
        Self::new()
    }
}

pub fn installed_status() -> GoogleMeetExtensionStatus {
    let installed = INSTALLED.lock().expect("meet_bridge status").clone();
    installed
        .map(|meet_bridge| meet_bridge.snapshot())
        .unwrap_or_default()
}

/// `debug_assertions` covers `tauri dev`. The dev bundle id covers a release-mode Amie Dev build.
pub fn dev_listen_enabled() -> bool {
    listen_enabled(cfg!(debug_assertions), app_identity().bundle_id.as_deref())
}

pub fn listen_enabled(debug_assertions: bool, bundle_id: Option<&str>) -> bool {
    debug_assertions || bundle_id == Some("com.pavel.amie.dev")
}

fn unix_ms() -> u64 {
    wall_now_ms().max(0.0) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;
    use std::time::Duration;

    use futures_util::{SinkExt, StreamExt};
    use tokio::net::TcpListener;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::http::HeaderValue;
    use tokio_tungstenite::tungstenite::Message;

    use crate::speakers::timeline::SpeakerTimeline;

    #[test]
    fn listen_gate_is_dev_only() {
        assert!(listen_enabled(true, Some("com.pavel.amie")));
        assert!(listen_enabled(false, Some("com.pavel.amie.dev")));
        assert!(!listen_enabled(false, Some("com.pavel.amie")));
        assert!(!listen_enabled(false, None));
    }

    #[tokio::test]
    async fn extension_origin_handshakes_and_a_page_origin_is_rejected() {
        let meet_bridge = MeetBridge::new();
        let timeline = Arc::new(Mutex::new(SpeakerTimeline::new()));
        let captured = Arc::new(AtomicU64::new(48_000));
        let speaker_cut = Arc::new(AtomicU64::new(0));
        meet_bridge.attach_session(SpeakerSink::new(
            timeline.clone(),
            captured,
            48_000,
            speaker_cut.clone(),
        ));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = meet_bridge.clone();
        let task = tokio::spawn(async move {
            server::serve(listener, server).await;
        });

        let rejected = connect_async(request(port, "https://meet.google.com")).await;
        assert!(rejected.is_err(), "a page origin must not open meet_bridge");

        let (mut socket, _) = connect_async(request(port, "chrome-extension://abcdef"))
            .await
            .expect("extension origin");
        socket
            .send(Message::text(
                r#"{"type":"hello","protocol":1,"extension_version":"0.1.0","browser":"brave","instance_id":"b1f"}"#,
            ))
            .await
            .unwrap();
        let welcome = next_text(&mut socket).await;
        let welcome: serde_json::Value = serde_json::from_str(&welcome).unwrap();
        assert_eq!(welcome["type"], "welcome");
        assert_eq!(welcome["protocol"], 1);
        assert_eq!(welcome["recording"], true);
        assert_eq!(welcome["app_version"], protocol::app_version());

        let now = unix_ms() as f64;
        for frame in [
            format!(
                r#"{{"type":"call","tab":"b1f:1","state":"joined","meeting_code":"abc-defg-hij","observed_at":{now}}}"#
            ),
            r#"{"type":"roster","tab":"b1f:1","participants":[{"id":"spaces/a/devices/1","name":"Ada Lovelace","self":false},{"id":"spaces/a/devices/2","name":"Pavel Svitek","self":true}]}"#.to_string(),
            format!(
                r#"{{"type":"heartbeat","tab":"b1f:1","seq":1,"observed_at":{now},"speaking":["spaces/a/devices/1","spaces/a/devices/2"],"visibility":"visible","health":{{"meters":2,"last_meter_change_ms_ago":80,"selectors":"default"}}}}"#
            ),
        ] {
            socket.send(Message::text(frame)).await.unwrap();
        }
        tokio::time::sleep(Duration::from_millis(50)).await;

        assert!(meet_bridge.is_live());
        let status = meet_bridge.snapshot();
        assert!(status.connected);
        assert_eq!(status.browsers, vec!["brave".to_string()]);
        assert_eq!(status.in_call_tabs, 1);
        assert_eq!(status.health, "ok");
        assert_eq!(status.remote_speaking, vec!["Ada Lovelace".to_string()]);
        assert_eq!(status.self_speaking, vec!["Pavel Svitek".to_string()]);
        let label = timeline.lock().unwrap().resolve(0, 10_000);
        assert_eq!(label.as_deref(), Some("Ada Lovelace"));
        assert_eq!(speaker_cut.load(Ordering::Relaxed), 1);

        task.abort();
    }

    fn request(port: u16, origin: &str) -> tokio_tungstenite::tungstenite::http::Request<()> {
        let mut request = format!("ws://127.0.0.1:{port}/")
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("Origin", HeaderValue::from_str(origin).unwrap());
        request
    }

    async fn next_text(
        socket: &mut tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    ) -> String {
        let frame = tokio::time::timeout(Duration::from_secs(2), socket.next())
            .await
            .expect("welcome timeout")
            .expect("socket closed")
            .expect("frame");
        match frame {
            Message::Text(text) => text.to_string(),
            other => panic!("expected text, got {other:?}"),
        }
    }
}
