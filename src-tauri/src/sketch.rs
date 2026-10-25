//! BandLab sketches: a song started on the phone in BandLab, exported as
//! mp3/wav (mixdown or stems) and imported into a linked project folder.
//!
//! On disk a sketch is `<project folder>/<song>/BandLab/<audio files>` with no
//! DAW project in `<song>/` (the scanner lists it, keyed by the BandLab
//! folder). "Continue in FL Studio" copies a template to `<song>/<song>.flp`
//! next to it: from then on the folder is that FL project's, and the audio
//! stays in BandLab/ for the user to drag into FL's playlist. Hivo never
//! writes inside .flp files.
//!
//! The audio files come from a native picker run here (`pick_bandlab_files`),
//! remembered in Rust until `import_bandlab` copies them: the webview never
//! names a file to copy.

use crate::actions::{check_template, copy_file, fl_from_settings, validate_name};
use crate::daws::Daw;
use crate::paths::is_remote_or_device;
use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// The folder inside a song folder that makes it a sketch (exact name).
pub const SKETCH_DIR: &str = "BandLab";
/// What BandLab exports, plus the usual audio types a phone sends.
pub const SKETCH_AUDIO_EXTS: &[&str] = &["wav", "mp3", "m4a", "aac", "flac", "ogg", "aif", "aiff"];
/// One import: at most this many files, this many bytes in all.
pub const MAX_FILES: usize = 20;
pub const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;

pub fn is_sketch_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| SKETCH_AUDIO_EXTS.iter().any(|x| e.eq_ignore_ascii_case(x)))
}

/// A picked file, as the import modal shows it (never its path).
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PickedAudio {
    pub name: String,
    pub size_bytes: u64,
}

/// The files the last picker returned, waiting for `import_bandlab`.
static PICKED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

fn picked() -> std::sync::MutexGuard<'static, Vec<PathBuf>> {
    PICKED.lock().unwrap_or_else(|e| e.into_inner())
}

/// Every file must be a plain local audio file; the batch within the caps.
fn check_picked(files: &[PathBuf]) -> Result<Vec<PickedAudio>, String> {
    if files.is_empty() {
        return Err("Pick the audio files first.".to_string());
    }
    if files.len() > MAX_FILES {
        return Err(format!("{} files picked: {MAX_FILES} at most per import.", files.len()));
    }
    let mut total = 0u64;
    let mut out = Vec::new();
    for f in files {
        let shown = f.to_string_lossy();
        if is_remote_or_device(&shown) {
            return Err(format!("network and device paths aren't imported: {shown}"));
        }
        if !is_sketch_audio(f) {
            return Err(format!("not an audio file ({}): {shown}", SKETCH_AUDIO_EXTS.join(", ")));
        }
        let meta = fs::metadata(f).map_err(|e| format!("can't read {shown}: {e}"))?;
        if !meta.is_file() {
            return Err(format!("not a file: {shown}"));
        }
        total += meta.len();
        out.push(PickedAudio { name: f.file_name().unwrap_or_default().to_string_lossy().to_string(), size_bytes: meta.len() });
    }
    if total > MAX_TOTAL_BYTES {
        return Err("These files are over 2 GB in all: import fewer at a time.".to_string());
    }
    Ok(out)
}

/// Native multi-file picker for audio (run here, not in the webview). The
/// files are remembered for `import_bandlab`; the webview gets names and
/// sizes. Cancelled = an empty list, and the previous pick is kept.
#[tauri::command]
pub async fn pick_bandlab_files(app: AppHandle) -> Result<Vec<PickedAudio>, String> {
    let files = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("Audio", SKETCH_AUDIO_EXTS)
            .blocking_pick_files()
            .map(|list| list.into_iter().filter_map(|p| p.into_path().ok()).collect::<Vec<_>>())
    })
    .await
    .map_err(|e| format!("the picker failed: {e}"))?;
    let Some(files) = files.filter(|f| !f.is_empty()) else { return Ok(Vec::new()) };
    let shown = check_picked(&files)?;
    *picked() = files;
    Ok(shown)
}

/// Creates `<parent>/<name>/BandLab/` with a copy of the picked files.
/// Returns the sketch's key (the BandLab folder's path, as the scan lists it).
#[tauri::command]
pub async fn import_bandlab(app: AppHandle, parent_folder: String, name: String) -> Result<String, String> {
    let scope = crate::scope::Scope::load(&app)?;
    let parent = scope.folder_in_roots(&parent_folder)?;
    let files = picked().clone();
    let key = tauri::async_runtime::spawn_blocking(move || import_into(&parent, &name, &files))
        .await
        .map_err(|e| format!("the import failed: {e}"))??;
    picked().clear();
    Ok(key)
}

