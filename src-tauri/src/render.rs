use crate::models::{RenderEvent, RenderStatus};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const RENDER_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const POLL_INTERVAL: Duration = Duration::from_millis(300);

pub(crate) fn unique_output_path(output_folder: &Path, base_name: &str, ext: &str) -> PathBuf {
    let candidate = output_folder.join(format!("{base_name}.{ext}"));
    if !candidate.exists() {
        return candidate;
    }
    let mut n = 1;
    loop {
        let candidate = output_folder.join(format!("{base_name} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

fn emit(app: &AppHandle, event: RenderEvent) {
    let _ = app.emit("render-progress", event);
}

fn render_one(
    fl_studio_path: &str,
    project_path: &str,
    output_folder: &Path,
    format: &str,
    output_name: Option<&str>,
) -> Result<PathBuf, String> {
    let src = Path::new(project_path);
    let file_name = src
        .file_name()
        .ok_or_else(|| "invalid project path".to_string())?;
    let base_name = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled".to_string());

    // Unique per render: a reused folder could hand a stale file from an
    // earlier failed render to find_rendered_file.
    static RENDER_SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let temp_dir = std::env::temp_dir().join(format!(
        "flsm-render-{}-{nanos}-{}",
        std::process::id(),
        RENDER_SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("could not create staging folder: {e}"))?;

    let cleanup = |dir: &Path| {
        let _ = fs::remove_dir_all(dir);
    };

    let staged_flp = temp_dir.join(file_name);
    if let Err(e) = fs::copy(src, &staged_flp) {
        cleanup(&temp_dir);
        return Err(format!("could not stage project file: {e}"));
    }

    let mut child = match Command::new(fl_studio_path)
        .arg("/R")
        .arg(format!("/E{format}"))
        .arg(format!("/F{}", temp_dir.display()))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            cleanup(&temp_dir);
            return Err(format!("could not launch FL Studio renderer: {e}"));
        }
    };

    let started = Instant::now();
    let mut timed_out = false;
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if started.elapsed() > RENDER_TIMEOUT {
                    timed_out = true;
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(e) => {
                cleanup(&temp_dir);
                return Err(format!("error waiting for renderer: {e}"));
            }
        }
    }

    // Give the renderer a brief grace period to flush the file to disk after exit.
    std::thread::sleep(Duration::from_millis(250));

    let rendered_file = match find_rendered_file(&temp_dir, &base_name, format) {
        Some(f) => f,
        None => {
            cleanup(&temp_dir);
            let reason = if timed_out {
                "render timed out and no output was produced"
            } else {
                "FL Studio exited but no rendered output was found (check the FL Studio path and format in Settings)"
            };
            return Err(reason.to_string());
        }
    };

    if let Err(e) = fs::create_dir_all(output_folder) {
        cleanup(&temp_dir);
        return Err(format!("could not create output folder: {e}"));
    }
    let dest = unique_output_path(output_folder, output_name.unwrap_or(&base_name), format);
    let copy_result = fs::copy(&rendered_file, &dest);
    cleanup(&temp_dir);
    copy_result.map_err(|e| format!("could not move rendered file: {e}"))?;

    Ok(dest)
}

fn find_rendered_file(dir: &Path, base_name: &str, format: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext_matches = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case(format))
            .unwrap_or(false);
        let stem_matches = path
            .file_stem()
            .map(|s| s.to_string_lossy() == base_name)
            .unwrap_or(false);
        if ext_matches && stem_matches {
            return Some(path);
        }
    }
    None
}

/// Renders sequentially on a worker thread (a batch can take many minutes;
/// a sync command would block the UI thread the whole time).
/// `output_names`, when given, lines up with `project_paths` and names each
/// file (e.g. "01 - Envy" for an album export) instead of the project name.
#[tauri::command]
pub async fn render_projects(
    app: AppHandle,
    project_paths: Vec<String>,
    output_folder: String,
    fl_studio_path: String,
    format: String,
    output_names: Option<Vec<String>>,
) -> Result<(), String> {
    if fl_studio_path.trim().is_empty() {
        return Err("FL Studio executable path is not set (see Settings)".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        render_all(&app, project_paths, PathBuf::from(output_folder), &fl_studio_path, &format, output_names)
    })
    .await
    .map_err(|e| format!("render worker failed: {e}"))
}

fn render_all(
    app: &AppHandle,
    project_paths: Vec<String>,
    output_folder: PathBuf,
    fl_studio_path: &str,
    format: &str,
    output_names: Option<Vec<String>>,
) {
    for (i, project_path) in project_paths.into_iter().enumerate() {
        let output_name = output_names.as_ref().and_then(|n| n.get(i)).map(String::as_str);
        let project_name = Path::new(&project_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| project_path.clone());

        emit(
            app,
            RenderEvent {
                project_path: project_path.clone(),
                project_name: project_name.clone(),
                status: RenderStatus::Rendering,
                message: None,
                output_path: None,
            },
        );

        match render_one(fl_studio_path, &project_path, &output_folder, format, output_name) {
            Ok(dest) => emit(
                app,
                RenderEvent {
                    project_path: project_path.clone(),
                    project_name: project_name.clone(),
                    status: RenderStatus::Done,
                    message: None,
                    output_path: Some(dest.to_string_lossy().to_string()),
                },
            ),
            Err(message) => emit(
                app,
                RenderEvent {
                    project_path: project_path.clone(),
                    project_name: project_name.clone(),
                    status: RenderStatus::Error,
                    message: Some(message),
                    output_path: None,
                },
            ),
        }
    }
}
