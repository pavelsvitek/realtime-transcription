#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedMeetingOutput {
    pub title: Option<String>,
    pub summary: String,
}

/// Split a streamed title+summary payload.
///
/// Expected shape:
/// ```text
/// Title: Short meeting name
///
/// - bullet
/// - bullet
/// ```
///
/// Bullet-only output (no title line) stays a summary so older generations still parse.
pub fn parse_meeting_output(raw: &str) -> ParsedMeetingOutput {
    let normalized = raw.replace("\r\n", "\n");
    let mut first_idx: Option<usize> = None;
    for (i, line) in normalized.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        first_idx = Some(i);
        break;
    }
    let Some(first_idx) = first_idx else {
        return ParsedMeetingOutput {
            title: None,
            summary: String::new(),
        };
    };

    let first_line = normalized.lines().nth(first_idx).unwrap_or("");
    if let Some(raw_title) = raw_title_from_line(first_line) {
        let summary = normalized
            .lines()
            .skip(first_idx + 1)
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        return ParsedMeetingOutput {
            title: sanitize_title(&raw_title),
            summary,
        };
    }

    ParsedMeetingOutput {
        title: None,
        summary: normalized.trim().to_string(),
    }
}

fn raw_title_from_line(line: &str) -> Option<String> {
    let stripped = line.trim().replace("**", "");
    let stripped = stripped.trim();
    if let Some(rest) = strip_prefix_ci(stripped, "title:") {
        return Some(rest.to_string());
    }
    if let Some(rest) = stripped.strip_prefix('#') {
        if !rest.trim_start().starts_with('-') {
            return Some(rest.to_string());
        }
    }
    None
}

fn strip_prefix_ci<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    if value.len() >= prefix.len() && value[..prefix.len()].eq_ignore_ascii_case(prefix) {
        Some(&value[prefix.len()..])
    } else {
        None
    }
}

fn sanitize_title(raw: &str) -> Option<String> {
    let collapsed = raw
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let collapsed = collapsed.trim_end_matches('.').trim();
    if collapsed.chars().count() < 3 {
        return None;
    }
    let lower = collapsed.to_ascii_lowercase();
    match lower.as_str() {
        "untitled" | "untitled meeting" | "meeting" | "meeting notes" | "summary"
        | "executive summary" => return None,
        _ => {}
    }
    Some(collapsed.chars().take(80).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_and_leaves_bullets() {
        let parsed = parse_meeting_output(
            "Title: UBS FA UI mocks\n\n- **Attest** every entry\n- Client can correct\n",
        );
        assert_eq!(parsed.title.as_deref(), Some("UBS FA UI mocks"));
        assert_eq!(
            parsed.summary,
            "- **Attest** every entry\n- Client can correct"
        );
    }

    #[test]
    fn bullet_only_output_has_no_title() {
        let parsed = parse_meeting_output("- **Ship** the API\n- Next steps");
        assert_eq!(parsed.title, None);
        assert_eq!(parsed.summary, "- **Ship** the API\n- Next steps");
    }

    #[test]
    fn accepts_heading_and_bold_title_prefix() {
        let heading = parse_meeting_output("# Weekly planning\n\n- Scoped the POC");
        assert_eq!(heading.title.as_deref(), Some("Weekly planning"));
        assert_eq!(heading.summary, "- Scoped the POC");

        let bold = parse_meeting_output("**Title:** Headphones audio test\n- Mic failed");
        assert_eq!(bold.title.as_deref(), Some("Headphones audio test"));
        assert_eq!(bold.summary, "- Mic failed");
    }

    #[test]
    fn rejects_placeholder_titles() {
        let parsed = parse_meeting_output("Title: Untitled meeting\n\n- Talked about Q3");
        assert_eq!(parsed.title, None);
        assert_eq!(parsed.summary, "- Talked about Q3");
    }

    #[test]
    fn incomplete_title_line_does_not_become_a_bullet() {
        let parsed = parse_meeting_output("Title: UBS FA");
        assert_eq!(parsed.title.as_deref(), Some("UBS FA"));
        assert_eq!(parsed.summary, "");
    }
}
