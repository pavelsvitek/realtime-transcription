//! Anonymous product analytics, sent to a self-hosted Flareboard.
//!
//! What leaves the Mac: a random install id, app and macOS version, and
//! counts (meeting length, how many remote people spoke, which app had the
//! microphone, which MCP tools were called). Never titles, transcripts,
//! summaries, context, participant names or tool arguments. Flareboard
//! derives the country from the request and does not store the IP.
//!
//! Analytics is on by default and the user can turn it off in Settings.
//! Turning it off deletes the install id and everything still queued; turning
//! it back on starts a new install id, so the two periods cannot be linked.
//!
//! Events are queued in `analytics.db` and sent in batches by
//! [`spawn_uploader`]. The MCP server process writes MCP call counts to the
//! same file and never touches the network itself.
//!
//! Builds without `AMIE_ANALYTICS_HOST` and `AMIE_ANALYTICS_WEBSITE_ID`
//! (local and debug builds) record and send nothing.

pub mod meeting_app;
mod payload;
mod settings;
mod store;

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use serde_json::{Map, Value};

pub use meeting_app::MeetingAppProbe;
pub use settings::AnalyticsSettings;

use payload::{BatchItem, ClientInfo};
use store::Outbox;

const SETTINGS_FILE: &str = "analytics.json";
const DB_FILE: &str = "analytics.db";
const FIRST_FLUSH_DELAY: Duration = Duration::from_secs(60);
const FLUSH_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// Flareboard rejects batches over 50 items.
const MAX_BATCH_ITEMS: usize = 50;
/// Stop after this many batches per flush; the rest waits for the next one.
const MAX_BATCHES_PER_FLUSH: usize = 20;

/// Where events go. `None` when this build has no analytics endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    pub host: String,
    pub website_id: String,
}

impl Endpoint {
    /// Baked in at build time; a runtime variable of the same name overrides
    /// it so a developer can point a local build at a test Flareboard.
    pub fn from_env() -> Option<Self> {
        let nonempty = |value: &str| {
            let value = value.trim();
            (!value.is_empty()).then(|| value.to_string())
        };
        let pick = |name: &str, built: Option<&'static str>| {
            std::env::var(name)
                .ok()
                .and_then(|value| nonempty(&value))
                .or_else(|| built.and_then(nonempty))
        };
        let host = pick("AMIE_ANALYTICS_HOST", option_env!("AMIE_ANALYTICS_HOST"))?;
        let website_id = pick(
            "AMIE_ANALYTICS_WEBSITE_ID",
            option_env!("AMIE_ANALYTICS_WEBSITE_ID"),
        )?;
        Some(Self {
            host: host.trim_end_matches('/').to_string(),
            website_id,
        })
    }

    fn batch_url(&self) -> String {
        format!("{}/api/batch", self.host.trim_end_matches('/'))
    }
}

/// What Settings shows.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsStatus {
    /// The user's choice. On unless they turned it off.
    pub enabled: bool,
    /// False in builds without an endpoint: nothing is ever sent.
    pub available: bool,
    /// Turned off by `AMIE_ANALYTICS_DISABLED`, whatever the setting says.
    pub disabled_by_env: bool,
}

impl AnalyticsStatus {
    /// Events are recorded and sent.
    pub fn is_active(&self) -> bool {
        self.enabled && self.available && !self.disabled_by_env
    }
}

/// Handle shared by the app and the MCP server. Cheap to clone; every call
/// opens what it needs, so a failure never takes the caller down with it.
#[derive(Debug, Clone)]
pub struct Analytics {
    root: PathBuf,
    endpoint: Option<Endpoint>,
}

impl Analytics {
    pub fn new_default() -> Self {
        Self::new(
            crate::transcription::xai::app_support_root(),
            Endpoint::from_env(),
        )
    }

    pub fn new(root: PathBuf, endpoint: Option<Endpoint>) -> Self {
        Self { root, endpoint }
    }

    fn settings_path(&self) -> PathBuf {
        self.root.join(SETTINGS_FILE)
    }

    fn db_path(&self) -> PathBuf {
        self.root.join(DB_FILE)
    }

    pub fn status(&self) -> AnalyticsStatus {
        AnalyticsStatus {
            enabled: settings::load(&self.settings_path()).enabled,
            available: self.endpoint.is_some(),
            disabled_by_env: disabled_by_env(),
        }
    }

