use std::collections::BTreeSet;

use super::parse::parse_tile_label;
use super::tree::AxNode;

const WEB_VIEW: &str = "RenderWidgetHostViewCocoa";

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
    let present = collect(root, &mut speakers, &mut requested_manual_accessibility).names;
    TeamsRead {
        requested_manual_accessibility,
        speakers,
        present,
    }
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
}
