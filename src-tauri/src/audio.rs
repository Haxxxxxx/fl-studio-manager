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
    /// Estimated from the audio; None for silence or too short a file.
    pub key: Option<crate::key::KeyEstimate>,
    /// The file itself, for the distributor checks (WAV, 44.1 kHz, 16/24-bit).
    pub master: MasterSpec,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterSpec {
    /// File extension, lowercase ("wav", "mp3"…).
    pub container: String,
    pub sample_rate: u32,
    pub channels: u32,
    /// None for lossy formats (MP3/OGG have no bit depth).
    pub bits_per_sample: Option<u32>,
    /// Highest absolute sample, 0–1 (1 = 0 dBFS).
    pub peak: f32,
    /// Samples at full scale: a sign of clipping.
    pub clipped_samples: u64,
}

/// |sample| at or above this is full scale (16-bit max is 32767/32768).
const FULL_SCALE: f32 = 0.9999;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub label: String,
    pub start_sec: f64,
    pub length_sec: f64,
    /// Why it was picked, in words ("comes back 3 times").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Streams the file's default track as interleaved f32, chunk by chunk.
/// `on_chunk` returns false to stop early. Returns the stored bit depth.
fn decode(path: &Path, mut on_chunk: impl FnMut(&[f32], usize, u32) -> bool) -> Result<Option<u32>, String> {
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
    let bits_per_sample = track.codec_params.bits_per_sample;
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
    Ok(bits_per_sample)
}