fn import_into(parent: &Path, name: &str, files: &[PathBuf]) -> Result<String, String> {
    let name = validate_name(name)?;
    check_picked(files)?;
    let song = parent.join(name);
    if song.exists() {
        return Err(format!("\"{name}\" already exists in that folder: pick another name."));
    }
    let dir = song.join(SKETCH_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("could not create the song folder: {e}"))?;
    if let Err(e) = copy_all(files, &dir) {
        // The folder is new and only holds this import: take it back out.
        let _ = fs::remove_dir_all(&song);
        return Err(e);
    }
    Ok(dir.to_string_lossy().to_string())
}

/// Copies each file into `dir`, never over an existing one (two picks with
/// the same name become `name (2).ext`).
fn copy_all(files: &[PathBuf], dir: &Path) -> Result<(), String> {
    for from in files {
        let file_name = from.file_name().ok_or("invalid file name")?;
        let stem = Path::new(file_name).file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = Path::new(file_name).extension().unwrap_or_default().to_string_lossy().to_string();
        let mut src = fs::File::open(from).map_err(|e| format!("could not read {}: {e}", from.display()))?;
        let mut n = 1;
        let mut out = loop {
            let target = if n == 1 { dir.join(file_name) } else { dir.join(format!("{stem} ({n}).{ext}")) };
            match fs::OpenOptions::new().write(true).create_new(true).open(&target) {
                Ok(f) => break f,
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists && n < 100 => n += 1,
                Err(e) => return Err(format!("could not write {}: {e}", target.display())),
            }
        };
        io::copy(&mut src, &mut out).map_err(|e| format!("could not copy {}: {e}", from.display()))?;
    }
    Ok(())
}

/// "Continue in FL Studio": copies the template to `<song>/<song>.flp` next to
/// the sketch's BandLab folder. Returns the new .flp path (the app then moves
/// the song's data to it and opens it like any project).
#[tauri::command]
pub fn continue_sketch(app: AppHandle, sketch_path: String, template_path: String) -> Result<String, String> {
    let scope = crate::scope::Scope::load(&app)?;
    let sketch = scope.folder_in_roots(&sketch_path)?;
    check_template(&scope, fl_from_settings(&app), &template_path)?;
    continue_in(&sketch, Path::new(&template_path))
}