    /// The install id to send with, creating one on first use. `None` when
    /// nothing should be recorded.
    fn active_install_id(&self) -> Option<String> {
        if self.endpoint.is_none() || disabled_by_env() {
            return None;
        }
        match settings::ensure_install_id(&self.settings_path()) {
            Ok(id) => id,
            Err(err) => {
                tracing::debug!(error = %err, "analytics: cannot read settings");
                None
            }
        }
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<AnalyticsStatus, String> {
        settings::set_enabled(&self.settings_path(), enabled)?;
        if !enabled {
            // Opting out drops the queue too: nothing recorded before the
            // switch is sent after it.
            remove_db(&self.db_path());
        }
        Ok(self.status())
    }

    /// Queue one event. Fails quietly: analytics must never break a feature.
    pub fn track(&self, name: &str, data: Map<String, Value>) {
        if self.active_install_id().is_none() {
            return;
        }
        let result = Outbox::open(&self.db_path())
            .and_then(|outbox| outbox.push_event(name, crate::meetings::now_ms(), &data));
        if let Err(err) = result {
            tracing::debug!(error = %err, event = name, "analytics: failed to queue event");
        }
    }

    /// Count one MCP tool call. Called from the `amie_mcp` process.
    pub fn record_mcp_call(&self, client: &str, tool: &str, ok: bool) {
        if self.active_install_id().is_none() {
            return;
        }
        let day = payload::utc_day(crate::meetings::now_ms());
        let result = Outbox::open(&self.db_path())
            .and_then(|outbox| outbox.add_mcp_call(&day, client, tool, ok));
        if let Err(err) = result {
            tracing::debug!(error = %err, "analytics: failed to count MCP call");
        }
    }

    /// Send everything queued. Returns how many items Flareboard accepted.
    pub async fn flush(&self, http: &reqwest::Client) -> Result<usize, String> {
        let (Some(endpoint), Some(install_id)) = (self.endpoint.clone(), self.active_install_id())
        else {
            return Ok(0);
        };
        let client = ClientInfo::current(&endpoint.website_id, &install_id);
        let now = crate::meetings::now_ms();
        let today = payload::utc_day(now);

        let outbox = Outbox::open(&self.db_path())?;
        if outbox.active_day()?.as_deref() != Some(today.as_str()) {
            outbox.push_event("app_active", now, &Map::new())?;
            outbox.set_active_day(&today)?;
        }

        let mut sent = 0;
        let mut identify_pending =
            outbox.identified_as()?.as_deref() != Some(client.identity_key().as_str());
        for _ in 0..MAX_BATCHES_PER_FLUSH {
            let room = MAX_BATCH_ITEMS - usize::from(identify_pending);
            let events = outbox.peek_events(room)?;
            let room = room - events.len();
            let mcp = if room > 0 {
                outbox.peek_mcp_days_before(&today, room)?
            } else {
                Vec::new()
            };
            if events.is_empty() && mcp.is_empty() && !identify_pending {
                break;
            }

            let mut items: Vec<BatchItem> = Vec::with_capacity(MAX_BATCH_ITEMS);
            if identify_pending {
                items.push(client.identify());
            }
            items.extend(events.iter().map(|event| client.event(event)));
            items.extend(mcp.iter().map(|row| client.mcp_usage(row)));

            post_batch(http, &endpoint, &client, &items).await?;

            outbox.delete_events(events.iter().map(|event| event.id))?;
            outbox.delete_mcp(&mcp)?;
            if identify_pending {
                outbox.set_identified_as(&client.identity_key())?;
                identify_pending = false;
            }
            sent += items.len();
        }
        Ok(sent)
    }
}

/// Send queued analytics shortly after launch and then every few hours.
pub fn spawn_uploader(analytics: Analytics) {
    if analytics.endpoint.is_none() {
        tracing::info!("analytics: no endpoint in this build, nothing will be sent");
        return;
    }
    tauri::async_runtime::spawn(async move {
        let http = match reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(payload::user_agent())
            .build()
        {
            Ok(http) => http,
            Err(err) => {
                tracing::warn!(error = %err, "analytics: cannot build HTTP client");
                return;
            }
        };
        tokio::time::sleep(FIRST_FLUSH_DELAY).await;
        loop {
            match analytics.flush(&http).await {
                Ok(0) => {}
                Ok(sent) => tracing::info!(sent, "analytics: sent"),
                // Offline or Flareboard down: keep the queue for next time.
                Err(err) => tracing::info!(error = %err, "analytics: send failed, will retry"),
            }
            tokio::time::sleep(FLUSH_INTERVAL).await;
        }
    });
}

async fn post_batch(
    http: &reqwest::Client,
    endpoint: &Endpoint,
    client: &ClientInfo,
    items: &[BatchItem],
) -> Result<(), String> {
    let response = http
        .post(endpoint.batch_url())
        .header("x-amie-release", client.app_version.as_str())
        .json(items)
        .send()
        .await
        .map_err(|err| format!("request failed: {err}"))?;
    let status = response.status();
    if status.is_success() {
        // Items Flareboard rejected as invalid would be rejected again, so a
        // 2xx clears the whole batch. Log them so a schema mistake shows up.
        if let Ok(body) = response.json::<Value>().await {
            if body
                .get("errors")
                .and_then(Value::as_array)
                .is_some_and(|errors| !errors.is_empty())
            {
                tracing::warn!(response = %body, "analytics: Flareboard rejected some items");
            }
        }
        return Ok(());
    }
    // 4xx other than 429 will not get better on retry either, but keeping
    // the queue is safer than dropping data because of a misconfiguration.
    Err(format!("Flareboard answered {status}"))
}

#[cfg(test)]
impl Analytics {
    /// `(client, tool, calls, errors)` counted so far, for tests elsewhere.
    pub(crate) fn mcp_counts_for_tests(&self) -> Vec<(String, String, i64, i64)> {
        Outbox::open(&self.db_path())
            .unwrap()
            .peek_mcp_days_before("9999-12-31", 1_000)
            .unwrap()
            .into_iter()
            .map(|row| (row.client, row.tool, row.calls, row.errors))
            .collect()
    }

