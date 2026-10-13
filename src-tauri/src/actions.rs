use crate::daws::{self, Daw};
use crate::models::TemplateInfo;
use std::fs;
use std::path::{Path, PathBuf};

fn validate_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("name can't be empty".to_string());
    }
    if name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        || name == "."
        || name == ".."
    {
        return Err(r#"name can't contain / \ : * ? " < > |"#.to_string());
    }
    Ok(name)
}

/// `<dir>/<base>.<ext>`, or `<base> (2).<ext>`, `(3)`… if taken.
fn free_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{base}.{ext}"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{base} ({n}).{ext}")))
        .find(|p| !p.exists())
        .expect("unbounded range always yields a free path")
}

fn copy_file(from: &Path, to: &Path) -> Result<(), String> {
    fs::copy(from, to)
        .map(|_| ())
        .map_err(|e| format!("could not copy {} → {}: {e}", from.display(), to.display()))
}

/// Where FL keeps its factory templates. Windows: `<install>/Data/Templates`.
/// macOS: somewhere inside the `.app` bundle (the exe is in
/// `Contents/MacOS`), so look for a `Data/Templates` folder in the bundle
/// rather than hardcoding a layout that varies between FL versions.
fn factory_templates_dir(fl_studio_path: &str) -> Option<PathBuf> {
    let exe = Path::new(fl_studio_path);
    let windows_layout = exe.parent()?.join("Data").join("Templates");
    if windows_layout.is_dir() {
        return Some(windows_layout);
    }
    let bundle = exe.ancestors().find(|a| a.extension().is_some_and(|x| x.eq_ignore_ascii_case("app")))?;
    walkdir::WalkDir::new(bundle.join("Contents"))
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
        .find(|e| {
            e.file_type().is_dir()
                && e.file_name() == "Templates"
                && e.path().parent().and_then(Path::file_name).is_some_and(|n| n == "Data")
        })
        .map(|e| e.path().to_path_buf())
}

/// FL's factory templates: `<templates>/<category>/<name>/<name>.flp`.
#[tauri::command]
pub fn list_templates(fl_studio_path: Option<String>) -> Vec<TemplateInfo> {
    let Some(base) = fl_studio_path.as_deref().and_then(factory_templates_dir) else {
        return Vec::new();
    };
    let mut templates: Vec<TemplateInfo> = walkdir::WalkDir::new(&base)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("flp"))
        })
        .map(|e| {
            let path = e.path();
            let category = path
                .strip_prefix(&base)
                .ok()
                .and_then(|rel| rel.components().next())
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .unwrap_or_default();
            TemplateInfo {
                name: path.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                category,
                path: path.to_string_lossy().to_string(),
            }
        })
        .collect();
    templates.sort_by(|a, b| (&a.category, &a.name).cmp(&(&b.category, &b.name)));
    templates
}

/// The template FL itself uses for File → New, from its registry settings.
#[tauri::command]
pub fn default_template(fl_studio_path: Option<String>) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        let install_dir = Path::new(fl_studio_path.as_deref()?).parent()?.to_path_buf();
        let image_line = winreg::RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("SOFTWARE\\Image-Line")
            .ok()?;
        // Newest "FL Studio NN" key first.
        let mut versions: Vec<String> = image_line
            .enum_keys()
            .filter_map(|k| k.ok())
            .filter(|k| k.starts_with("FL Studio "))
            .collect();
        versions.sort_by_key(|k| k[10..].parse::<u32>().unwrap_or(0));
        versions.into_iter().rev().find_map(|v| {
            let raw: String = image_line
                .open_subkey(format!("{v}\\General"))
                .ok()?
                .get_value("Template")
                .ok()?;
            let path = raw.replace("%FLStudioFactoryData%", &install_dir.to_string_lossy());
            Path::new(&path).exists().then_some(path)
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = fl_studio_path;
        None
    }
}

