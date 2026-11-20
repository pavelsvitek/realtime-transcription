use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

const APP_SUPPORT_DIR: &str = "com.pavel.amie";
const TELEMETRY_STATE_FILE: &str = "telemetry.json";
const DEFAULT_ENDPOINT: &str = "https://getamie.app/api/amie-app/telemetry";

const MAX_QUEUE_LEN: usize = 200;
const MAX_BATCH_LEN: usize = 50;
const FLUSH_THRESHOLD: usize = 10;
const FLUSH_INTERVAL: Duration = Duration::from_secs(30);
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedTelemetryState {
    install_id: String,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TelemetryEvent {
    pub name: String,
    pub ts: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub props: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
struct TelemetryBatchPayload<'a> {
    install_id: &'a str,
    session_id: &'a str,
    app_version: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    os_version: Option<&'a str>,
    arch: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    ram_gb: Option<u32>,
    events: Vec<TelemetryEvent>,
}

#[derive(Debug, Clone)]
struct SystemMetadata {
    app_version: String,
    os_version: Option<String>,
    arch: String,
    ram_gb: Option<u32>,
}

struct TelemetryInner {
    enabled: bool,
    queue: VecDeque<TelemetryEvent>,
    meeting_started_at: Option<Instant>,
}

#[derive(Clone)]
pub struct TelemetryService {
    install_id: String,
    session_id: String,
    state_path: PathBuf,
    endpoint: Option<String>,
    meta: SystemMetadata,
    client: reqwest::Client,
    inner: Arc<Mutex<TelemetryInner>>,
}

impl TelemetryService {
    pub fn open_default() -> Self {
        let state_path = default_state_path();
        let endpoint = resolve_endpoint();
        Self::with_config(state_path, endpoint)
    }

    pub fn with_config(state_path: PathBuf, endpoint: Option<String>) -> Self {
        let persisted = load_or_create_state(&state_path);
        let client = reqwest::Client::builder()
            .timeout(HTTP_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            install_id: persisted.install_id,
            session_id: Uuid::new_v4().to_string(),
            state_path,
            endpoint,
            meta: collect_system_metadata(),
            client,
            inner: Arc::new(Mutex::new(TelemetryInner {
                enabled: persisted.enabled,
                queue: VecDeque::new(),
                meeting_started_at: None,
            })),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.inner.lock().map(|g| g.enabled).unwrap_or(false)
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<(), String> {
        {
            let mut guard = self
                .inner
                .lock()
                .map_err(|_| "Telemetry lock poisoned".to_string())?;
            guard.enabled = enabled;
            if !enabled {
                guard.queue.clear();
            }
        }

        let state = PersistedTelemetryState {
            install_id: self.install_id.clone(),
            enabled,
        };
        save_state(&self.state_path, &state)
    }

    pub fn mark_meeting_started(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.meeting_started_at = Some(Instant::now());
        }
    }

    pub fn take_meeting_duration_sec(&self) -> Option<u64> {
        self.inner
            .lock()
            .ok()
            .and_then(|mut guard| guard.meeting_started_at.take())
            .map(|started| started.elapsed().as_secs())
    }

    pub fn track(&self, name: impl Into<String>, props: Option<Value>) {
        let name = name.into();
        if !is_valid_event_name(&name) {
            tracing::warn!(event = %name, "Ignoring telemetry event with invalid name");
            return;
        }

        let sanitized_props = props.filter(|v| v.is_object());
        let should_flush = {
            let Ok(mut guard) = self.inner.lock() else {
                return;
            };
            if !guard.enabled {
                return;
            }
            if guard.queue.len() >= MAX_QUEUE_LEN {
                guard.queue.pop_front();
            }
            guard.queue.push_back(TelemetryEvent {
                name,
                ts: now_unix_ms(),
                props: sanitized_props,
            });
            guard.queue.len() >= FLUSH_THRESHOLD
        };

        if should_flush {
            self.spawn_flush();
        }
    }

    pub fn spawn_background_flusher(&self) {
        if self.endpoint.is_none() {
            return;
        }
        let service = self.clone();
        spawn_task(async move {
            let mut interval = tokio::time::interval(FLUSH_INTERVAL);
            // Skip immediate first tick so startup `app_opened` can batch briefly.
            interval.tick().await;
            loop {
                interval.tick().await;
                service.flush().await;
            }
        });
    }

    pub fn spawn_flush(&self) {
        if self.endpoint.is_none() {
            return;
        }
        let service = self.clone();
        spawn_task(async move {
            service.flush().await;
        });
    }

    #[cfg(test)]
    pub(crate) fn snapshot_events(&self) -> Vec<TelemetryEvent> {
        self.inner
            .lock()
            .map(|g| g.queue.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub async fn flush(&self) {
        let Some(endpoint) = self.endpoint.as_deref() else {
            return;
        };

        loop {
            let batch = {
                let Ok(mut guard) = self.inner.lock() else {
                    return;
                };
                if !guard.enabled || guard.queue.is_empty() {
                    return;
                }
                let count = guard.queue.len().min(MAX_BATCH_LEN);
                guard.queue.drain(..count).collect::<Vec<_>>()
            };

            let payload = TelemetryBatchPayload {
                install_id: &self.install_id,
                session_id: &self.session_id,
                app_version: &self.meta.app_version,
                os_version: self.meta.os_version.as_deref(),
                arch: &self.meta.arch,
                ram_gb: self.meta.ram_gb,
                events: batch.clone(),
            };

            match self.client.post(endpoint).json(&payload).send().await {
                Ok(resp) if resp.status().is_success() => {
                    tracing::debug!(count = batch.len(), "Flushed telemetry batch");
                }
                Ok(resp) if resp.status().is_client_error() => {
                    tracing::warn!(
                        status = %resp.status(),
                        count = batch.len(),
                        "Telemetry batch rejected by server; dropping"
                    );
                }
                Ok(resp) => {
                    tracing::debug!(
                        status = %resp.status(),
                        count = batch.len(),
                        "Telemetry server error; requeuing"
                    );
                    self.requeue_front(batch);
                    return;
                }
                Err(err) => {
                    tracing::debug!(error = %err, "Telemetry flush failed (offline?); requeuing");
                    self.requeue_front(batch);
                    return;
                }
            }
        }
    }

    fn requeue_front(&self, batch: Vec<TelemetryEvent>) {
        let Ok(mut guard) = self.inner.lock() else {
            return;
        };
        if !guard.enabled {
            return;
        }
        for event in batch.into_iter().rev() {
            if guard.queue.len() >= MAX_QUEUE_LEN {
                break;
            }
            guard.queue.push_front(event);
        }
    }
}

fn spawn_task<F>(fut: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        handle.spawn(fut);
    } else {
        tauri::async_runtime::spawn(fut);
    }
}

fn default_state_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home)
        .join("Library/Application Support")
        .join(APP_SUPPORT_DIR)
        .join(TELEMETRY_STATE_FILE)
}

fn resolve_endpoint() -> Option<String> {
    if std::env::var("AMIE_TELEMETRY_DISABLED")
        .ok()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
    {
        return None;
    }

    if let Ok(custom) = std::env::var("AMIE_TELEMETRY_ENDPOINT") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    // Do not send telemetry to production from local debug builds unless explicitly configured.
    if cfg!(debug_assertions) {
        return None;
    }

    Some(DEFAULT_ENDPOINT.to_string())
}

fn load_or_create_state(path: &Path) -> PersistedTelemetryState {
    if let Ok(raw) = std::fs::read_to_string(path) {
        if let Ok(parsed) = serde_json::from_str::<PersistedTelemetryState>(&raw) {
            if !parsed.install_id.trim().is_empty() {
                return parsed;
            }
        }
    }

    let fresh = PersistedTelemetryState {
        install_id: Uuid::new_v4().to_string(),
        enabled: true,
    };
    if let Err(err) = save_state(path, &fresh) {
        tracing::warn!(error = %err, "Failed to persist initial telemetry state");
    }
    fresh
}

fn save_state(path: &Path, state: &PersistedTelemetryState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create telemetry directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize telemetry state: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to write telemetry state: {e}"))
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_valid_event_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.is_empty() || bytes.len() > 64 {
        return false;
    }
    if !bytes[0].is_ascii_lowercase() {
        return false;
    }
    bytes
        .iter()
        .all(|&b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

fn collect_system_metadata() -> SystemMetadata {
    SystemMetadata {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_version: detect_os_version(),
        arch: std::env::consts::ARCH.to_string(),
        ram_gb: detect_ram_gb(),
    }
}

#[cfg(target_os = "macos")]
fn detect_ram_gb() -> Option<u32> {
    use std::ffi::CString;

    let name = CString::new("hw.memsize").ok()?;
    let mut mem_bytes: u64 = 0;
    let mut size = std::mem::size_of::<u64>();
    let ret = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            &mut mem_bytes as *mut u64 as *mut libc::c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if ret != 0 || mem_bytes == 0 {
        return None;
    }
    let gb = ((mem_bytes as f64) / (1024.0 * 1024.0 * 1024.0)).round() as u32;
    (gb >= 1 && gb <= 4096).then_some(gb)
}

#[cfg(not(target_os = "macos"))]
fn detect_ram_gb() -> Option<u32> {
    None
}

#[cfg(target_os = "macos")]
fn detect_os_version() -> Option<String> {
    use std::ffi::CString;

    let name = CString::new("kern.osproductversion").ok()?;
    let mut size: usize = 0;
    let ret = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if ret != 0 || size == 0 || size > 64 {
        return Some("macOS".to_string());
    }
    let mut buf = vec![0u8; size];
    let ret = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            buf.as_mut_ptr() as *mut libc::c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if ret != 0 {
        return Some("macOS".to_string());
    }
    let version = String::from_utf8_lossy(&buf)
        .trim_end_matches('\0')
        .trim()
        .to_string();
    if version.is_empty() {
        Some("macOS".to_string())
    } else {
        Some(format!("macOS {version}"))
    }
}

#[cfg(not(target_os = "macos"))]
fn detect_os_version() -> Option<String> {
    Some(std::env::consts::OS.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_state_path(label: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("amie-telemetry-test-{label}-{}", Uuid::new_v4()))
            .join("telemetry.json")
    }

    #[test]
    fn persists_install_id_and_enabled_flag() {
        let path = temp_state_path("persist");
        let first = TelemetryService::with_config(path.clone(), None);
        let id1 = first.install_id.clone();
        assert!(first.is_enabled());

        first.set_enabled(false).expect("disable");
        assert!(!first.is_enabled());

        let second = TelemetryService::with_config(path.clone(), None);
        assert_eq!(second.install_id, id1);
        assert!(!second.is_enabled());

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn opt_out_clears_and_ignores_events() {
        let path = temp_state_path("optout");
        let svc = TelemetryService::with_config(path.clone(), None);
        svc.track("app_opened", None);
        assert_eq!(svc.inner.lock().unwrap().queue.len(), 1);

        svc.set_enabled(false).expect("disable");
        assert_eq!(svc.inner.lock().unwrap().queue.len(), 0);

        svc.track("feature_used", Some(json!({ "feature": "summary" })));
        assert_eq!(svc.inner.lock().unwrap().queue.len(), 0);

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn detects_macos_metadata() {
        let meta = collect_system_metadata();
        assert!(!meta.app_version.is_empty());
        assert!(!meta.arch.is_empty());
        #[cfg(target_os = "macos")]
        {
            let ram = meta.ram_gb.expect("macOS should report ram_gb");
            assert!(ram >= 1 && ram <= 4096);
            let os = meta.os_version.expect("macOS should report os_version");
            assert!(os.starts_with("macOS"));
        }
    }

    #[test]
    fn validates_event_names() {
        assert!(is_valid_event_name("app_opened"));
        assert!(is_valid_event_name("meeting_ended"));
        assert!(!is_valid_event_name(""));
        assert!(!is_valid_event_name("AppOpened"));
        assert!(!is_valid_event_name("meeting-ended"));
    }
}
