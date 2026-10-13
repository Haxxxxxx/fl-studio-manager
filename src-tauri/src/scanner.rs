use crate::flp_metadata;
use crate::models::{FileEntry, ProjectInfo, StemsInfo};
use crate::resolve::Resolver;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

const AUDIO_EXTS: &[&str] = &["wav", "mp3", "ogg", "flac"];

fn has_ext(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
        .unwrap_or(false)
}

fn modified_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn file_entry(path: &Path) -> Option<FileEntry> {
    let meta = fs::metadata(path).ok()?;
    Some(FileEntry {
        path: path.to_string_lossy().to_string(),
        size_bytes: meta.len(),
        modified_at_ms: modified_ms(&meta),
    })
}

fn stem_of(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// True if any folder between `root` and the file is named `name`.
fn under_dir_named(path: &Path, root: &Path, name: &str) -> bool {
    path.strip_prefix(root)
        .ok()
        .and_then(|rel| rel.parent())
        .map(|p| {
            p.components()
                .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(name))
        })
        .unwrap_or(false)
}

/// FL names backups `<project> (overwritten at 16h12).flp` or
/// `<project> (autosaved at 16h43)_2.flp`; recover `<project>`.
pub(crate) fn backup_base_name(stem: &str) -> &str {
    for marker in [" (overwritten at ", " (autosaved at "] {
        if let Some(i) = stem.find(marker) {
            return &stem[..i];
        }
    }
    stem
}

/// FL names recorded takes `<project>_<YYYY-MM-DD HH-MM-SS>_<mixer track>`,
/// plus `_2` / ` - Part_1` / ` (consolidated)` suffixes. Returns the mixer
/// track part ("Lead Voices - Nova").
pub(crate) fn recording_label(stem: &str) -> Option<String> {
    // Find "_YYYY-MM-DD HH-MM-SS_" by shape rather than by project name, so
    // takes recorded under an older project name still work.
    let bytes = stem.as_bytes();
    let is_stamp = |s: &[u8]| {
        s.len() == 19
            && s.iter().enumerate().all(|(i, &c)| match i {
                4 | 7 | 13 | 16 => c == b'-',
                10 => c == b' ',
                _ => c.is_ascii_digit(),
            })
    };
    let start = (0..bytes.len().saturating_sub(20))
        .find(|&i| bytes[i] == b'_' && is_stamp(&bytes[i + 1..i + 20]) && bytes.get(i + 20) == Some(&b'_'))?;
    let mut label = stem[start + 21..].trim();
    for suffix in [" (consolidated)"] {
        label = label.strip_suffix(suffix).unwrap_or(label);
    }
    if let Some(i) = label.find(" - Part_") {
        label = &label[..i];
    }
    if let Some((head, tail)) = label.rsplit_once('_') {
        if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
            label = head;
        }
    }
    let label = label.trim();
    (!is_generic_track_name(label)).then(|| label.to_string())
}

/// "Insert 9", "REC", "Master"… carry no information.
fn is_generic_track_name(name: &str) -> bool {
    let lower = name.trim().to_lowercase();
    if lower.is_empty() || ["rec", "master", "mixer", "current", "untitled"].contains(&lower.as_str()) {
        return true;
    }
    lower
        .strip_prefix("insert")
        .is_some_and(|rest| rest.trim().chars().all(|c| c.is_ascii_digit()))
}

fn push_track_name(names: &mut Vec<String>, name: &str) {
    let name = name.trim();
    if !is_generic_track_name(name) && !names.iter().any(|n| n.eq_ignore_ascii_case(name)) {
        names.push(name.to_string());
    }
}

fn by_newest(a: &FileEntry, b: &FileEntry) -> std::cmp::Ordering {
    b.modified_at_ms.cmp(&a.modified_at_ms)
}