/// New song from a template, laid out the way FL does it:
/// `<parent>/<name>/<name>.flp`. Returns the new .flp path.
#[tauri::command]
pub fn create_project(template_path: String, parent_folder: String, name: String) -> Result<String, String> {
    let name = validate_name(&name)?;
    let template = Path::new(&template_path);
    if !template.is_file() {
        return Err(format!("template not found: {template_path}"));
    }
    let dir = Path::new(&parent_folder).join(name);
    let target = dir.join(format!("{name}.flp"));
    if target.exists() {
        return Err(format!("a project named \"{name}\" already exists there"));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("could not create project folder: {e}"))?;
    copy_file(template, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// The project file's own extension, as written (`flp`, `als`, `RPP`…).
fn project_ext(path: &Path) -> Result<String, String> {
    Daw::of_project(path).ok_or_else(|| format!("not a project file: {}", path.display()))?;
    Ok(path.extension().unwrap_or_default().to_string_lossy().to_string())
}

/// "Save as new version": copy the project next to itself under a new name,
/// sharing the same Audio/ and Samples/ folders.
#[tauri::command]
pub fn duplicate_project(project_path: String, new_name: String) -> Result<String, String> {
    let new_name = validate_name(&new_name)?;
    let src = Path::new(&project_path);
    let dir = src.parent().ok_or("invalid project path")?;
    let ext = project_ext(src)?;
    let target = dir.join(format!("{new_name}.{ext}"));
    if target.exists() {
        return Err(format!("\"{new_name}.{ext}\" already exists in that folder"));
    }
    copy_file(src, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// Bring a backup back as a *new* project file next to the project, never
/// overwriting the current version. It gets the project's extension, so a
/// REAPER `.rpp-bak` comes back as `.rpp` and a Cubase `.bak` as `.cpr`.
/// FL's `Envy (overwritten at 16h12).flp` becomes `Envy - restored 16h12.flp`;
/// other DAWs' timestamps are dropped (`Envy - restored.als`).
#[tauri::command]
pub fn restore_backup(backup_path: String, project_path: String) -> Result<String, String> {
    let backup = Path::new(&backup_path);
    let project = Path::new(&project_path);
    let dir = project.parent().ok_or("invalid project path")?;
    let project_name = project.file_stem().unwrap_or_default().to_string_lossy();
    let ext = project_ext(project)?;
    let daw = Daw::of_backup_file(backup)
        .or_else(|| Daw::of_project(backup))
        .ok_or_else(|| format!("not a backup file: {backup_path}"))?;

    let when = if daw == Daw::FlStudio {
        let stem = backup.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let base_len = daws::backup_base_name(daw, &stem).len();
        stem.get(base_len..)
            .unwrap_or_default()
            .trim()
            .trim_start_matches('(')
            .replace(')', "")
            .replace("overwritten at ", "")
            .replace("autosaved at ", "")
    } else {
        String::new()
    };
    let base = if when.is_empty() {
        format!("{project_name} - restored")
    } else {
        format!("{project_name} - restored {when}")
    };
    let target = free_path(dir, &base, &ext);
    copy_file(backup, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// Send backups to the Recycle Bin (recoverable). Refuses anything the
/// scanner wouldn't list as a backup, so a bad call can't touch real
/// projects.
#[tauri::command]
pub async fn trash_backups(paths: Vec<String>) -> Result<u32, String> {
    if let Some(p) = paths.iter().find(|p| !daws::is_backup_file(Path::new(p))) {
        return Err(format!("refusing to delete non-backup file: {p}"));
    }
    let count = paths.len() as u32;
    tauri::async_runtime::spawn_blocking(move || trash::delete_all(&paths))
        .await
        .map_err(|e| format!("cleanup failed: {e}"))?
        .map_err(|e| format!("could not move backups to the Recycle Bin: {e}"))?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_names() {
        assert!(validate_name("").is_err());
        assert!(validate_name("a/b").is_err());
        assert!(validate_name("..").is_err());
        assert_eq!(validate_name("  Envy v2 ").unwrap(), "Envy v2");
    }

    #[test]
    fn restore_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("flsm-restore-{}", std::process::id()));
        fs::create_dir_all(dir.join("Backup")).unwrap();
        let project = dir.join("Envy.flp");
        let backup = dir.join("Backup").join("Envy (overwritten at 16h12).flp");
        fs::write(&project, b"current").unwrap();
        fs::write(&backup, b"old").unwrap();

        let p = project.to_string_lossy().to_string();
        let b = backup.to_string_lossy().to_string();
        let first = restore_backup(b.clone(), p.clone()).unwrap();
        let second = restore_backup(b, p).unwrap();

        assert!(first.ends_with("Envy - restored 16h12.flp"), "{first}");
        assert!(second.ends_with("Envy - restored 16h12 (2).flp"), "{second}");
        assert_eq!(fs::read(&project).unwrap(), b"current");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn creates_and_versions_projects_without_clobbering() {
        let dir = std::env::temp_dir().join(format!("flsm-create-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let template = dir.join("template.flp");
        fs::write(&template, b"template bytes").unwrap();
        let t = template.to_string_lossy().to_string();
        let parent = dir.to_string_lossy().to_string();

        let created = create_project(t.clone(), parent.clone(), "Envy".into()).unwrap();
        assert!(created.ends_with(&format!("Envy{}Envy.flp", std::path::MAIN_SEPARATOR)), "{created}");
        assert_eq!(fs::read(&created).unwrap(), b"template bytes");
        // Same name again must fail, not overwrite.
        fs::write(&created, b"my work").unwrap();
        assert!(create_project(t, parent, "Envy".into()).is_err());
        assert_eq!(fs::read(&created).unwrap(), b"my work");

        let v2 = duplicate_project(created.clone(), "Envy v2".into()).unwrap();
        assert_eq!(fs::read(&v2).unwrap(), b"my work");
        assert!(duplicate_project(created, "Envy v2".into()).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn trash_refuses_real_projects() {
        for p in ["D:\\Projects\\Envy\\Envy.flp", "/m/Wave Project/Wave.als", "/m/Tide/Tide.rpp", "/m/Fade/Fade.cpr", "/m/Envy/Backup/cover.png"] {
            let result = tauri::async_runtime::block_on(trash_backups(vec![p.to_string()]));
            assert!(result.is_err(), "{p}");
        }
        // One real project in the batch refuses the whole batch.
        let mixed = vec!["/m/Tide/Tide.rpp-bak".to_string(), "/m/Tide/Tide.rpp".to_string()];
        assert!(tauri::async_runtime::block_on(trash_backups(mixed)).is_err());
    }

    #[test]
    fn trash_accepts_every_daws_backups() {
        let dir = std::env::temp_dir().join(format!("flsm-trash-{}", std::process::id()));
        let files = [
            "Envy/Backup/Envy (overwritten at 16h12).flp",
            "Wave Project/Backup/Wave [2026-10-12 143005].als",
            "Tide/Tide.rpp-bak",
            "Fade/Fade-01.bak",
            "Rush/Session File Backups/Rush.bak.001.ptx",
            "Glow/History/Glow (2).song",
        ];
        let paths: Vec<String> = files
            .iter()
            .map(|rel| {
                let p = dir.join(rel);
                fs::create_dir_all(p.parent().unwrap()).unwrap();
                fs::write(&p, b"x").unwrap();
                p.to_string_lossy().to_string()
            })
            .collect();
        for p in &paths {
            assert!(daws::is_backup_file(Path::new(p)), "{p}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicates_keep_the_projects_extension() {
        let dir = std::env::temp_dir().join(format!("flsm-dup-als-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("Wave.als");
        fs::write(&src, b"gz bytes").unwrap();
        let s = src.to_string_lossy().to_string();
        let v2 = duplicate_project(s.clone(), "Wave v2".into()).unwrap();
        assert!(v2.ends_with("Wave v2.als"), "{v2}");
        assert_eq!(fs::read(&v2).unwrap(), b"gz bytes");
        assert!(duplicate_project(s, "Wave v2".into()).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn restores_ableton_reaper_and_cubase_backups_as_projects() {
        let dir = std::env::temp_dir().join(format!("flsm-restore-daws-{}", std::process::id()));
        let w = |rel: &str, bytes: &[u8]| {
            let p = dir.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, bytes).unwrap();
            p.to_string_lossy().to_string()
        };
        let wave = w("Wave Project/Wave.als", b"current");
        let wave_bak = w("Wave Project/Backup/Wave [2026-10-12 143005].als", b"old");
        let tide = w("Tide/Tide.rpp", b"current");
        let tide_bak = w("Tide/Tide.rpp-bak", b"old");
        let fade = w("Fade/Fade.cpr", b"current");
        let fade_bak = w("Fade/Fade-01.bak", b"old");

        let restored = restore_backup(wave_bak.clone(), wave.clone()).unwrap();
        assert!(restored.ends_with(&format!("Wave Project{}Wave - restored.als", std::path::MAIN_SEPARATOR)), "{restored}");
        assert_eq!(fs::read(&restored).unwrap(), b"old");
        let again = restore_backup(wave_bak, wave.clone()).unwrap();
        assert!(again.ends_with("Wave - restored (2).als"), "{again}");

        let restored = restore_backup(tide_bak, tide).unwrap();
        assert!(restored.ends_with("Tide - restored.rpp"), "{restored}");
        let restored = restore_backup(fade_bak, fade).unwrap();
        assert!(restored.ends_with("Fade - restored.cpr"), "{restored}");

        assert_eq!(fs::read(&wave).unwrap(), b"current");
        let _ = fs::remove_dir_all(&dir);
    }
}
