use std::collections::BTreeSet;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
mod ax;
#[cfg(target_os = "macos")]
mod process;

#[cfg(target_os = "macos")]
use super::teams;
#[cfg(target_os = "macos")]
use super::zoom;

/// A meeting app we know how to read, when one is running.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub enum MeetingApp {
    Zoom,
    Teams,
}

impl MeetingApp {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Zoom => "zoom",
            Self::Teams => "teams",
        }
    }
}

/// The main Teams executable. Renamed installs ("work or school", "classic")
/// still live in an app bundle whose path contains "Microsoft Teams". Helper
/// processes inside that bundle are not the window we read.
pub fn is_teams_app_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    if lower.contains("helper") {
        return false;
    }
    match (
        lower.find("microsoft teams"),
        lower.find(".app/contents/macos/"),
    ) {
        (Some(name), Some(executable)) => name < executable,
        _ => false,
    }
}

/// Remote display names marked speaking, or an empty set when no meeting app
/// is running. `Err` means the accessibility read failed and the previous
/// timeline entry should be left alone.
pub fn read_speakers() -> Result<BTreeSet<String>, String> {
    #[cfg(target_os = "macos")]
    {
        read_speakers_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(BTreeSet::new())
    }
}

pub fn running_meeting_app() -> Option<MeetingApp> {
    #[cfg(target_os = "macos")]
    {
        if process::pid_for(process::ZOOM_BUNDLE).is_some() {
            return Some(MeetingApp::Zoom);
        }
        if process::teams_pid().is_some() {
            return Some(MeetingApp::Teams);
        }
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(target_os = "macos")]
fn read_speakers_macos() -> Result<BTreeSet<String>, String> {
    let zoom = process::pid_for(process::ZOOM_BUNDLE);
    let teams_pid = process::teams_pid();
    match (zoom, teams_pid) {
        (None, None) => Ok(BTreeSet::new()),
        (Some(pid), None) => read_zoom(pid),
        (None, Some(pid)) => read_teams(pid),
        (Some(zoom_pid), Some(teams_pid)) => {
            let zoom_names = read_zoom(zoom_pid)?;
            if !zoom_names.is_empty() {
                Ok(zoom_names)
            } else {
                read_teams(teams_pid)
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn read_zoom(pid: i32) -> Result<BTreeSet<String>, String> {
    ax::application_tree(pid, false).map(|tree| zoom::speaking_names(&tree))
}

#[cfg(target_os = "macos")]
fn read_teams(pid: i32) -> Result<BTreeSet<String>, String> {
    let tree = ax::application_tree(pid, true)?;
    let read = teams::read(&tree);
    if read.requested_manual_accessibility && read.speakers.is_empty() {
        return Err("Teams accessibility tree is still closed".into());
    }
    if read.speakers.is_empty() && !read.present.is_empty() {
        static LOGGED: AtomicBool = AtomicBool::new(false);
        if !LOGGED.swap(true, Ordering::Relaxed) {
            let names: Vec<_> = read.present.iter().take(8).cloned().collect();
            tracing::warn!(
                ?names,
                "Teams accessibility tree has participant names and no speaking mark"
            );
        }
    }
    Ok(read.speakers)
}

#[cfg(test)]
mod tests {
    use super::is_teams_app_path;

    #[test]
    fn teams_main_executables_match_and_helpers_do_not() {
        assert!(is_teams_app_path(
            "/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams"
        ));
        assert!(is_teams_app_path(
            "/Applications/Microsoft Teams (work or school).app/Contents/MacOS/MSTeams"
        ));
        assert!(is_teams_app_path(
            "/Applications/Microsoft Teams classic.app/Contents/MacOS/Teams"
        ));
        assert!(!is_teams_app_path(
            "/Applications/Microsoft Teams.app/Contents/Helpers/Microsoft Teams Helper.app/Contents/MacOS/Microsoft Teams Helper"
        ));
        assert!(!is_teams_app_path(
            "/Applications/zoom.us.app/Contents/MacOS/zoom.us"
        ));
    }
}
