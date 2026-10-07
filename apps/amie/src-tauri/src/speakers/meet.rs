//! Google Meet in a Chromium browser.
//!
//! Meet's CSS class names are obfuscated and change with every deploy, so
//! nothing here matches one. The tree still carries two stable facts:
//!
//! - Where a participant tile is: a large block of the page that holds a name
//!   label, laid out in a grid next to other such blocks.
//! - That a tile showing speech is a little bigger than the same tile when it
//!   is quiet. Small tiles gain an overlay node, and every tile gains class
//!   tokens on a few elements; the big spotlight tile gains only tokens. Both
//!   are counted, never matched by name, so a renamed class still counts.
//!
//! The second fact is relative: a tile is compared with its own recent past,
//! because a tile with its camera off or a self-view button is bigger than a
//! plain one even when nobody is talking.

use std::collections::{BTreeSet, HashMap, VecDeque};

use super::parse::parse_tile_label;
use super::tree::AxNode;

const MEET_HOST: &str = "meet.google.com";
const MIN_TILE_WIDTH: f64 = 120.0;
const MIN_TILE_HEIGHT: f64 = 80.0;
/// A parent this much larger than its tile is the grid, not part of the tile.
const MAX_TILE_GROWTH: f64 = 1.5;
const MAX_NAME_CHARS: usize = 80;
/// How long a tile's quietest shape is remembered. Longer than a typical
/// monologue, so a speaker who never pauses still reads as the odd one out.
const BASELINE_WINDOW_MS: u64 = 10 * 60 * 1_000;
/// Measured on Meet in Brave (Oct 2026) as nodes plus class tokens, against a
/// plain quiet tile (19 nodes, 34 tokens): speech adds 2-3 on the spotlight
/// tile and 6-7 on grid and picture-in-picture tiles. A camera going off adds
/// about 19, and the self-view controls opening add more than 30. Larger
/// jumps stay in the baseline instead of reading as speech.
const MAX_INDICATOR_DELTA: usize = 10;
/// The page can drop out of the tree for a while when the tab is in the
/// background. Baselines survive a gap this short. After a longer one the
/// next page is probably another call, so they start over.
const SESSION_GAP_MS: u64 = 30 * 1_000;
/// With this many tiles or more, every tile gaining nodes in the same poll is
/// a re-layout, not everyone talking at once.
const RELAYOUT_MIN_TILES: usize = 3;

/// The page of an in-call Meet tab. The lobby (`meet.google.com/`) and the
/// landing pages have no room code and are skipped.
pub fn find_page(root: &AxNode) -> Option<&AxNode> {
    if root.role == "AXWebArea" && root.url.as_deref().is_some_and(is_meet_room_url) {
        return Some(root);
    }
    root.children.iter().find_map(find_page)
}

/// `https://meet.google.com/abc-defg-hij?authuser=0`
fn is_meet_room_url(url: &str) -> bool {
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return false;
    };
    let Some((host, path)) = rest.split_once('/') else {
        return false;
    };
    if !host.eq_ignore_ascii_case(MEET_HOST) {
        return false;
    }
    let code = path.split(['?', '#', '/']).next().unwrap_or("");
    is_room_code(code)
}

