use crate::flp_metadata::RawPlugin;
use crate::models::{PluginInfo, SampleInfo, SampleStatus};
use crate::paths::is_remote_or_device;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Turns the raw sample paths / plugins stored in a .flp into what's
/// actually true on this machine. Built once per scan and cached, since
/// most projects share the same plugin folders and song folders.
pub struct Resolver {
    factory_data: Option<PathBuf>,
    /// FL's user data folder on this computer (`Documents/Image-Line/FL
    /// Studio`), for songs that don't live under its `Projects` folder.
    user_data: Option<PathBuf>,
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

/// FL's `%FLStudioFactoryData%`: the folder holding `Data/Patches`. Windows:
/// the install folder (next to the exe). macOS: somewhere inside the `.app`
/// bundle (the exe is in `Contents/MacOS`), so search for it rather than
/// hardcoding a layout that varies between FL versions.
pub fn factory_data_dir(fl_exe: &Path) -> Option<PathBuf> {
    let next_to_exe = fl_exe.parent()?;
    if next_to_exe.join("Data").join("Patches").is_dir() {
        return Some(next_to_exe.to_path_buf());
    }
    if let Some(bundle) = fl_exe.ancestors().find(|a| a.extension().is_some_and(|x| x.eq_ignore_ascii_case("app"))) {
        let found = WalkDir::new(bundle.join("Contents"))
            .max_depth(5)
            .into_iter()
            .filter_map(|e| e.ok())
            .find(|e| e.file_type().is_dir() && e.file_name() == "Data" && e.path().join("Patches").is_dir());
        if let Some(data) = found {
            return data.path().parent().map(Path::to_path_buf);
        }
    }
    Some(next_to_exe.to_path_buf())
}

/// A path saved on another computer (`C:\Users\x\Documents\Image-Line\FL
/// Studio\Audio\vox.wav`, `/Applications/FL Studio.app/…/Data/Patches/…`),
/// moved onto this computer's FL folders. ASCII-lowercased for the search so
/// byte offsets stay valid.
fn rerooted(path: &str, user_data: Option<&Path>, factory_data: Option<&Path>) -> Vec<PathBuf> {
    let norm = path.replace('\\', "/");
    let low = norm.to_ascii_lowercase();
    let mut out = Vec::new();
    if let (Some(ud), Some(i)) = (user_data, low.find("/image-line/fl studio/")) {
        out.push(ud.join(&norm[i + "/image-line/fl studio/".len()..]));
    }
    if let (Some(fd), Some(i)) = (factory_data, low.find("/data/patches/")) {
        out.push(fd.join(&norm[i + 1..]));
    }
    out
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
            factory_data: fl_studio_exe.and_then(|p| factory_data_dir(Path::new(&p))),
            user_data: None,
            installed_plugins,
            exists_cache: HashMap::new(),
            folder_files: HashMap::new(),
        }
    }

    /// FL's user data folder on this computer, used when a song isn't under
    /// a `Projects` folder (only if it exists).
    pub fn with_user_data(mut self, user_data: Option<PathBuf>) -> Self {
        self.user_data = user_data.filter(|p| p.is_dir());
        self
    }

    /// Network-share and device paths count as missing without a lookup
    /// (on Windows, a lookup sends the user's credentials to that host).
    fn exists(&mut self, path: &str) -> bool {
        if is_remote_or_device(path) {
            return false;
        }
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
            if let Some(ud) = user_data_for(project).or_else(|| self.user_data.clone()) {
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
        if is_remote_or_device(&path) {
            return (path, SampleStatus::Missing, None);
        }
        let on_disk = native(&path);
        if self.exists(&on_disk) {
            return (path, SampleStatus::Ok, Some(PathBuf::from(on_disk)));
        }
        // Saved on another computer: the same file under this one's FL folders.
        for candidate in rerooted(&path, self.user_data.as_deref(), self.factory_data.as_deref()) {
            let c = candidate.to_string_lossy().to_string();
            if !is_remote_or_device(&c) && self.exists(&c) {
                return (path, SampleStatus::Relocated, Some(candidate));
            }
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
    use std::fs;

    #[test]
    fn songs_saved_on_another_computer_find_this_ones_fl_folders() {
        let ud = Path::new("/Users/me/Documents/Image-Line/FL Studio");
        let fd = Path::new("/Applications/FL Studio 2024.app/Contents/Resources/FL");
        // Saved on Windows, opened on macOS.
        assert_eq!(
            rerooted(r"C:\Users\Kay\Documents\Image-Line\FL Studio\Audio\Recorded\vox.wav", Some(ud), Some(fd)),
            vec![ud.join("Audio/Recorded/vox.wav")]
        );
        assert_eq!(
            rerooted(r"C:\Program Files\Image-Line\FL Studio 21\Data\Patches\Packs\Drums\Kick.wav", Some(ud), Some(fd)),
            vec![fd.join("Data/Patches/Packs/Drums/Kick.wav")]
        );
        assert!(rerooted("/Users/me/Samples/kick.wav", Some(ud), Some(fd)).is_empty());
    }

    #[test]
    fn factory_data_is_found_inside_the_mac_bundle() {
        let root = std::env::temp_dir().join(format!("flsm-factory-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let app = root.join("FL Studio 2024.app");
        let exe = app.join("Contents/MacOS/FL Studio");
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::write(&exe, b"x").unwrap();
        fs::create_dir_all(app.join("Contents/Resources/FL/Data/Patches/Packs")).unwrap();
        let found = factory_data_dir(&exe);
        // Windows layout: Data next to the exe.
        let win = root.join("FL Studio 21");
        fs::create_dir_all(win.join("Data/Patches")).unwrap();
        fs::write(win.join("FL64.exe"), b"x").unwrap();
        let found_win = factory_data_dir(&win.join("FL64.exe"));
        let _ = fs::remove_dir_all(&root);
        assert_eq!(found, Some(app.join("Contents/Resources/FL")));
        assert_eq!(found_win, Some(win));
    }

    #[test]
    fn user_data_falls_back_to_fl_folder_outside_projects() {
        let root = std::env::temp_dir().join(format!("flsm-userdata-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let ud = root.join("Image-Line").join("FL Studio");
        fs::create_dir_all(ud.join("Audio")).unwrap();
        fs::write(ud.join("Audio").join("vox.wav"), b"x").unwrap();
        let song = root.join("Crew").join("Envy").join("Envy.flp");
        fs::create_dir_all(song.parent().unwrap()).unwrap();
        let mut r = Resolver::new(None).with_user_data(Some(ud.clone()));
        let (found, missing) = r.package_files(&[r"%FLStudioUserData%\Audio\vox.wav".to_string()], &song);
        let _ = fs::remove_dir_all(&root);
        assert!(missing.is_empty(), "{missing:?}");
        assert_eq!(found.len(), 1);
    }

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

    #[test]
    fn network_share_samples_are_missing_without_a_lookup() {
        let mut r = Resolver::new(None);
        let raw = vec![
            r"\\attacker\share\kick.wav".to_string(),
            "//attacker/share/snare.wav".to_string(),
            r"\\?\UNC\attacker\share\hat.wav".to_string(),
        ];
        let project = Path::new("/music/Envy/Envy.flp");
        let statuses: Vec<_> = r.samples(&raw, project).into_iter().map(|s| s.status).collect();
        assert_eq!(statuses, vec![SampleStatus::Missing; 3]);
        let (found, missing) = r.package_files(&raw, project);
        assert!(found.is_empty());
        assert_eq!(missing.len(), 3);
        // Never looked up: nothing reached the exists() cache.
        assert!(r.exists_cache.keys().all(|k| !k.contains("attacker")), "{:?}", r.exists_cache);
        // Plugins with a network path aren't looked up either.
        let plugins = r.plugins(&[RawPlugin { name: "Evil".into(), vendor: None, path: Some(r"\\attacker\vst\evil.dll".into()) }]);
        assert_eq!(plugins[0].installed, Some(false));
        assert!(r.exists_cache.is_empty());
    }
}
