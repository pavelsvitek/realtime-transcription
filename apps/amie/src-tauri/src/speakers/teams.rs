use std::collections::BTreeSet;

use super::parse::parse_tile_label;
use super::tree::{accessible_name, AxNode};

const WEB_VIEW: &str = "RenderWidgetHostViewCocoa";

/// What a Teams accessibility walk found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamsRead {
    /// Set when the window is still a closed Electron web view. The live
    /// reader must set `AXManualAccessibility` or the tree stays empty.
    pub requested_manual_accessibility: bool,
    pub speakers: BTreeSet<String>,
}

pub fn read(root: &AxNode) -> TeamsRead {
    let mut speakers = BTreeSet::new();
    let mut requested_manual_accessibility = false;
    collect(root, &mut speakers, &mut requested_manual_accessibility);
    TeamsRead {
        requested_manual_accessibility,
        speakers,
    }
}

fn collect(node: &AxNode, speakers: &mut BTreeSet<String>, requested: &mut bool) {
    if is_closed_web_view(node) {
        *requested = true;
        return;
    }
    if node.role == "AXGroup" && node.has_tile_frame() && !is_web_view(node) {
        if let Some(raw) = accessible_name(node) {
            if let Some(label) = parse_tile_label(&raw) {
                if label.speaking && !label.is_self {
                    speakers.insert(label.name);
                }
            }
        }
    }
    for child in &node.children {
        collect(child, speakers, requested);
    }
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
}
