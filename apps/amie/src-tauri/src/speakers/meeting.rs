use std::collections::BTreeSet;

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
        if process::pid_for(process::TEAMS_BUNDLE).is_some() {
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
    let teams_pid = process::pid_for(process::TEAMS_BUNDLE);
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
    ax::application_tree(pid, true).map(|tree| teams::read(&tree).speakers)
}