fn non_empty(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// Normalizes an exported file's stem back to the song name it came from:
/// "03 - Envy" (release export) and "Envy (2)" (name clash) → "envy".
pub(crate) fn export_song_key(stem: &str) -> String {
    let mut s = stem.trim();
    if let Some((num, rest)) = s.split_once(" - ") {
        if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
            s = rest;
        }
    }
    if let Some(open) = s.rfind(" (") {
        let inner = &s[open + 2..];
        if inner.ends_with(')') && inner[..inner.len() - 1].chars().all(|c| c.is_ascii_digit()) && inner.len() > 1 {
            s = &s[..open];
        }
    }
    s.to_lowercase()
}

/// Mixdowns exported by this app land in the export folder, not next to
/// the project; index them by song name so they count as the song's render.
/// Where the Launch Kit exports go, inside the export folder.
pub(crate) const LAUNCH_KITS_DIR: &str = "Launch Kits";

fn index_exports(output_folder: Option<&str>) -> HashMap<String, Vec<FileEntry>> {
    let mut index: HashMap<String, Vec<FileEntry>> = HashMap::new();
    let Some(dir) = output_folder else { return index };
    // Launch kits hold copies of masters, not new mixdowns: indexing them
    // would make a kit's own copy the song's "latest render".
    let walker = WalkDir::new(dir)
        .max_depth(3)
        .into_iter()
        .filter_entry(|e| !(e.depth() == 1 && e.file_type().is_dir() && e.file_name() == LAUNCH_KITS_DIR));
    for entry in walker.filter_map(|e| e.ok()) {
        let path = entry.path();
        if entry.file_type().is_file() && has_ext(path, AUDIO_EXTS) {
            if let Some(fe) = file_entry(path) {
                index.entry(export_song_key(&stem_of(path))).or_default().push(fe);
            }
        }
    }
    index
}

