//! macOS Accessibility (TCC). The prompt and the trust check are unavailable
//! on other systems; callers there report Accessibility as off.
//!
//! Trust is always asked for **this** process (bundle id + designated
//! requirement). System Settings can still show an older “Amie” row as on
//! when that row was recorded for a different code identity — especially
//! ad-hoc builds, whose requirement is a per-binary `cdhash`.

#[cfg(target_os = "macos")]
mod imp {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(
            options: core_foundation::dictionary::CFDictionaryRef,
        ) -> u8;
    }

    /// Live trust for the running process. `prompt: false` so a status poll
    /// never triggers the system sheet — that path belongs to [`prompt`].
    pub fn is_trusted() -> bool {
        with_prompt_option(false)
    }

    pub fn prompt() {
        let _ = with_prompt_option(true);
    }

    fn with_prompt_option(prompt: bool) -> bool {
        let key = CFString::new("AXTrustedCheckOptionPrompt");
        let value = if prompt {
            CFBoolean::true_value()
        } else {
            CFBoolean::false_value()
        };
        let dict = CFDictionary::from_CFType_pairs(&[(key, value)]);
        unsafe { AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef()) != 0 }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn is_trusted() -> bool {
        false
    }

    pub fn prompt() {}
}

pub fn is_trusted() -> bool {
    imp::is_trusted()
}

pub fn prompt() {
    imp::prompt();
}

/// macOS shows the Accessibility dialog at most once per app. After that the
/// prompt call returns without a window, so open the Privacy list directly.
pub fn open_privacy_settings() {
    open_privacy_pane("Privacy_Accessibility");
}

pub fn open_microphone_settings() {
    open_privacy_pane("Privacy_Microphone");
}

/// Core Audio loopback (`AudioCapture` TCC). On recent macOS this is
/// **System Audio Recording Only** (or **Screen & System Audio Recording**).
pub fn open_system_audio_settings() {
    open_privacy_pane("Privacy_AudioCapture");
}

fn open_privacy_pane(pane: &str) {
    #[cfg(target_os = "macos")]
    {
        let url = format!("x-apple.systempreferences:com.apple.preference.security?{pane}");
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pane;
    }
}

/// Microphone TCC via `AVCaptureDevice.authorizationStatus`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MicrophoneAuthorization {
    NotDetermined,
    Restricted,
    Denied,
    Authorized,
    Unknown,
}

pub fn microphone_authorization() -> MicrophoneAuthorization {
    #[cfg(target_os = "macos")]
    {
        mic::authorization()
    }
    #[cfg(not(target_os = "macos"))]
    {
        MicrophoneAuthorization::Unknown
    }
}

/// Asks for Microphone access (system prompt) when still undetermined.
pub fn request_microphone_access() {
    #[cfg(target_os = "macos")]
    {
        mic::request_access();
    }
}

#[cfg(target_os = "macos")]
mod mic {
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::runtime::{AnyClass, Bool};
    use objc2::msg_send;
    use objc2_foundation::NSString;

    use super::MicrophoneAuthorization;

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    /// `AVMediaTypeAudio` — FourCharCode `"soun"`.
    const AV_MEDIA_TYPE_AUDIO: &str = "soun";

    pub fn authorization() -> MicrophoneAuthorization {
        let Some(cls) = AnyClass::get(c"AVCaptureDevice") else {
            return MicrophoneAuthorization::Unknown;
        };
        let media = NSString::from_str(AV_MEDIA_TYPE_AUDIO);
        // AVAuthorizationStatus is NSInteger.
        let status: isize = unsafe { msg_send![cls, authorizationStatusForMediaType: &*media] };
        match status {
            0 => MicrophoneAuthorization::NotDetermined,
            1 => MicrophoneAuthorization::Restricted,
            2 => MicrophoneAuthorization::Denied,
            3 => MicrophoneAuthorization::Authorized,
            _ => MicrophoneAuthorization::Unknown,
        }
    }

    pub fn request_access() {
        let Some(cls) = AnyClass::get(c"AVCaptureDevice") else {
            return;
        };
        let media = NSString::from_str(AV_MEDIA_TYPE_AUDIO);
        let (tx, rx) = mpsc::sync_channel::<bool>(1);
        let block = RcBlock::new(move |granted: Bool| {
            let _ = tx.send(granted.as_bool());
        });
        unsafe {
            let _: () = msg_send![
                cls,
                requestAccessForMediaType: &*media,
                completionHandler: &*block
            ];
        }
        let _ = rx.recv_timeout(Duration::from_secs(120));
    }
}