/// Three, four and three lowercase letters. Custom nicknames do not match and
/// are not read.
fn is_room_code(code: &str) -> bool {
    let parts: Vec<&str> = code.split('-').collect();
    parts.len() == 3
        && [3, 4, 3].iter().zip(&parts).all(|(len, part)| {
            part.len() == *len && part.bytes().all(|byte| byte.is_ascii_lowercase())
        })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tile {
    pub name: String,
    /// Nodes in the tile's subtree.
    pub nodes: usize,
    /// Class tokens across the tile's subtree.
    pub tokens: usize,
}

impl Tile {
    /// What the speaking indicator moves: nodes plus class tokens.
    fn level(&self) -> usize {
        self.nodes + self.tokens
    }
}

/// Participant tiles on a Meet page, in tree order.
pub fn tiles(page: &AxNode) -> Vec<Tile> {
    let mut scan = scan(page);
    if let Some(candidate) = scan.candidate.take() {
        scan.tiles.push(candidate.into_tile());
    }
    scan.tiles
}

struct Candidate {
    name: String,
    nodes: usize,
    tokens: usize,
    area: f64,
}

impl Candidate {
    fn into_tile(self) -> Tile {
        Tile {
            name: self.name,
            nodes: self.nodes,
            tokens: self.tokens,
        }
    }
}

#[derive(Default)]
struct Scan {
    nodes: usize,
    tokens: usize,
    labels: usize,
    first_label: Option<String>,
    /// The tile this subtree would become if its parent holds other tiles.
    candidate: Option<Candidate>,
    /// Labels from several children met somewhere below, so this subtree is
    /// a grid or a toolbar and no ancestor may grow into a tile from it.
    closed: bool,
    tiles: Vec<Tile>,
}

/// Walk bottom-up. A subtree with one name label is a tile candidate and
/// grows while its parent is about the same size and still holds only that
/// label. A parent holding labels from several children is the grid, and
/// closes each child's candidate as a tile.
fn scan(node: &AxNode) -> Scan {
    let mut out = Scan {
        nodes: 1,
        tokens: node.classes.len(),
        ..Scan::default()
    };
    if let Some(label) = name_label(node) {
        out.labels = 1;
        out.first_label = Some(label);
    }

    let mut carriers = Vec::new();
    for child in &node.children {
        let mut result = scan(child);
        out.nodes += result.nodes;
        out.tokens += result.tokens;
        out.tiles.append(&mut result.tiles);
        out.closed |= result.closed;
        if result.labels > 0 {
            out.labels += result.labels;
            if out.first_label.is_none() {
                out.first_label = result.first_label.clone();
            }
            carriers.push(result);
        }
    }

    match carriers.len() {
        0 => {}
        1 if !out.closed && out.labels == carriers[0].labels => {
            let mut carrier = carriers.pop().expect("one carrier");
            out.candidate = carrier.candidate.take();
            if node.width >= MIN_TILE_WIDTH && node.height >= MIN_TILE_HEIGHT {
                let area = node.width * node.height;
                let grows = out
                    .candidate
                    .as_ref()
                    .is_none_or(|current| area <= current.area * MAX_TILE_GROWTH);
                if grows {
                    out.candidate = out.first_label.clone().map(|name| Candidate {
                        name,
                        nodes: out.nodes,
                        tokens: out.tokens,
                        area,
                    });
                }
            }
        }
        _ => {
            out.closed = true;
            for carrier in carriers {
                if let Some(candidate) = carrier.candidate {
                    out.tiles.push(candidate.into_tile());
                }
            }
        }
    }
    out
}

fn name_label(node: &AxNode) -> Option<String> {
    if node.role != "AXStaticText" {
        return None;
    }
    let text = node.value.as_deref()?.trim();
    if text.is_empty() || text.chars().count() > MAX_NAME_CHARS {
        return None;
    }
    Some(text.to_string())
}

/// Remembers each tile's quietest recent shape across polls.
#[derive(Default)]
pub struct MeetTracker {
    tiles: HashMap<String, Baseline>,
    last_observed: Option<u64>,
    /// The local user's display name, when known. Meet labels the self tile
    /// with that name, not "You", and nothing else in the tree marks it.
    self_name: Option<String>,
}

impl MeetTracker {
    pub fn with_self_name(self_name: Option<String>) -> Self {
        Self {
            tiles: HashMap::new(),
            last_observed: None,
            self_name: self_name.map(|name| name.trim().to_lowercase()),
        }
    }

    fn is_self(&self, name: &str) -> bool {
        parse_tile_label(name).is_some_and(|label| label.is_self)
            || self
                .self_name
                .as_deref()
                .is_some_and(|me| !me.is_empty() && name.trim().to_lowercase() == me)
    }

    /// Names of the remote participants whose tile is currently bigger than
    /// its own recent quietest shape. `at_ms` is any monotonic clock.
    pub fn observe(&mut self, page: &AxNode, at_ms: u64) -> BTreeSet<String> {
        if self
            .last_observed
            .is_some_and(|last| at_ms.saturating_sub(last) > SESSION_GAP_MS)
        {
            self.tiles.clear();
        }
        self.last_observed = Some(at_ms);
        let tiles = tiles(page);
        let mut elevated = Vec::new();
        for tile in &tiles {
            let baseline = self.tiles.entry(tile.name.clone()).or_default();
            baseline.push(at_ms, tile.level());
            if baseline.is_elevated(tile.level()) {
                elevated.push(tile);
            }
        }
        self.tiles.retain(|_, baseline| baseline.seen_within(at_ms));

        if tiles.len() >= RELAYOUT_MIN_TILES && elevated.len() == tiles.len() {
            return BTreeSet::new();
        }
        elevated
            .into_iter()
            .filter(|tile| !self.is_self(&tile.name))
            .map(|tile| tile.name.clone())
            .collect()
    }
}

/// Sliding-window minimum of one tile's level.
#[derive(Default)]
struct Baseline {
    /// Strictly increasing levels, oldest first. The front is the minimum.
    window: VecDeque<(u64, usize)>,
    last_seen: u64,
}

impl Baseline {
    fn push(&mut self, at_ms: u64, level: usize) {
        self.last_seen = at_ms;
        while self.window.back().is_some_and(|(_, seen)| *seen >= level) {
            self.window.pop_back();
        }
        self.window.push_back((at_ms, level));
        let cutoff = at_ms.saturating_sub(BASELINE_WINDOW_MS);
        while self.window.front().is_some_and(|(at, _)| *at < cutoff) {
            self.window.pop_front();
        }
    }

    fn is_elevated(&self, level: usize) -> bool {
        let Some((_, quiet)) = self.window.front() else {
            return false;
        };
        level > *quiet && level - *quiet <= MAX_INDICATOR_DELTA
    }

    fn seen_within(&self, at_ms: u64) -> bool {
        at_ms.saturating_sub(self.last_seen) <= BASELINE_WINDOW_MS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> AxNode {
        AxNode::new("AXStaticText").valued(value).frame(100.0, 22.0)
    }

    fn group(width: f64, height: f64) -> AxNode {
        AxNode::new("AXGroup").frame(width, height)
    }

    /// A tile shaped like Meet's: a few empty overlay groups, a name bar and
    /// an optional speaking overlay, wrapped in several same-sized layers.
    /// Class names are deliberately absent: the reader must not need them.
    fn tile(name: &str, speaking: bool, extra: usize) -> AxNode {
        let mut body = group(500.0, 280.0)
            .child(group(500.0, 280.0))
            .child(group(500.0, 280.0));
        if speaking {
            body = body.child(group(500.0, 280.0));
        }
        for _ in 0..extra {
            body = body.child(group(80.0, 80.0));
        }
        let body = body.child(
            group(500.0, 39.0).child(group(120.0, 34.0).child(group(110.0, 27.0).child(text(name)))),
        );
        group(500.0, 280.0).child(group(500.0, 280.0).child(body))
    }

    /// The spotlight tile: speaking adds no node, only a class token on a few
    /// existing elements. The token names are made up; any would do.
    fn spotlight(name: &str, speaking: bool) -> AxNode {
        let marked = |node: AxNode| {
            if speaking {
                node.classes(["base", "x7Kq"])
            } else {
                node.classes(["base"])
            }
        };
        let body = group(1100.0, 580.0)
            .child(marked(group(1100.0, 580.0)))
            .child(marked(group(30.0, 30.0)))
            .child(marked(group(1100.0, 580.0)))
            .child(
                group(1100.0, 49.0).child(group(110.0, 39.0).child(group(93.0, 27.0).child(text(name)))),
            );
        group(1100.0, 580.0).child(group(1100.0, 580.0).child(body))
    }

    fn page(tiles: Vec<AxNode>) -> AxNode {
        let mut grid = group(1460.0, 580.0);
        for tile in tiles {
            grid = grid.child(tile);
        }
        let header = group(1500.0, 54.0)
            .child(text("10:35"))
            .child(text("AM"))
            .child(text("Daily check-in"));
        let controls = group(700.0, 140.0).child(AxNode::new("AXButton").titled("Leave call").frame(80.0, 54.0));
        AxNode::new("AXWebArea")
            .at_url("https://meet.google.com/abc-defg-hij?authuser=0")
            .frame(1500.0, 800.0)
            .child(group(1500.0, 800.0).child(header).child(grid).child(controls))
    }

    fn names(tiles: &[Tile]) -> Vec<&str> {
        tiles.iter().map(|tile| tile.name.as_str()).collect()
    }

    #[test]
    fn only_in_call_meet_pages_are_read() {
        let in_call = |url: &str| {
            AxNode::new("AXWebArea")
                .at_url(url)
                .child(AxNode::new("AXGroup"))
        };
        assert!(find_page(&in_call("https://meet.google.com/abc-defg-hij")).is_some());
        assert!(find_page(&in_call("https://meet.google.com/abc-defg-hij?authuser=1")).is_some());
        assert!(find_page(&in_call("https://meet.google.com/")).is_none());
        assert!(find_page(&in_call("https://meet.google.com/landing")).is_none());
        assert!(find_page(&in_call("https://docs.google.com/abc-defg-hij")).is_none());
        assert!(find_page(&in_call("https://notmeet.google.com.evil.test/abc-defg-hij")).is_none());
    }

    #[test]
    fn tiles_are_the_grid_blocks_and_chrome_text_is_not_a_tile() {
        let root = page(vec![
            tile("Ada Lovelace", false, 0),
            tile("Bob", false, 0),
            tile("Pavel", false, 0),
        ]);
        assert_eq!(names(&tiles(&root)), vec!["Ada Lovelace", "Bob", "Pavel"]);
    }

    #[test]
    fn one_extra_node_marks_the_speaker_and_a_quiet_tile_is_not() {
        let mut tracker = MeetTracker::default();
        let quiet = page(vec![
            tile("Ada Lovelace", false, 0),
            tile("Bob", false, 0),
            tile("Pavel", false, 0),
        ]);
        assert!(tracker.observe(&quiet, 0).is_empty());

        let ada = page(vec![
            tile("Ada Lovelace", true, 0),
            tile("Bob", false, 0),
            tile("Pavel", false, 0),
        ]);
        assert_eq!(
            tracker.observe(&ada, 1_000).into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );

        let bob = page(vec![
            tile("Ada Lovelace", false, 0),
            tile("Bob", true, 0),
            tile("Pavel", false, 0),
        ]);
        assert_eq!(
            tracker.observe(&bob, 2_000).into_iter().collect::<Vec<_>>(),
            vec!["Bob"]
        );
    }

    #[test]
    fn a_tile_that_is_larger_for_other_reasons_is_not_the_speaker() {
        // Ada's camera is off, which adds avatar nodes. Same count every poll.
        let mut tracker = MeetTracker::default();
        let steady = page(vec![
            tile("Ada Lovelace", false, 4),
            tile("Bob", false, 0),
            tile("Pavel", false, 0),
        ]);
        for at in 0..5 {
            assert!(tracker.observe(&steady, at * 1_000).is_empty());
        }
    }

    #[test]
    fn a_camera_turning_on_adds_too_much_to_read_as_speech() {
        let mut tracker = MeetTracker::default();
        let off = page(vec![tile("Ada Lovelace", false, 0), tile("Bob", false, 0), tile("Pavel", false, 0)]);
        tracker.observe(&off, 0);
        let on = page(vec![tile("Ada Lovelace", false, 12), tile("Bob", false, 0), tile("Pavel", false, 0)]);
        assert!(tracker.observe(&on, 1_000).is_empty());
    }

    #[test]
    fn a_speaker_who_never_pauses_is_found_once_the_window_has_a_quiet_poll() {
        let mut tracker = MeetTracker::default();
        let quiet = page(vec![tile("Ada Lovelace", false, 0), tile("Bob", false, 0), tile("Pavel", false, 0)]);
        let ada = page(vec![tile("Ada Lovelace", true, 0), tile("Bob", false, 0), tile("Pavel", false, 0)]);
        tracker.observe(&quiet, 0);
        for at in 1..=100 {
            assert_eq!(
                tracker.observe(&ada, at * 1_000).into_iter().collect::<Vec<_>>(),
                vec!["Ada Lovelace"]
            );
        }
    }

    #[test]
    fn everyone_gaining_nodes_at_once_is_a_relayout() {
        let mut tracker = MeetTracker::default();
        let before = page(vec![tile("Ada Lovelace", false, 0), tile("Bob", false, 0), tile("Pavel", false, 0)]);
        tracker.observe(&before, 0);
        let after = page(vec![tile("Ada Lovelace", true, 0), tile("Bob", true, 0), tile("Pavel", true, 0)]);
        assert!(tracker.observe(&after, 1_000).is_empty());
    }

    #[test]
    fn a_spotlight_tile_that_only_changes_class_tokens_is_still_the_speaker() {
        let mut tracker = MeetTracker::default();
        let quiet = page(vec![spotlight("Ada Lovelace", false)]);
        assert!(tracker.observe(&quiet, 0).is_empty());
        let talking = page(vec![spotlight("Ada Lovelace", true)]);
        assert_eq!(
            tracker.observe(&talking, 1_000).into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );
        assert!(tracker.observe(&quiet, 2_000).is_empty());
    }

    #[test]
    fn the_users_own_name_marks_the_self_tile() {
        let mut tracker = MeetTracker::with_self_name(Some("Pavel Svitek".into()));
        let quiet = page(vec![tile("Ada Lovelace", false, 0), tile("Pavel Svitek", false, 0)]);
        tracker.observe(&quiet, 0);
        let me = page(vec![tile("Ada Lovelace", false, 0), tile("pavel svitek", true, 0)]);
        assert!(tracker.observe(&me, 1_000).is_empty());
        let ada = page(vec![tile("Ada Lovelace", true, 0), tile("Pavel Svitek", false, 0)]);
        assert_eq!(
            tracker.observe(&ada, 2_000).into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );
    }

    #[test]
    fn the_local_user_is_never_reported() {
        let mut tracker = MeetTracker::default();
        let quiet = page(vec![tile("Ada Lovelace", false, 0), tile("Pavel (You)", false, 0)]);
        tracker.observe(&quiet, 0);
        let me = page(vec![tile("Ada Lovelace", false, 0), tile("Pavel (You)", true, 0)]);
        assert!(tracker.observe(&me, 1_000).is_empty());
    }

    #[test]
    fn a_short_gap_keeps_baselines_and_a_long_one_starts_over() {
        let quiet = page(vec![tile("Ada Lovelace", false, 0), tile("Bob", false, 0), tile("Pavel", false, 0)]);
        let ada = page(vec![tile("Ada Lovelace", true, 0), tile("Bob", false, 0), tile("Pavel", false, 0)]);

        let mut tracker = MeetTracker::default();
        tracker.observe(&quiet, 0);
        // The tab was hidden for 15 s. Ada is mid-monologue when it returns.
        assert_eq!(
            tracker.observe(&ada, 15_000).into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );

        let mut tracker = MeetTracker::default();
        tracker.observe(&quiet, 0);
        // Gone for two minutes: another call, so there is no baseline yet.
        assert!(tracker.observe(&ada, 120_000).is_empty());
    }

    #[test]
    fn old_baselines_expire_so_a_changed_tile_becomes_the_new_normal() {
        let mut baseline = Baseline::default();
        baseline.push(0, 19);
        assert!(baseline.is_elevated(20));
        baseline.push(BASELINE_WINDOW_MS + 1, 20);
        assert!(!baseline.is_elevated(20));
    }
}
