use std::path::{Path, PathBuf};

use super::provider::LlmProviderId;

const OPENAI_KEY_FILE: &str = "openai_api_key";
const GEMINI_KEY_FILE: &str = "gemini_api_key";
const PROVIDER_FILE: &str = "summary_llm_provider";

pub fn provider_from_env() -> bool {
    env_nonempty("SUMMARY_LLM_PROVIDER").is_some()
}

pub fn resolve_provider() -> LlmProviderId {
    if let Some(raw) = env_nonempty("SUMMARY_LLM_PROVIDER") {
        return LlmProviderId::parse(&raw).unwrap_or(LlmProviderId::Xai);
    }
    load_provider_at(&settings_root()).unwrap_or(LlmProviderId::Xai)
}

pub fn save_provider(id: LlmProviderId) -> Result<(), String> {
    save_provider_at(&settings_root(), id)
}

pub fn resolve_openai_api_key() -> Option<String> {
    env_nonempty("OPENAI_API_KEY").or_else(|| load_secret(&openai_key_path()))
}

pub fn openai_key_from_env() -> bool {
    env_nonempty("OPENAI_API_KEY").is_some()
}

pub fn openai_key_saved() -> bool {
    load_secret(&openai_key_path()).is_some()
}

pub fn save_openai_api_key(key: &str) -> Result<(), String> {
    save_secret(&openai_key_path(), key)
}

pub fn clear_openai_api_key() -> Result<(), String> {
    clear_secret(&openai_key_path())
}

pub fn resolve_gemini_api_key() -> Option<String> {
    env_nonempty("GEMINI_API_KEY")
        .or_else(|| env_nonempty("GOOGLE_API_KEY"))
        .or_else(|| load_secret(&gemini_key_path()))
}

pub fn gemini_key_from_env() -> bool {
    env_nonempty("GEMINI_API_KEY").is_some() || env_nonempty("GOOGLE_API_KEY").is_some()
}

pub fn gemini_key_saved() -> bool {
    load_secret(&gemini_key_path()).is_some()
}

pub fn save_gemini_api_key(key: &str) -> Result<(), String> {
    save_secret(&gemini_key_path(), key)
}

pub fn clear_gemini_api_key() -> Result<(), String> {
    clear_secret(&gemini_key_path())
}

pub(crate) fn model_from(override_value: Option<&str>, default_model: &str) -> String {
    let raw = override_value.unwrap_or("").trim();
    if raw.is_empty() || !is_model_id(raw) {
        return default_model.to_string();
    }
    raw.to_string()
}

fn is_model_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

pub fn provider_has_api_key(id: LlmProviderId) -> bool {
    match id {
        LlmProviderId::Xai => crate::transcription::xai::resolve_api_key().is_some(),
        LlmProviderId::Openai => resolve_openai_api_key().is_some(),
        LlmProviderId::Gemini => resolve_gemini_api_key().is_some(),
    }
}

fn settings_root() -> PathBuf {
    crate::transcription::xai::app_support_root()
}

fn openai_key_path() -> PathBuf {
    settings_root().join(OPENAI_KEY_FILE)
}

fn gemini_key_path() -> PathBuf {
    settings_root().join(GEMINI_KEY_FILE)
}

fn env_nonempty(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn load_provider_at(root: &Path) -> Option<LlmProviderId> {
    let raw = load_secret(&root.join(PROVIDER_FILE))?;
    LlmProviderId::parse(&raw)
}

pub(crate) fn save_provider_at(root: &Path, id: LlmProviderId) -> Result<(), String> {
    let path = root.join(PROVIDER_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app support dir: {e}"))?;
    }
    std::fs::write(path, id.as_str()).map_err(|e| format!("Failed to save summary provider: {e}"))
}

fn load_secret(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn save_secret(path: &Path, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app support dir: {e}"))?;
    }
    std::fs::write(path, trimmed).map_err(|e| format!("Failed to save API key: {e}"))
}

fn clear_secret(path: &Path) -> Result<(), String> {
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("Failed to clear API key: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_providers_only() {
        assert_eq!(LlmProviderId::parse("openai"), Some(LlmProviderId::Openai));
        assert_eq!(
            LlmProviderId::parse(" Gemini "),
            Some(LlmProviderId::Gemini)
        );
        assert_eq!(LlmProviderId::parse("xai"), Some(LlmProviderId::Xai));
        assert_eq!(LlmProviderId::parse("claude"), None);
    }

    #[test]
    fn saved_provider_round_trip() {
        let dir = std::env::temp_dir().join(format!("summary-keys-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        save_provider_at(&dir, LlmProviderId::Gemini).unwrap();
        assert_eq!(load_provider_at(&dir), Some(LlmProviderId::Gemini));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn secret_round_trip_rejects_blank() {
        let dir = std::env::temp_dir().join(format!("summary-secret-{}", uuid::Uuid::new_v4()));
        let path = dir.join("openai_api_key");
        assert_eq!(
            save_secret(&path, "  ").unwrap_err(),
            "API key cannot be empty"
        );
        save_secret(&path, " sk-test ").unwrap();
        assert_eq!(load_secret(&path).as_deref(), Some("sk-test"));
        clear_secret(&path).unwrap();
        assert!(load_secret(&path).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
