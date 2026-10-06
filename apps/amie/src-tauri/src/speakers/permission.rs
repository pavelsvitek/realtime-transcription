//! macOS Accessibility (TCC). The prompt and the trust check are unavailable
//! on other systems; callers there report Accessibility as off.

#[cfg(target_os = "macos")]
mod imp {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> u8;
        fn AXIsProcessTrustedWithOptions(
            options: core_foundation::dictionary::CFDictionaryRef,
        ) -> u8;
    }

    pub fn is_trusted() -> bool {
        unsafe { AXIsProcessTrusted() != 0 }
    }

    pub fn prompt() {
        let key = CFString::new("AXTrustedCheckOptionPrompt");
        let value = CFBoolean::true_value();
        let dict = CFDictionary::from_CFType_pairs(&[(key, value)]);
        unsafe {
            AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef());
        }
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
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
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
