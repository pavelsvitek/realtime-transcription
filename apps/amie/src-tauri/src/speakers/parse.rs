/// A participant tile label read from an accessibility name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TileLabel {
    pub name: String,
    pub speaking: bool,
    pub is_self: bool,
}

/// Split a tile's accessible name into a display name and speaking state.
///
/// Suffixes observed on Zoom and Teams tiles: `, speaking`, `, not speaking`,
/// `, muted`, `, unmuted`. `(You)`, `(Me)`, and a trailing `, you` mark the
/// local user.
pub fn parse_tile_label(raw: &str) -> Option<TileLabel> {
    let mut text = raw.trim().to_string();
    if text.is_empty() {
        return None;
    }

    let mut speaking = false;
    let mut not_speaking = false;
    let mut is_self = false;
    loop {
        let lower = text.to_lowercase();
        let matched = [
            (", not speaking", Suffix::NotSpeaking),
            (", speaking", Suffix::Speaking),
            (", unmuted", Suffix::Other),
            (", muted", Suffix::Other),
            (", context menu", Suffix::Other),
            (", you", Suffix::Local),
        ]
        .into_iter()
        .find(|(suffix, _)| lower.ends_with(suffix));
        let Some((suffix, kind)) = matched else {
            break;
        };
        text.truncate(text.len() - suffix.len());
        text = text.trim().to_string();
        match kind {
            Suffix::Speaking => speaking = true,
            Suffix::NotSpeaking => not_speaking = true,
            Suffix::Local => is_self = true,
            Suffix::Other => {}
        }
    }

    if text.is_empty() {
        return None;
    }
    let lower = text.to_lowercase();
    if lower.contains("(you)") || lower.contains("(me)") {
        is_self = true;
    }

    Some(TileLabel {
        name: text,
        speaking: speaking && !not_speaking,
        is_self,
    })
}

enum Suffix {
    Speaking,
    NotSpeaking,
    Local,
    Other,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn speaking_suffix_sets_the_name_and_flag() {
        let label = parse_tile_label("Ada Lovelace, speaking").unwrap();
        assert_eq!(label.name, "Ada Lovelace");
        assert!(label.speaking);
        assert!(!label.is_self);
    }

    #[test]
    fn not_speaking_is_present_but_silent() {
        let label = parse_tile_label("Bob, not speaking").unwrap();
        assert_eq!(label.name, "Bob");
        assert!(!label.speaking);
    }

    #[test]
    fn muted_suffix_stays_off_the_display_name() {
        let label = parse_tile_label("Ada Lovelace, muted").unwrap();
        assert_eq!(label.name, "Ada Lovelace");
        assert!(!label.speaking);
        assert!(!label.name.to_lowercase().contains("muted"));
    }

    #[test]
    fn unmuted_suffix_is_stripped() {
        let label = parse_tile_label("Ada Lovelace, unmuted").unwrap();
        assert_eq!(label.name, "Ada Lovelace");
        assert!(!label.speaking);
    }

    #[test]
    fn you_and_me_are_the_local_user() {
        assert!(parse_tile_label("Pavel (You), unmuted").unwrap().is_self);
        assert!(parse_tile_label("Pavel (Me)").unwrap().is_self);
        let you = parse_tile_label("Pavel, you").unwrap();
        assert!(you.is_self);
        assert_eq!(you.name, "Pavel");
    }

    #[test]
    fn not_speaking_wins_over_a_shorter_speaking_suffix() {
        let label = parse_tile_label("Ada, not speaking").unwrap();
        assert!(!label.speaking);
        assert_eq!(label.name, "Ada");
    }
}
