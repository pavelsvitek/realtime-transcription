use std::path::{Path, PathBuf};

use serde::Serialize;

use super::meeting::running_meeting_app;
use super::permission;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerTagsStatus {
    pub trusted: bool,
    pub meeting_app: Option<String>,
    pub build_label: String,
    pub bundle_path: Option<String>,
}

pub fn status() -> SpeakerTagsStatus {
    let exe = std::env::current_exe().ok();
    let exe = exe.as_deref();
    SpeakerTagsStatus {
        trusted: permission::is_trusted(),
        meeting_app: running_meeting_app().map(|app| app.as_str().to_string()),
        build_label: build_label_from_exe(exe),
        bundle_path: bundle_path_from_exe(exe).map(|path| path.display().to_string()),
    }
}

pub fn request_permission() -> SpeakerTagsStatus {
    permission::prompt();
    permission::open_privacy_settings();
    status()
}

fn bundle_path_from_exe(exe: Option<&Path>) -> Option<PathBuf> {
    exe?.ancestors()
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
        .map(Path::to_path_buf)
}

fn build_label_from_exe(exe: Option<&Path>) -> String {
    match bundle_path_from_exe(exe) {
        Some(path) => {
            let name = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("");
            if name.eq_ignore_ascii_case("amie-dev") {
                "Amie Dev".into()
            } else {
                "Amie".into()
            }
        }
        None => "Amie".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::{build_label_from_exe, bundle_path_from_exe};
    use std::path::Path;

    #[test]
    fn amie_dev_bundle_is_labeled_separately_from_prod() {
        let dev = Path::new(
            "/Users/pavel/realtime-transcription/apps/amie/src-tauri/target/debug/amie-dev.app/Contents/MacOS/amie",
        );
        assert_eq!(
            bundle_path_from_exe(Some(dev))
                .unwrap()
                .file_name()
                .unwrap(),
            "amie-dev.app"
        );
        assert_eq!(build_label_from_exe(Some(dev)), "Amie Dev");

        let prod = Path::new("/Applications/Amie.app/Contents/MacOS/amie");
        assert_eq!(build_label_from_exe(Some(prod)), "Amie");
    }
}
