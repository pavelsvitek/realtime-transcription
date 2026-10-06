use std::collections::{BTreeSet, HashMap};

use super::parse::parse_tile_label;
use super::tree::AxNode;

const WEB_VIEW: &str = "RenderWidgetHostViewCocoa";
const ROSTER_ITEM: &str = "calling-roster-item";
const ROSTER_NAME_WRAP: &str = "roster-avatar-img";
const ROSTER_BUTTON: &str = "roster-button";
const VIDEO_OCCLUSION: &str = "vdi-occlusion";
const SPEAKING_FRAME: &str = "vdi-frame-occlusion";

/// What a Teams accessibility walk found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamsRead {
    /// Set when the window is still a closed Electron web view. The live
    /// reader must set `AXManualAccessibility` or the tree stays empty.
    pub requested_manual_accessibility: bool,
    pub speakers: BTreeSet<String>,
    /// Remote participant names visible in the tree, speaking or not.
    pub present: BTreeSet<String>,
}

pub fn read(root: &AxNode) -> TeamsRead {
    let mut speakers = BTreeSet::new();
    let mut requested_manual_accessibility = false;
    let mut present = collect(root, &mut speakers, &mut requested_manual_accessibility).names;
    let gallery = gallery_tiles(root);
    if !gallery.is_empty() {
        speakers = gallery
            .iter()
            .filter(|tile| tile.speaking && !tile.is_self)
            .map(|tile| tile.name.clone())
            .collect();
        present.extend(
            gallery
                .iter()
                .filter(|tile| !tile.is_self)
                .map(|tile| tile.name.clone()),
        );
    } else if speakers.is_empty() {
        speakers = roster_speakers(root);
    }
    present.extend(roster_present(root));
    TeamsRead {
        requested_manual_accessibility,
        speakers,
        present,
    }
}

/// Open People only when the video gallery is not in the tree. Gallery tiles
/// already carry names and the purple speaking border.
pub fn needs_roster_open(root: &AxNode) -> bool {
    has_dom_id(root, ROSTER_BUTTON)
        && !participants_pane_open(root)
        && gallery_tiles(root).is_empty()
}

/// The gallery is readable, so the People pane we used to auto-open can close.
pub fn needs_roster_close(root: &AxNode) -> bool {
    participants_pane_open(root) && !gallery_tiles(root).is_empty()
}

fn participants_pane_open(node: &AxNode) -> bool {
    if node
        .dom_id
        .as_deref()
        .is_some_and(|id| id.contains(ROSTER_ITEM))
    {
        return true;
    }
    if node.title.as_deref() == Some("Close participants pane") {
        return true;
    }
    if node.role == "AXOutline" && node.title.as_deref() == Some("Attendees") {
        return true;
    }
    node.children.iter().any(participants_pane_open)
}

fn has_dom_id(node: &AxNode, want: &str) -> bool {
    node.dom_id.as_deref() == Some(want) || node.children.iter().any(|child| has_dom_id(child, want))
}

struct GalleryTile {
    name: String,
    speaking: bool,
    is_self: bool,
}

fn gallery_tiles(root: &AxNode) -> Vec<GalleryTile> {
    let mut tiles = Vec::new();
    collect_gallery(root, &mut tiles);
    tiles
}

fn collect_gallery(node: &AxNode, tiles: &mut Vec<GalleryTile>) {
    if let Some(tile) = gallery_tile_from(node) {
        tiles.push(tile);
        return;
    }
    for child in &node.children {
        collect_gallery(child, tiles);
    }
}

fn gallery_tile_from(node: &AxNode) -> Option<GalleryTile> {
    if node.role != "AXMenuItem" {
        return None;
    }
    let raw = node.title.as_deref().or(node.description.as_deref())?;
    let parsed = parse_gallery_tile(raw)?;
    if !has_class_in_tree(node, VIDEO_OCCLUSION) && !has_class_in_tree(node, SPEAKING_FRAME) {
        return None;
    }
    Some(GalleryTile {
        name: parsed.name,
        is_self: parsed.is_self,
        speaking: has_class_in_tree(node, SPEAKING_FRAME),
    })
}

struct GalleryParse {
    name: String,
    is_self: bool,
}

