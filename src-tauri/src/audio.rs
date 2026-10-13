//! Mixdown analysis for the Launch Kit: duration, a loudness curve, the
//! strongest stretches for reels/stories, and cutting those as clips.
//! Decoding is pure Rust (symphonia), so nothing extra to install.

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// One loudness value per this many seconds.
const WINDOW_SEC: f64 = 0.5;
const FADE_SEC: f64 = 0.3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysis {
    pub duration_sec: f64,
    pub window_sec: f64,
    /// RMS loudness per window, normalized so the loudest is 1.
    pub energy: Vec<f32>,
    pub snippets: Vec<Snippet>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub label: String,
    pub start_sec: f64,
    pub length_sec: f64,
}

/// Streams the file's default track as interleaved f32, chunk by chunk.
/// `on_chunk` returns false to stop early.
fn decode(path: &Path, mut on_chunk: impl FnMut(&[f32], usize, u32) -> bool) -> Result<(), String> {
    let file = File::open(path).map_err(|e| format!("could not open {}: {e}", path.display()))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("unsupported audio file: {e}"))?;
    let mut format = probed.format;
    let track = format.default_track().ok_or("no audio track in file")?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("unsupported audio codec: {e}"))?;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(e) => return Err(format!("could not read audio: {e}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            // A corrupt frame: skip it rather than fail the whole file.
            Err(SymError::DecodeError(_)) => continue,
            Err(e) => return Err(format!("could not decode audio: {e}")),
        };
        let spec = *decoded.spec();
        let mut buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buf.copy_interleaved_ref(decoded);
        if !on_chunk(buf.samples(), spec.channels.count().max(1), spec.rate) {
            break;
        }
    }
    Ok(())
}

pub fn analyze(path: &Path, bpm: Option<f64>) -> Result<AudioAnalysis, String> {
    let mut energy = Vec::new();
    let (mut acc, mut n, mut frames, mut rate) = (0f64, 0usize, 0u64, 0u32);
    decode(path, |samples, channels, sr| {
        rate = sr;
        let window = ((sr as f64 * WINDOW_SEC) as usize).max(1);
        for frame in samples.chunks(channels) {
            // Mean power across channels (a mono sum would cancel
            // out-of-phase stereo content).
            acc += frame.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>() / channels as f64;
            n += 1;
            if n == window {
                energy.push((acc / n as f64).sqrt() as f32);
                acc = 0.0;
                n = 0;
            }
        }
        frames += (samples.len() / channels) as u64;
        true
    })?;
    if n > 0 {
        energy.push((acc / n as f64).sqrt() as f32);
    }
    if rate == 0 || frames == 0 {
        return Err("the file has no audio".to_string());
    }
    let peak = energy.iter().cloned().fold(0f32, f32::max);
    if peak > 0.0 {
        energy.iter_mut().for_each(|e| *e /= peak);
    }
    let duration_sec = frames as f64 / rate as f64;
    let snippets = pick_snippets(&energy, duration_sec, bpm);
    Ok(AudioAnalysis { duration_sec, window_sec: WINDOW_SEC, energy, snippets })
}

/// Start (in windows) of the loudest run of `len` windows, skipping any
/// start for which `blocked` is true.
fn loudest_run(energy: &[f32], len: usize, blocked: impl Fn(usize) -> bool) -> Option<usize> {
    if len == 0 || energy.len() < len {
        return None;
    }
    let mut prefix = vec![0f64; energy.len() + 1];
    for (i, e) in energy.iter().enumerate() {
        prefix[i + 1] = prefix[i] + *e as f64;
    }
    (0..=energy.len() - len)
        .filter(|&i| !blocked(i))
        .max_by(|&a, &b| {
            let sa = prefix[a + len] - prefix[a];
            let sb = prefix[b + len] - prefix[b];
            // On a tie keep the earlier start.
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal).then(b.cmp(&a))
        })
}

/// Snap to the nearest bar line (4/4) so the clip starts on the beat.
fn snap(start: f64, length: f64, duration: f64, bpm: Option<f64>) -> f64 {
    let snapped = match bpm.filter(|b| (40.0..=300.0).contains(b)) {
        Some(b) => {
            let bar = 240.0 / b;
            (start / bar).round() * bar
        }
        None => start,
    };
    snapped.clamp(0.0, (duration - length).max(0.0))
}

