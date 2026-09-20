use tauri::{AppHandle, State};

use crate::ipc::meetings::{MeetingDetail, MeetingListItem, MeetingRecord};
use crate::ipc::summary::{GenerateAllSummariesResult, SummaryJobSnapshot};
use crate::llm::{emitter_from_app, SummaryService};
use crate::meetings::MeetingStore;

#[tauri::command]
pub async fn list_meetings(store: State<'_, MeetingStore>) -> Result<Vec<MeetingListItem>, String> {
    store.list_finished().map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn get_meeting(
    store: State<'_, MeetingStore>,
    id: String,
) -> Result<MeetingRecord, String> {
    store.get_record(&id).map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn update_meeting_title(
    store: State<'_, MeetingStore>,
    id: String,
    title: String,
) -> Result<String, String> {
    store
        .update_title(&id, &title)
        .map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn get_live_meeting(
    store: State<'_, MeetingStore>,
) -> Result<Option<MeetingDetail>, String> {
    store.get_live_meeting().map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn update_meeting_context(
    store: State<'_, MeetingStore>,
    id: String,
    context: String,
) -> Result<Option<String>, String> {
    store
        .update_context(&id, &context)
        .map_err(|e| e.to_user_message())
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

#[tauri::command]
pub async fn archive_meeting(store: State<'_, MeetingStore>, id: String) -> Result<(), String> {
    store.archive_meeting(&id).map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn delete_meeting(store: State<'_, MeetingStore>, id: String) -> Result<(), String> {
    store.delete_meeting(&id).map_err(|e| e.to_user_message())
}
