//! Locate Zoom and Teams by bundle identifier. A fresh pid is resolved on
//! every poll so a relaunched meeting app is picked up.

use objc2_app_kit::NSRunningApplication;
use objc2_foundation::NSString;

pub const ZOOM_BUNDLE: &str = "us.zoom.xos";
pub const TEAMS_BUNDLE: &str = "com.microsoft.teams2";
const TEAMS_BUNDLES: &[&str] = &[TEAMS_BUNDLE, "com.microsoft.teams"];

pub fn teams_pid() -> Option<i32> {
    TEAMS_BUNDLES
        .iter()
        .find_map(|bundle_id| pid_for(bundle_id))
        .or_else(pid_for_teams_path)
}

/// Bundle lookup misses a Teams build whose identifier we have not listed.
/// The on-disk app name is stable enough to find the main executable.
fn pid_for_teams_path() -> Option<i32> {
    const MAX_PIDS: usize = 2048;
    const PATH_MAX: usize = 4096;
    let mut pids = vec![0i32; MAX_PIDS];
    let byte_len = unsafe {
        libc::proc_listallpids(
            pids.as_mut_ptr().cast(),
            (pids.len() * std::mem::size_of::<i32>()) as libc::c_int,
        )
    };
    if byte_len <= 0 {
        return None;
    }
    let count = (byte_len as usize / std::mem::size_of::<i32>()).min(pids.len());
    let mut buf = vec![0u8; PATH_MAX];
    for &pid in &pids[..count] {
        if pid <= 0 {
            continue;
        }
        let copied = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), PATH_MAX as u32) };
        if copied <= 0 {
            continue;
        }
        let copied = (copied as usize).min(PATH_MAX);
        let end = buf[..copied]
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(copied);
        let path = String::from_utf8_lossy(&buf[..end]);
        if super::is_teams_app_path(&path) {
            return Some(pid);
        }
    }
    None
}

pub fn pid_for(bundle_id: &str) -> Option<i32> {
    let ident = NSString::from_str(bundle_id);
    let apps = NSRunningApplication::runningApplicationsWithBundleIdentifier(&ident);
    let app = apps.firstObject()?;
    let pid = app.processIdentifier();
    if pid > 0 {
        Some(pid)
    } else {
        None
    }
}
