use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub binary_found: bool,
    pub binary_path: Option<String>,
    pub claude_command: String,
    pub cursor_config: String,
    pub codex_config: String,
}

#[tauri::command(async)]
pub fn get_mcp_status() -> McpStatus {
    let binary = find_amie_mcp();
    let command_path = binary
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "/absolute/path/to/amie_mcp".into());

    McpStatus {
        binary_found: binary.is_some(),
        binary_path: binary.map(|p| p.display().to_string()),
        claude_command: format!("claude mcp add amie -- {command_path}"),
        cursor_config: format!(
            "{{\n  \"mcpServers\": {{\n    \"amie\": {{\n      \"command\": \"{command_path}\"\n    }}\n  }}\n}}"
        ),
        codex_config: format!(
            "[mcp_servers.amie]\ncommand = \"{command_path}\"\n"
        ),
    }
}

fn find_amie_mcp() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut candidates: Vec<PathBuf> = Vec::new();

    candidates.push(exe.with_file_name("amie_mcp"));

    if let Some(dir) = exe.parent() {
        candidates.push(dir.join("amie_mcp"));
    }

    for ancestor in exe.ancestors() {
        if ancestor.file_name().and_then(|n| n.to_str()) == Some("debug")
            || ancestor.file_name().and_then(|n| n.to_str()) == Some("release")
        {
            candidates.push(ancestor.join("amie_mcp"));
        }
        if ancestor.extension().and_then(|e| e.to_str()) == Some("app") {
            if let Some(target_parent) = ancestor.parent() {
                candidates.push(target_parent.join("amie_mcp"));
                candidates.push(target_parent.join("debug").join("amie_mcp"));
                candidates.push(target_parent.join("release").join("amie_mcp"));
            }
        }
    }

    candidates.into_iter().find(|path| is_runnable(path))
}

fn is_runnable(path: &Path) -> bool {
    path.is_file()
}
