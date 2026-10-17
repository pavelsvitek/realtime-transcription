use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::meetings::default_db_path;

const PR_URL: &str = "https://github.com/pavelsvitek/realtime-transcription/pull/31";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub binary_found: bool,
    pub binary_path: Option<String>,
    pub db_path: String,
    pub db_exists: bool,
    pub cursor_config: String,
    pub build_command: String,
    pub pr_url: String,
}

#[tauri::command(async)]
pub fn get_mcp_status() -> McpStatus {
    let binary = find_amie_mcp();
    let db = std::env::var_os("AMIE_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(default_db_path);
    let command_path = binary
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| {
            "/absolute/path/to/realtime-transcription/apps/amie/src-tauri/target/debug/amie_mcp"
                .into()
        });
    let cursor_config = format!(
        "{{\n  \"mcpServers\": {{\n    \"amie\": {{\n      \"command\": \"{command_path}\"\n    }}\n  }}\n}}"
    );

    McpStatus {
        binary_found: binary.is_some(),
        binary_path: binary.map(|p| p.display().to_string()),
        db_exists: db.is_file(),
        db_path: db.display().to_string(),
        cursor_config,
        build_command: "cargo build --manifest-path apps/amie/src-tauri/Cargo.toml --bin amie_mcp"
            .into(),
        pr_url: PR_URL.into(),
    }
}

fn find_amie_mcp() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut candidates: Vec<PathBuf> = Vec::new();

    candidates.push(exe.with_file_name("amie_mcp"));

    // Bare `target/debug/amie` or `target/release/amie`.
    if let Some(dir) = exe.parent() {
        candidates.push(dir.join("amie_mcp"));
    }

    // `amie-dev.app/Contents/MacOS/amie` → `target/debug/amie_mcp`.
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
