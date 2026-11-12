//! Which app the meeting ran in, for analytics.
//!
//! While Amie records, [`MeetingAppProbe`] asks Core Audio every few seconds
//! which processes are capturing from a microphone (macOS 14.2+ process
//! objects). The app that held the mic most often is the meeting app. Its
//! bundle id is sent as is, so apps we have not mapped still show up; known
//! ones also get a short name. A browser plus a live Google Meet tab from the
//! Amie extension counts as Google Meet.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use serde_json::{Map, Value};

const POLL_INTERVAL: Duration = Duration::from_secs(10);

/// Short names for meeting apps, by bundle id prefix. Helper processes
/// (`com.google.Chrome.helper`) are folded into their app before matching.
const KNOWN_APPS: &[(&str, &str)] = &[
    ("us.zoom.", "zoom"),
    ("com.microsoft.teams", "teams"),
    ("com.cisco.webexmeetingsapp", "webex"),
    ("com.webex.", "webex"),
    ("Cisco-Systems.Spark", "webex"),
    ("com.tinyspeck.slackmacgap", "slack"),
    ("com.apple.FaceTime", "facetime"),
    ("com.apple.avconferenced", "facetime"),
    ("com.hnc.Discord", "discord"),
    ("net.whatsapp.WhatsApp", "whatsapp"),
    ("desktop.WhatsApp", "whatsapp"),
    ("com.skype.", "skype"),
    ("ru.keepcoder.Telegram", "telegram"),
    ("org.telegram.desktop", "telegram"),
    ("com.ringcentral.", "ringcentral"),
    ("com.logmein.GoToMeeting", "goto"),
    ("com.bluejeans.", "bluejeans"),
    ("com.amazon.Amazon-Chime", "chime"),
    ("com.loom.desktop", "loom"),
];

const BROWSERS: &[(&str, &str)] = &[
    ("com.google.Chrome", "chrome"),
    ("com.brave.Browser", "brave"),
    ("com.apple.Safari", "safari"),
    // Safari captures the mic in WebKit's GPU process.
    ("com.apple.WebKit.GPU", "safari"),
    ("org.mozilla.firefox", "firefox"),
    ("company.thebrowser.Browser", "arc"),
    ("com.microsoft.edgemac", "edge"),
    ("com.operasoftware.Opera", "opera"),
    ("com.vivaldi.Vivaldi", "vivaldi"),
    ("app.zen-browser.zen", "zen"),
];

/// System processes that open the mic on their own (dictation, Siri).
const IGNORED: &[&str] = &[
    "com.pavel.amie",
    "com.apple.CoreSpeech",
    "com.apple.corespeechd",
    "com.apple.assistantd",
    "com.apple.siri",
    "com.apple.SpeechRecognitionCore",
    "com.apple.audio.",
    "com.apple.controlcenter",
];

/// Counted mic holders for one recording.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct MeetingAppSamples {
    /// Normalized bundle id -> polls it was capturing in.
    pub mic_apps: BTreeMap<String, u32>,
    /// Polls with a live Google Meet tab from the extension.
    pub meet_live: u32,
    /// Zoom or Teams found running (fallback when Core Audio says nothing).
    pub running_app: Option<&'static str>,
    pub polls: u32,
}

impl MeetingAppSamples {
    pub fn add(&mut self, bundles: impl IntoIterator<Item = String>, meet_live: bool) {
        self.polls += 1;
        if meet_live {
            self.meet_live += 1;
        }
        let mut seen = std::collections::BTreeSet::new();
        for bundle in bundles {
            let bundle = normalize_bundle(&bundle);
            if !bundle.is_empty() && !is_ignored(&bundle) && seen.insert(bundle.clone()) {
                *self.mic_apps.entry(bundle).or_default() += 1;
            }
        }
    }

    /// The bundle that held the mic in the most polls. Ties go to a known
    /// meeting app, then to the alphabetically first id, so it is stable.
    pub fn top_bundle(&self) -> Option<&str> {
        self.mic_apps
            .iter()
            .max_by(|(a_id, a), (b_id, b)| {
                a.cmp(b)
                    .then_with(|| known_app(a_id).is_some().cmp(&known_app(b_id).is_some()))
                    .then_with(|| b_id.cmp(a_id))
            })
            .map(|(bundle, _)| bundle.as_str())
    }

