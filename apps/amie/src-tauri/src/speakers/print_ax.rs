//! `amie --print-ax <pid|bundle-id> --out <file> [--samples N] [--interval-ms M]`
//!
//! Dumps another app's accessibility tree to a file, so a meeting app's
//! speaking signal can be inspected with the same Accessibility grant the
//! speaker reader uses. Launch it through the dev bundle (`open -a`), not from
//! a shell: macOS attributes a shell child to the terminal, which has no grant.

use std::time::Duration;

use super::meet::{self, MeetTracker};
use super::meeting::read_tree;
use super::permission::is_trusted;

struct Request {
    target: String,
    out: String,
    samples: u32,
    interval: Duration,
    /// Print what the Meet reader reports instead of the whole tree.
    speakers: bool,
}

/// `Some(exit code)` when `--print-ax` was given, so `main` can stop before
/// starting the app. Failures are written to the output file as well, because
/// a LaunchServices child has no terminal.
pub fn run_if_requested(args: impl Iterator<Item = String>) -> Option<i32> {
    let args: Vec<String> = args.collect();
    if !args.iter().any(|arg| arg == "--print-ax") {
        return None;
    }
    let request = match parse(&args) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("{error}");
            return Some(2);
        }
    };
    let report = run(&request);
    if let Err(error) = std::fs::write(&request.out, &report) {
        eprintln!("Could not write {}: {error}", request.out);
        return Some(1);
    }
    Some(0)
}

fn parse(args: &[String]) -> Result<Request, String> {
    let mut target = None;
    let mut out = None;
    let mut samples = 1;
    let mut interval = Duration::from_millis(2_000);
    let mut speakers = false;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let mut value = |name: &str| {
            iter.next()
                .cloned()
                .ok_or_else(|| format!("{name} needs a value"))
        };
        match arg.as_str() {
            "--print-ax" => target = Some(value("--print-ax")?),
            "--out" => out = Some(value("--out")?),
            "--speakers" => speakers = true,
            "--samples" => {
                samples = value("--samples")?
                    .parse()
                    .map_err(|_| "--samples must be a number".to_string())?
            }
            "--interval-ms" => {
                interval = Duration::from_millis(
                    value("--interval-ms")?
                        .parse()
                        .map_err(|_| "--interval-ms must be a number".to_string())?,
                )
            }
            _ => {}
        }
    }
    Ok(Request {
        target: target.ok_or("--print-ax needs a pid or bundle id")?,
        out: out.ok_or("--print-ax needs --out <file>")?,
        samples,
        interval,
        speakers,
    })
}

fn run(request: &Request) -> String {
    let mut report = format!("accessibility trusted: {}\n", is_trusted());
    let mut tracker = MeetTracker::with_self_name(super::meeting::local_user_name());
    let started = std::time::Instant::now();
    for sample in 0..request.samples {
        if sample > 0 {
            std::thread::sleep(request.interval);
        }
        report.push_str(&format!("\n=== sample {sample} ===\n"));
        match read_tree(&request.target) {
            Ok(tree) if request.speakers => report.push_str(&meet_summary(&tree, &mut tracker, started)),
            Ok(tree) => report.push_str(&tree.dump()),
            Err(error) => report.push_str(&format!("error: {error}\n")),
        }
    }
    report
}

fn meet_summary(
    tree: &super::tree::AxNode,
    tracker: &mut MeetTracker,
    started: std::time::Instant,
) -> String {
    let Some(page) = meet::find_page(tree) else {
        return "no Meet call page\n".into();
    };
    let at_ms = started.elapsed().as_millis() as u64;
    let speakers = tracker.observe(page, at_ms);
    let tiles: Vec<String> = meet::tiles(page)
        .iter()
        .map(|tile| format!("{}:{}/{}", tile.name, tile.nodes, tile.tokens))
        .collect();
    format!("tiles: {}\nspeakers: {:?}\n", tiles.join(" | "), speakers)
}
