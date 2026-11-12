//! `analytics.json`: the opt-out switch and the install id.

use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyticsSettings {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Random, created on first use, deleted when analytics is turned off.
    /// Not the sync `device_id`, so it can be thrown away on its own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_id: Option<String>,
}

fn default_enabled() -> bool {
    true
}

impl Default for AnalyticsSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            install_id: None,
        }
    }
}

/// A missing or unreadable file means the default: on, no id yet.
pub fn load(path: &Path) -> AnalyticsSettings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(path: &Path, settings: &AnalyticsSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create app support dir: {err}"))?;
    }
    let text = serde_json::to_string_pretty(settings)
        .map_err(|err| format!("Failed to encode analytics settings: {err}"))?;
    // Write then rename so the app and the MCP server never read half a file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)
        .map_err(|err| format!("Failed to save analytics settings: {err}"))?;
    std::fs::rename(&tmp, path).map_err(|err| format!("Failed to save analytics settings: {err}"))
}

pub fn set_enabled(path: &Path, enabled: bool) -> Result<(), String> {
    let mut settings = load(path);
    settings.enabled = enabled;
    if !enabled {
        settings.install_id = None;
    }
    save(path, &settings)
}

/// The install id when analytics is on, creating it the first time.
pub fn ensure_install_id(path: &Path) -> Result<Option<String>, String> {
    let mut settings = load(path);
    if !settings.enabled {
        return Ok(None);
    }
    if let Some(id) = settings.install_id.clone() {
        return Ok(Some(id));
    }
    let id = uuid::Uuid::new_v4().to_string();
    settings.install_id = Some(id.clone());
    save(path, &settings)?;
    Ok(Some(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_broken_file_means_on() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analytics.json");
        assert_eq!(load(&path), AnalyticsSettings::default());
        std::fs::write(&path, "not json").unwrap();
        assert!(load(&path).enabled);
    }

    #[test]
    fn install_id_is_stable_until_opt_out() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analytics.json");
        let first = ensure_install_id(&path).unwrap().unwrap();
        assert_eq!(ensure_install_id(&path).unwrap().unwrap(), first);

        set_enabled(&path, false).unwrap();
        assert_eq!(ensure_install_id(&path).unwrap(), None);
        assert_eq!(load(&path).install_id, None);
    }
}
