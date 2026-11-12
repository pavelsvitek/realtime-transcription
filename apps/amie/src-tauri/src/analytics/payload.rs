//! Flareboard `/api/batch` items.
//!
//! Each item is `{"type": "event" | "identify", "payload": {...}}`. The
//! payload fields used here (`website`, `id`, `name`, `timestamp`, `data`,
//! `hostname`, `os`, `browser`, `device`, `release`, `environment`) are the
//! ones Flareboard's `sendPayloadSchema` accepts. `website` must be a UUID,
//! `name` at most 50 characters, `data` at most 100 keys.

use serde_json::{json, Map, Value};

use super::store::{McpUsageRow, QueuedEvent};

pub type BatchItem = Value;

const HOSTNAME: &str = "amie-desktop";
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// Sent with every item. Nothing here identifies a person.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientInfo {
    pub website_id: String,
    pub install_id: String,
    pub app_version: String,
    pub os_version: String,
    pub arch: &'static str,
    pub environment: &'static str,
}

impl ClientInfo {
    pub fn current(website_id: &str, install_id: &str) -> Self {
        Self {
            website_id: website_id.to_string(),
            install_id: install_id.to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            os_version: os_version(),
            arch: std::env::consts::ARCH,
            environment: if cfg!(debug_assertions) {
                "development"
            } else {
                "production"
            },
        }
    }

    /// Changes when anything `identify` sends changes, so it is sent again.
    pub fn identity_key(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            self.install_id, self.app_version, self.os_version, self.arch
        )
    }

    fn base(&self) -> Map<String, Value> {
        let mut payload = Map::new();
        payload.insert("website".into(), self.website_id.clone().into());
        payload.insert("id".into(), self.install_id.clone().into());
        payload.insert("hostname".into(), HOSTNAME.into());
        payload.insert("os".into(), format!("macOS {}", self.os_version).into());
        payload.insert("browser".into(), "Amie".into());
        payload.insert("device".into(), "desktop".into());
        payload.insert("release".into(), self.app_version.clone().into());
        payload.insert("environment".into(), self.environment.into());
        payload
    }

    /// Person properties for this install.
    pub fn identify(&self) -> BatchItem {
        let mut payload = self.base();
        payload.insert(
            "data".into(),
            json!({
                "app_version": self.app_version,
                "os_version": self.os_version,
                "arch": self.arch,
            }),
        );
        json!({ "type": "identify", "payload": payload })
    }

    pub fn event(&self, event: &QueuedEvent) -> BatchItem {
        self.event_item(&event.name, event.ts_ms, event.data.clone())
    }

    pub fn mcp_usage(&self, row: &McpUsageRow) -> BatchItem {
        let mut data = Map::new();
        data.insert("day".into(), row.day.clone().into());
        data.insert("mcp_client".into(), row.client.clone().into());
        data.insert("tool".into(), row.tool.clone().into());
        data.insert("calls".into(), row.calls.into());
        data.insert("errors".into(), row.errors.into());
        let ts_ms =
            day_start_ms(&row.day).map_or_else(crate::meetings::now_ms, |start| start + DAY_MS / 2);
        self.event_item("mcp_usage", ts_ms, data)
    }

    fn event_item(&self, name: &str, ts_ms: i64, mut data: Map<String, Value>) -> BatchItem {
        data.insert("app_version".into(), self.app_version.clone().into());
        let mut payload = self.base();
        payload.insert("name".into(), name.into());
        payload.insert("timestamp".into(), ts_ms.into());
        payload.insert("data".into(), Value::Object(data));
        json!({ "type": "event", "payload": payload })
    }
}

/// Some ingest services drop requests from generic HTTP clients as bots.
pub fn user_agent() -> String {
    format!(
        "Amie/{} (Macintosh; macOS {})",
        env!("CARGO_PKG_VERSION"),
        os_version()
    )
}

fn os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        sysctl_string(c"kern.osproductversion").unwrap_or_else(|| "unknown".into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        "unknown".into()
    }
}

