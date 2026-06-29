use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;

#[derive(Debug)]
pub enum FlacConvertError {
    FfmpegNotFound,
    FfmpegFailed {
        exit_code: Option<i32>,
        stderr: String,
    },
    Io(io::Error),
}

impl std::fmt::Display for FlacConvertError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FfmpegNotFound => write!(f, "ffmpeg not found on PATH"),
            Self::FfmpegFailed { exit_code, stderr } => write!(
                f,
                "ffmpeg failed (exit={exit_code:?}): {}",
                stderr.trim()
            ),
            Self::Io(err) => write!(f, "IO error: {err}"),
        }
    }
}

impl std::error::Error for FlacConvertError {}

/// Converts WAV files to FLAC in a background thread.
/// Deletes each WAV after successful conversion.
/// Returns immediately; conversion happens asynchronously.
pub fn convert_wav_to_flac_background(wav_paths: Vec<PathBuf>) {
    if wav_paths.is_empty() {
        return;
    }

    thread::Builder::new()
        .name("flac-convert".into())
        .spawn(move || {
            for wav_path in wav_paths {
                match convert_wav_to_flac(&wav_path) {
                    Ok(flac_path) => {
                        tracing::info!(
                            wav = %wav_path.display(),
                            flac = %flac_path.display(),
                            "Converted debug WAV to FLAC"
                        );
                    }
                    Err(err) => {
                        tracing::warn!(
                            wav = %wav_path.display(),
                            error = %err,
                            "Failed to convert debug WAV to FLAC; keeping WAV"
                        );
                    }
                }
            }
        })
        .map_err(|err| {
            tracing::warn!(
                error = %err,
                "Failed to spawn flac-convert thread; keeping WAV files"
            );
        })
        .ok();
}

/// Synchronous single-file conversion (used by background thread, also testable).
/// Returns the FLAC path on success and deletes the original WAV.
pub fn convert_wav_to_flac(wav_path: &Path) -> Result<PathBuf, FlacConvertError> {
    let flac_path = wav_path.with_extension("flac");

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            &wav_path.to_string_lossy(),
            "-c:a",
            "flac",
            "-y",
            &flac_path.to_string_lossy(),
        ])
        .output()
        .map_err(|err| {
            if err.kind() == io::ErrorKind::NotFound {
                FlacConvertError::FfmpegNotFound
            } else {
                FlacConvertError::Io(err)
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(FlacConvertError::FfmpegFailed {
            exit_code: output.status.code(),
            stderr,
        });
    }

    std::fs::remove_file(wav_path).map_err(FlacConvertError::Io)?;
    Ok(flac_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn write_minimal_wav(path: &Path) -> io::Result<()> {
        let mut file = fs::File::create(path)?;
        // Minimal valid WAV: 44-byte header + 2 bytes of silence (1 sample)
        let header = [
            b'R', b'I', b'F', b'F', 0x26, 0x00, 0x00, 0x00, b'W', b'A', b'V', b'E', b'f', b'm',
            b't', b' ', 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00,
            0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, b'd', b'a', b't', b'a', 0x02, 0x00,
            0x00, 0x00,
        ];
        file.write_all(&header)?;
        file.write_all(&[0x00, 0x00])?;
        Ok(())
    }

    #[test]
    fn convert_wav_to_flac_reports_ffmpeg_not_found() {
        let dir = std::env::temp_dir().join(format!(
            "flac-convert-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        let wav_path = dir.join("test.wav");
        write_minimal_wav(&wav_path).unwrap();

        let original_path = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", "/nonexistent");

        let result = convert_wav_to_flac(&wav_path);

        std::env::set_var("PATH", original_path);

        assert!(matches!(result, Err(FlacConvertError::FfmpegNotFound)));
        assert!(wav_path.exists(), "WAV should be kept on failure");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn convert_wav_to_flac_succeeds_when_ffmpeg_available() {
        if Command::new("ffmpeg").arg("-version").output().is_err() {
            eprintln!("ffmpeg not available, skipping convert_wav_to_flac_succeeds_when_ffmpeg_available");
            return;
        }

        let dir = std::env::temp_dir().join(format!(
            "flac-convert-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        let wav_path = dir.join("test.wav");
        write_minimal_wav(&wav_path).unwrap();

        let flac_path = convert_wav_to_flac(&wav_path).expect("conversion should succeed");
        assert_eq!(flac_path, dir.join("test.flac"));
        assert!(flac_path.exists());
        assert!(!wav_path.exists(), "WAV should be deleted after success");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn convert_wav_to_flac_keeps_wav_on_invalid_input_when_ffmpeg_available() {
        if Command::new("ffmpeg").arg("-version").output().is_err() {
            eprintln!("ffmpeg not available, skipping invalid input test");
            return;
        }

        let dir = std::env::temp_dir().join(format!(
            "flac-convert-invalid-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        let wav_path = dir.join("invalid.wav");
        fs::write(&wav_path, b"not a wav file").unwrap();

        let result = convert_wav_to_flac(&wav_path);
        assert!(result.is_err());
        assert!(wav_path.exists(), "WAV should be kept on conversion failure");

        let _ = fs::remove_dir_all(&dir);
    }
}
