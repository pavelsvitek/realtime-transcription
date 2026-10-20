//! Google Meet extension speaker-tracking bridge (`meet_bridge`).
//! Loopback WebSocket server: `127.0.0.1` only, Origin must be `chrome-extension://`.

use std::net::SocketAddr;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, WebSocketConfig};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{accept_hdr_async_with_config, tungstenite};

use super::protocol::{app_version, ClientMessage, Welcome, MAX_FRAME_BYTES, PROTOCOL_VERSION};
use super::MeetBridge;

pub const PORTS: &[u16] = &[47821, 47822, 47823, 47824, 47825];

/// DEV accepts any Chrome/Brave extension origin. Web pages cannot set this.
pub fn origin_allowed(origin: &str) -> bool {
    let Some(rest) = origin.trim().strip_prefix("chrome-extension://") else {
        return false;
    };
    let id = rest.trim_end_matches('/');
    !id.is_empty()
        && !id.contains('/')
        && !id.contains('?')
        && !id.contains('#')
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

pub async fn listen(meet_bridge: MeetBridge) -> Result<(), String> {
    let mut last_error = None;
    for port in PORTS {
        match TcpListener::bind(("127.0.0.1", *port)).await {
            Ok(listener) => {
                tracing::info!(
                    "meet_bridge listening on ws://127.0.0.1:{port} (Google Meet extension)"
                );
                meet_bridge.set_listen_port(*port);
                serve(listener, meet_bridge).await;
                return Ok(());
            }
            Err(error) => last_error = Some(error),
        }
    }
    Err(format!(
        "meet_bridge: no free port in 47821-47825 ({last_error:?})"
    ))
}

pub async fn serve(listener: TcpListener, meet_bridge: MeetBridge) {
    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                let meet_bridge = meet_bridge.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_connection(stream, peer, meet_bridge).await {
                        tracing::debug!(%error, "meet_bridge connection ended");
                    }
                });
            }
            Err(error) => {
                tracing::warn!(%error, "meet_bridge accept failed");
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    meet_bridge: MeetBridge,
) -> Result<(), String> {
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_FRAME_BYTES))
        .max_frame_size(Some(MAX_FRAME_BYTES));
    let websocket = accept_hdr_async_with_config(stream, reject_foreign_origin, Some(config))
        .await
        .map_err(|error| format!("upgrade from {peer}: {error}"))?;
    let (mut write, mut read) = websocket.split();
    let mut connection_id = None;
    while let Some(frame) = read.next().await {
        let frame = frame.map_err(|error| error.to_string())?;
        match frame {
            Message::Text(text) => {
                if text.len() > MAX_FRAME_BYTES {
                    close_with(&mut write, "frame too large").await;
                    break;
                }
                if connection_id.is_none() {
                    match serde_json::from_str::<ClientMessage>(&text) {
                        Ok(ClientMessage::Hello {
                            protocol,
                            extension_version,
                            browser,
                            instance_id,
                        }) => {
                            if protocol != PROTOCOL_VERSION {
                                tracing::info!(
                                    protocol,
                                    "meet_bridge rejected Google Meet extension hello"
                                );
                                close_with(
                                    &mut write,
                                    &format!("protocol must be {PROTOCOL_VERSION}"),
                                )
                                .await;
                                break;
                            }
                            tracing::info!(
                                %browser,
                                %extension_version,
                                "meet_bridge hello (Google Meet extension)"
                            );
                            let id =
                                meet_bridge.on_hello(&browser, &extension_version, &instance_id);
                            let welcome = Welcome::new(app_version(), meet_bridge.is_recording());
                            let payload = serde_json::to_string(&welcome)
                                .map_err(|error| error.to_string())?;
                            write
                                .send(Message::text(payload))
                                .await
                                .map_err(|error| error.to_string())?;
                            tracing::info!(
                                protocol = PROTOCOL_VERSION,
                                "meet_bridge welcome (Google Meet extension)"
                            );
                            connection_id = Some(id);
                        }
                        _ => {
                            close_with(&mut write, "expected hello").await;
                            break;
                        }
                    }
                    continue;
                }
                let id = connection_id.unwrap_or(0);
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(message) => meet_bridge.on_message(id, message),
                    Err(error) => {
                        tracing::debug!(%error, "meet_bridge ignored a malformed frame");
                    }
                }
            }
            Message::Close(_) => break,
            Message::Ping(payload) => {
                let _ = write.send(Message::Pong(payload)).await;
            }
            _ => {}
        }
    }
    if let Some(id) = connection_id {
        meet_bridge.on_disconnect(id);
    }
    Ok(())
}

async fn close_with<S>(write: &mut S, reason: &str)
where
    S: SinkExt<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let _ = write
        .send(Message::Close(Some(CloseFrame {
            code: CloseCode::Protocol,
            reason: reason.into(),
        })))
        .await;
}

fn reject_foreign_origin(request: &Request, response: Response) -> Result<Response, ErrorResponse> {
    let origin = request
        .headers()
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if origin_allowed(origin) {
        return Ok(response);
    }
    tracing::info!(origin, "meet_bridge rejected websocket origin");
    Err(tungstenite::http::Response::builder()
        .status(StatusCode::FORBIDDEN)
        .body(Some(
            "meet_bridge: origin must be chrome-extension://".into(),
        ))
        .unwrap_or_else(|_| tungstenite::http::Response::new(Some("forbidden".into()))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_origin_accepts_any_extension_and_refuses_pages() {
        assert!(origin_allowed("chrome-extension://abcdefghijklmnop"));
        assert!(origin_allowed("chrome-extension://dev_build-id/"));
        assert!(!origin_allowed("https://meet.google.com"));
        assert!(!origin_allowed("http://127.0.0.1:47821"));
        assert!(!origin_allowed("chrome-extension://"));
        assert!(!origin_allowed("chrome-extension://id/extra"));
        assert!(!origin_allowed(""));
    }
}
