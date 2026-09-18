pub mod provider;
pub mod service;
pub mod sse;
pub mod xai;

pub use service::{SummaryEmitter, SummaryEvent, SummaryService};

use tauri::{AppHandle, Emitter};

use crate::ipc::summary::event_names;

pub fn emit_summary_event(app: &AppHandle, event: SummaryEvent) {
    let result = match &event {
        SummaryEvent::Delta(payload) => app.emit(event_names::DELTA, payload),
        SummaryEvent::Status(payload) => app.emit(event_names::STATUS, payload),
    };
    if let Err(e) = result {
        tracing::warn!(error = %e, "Failed to emit summary event");
    }
}

pub fn emitter_from_app(app: AppHandle) -> SummaryEmitter {
    std::sync::Arc::new(move |event| emit_summary_event(&app, event))
}
