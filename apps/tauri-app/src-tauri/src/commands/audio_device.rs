use crate::audio_device::{get_default_input_device, AudioDeviceInfo};

#[tauri::command]
pub fn get_default_input_device_command() -> Result<AudioDeviceInfo, String> {
    get_default_input_device()
}