    /// Fields for the `meeting_ended` event.
    pub fn to_data(&self) -> Map<String, Value> {
        let mut data = Map::new();
        let top = self.top_bundle();
        let browser = top.and_then(browser_name);
        let app = match top {
            Some(bundle) => match (known_app(bundle), browser) {
                (Some(app), _) => app.to_string(),
                (None, Some(_)) if self.meet_live > 0 => "google_meet".into(),
                (None, Some(_)) => "browser".into(),
                (None, None) => "other".into(),
            },
            None if self.meet_live > 0 => "google_meet".into(),
            None => self.running_app.unwrap_or("none").to_string(),
        };
        data.insert("meeting_app".into(), app.into());
        if let Some(bundle) = top {
            data.insert("meeting_app_bundle".into(), bundle.into());
        }
        if let Some(browser) = browser {
            data.insert("browser".into(), browser.into());
        }
        data
    }
}

/// `com.google.Chrome.helper.renderer` -> `com.google.Chrome`.
fn normalize_bundle(bundle: &str) -> String {
    let trimmed = bundle.trim();
    let cut = trimmed
        .to_ascii_lowercase()
        .find(".helper")
        .unwrap_or(trimmed.len());
    trimmed[..cut].chars().take(100).collect()
}

fn is_ignored(bundle: &str) -> bool {
    IGNORED.iter().any(|prefix| bundle.starts_with(prefix))
}

fn known_app(bundle: &str) -> Option<&'static str> {
    KNOWN_APPS
        .iter()
        .find(|(prefix, _)| bundle.starts_with(prefix))
        .map(|(_, name)| *name)
}

fn browser_name(bundle: &str) -> Option<&'static str> {
    BROWSERS
        .iter()
        .find(|(prefix, _)| bundle.starts_with(prefix))
        .map(|(_, name)| *name)
}

/// Samples mic holders on a background thread until [`MeetingAppProbe::finish`].
pub struct MeetingAppProbe {
    stop: Arc<AtomicBool>,
    samples: Arc<Mutex<MeetingAppSamples>>,
    handle: Option<JoinHandle<()>>,
}

impl MeetingAppProbe {
    /// `meet_live` reports whether a Google Meet tab is in a call.
    pub fn start(meet_live: impl Fn() -> bool + Send + 'static) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let samples = Arc::new(Mutex::new(MeetingAppSamples::default()));
        let handle = {
            let stop = Arc::clone(&stop);
            let samples = Arc::clone(&samples);
            std::thread::Builder::new()
                .name("analytics-meeting-app".into())
                .spawn(move || {
                    while !stop.load(Ordering::Relaxed) {
                        let bundles = mic_capturing_bundles();
                        let live = meet_live();
                        let running = crate::speakers::running_meeting_app_name();
                        if let Ok(mut samples) = samples.lock() {
                            samples.add(bundles, live);
                            if samples.running_app.is_none() {
                                samples.running_app = running;
                            }
                        }
                        sleep_unless_stopped(&stop, POLL_INTERVAL);
                    }
                })
                .ok()
        };
        Self {
            stop,
            samples,
            handle,
        }
    }

    pub fn finish(mut self) -> MeetingAppSamples {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        self.samples.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

impl Drop for MeetingAppProbe {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn sleep_unless_stopped(stop: &AtomicBool, total: Duration) {
    let step = Duration::from_millis(250);
    let mut slept = Duration::ZERO;
    while slept < total && !stop.load(Ordering::Relaxed) {
        std::thread::sleep(step);
        slept += step;
    }
}

/// Bundle ids of processes capturing audio input right now, other than us.
#[cfg(target_os = "macos")]
fn mic_capturing_bundles() -> Vec<String> {
    use std::mem;
    use std::ptr::{null, NonNull};

    use objc2_core_audio::{
        kAudioHardwareNoError, kAudioHardwarePropertyProcessObjectList,
        kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject,
        kAudioProcessPropertyBundleID, kAudioProcessPropertyIsRunningInput,
        kAudioProcessPropertyPID, AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize,
        AudioObjectID, AudioObjectPropertyAddress,
    };
    use objc2_core_foundation::{CFRetained, CFString};

    fn address(selector: u32) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress {
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        }
    }

    fn read_u32(object: AudioObjectID, selector: u32) -> Option<u32> {
        let addr = address(selector);
        let mut value: u32 = 0;
        let mut size = mem::size_of::<u32>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                NonNull::from(&addr),
                0,
                null(),
                NonNull::from(&mut size),
                NonNull::from(&mut value).cast(),
            )
        };
        (status == kAudioHardwareNoError).then_some(value)
    }