/// The hook (loudest 15s), a 30s teaser, and an alternate 15s cut that
/// doesn't overlap the hook.
fn pick_snippets(energy: &[f32], duration: f64, bpm: Option<f64>) -> Vec<Snippet> {
    let windows = |sec: f64| (sec / WINDOW_SEC).round() as usize;
    let mut out = Vec::new();
    let mut make = |label: &str, start_w: usize, len: f64| {
        let start = snap(start_w as f64 * WINDOW_SEC, len, duration, bpm);
        out.push(Snippet { label: label.to_string(), start_sec: start, length_sec: len });
        start
    };
    let Some(hook_w) = loudest_run(energy, windows(15.0), |_| false) else { return out };
    let hook = make("Hook 15s", hook_w, 15.0);
    if let Some(w) = loudest_run(energy, windows(30.0), |_| false) {
        make("Teaser 30s", w, 30.0);
    }
    let hook_range = windows(hook)..windows(hook + 15.0);
    let len = windows(15.0);
    let overlaps = |i: usize| i < hook_range.end && i + len > hook_range.start;
    if let Some(w) = loudest_run(energy, len, overlaps) {
        make("Alt 15s", w, 15.0);
    }
    out
}

fn write_wav(path: &Path, samples: &[f32], channels: u16, rate: u32) -> std::io::Result<()> {
    let mut w = BufWriter::new(File::create(path)?);
    let data_len = (samples.len() * 2) as u32;
    w.write_all(b"RIFF")?;
    w.write_all(&(36 + data_len).to_le_bytes())?;
    w.write_all(b"WAVEfmt ")?;
    w.write_all(&16u32.to_le_bytes())?;
    w.write_all(&1u16.to_le_bytes())?; // PCM
    w.write_all(&channels.to_le_bytes())?;
    w.write_all(&rate.to_le_bytes())?;
    w.write_all(&(rate * channels as u32 * 2).to_le_bytes())?;
    w.write_all(&(channels * 2).to_le_bytes())?;
    w.write_all(&16u16.to_le_bytes())?;
    w.write_all(b"data")?;
    w.write_all(&data_len.to_le_bytes())?;
    for s in samples {
        w.write_all(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())?;
    }
    w.flush()
}

/// File-system-safe version of a user-facing name.
pub fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() { "Untitled".to_string() } else { trimmed }
}

/// Cuts each clip out of `src` (one decode pass) into `<out_dir>/<label>.wav`
/// as 16-bit PCM with short fades.
pub fn export_clips(src: &Path, clips: &[Snippet], out_dir: &Path) -> Result<Vec<PathBuf>, String> {
    fs::create_dir_all(out_dir).map_err(|e| format!("could not create {}: {e}", out_dir.display()))?;
    let mut buffers: Vec<Vec<f32>> = vec![Vec::new(); clips.len()];
    let (mut frame_index, mut channels, mut rate) = (0u64, 0usize, 0u32);
    let last_end = clips.iter().map(|c| c.start_sec + c.length_sec).fold(0.0, f64::max);
    decode(src, |samples, ch, sr| {
        channels = ch;
        rate = sr;
        for frame in samples.chunks(ch) {
            let t = frame_index as f64 / sr as f64;
            for (clip, buf) in clips.iter().zip(buffers.iter_mut()) {
                if t >= clip.start_sec && t < clip.start_sec + clip.length_sec {
                    buf.extend_from_slice(frame);
                }
            }
            frame_index += 1;
        }
        // Nothing left to cut past the last clip.
        (frame_index as f64 / sr as f64) < last_end
    })?;
    if rate == 0 {
        return Err("the file has no audio".to_string());
    }
    let fade = (FADE_SEC * rate as f64) as usize;
    let mut written = Vec::new();
    for (clip, mut buf) in clips.iter().zip(buffers) {
        let frames = buf.len() / channels;
        for i in 0..fade.min(frames / 2) {
            let gain = i as f32 / fade as f32;
            for c in 0..channels {
                buf[i * channels + c] *= gain;
                buf[(frames - 1 - i) * channels + c] *= gain;
            }
        }
        let path = out_dir.join(format!("{}.wav", safe_name(&clip.label)));
        write_wav(&path, &buf, channels as u16, rate).map_err(|e| format!("could not write {}: {e}", path.display()))?;
        written.push(path);
    }
    Ok(written)
}

