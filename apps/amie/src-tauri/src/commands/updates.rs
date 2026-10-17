//! Install-location helpers for the in-app updater UI.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInstallLocation {
    /// False when the `.app` bundle is on a read-only volume (typical for a mounted DMG).
    pub writable: bool,
    /// Absolute path of the running executable, when available.
    pub executable_path: Option<String>,
    /// True when the executable lives under `/Volumes/` (mounted disk image / external volume).
    pub on_removable_volume: bool,
}

/// Probe whether the running app bundle can be updated in place.
///
/// Updates replace files inside the `.app`. Running from a DMG (or any read-only
/// mount) cannot install — the user must copy Amie to `/Applications` first.
#[tauri::command]
pub fn get_app_install_location() -> AppInstallLocation {
    let executable_path = std::env::current_exe()
        .ok()
        .map(|p| p.display().to_string());

    #[cfg(target_os = "macos")]
    {
        return macos_install_location(executable_path);
    }

    #[cfg(not(target_os = "macos"))]
    {
        AppInstallLocation {
            writable: true,
            executable_path,
            on_removable_volume: false,
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_install_location(executable_path: Option<String>) -> AppInstallLocation {
    let Some(exe) = std::env::current_exe().ok() else {
        return AppInstallLocation {
            writable: true,
            executable_path,
            on_removable_volume: false,
        };
    };

    let on_removable_volume = exe.starts_with("/Volumes/");

    // Prefer probing the `.app` bundle root when running as a real bundle
    // (`Amie.app/Contents/MacOS/<bin>`). Fall back to the executable's parent.
    let probe_dir = exe
        .parent() // MacOS
        .and_then(|macos| macos.parent()) // Contents
        .and_then(|contents| contents.parent()) // Amie.app
        .filter(|bundle| {
            bundle
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
        })
        .map(|p| p.to_path_buf())
        .or_else(|| exe.parent().map(|p| p.to_path_buf()));

    let writable = match probe_dir.as_deref() {
        Some(dir) => path_is_writable(dir),
        None => true,
    };

    AppInstallLocation {
        writable,
        executable_path,
        on_removable_volume,
    }
}

#[cfg(target_os = "macos")]
fn path_is_writable(path: &std::path::Path) -> bool {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let Ok(c_path) = CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    // libc is already a macOS dependency of this crate.
    unsafe { libc::access(c_path.as_ptr(), libc::W_OK) == 0 }
}
