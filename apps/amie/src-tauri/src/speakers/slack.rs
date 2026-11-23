use std::collections::{BTreeMap, BTreeSet};

use super::parse::parse_tile_label;
use super::tree::AxNode;

const WEB_VIEW: &str = "RenderWidgetHostViewCocoa";
const HUDDLE_VIEW: &str = "p-view_contents--huddle";
const HUDDLE_GRID: &str = "p-huddle_grid_component";
const PEER_TILE: &str = "p-huddle_peer_tile";
const ACTIVE_SPEAKER_OVERLAY: &str = "p-huddle_peer_tile__overlay--active_speaker";
const MIC_OVERLAY: &str = "p-huddle_peer_tile__mic_overlay";
const TILE_DESCRIPTION_SUFFIX: &str = "-a11y_huddle_peer_tile_description";

/// What a Slack accessibility walk found.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SlackRead {
    /// Set when a window is still a closed Electron web view. The live reader
    /// must set `AXManualAccessibility` or the tree stays empty.
    pub requested_manual_accessibility: bool,
    /// True when the tree contains an active Slack Huddle view, rather than
    /// only an idle Slack workspace window.
    pub in_huddle: bool,
    /// Remote participant display names currently marked as active speaker.
    pub speakers: BTreeSet<String>,
    /// Remote participant display names visible in the huddle grid.
    pub present: BTreeSet<String>,
    /// Local user's mic mute state in the huddle, `None` when not in a huddle
    /// or the toolbar/tile does not report it.
    pub self_muted: Option<bool>,
}

pub fn read(root: &AxNode) -> SlackRead {
    let mut requested_manual_accessibility = false;
    let mut in_huddle = false;
    let mut tiles: BTreeMap<String, PeerTile> = BTreeMap::new();
    let mut descriptions: BTreeMap<String, String> = BTreeMap::new();
    let mut fallback_tile_counter: usize = 0;

    walk(
        root,
        &mut requested_manual_accessibility,
        &mut in_huddle,
        &mut tiles,
        &mut descriptions,
        &mut fallback_tile_counter,
    );

    if !in_huddle {
        return SlackRead {
            requested_manual_accessibility,
            in_huddle: false,
            speakers: BTreeSet::new(),
            present: BTreeSet::new(),
            self_muted: None,
        };
    }

    let mut speakers = BTreeSet::new();
    let mut present = BTreeSet::new();
    let mut self_tile_muted: Option<bool> = None;

    for tile in tiles.values() {
        if tile.is_self {
            if tile.muted_overlay {
                self_tile_muted = Some(true);
            } else if let Some(dom_id) = tile.dom_id.as_deref() {
                if let Some(desc) = descriptions.get(dom_id) {
                    let lower = desc.to_lowercase();
                    if lower.contains("muted") {
                        self_tile_muted = Some(true);
                    } else if lower.contains("audio") || lower.contains("video") {
                        self_tile_muted = Some(false);
                    }
                }
            }
            continue;
        }
        present.insert(tile.name.clone());
        if tile.speaking {
            speakers.insert(tile.name.clone());
        }
    }

    let self_muted = toolbar_mic_muted(root).or(self_tile_muted);

    SlackRead {
        requested_manual_accessibility,
        in_huddle: true,
        speakers,
        present,
        self_muted,
    }
}

#[derive(Debug)]
struct PeerTile {
    dom_id: Option<String>,
    name: String,
    is_self: bool,
    speaking: bool,
    muted_overlay: bool,
}