fn scan(folders: &[String], output_folder: Option<&str>) -> Vec<ProjectInfo> {
    let exports = index_exports(output_folder);
    let mut resolver = Resolver::new(crate::settings::detect_fl_studio());
    let mut seen = HashSet::new();
    let mut projects: Vec<ProjectInfo> = Vec::new();
    let mut backups: Vec<PathBuf> = Vec::new();

    for root in folders {
        let root_path = Path::new(root);
        if !root_path.exists() {
            continue;
        }
        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if !entry.file_type().is_file() || !has_ext(path, &["flp"]) {
                continue;
            }
            // macOS metadata twins (`._Envy.flp`, `__MACOSX/`) from unzipped
            // packages or exFAT drives aren't projects.
            if entry.file_name().to_string_lossy().starts_with("._")
                || path.components().any(|c| c.as_os_str() == "__MACOSX")
            {
                continue;
            }
            // Overlapping linked folders would otherwise list a project twice.
            if !seen.insert(path.to_string_lossy().to_lowercase()) {
                continue;
            }
            if under_dir_named(path, root_path, "Backup") {
                backups.push(path.to_path_buf());
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };

            // Best-effort: a corrupt or oddly-shaped .flp shouldn't fail
            // the whole scan, it just shows up with no metadata.
            let flp = flp_metadata::parse_flp_metadata(path).unwrap_or_default();

            projects.push(ProjectInfo {
                path: path.to_string_lossy().to_string(),
                name: stem_of(path),
                folder: path
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default(),
                size_bytes: meta.len(),
                modified_at_ms: modified_ms(&meta),
                root: root.clone(),
                genre: non_empty(flp.genre),
                artist: non_empty(flp.artist),
                tempo_bpm: flp.tempo_bpm,
                time_sig_num: flp.time_sig_num,
                time_sig_denom: flp.time_sig_denom,
                fl_version: flp.fl_version,
                is_template: under_dir_named(path, root_path, "Templates"),
                backups: Vec::new(),
                renders: Vec::new(),
                recordings_count: 0,
                recordings_bytes: 0,
                stems: None,
                plugins: resolver.plugins(&flp.plugins),
                samples: resolver.samples(&flp.samples, path),
                track_names: {
                    let mut names = Vec::new();
                    for n in &flp.mixer_names {
                        push_track_name(&mut names, n);
                    }
                    names
                },
            });
        }
    }

    // Index projects by the folder they live in.
    let mut by_folder: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, p) in projects.iter().enumerate() {
        by_folder.entry(p.folder.to_lowercase()).or_default().push(i);
    }

    // A backup in `<dir>/Backup/` belongs to the project in `<dir>` with the
    // same base name, or to the only project there if names don't match
    // (the project was renamed after the backups were made).
    for backup in backups {
        let Some(project_dir) = backup.parent().and_then(|p| p.parent()) else {
            continue;
        };
        let Some(candidates) = by_folder.get(&project_dir.to_string_lossy().to_lowercase()) else {
            continue;
        };
        let stem = stem_of(&backup);
        let base = backup_base_name(&stem);
        let owner = candidates
            .iter()
            .copied()
            .find(|&i| projects[i].name.eq_ignore_ascii_case(base))
            .or_else(|| (candidates.len() == 1).then(|| candidates[0]));
        if let (Some(i), Some(entry)) = (owner, file_entry(&backup)) {
            projects[i].backups.push(entry);
        }
    }

    // Renders sit next to the .flp; recordings in the sibling Audio/ folder.
    for indices in by_folder.values() {
        let dir = PathBuf::from(&projects[indices[0]].folder);
        let siblings: Vec<PathBuf> = read_files(&dir);
        let recordings: Vec<PathBuf> = read_files(&dir.join("Audio"));
        let stem_dirs: Vec<PathBuf> = read_dirs(&dir)
            .into_iter()
            .filter(|d| d.file_name().map(|n| n.to_string_lossy().to_lowercase().contains("stem")).unwrap_or(false))
            .collect();

        for &i in indices {
            let name = projects[i].name.to_lowercase();
            // FL's split-mixer export: `<name>_<track>.wav`, one per track.
            // Two or more of them are stems, not mixdowns.
            let split_prefix = format!("{name}_");
            let split: Vec<&PathBuf> = siblings
                .iter()
                .filter(|p| has_ext(p, AUDIO_EXTS) && stem_of(p).to_lowercase().starts_with(&split_prefix))
                .collect();
            let split_are_stems = split.len() >= 2;
            let mut renders: Vec<FileEntry> = siblings
                .iter()
                .filter(|p| has_ext(p, AUDIO_EXTS) && stem_of(p).to_lowercase().starts_with(&name))
                .filter(|p| !(split_are_stems && stem_of(p).to_lowercase().starts_with(&split_prefix)))
                .filter_map(|p| file_entry(p))
                .collect();
            // A stems folder belongs to this song if it's the only song in the
            // folder, or the stems folder is named after it.
            let own_dir = stem_dirs
                .iter()
                .find(|d| d.file_name().map(|n| n.to_string_lossy().to_lowercase().contains(&name)).unwrap_or(false))
                .or_else(|| (indices.len() == 1).then(|| stem_dirs.first()).flatten());
            projects[i].stems = if let Some(sd) = own_dir {
                stems_info(sd, &read_files(sd))
            } else if split_are_stems {
                stems_info(&dir, &split.iter().map(|p| (*p).clone()).collect::<Vec<_>>())
            } else {
                None
            };
            if let Some(exported) = exports.get(&name) {
                renders.extend(exported.iter().cloned());
            }
            renders.sort_by(by_newest);
            projects[i].renders = renders;

            let prefix = format!("{name}_");
            for rec in recordings.iter().filter(|p| {
                has_ext(p, AUDIO_EXTS) && stem_of(p).to_lowercase().starts_with(&prefix)
            }) {
                if let Ok(meta) = fs::metadata(rec) {
                    projects[i].recordings_count += 1;
                    projects[i].recordings_bytes += meta.len();
                }
                if let Some(label) = recording_label(&stem_of(rec)) {
                    push_track_name(&mut projects[i].track_names, &label);
                }
            }
            projects[i].backups.sort_by(by_newest);
        }
    }

    merge_plugin_aliases(&mut projects);
    projects.sort_by(|a, b| b.modified_at_ms.cmp(&a.modified_at_ms));
    projects
}

