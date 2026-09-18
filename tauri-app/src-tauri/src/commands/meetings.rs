use tauri::State;

use crate::ipc::meetings::{MeetingListItem, MeetingRecord};
use crate::meetings::MeetingStore;

#[tauri::command]
pub async fn list_meetings(
    store: State<'_, MeetingStore>,
) -> Result<Vec<MeetingListItem>, String> {
    store.list_finished().map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn get_meeting(
    store: State<'_, MeetingStore>,
    id: String,
) -> Result<MeetingRecord, String> {
    store.get_record(&id).map_err(|e| e.to_user_message())
}
