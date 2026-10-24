//! Where the app runs from. On macOS a downloaded, unnotarized app that is
//! opened straight from the disk image, or without a Finder move into
//! Applications, runs from a read-only place (the mounted .dmg, or the
//! "translocated" copy Gatekeeper makes). In-app updates can't replace the
//! bundle there (os error 30), so the webview warns before anyone tries.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLocation {
    /// "dmg", "translocated" or null when the location is fine.
    pub read_only: Option<&'static str>,
}

/// The read-only kind for an executable path, if any (macOS paths only).
pub fn read_only_kind(exe: &str) -> Option<&'static str> {
    if exe.contains("/AppTranslocation/") {
        Some("translocated")
    } else if exe.starts_with("/Volumes/") {
        Some("dmg")
    } else {
        None
    }
}

#[tauri::command]
pub fn app_location() -> AppLocation {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    AppLocation { read_only: if cfg!(target_os = "macos") { read_only_kind(&exe) } else { None } }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_a_read_only_location() {
        assert_eq!(read_only_kind("/Applications/Hivo.app/Contents/MacOS/hivo"), None);
        assert_eq!(read_only_kind("/Volumes/Hivo/Hivo.app/Contents/MacOS/hivo"), Some("dmg"));
        assert_eq!(read_only_kind("/private/var/folders/zz/T/AppTranslocation/1234-ABCD/d/Hivo.app/Contents/MacOS/hivo"), Some("translocated"));
        assert_eq!(read_only_kind("/Users/someone/Downloads/Hivo.app/Contents/MacOS/hivo"), None);
    }
}
