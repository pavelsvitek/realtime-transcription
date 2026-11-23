use std::collections::BTreeSet;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
mod ax;
#[cfg(target_os = "macos")]
mod process;

#[cfg(target_os = "macos")]
use super::slack;
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
    Slack,
}

impl MeetingApp {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Zoom => "zoom",
            Self::Teams => "teams",
            Self::Slack => "slack",
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

/// One accessibility read of the running meeting app.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MeetingRead {
    /// Remote display names marked speaking.
    pub speakers: BTreeSet<String>,
    /// The local user's mic, `None` when the app does not say. Only Teams
    /// reports it so far.
    pub self_muted: Option<bool>,
}

/// Speakers and mic state of the running meeting app, empty when none is
/// running. `Err` means the accessibility read failed and the previous
/// timeline entry should be left alone.
pub fn read_meeting() -> Result<MeetingRead, String> {
    #[cfg(target_os = "macos")]
    {
        read_meeting_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(MeetingRead::default())
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
        if process::slack_pid().is_some() {
            return Some(MeetingApp::Slack);
        }
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(target_os = "macos")]
fn read_meeting_macos() -> Result<MeetingRead, String> {
    let zoom_pid = process::pid_for(process::ZOOM_BUNDLE);
    let teams_pid = process::teams_pid();
    let slack_pids = process::slack_pids();

    if zoom_pid.is_none() && teams_pid.is_none() && slack_pids.is_empty() {
        return Ok(MeetingRead::default());
    }

    let mut first_error: Option<String> = None;
    let mut fallback: Option<MeetingRead> = None;

    if let Some(pid) = zoom_pid {
        match read_zoom(pid) {
            Ok(read) if !read.speakers.is_empty() => return Ok(read),
            Ok(read) => fallback = Some(read),
            Err(err) => {
                first_error.get_or_insert(err);
            }
        }
    }

    if let Some(pid) = teams_pid {
        match read_teams(pid) {
            Ok(read) if !read.speakers.is_empty() || read.self_muted.is_some() => return Ok(read),
            Ok(read) => {
                if fallback.is_none() {
                    fallback = Some(read);
                }
            }
            Err(err) => {
                first_error.get_or_insert(err);
            }
        }
    }

    for pid in slack_pids {
        match read_slack(pid) {
            Ok(read) if read.in_huddle => {
                return Ok(MeetingRead {
                    speakers: read.speakers,
                    self_muted: read.self_muted,
                });
            }
            Ok(_) => {
                if fallback.is_none() {
                    fallback = Some(MeetingRead::default());
                }
            }
            Err(err) => {
                first_error.get_or_insert(err);
            }
        }
    }

    if let Some(read) = fallback {
        return Ok(read);
    }
    Err(first_error.unwrap_or_else(|| "No meeting app readable".into()))
}

#[cfg(target_os = "macos")]
pub fn read_slack(pid: i32) -> Result<slack::SlackRead, String> {
    let tree = ax::application_tree(pid, true)?;
    let read = slack::read(&tree);
    if read.requested_manual_accessibility && !read.in_huddle {
        return Err("Slack accessibility tree is still closed".into());
    }
    Ok(read)
}

#[cfg(target_os = "macos")]
fn read_zoom(pid: i32) -> Result<MeetingRead, String> {
    ax::application_tree(pid, false).map(|tree| MeetingRead {
        speakers: zoom::speaking_names(&tree),
        self_muted: None,
    })
}

#[cfg(target_os = "macos")]
fn read_teams(pid: i32) -> Result<MeetingRead, String> {
    let tree = ax::application_tree(pid, true)?;
    if teams::needs_roster_open(&tree) {
        match ax::press_dom_id(pid, "roster-button") {
            Ok(true) => tracing::info!("Opened Teams participants pane; video gallery was not in the tree"),
            Ok(false) => tracing::debug!("Teams roster-button was not in the tree"),
            Err(error) => tracing::warn!(%error, "Could not open Teams participants pane"),
        }
    } else if teams::needs_roster_close(&tree) {
        static CLOSED: AtomicBool = AtomicBool::new(false);
        if !CLOSED.swap(true, Ordering::Relaxed) {
            match ax::press_titled(pid, "Close participants pane") {
                Ok(true) => tracing::info!("Closed Teams participants pane; using video gallery"),
                Ok(false) => tracing::debug!("Teams close-participants control was not in the tree"),
                Err(error) => tracing::warn!(%error, "Could not close Teams participants pane"),
            }
        }
    }
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
    Ok(MeetingRead {
        speakers: read.speakers,
        self_muted: read.self_muted,
    })
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
