use crate::flp_metadata;
use crate::render::unique_output_path;
use crate::resolve::Resolver;
use serde::Serialize;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

// Already-compressed or barely-compressible audio is stored as-is: deflating
// gigabytes of WAV takes ages for a few percent.
const STORE_EXTS: &[&str] = &["wav", "mp3", "ogg", "flac", "aif", "aiff", "m4a"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageResult {
    pub project_path: String,
    pub zip_path: Option<String>,
    pub bytes: u64,
    /// Samples put in the package.
    pub included: u32,
    /// Samples the project references that couldn't be found anywhere.
    pub missing: Vec<String>,
    pub error: Option<String>,
}

/// Builds a package the way FL's File → Export → Zipped loop package does:
/// the .flp plus every sample it uses, flat at the root of one zip. FL opens
/// these directly and relinks the samples by file name.
fn package_one(resolver: &mut Resolver, project: &Path, out_dir: &Path) -> Result<PackageResult, String> {
    let meta = flp_metadata::parse_flp_metadata(project)?;
    let (samples, missing) = resolver.package_files(&meta.samples, project);
    let stem = project.file_stem().unwrap_or_default().to_string_lossy().to_string();

    fs::create_dir_all(out_dir).map_err(|e| format!("could not create output folder: {e}"))?;
    let dest = unique_output_path(out_dir, &stem, "zip");
    // Write under a temporary name so a failure never leaves a half-written
    // zip that looks complete.
    let partial = dest.with_extension("zip.part");
    let result = write_zip(&partial, project, &samples);
    match result {
        Ok(included) => {
            fs::rename(&partial, &dest).map_err(|e| format!("could not finish package: {e}"))?;
            Ok(PackageResult {
                project_path: project.to_string_lossy().to_string(),
                bytes: fs::metadata(&dest).map(|m| m.len()).unwrap_or(0),
                zip_path: Some(dest.to_string_lossy().to_string()),
                included,
                missing,
                error: None,
            })
        }
        Err(e) => {
            let _ = fs::remove_file(&partial);
            Err(e)
        }
    }
}

fn write_zip(dest: &Path, project: &Path, samples: &[PathBuf]) -> Result<u32, String> {
    let file = File::create(dest).map_err(|e| format!("could not create zip: {e}"))?;
    let mut zip = zip::ZipWriter::new(BufWriter::new(file));
    let mut names = HashSet::new();
    let mut included = 0u32;

    let mut add = |zip: &mut zip::ZipWriter<BufWriter<File>>, path: &Path| -> Result<bool, String> {
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        // Flat layout: two different files with the same name can't both go
        // in; the first wins (FL's own export has the same limitation).
        if !names.insert(name.to_lowercase()) {
            return Ok(false);
        }
        let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let store = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| STORE_EXTS.iter().any(|x| e.eq_ignore_ascii_case(x)));
        let options = SimpleFileOptions::default()
            .compression_method(if store { CompressionMethod::Stored } else { CompressionMethod::Deflated })
            .large_file(size >= u32::MAX as u64);
        zip.start_file(name.as_str(), options)
            .map_err(|e| format!("zip error on {name}: {e}"))?;
        let mut src = File::open(path).map_err(|e| format!("could not read {}: {e}", path.display()))?;
        std::io::copy(&mut src, zip).map_err(|e| format!("could not add {name}: {e}"))?;
        Ok(true)
    };

    add(&mut zip, project)?;
    for sample in samples {
        if add(&mut zip, sample)? {
            included += 1;
        }
    }
    let mut inner = zip.finish().map_err(|e| format!("could not finish zip: {e}"))?;
    inner.flush().map_err(|e| format!("could not write zip: {e}"))?;
    Ok(included)
}

