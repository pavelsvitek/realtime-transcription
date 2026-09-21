use serde::Serialize;
use tauri::{AppHandle, State};

use crate::ipc::meetings::{MeetingDetail, MeetingListItem, MeetingRecord, PatchMeeting};
use crate::ipc::summary::{GenerateAllSummariesResult, SummaryJobSnapshot};
use crate::llm::keys::{
    clear_gemini_api_key as clear_saved_gemini_key, clear_openai_api_key as clear_saved_openai_key,
    gemini_key_from_env, gemini_key_saved, openai_key_from_env, openai_key_saved,
    provider_from_env, resolve_provider, save_gemini_api_key, save_openai_api_key, save_provider,
};
use crate::llm::provider::LlmProviderId;
use crate::llm::{emitter_from_app, SummaryService};
use crate::meetings::MeetingStore;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarySettings {
    pub provider: String,
    pub provider_from_env: bool,
    pub openai_api_key_set: bool,
    pub openai_api_key_saved: bool,
    pub openai_api_key_from_env: bool,
    pub gemini_api_key_set: bool,
    pub gemini_api_key_saved: bool,
    pub gemini_api_key_from_env: bool,
}

#[tauri::command]
pub async fn get_summary_settings() -> Result<SummarySettings, String> {
    let openai_from_env = openai_key_from_env();
    let openai_saved = openai_key_saved();
    let gemini_from_env = gemini_key_from_env();
    let gemini_saved = gemini_key_saved();
    Ok(SummarySettings {
        provider: resolve_provider().as_str().to_string(),
        provider_from_env: provider_from_env(),
        openai_api_key_set: openai_saved || openai_from_env,
        openai_api_key_saved: openai_saved,
        openai_api_key_from_env: openai_from_env,
        gemini_api_key_set: gemini_saved || gemini_from_env,
        gemini_api_key_saved: gemini_saved,
        gemini_api_key_from_env: gemini_from_env,
    })
}

#[tauri::command]
pub async fn set_summary_provider(provider: String) -> Result<(), String> {
    let id = LlmProviderId::parse(&provider)
        .ok_or_else(|| format!("Unknown summary provider: {provider}"))?;
    save_provider(id)
}

#[tauri::command]
pub async fn set_openai_api_key(key: String) -> Result<(), String> {
    save_openai_api_key(&key)
}

#[tauri::command]
pub async fn clear_openai_api_key() -> Result<(), String> {
    clear_saved_openai_key()
}

#[tauri::command]
pub async fn set_gemini_api_key(key: String) -> Result<(), String> {
    save_gemini_api_key(&key)
}

#[tauri::command]
pub async fn clear_gemini_api_key() -> Result<(), String> {
    clear_saved_gemini_key()
}

#[tauri::command]
pub async fn get_all_meetings(
    store: State<'_, MeetingStore>,
) -> Result<Vec<MeetingListItem>, String> {
    store.list_finished().map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn get_meeting(
    store: State<'_, MeetingStore>,
    id: String,
) -> Result<Option<MeetingRecord>, String> {
    store.find_record(&id).map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn patch_meeting(
    store: State<'_, MeetingStore>,
    id: String,
    payload: PatchMeeting,
) -> Result<MeetingRecord, String> {
    store
        .patch_meeting(&id, &payload)
        .map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn delete_meeting(store: State<'_, MeetingStore>, id: String) -> Result<(), String> {
    store.delete_meeting(&id).map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn get_live_meeting(
    store: State<'_, MeetingStore>,
) -> Result<Option<MeetingDetail>, String> {
    store.get_live_meeting().map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn generate_meeting_summary(
    app: AppHandle,
    summaries: State<'_, SummaryService>,
    id: String,
) -> Result<(), String> {
    summaries.start(id, emitter_from_app(app));
    Ok(())
}

#[tauri::command]
pub async fn get_summary_job(
    summaries: State<'_, SummaryService>,
    id: String,
) -> Result<SummaryJobSnapshot, String> {
    Ok(summaries.snapshot(&id))
}

#[tauri::command]
pub async fn generate_all_meeting_summaries(
    app: AppHandle,
    summaries: State<'_, SummaryService>,
) -> Result<GenerateAllSummariesResult, String> {
    summaries.start_all_finished(emitter_from_app(app))
}
