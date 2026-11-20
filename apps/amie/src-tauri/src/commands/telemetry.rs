use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::telemetry::TelemetryService;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySettings {
    pub enabled: bool,
}

#[tauri::command]
pub async fn get_telemetry_settings(
    telemetry: State<'_, TelemetryService>,
) -> Result<TelemetrySettings, String> {
    Ok(TelemetrySettings {
        enabled: telemetry.is_enabled(),
    })
}

#[tauri::command]
pub async fn set_telemetry_enabled(
    telemetry: State<'_, TelemetryService>,
    enabled: bool,
) -> Result<(), String> {
    telemetry.set_enabled(enabled)
}

#[tauri::command]
pub async fn track_telemetry_event(
    telemetry: State<'_, TelemetryService>,
    name: String,
    props: Option<Value>,
) -> Result<(), String> {
    telemetry.track(name, props);
    Ok(())
}