/// The same plugin reports different names per format — FabFilter's CLAP
/// build says "Pro-Q 4", the VST3 "FabFilter Pro-Q 4". When the
/// vendor-prefixed name exists elsewhere in the library, use it, so usage
/// counts aren't split.
fn merge_plugin_aliases(projects: &mut [ProjectInfo]) {
    let names: HashSet<String> = projects.iter().flat_map(|p| &p.plugins).map(|p| p.name.clone()).collect();
    for project in projects.iter_mut() {
        for plugin in project.plugins.iter_mut() {
            if let Some(vendor) = &plugin.vendor {
                let prefixed = format!("{vendor} {}", plugin.name);
                if !plugin.name.starts_with(vendor.as_str()) && names.contains(&prefixed) {
                    plugin.name = prefixed;
                }
            }
        }
        // A song using both formats keeps one entry (installed if either is).
        let mut merged: Vec<crate::models::PluginInfo> = Vec::new();
        for plugin in project.plugins.drain(..) {
            match merged.iter_mut().find(|m| m.name == plugin.name) {
                Some(existing) => {
                    if plugin.installed == Some(true) {
                        existing.installed = Some(true);
                    }
                }
                None => merged.push(plugin),
            }
        }
        project.plugins = merged;
    }
}

fn read_dirs(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default()
}

/// Audio files among `files` as a stems summary; None if there are none.
fn stems_info(folder: &Path, files: &[PathBuf]) -> Option<StemsInfo> {
    let audio: Vec<FileEntry> = files.iter().filter(|p| has_ext(p, AUDIO_EXTS)).filter_map(|p| file_entry(p)).collect();
    (!audio.is_empty()).then(|| StemsInfo {
        folder: folder.to_string_lossy().to_string(),
        count: audio.len() as u32,
        bytes: audio.iter().map(|f| f.size_bytes).sum(),
        newest_ms: audio.iter().map(|f| f.modified_at_ms).max().unwrap_or(0),
    })
}

