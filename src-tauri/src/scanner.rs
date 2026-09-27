use crate::flp_metadata;
use crate::models::ProjectInfo;
use walkdir::WalkDir;

#[tauri::command]
pub fn scan_projects(folders: Vec<String>) -> Result<Vec<ProjectInfo>, String> {
    let mut projects = Vec::new();

    for root in &folders {
        let root_path = std::path::Path::new(root);
        if !root_path.exists() {
            continue;
        }

        for entry in WalkDir::new(root_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let is_flp = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("flp"))
                .unwrap_or(false);
            if !is_flp {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified_at_ms = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            let name = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled".to_string());
            let folder = path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // Best-effort: a corrupt or oddly-shaped .flp shouldn't fail
            // the whole scan, it just shows up with no metadata.
            let flp_meta = flp_metadata::parse_flp_metadata(path).unwrap_or_default();

            projects.push(ProjectInfo {
                path: path.to_string_lossy().to_string(),
                name,
                folder,
                size_bytes: metadata.len(),
                modified_at_ms,
                root: root.clone(),
                genre: flp_meta.genre,
                artist: flp_meta.artist,
                tempo_bpm: flp_meta.tempo_bpm,
                time_sig_num: flp_meta.time_sig_num,
                time_sig_denom: flp_meta.time_sig_denom,
                fl_version: flp_meta.fl_version,
            });
        }
    }

    projects.sort_by(|a, b| b.modified_at_ms.cmp(&a.modified_at_ms));
    Ok(projects)
}