pub fn analyze(path: &Path, bpm: Option<f64>) -> Result<AudioAnalysis, String> {
    let mut energy = Vec::new();
    let (mut acc, mut n, mut frames, mut rate) = (0f64, 0usize, 0u64, 0u32);
    let mut chroma = crate::key::Chroma::new();
    let mut timbre = crate::sections::Timbre::new();
    let (mut peak_sample, mut clipped, mut chans) = (0f32, 0u64, 0usize);
    let bits_per_sample = decode(path, |samples, channels, sr| {
        rate = sr;
        chans = channels;
        for &x in samples {
            let a = x.abs();
            peak_sample = peak_sample.max(a);
            if a >= FULL_SCALE {
                clipped += 1;
            }
        }
        let window = ((sr as f64 * WINDOW_SEC) as usize).max(1);
        for frame in samples.chunks(channels) {
            // Mean power across channels (a mono sum would cancel
            // out-of-phase stereo content).
            acc += frame.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>() / channels as f64;
            let mono = frame.iter().sum::<f32>() / channels as f32;
            chroma.push(mono, sr);
            timbre.push(mono, sr);
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
    // A last window of a few samples would read as a fake spike or dip.
    if n > 0 && n * 2 >= (rate as f64 * WINDOW_SEC) as usize {
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
    let (feats, fine) = timbre.finish(WINDOW_SEC, energy.len());
    let snippets = pick_snippets_with(&energy, &feats, &fine, duration_sec, bpm);
    let master = MasterSpec {
        container: path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase(),
        sample_rate: rate,
        channels: chans as u32,
        bits_per_sample,
        peak: peak_sample.min(1.0),
        clipped_samples: clipped,
    };
    Ok(AudioAnalysis { duration_sec, window_sec: WINDOW_SEC, energy, snippets, master, key: chroma.estimate() })
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

/// Loudness only (no timbre fingerprint): the loudest 15 s, a 30 s teaser
/// and an alternate cut that doesn't overlap the hook.
#[cfg(test)]
fn pick_snippets(energy: &[f32], duration: f64, bpm: Option<f64>) -> Vec<Snippet> {
    pick_snippets_with(energy, &[], &[], duration, bpm)
}

/// The hook (the 15 s that comes back most, weighed with loudness), a 30 s
/// teaser that builds into it, and an alternate 15 s cut that is neither the
/// hook nor a repeat of it. Without a fingerprint (`feats` empty) it falls
/// back to loudness alone.
fn pick_snippets_with(energy: &[f32], feats: &[crate::sections::Features], fine: &[f32], duration: f64, bpm: Option<f64>) -> Vec<Snippet> {
    use crate::sections::{onset_near, repetition, segment_similarity};
    let windows = |sec: f64| (sec / WINDOW_SEC).round() as usize;
    let bar = bpm.filter(|b| (40.0..=300.0).contains(b)).map(|b| 240.0 / b);
    // Start on a real onset near the spot when there is one (the first beat
    // isn't always at 0:00), else on the bar grid.
    let place = |start_w: usize, len: f64| -> f64 {
        let at = start_w as f64 * WINDOW_SEC;
        let onset = onset_near(fine, at, bar.map_or(1.0, |b| b / 2.0)).map(|t| (t - 0.05).max(0.0));
        match onset {
            Some(t) => t.clamp(0.0, (duration - len).max(0.0)),
            None => snap(at, len, duration, bpm),
        }
    };
    let clip = |label: &str, start_sec: f64, length_sec: f64, reason: Option<String>| Snippet { label: label.to_string(), start_sec, length_sec, reason };
    let mut out = Vec::new();
    // A clip is only offered when the track is really that long.
    if duration < 15.0 {
        return out;
    }
    let len = windows(15.0);
    if energy.len() < len {
        return out;
    }
    let starts = energy.len() - len + 1;
    let mut prefix = vec![0f64; energy.len() + 1];
    for (i, e) in energy.iter().enumerate() {
        prefix[i + 1] = prefix[i] + *e as f64;
    }
    let mean_energy = |i: usize, l: usize| ((prefix[(i + l).min(energy.len())] - prefix[i]) / l as f64) as f32;
    let loud: Vec<f32> = (0..starts).map(|i| mean_energy(i, len)).collect();
    let max_loud = loud.iter().cloned().fold(0f32, f32::max).max(1e-6);
    let rep = if feats.len() == energy.len() { repetition(feats, len) } else { Vec::new() };
    // Repetition only leads when a loud enough stretch really comes back;
    // a song with no clear hook falls back to loudness.
    let use_rep = rep.len() == starts && (0..starts).any(|i| loud[i] / max_loud >= 0.5 && rep[i] >= 0.75);
    let (rmin, rmax) = rep.iter().fold((f32::MAX, f32::MIN), |(lo, hi), &r| (lo.min(r), hi.max(r)));
    let score: Vec<f32> = (0..starts)
        .map(|i| {
            let e = loud[i] / max_loud;
            if !use_rep {
                return e;
            }
            let r = if rmax > rmin { (rep[i] - rmin) / (rmax - rmin) } else { 0.0 };
            // Silence repeats perfectly: quiet stretches can't win on repetition.
            let quiet = (e / 0.5).min(1.0);
            // Intros and outros rarely make the reel.
            let t0 = i as f64 * WINDOW_SEC;
            let edge = if t0 < duration * 0.06 || t0 + 15.0 > duration * 0.94 { 0.7 } else { 1.0 };
            (0.65 * r + 0.35 * e) * quiet * edge
        })
        .collect();
    let best = score.iter().cloned().fold(f32::MIN, f32::max);
    // The first strong occurrence: a hook usually plays 2-3 times, and the
    // first full one is the cleanest to cut.
    let peak = |i: usize| (i.saturating_sub(2)..(i + 3).min(starts)).all(|j| score[j] <= score[i]);
    let hook_w = if use_rep {
        (0..starts).find(|&i| score[i] >= best * 0.95 && peak(i)).unwrap_or(0)
    } else {
        (0..starts).max_by(|&a, &b| score[a].total_cmp(&score[b]).then(b.cmp(&a))).unwrap_or(0)
    };
    let hook = place(hook_w, 15.0);
    let repeats = if use_rep {
        (0..starts)
            .filter(|&i| i + len <= hook_w || i >= hook_w + len)
            .filter(|&i| segment_similarity(feats, hook_w, i, len) > 0.8)
            .fold(Vec::<usize>::new(), |mut acc, i| {
                if acc.last().is_none_or(|&l| i >= l + len) {
                    acc.push(i);
                }
                acc
            })
            .len()
    } else {
        0
    };
    let hook_reason = if repeats > 0 {
        format!("comes back {} times", repeats + 1)
    } else {
        "loudest stretch".to_string()
    };
    out.push(clip("Hook 15s", hook, 15.0, Some(hook_reason)));
    if duration >= 30.0 {
        if use_rep {
            // Build into the hook: start ~8 s before it.
            let w = windows((hook - 8.0).max(0.0));
            out.push(clip("Teaser 30s", place(w, 30.0), 30.0, Some("builds into the hook".to_string())));
        } else if let Some(w) = loudest_run(energy, windows(30.0), |_| false) {
            out.push(clip("Teaser 30s", snap(w as f64 * WINDOW_SEC, 30.0, duration, bpm), 30.0, None));
        }
    }
    // Clear of the hook on both sides (placement moves a start by up to half
    // a bar), not a repeat of it, then check the placed result anyway.
    let pad = bar.map_or(0, |b| ((b / 2.0) / WINDOW_SEC).ceil() as usize);
    let (hook_start, hook_end) = (windows(hook), windows(hook + 15.0));
    let blocked = |i: usize| (i + len + pad > hook_start && i < hook_end + pad) || (use_rep && segment_similarity(feats, hook_w, i, len) > 0.8);
    if let Some(w) = loudest_run(energy, len, blocked) {
        let alt = place(w, 15.0);
        if alt + 15.0 <= hook || alt >= hook + 15.0 {
            out.push(clip("Alt 15s", alt, 15.0, use_rep.then(|| "another loud part, not the hook".to_string())));
        }
    }
    out
}

pub(crate) fn write_wav(path: &Path, samples: &[f32], channels: u16, rate: u32) -> std::io::Result<()> {
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
    output_folder: String,
    folder_name: String,
    files: Vec<KitFile>,
    master: Option<String>,
    master_name: String,
    clips: Vec<Snippet>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // <export folder>/Launch Kits/<song>; the song part is sanitized here
        // so a title like ".." can't climb out.
        let dir = PathBuf::from(&output_folder)
            .join(crate::scanner::LAUNCH_KITS_DIR)
            .join(safe_name(&folder_name));
        fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
        for f in &files {
            let path = dir.join(safe_name(&f.name));
            fs::write(&path, &f.content).map_err(|e| format!("could not write {}: {e}", path.display()))?;
        }
        if let Some(master) = master {
            let src = Path::new(&master);
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("wav");
            let dest = dir.join(format!("{}.{ext}", safe_name(&master_name)));
            // Copying a file onto itself truncates it on Unix: never do that.
            let same = matches!((src.canonicalize(), dest.canonicalize()), (Ok(a), Ok(b)) if a == b);
            if !same {
                fs::copy(src, &dest).map_err(|e| format!("could not copy the mixdown: {e}"))?;
            }
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

    /// A rap-shaped song at 8 kHz: intro, verse, hook, verse, the same hook,
    /// then an outro louder than everything. Loudness alone picks the outro.
    #[test]
    fn finds_the_hook_that_comes_back_not_the_loud_outro() {
        let rate = 8000u32;
        let mut seed = 11u32;
        let mut next = move || {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            (seed >> 16) % 1000
        };
        // Each half second plays two tones; verses draw new ones, the hook
        // replays the same 30 pairs.
        let mut pair = || (150.0 + next() as f64 * 2.5, 300.0 + next() as f64 * 3.0);
        let hook_pairs: Vec<(f64, f64)> = (0..30).map(|_| pair()).collect();
        let mut plan: Vec<((f64, f64), f64)> = Vec::new();
        plan.extend((0..20).map(|_| ((220.0, 0.0), 0.15))); // intro 0-10 s
        plan.extend((0..60).map(|_| (pair(), 0.5))); // verse 10-40 s
        plan.extend(hook_pairs.iter().map(|&p| (p, 0.55))); // hook 40-55 s
        plan.extend((0..60).map(|_| (pair(), 0.5))); // verse 55-85 s
        plan.extend(hook_pairs.iter().map(|&p| (p, 0.55))); // hook 85-100 s
        plan.extend((0..40).map(|_| (pair(), 0.95))); // loud outro 100-120 s
        let mut samples = Vec::new();
        for ((f1, f2), amp) in plan {
            for i in 0..rate / 2 {
                let t = i as f64 / rate as f64;
                let v = (t * f1 * std::f64::consts::TAU).sin() + if f2 > 0.0 { (t * f2 * std::f64::consts::TAU).sin() } else { 0.0 };
                samples.push((amp * 0.5 * v) as f32);
            }
        }
        let dir = temp("hook");
        let path = dir.join("song.wav");
        write_wav(&path, &samples, 1, rate).unwrap();
        let a = analyze(&path, None).unwrap();
        let _ = fs::remove_dir_all(&dir);
        let hook = &a.snippets[0];
        assert!((38.0..=42.5).contains(&hook.start_sec), "hook at {} (expected ~40 s, the first hook)", hook.start_sec);
        assert_eq!(hook.reason.as_deref(), Some("comes back 2 times"));
        let teaser = &a.snippets[1];
        assert!(teaser.start_sec < hook.start_sec && teaser.start_sec + 30.0 > hook.start_sec + 15.0, "teaser {} builds into the hook", teaser.start_sec);
        if let Some(alt) = a.snippets.iter().find(|s| s.label == "Alt 15s") {
            assert!(!(83.0..=87.0).contains(&alt.start_sec), "alt isn't the second hook");
        }
    }

    #[test]
    fn snaps_to_bars() {
        // 120 BPM: a bar is 2s.
        let s = pick_snippets(&[1.0; 120], 60.0, Some(120.0));
        assert!(s.iter().all(|c| (c.start_sec / 2.0).fract() == 0.0));
        assert!(pick_snippets(&[1.0; 20], 10.0, None).is_empty(), "too short for a 15s clip");
        assert!(pick_snippets(&[1.0; 30], 14.9, None).is_empty(), "14.9 s isn't a 15 s clip");
        let short = pick_snippets(&[1.0; 50], 25.0, None);
        assert!(short.iter().all(|s| s.length_sec == 15.0), "no 30 s teaser from 25 s");
    }

    #[test]
    fn alt_never_overlaps_hook_after_snapping() {
        // Two loud blocks close together; at 40 BPM a bar is 6 s, so naive
        // snapping could pull the alt into the hook.
        for offset in 0..12 {
            let energy: Vec<f32> = (0..240)
                .map(|i| if (60..90).contains(&i) || (92 + offset..122 + offset).contains(&i) { 1.0 } else { 0.1 })
                .collect();
            let s = pick_snippets(&energy, 120.0, Some(40.0));
            let hook = &s[0];
            if let Some(alt) = s.iter().find(|c| c.label == "Alt 15s") {
                assert!(
                    alt.start_sec + 15.0 <= hook.start_sec || alt.start_sec >= hook.start_sec + 15.0,
                    "offset {offset}: alt {} overlaps hook {}",
                    alt.start_sec,
                    hook.start_sec
                );
            }
        }
    }

    #[test]
    fn exports_clips_with_exact_length() {
        let dir = temp("export");
        let src = fixture(&dir);
        let clips = vec![Snippet { label: "Hook 15s".into(), start_sec: 30.0, length_sec: 15.0, reason: None }];
        let written = export_clips(&src, &clips, &dir.join("snippets")).unwrap();
        let bytes = fs::read(&written[0]).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(written[0].ends_with("snippets/Hook 15s.wav"));
        assert_eq!(bytes.len(), 44 + 15 * 8000 * 2);
    }

    #[test]
    fn reads_the_master_spec_and_counts_clipping() {
        let dir = temp("master");
        let path = dir.join("master.wav");
        // 2 s of stereo at 48 kHz, quiet, with 5 full-scale samples.
        let mut samples = vec![0.25f32; 48_000 * 2 * 2];
        for s in samples.iter_mut().take(5) {
            *s = 1.0;
        }
        write_wav(&path, &samples, 2, 48_000).unwrap();
        let a = analyze(&path, None).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(
            (a.master.container.as_str(), a.master.sample_rate, a.master.channels, a.master.bits_per_sample),
            ("wav", 48_000, 2, Some(16))
        );
        assert_eq!(a.master.clipped_samples, 5);
        assert!(a.master.peak > 0.999);
    }

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("a/b:c"), "a_b_c");
        assert_eq!(safe_name(" .. "), "Untitled");
    }
}