/// New Teams gallery titles are comma-separated chrome after the display name.
/// Names themselves may contain commas (`Richardson, Bob`).
fn parse_gallery_tile(raw: &str) -> Option<GalleryParse> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_lowercase();
    if lower.starts_with("content shared by") {
        return None;
    }
    let mut is_self = false;
    let mut name_parts: Vec<&str> = Vec::new();
    for part in trimmed.split(',').map(str::trim).filter(|part| !part.is_empty()) {
        if is_gallery_chrome(part) {
            if is_self_chrome(part) {
                is_self = true;
            }
            if !name_parts.is_empty() {
                break;
            }
            continue;
        }
        name_parts.push(part);
    }
    if name_parts.is_empty() {
        return None;
    }
    let name = name_parts.join(", ");
    if parse_tile_label(&name).is_some_and(|label| label.is_self) {
        is_self = true;
    }
    Some(GalleryParse { name, is_self })
}

fn is_self_chrome(part: &str) -> bool {
    matches!(
        part.trim().to_lowercase().as_str(),
        "myself video" | "my video"
    )
}

fn is_gallery_chrome(part: &str) -> bool {
    let t = part.trim().to_lowercase();
    is_self_chrome(&t)
        || matches!(t.as_str(), "muted" | "unmuted" | "organiser" | "organizer" | "guest")
        || t.starts_with("video is ")
        || t.starts_with("fit to ")
        || t.starts_with("has control of")
        || t.contains("context menu")
}

fn has_class_in_tree(node: &AxNode, class: &str) -> bool {
    node.classes.iter().any(|item| item == class) || node.children.iter().any(|child| has_class_in_tree(child, class))
}

struct RosterItem {
    name: String,
    style: String,
    is_self: bool,
}

fn roster_present(root: &AxNode) -> BTreeSet<String> {
    roster_items(root)
        .into_iter()
        .filter(|item| !item.is_self)
        .map(|item| item.name)
        .collect()
}

/// New Teams marks the active speaker by bolding the roster name. That is
/// CSS, so Accessibility only shows a different `AXDOMClassList` on that
/// wrap. The minority style among roster rows is the speaker.
fn roster_speakers(root: &AxNode) -> BTreeSet<String> {
    let items: Vec<RosterItem> = roster_items(root)
        .into_iter()
        .filter(|item| !item.style.is_empty())
        .collect();
    if items.len() < 2 {
        return BTreeSet::new();
    }
    let minority = {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for item in &items {
            *counts.entry(item.style.as_str()).or_default() += 1;
        }
        let Some((&style, &n)) = counts.iter().min_by_key(|(_, n)| *n) else {
            return BTreeSet::new();
        };
        if n == items.len() || counts.values().filter(|count| **count == n).count() != 1 {
            return BTreeSet::new();
        }
        style.to_string()
    };
    items
        .into_iter()
        .filter(|item| item.style == minority && !item.is_self)
        .map(|item| item.name)
        .collect()
}

fn roster_items(root: &AxNode) -> Vec<RosterItem> {
    let mut items = Vec::new();
    collect_roster(root, &mut items);
    items
}

fn collect_roster(node: &AxNode, items: &mut Vec<RosterItem>) {
    if node
        .dom_id
        .as_deref()
        .is_some_and(|id| id.contains(ROSTER_ITEM))
    {
        if let Some(name) = roster_display_name(node) {
            let is_self = node
                .title
                .as_deref()
                .and_then(parse_tile_label)
                .is_some_and(|label| label.is_self)
                || parse_tile_label(&name).is_some_and(|label| label.is_self);
            items.push(RosterItem {
                name,
                style: roster_name_style(node),
                is_self,
            });
        }
        return;
    }
    for child in &node.children {
        collect_roster(child, items);
    }
}

fn roster_display_name(node: &AxNode) -> Option<String> {
    if let Some(wrap) = find_dom_contains(node, ROSTER_NAME_WRAP) {
        if let Some(text) = first_person_text(wrap) {
            return Some(text);
        }
    }
    first_person_text(node)
}

fn roster_name_style(node: &AxNode) -> String {
    let Some(wrap) = find_dom_contains(node, ROSTER_NAME_WRAP) else {
        return String::new();
    };
    let mut classes = wrap.classes.clone();
    classes.sort();
    classes.join(" ")
}

fn find_dom_contains<'a>(node: &'a AxNode, needle: &str) -> Option<&'a AxNode> {
    if node
        .dom_id
        .as_deref()
        .is_some_and(|id| id.contains(needle))
    {
        return Some(node);
    }
    node.children
        .iter()
        .find_map(|child| find_dom_contains(child, needle))
}

