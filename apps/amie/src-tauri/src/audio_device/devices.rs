//! Enumerate and resolve audio devices so the user can pick which microphone
//! and which output (for system-audio capture) Amie records.
//!
//! Devices are addressed by cpal's `DeviceId` string (`coreaudio:<uid>` on
//! macOS). The Core Audio UID is stable across reconnects and reboots, unlike
//! the numeric `AudioObjectID`.

use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceEntry {
    /// Stable key, passed back to `set_audio_devices`.
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceList {
    pub inputs: Vec<AudioDeviceEntry>,
    pub outputs: Vec<AudioDeviceEntry>,
    pub default_input_id: Option<String>,
    pub default_output_id: Option<String>,
}

/// Which device each stream should use. `None` follows the system default.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceSelection {
    pub input: Option<String>,
    pub output: Option<String>,
}

/// Private aggregate devices that Core Audio and cpal create for themselves.
fn is_internal_device(name: &str) -> bool {
    name.starts_with("CADefaultDeviceAggregate")
        || name.starts_with("Cpal loopback")
        || name.starts_with("Amie system audio tap")
}

fn entry(device: &cpal::Device) -> Option<AudioDeviceEntry> {
    let id = device.id().ok()?.to_string();
    let name = device.description().ok()?.name().to_string();
    if is_internal_device(&name) {
        return None;
    }
    Some(AudioDeviceEntry { id, name })
}

pub fn list_audio_devices() -> AudioDeviceList {
    let host = cpal::default_host();
    let mut list = AudioDeviceList::default();

    if let Ok(devices) = host.devices() {
        for device in devices {
            let Some(item) = entry(&device) else { continue };
            if device.supports_input() {
                list.inputs.push(item.clone());
            }
            if device.supports_output() {
                list.outputs.push(item);
            }
        }
    }
    list.default_input_id = host
        .default_input_device()
        .and_then(|d| d.id().ok())
        .map(|id| id.to_string());
    list.default_output_id = host
        .default_output_device()
        .and_then(|d| d.id().ok())
        .map(|id| id.to_string());
    list
}

fn find_device(id: &str) -> Option<cpal::Device> {
    let host = cpal::default_host();
    host.devices()
        .ok()?
        .find(|device| device.id().ok().map(|d| d.to_string()).as_deref() == Some(id))
}

/// The input device for `selection`. A selected device that is gone (unplugged)
/// falls back to the system default.
pub fn resolve_input(selection: &Option<String>) -> Option<cpal::Device> {
    if let Some(id) = selection {
        if let Some(device) = find_device(id).filter(|d| d.supports_input()) {
            return Some(device);
        }
        tracing::warn!(device = %id, "Selected input device not available, using system default");
    }
    cpal::default_host().default_input_device()
}

pub fn resolve_output(selection: &Option<String>) -> Option<cpal::Device> {
    if let Some(id) = selection {
        if let Some(device) = find_device(id).filter(|d| d.supports_output()) {
            return Some(device);
        }
        tracing::warn!(device = %id, "Selected output device not available, using system default");
    }
    cpal::default_host().default_output_device()
}

pub fn device_key(device: &cpal::Device) -> Option<String> {
    device.id().ok().map(|id| id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_internal_aggregates() {
        assert!(is_internal_device("CADefaultDeviceAggregate-1-2"));
        assert!(is_internal_device("Cpal loopback record aggregate device"));
        assert!(!is_internal_device("Logitech MeetUp Speakerphone"));
    }

    #[test]
    fn missing_selection_falls_back_to_default() {
        // Must not panic whatever the host has; a bogus id resolves to the default.
        let _ = resolve_input(&Some("coreaudio:does-not-exist".into()));
        let _ = resolve_output(&Some("coreaudio:does-not-exist".into()));
    }
}