fn continue_in(sketch: &Path, template: &Path) -> Result<String, String> {
    if sketch.file_name().is_none_or(|n| n != SKETCH_DIR) || !sketch.is_dir() {
        return Err(format!("not a BandLab sketch: {}", sketch.display()));
    }
    let song = sketch.parent().ok_or("invalid sketch path")?;
    let has_project = fs::read_dir(song)
        .map_err(|e| format!("can't read the song folder: {e}"))?
        .filter_map(|e| e.ok())
        .any(|e| e.path().is_file() && Daw::of_project(&e.path()).is_some());
    if has_project {
        return Err("This song already has a project: open it from the Library.".to_string());
    }
    let name = song.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let name = validate_name(&name)?;
    if !template.is_file() {
        return Err(format!("template not found: {}", template.display()));
    }
    let target = song.join(format!("{name}.flp"));
    if target.exists() {
        return Err(format!("\"{name}.flp\" already exists there"));
    }
    copy_file(template, &target)?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Dir(PathBuf);
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn temp(name: &str) -> Dir {
        let d = std::env::temp_dir().join(format!("flsm-sketch-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        Dir(d)
    }
    fn write(p: &Path, bytes: &[u8]) -> PathBuf {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, bytes).unwrap();
        p.to_path_buf()
    }

    #[test]
    fn imports_into_a_new_song_folder() {
        let d = temp("import");
        let phone = d.0.join("Downloads");
        let a = write(&phone.join("Night Run.mp3"), b"mp3");
        let b = write(&phone.join("other").join("Night Run.mp3"), b"second");
        let c = write(&phone.join("Vox.WAV"), b"wav");
        let projects = d.0.join("Projects");
        fs::create_dir_all(&projects).unwrap();

        let key = import_into(&projects, " Night Run ", &[a.clone(), b, c]).unwrap();
        let dir = projects.join("Night Run").join(SKETCH_DIR);
        assert_eq!(PathBuf::from(&key), dir);
        assert_eq!(fs::read(dir.join("Night Run.mp3")).unwrap(), b"mp3");
        assert_eq!(fs::read(dir.join("Night Run (2).mp3")).unwrap(), b"second", "same name: never overwritten");
        assert!(dir.join("Vox.WAV").is_file());
        assert_eq!(fs::read(&a).unwrap(), b"mp3", "the original stays");

        // The song folder exists now: a second import with that name is refused.
        let err = import_into(&projects, "Night Run", &[a]).unwrap_err();
        assert!(err.contains("already exists"), "{err}");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 3);
    }

    #[test]
    fn refuses_bad_names_and_non_audio() {
        let d = temp("refuse");
        let mp3 = write(&d.0.join("in").join("idea.mp3"), b"x");
        let txt = write(&d.0.join("in").join("notes.txt"), b"x");
        let projects = d.0.join("Projects");
        fs::create_dir_all(&projects).unwrap();
        for bad in ["", "..", "a/b", "x:y"] {
            assert!(import_into(&projects, bad, std::slice::from_ref(&mp3)).is_err(), "{bad:?}");
        }
        assert!(import_into(&projects, "Idea", &[mp3.clone(), txt]).unwrap_err().contains("not an audio file"));
        assert!(import_into(&projects, "Idea", &[]).is_err(), "nothing picked");
        assert!(import_into(&projects, "Idea", &[d.0.join("in").join("gone.mp3")]).is_err(), "missing file");
        assert!(check_picked(&[PathBuf::from(r"\\host\share\idea.mp3")]).unwrap_err().contains("network"));
        assert!(!projects.join("Idea").exists(), "nothing created when refused");
    }

    #[test]
    fn caps_the_number_of_files() {
        let d = temp("caps");
        let files: Vec<PathBuf> = (0..=MAX_FILES).map(|i| write(&d.0.join(format!("{i}.wav")), b"x")).collect();
        assert!(check_picked(&files[..MAX_FILES]).is_ok());
        assert!(check_picked(&files).unwrap_err().contains("at most"));
        // The 2 GB cap, with a sparse file just over it.
        let big = fs::File::create(d.0.join("huge.wav")).unwrap();
        big.set_len(MAX_TOTAL_BYTES + 1).unwrap();
        drop(big);
        assert!(check_picked(&[d.0.join("huge.wav")]).unwrap_err().contains("2 GB"));
    }

    #[test]
    fn continues_a_sketch_in_fl_once() {
        let d = temp("continue");
        let template = write(&d.0.join("Templates").join("Rap.flp"), b"template");
        let sketch = d.0.join("Projects").join("Night Run").join(SKETCH_DIR);
        write(&sketch.join("Night Run.mp3"), b"x");

        let flp = continue_in(&sketch, &template).unwrap();
        assert_eq!(PathBuf::from(&flp), d.0.join("Projects").join("Night Run").join("Night Run.flp"));
        assert_eq!(fs::read(&flp).unwrap(), b"template");
        assert!(sketch.join("Night Run.mp3").is_file(), "the BandLab audio stays");
        // It has a project now: not a sketch any more.
        assert!(continue_in(&sketch, &template).unwrap_err().contains("already has a project"));
        assert_eq!(fs::read(&flp).unwrap(), b"template");
        // Only a BandLab folder is a sketch.
        assert!(continue_in(&d.0.join("Projects").join("Night Run"), &template).is_err());
    }

    #[test]
    fn sketch_commands_stay_inside_settings() {
        let f = crate::scope::tests::fixture("sketch");
        let s = |p: &Path| p.to_string_lossy().to_string();
        let outside = f.outside.join("Idea").join(SKETCH_DIR);
        fs::create_dir_all(&outside).unwrap();
        // import_bandlab's parent and continue_sketch's sketch: linked folders only.
        assert!(f.scope.folder_in_roots(&s(&outside)).is_err());
        assert!(f.scope.folder_in_roots(&s(&f.root.join("..").join("Elsewhere"))).is_err());
        assert!(f.scope.folder_in_roots(&s(&f.root)).is_ok());
        // The template check is the New song one.
        assert!(check_template(&f.scope, None, &s(&f.outside.join("Other.flp"))).is_err());
        assert!(check_template(&f.scope, None, &s(&f.root.join("Envy").join("Envy.flp"))).is_ok());
    }
}