fn read_files(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_file())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn scan_projects(
    app: AppHandle,
    folders: Vec<String>,
    output_folder: Option<String>,
) -> Result<Vec<ProjectInfo>, String> {
    // Let the webview stream renders from linked folders and the export
    // folder (in-app playback) without opening the asset protocol to the
    // whole disk.
    let scope = app.asset_protocol_scope();
    for folder in folders.iter().chain(output_folder.iter()) {
        let _ = scope.allow_directory(folder, true);
    }
    tauri::async_runtime::spawn_blocking(move || scan(&folders, output_folder.as_deref()))
        .await
        .map_err(|e| format!("scan failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SampleStatus;

    #[test]
    fn launch_kit_copies_are_not_renders() {
        let out = std::env::temp_dir().join(format!("flsm-exports-{}", std::process::id()));
        let kit = out.join(LAUNCH_KITS_DIR).join("Envy");
        fs::create_dir_all(&kit).unwrap();
        fs::write(out.join("Envy.wav"), b"x").unwrap();
        fs::write(kit.join("Envy.wav"), b"x").unwrap();
        let index = index_exports(out.to_str());
        let _ = fs::remove_dir_all(&out);
        let renders = &index[&export_song_key("Envy")];
        assert_eq!(renders.len(), 1);
        assert!(!renders[0].path.contains(LAUNCH_KITS_DIR));
    }

    #[test]
    fn extracts_recording_labels() {
        let l = |s: &str| recording_label(s);
        assert_eq!(l("Envy_2025-12-15 18-49-59_Voice 1 - Kairo").as_deref(), Some("Voice 1 - Kairo"));
        assert_eq!(l("Envy_2025-12-16 22-16-05_Ambiance 2 - Kairo - Part_1").as_deref(), Some("Ambiance 2 - Kairo"));
        assert_eq!(l("Ft Le Q_2025-05-19 21-32-32_Main Voice - Feal_2").as_deref(), Some("Main Voice - Feal"));
        assert_eq!(l("Old_Name_2025-05-01 00-54-19_Ambiances 2 - NV ").as_deref(), Some("Ambiances 2 - NV"));
        assert_eq!(l("X_2025-02-01 17-51-18_REC (consolidated)"), None);
        assert_eq!(l("X_2025-02-01 17-51-18_Insert 9"), None);
        assert_eq!(l("not a recording"), None);
    }

    #[test]
    fn matches_exported_file_names_to_songs() {
        assert_eq!(export_song_key("Envy"), "envy");
        assert_eq!(export_song_key("03 - Envy"), "envy");
        assert_eq!(export_song_key("Envy (2)"), "envy");
        assert_eq!(export_song_key("01 - Ft Le Q (1)"), "ft le q");
        // Not numbering: keep the whole name.
        assert_eq!(export_song_key("Me - You"), "me - you");
        assert_eq!(export_song_key("Titre []"), "titre []");
        assert_eq!(export_song_key("Song (live)"), "song (live)");
    }

    #[test]
    fn strips_backup_suffixes() {
        assert_eq!(backup_base_name("Envy (overwritten at 16h12)"), "Envy");
        assert_eq!(backup_base_name("Envy (overwritten at 16h10)_2"), "Envy");
        assert_eq!(backup_base_name("doggy style (autosaved at 16h43)"), "doggy style");
        assert_eq!(backup_base_name("Plain"), "Plain");
    }

    /// `FLSM_REAL_PROJECTS="D:\...\Projects" cargo test -- --nocapture real_folder`
    #[test]
    fn scans_real_folder_if_available() {
        let Ok(root) = std::env::var("FLSM_REAL_PROJECTS") else { return };
        let projects = scan(&[root], std::env::var("FLSM_EXPORT_FOLDER").ok().as_deref());
        let backups: usize = projects.iter().map(|p| p.backups.len()).sum();
        let rendered = projects.iter().filter(|p| !p.renders.is_empty()).count();
        let templates = projects.iter().filter(|p| p.is_template).count();
        println!("{} songs, {backups} backups grouped, {rendered} with mixdowns, {templates} templates", projects.len());
        let count = |s: SampleStatus| projects.iter().flat_map(|p| &p.samples).filter(|x| x.status == s).count();
        println!(
            "samples: {} ok, {} relocated, {} missing",
            count(SampleStatus::Ok),
            count(SampleStatus::Relocated),
            count(SampleStatus::Missing)
        );
        let mut missing_plugins: Vec<_> = projects
            .iter()
            .flat_map(|p| &p.plugins)
            .filter(|p| p.installed == Some(false))
            .map(|p| p.name.as_str())
            .collect();
        missing_plugins.sort();
        missing_plugins.dedup();
        println!("plugins not installed: {missing_plugins:?}");
        for p in projects.iter().filter(|p| !p.track_names.is_empty()).take(6) {
            println!("  {} tracks: {:?}", p.name, p.track_names);
        }
        for p in projects.iter().take(5) {
            println!("  {} — {} backups, {} renders, {} recordings", p.name, p.backups.len(), p.renders.len(), p.recordings_count);
        }
        assert!(!projects.is_empty());
    }

    #[test]
    fn groups_backups_and_renders() {
        let root = std::env::temp_dir().join(format!("flsm-scan-test-{}", std::process::id()));
        let song = root.join("Envy");
        fs::create_dir_all(song.join("Backup")).unwrap();
        fs::create_dir_all(song.join("Audio")).unwrap();
        fs::write(song.join("Envy.flp"), b"not really an flp").unwrap();
        fs::write(song.join("Envy.wav"), b"x").unwrap();
        fs::write(song.join("Other.wav"), b"x").unwrap();
        fs::write(song.join("Backup/Envy (overwritten at 16h12).flp"), b"x").unwrap();
        fs::write(song.join("Backup/Envy (autosaved at 16h43)_2.flp"), b"x").unwrap();
        fs::write(song.join("Audio/Envy_2025-12-15 18-49-59_Voice.wav"), b"abc").unwrap();

        let projects = scan(&[root.to_string_lossy().to_string()], None);
        let _ = fs::remove_dir_all(&root);

        assert_eq!(projects.len(), 1);
        let p = &projects[0];
        assert_eq!(p.name, "Envy");
        assert_eq!(p.backups.len(), 2);
        assert_eq!(p.renders.len(), 1);
        assert_eq!(p.recordings_count, 1);
        assert_eq!(p.recordings_bytes, 3);
        assert!(p.stems.is_none());
    }

    #[test]
    fn split_mixer_exports_are_stems_not_renders() {
        let root = std::env::temp_dir().join(format!("flsm-stems-split-{}", std::process::id()));
        let song = root.join("Envy");
        fs::create_dir_all(&song).unwrap();
        fs::write(song.join("Envy.flp"), b"x").unwrap();
        fs::write(song.join("Envy.wav"), b"x").unwrap();
        fs::write(song.join("Envy_Kick.wav"), b"ab").unwrap();
        fs::write(song.join("Envy_Vox.wav"), b"abc").unwrap();
        let projects = scan(&[root.to_string_lossy().to_string()], None);
        let _ = fs::remove_dir_all(&root);
        let p = &projects[0];
        assert_eq!(p.renders.len(), 1, "only Envy.wav is a mixdown");
        assert!(p.renders[0].path.ends_with("Envy.wav"));
        let stems = p.stems.as_ref().expect("split exports are stems");
        assert_eq!((stems.count, stems.bytes), (2, 5));
    }

    #[test]
    fn a_single_suffixed_file_is_still_a_render() {
        let root = std::env::temp_dir().join(format!("flsm-stems-single-{}", std::process::id()));
        let song = root.join("Envy");
        fs::create_dir_all(&song).unwrap();
        fs::write(song.join("Envy.flp"), b"x").unwrap();
        fs::write(song.join("Envy_master.wav"), b"x").unwrap();
        let projects = scan(&[root.to_string_lossy().to_string()], None);
        let _ = fs::remove_dir_all(&root);
        assert_eq!(projects[0].renders.len(), 1);
        assert!(projects[0].stems.is_none());
    }

    #[test]
    fn a_stems_folder_belongs_to_its_song() {
        let root = std::env::temp_dir().join(format!("flsm-stems-dir-{}", std::process::id()));
        let shared = root.join("Beats");
        fs::create_dir_all(shared.join("Envy Stems")).unwrap();
        fs::write(shared.join("Envy.flp"), b"x").unwrap();
        fs::write(shared.join("Other.flp"), b"x").unwrap();
        fs::write(shared.join("Envy Stems/Drums.wav"), b"abcd").unwrap();
        fs::write(shared.join("Envy Stems/notes.txt"), b"x").unwrap();
        let projects = scan(&[root.to_string_lossy().to_string()], None);
        let _ = fs::remove_dir_all(&root);
        let envy = projects.iter().find(|p| p.name == "Envy").unwrap();
        let other = projects.iter().find(|p| p.name == "Other").unwrap();
        assert_eq!(envy.stems.as_ref().map(|s| (s.count, s.bytes)), Some((1, 4)));
        assert!(other.stems.is_none(), "a stems folder named after another song isn't this one's");
    }
}
