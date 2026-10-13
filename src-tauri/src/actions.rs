use crate::models::TemplateInfo;
use crate::scanner::backup_base_name;
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

/// `<dir>/<base>.flp`, or `<base> (2).flp`, `(3)`… if taken.
fn free_flp_path(dir: &Path, base: &str) -> PathBuf {
    let first = dir.join(format!("{base}.flp"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{base} ({n}).flp")))
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

/// "Save as new version": copy the .flp next to itself under a new name,
/// sharing the same Audio/ and Samples/ folders.
#[tauri::command]
pub fn duplicate_project(project_path: String, new_name: String) -> Result<String, String> {
    let new_name = validate_name(&new_name)?;
    let src = Path::new(&project_path);
    let dir = src.parent().ok_or("invalid project path")?;
    let target = dir.join(format!("{new_name}.flp"));
    if target.exists() {
        return Err(format!("\"{new_name}.flp\" already exists in that folder"));
    }
    copy_file(src, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// Bring a backup back as a *new* file next to the project — never
/// overwrites the current version. `Envy (overwritten at 16h12).flp`
/// becomes `Envy - restored 16h12.flp`.
#[tauri::command]
pub fn restore_backup(backup_path: String, project_path: String) -> Result<String, String> {
    let backup = Path::new(&backup_path);
    let project = Path::new(&project_path);
    let dir = project.parent().ok_or("invalid project path")?;
    let project_name = project.file_stem().unwrap_or_default().to_string_lossy();

    let stem = backup.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let when = stem[backup_base_name(&stem).len()..]
        .trim()
        .trim_start_matches('(')
        .replace(')', "")
        .replace("overwritten at ", "")
        .replace("autosaved at ", "");
    let base = if when.is_empty() {
        format!("{project_name} - restored")
    } else {
        format!("{project_name} - restored {when}")
    };
    let target = free_flp_path(dir, &base);
    copy_file(backup, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// Send backups to the Recycle Bin (recoverable). Refuses anything that
/// isn't a .flp inside a `Backup` folder, so a bad call can't touch real
/// projects.
#[tauri::command]
pub async fn trash_backups(paths: Vec<String>) -> Result<u32, String> {
    for p in &paths {
        let path = Path::new(p);
        let in_backup_dir = path
            .parent()
            .and_then(|d| d.file_name())
            .is_some_and(|n| n.eq_ignore_ascii_case("Backup"));
        let is_flp = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("flp"));
        if !in_backup_dir || !is_flp {
            return Err(format!("refusing to delete non-backup file: {p}"));
        }
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
        let result = tauri::async_runtime::block_on(trash_backups(vec![
            "D:\\Projects\\Envy\\Envy.flp".to_string(),
        ]));
        assert!(result.is_err());
    }
}
