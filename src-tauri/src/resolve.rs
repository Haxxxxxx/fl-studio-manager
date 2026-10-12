use crate::flp_metadata::RawPlugin;
use crate::models::{PluginInfo, SampleInfo, SampleStatus};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Turns the raw sample paths / plugins stored in a .flp into what's
/// actually true on this machine. Built once per scan and cached, since
/// most projects share the same plugin folders and song folders.
pub struct Resolver {
    factory_data: Option<PathBuf>,
    /// Lowercased file stems of every plugin in the standard folders
    /// ("fabfilter pro-ds" for FabFilter Pro-DS.vst3/.dll/.clap).
    installed_plugins: HashSet<String>,
    exists_cache: HashMap<String, bool>,
    folder_files: HashMap<PathBuf, HashMap<String, PathBuf>>,
}

/// Paths stored in a .flp use the separators of the OS it was saved on. A
/// project made on Windows and opened on macOS has `C:\…\kick.wav`, where
/// `\` isn't a separator — normalize so file names and folders resolve.
fn native(raw: &str) -> String {
    if cfg!(windows) {
        raw.to_string()
    } else {
        raw.replace('\\', "/")
    }
}

fn lower_file_name(p: &Path) -> Option<String> {
    p.file_name().map(|n| n.to_string_lossy().to_lowercase())
}

fn lower_file_stem(p: &Path) -> Option<String> {
    p.file_stem().map(|n| n.to_string_lossy().to_lowercase())
}

/// FL's `%FLStudioUserData%` is the folder that contains `Projects`
/// (e.g. `Documents\Image-Line\FL Studio`); derive it from the project path.
fn user_data_for(project: &Path) -> Option<PathBuf> {
    project
        .ancestors()
        .find(|a| a.file_name().is_some_and(|n| n.eq_ignore_ascii_case("Projects")))
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
}

fn plugin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for var in ["CommonProgramFiles", "CommonProgramFiles(x86)"] {
        if let Ok(common) = std::env::var(var) {
            dirs.push(Path::new(&common).join("VST3"));
            dirs.push(Path::new(&common).join("CLAP"));
            dirs.push(Path::new(&common).join("VST2"));
        }
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(var) {
            dirs.push(Path::new(&pf).join("VstPlugins"));
            dirs.push(Path::new(&pf).join("Steinberg").join("VstPlugins"));
        }
    }
    // FL's own "VST plugins" search folder, set in its File settings.
    #[cfg(target_os = "windows")]
    if let Ok(p) = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Image-Line\\Shared\\Paths")
        .and_then(|k| k.get_value::<String, _>("VST plugins"))
    {
        dirs.push(PathBuf::from(p));
    }
    // Per-user installs (many installers default to these).
    #[cfg(target_os = "windows")]
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        dirs.push(Path::new(&local).join("Programs").join("Common").join("VST3"));
        dirs.push(Path::new(&local).join("Programs").join("Common").join("CLAP"));
    }
    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![PathBuf::from("/Library/Audio/Plug-Ins")];
        if let Ok(home) = std::env::var("HOME") {
            roots.push(Path::new(&home).join("Library/Audio/Plug-Ins"));
        }
        for root in roots {
            for d in ["VST3", "VST", "CLAP", "Components"] {
                dirs.push(root.join(d));
            }
        }
    }
    dirs
}

impl Resolver {
    pub fn new(fl_studio_exe: Option<String>) -> Self {
        let mut installed_plugins = HashSet::new();
        for dir in plugin_dirs() {
            for entry in WalkDir::new(dir).max_depth(4).into_iter().filter_map(|e| e.ok()) {
                // .vst3 bundles are folders; .dll/.clap are files — take both.
                if let Some(stem) = lower_file_stem(entry.path()) {
                    installed_plugins.insert(stem);
                }
            }
        }
        Self {
            factory_data: fl_studio_exe.and_then(|p| Path::new(&p).parent().map(Path::to_path_buf)),
            installed_plugins,
            exists_cache: HashMap::new(),
            folder_files: HashMap::new(),
        }
    }

    fn exists(&mut self, path: &str) -> bool {
        if let Some(&hit) = self.exists_cache.get(path) {
            return hit;
        }
        let hit = Path::new(path).exists();
        self.exists_cache.insert(path.to_string(), hit);
        hit
    }

    fn expand(&self, raw: &str, project: &Path) -> String {
        let mut out = raw.to_string();
        if out.contains("%FLStudioUserData%") {
            if let Some(ud) = user_data_for(project) {
                out = out.replace("%FLStudioUserData%", &ud.to_string_lossy());
            }
        }
        if let Some(fd) = &self.factory_data {
            out = out.replace("%FLStudioFactoryData%", &fd.to_string_lossy());
        }
        out
    }