#[cfg(target_os = "macos")]
fn sysctl_string(name: &std::ffi::CStr) -> Option<String> {
    let mut len: libc::size_t = 0;
    let status = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            std::ptr::null_mut(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if status != 0 || len == 0 {
        return None;
    }
    let mut buf = vec![0u8; len];
    let status = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            buf.as_mut_ptr().cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if status != 0 {
        return None;
    }
    let end = buf
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(len.min(buf.len()));
    String::from_utf8(buf[..end].to_vec()).ok()
}

/// `YYYY-MM-DD` in UTC.
pub fn utc_day(ms: i64) -> String {
    let (year, month, day) = civil_from_days(ms.div_euclid(DAY_MS));
    format!("{year:04}-{month:02}-{day:02}")
}

fn day_start_ms(day: &str) -> Option<i64> {
    let mut parts = day.splitn(3, '-').map(str::parse::<i64>);
    let (year, month, day) = (
        parts.next()?.ok()?,
        parts.next()?.ok()?,
        parts.next()?.ok()?,
    );
    Some(days_from_civil(year, month, day) * DAY_MS)
}

/// Days since 1970-01-01 to a proleptic Gregorian date (Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let yoe = year.rem_euclid(400);
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> ClientInfo {
        ClientInfo {
            website_id: "8a3c9a52-6f0e-4c3e-9a51-3b8f5a3c1d2e".into(),
            install_id: "install-1".into(),
            app_version: "0.1.2".into(),
            os_version: "15.1".into(),
            arch: "aarch64",
            environment: "production",
        }
    }

    #[test]
    fn utc_days() {
        assert_eq!(utc_day(0), "1970-01-01");
        // 2026-11-12T10:00:00Z
        assert_eq!(utc_day(1_794_477_600_000), "2026-11-12");
        assert_eq!(utc_day(-1), "1969-12-31");
        assert_eq!(utc_day(951_782_400_000), "2000-02-29");
        assert_eq!(day_start_ms("2026-11-12"), Some(1_794_441_600_000));
        assert_eq!(day_start_ms("bad"), None);
    }

    #[test]
    fn event_item_matches_flareboard_send_payload() {
        let mut data = Map::new();
        data.insert("duration_s".into(), 2710.into());
        let item = client().event(&QueuedEvent {
            id: 7,
            name: "meeting_ended".into(),
            ts_ms: 1_794_477_600_000,
            data,
        });
        assert_eq!(
            item,
            json!({
                "type": "event",
                "payload": {
                    "website": "8a3c9a52-6f0e-4c3e-9a51-3b8f5a3c1d2e",
                    "id": "install-1",
                    "hostname": "amie-desktop",
                    "os": "macOS 15.1",
                    "browser": "Amie",
                    "device": "desktop",
                    "release": "0.1.2",
                    "environment": "production",
                    "name": "meeting_ended",
                    "timestamp": 1_794_477_600_000_i64,
                    "data": { "duration_s": 2710, "app_version": "0.1.2" }
                }
            })
        );
    }

    #[test]
    fn mcp_usage_is_stamped_at_noon_of_its_day() {
        let item = client().mcp_usage(&McpUsageRow {
            day: "2026-11-11".into(),
            client: "claude-code".into(),
            tool: "search_meetings".into(),
            calls: 4,
            errors: 1,
        });
        let payload = &item["payload"];
        assert_eq!(payload["name"], "mcp_usage");
        assert_eq!(payload["timestamp"], 1_794_355_200_000_i64 + DAY_MS / 2);
        assert_eq!(payload["data"]["mcp_client"], "claude-code");
        assert_eq!(payload["data"]["calls"], 4);
        assert_eq!(payload["data"]["errors"], 1);
    }

    #[test]
    fn identify_carries_install_properties_only() {
        let item = client().identify();
        assert_eq!(item["type"], "identify");
        assert_eq!(item["payload"]["id"], "install-1");
        assert_eq!(
            item["payload"]["data"],
            json!({ "app_version": "0.1.2", "os_version": "15.1", "arch": "aarch64" })
        );
    }
}