pub fn is_main_thread() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { libc::pthread_main_np() != 0 }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// System Audio Recording (`kTCCServiceAudioCapture`), what Core Audio
/// process taps need. There is no public API for it, so this asks the TCC
/// framework's `TCCAccessPreflight` / `TCCAccessRequest`, loaded at runtime:
/// if Apple removes them, the status is `Unknown` and nothing else breaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SystemAudioAuthorization {
    NotDetermined,
    Denied,
    Authorized,
    /// The TCC calls are not available on this system.
    Unknown,
}

/// Maps `TCCAccessPreflight`'s result: 0 granted, 1 denied, anything else not asked yet.
pub fn system_audio_authorization_from_preflight(result: i32) -> SystemAudioAuthorization {
    match result {
        0 => SystemAudioAuthorization::Authorized,
        1 => SystemAudioAuthorization::Denied,
        _ => SystemAudioAuthorization::NotDetermined,
    }
}

pub fn system_audio_authorization() -> SystemAudioAuthorization {
    #[cfg(target_os = "macos")]
    {
        audio_capture::authorization()
    }
    #[cfg(not(target_os = "macos"))]
    {
        SystemAudioAuthorization::Unknown
    }
}

/// Shows the macOS System Audio Recording prompt while it was never answered.
/// Blocks until the user answers (or 60s pass).
pub fn request_system_audio_access() {
    #[cfg(target_os = "macos")]
    {
        audio_capture::request_access();
    }
}

#[cfg(target_os = "macos")]
mod audio_capture {
    use std::ffi::{c_void, CStr};
    use std::sync::mpsc;
    use std::sync::OnceLock;
    use std::time::Duration;

    use block2::RcBlock;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    use super::{system_audio_authorization_from_preflight, SystemAudioAuthorization};

    const TCC_FRAMEWORK: &CStr = c"/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC";
    const SERVICE: &str = "kTCCServiceAudioCapture";

    type Preflight = unsafe extern "C" fn(CFStringRef, *const c_void) -> i32;
    type Request = unsafe extern "C" fn(CFStringRef, *const c_void, *mut c_void);

    struct Tcc {
        preflight: Preflight,
        request: Option<Request>,
    }

    fn tcc() -> Option<&'static Tcc> {
        static TCC: OnceLock<Option<Tcc>> = OnceLock::new();
        TCC.get_or_init(|| unsafe {
            let handle = libc::dlopen(TCC_FRAMEWORK.as_ptr(), libc::RTLD_NOW);
            if handle.is_null() {
                return None;
            }
            let preflight = libc::dlsym(handle, c"TCCAccessPreflight".as_ptr());
            if preflight.is_null() {
                return None;
            }
            let request = libc::dlsym(handle, c"TCCAccessRequest".as_ptr());
            Some(Tcc {
                preflight: std::mem::transmute::<*mut c_void, Preflight>(preflight),
                request: (!request.is_null())
                    .then(|| std::mem::transmute::<*mut c_void, Request>(request)),
            })
        })
        .as_ref()
    }

    pub fn authorization() -> SystemAudioAuthorization {
        let Some(tcc) = tcc() else {
            return SystemAudioAuthorization::Unknown;
        };
        let service = CFString::new(SERVICE);
        let result = unsafe { (tcc.preflight)(service.as_concrete_TypeRef(), std::ptr::null()) };
        system_audio_authorization_from_preflight(result)
    }

    pub fn request_access() {
        let Some(request) = tcc().and_then(|tcc| tcc.request) else {
            return;
        };
        let (tx, rx) = mpsc::sync_channel::<bool>(1);
        let callback = RcBlock::new(move |granted: u8| {
            let _ = tx.try_send(granted != 0);
        });
        let service = CFString::new(SERVICE);
        unsafe {
            request(
                service.as_concrete_TypeRef(),
                std::ptr::null(),
                RcBlock::as_ptr(&callback).cast(),
            );
        }
        let _ = rx.recv_timeout(Duration::from_secs(60));
    }
}

#[cfg(test)]
mod system_audio_tests {
    use super::*;

    #[test]
    fn preflight_results_map_to_authorization() {
        assert_eq!(
            system_audio_authorization_from_preflight(0),
            SystemAudioAuthorization::Authorized
        );
        assert_eq!(
            system_audio_authorization_from_preflight(1),
            SystemAudioAuthorization::Denied
        );
        assert_eq!(
            system_audio_authorization_from_preflight(2),
            SystemAudioAuthorization::NotDetermined
        );
    }

    #[test]
    fn serializes_like_microphone_authorization() {
        let json = serde_json::to_string(&SystemAudioAuthorization::NotDetermined).unwrap();
        assert_eq!(json, "\"notDetermined\"");
    }
}