    /// Files anywhere inside the song's folder (a few levels deep), by
    /// lowercased name.
    fn files_in_song_folder(&mut self, folder: &Path) -> &HashMap<String, PathBuf> {
        self.folder_files.entry(folder.to_path_buf()).or_insert_with(|| {
            WalkDir::new(folder)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter_map(|e| lower_file_name(e.path()).map(|n| (n, e.path().to_path_buf())))
                .collect()
        })
    }

    /// Where a stored sample path actually is on disk right now, if anywhere.
    fn locate(&mut self, raw: &str, project: &Path) -> (String, SampleStatus, Option<PathBuf>) {
        // Shown as stored (what FL displays); looked up with native separators.
        let path = self.expand(raw, project);
        let on_disk = native(&path);
        if self.exists(&on_disk) {
            return (path, SampleStatus::Ok, Some(PathBuf::from(on_disk)));
        }
        let folder = project.parent().unwrap_or(project).to_path_buf();
        let moved = lower_file_name(Path::new(&on_disk))
            .and_then(|n| self.files_in_song_folder(&folder).get(&n).cloned());
        match moved {
            Some(p) => (path, SampleStatus::Relocated, Some(p)),
            None => (path, SampleStatus::Missing, None),
        }
    }

    pub fn samples(&mut self, raw: &[String], project: &Path) -> Vec<SampleInfo> {
        raw.iter()
            .map(|r| {
                let (path, status, _) = self.locate(r, project);
                SampleInfo { path, status }
            })
            .collect()
    }

    /// Files to put in a package for this project: every sample that can be
    /// found (moved ones at their new location), plus the stored paths that
    /// couldn't be.
    pub fn package_files(&mut self, raw: &[String], project: &Path) -> (Vec<PathBuf>, Vec<String>) {
        let mut found = Vec::new();
        let mut missing = Vec::new();
        for r in raw {
            match self.locate(r, project) {
                (_, _, Some(p)) => found.push(p),
                (path, _, None) => missing.push(path),
            }
        }
        (found, missing)
    }

    pub fn plugins(&mut self, raw: &[RawPlugin]) -> Vec<PluginInfo> {
        raw.iter()
            .map(|p| {
                // Third-party = hosted by Fruity Wrapper, which is where the
                // path comes from. FL finds plugins by identity, not path, so
                // a project saved on another PC (VST2 .dll on D:\…) still
                // counts as installed if the same plugin is here in any
                // format: match the stored path, its file stem, or the name.
                let installed = p.path.as_deref().map(native).map(|path| {
                    self.exists(&path)
                        || lower_file_stem(Path::new(&path)).is_some_and(|s| self.installed_plugins.contains(&s))
                        || self.installed_plugins.contains(&p.name.to_lowercase())
                });
                PluginInfo {
                    name: p.name.clone(),
                    vendor: p.vendor.clone(),
                    installed,
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_data_is_parent_of_projects() {
        let p = Path::new("D:/Docs/Image-Line/FL Studio/Projects/Envy/Envy.flp");
        assert_eq!(user_data_for(p), Some(PathBuf::from("D:/Docs/Image-Line/FL Studio")));
        assert_eq!(user_data_for(Path::new("D:/Music/Envy/Envy.flp")), None);
    }

    #[test]
    fn classifies_samples() {
        let root = std::env::temp_dir().join(format!("flsm-resolve-{}", std::process::id()));
        let song = root.join("Projects").join("Envy");
        std::fs::create_dir_all(song.join("Audio")).unwrap();
        std::fs::write(song.join("Audio").join("take1.wav"), b"x").unwrap();
        std::fs::write(song.join("kick.wav"), b"x").unwrap();
        let project = song.join("Envy.flp");

        let mut r = Resolver::new(None);
        let raw = vec![
            "%FLStudioUserData%\\Projects\\Envy\\kick.wav".to_string(),
            // Moved: recorded under an old folder, now in this song's Audio/.
            "%FLStudioUserData%\\Projects\\Old\\Envy\\Audio\\take1.wav".to_string(),
            "C:\\Downloads\\gone.mp3".to_string(),
        ];
        let statuses: Vec<_> = r.samples(&raw, &project).into_iter().map(|s| s.status).collect();
        let _ = std::fs::remove_dir_all(&root);
        assert_eq!(statuses, vec![SampleStatus::Ok, SampleStatus::Relocated, SampleStatus::Missing]);
    }
}
