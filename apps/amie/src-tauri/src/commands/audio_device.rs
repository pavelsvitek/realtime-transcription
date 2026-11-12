use tauri::{AppHandle, State};

use crate::audio_device::{
    get_default_input_device, list_audio_devices, AudioDeviceInfo, AudioDeviceList,
    DeviceSelection,
};
use crate::state::TranscriptionHandle;

#[tauri::command]
pub fn get_default_input_device_command() -> Result<AudioDeviceInfo, String> {
    get_default_input_device()
}

#[tauri::command]
pub fn list_audio_devices_command() -> AudioDeviceList {
    list_audio_devices()
}

/// Pick the microphone and the output to capture. `None` follows the system
/// default. While a session is running the affected streams switch live.
#[tauri::command]
pub async fn set_audio_devices(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
    input: Option<String>,
    output: Option<String>,
) -> Result<(), String> {
    tracing::info!(?input, ?output, "set_audio_devices command invoked");
    state
        .service
        .set_devices(Some(&app), DeviceSelection { input, output })
        .map_err(|e| e.to_user_message())
}