    fn read_bundle(object: AudioObjectID) -> Option<String> {
        let addr = address(kAudioProcessPropertyBundleID);
        let mut value: *const CFString = std::ptr::null();
        let mut size = mem::size_of::<*const CFString>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                NonNull::from(&addr),
                0,
                null(),
                NonNull::from(&mut size),
                NonNull::from(&mut value).cast(),
            )
        };
        if status != kAudioHardwareNoError {
            return None;
        }
        // The property hands back a +1 reference: take ownership so it is released.
        let string = unsafe { CFRetained::from_raw(NonNull::new(value as *mut CFString)?) };
        Some(string.to_string())
    }

    let list = address(kAudioHardwarePropertyProcessObjectList);
    let mut size: u32 = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject as AudioObjectID,
            NonNull::from(&list),
            0,
            null(),
            NonNull::from(&mut size),
        )
    };
    // Older macOS has no process objects: report nothing, never fail.
    if status != kAudioHardwareNoError || size == 0 {
        return Vec::new();
    }
    let count = size as usize / mem::size_of::<AudioObjectID>();
    let mut objects: Vec<AudioObjectID> = vec![0; count];
    let status = unsafe {
        AudioObjectGetPropertyData(
            kAudioObjectSystemObject as AudioObjectID,
            NonNull::from(&list),
            0,
            null(),
            NonNull::from(&mut size),
            NonNull::new(objects.as_mut_ptr()).unwrap().cast(),
        )
    };
    if status != kAudioHardwareNoError {
        return Vec::new();
    }
    objects.truncate(size as usize / mem::size_of::<AudioObjectID>());

    let own_pid = std::process::id();
    objects
        .into_iter()
        .filter(|object| read_u32(*object, kAudioProcessPropertyIsRunningInput) == Some(1))
        .filter(|object| read_u32(*object, kAudioProcessPropertyPID) != Some(own_pid))
        .filter_map(read_bundle)
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn mic_capturing_bundles() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn samples(polls: &[&[&str]], meet_live: u32) -> MeetingAppSamples {
        let mut samples = MeetingAppSamples::default();
        for (i, bundles) in polls.iter().enumerate() {
            samples.add(
                bundles.iter().map(|b| b.to_string()),
                (i as u32) < meet_live,
            );
        }
        samples
    }

    #[test]
    fn helpers_fold_into_their_app() {
        assert_eq!(
            normalize_bundle("com.google.Chrome.helper"),
            "com.google.Chrome"
        );
        assert_eq!(
            normalize_bundle("com.microsoft.teams2.helper.Renderer"),
            "com.microsoft.teams2"
        );
        assert_eq!(normalize_bundle("us.zoom.xos"), "us.zoom.xos");
    }

    #[test]
    fn known_app_wins() {
        let data = samples(
            &[&["us.zoom.xos"], &["us.zoom.xos", "com.apple.corespeechd"]],
            0,
        )
        .to_data();
        assert_eq!(data["meeting_app"], "zoom");
        assert_eq!(data["meeting_app_bundle"], "us.zoom.xos");
        assert!(!data.contains_key("browser"));
    }

    #[test]
    fn browser_with_live_meet_tab_is_google_meet() {
        let data = samples(
            &[&["com.google.Chrome.helper"], &["com.google.Chrome.helper"]],
            1,
        )
        .to_data();
        assert_eq!(data["meeting_app"], "google_meet");
        assert_eq!(data["meeting_app_bundle"], "com.google.Chrome");
        assert_eq!(data["browser"], "chrome");
    }

    #[test]
    fn browser_without_meet_is_a_web_meeting() {
        let data = samples(&[&["com.apple.WebKit.GPU"]], 0).to_data();
        assert_eq!(data["meeting_app"], "browser");
        assert_eq!(data["browser"], "safari");
    }

    #[test]
    fn unknown_apps_send_their_bundle_id() {
        let data = samples(&[&["io.gather.desktop"], &["io.gather.desktop"]], 0).to_data();
        assert_eq!(data["meeting_app"], "other");
        assert_eq!(data["meeting_app_bundle"], "io.gather.desktop");
    }

    #[test]
    fn most_frequent_holder_wins_and_amie_is_ignored() {
        let data = samples(
            &[
                &["com.pavel.amie", "com.hnc.Discord"],
                &["com.tinyspeck.slackmacgap"],
                &["com.tinyspeck.slackmacgap"],
            ],
            0,
        )
        .to_data();
        assert_eq!(data["meeting_app"], "slack");
    }

    #[test]
    fn nothing_seen_falls_back_to_running_app_or_none() {
        assert_eq!(
            MeetingAppSamples::default().to_data()["meeting_app"],
            "none"
        );
        let mut fallback = MeetingAppSamples::default();
        fallback.running_app = Some("teams");
        assert_eq!(fallback.to_data()["meeting_app"], "teams");
        assert_eq!(samples(&[&[]], 1).to_data()["meeting_app"], "google_meet");
    }
}
