use std::fs;
use tauri::{AppHandle, Manager};

// The workspace is the app's own data — song statuses, tags, notes and
// albums — none of which FL Studio stores. The frontend owns its shape;
// the backend just persists it next to settings.json.

fn workspace_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create config dir: {e}"))?;
    Ok(dir.join("workspace.json"))
}

#[tauri::command]
pub fn get_workspace(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = workspace_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("could not read workspace: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("could not parse workspace: {e}"))
}

#[tauri::command]
pub fn save_workspace(app: AppHandle, workspace: serde_json::Value) -> Result<(), String> {
    let path = workspace_path(&app)?;
    let raw = serde_json::to_string_pretty(&workspace)
        .map_err(|e| format!("could not serialize workspace: {e}"))?;
    // Write-then-rename so a crash mid-write can't wipe the user's albums.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw).map_err(|e| format!("could not write workspace: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("could not save workspace: {e}"))
}
