//! Who macOS thinks this process is.
//!
//! Accessibility (TCC) grants are keyed on the bundle identifier plus the
//! code's designated requirement. An ad-hoc signature has the requirement
//! `cdhash H"…"`, which changes with every build: System Settings keeps
//! showing the old row as allowed while `AXIsProcessTrusted` answers no for
//! the new binary. A real signing identity makes the requirement stable.
//! This module reports which of the two the running build has.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;

const FALLBACK_LABEL: &str = "Amie";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignatureKind {
    /// Signed with a certificate: the grant survives rebuilds and updates.
    Identity,
    /// `cdhash` requirement: every rebuild looks like a different app to TCC.
    AdHoc,
    Unsigned,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature {
    pub kind: SignatureKind,
    /// Leaf certificate name, e.g. `Developer ID Application: …`.
    pub signer: Option<String>,
    /// Designated requirement macOS uses for TCC, e.g. `cdhash H"…"` or
    /// `identifier "com.pavel.amie" and certificate leaf = H"…"`.
    pub requirement: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AppIdentity {
    pub label: String,
    /// Only set when running from an `.app`. A bare binary is not the TCC
    /// client (the terminal is), and its embedded Info.plist would report
    /// the production identifier.
    pub bundle_id: Option<String>,
    pub bundle_path: Option<PathBuf>,
    pub signature: Signature,
}

/// Resolved once: none of this changes while the process runs.
pub fn app_identity() -> &'static AppIdentity {
    static IDENTITY: OnceLock<AppIdentity> = OnceLock::new();
    IDENTITY.get_or_init(resolve)
}

fn resolve() -> AppIdentity {
    let exe = std::env::current_exe().ok();
    let bundle_path = bundle_path_from_exe(exe.as_deref());
    let (bundle_id, label) = match &bundle_path {
        Some(_) => bundle_strings(),
        None => (None, None),
    };
    let signed_path = bundle_path.clone().or(exe);
    AppIdentity {
        label: label.unwrap_or_else(|| FALLBACK_LABEL.into()),
        bundle_id,
        signature: signed_path
            .as_deref()
            .map(read_signature)
            .unwrap_or(Signature {
                kind: SignatureKind::Unknown,
                signer: None,
                requirement: None,
            }),
        bundle_path,
    }
}

pub fn bundle_path_from_exe(exe: Option<&Path>) -> Option<PathBuf> {
    exe?.ancestors()
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
        .map(Path::to_path_buf)
}

/// `(CFBundleIdentifier, CFBundleDisplayName ?? CFBundleName)` of the running
/// bundle. The display name is the label System Settings lists.
#[cfg(target_os = "macos")]
fn bundle_strings() -> (Option<String>, Option<String>) {
    use core_foundation::bundle::CFBundle;
    use core_foundation::string::CFString;

    let bundle = CFBundle::main_bundle();
    let info = bundle.info_dictionary();
    let text = |key: &str| {
        info.find(CFString::new(key))
            .and_then(|value| value.downcast::<CFString>())
            .map(|value| value.to_string())
            .filter(|value| !value.is_empty())
    };
    (
        text("CFBundleIdentifier"),
        text("CFBundleDisplayName").or_else(|| text("CFBundleName")),
    )
}

#[cfg(not(target_os = "macos"))]
fn bundle_strings() -> (Option<String>, Option<String>) {
    (None, None)
}

#[cfg(target_os = "macos")]
fn read_signature(path: &Path) -> Signature {
    let details = match std::process::Command::new("/usr/bin/codesign")
        .args(["-dv", "--verbose=2"])
        .arg(path)
        .output()
    {
        Ok(output) => {
            // codesign reports on stderr.
            String::from_utf8_lossy(&output.stderr).into_owned()
        }
        Err(error) => {
            tracing::warn!(%error, "Could not run codesign to read the app signature");
            return Signature {
                kind: SignatureKind::Unknown,
                signer: None,
                requirement: None,
            };
        }
    };
    let requirement = read_designated_requirement(path);
    let mut signature = parse_codesign_output(&details);
    signature.requirement = requirement;
    signature
}

#[cfg(target_os = "macos")]
fn read_designated_requirement(path: &Path) -> Option<String> {
    let output = std::process::Command::new("/usr/bin/codesign")
        .args(["-d", "-r-"])
        .arg(path)
        .output()
        .ok()?;
    // Requirement text is on stdout; some codesign versions mix on stderr.
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_designated_requirement(&text)
}

#[cfg(not(target_os = "macos"))]
fn read_signature(_path: &Path) -> Signature {
    Signature {
        kind: SignatureKind::Unknown,
        signer: None,
        requirement: None,
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_codesign_output(text: &str) -> Signature {
    if text.contains("not signed at all") {
        return Signature {
            kind: SignatureKind::Unsigned,
            signer: None,
            requirement: None,
        };
    }
    let adhoc = text
        .lines()
        .any(|line| line.trim() == "Signature=adhoc" || line.contains("(adhoc"));
    if adhoc {
        return Signature {
            kind: SignatureKind::AdHoc,
            signer: None,
            requirement: None,
        };
    }
    // The first Authority line is the leaf certificate.
    match text
        .lines()
        .find_map(|line| line.trim().strip_prefix("Authority="))
    {
        Some(signer) => Signature {
            kind: SignatureKind::Identity,
            signer: Some(signer.to_string()),
            requirement: None,
        },
        None => Signature {
            kind: SignatureKind::Unknown,
            signer: None,
            requirement: None,
        },
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_designated_requirement(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let line = line.trim().trim_start_matches('#').trim();
        line.strip_prefix("designated => ")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ad_hoc_signatures_are_recognized_including_linker_signed() {
        let tauri_default = "Executable=/Applications/Amie.app/Contents/MacOS/amie\n\
            Identifier=amie-90ba89ee412dddde\n\
            CodeDirectory v=20400 size=118136 flags=0x20002(adhoc,linker-signed) hashes=3688+0 location=embedded\n\
            Signature=adhoc\n\
            Info.plist=not bound\n\
            TeamIdentifier=not set\n";
        assert_eq!(
            parse_codesign_output(tauri_default),
            Signature {
                kind: SignatureKind::AdHoc,
                signer: None,
                requirement: None,
            }
        );
    }

    #[test]
    fn a_certificate_signature_reports_the_leaf_signer() {
        let signed = "Executable=/x/amie\n\
            Identifier=com.pavel.amie.dev\n\
            CodeDirectory v=20500 size=1234 flags=0x0(none) hashes=3+7 location=embedded\n\
            Signature size=4442\n\
            Authority=Developer ID Application: Pavel Svitek (ABCDE12345)\n\
            Authority=Developer ID Certification Authority\n\
            Authority=Apple Root CA\n\
            TeamIdentifier=ABCDE12345\n";
        assert_eq!(
            parse_codesign_output(signed),
            Signature {
                kind: SignatureKind::Identity,
                signer: Some("Developer ID Application: Pavel Svitek (ABCDE12345)".into()),
                requirement: None,
            }
        );
    }

    #[test]
    fn unsigned_and_unreadable_output_are_not_mistaken_for_a_stable_identity() {
        assert_eq!(
            parse_codesign_output("u.bin: code object is not signed at all\n").kind,
            SignatureKind::Unsigned
        );
        assert_eq!(parse_codesign_output("").kind, SignatureKind::Unknown);
    }

    #[test]
    fn designated_requirement_is_parsed_from_codesign_r() {
        // `codesign -d -r-` prefixes the requirement with `# ` on stderr.
        let adhoc = "Executable=/Applications/Amie.app/Contents/MacOS/amie\n\
            # designated => cdhash H\"4084ac8c8b3bdf6d8738e4630a533cc13a486dab\"\n";
        assert_eq!(
            parse_designated_requirement(adhoc).as_deref(),
            Some("cdhash H\"4084ac8c8b3bdf6d8738e4630a533cc13a486dab\"")
        );
        let cert = "designated => identifier \"com.pavel.amie\" and certificate leaf = H\"abc\"\n";
        assert_eq!(
            parse_designated_requirement(cert).as_deref(),
            Some("identifier \"com.pavel.amie\" and certificate leaf = H\"abc\"")
        );
        assert_eq!(parse_designated_requirement(""), None);
    }

    #[test]
    fn bundle_path_is_the_enclosing_app_and_none_for_a_bare_binary() {
        let dev = Path::new("/w/src-tauri/target/debug/amie-dev.app/Contents/MacOS/amie");
        assert_eq!(
            bundle_path_from_exe(Some(dev)).unwrap().file_name().unwrap(),
            "amie-dev.app"
        );
        assert!(bundle_path_from_exe(Some(Path::new("/w/target/debug/amie"))).is_none());
        assert!(bundle_path_from_exe(None).is_none());
    }
}
