//! Locate Zoom and Teams by bundle identifier. A fresh pid is resolved on
//! every poll so a relaunched meeting app is picked up.

use objc2_app_kit::NSRunningApplication;
use objc2_foundation::NSString;

pub const ZOOM_BUNDLE: &str = "us.zoom.xos";
pub const TEAMS_BUNDLE: &str = "com.microsoft.teams2";

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
