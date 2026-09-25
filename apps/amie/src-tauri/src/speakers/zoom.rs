use std::collections::BTreeSet;

use super::parse::parse_tile_label;
use super::tree::{accessible_name, AxNode};

/// Remote participants Zoom currently marks as speaking.
///
/// Tiles are `AXMenuItem` nodes. The participant outline lists names and is
/// not a speaking signal.
pub fn speaking_names(root: &AxNode) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    collect(root, &mut names);
    names
}

fn collect(node: &AxNode, names: &mut BTreeSet<String>) {
    if node.role == "AXMenuItem" && node.has_tile_frame() {
        if let Some(raw) = accessible_name(node) {
            if let Some(label) = parse_tile_label(&raw) {
                if label.speaking && !label.is_self {
                    names.insert(label.name);
                }
            }
        }
    }
    for child in &node.children {
        collect(child, names);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speakers::timeline::SpeakerTimeline;
    use crate::speakers::tree::AxNode;

    fn menu(title: &str) -> AxNode {
        let bare = title.split(',').next().unwrap_or(title).trim();
        AxNode::new("AXMenuItem")
            .titled(title)
            .frame(320.0, 180.0)
            .child(AxNode::new("AXStaticText").valued(bare).frame(120.0, 18.0))
    }

    fn meeting_tree() -> AxNode {
        AxNode::new("AXWindow")
            .titled("Zoom Meeting")
            .child(menu("Ada Lovelace, speaking"))
            .child(menu("Bob, not speaking"))
            .child(menu("Pavel (You), unmuted"))
            .child(roster())
    }

    fn roster() -> AxNode {
        AxNode::new("AXSplitterGroup").child(
            AxNode::new("AXScrollArea").child(
                AxNode::new("AXOutline")
                    .child(roster_row("Ada Lovelace"))
                    .child(roster_row("Bob"))
                    .child(roster_row("Pavel (You)")),
            ),
        )
    }

    fn roster_row(name: &str) -> AxNode {
        AxNode::new("AXRow").child(AxNode::new("AXStaticText").valued(name).frame(200.0, 20.0))
    }

    #[test]
    fn ada_is_the_only_speaker_and_the_roster_is_ignored() {
        let names = speaking_names(&meeting_tree());
        assert_eq!(names.into_iter().collect::<Vec<_>>(), vec!["Ada Lovelace"]);
    }

    #[test]
    fn two_speakers_only_self_and_no_suffix_resolve_to_nothing() {
        let both = AxNode::new("AXWindow")
            .child(menu("Ada Lovelace, speaking"))
            .child(menu("Bob, speaking"));
        assert!(speaking_names(&both).len() != 1);
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, speaking_names(&both));
        assert!(timeline.resolve(0, 1_000).is_none());

        let only_self = AxNode::new("AXWindow").child(menu("Pavel (You), speaking"));
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, speaking_names(&only_self));
        assert!(timeline.resolve(0, 1_000).is_none());

        let quiet = AxNode::new("AXWindow")
            .child(menu("Ada Lovelace"))
            .child(menu("Bob"));
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, speaking_names(&quiet));
        assert!(timeline.resolve(0, 1_000).is_none());
    }

    #[test]
    fn a_replaced_root_with_the_same_labels_collapses() {
        let first = meeting_tree();
        let second = meeting_tree();
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, speaking_names(&first));
        timeline.push(500, speaking_names(&second));
        assert_eq!(timeline.poll_count(), 1);
        assert_eq!(timeline.resolve(0, 1_000).as_deref(), Some("Ada Lovelace"));
    }
}
