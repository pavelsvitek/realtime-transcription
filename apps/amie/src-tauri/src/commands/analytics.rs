//! Settings switch for anonymous usage analytics.

use crate::analytics::{Analytics, AnalyticsStatus};

#[tauri::command]
pub fn get_analytics_status(analytics: tauri::State<'_, Analytics>) -> AnalyticsStatus {
    analytics.status()
}

#[tauri::command]
pub fn set_analytics_enabled(
    analytics: tauri::State<'_, Analytics>,
    enabled: bool,
) -> Result<AnalyticsStatus, String> {
    analytics.set_enabled(enabled)
}
