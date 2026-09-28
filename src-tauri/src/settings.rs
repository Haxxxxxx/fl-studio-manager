use crate::models::Settings;
use std::fs;
use tauri::{AppHandle, Manager};

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create config dir: {e}"))?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("could not read settings: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("could not parse settings: {e}"))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let raw = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("could not serialize settings: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("could not write settings: {e}"))
}

/// Best-effort auto-detection of the FL Studio executable. This covers the
/// common install locations; the user can always override it manually since
/// FL Studio's install path/version varies a lot machine to machine.
#[tauri::command]
pub fn detect_fl_studio() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // FL's installer records the exact exe here, wherever it was installed
        // (e.g. D:\Programmes\Image-Line\FL64.exe).
        use winreg::enums::HKEY_LOCAL_MACHINE;
        let from_registry = winreg::RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey("SOFTWARE\\Image-Line\\Shared\\Paths")
            .and_then(|k| k.get_value::<String, _>("FL Studio"))
            .ok()
            .filter(|p| std::path::Path::new(p).exists());
        if from_registry.is_some() {
            return from_registry;
        }

        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let base = std::path::Path::new(&program_files).join("Image-Line");
        if let Ok(entries) = fs::read_dir(&base) {
            let mut versions: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .to_lowercase()
                        .starts_with("fl studio")
                })
                .collect();
            versions.sort_by_key(|e| e.file_name());
            for entry in versions.into_iter().rev() {
                let exe = entry.path().join("FL64.exe");
                if exe.exists() {
                    return Some(exe.to_string_lossy().to_string());
                }
            }
        }
        None
    }

    #[cfg(target_os = "macos")]
    {
        let base = std::path::Path::new("/Applications");
        if let Ok(entries) = fs::read_dir(base) {
            let mut apps: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    n.starts_with("fl studio") && n.ends_with(".app")
                })
                .collect();
            apps.sort_by_key(|e| e.file_name());
            for entry in apps.into_iter().rev() {
                let macos_dir = entry.path().join("Contents/MacOS");
                if let Ok(bin_entries) = fs::read_dir(&macos_dir) {
                    for bin in bin_entries.filter_map(|e| e.ok()) {
                        if bin.path().is_file() {
                            return Some(bin.path().to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
        None
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}