fn walk(
    node: &AxNode,
    requested_manual_accessibility: &mut bool,
    in_huddle: &mut bool,
    tiles: &mut BTreeMap<String, PeerTile>,
    descriptions: &mut BTreeMap<String, String>,
    fallback_tile_counter: &mut usize,
) {
    if is_closed_web_view(node) {
        *requested_manual_accessibility = true;
        return;
    }

    if has_class(node, HUDDLE_VIEW)
        || has_class(node, HUDDLE_GRID)
        || has_class(node, PEER_TILE)
    {
        *in_huddle = true;
    }

    if let Some(dom_id) = node.dom_id.as_deref() {
        if let Some(cell_id) = dom_id.strip_suffix(TILE_DESCRIPTION_SUFFIX) {
            if let Some(text) = first_static_text(node) {
                descriptions.insert(cell_id.to_string(), text);
            }
        }
    }

    if node.role == "AXCell" && has_class(node, PEER_TILE) {
        if let Some(tile) = peer_tile_from(node) {
            let key = tile.dom_id.clone().unwrap_or_else(|| {
                *fallback_tile_counter += 1;
                format!("anon:{}:{}", tile.name, *fallback_tile_counter)
            });
            // Chromium exposes every AXTable cell under both AXRow and
            // AXColumn. Merge duplicates by DOM id so a speaking or muted
            // signal on either copy is preserved.
            tiles
                .entry(key)
                .and_modify(|existing| {
                    existing.speaking |= tile.speaking;
                    existing.muted_overlay |= tile.muted_overlay;
                    existing.is_self |= tile.is_self;
                })
                .or_insert(tile);
        }
        return;
    }

    for child in &node.children {
        walk(
            child,
            requested_manual_accessibility,
            in_huddle,
            tiles,
            descriptions,
            fallback_tile_counter,
        );
    }
}

fn peer_tile_from(node: &AxNode) -> Option<PeerTile> {
    let raw = node
        .title
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| node.description.as_deref().filter(|s| !s.trim().is_empty()))?;
    let (name, label_is_self) = parse_peer_name(raw)?;
    let dom_id = node.dom_id.clone();
    let is_self = dom_id
        .as_deref()
        .is_some_and(|id| id.contains("-self_"))
        || label_is_self;
    let speaking = has_class_in_tree(node, ACTIVE_SPEAKER_OVERLAY);
    let muted_overlay = !speaking && has_muted_mic_overlay(node);
    Some(PeerTile {
        dom_id,
        name,
        is_self,
        speaking,
        muted_overlay,
    })
}

/// Extract a participant's display name from Slack's tile label
/// (`"View Pavel Svitek's profile"`, `"View Dennis' profile"`, etc.).
fn parse_peer_name(raw: &str) -> Option<(String, bool)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(name) = strip_view_profile(trimmed) {
        let is_self = parse_tile_label(&name).is_some_and(|label| label.is_self);
        let clean = parse_tile_label(&name)
            .map(|label| label.name)
            .unwrap_or(name);
        if clean.is_empty() || is_chrome(&clean) {
            return None;
        }
        return Some((clean, is_self));
    }
    let parsed = parse_tile_label(trimmed)?;
    if parsed.name.is_empty() || is_chrome(&parsed.name) {
        return None;
    }
    Some((parsed.name, parsed.is_self))
}