fn first_person_text(node: &AxNode) -> Option<String> {
    if node.role == "AXStaticText" {
        if let Some(value) = node.value.as_deref().map(str::trim).filter(|text| {
            !text.is_empty() && !is_roster_chrome_text(text)
        }) {
            return Some(value.to_string());
        }
    }
    node.children.iter().find_map(first_person_text)
}

fn is_roster_chrome_text(text: &str) -> bool {
    let t = text.trim().to_lowercase();
    matches!(
        t.as_str(),
        "organiser"
            | "organizer"
            | "muted"
            | "unmuted"
            | "presenters"
            | "attendees"
            | "participants"
            | "guest"
    ) || t.starts_with("presenters (")
        || t.starts_with("attendees (")
}

struct Signals {
    names: BTreeSet<String>,
    speaking: bool,
}

fn collect(node: &AxNode, speakers: &mut BTreeSet<String>, requested: &mut bool) -> Signals {
    if is_closed_web_view(node) {
        *requested = true;
        return Signals {
            names: BTreeSet::new(),
            speaking: false,
        };
    }
    if gallery_tile_from(node).is_some() {
        return Signals {
            names: BTreeSet::new(),
            speaking: false,
        };
    }
    let mut signals = own_signals(node);
    for child in &node.children {
        let child_signals = collect(child, speakers, requested);
        signals.names.extend(child_signals.names);
        signals.speaking |= child_signals.speaking;
    }
    if signals.speaking && signals.names.len() == 1 {
        if let Some(name) = signals.names.iter().next() {
            speakers.insert(name.clone());
        }
    }
    signals
}

fn own_signals(node: &AxNode) -> Signals {
    let mut names = BTreeSet::new();
    let mut speaking = false;
    for raw in [&node.title, &node.description, &node.value]
        .into_iter()
        .flatten()
    {
        note(raw, &mut names, &mut speaking);
    }
    Signals { names, speaking }
}

fn note(raw: &str, names: &mut BTreeSet<String>, speaking: &mut bool) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }
    if trimmed.to_lowercase().starts_with("content shared by") {
        return;
    }
    if is_speaking_token(trimmed) {
        *speaking = true;
        return;
    }
    let Some(label) = parse_tile_label(trimmed) else {
        return;
    };
    if label.speaking {
        *speaking = true;
    }
    if label.is_self || is_chrome(&label.name) || is_speaking_token(&label.name) {
        return;
    }
    names.insert(label.name);
}

fn is_speaking_token(raw: &str) -> bool {
    matches!(
        raw.trim().to_lowercase().as_str(),
        "speaking" | "talking" | "is speaking" | "is talking" | "currently speaking"
    )
}

