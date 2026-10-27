//! BandLab sketches: a song started on the phone in BandLab, exported as
//! audio (mixdown, or stems in a zip) and shared to Hivo on the phone.
//!
//! On disk a sketch is `<project folder>/<song>/BandLab/<audio files>` with no
//! DAW project in `<song>/` (the scanner lists it, keyed by the BandLab
//! folder). It's created from the phone inbox (`phone_inbox::Inbox::
//! file_sketch`). "Continue in FL Studio" copies a template to
//! `<song>/<song>.flp` next to it: from then on the folder is that FL
//! project's, and the audio stays in BandLab/ for the user to drag into FL's
//! playlist. Hivo never writes inside .flp files.

use crate::actions::{check_template, copy_file, fl_from_settings, validate_name};
use crate::daws::Daw;
use std::fs;
use std::path::Path;
use tauri::AppHandle;

/// The folder inside a song folder that makes it a sketch (exact name).
pub const SKETCH_DIR: &str = "BandLab";
/// What BandLab exports, plus the usual audio types a phone sends.
pub const SKETCH_AUDIO_EXTS: &[&str] = &["wav", "mp3", "m4a", "aac", "flac", "ogg", "aif", "aiff"];

pub fn is_sketch_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| SKETCH_AUDIO_EXTS.iter().any(|x| e.eq_ignore_ascii_case(x)))
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
    use std::path::PathBuf;

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
    fn audio_types() {
        assert!(is_sketch_audio(Path::new("Night Run.MP3")));
        assert!(is_sketch_audio(Path::new("vox.m4a")));
        assert!(!is_sketch_audio(Path::new("stems.zip")));
        assert!(!is_sketch_audio(Path::new("notes.txt")));
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
        // continue_sketch's sketch and the inbox's parent folder: linked folders only.
        assert!(f.scope.folder_in_roots(&s(&outside)).is_err());
        assert!(f.scope.folder_in_roots(&s(&f.root.join("..").join("Elsewhere"))).is_err());
        assert!(f.scope.folder_in_roots(&s(&f.root)).is_ok());
        // The template check is the New song one.
        assert!(check_template(&f.scope, None, &s(&f.outside.join("Other.flp"))).is_err());
        assert!(check_template(&f.scope, None, &s(&f.root.join("Envy").join("Envy.flp"))).is_ok());
    }
}