fn strip_view_profile(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    if !lower.starts_with("view ") {
        return None;
    }
    let after_view = &text[5..];
    let after_lower = after_view.to_lowercase();
    for suffix in ["'s profile", "\u{2019}s profile", "' profile", "\u{2019} profile"] {
        if after_lower.ends_with(suffix) {
            let cut = after_view.len() - suffix.len();
            let name = after_view[..cut].trim();
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// Local microphone mute state from the `"Huddles actions"` toolbar button.
///
/// Matches `"Unmute microphone"` (`Some(true)`) and `"Mute microphone"`
/// (`Some(false)`). Scoped to the `"Huddles actions"` toolbar so channel
/// notification buttons (`"Mute conversation"`) are never mistaken for mic state.
fn toolbar_mic_muted(node: &AxNode) -> Option<bool> {
    if node.role == "AXToolbar" && is_huddles_actions_toolbar(node) {
        if let Some(state) = find_mic_button_muted(node) {
            return Some(state);
        }
    }
    node.children.iter().find_map(toolbar_mic_muted)
}

fn is_huddles_actions_toolbar(node: &AxNode) -> bool {
    [node.title.as_deref(), node.description.as_deref()]
        .into_iter()
        .flatten()
        .any(|label| label.trim().eq_ignore_ascii_case("huddles actions"))
}

fn find_mic_button_muted(node: &AxNode) -> Option<bool> {
    if node.role == "AXButton" {
        for raw in [node.title.as_deref(), node.description.as_deref()]
            .into_iter()
            .flatten()
        {
            let lower = raw.trim().to_lowercase();
            if lower.starts_with("unmute microphone") || lower.starts_with("unmute mic") {
                return Some(true);
            }
            if lower.starts_with("mute microphone") || lower.starts_with("mute mic") {
                return Some(false);
            }
        }
    }
    node.children.iter().find_map(find_mic_button_muted)
}

fn has_muted_mic_overlay(node: &AxNode) -> bool {
    if has_class(node, MIC_OVERLAY) && !has_class(node, ACTIVE_SPEAKER_OVERLAY) {
        return true;
    }
    node.children.iter().any(has_muted_mic_overlay)
}

fn has_class(node: &AxNode, want: &str) -> bool {
    node.classes.iter().any(|item| item == want)
}

fn has_class_in_tree(node: &AxNode, want: &str) -> bool {
    has_class(node, want) || node.children.iter().any(|child| has_class_in_tree(child, want))
}

fn first_static_text(node: &AxNode) -> Option<String> {
    if node.role == "AXStaticText" {
        if let Some(value) = node.value.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            return Some(value.to_string());
        }
    }
    node.children.iter().find_map(first_static_text)
}

fn is_chrome(name: &str) -> bool {
    matches!(
        name.trim().to_lowercase().as_str(),
        "slack" | "huddle" | "gallery" | "header" | "leave huddle" | "you"
    )
}

fn is_web_view(node: &AxNode) -> bool {
    node.role.contains(WEB_VIEW)
        || node
            .title
            .as_deref()
            .is_some_and(|title| title.contains(WEB_VIEW))
        || node
            .description
            .as_deref()
            .is_some_and(|description| description.contains(WEB_VIEW))
}

fn is_closed_web_view(node: &AxNode) -> bool {
    is_web_view(node) && node.children.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speakers::tree::AxNode;

    fn peer_cell(name: &str, dom_id: &str, speaking: bool, muted: bool, full_mode: bool) -> AxNode {
        let label = format!("View {name}'s profile");
        let mut cell = AxNode::new("AXCell")
            .titled(&label)
            .described(&label)
            .id(dom_id)
            .classes([PEER_TILE])
            .frame(150.0, 150.0);

        if muted {
            let classes: Vec<&str> = if full_mode {
                vec![MIC_OVERLAY]
            } else {
                vec![MIC_OVERLAY, "p-huddle_peer_tile__overlay--compact"]
            };
            cell = cell.child(
                AxNode::new("AXGroup").classes(classes).child(
                    AxNode::new("AXGroup").classes([
                        "micIcon__XE9Cj",
                        "micIconContainer___DE57",
                        "p-huddle_mic_icon",
                    ]),
                ),
            );
        } else if speaking {
            let classes: Vec<&str> = if full_mode {
                vec![MIC_OVERLAY, ACTIVE_SPEAKER_OVERLAY]
            } else {
                vec![
                    MIC_OVERLAY,
                    ACTIVE_SPEAKER_OVERLAY,
                    "p-huddle_peer_tile__overlay--compact",
                ]
            };
            cell = cell.child(
                AxNode::new("AXGroup")
                    .classes(classes)
                    .child(AxNode::new("AXGroup").classes(["micIcon__XE9Cj", "micIconContainer___DE57"])),
            );
        }

        if full_mode {
            let mut classes = vec![
                "c-button-unstyled",
                "p-huddle_peer_tile__name_overlay",
                if muted {
                    "p-huddle_peer_tile__name_overlay--muted"
                } else {
                    "p-huddle_peer_tile__name_overlay--unmuted"
                },
            ];
            if speaking && !muted {
                classes.push(ACTIVE_SPEAKER_OVERLAY);
            }
            cell = cell.child(
                AxNode::new("AXButton")
                    .titled("video is off, audio is on")
                    .described("video is off, audio is on")
                    .classes(classes),
            );
        }

        cell.child(AxNode::new("AXGroup").classes(["p-huddle_peer_tile__activity_icons_container"]))
    }

    fn peer_entry(name: &str, dom_id: &str, speaking: bool, muted: bool, full_mode: bool) -> (AxNode, AxNode) {
        let cell = peer_cell(name, dom_id, speaking, muted, full_mode);
        let row = AxNode::new("AXRow")
            .titled(format!("View {name}'s profile"))
            .classes(["p-bp__grid_row", "offscreen"])
            .child(cell);
        let desc = AxNode::new("AXGroup").child(
            AxNode::new("AXGroup")
                .id(format!("{dom_id}{TILE_DESCRIPTION_SUFFIX}"))
                .classes(["offscreen"])
                .child(AxNode::new("AXStaticText").valued(if muted { "Audio, Muted" } else { "Audio" })),
        );
        (row, desc)
    }

    fn huddle_window(
        participants: &[(&str, &str, bool, bool)],
        local_muted: bool,
        full_mode: bool,
        duplicate_column: bool,
    ) -> AxNode {
        let mut grid = AxNode::new("AXGroup").classes(["p-huddle_grid_component__grid"]);
        let mut column = AxNode::new("AXColumn");
        for &(name, dom_id, speaking, muted) in participants {
            let (row, desc) = peer_entry(name, dom_id, speaking, muted, full_mode);
            grid = grid.child(row).child(desc);
            if duplicate_column {
                column = column.child(peer_cell(name, dom_id, speaking, muted, full_mode));
            }
        }
        let mut table = AxNode::new("AXTable").classes([HUDDLE_GRID]).child(grid);
        if duplicate_column {
            table = table.child(column);
        }

        let mic_label = if local_muted {
            "Unmute microphone"
        } else {
            "Mute microphone"
        };
        let toolbar = AxNode::new("AXToolbar")
            .titled("Huddles actions")
            .described("Huddles actions")
            .child(AxNode::new("AXButton").titled(mic_label).described(mic_label))
            .child(AxNode::new("AXButton").titled("Leave Huddle").described("Leave Huddle"));

        let footer = AxNode::new("AXGroup")
            .classes([if full_mode { "footerTarget__vxx2n" } else { "p-huddle_footer" }])
            .child(toolbar);

        AxNode::new("AXWindow")
            .titled("#general - Workspace - Slack")
            .child(
                AxNode::new("AXWebArea").child(
                    AxNode::new("AXGroup")
                        .classes(["p-view_contents", HUDDLE_VIEW])
                        .child(table)
                        .child(footer),
                ),
            )
    }

    #[test]
    fn closed_web_view_requests_manual_accessibility() {
        let root = AxNode::new("AXWindow").titled("Slack").child(
            AxNode::new("AXGroup")
                .titled("RenderWidgetHostViewCocoa")
                .frame(800.0, 600.0),
        );
        let result = read(&root);
        assert!(result.requested_manual_accessibility);
        assert!(!result.in_huddle);
        assert!(result.speakers.is_empty());
        assert_eq!(result.self_muted, None);
    }

    #[test]
    fn idle_slack_workspace_without_huddle_is_ignored_including_mute_conversation() {
        let root = AxNode::new("AXWindow")
            .titled("general (Channel) - Workspace - Slack [Main]")
            .child(
                AxNode::new("AXWebArea")
                    .child(
                        AxNode::new("AXToolbar")
                            .titled("Primary view actions")
                            .child(AxNode::new("AXCheckBox").described("Mute conversation"))
                            .child(AxNode::new("AXButton").described("Start huddle")),
                    ),
            );
        let result = read(&root);
        assert!(!result.in_huddle);
        assert!(result.speakers.is_empty());
        assert!(result.present.is_empty());
        assert_eq!(result.self_muted, None);
    }

    #[test]
    fn compact_huddle_identifies_active_remote_speaker_and_excludes_self() {
        let root = huddle_window(
            &[
                ("Pavel Svitek", "huddle-grid-gridcell-self_U0566T6BP0S", true, false),
                ("Ada Lovelace", "huddle-grid-gridcell-U01ADALOV", true, false),
                ("Alan Turing", "huddle-grid-gridcell-U02ALANTU", false, false),
                ("Grace Hopper", "huddle-grid-gridcell-U03GRACEH", false, true),
            ],
            false,
            false,
            true,
        );
        let result = read(&root);
        assert!(result.in_huddle);
        assert_eq!(
            result.speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );
        assert_eq!(
            result.present.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace", "Alan Turing", "Grace Hopper"]
        );
        assert_eq!(result.self_muted, Some(false));
    }

    #[test]
    fn muted_overlay_is_never_mistaken_for_active_speaker() {
        let root = huddle_window(
            &[
                ("Pavel Svitek", "huddle-grid-gridcell-self_U0566T6BP0S", false, true),
                ("Ada Lovelace", "huddle-grid-gridcell-U01ADALOV", false, true),
                ("Alan Turing", "huddle-grid-gridcell-U02ALANTU", false, false),
            ],
            true,
            false,
            true,
        );
        let result = read(&root);
        assert!(result.in_huddle);
        assert!(result.speakers.is_empty());
        assert_eq!(result.self_muted, Some(true));
    }

    #[test]
    fn full_screen_huddle_and_eight_participants_with_overlap() {
        let root = huddle_window(
            &[
                ("Pavel Svitek", "huddle-grid-gridcell-self_U0566T6BP0S", false, true),
                ("Ada Lovelace", "huddle-grid-gridcell-U01ADALOV", false, false),
                ("Alan Turing", "huddle-grid-gridcell-U02ALANTU", false, false),
                ("Grace Hopper", "huddle-grid-gridcell-U03GRACEH", false, false),
                ("Katherine Johnson", "huddle-grid-gridcell-U04KATHJN", false, false),
                ("Dennis Ritchie", "huddle-grid-gridcell-U05DENNIS", true, false),
                ("Margaret Hamilton", "huddle-grid-gridcell-U06MARGHA", true, false),
                ("Linus Torvalds", "huddle-grid-gridcell-U07LINUST", false, false),
            ],
            true,
            true,
            true,
        );
        let result = read(&root);
        assert!(result.in_huddle);
        assert_eq!(result.present.len(), 7);
        assert_eq!(
            result.speakers.into_iter().collect::<Vec<_>>(),
            vec!["Dennis Ritchie", "Margaret Hamilton"]
        );
        assert_eq!(result.self_muted, Some(true));
    }

    #[test]
    fn description_only_slack_4_50_format_and_possessive_edge_cases() {
        // Slack 4.50.128 only populated AXDescription on AXCell/AXButton, not AXTitle.
        let cell = AxNode::new("AXCell")
            .described("View Dennis' profile")
            .id("huddle-grid-gridcell-U05DENNIS")
            .classes([PEER_TILE])
            .child(AxNode::new("AXGroup").classes([MIC_OVERLAY, ACTIVE_SPEAKER_OVERLAY]));
        let cell_curly = AxNode::new("AXCell")
            .described("View Ada Lovelace\u{2019}s profile")
            .id("huddle-grid-gridcell-U01ADALOV")
            .classes([PEER_TILE])
            .child(AxNode::new("AXGroup").classes([MIC_OVERLAY, ACTIVE_SPEAKER_OVERLAY]));
        let toolbar = AxNode::new("AXToolbar")
            .described("Huddles actions")
            .child(AxNode::new("AXButton").described("Unmute microphone"));

        let root = AxNode::new("AXWindow").child(
            AxNode::new("AXGroup")
                .classes([HUDDLE_VIEW])
                .child(cell)
                .child(cell_curly)
                .child(toolbar),
        );
        let result = read(&root);
        assert!(result.in_huddle);
        assert_eq!(
            result.speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace", "Dennis"]
        );
        assert_eq!(result.self_muted, Some(true));
    }

    #[test]
    fn self_muted_falls_back_to_local_tile_when_toolbar_is_absent() {
        let (row, desc) = peer_entry(
            "Pavel Svitek",
            "huddle-grid-gridcell-self_U0566T6BP0S",
            false,
            true,
            false,
        );
        let root = AxNode::new("AXWindow").child(
            AxNode::new("AXTable")
                .classes([HUDDLE_GRID])
                .child(row)
                .child(desc),
        );
        let result = read(&root);
        assert!(result.in_huddle);
        assert_eq!(result.self_muted, Some(true));
    }
}