/// Packages each project into `<output>/<subfolder?>/<song>.zip`, emitting a
/// `package-progress` event per song as it finishes.
#[tauri::command]
pub async fn package_projects(
    app: AppHandle,
    project_paths: Vec<String>,
    output_folder: String,
    subfolder: Option<String>,
) -> Result<Vec<PackageResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out_dir = PathBuf::from(&output_folder);
        if let Some(sub) = subfolder.filter(|s| !s.trim().is_empty()) {
            out_dir.push(sub.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_"));
        }
        let mut resolver = Resolver::new(crate::settings::detect_fl_studio());
        let results: Vec<PackageResult> = project_paths
            .iter()
            .map(|p| {
                let result = package_one(&mut resolver, Path::new(p), &out_dir).unwrap_or_else(|error| PackageResult {
                    project_path: p.clone(),
                    zip_path: None,
                    bytes: 0,
                    included: 0,
                    missing: Vec::new(),
                    error: Some(error),
                });
                let _ = app.emit("package-progress", &result);
                result
            })
            .collect();
        results
    })
    .await
    .map_err(|e| format!("packaging failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn text_event(id: u8, s: &str) -> Vec<u8> {
        let mut payload: Vec<u8> = format!("{s}\0").encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let mut out = vec![id];
        // FL's variable-length size prefix (7 bits per byte, low bits first).
        let mut len = payload.len();
        loop {
            let byte = (len & 0x7f) as u8;
            len >>= 7;
            out.push(if len > 0 { byte | 0x80 } else { byte });
            if len == 0 {
                break;
            }
        }
        out.append(&mut payload);
        out
    }

    /// `FLSM_PACKAGE_REAL="D:\...\Song.flp" cargo test -- --nocapture package_real`
    /// Packages a real project into the temp folder (reads only).
    #[test]
    fn package_real_if_available() {
        let Ok(flp) = std::env::var("FLSM_PACKAGE_REAL") else { return };
        let out = std::env::temp_dir().join("flsm-package-real");
        let mut resolver = Resolver::new(crate::settings::detect_fl_studio());
        let r = package_one(&mut resolver, Path::new(&flp), &out).unwrap();
        println!("{:?}: {} samples, {} bytes, missing {:?}", r.zip_path, r.included, r.bytes, r.missing);
    }

    #[test]
    fn packages_flp_and_samples_flat() {
        let root = std::env::temp_dir().join(format!("flsm-pkg-{}", std::process::id()));
        let song = root.join("Projects").join("Envy");
        fs::create_dir_all(song.join("Audio")).unwrap();
        fs::create_dir_all(root.join("Beats")).unwrap();
        fs::write(song.join("Audio").join("take1.wav"), b"vocal").unwrap();
        fs::write(root.join("Beats").join("beat.mp3"), b"beat").unwrap();

        let mut events = Vec::new();
        let ascii_version = b"25.1.6.4997\0";
        events.push(199);
        events.push(ascii_version.len() as u8);
        events.extend_from_slice(ascii_version);
        events.extend(text_event(196, &song.join("Audio").join("take1.wav").to_string_lossy()));
        events.extend(text_event(196, &root.join("Beats").join("beat.mp3").to_string_lossy()));
        events.extend(text_event(196, "C:\\gone\\lost.wav"));
        let mut flp = b"FLhd".to_vec();
        flp.extend_from_slice(&6u32.to_le_bytes());
        flp.extend_from_slice(&[0, 0, 1, 0, 96, 0]);
        flp.extend_from_slice(b"FLdt");
        flp.extend_from_slice(&(events.len() as u32).to_le_bytes());
        flp.extend_from_slice(&events);
        let project = song.join("Envy.flp");
        fs::write(&project, &flp).unwrap();

        let out = root.join("out");
        let mut resolver = Resolver::new(None);
        let result = package_one(&mut resolver, &project, &out).unwrap();
        assert_eq!(result.included, 2);
        assert_eq!(result.missing, vec!["C:\\gone\\lost.wav".to_string()]);

        let zip_path = result.zip_path.unwrap();
        assert!(zip_path.ends_with("Envy.zip"));
        let mut archive = zip::ZipArchive::new(File::open(&zip_path).unwrap()).unwrap();
        let mut names: Vec<String> = archive.file_names().map(String::from).collect();
        names.sort();
        assert_eq!(names, vec!["Envy.flp", "beat.mp3", "take1.wav"]);
        let mut content = String::new();
        archive.by_name("take1.wav").unwrap().read_to_string(&mut content).unwrap();
        assert_eq!(content, "vocal");
        assert!(!Path::new(&format!("{zip_path}.part")).exists());

        // A second package of the same song doesn't overwrite the first.
        let again = package_one(&mut resolver, &project, &out).unwrap();
        assert!(again.zip_path.unwrap().ends_with("Envy (1).zip"));
        let _ = fs::remove_dir_all(&root);
    }
}