    pub(crate) fn for_tests(root: &Path) -> Self {
        Self::new(
            root.to_path_buf(),
            Some(Endpoint {
                host: "https://flareboard.example".into(),
                website_id: "8a3c9a52-6f0e-4c3e-9a51-3b8f5a3c1d2e".into(),
            }),
        )
    }
}

fn disabled_by_env() -> bool {
    std::env::var("AMIE_ANALYTICS_DISABLED")
        .map(|value| matches!(value.trim(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

fn remove_db(path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let mut file = path.as_os_str().to_owned();
        file.push(suffix);
        let _ = std::fs::remove_file(PathBuf::from(file));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoint() -> Endpoint {
        Endpoint {
            host: "https://flareboard.example".into(),
            website_id: "8a3c9a52-6f0e-4c3e-9a51-3b8f5a3c1d2e".into(),
        }
    }

    fn analytics(dir: &tempfile::TempDir, endpoint: Option<Endpoint>) -> Analytics {
        Analytics::new(dir.path().to_path_buf(), endpoint)
    }

    fn data(pairs: &[(&str, Value)]) -> Map<String, Value> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.clone()))
            .collect()
    }

    #[test]
    fn on_by_default() {
        let dir = tempfile::tempdir().unwrap();
        let status = analytics(&dir, Some(endpoint())).status();
        assert!(status.enabled);
        assert!(status.available);
    }

    #[test]
    fn builds_without_an_endpoint_record_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let analytics = analytics(&dir, None);
        analytics.track("meeting_ended", data(&[("duration_s", 60.into())]));
        analytics.record_mcp_call("claude-code", "list_meetings", true);
        assert!(!analytics.db_path().exists());
        assert!(!analytics.settings_path().exists());
        assert!(!analytics.status().available);
    }

    #[test]
    fn track_queues_events() {
        let dir = tempfile::tempdir().unwrap();
        let analytics = analytics(&dir, Some(endpoint()));
        analytics.track("meeting_ended", data(&[("duration_s", 60.into())]));
        let outbox = Outbox::open(&analytics.db_path()).unwrap();
        let events = outbox.peek_events(10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].name, "meeting_ended");
        assert_eq!(events[0].data["duration_s"], 60);
    }

    #[test]
    fn opting_out_drops_the_queue_and_the_install_id() {
        let dir = tempfile::tempdir().unwrap();
        let analytics = analytics(&dir, Some(endpoint()));
        analytics.track("meeting_ended", Map::new());
        let first_id = analytics.active_install_id().unwrap();

        let status = analytics.set_enabled(false).unwrap();
        assert!(!status.enabled);
        assert!(!analytics.db_path().exists());
        analytics.track("meeting_ended", Map::new());
        analytics.record_mcp_call("cursor", "get_meeting", true);
        assert!(!analytics.db_path().exists());
        assert_eq!(analytics.active_install_id(), None);

        analytics.set_enabled(true).unwrap();
        let second_id = analytics.active_install_id().unwrap();
        assert_ne!(first_id, second_id);
    }

