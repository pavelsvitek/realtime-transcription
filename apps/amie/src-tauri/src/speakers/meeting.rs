use std::collections::BTreeSet;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::sync::Mutex;
#[cfg(target_os = "macos")]
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
mod ax;
#[cfg(target_os = "macos")]
mod process;

#[cfg(target_os = "macos")]
use super::meet;
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
    /// Google Meet in a Chromium browser.
    Meet,
}

impl MeetingApp {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Zoom => "zoom",
            Self::Teams => "ms-teams",
            Self::Meet => "google-meet",
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
        if meet_browser_pid().is_some() {
            return Some(MeetingApp::Meet);
        }
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// Accessibility tree of `target` (a pid or a bundle id). Chromium
/// accessibility is switched on first, so browsers and Electron apps show
/// their page content.
pub fn read_tree(target: &str) -> Result<super::tree::AxNode, String> {
    #[cfg(target_os = "macos")]
    {
        let pid = match target.parse::<i32>() {
            Ok(pid) => pid,
            Err(_) => process::pid_for(target)
                .ok_or_else(|| format!("No running app with bundle id {target}"))?,
        };
        ax::application_tree(pid, true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = target;
        Err("Accessibility dumps are only available on macOS".into())
    }
}

#[cfg(target_os = "macos")]
fn read_speakers_macos() -> Result<BTreeSet<String>, String> {
    let zoom = process::pid_for(process::ZOOM_BUNDLE);
    let teams_pid = process::teams_pid();
    let native = match (zoom, teams_pid) {
        (None, None) => BTreeSet::new(),
        (Some(pid), None) => read_zoom(pid)?,
        (None, Some(pid)) => read_teams(pid)?,
        (Some(zoom_pid), Some(teams_pid)) => {
            let zoom_names = read_zoom(zoom_pid)?;
            if !zoom_names.is_empty() {
                zoom_names
            } else {
                read_teams(teams_pid)?
            }
        }
    };
    if !native.is_empty() {
        return Ok(native);
    }
    read_meet()
}

/// How often to look through every open browser for a Meet tab while none is
/// known. One browser tree read takes about a second.
#[cfg(target_os = "macos")]
const MEET_SCAN_INTERVAL: Duration = Duration::from_secs(5);

#[cfg(target_os = "macos")]
struct MeetState {
    /// Browser process showing a Meet call, once one was found.
    pid: Option<i32>,
    last_scan: Option<Instant>,
    tracker: meet::MeetTracker,
    started: Instant,
}

#[cfg(target_os = "macos")]
static MEET: Mutex<Option<MeetState>> = Mutex::new(None);

/// The macOS account's full name. Meet shows the signed-in Google name on the
/// self tile, which usually matches. A mismatch only means the self tile is
/// not filtered out.
pub fn local_user_name() -> Option<String> {
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
    #[cfg(target_os = "macos")]
    {
        macos_user_name()
    }
}

#[cfg(target_os = "macos")]
fn macos_user_name() -> Option<String> {
    let entry = unsafe { libc::getpwuid(libc::getuid()) };
    if entry.is_null() {
        return None;
    }
    let gecos = unsafe { std::ffi::CStr::from_ptr((*entry).pw_gecos) };
    let full = gecos.to_string_lossy().split(',').next()?.trim().to_string();
    (!full.is_empty()).then_some(full)
}

#[cfg(target_os = "macos")]
fn with_meet<T>(run: impl FnOnce(&mut MeetState) -> T) -> T {
    let mut guard = MEET.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let state = guard.get_or_insert_with(|| MeetState {
        pid: None,
        last_scan: None,
        tracker: meet::MeetTracker::with_self_name(local_user_name()),
        started: Instant::now(),
    });
    run(state)
}

/// The browser showing a Meet call. A known pid is trusted until a read
/// finds the page gone. Otherwise the browsers are scanned, at most once per
/// `MEET_SCAN_INTERVAL`.
#[cfg(target_os = "macos")]
fn meet_browser_pid() -> Option<i32> {
    with_meet(|state| {
        if state.pid.is_some() {
            return state.pid;
        }
        let due = state
            .last_scan
            .is_none_or(|at| at.elapsed() >= MEET_SCAN_INTERVAL);
        if !due {
            return None;
        }
        state.last_scan = Some(Instant::now());
        state.pid = process::BROWSER_BUNDLES.iter().find_map(|bundle| {
            let pid = process::pid_for(bundle)?;
            let tree = ax::application_tree(pid, true).ok()?;
            meet::find_page(&tree).map(|_| pid)
        });
        state.pid
    })
}

#[cfg(target_os = "macos")]
fn read_meet() -> Result<BTreeSet<String>, String> {
    let Some(pid) = meet_browser_pid() else {
        return Ok(BTreeSet::new());
    };
    let tree = match ax::application_tree(pid, true) {
        Ok(tree) => tree,
        Err(error) => {
            with_meet(|state| state.pid = None);
            return Err(error);
        }
    };
    with_meet(|state| match meet::find_page(&tree) {
        Some(page) => {
            let at_ms = state.started.elapsed().as_millis() as u64;
            Ok(state.tracker.observe(page, at_ms))
        }
        None => {
            // Tab closed, call ended, or the tab is in the background and
            // Chromium no longer exposes it. The tracker keeps its baselines
            // and drops them itself after a long gap.
            state.pid = None;
            Ok(BTreeSet::new())
        }
    })
}

#[cfg(target_os = "macos")]
fn read_zoom(pid: i32) -> Result<BTreeSet<String>, String> {
    ax::application_tree(pid, false).map(|tree| zoom::speaking_names(&tree))
}

#[cfg(target_os = "macos")]
fn read_teams(pid: i32) -> Result<BTreeSet<String>, String> {
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
