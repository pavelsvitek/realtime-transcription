//! Live macOS Accessibility end-to-end tests against `apps/fake-slack-app`.
//!
//! Launches the real `FakeSlack.app` bundle (`com.tinyspeck.slackmacgap`) with
//! 4, 6, and 8 participants across compact and full-screen layouts, then drives
//! Amie's real `speakers::read_meeting()`, `SpeakerTimeline`, and
//! `speaker_for_segment()` to verify speaker identification, overlaps, local
//! user exclusion, and `self_muted` transitions.
//!
//! Marked `#[ignore]` so normal CI `cargo test` stays hermetic without macOS
//! GUI / Accessibility permission. Run locally with:
//!
//! ```bash
//! cargo test --manifest-path apps/amie/src-tauri/Cargo.toml \
//!   --test slack_fake_huddle -- --ignored --nocapture --test-threads=1
//! ```

#![cfg(target_os = "macos")]

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use amie_lib::speakers::{
    is_trusted, read_meeting, running_meeting_app, speaker_for_segment, start_speaker_watch,
    AppMute, MeetBridge, MeetingApp, SpeakerSink, SpeakerTimeline,
};
use amie_lib::transcription::labels::{REMOTE, SYSTEM_STREAM, USER};
use serial_test::serial;

struct FakeSlackGuard {
    child: Child,
}

