use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
    BuiltInMic,
    WiredHeadset,
    BluetoothEarbuds,
    BluetoothHeadphones,
    BluetoothGeneric,
    UsbHeadset,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub name: String,
    pub kind: DeviceKind,
    pub transport: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    BuiltIn,
    Bluetooth,
    BluetoothLe,
    Usb,
    Hdmi,
    DisplayPort,
    Virtual,
    Aggregate,
    AirPlay,
    Unknown,
}

impl Transport {
    pub fn from_raw(value: u32) -> Self {
        match value {
            0x626c746e => Self::BuiltIn,       // 'bltn'
            0x626c7565 => Self::Bluetooth,    // 'blue'
            0x626c6561 => Self::BluetoothLe,  // 'blea'
            0x75736220 => Self::Usb,          // 'usb '
            0x68646d69 => Self::Hdmi,         // 'hdmi'
            0x64707274 => Self::DisplayPort,  // 'dprt'
            0x76697274 => Self::Virtual,      // 'virt'
            0x67727570 => Self::Aggregate,    // 'grup'
            0x61697270 => Self::AirPlay,      // 'airp'
            _ => Self::Unknown,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::BuiltIn => "builtIn",
            Self::Bluetooth => "bluetooth",
            Self::BluetoothLe => "bluetoothLe",
            Self::Usb => "usb",
            Self::Hdmi => "hdmi",
            Self::DisplayPort => "displayPort",
            Self::Virtual => "virtual",
            Self::Aggregate => "aggregate",
            Self::AirPlay => "airPlay",
            Self::Unknown => "unknown",
        }
    }
}

/// macOS four-char data source codes for built-in output routing.
pub const DATA_SOURCE_HEADPHONES: u32 = u32::from_be_bytes(*b"hdpn");
pub const DATA_SOURCE_INTERNAL_SPEAKERS: u32 = u32::from_be_bytes(*b"ispk");

pub fn classify_device(name: &str, transport: Transport, _output_data_source: Option<u32>) -> DeviceKind {
    let lower = name.to_ascii_lowercase();

    if matches!(transport, Transport::Usb) {
        return DeviceKind::UsbHeadset;
    }

    if matches!(transport, Transport::Bluetooth | Transport::BluetoothLe) {
        return classify_bluetooth_device(&lower);
    }

    if matches!(transport, Transport::BuiltIn) {
        if is_wired_headset_name(&lower) {
            return DeviceKind::WiredHeadset;
        }
        return DeviceKind::BuiltInMic;
    }

    DeviceKind::Unknown
}

fn is_wired_headset_name(lower: &str) -> bool {
    lower.contains("external microphone")
        || lower.contains("external headphones")
        || lower.contains("headphones")
        || lower.contains("headset")
}

fn classify_bluetooth_device(lower: &str) -> DeviceKind {
    if is_bluetooth_headphones_name(lower) {
        return DeviceKind::BluetoothHeadphones;
    }
    if is_bluetooth_earbuds_name(lower) {
        return DeviceKind::BluetoothEarbuds;
    }
    DeviceKind::BluetoothGeneric
}

fn is_bluetooth_headphones_name(lower: &str) -> bool {
    lower.contains("airpods max")
        || lower.contains("headphones")
        || lower.contains(" wh-")
        || lower.starts_with("wh-")
        || lower.contains(" qc")
        || lower.starts_with("qc")
        || lower.contains("momentum")
        || lower.contains("bose 700")
        || lower.contains("studio3")
        || lower.contains("beats studio")
        || lower.contains("over ear")
        || lower.contains("over-ear")
}

fn is_bluetooth_earbuds_name(lower: &str) -> bool {
    lower.contains("airpods")
        || lower.contains("buds")
        || lower.contains("beats fit")
        || lower.contains("beats studio buds")
        || lower.contains("pixel buds")
        || lower.contains("galaxy buds")
        || lower.contains("earbuds")
        || lower.contains("ear buds")
}

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use macos::{emit_device_update, get_default_input_device, spawn_device_monitor};

#[cfg(not(target_os = "macos"))]
pub fn get_default_input_device() -> Result<AudioDeviceInfo, String> {
    Err("Audio device detection is only supported on macOS".into())
}

#[cfg(not(target_os = "macos"))]
pub fn spawn_device_monitor(_app_handle: tauri::AppHandle) {}

#[cfg(not(target_os = "macos"))]
pub fn emit_device_update(_app_handle: &tauri::AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_airpods_pro_as_earbuds() {
        assert_eq!(
            classify_device("AirPods Pro", Transport::Bluetooth, None),
            DeviceKind::BluetoothEarbuds
        );
    }

    #[test]
    fn classifies_airpods_max_as_headphones() {
        assert_eq!(
            classify_device("AirPods Max", Transport::Bluetooth, None),
            DeviceKind::BluetoothHeadphones
        );
    }

    #[test]
    fn classifies_builtin_macbook_mic() {
        assert_eq!(
            classify_device("MacBook Pro Microphone", Transport::BuiltIn, None),
            DeviceKind::BuiltInMic
        );
    }

    #[test]
    fn classifies_external_microphone_as_wired_headset() {
        assert_eq!(
            classify_device("External Microphone", Transport::BuiltIn, None),
            DeviceKind::WiredHeadset
        );
    }

    #[test]
    fn classifies_usb_device() {
        assert_eq!(
            classify_device("USB PnP Sound Device", Transport::Usb, None),
            DeviceKind::UsbHeadset
        );
    }

    #[test]
    fn keeps_builtin_mic_when_headphones_plugged() {
        assert_eq!(
            classify_device(
                "MacBook Pro Microphone",
                Transport::BuiltIn,
                Some(DATA_SOURCE_HEADPHONES)
            ),
            DeviceKind::BuiltInMic
        );
    }

    #[test]
    fn classifies_sony_over_ear_headphones() {
        assert_eq!(
            classify_device("WH-1000XM5", Transport::BluetoothLe, None),
            DeviceKind::BluetoothHeadphones
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn get_default_input_device_smoke() {
        let device = get_default_input_device().expect("default input device");
        assert!(!device.name.is_empty());
        assert!(!device.transport.is_empty());
    }
}