    /// One HTTP exchange: the request (head, body) and the status we answer.
    async fn serve_once(listener: &tokio::net::TcpListener, status: &str) -> (String, Value) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = Vec::new();
        let mut chunk = [0u8; 8192];
        let (head, body) = loop {
            let n = socket.read(&mut chunk).await.unwrap();
            buf.extend_from_slice(&chunk[..n]);
            let text = String::from_utf8_lossy(&buf).to_string();
            if let Some(split) = text.find("\r\n\r\n") {
                let head = text[..split].to_string();
                let length: usize = head
                    .lines()
                    .find_map(|line| {
                        let lower = line.to_ascii_lowercase();
                        lower
                            .strip_prefix("content-length:")
                            .map(|v| v.trim().parse().unwrap())
                    })
                    .unwrap_or(0);
                if buf.len() >= split + 4 + length {
                    break (head, buf[split + 4..split + 4 + length].to_vec());
                }
            }
        };
        let reply = r#"{"processed":1,"errors":[]}"#;
        let response = format!(
            "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{reply}",
            reply.len()
        );
        socket.write_all(response.as_bytes()).await.unwrap();
        (head, serde_json::from_slice(&body).unwrap())
    }

    #[tokio::test]
    async fn flush_posts_a_flareboard_batch_and_clears_the_queue() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let dir = tempfile::tempdir().unwrap();
        let analytics = Analytics::new(
            dir.path().to_path_buf(),
            Some(Endpoint {
                host: format!("http://127.0.0.1:{port}/"),
                website_id: endpoint().website_id,
            }),
        );
        analytics.track(
            "meeting_ended",
            data(&[("duration_s", 2710.into()), ("meeting_app", "zoom".into())]),
        );
        analytics.record_mcp_call("cursor", "get_meeting", true);
        Outbox::open(&analytics.db_path())
            .unwrap()
            .add_mcp_call("2000-01-01", "claude-code", "list_meetings", false)
            .unwrap();
        let install_id = analytics.active_install_id().unwrap();
        let http = reqwest::Client::builder()
            .user_agent(payload::user_agent())
            .build()
            .unwrap();

        // Flareboard down: nothing is lost.
        let (failed, _) = tokio::join!(
            analytics.flush(&http),
            serve_once(&listener, "503 Service Unavailable")
        );
        assert!(failed.is_err());
        assert_eq!(
            Outbox::open(&analytics.db_path())
                .unwrap()
                .peek_events(10)
                .unwrap()
                .len(),
            2
        );

        let (sent, (head, body)) =
            tokio::join!(analytics.flush(&http), serve_once(&listener, "200 OK"));
        assert_eq!(sent.unwrap(), 4);
        assert!(head.starts_with("POST /api/batch HTTP/1.1"), "{head}");
        assert!(
            head.to_ascii_lowercase().contains("user-agent: amie/"),
            "{head}"
        );

        let items = body.as_array().unwrap();
        let kinds: Vec<(&str, &str)> = items
            .iter()
            .map(|item| {
                (
                    item["type"].as_str().unwrap(),
                    item["payload"]["name"].as_str().unwrap_or(""),
                )
            })
            .collect();
        assert_eq!(
            kinds,
            [
                ("identify", ""),
                ("event", "meeting_ended"),
                ("event", "app_active"),
                ("event", "mcp_usage"),
            ]
        );
        for item in items {
            assert_eq!(item["payload"]["website"], endpoint().website_id);
            assert_eq!(item["payload"]["id"], install_id.as_str());
        }
        assert_eq!(items[1]["payload"]["data"]["duration_s"], 2710);
        // Only the finished day is sent; today's MCP count keeps growing.
        assert_eq!(items[3]["payload"]["data"]["day"], "2000-01-01");

        let outbox = Outbox::open(&analytics.db_path()).unwrap();
        assert!(outbox.peek_events(10).unwrap().is_empty());
        assert_eq!(
            outbox.peek_mcp_days_before("9999-12-31", 10).unwrap().len(),
            1
        );

        // Same day, nothing new: no request at all.
        assert_eq!(analytics.flush(&http).await.unwrap(), 0);
    }
}