impl FakeSlackGuard {
    fn spawn(participants: usize, scenario: &str, layout: &str, muted: bool) -> Self {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .expect("resolve repo root");
        let app_dir = repo_root.join("apps/fake-slack-app");
        let bin = app_dir.join("build/FakeSlack.app/Contents/MacOS/fake-slack");
        assert!(
            bin.exists(),
            "FakeSlack.app not built at {}; run `bash apps/fake-slack-app/scripts/build-app.sh` first",
            bin.display()
        );

        let mut cmd = Command::new(&bin);
        cmd.env("FAKE_SLACK_SCENARIOS_DIR", app_dir.join("scenarios"))
            .env("FAKE_SLACK_ALLOW_PARALLEL", "1")
            .args([
                "--participants",
                &participants.to_string(),
                "--scenario",
                scenario,
                "--layout",
                layout,
                "--delay",
                "1",
                "--no-audio",
                "--quit-when-done",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::inherit());
        if muted {
            cmd.arg("--muted");
        }
        let child = cmd.spawn().expect("spawn FakeSlack.app");
        Self { child }
    }

    fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for FakeSlackGuard {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Debug)]
struct ObservedRun {
    timeline: SpeakerTimeline,
    speaker_sequence: Vec<Vec<String>>,
    mute_sequence: Vec<bool>,
    poll_count: usize,
    errors: usize,
}

fn observe_huddle(mut fake: FakeSlackGuard, timeout: Duration) -> ObservedRun {
    assert!(
        is_trusted(),
        "macOS Accessibility permission is required to run live FakeSlack tests"
    );

    let start = Instant::now();
    let mut timeline = SpeakerTimeline::new();
    let mut speaker_sequence: Vec<Vec<String>> = Vec::new();
    let mut mute_sequence: Vec<bool> = Vec::new();
    let mut poll_count = 0usize;
    let mut errors = 0usize;

    // Wait briefly for FakeSlack.app to launch and register its window.
    std::thread::sleep(Duration::from_millis(350));
    assert_eq!(
        running_meeting_app(),
        Some(MeetingApp::Slack),
        "Amie did not detect Slack / FakeSlack running"
    );

    while fake.is_running() && start.elapsed() < timeout {
        let now_ms = start.elapsed().as_millis() as u64;
        match read_meeting() {
            Ok(read) => {
                poll_count += 1;
                timeline.push(now_ms, read.speakers.clone());
                let current: Vec<String> = read.speakers.into_iter().collect();
                if speaker_sequence.last() != Some(&current) {
                    if !current.is_empty() {
                        println!("[{:>5} ms] SPEAKERS: {:?}", now_ms, current);
                    } else {
                        println!("[{:>5} ms] SPEAKERS: (quiet)", now_ms);
                    }
                    speaker_sequence.push(current);
                }
                if let Some(muted) = read.self_muted {
                    if mute_sequence.last().copied() != Some(muted) {
                        println!("[{:>5} ms] SELF_MUTED: {}", now_ms, muted);
                        mute_sequence.push(muted);
                    }
                }
            }
            Err(err) => {
                errors += 1;
                eprintln!("[{:>5} ms] read_meeting error: {err}", now_ms);
            }
        }
        std::thread::sleep(Duration::from_millis(120));
    }

    assert!(
        !fake.is_running(),
        "FakeSlack scenario did not finish within {:?}",
        timeout
    );

    ObservedRun {
        timeline,
        speaker_sequence,
        mute_sequence,
        poll_count,
        errors,
    }
}

fn nonempty_transitions(seq: &[Vec<String>]) -> Vec<Vec<String>> {
    seq.iter().filter(|s| !s.is_empty()).cloned().collect()
}

#[test]
#[ignore]
#[serial]
fn live_four_person_compact_huddle_tracks_turns_overlap_and_excludes_local_user() {
    let fake = FakeSlackGuard::spawn(4, "silent-marks", "compact", false);
    let run = observe_huddle(fake, Duration::from_secs(30));

    println!("4-person compact: {} polls, {} errors", run.poll_count, run.errors);
    assert!(run.poll_count >= 20, "expected >= 20 AX polls, got {}", run.poll_count);
    assert_eq!(run.mute_sequence, vec![false]);

    let observed = nonempty_transitions(&run.speaker_sequence);
    // silent-marks: Ada (3s), pause, Grace (3s), pause, overlap(Ada+Alan 3s), pause, me (2s)
    // Local user ("me" = Pavel Svitek) must NEVER appear in remote speakers.
    assert!(
        !observed.iter().flatten().any(|name| name.contains("Pavel")),
        "local user leaked into remote speakers: {:?}",
        observed
    );
    assert_eq!(
        observed,
        vec![
            vec!["Ada Lovelace".to_string()],
            vec!["Grace Hopper".to_string()],
            vec!["Ada Lovelace".to_string(), "Alan Turing".to_string()],
        ],
        "unexpected 4-person speaker sequence"
    );

    // Verify SpeakerTimeline + speaker_for_segment joins overlap and keeps mic as User.
    let all_labels: BTreeSet<String> = (0..15_000)
        .step_by(500)
        .map(|t| speaker_for_segment(SYSTEM_STREAM, REMOTE, t, t + 400, &run.timeline))
        .collect();
    assert!(all_labels.contains("Ada Lovelace"));
    assert!(all_labels.contains("Grace Hopper"));
    assert!(all_labels.contains("Ada Lovelace; Alan Turing"));
    assert_eq!(
        speaker_for_segment("mic", USER, 1_500, 2_500, &run.timeline),
        USER
    );
}

#[test]
#[ignore]
#[serial]
fn live_six_person_compact_huddle_identifies_all_five_remote_speakers_in_order() {
    let fake = FakeSlackGuard::spawn(6, "full-room", "compact", true);
    let run = observe_huddle(fake, Duration::from_secs(35));

    println!("6-person compact: {} polls, {} errors", run.poll_count, run.errors);
    assert!(run.poll_count >= 20);
    assert_eq!(run.mute_sequence, vec![true]);

    let observed = nonempty_transitions(&run.speaker_sequence);
    assert_eq!(
        observed,
        vec![
            vec!["Ada Lovelace".to_string()],
            vec!["Alan Turing".to_string()],
            vec!["Grace Hopper".to_string()],
            vec!["Katherine Johnson".to_string()],
            vec!["Dennis Ritchie".to_string()],
        ],
        "unexpected 6-person speaker sequence"
    );
}

#[test]
#[ignore]
#[serial]
fn live_eight_person_fullscreen_huddle_tracks_all_seven_remotes_overlap_and_mute_flips() {
    let fake = FakeSlackGuard::spawn(8, "eight-person-standup", "full", false);
    let run = observe_huddle(fake, Duration::from_secs(45));

    println!(
        "8-person full-screen: {} polls, {} errors, mutes={:?}",
        run.poll_count, run.errors, run.mute_sequence
    );
    assert!(run.poll_count >= 30);

    // eight-person-standup starts unmuted, flips mute -> true mid-call, then mute -> false.
    assert_eq!(
        run.mute_sequence,
        vec![false, true, false],
        "expected live self_muted transitions [false, true, false]"
    );

    let observed = nonempty_transitions(&run.speaker_sequence);
    // Expected remote speaker transitions:
    // 1. Ada Lovelace
    // 2. Alan Turing
    // 3. Grace Hopper (0.2s quick handoff after Alan)
    // 4. Katherine Johnson (while local user is muted)
    // 5. Dennis Ritchie -> overlap(Dennis Ritchie, Margaret Hamilton) -> Margaret Hamilton (lead=0.8s)
    // 6. Linus Torvalds (after local user unmutes)
    let distinct: BTreeSet<String> = observed.iter().flatten().cloned().collect();
    let expected_all: BTreeSet<String> = [
        "Ada Lovelace",
        "Alan Turing",
        "Grace Hopper",
        "Katherine Johnson",
        "Dennis Ritchie",
        "Margaret Hamilton",
        "Linus Torvalds",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    assert_eq!(
        distinct, expected_all,
        "missing or unexpected remote speaker in 8-person huddle; observed={:?}",
        observed
    );
    assert!(
        observed
            .iter()
            .any(|s| s == &vec!["Dennis Ritchie".to_string(), "Margaret Hamilton".to_string()]),
        "expected simultaneous overlap [Dennis Ritchie, Margaret Hamilton], got {:?}",
        observed
    );
    assert_eq!(
        observed.first(),
        Some(&vec!["Ada Lovelace".to_string()])
    );
    assert_eq!(
        observed.last(),
        Some(&vec!["Linus Torvalds".to_string()])
    );
}

#[test]
#[ignore]
#[serial]
fn live_speaker_watch_thread_drives_timeline_cuts_and_app_mute_on_five_person_huddle() {
    assert!(
        is_trusted(),
        "macOS Accessibility permission is required to run live FakeSlack tests"
    );

    let mut fake = FakeSlackGuard::spawn(5, "quick-handoff", "compact", true);
    let timeline = Arc::new(Mutex::new(SpeakerTimeline::new()));
    let captured_samples = Arc::new(AtomicU64::new(0));
    let speaker_cut = Arc::new(AtomicU64::new(0));
    let sample_rate: u32 = 48_000;
    let sink = SpeakerSink::new(
        timeline.clone(),
        captured_samples.clone(),
        sample_rate,
        speaker_cut.clone(),
    );
    let stop = Arc::new(AtomicBool::new(false));
    let app_mute = AppMute::default();
    let meet_bridge = MeetBridge::new();

    let watch = start_speaker_watch(sink, stop.clone(), meet_bridge, app_mute.clone());
    let start = Instant::now();
    let mut saw_muted = false;

    while fake.is_running() && start.elapsed() < Duration::from_secs(30) {
        let elapsed_samples = (start.elapsed().as_secs_f64() * f64::from(sample_rate)) as u64;
        captured_samples.store(elapsed_samples, Ordering::Relaxed);
        if app_mute.is_muted() {
            saw_muted = true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    stop.store(true, Ordering::Relaxed);
    watch.stop();

    assert!(!fake.is_running(), "FakeSlack quick-handoff did not finish in time");
    assert!(saw_muted, "AppMute never observed muted state from Slack huddle");

    let cuts = speaker_cut.load(Ordering::Acquire);
    let tl = timeline.lock().unwrap();
    println!(
        "SpeakerWatch 5-person quick-handoff: cuts={}, polls={}",
        cuts,
        tl.poll_count()
    );
    // quick-handoff: Ada -> Alan -> Ada = 3 handovers => 3 cuts!
    assert!(cuts >= 3, "expected >= 3 speaker cuts on Ada->Alan->Ada handoff, got {cuts}");

    let total_ms = start.elapsed().as_millis() as u64;
    let labels: BTreeSet<String> = (0..total_ms)
        .step_by(250)
        .map(|t| speaker_for_segment(SYSTEM_STREAM, REMOTE, t, t + 250, &tl))
        .collect();
    assert!(labels.contains("Ada Lovelace"), "missing Ada Lovelace in {labels:?}");
    assert!(labels.contains("Alan Turing"), "missing Alan Turing in {labels:?}");
}