fn is_chrome(name: &str) -> bool {
    matches!(
        name.trim().to_lowercase().as_str(),
        "microsoft teams"
            | "teams"
            | "meeting"
            | "chat"
            | "mute"
            | "camera"
            | "leave"
            | "share"
            | "people"
            | "participants"
            | "more"
            | "reactions"
            | "remote"
            | "you"
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

    fn person(description: &str) -> AxNode {
        let bare = description.split(',').next().unwrap_or(description).trim();
        AxNode::new("AXGroup")
            .described(description)
            .frame(300.0, 180.0)
            .child(AxNode::new("AXStaticText").valued(bare).frame(120.0, 18.0))
    }

    #[test]
    fn a_closed_web_view_requests_manual_accessibility_and_finds_nobody() {
        let root = AxNode::new("AXWindow").titled("Microsoft Teams").child(
            AxNode::new("AXGroup")
                .titled("RenderWidgetHostViewCocoa")
                .frame(800.0, 600.0),
        );
        let read = read(&root);
        assert!(read.speakers.is_empty());
        assert!(
            read.requested_manual_accessibility,
            "walker never recorded AXManualAccessibility"
        );
    }

    #[test]
    fn a_speaking_description_resolves_to_ada() {
        let root = AxNode::new("AXWindow")
            .child(person("Ada Lovelace, speaking"))
            .child(person("Bob, not speaking"))
            .child(person("Pavel (You)"));
        let read = read(&root);
        assert_eq!(
            read.speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );
        assert!(!read.requested_manual_accessibility);
    }

    #[test]
    fn names_without_a_speaking_suffix_stay_unresolved() {
        let root = AxNode::new("AXWindow")
            .child(person("Ada Lovelace"))
            .child(person("Bob"));
        assert!(read(&root).speakers.is_empty());
    }

    #[test]
    fn a_one_to_one_name_without_a_speaking_suffix_is_not_assumed() {
        let root = AxNode::new("AXWindow").child(person("Ada Lovelace"));
        assert!(read(&root).speakers.is_empty());
    }

    #[test]
    fn a_speaking_name_does_not_need_a_tile_frame() {
        let root = AxNode::new("AXWindow")
            .child(AxNode::new("AXGroup").described("Ada Lovelace, speaking"));
        assert_eq!(
            read(&root).speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );
    }

    #[test]
    fn is_speaking_and_a_nested_badge_name_ada() {
        let phrase = AxNode::new("AXWindow").child(person("Ada Lovelace is speaking"));
        assert_eq!(
            read(&phrase).speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );

        let badge = AxNode::new("AXGroup")
            .described("Ada Lovelace")
            .child(AxNode::new("AXStaticText").valued("Speaking"));
        let titled = AxNode::new("AXGroup")
            .titled("Ada Lovelace")
            .described("Ada Lovelace, speaking");
        let root = AxNode::new("AXWindow").child(badge).child(titled);
        assert_eq!(
            read(&root).speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );
    }

    fn quiet_classes() -> [&'static str; 6] {
        [
            "fui-StyledText",
            "___17b04rt",
            "f71fsbu",
            "f1a3p1vp",
            "f1cmbuwj",
            "fy77jfu",
        ]
    }

    fn speaking_classes() -> [&'static str; 6] {
        [
            "fui-StyledText",
            "___4on9nh0",
            "fhuq1gn",
            "f1a3p1vp",
            "f1cmbuwj",
            "fy77jfu",
        ]
    }

    fn roster_person(name: &str, org_id: &str, speaking: bool) -> AxNode {
        let classes = if speaking {
            speaking_classes()
        } else {
            quiet_classes()
        };
        let title = format!("{name}, Unmuted");
        AxNode::new("AXRow").titled(&title).child(
            AxNode::new("AXGroup")
                .titled(&title)
                .id(format!("calling-roster-item-8:orgid:{org_id}"))
                .child(
                    AxNode::new("AXGroup")
                        .id(format!("roster-avatar-img-8:orgid:{org_id}"))
                        .classes(classes)
                        .child(AxNode::new("AXStaticText").valued(name)),
                )
                .child(
                    AxNode::new("AXImage")
                        .titled("Unmuted")
                        .id(format!("roster-mic-button-8:orgid:{org_id}")),
                ),
        )
    }

    fn live_teams_roster(celeste_speaking: bool) -> AxNode {
        AxNode::new("AXWindow")
            .titled("PMO Series | Microsoft Teams")
            .child(
                AxNode::new("AXButton")
                    .titled("People")
                    .id("roster-button"),
            )
            .child(
                AxNode::new("AXGroup")
                    .titled("Participants")
                    .child(
                        AxNode::new("AXButton").titled("Close participants pane"),
                    )
                    .child(
                        AxNode::new("AXOutline").titled("Attendees").child(
                            AxNode::new("AXRow")
                                .titled("Presenters, 5 total")
                                .child(AxNode::new("AXStaticText").valued("Presenters (5)")),
                        ).child(roster_person(
                            "Ale, Cristine",
                            "aa",
                            false,
                        ))
                        .child(roster_person(
                            "Godoy, Celeste",
                            "bb",
                            celeste_speaking,
                        ))
                        .child(roster_person("Nick Heller", "cc", false))
                        .child(roster_person("Rizzo, John M.", "dd", false))
                        .child(roster_person("Ucuncu, Ahmet", "ee", false)),
                    ),
            )
    }

    #[test]
    fn new_teams_roster_uses_the_bold_name_as_the_speaker() {
        let read = read(&live_teams_roster(true));
        assert_eq!(
            read.speakers.into_iter().collect::<Vec<_>>(),
            vec!["Godoy, Celeste"]
        );
        assert!(read.present.contains("Godoy, Celeste"));
        assert!(read.present.contains("Nick Heller"));
    }

    #[test]
    fn matching_roster_styles_mean_nobody_is_speaking() {
        assert!(read(&live_teams_roster(false)).speakers.is_empty());
    }

    #[test]
    fn people_button_without_a_pane_needs_the_roster_opened() {
        let closed = AxNode::new("AXWindow").child(
            AxNode::new("AXButton")
                .titled("People")
                .id("roster-button"),
        );
        assert!(needs_roster_open(&closed));
        assert!(!needs_roster_open(&live_teams_roster(true)));
        assert!(!needs_roster_close(&closed));
        assert!(!needs_roster_close(&live_teams_roster(true)));
        assert!(needs_roster_close(&live_teams_roster(true).child(
            gallery_person(
                "Couvillon, Ginny, video is on, Context menu is available",
                true,
            )
        )));
    }

    fn video_surface(speaking: bool) -> AxNode {
        let mut node = AxNode::new("AXGroup").classes(["fui-Flex", VIDEO_OCCLUSION]);
        if speaking {
            node = node.child(
                AxNode::new("AXGroup").classes(["fui-Flex", SPEAKING_FRAME]),
            );
        }
        node
    }

    fn gallery_person(title: &str, speaking: bool) -> AxNode {
        AxNode::new("AXMenuItem")
            .titled(title)
            .described(title)
            .child(video_surface(speaking))
    }

    fn live_teams_gallery(ginny_speaking: bool) -> AxNode {
        AxNode::new("AXWindow")
            .titled("Enzian WAC PoC Weekly Check-in | Microsoft Teams")
            .child(
                AxNode::new("AXButton")
                    .titled("People")
                    .id("roster-button"),
            )
            .child(
                AxNode::new("AXGroup")
                    .titled("Shared content view")
                    .child(AxNode::new("AXMenuItem").titled("Content shared by Ucuncu, Ahmet").child(
                        AxNode::new("AXGroup").classes(["fui-Flex", VIDEO_OCCLUSION]),
                    ))
                    .child(gallery_person(
                        "Myself video, Pavel Svitek, Muted, video is on, Fit to frame, Has context menu",
                        false,
                    ))
                    .child(gallery_person(
                        "Ucuncu, Ahmet, video is on, Has control of production tools, Context menu is available",
                        false,
                    ))
                    .child(gallery_person(
                        "Ale, Cristine, video is on, Has control of production tools, muted, Context menu is available",
                        false,
                    ))
                    .child(gallery_person(
                        "Couvillon, Ginny, video is on, Has control of production tools, Context menu is available",
                        ginny_speaking,
                    ))
                    .child(gallery_person(
                        "Nick Heller, video is on, Context menu is available",
                        false,
                    )),
            )
    }

    #[test]
    fn new_teams_gallery_uses_the_speaking_border_and_keeps_last_first_names() {
        let read = read(&live_teams_gallery(true));
        assert_eq!(
            read.speakers.into_iter().collect::<Vec<_>>(),
            vec!["Couvillon, Ginny"]
        );
        assert!(read.present.contains("Couvillon, Ginny"));
        assert!(read.present.contains("Ucuncu, Ahmet"));
        assert!(read.present.contains("Ale, Cristine"));
        assert!(read.present.contains("Nick Heller"));
        assert!(!read.present.contains("Pavel Svitek"));
        assert!(!read.present.iter().any(|name| name.contains("Content shared")));
        assert!(!needs_roster_open(&live_teams_gallery(true)));
    }

    #[test]
    fn gallery_without_a_speaking_border_is_quiet() {
        assert!(read(&live_teams_gallery(false)).speakers.is_empty());
    }

    #[test]
    fn gallery_speakers_are_preferred_over_the_roster() {
        let root = live_teams_gallery(true)
            .child(roster_person("Godoy, Celeste", "bb", true))
            .child(roster_person("Ale, Cristine", "aa", false))
            .child(roster_person("Nick Heller", "cc", false));
        assert_eq!(
            read(&root).speakers.into_iter().collect::<Vec<_>>(),
            vec!["Couvillon, Ginny"]
        );
    }

    #[test]
    fn overlapping_gallery_borders_return_every_speaker() {
        let root = AxNode::new("AXWindow")
            .child(gallery_person(
                "Richardson, Bob, video is on, Context menu is available",
                true,
            ))
            .child(gallery_person(
                "Ada Lovelace, video is on, Context menu is available",
                true,
            ));
        assert_eq!(
            read(&root).speakers.into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace", "Richardson, Bob"]
        );
    }
}