#[tauri::command]
pub async fn analyze_audio(path: String, bpm: Option<f64>) -> Result<AudioAnalysis, String> {
    tauri::async_runtime::spawn_blocking(move || analyze(Path::new(&path), bpm))
        .await
        .map_err(|e| format!("analysis failed: {e}"))?
}

#[derive(Debug, Deserialize)]
pub struct KitFile {
    pub name: String,
    pub content: String,
}

/// Writes a launch kit folder: the text files, a copy of the master
/// mixdown, and the snippet clips in `snippets/`. Re-exporting overwrites
/// the kit's own files only; anything else in the folder (cover art) stays.
#[tauri::command]
pub async fn export_launch_kit(
    out_dir: String,
    files: Vec<KitFile>,
    master: Option<String>,
    master_name: String,
    clips: Vec<Snippet>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = PathBuf::from(&out_dir);
        fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
        for f in &files {
            let path = dir.join(safe_name(&f.name));
            fs::write(&path, &f.content).map_err(|e| format!("could not write {}: {e}", path.display()))?;
        }
        if let Some(master) = master {
            let src = Path::new(&master);
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("wav");
            let dest = dir.join(format!("{}.{ext}", safe_name(&master_name)));
            fs::copy(src, &dest).map_err(|e| format!("could not copy the mixdown: {e}"))?;
            if !clips.is_empty() {
                export_clips(src, &clips, &dir.join("snippets"))?;
            }
        }
        Ok(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("export failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 60s mono at 8 kHz: quiet tone, loud between 30s and 45s.
    fn fixture(dir: &Path) -> PathBuf {
        let rate = 8000u32;
        let samples: Vec<f32> = (0..rate * 60)
            .map(|i| {
                let t = i as f64 / rate as f64;
                let amp = if (30.0..45.0).contains(&t) { 0.8 } else { 0.05 };
                (amp * (t * 440.0 * std::f64::consts::TAU).sin()) as f32
            })
            .collect();
        let path = dir.join("mix.wav");
        write_wav(&path, &samples, 1, rate).unwrap();
        path
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("flsm-audio-{name}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_the_loud_part() {
        let dir = temp("analyze");
        let a = analyze(&fixture(&dir), None).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!((a.duration_sec - 60.0).abs() < 0.01);
        assert_eq!(a.energy.len(), 120);
        let hook = &a.snippets[0];
        assert_eq!(hook.label, "Hook 15s");
        assert!((hook.start_sec - 30.0).abs() <= 0.5, "hook at {}", hook.start_sec);
        let teaser = &a.snippets[1];
        assert!(teaser.start_sec <= 30.0 && teaser.start_sec + 30.0 >= 45.0);
        let alt = &a.snippets[2];
        assert!(alt.start_sec + 15.0 <= hook.start_sec || alt.start_sec >= hook.start_sec + 15.0);
    }

    #[test]
    fn snaps_to_bars() {
        // 120 BPM: a bar is 2s.
        let s = pick_snippets(&[1.0; 120], 60.0, Some(120.0));
        assert!(s.iter().all(|c| (c.start_sec / 2.0).fract() == 0.0));
        assert!(pick_snippets(&[1.0; 20], 10.0, None).is_empty(), "too short for a 15s clip");
    }

    #[test]
    fn exports_clips_with_exact_length() {
        let dir = temp("export");
        let src = fixture(&dir);
        let clips = vec![Snippet { label: "Hook 15s".into(), start_sec: 30.0, length_sec: 15.0 }];
        let written = export_clips(&src, &clips, &dir.join("snippets")).unwrap();
        let bytes = fs::read(&written[0]).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(written[0].ends_with("snippets/Hook 15s.wav"));
        assert_eq!(bytes.len(), 44 + 15 * 8000 * 2);
    }

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("a/b:c"), "a_b_c");
        assert_eq!(safe_name(" .. "), "Untitled");
    }
}
