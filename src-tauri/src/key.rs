//! Musical key from audio (Launch Kit): a chroma profile (energy per pitch
//! class) averaged over the whole mixdown, matched against the
//! Krumhansl–Schmuckler major and minor key profiles. Solid on tonal music;
//! a beat with little harmony gives a low confidence, which the UI shows
//! instead of pretending.

use rustfft::{num_complex::Complex, Fft, FftPlanner};
use serde::Serialize;
use std::sync::Arc;

/// 16k samples: ~2.7 Hz per bin at 44.1 kHz, fine enough to tell semitones
/// apart down to the bass, where rap beats carry most of their harmony.
const FRAME: usize = 16_384;
const LOW_HZ: f32 = 65.0;
const HIGH_HZ: f32 = 2_000.0;
/// Same spelling as the app's key list (src/lib/songs.ts).
const NAMES: [&str; 12] = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MAJOR: [f64; 12] = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR: [f64; 12] = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEstimate {
    /// "Am", "F#", "Bb"…
    pub key: String,
    /// 0–1: how clearly this key beats the next best one.
    pub confidence: f32,
}

pub struct Chroma {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    buf: Vec<f32>,
    rate: u32,
    sum: [f64; 12],
    frames: usize,
}

impl Chroma {
    pub fn new() -> Self {
        let window = (0..FRAME)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (FRAME - 1) as f32).cos())
            .collect();
        Chroma { fft: FftPlanner::new().plan_fft_forward(FRAME), window, buf: Vec::with_capacity(FRAME), rate: 0, sum: [0.0; 12], frames: 0 }
    }

    /// One mono sample at `rate` Hz.
    pub fn push(&mut self, sample: f32, rate: u32) {
        self.rate = rate;
        self.buf.push(sample);
        if self.buf.len() == FRAME {
            self.frame();
            self.buf.clear();
        }
    }

    fn frame(&mut self) {
        let mut data: Vec<Complex<f32>> = self.buf.iter().zip(&self.window).map(|(x, w)| Complex::new(x * w, 0.0)).collect();
        self.fft.process(&mut data);
        let bin_hz = self.rate as f32 / FRAME as f32;
        let mut pc = [0f64; 12];
        for (k, c) in data.iter().enumerate().take(FRAME / 2).skip(1) {
            let f = k as f32 * bin_hz;
            if !(LOW_HZ..=HIGH_HZ).contains(&f) {
                continue;
            }
            let midi = 69.0 + 12.0 * (f / 440.0).log2();
            pc[(midi.round() as i64).rem_euclid(12) as usize] += c.norm() as f64;
        }
        // Each frame counts once, so a loud chorus doesn't drown the rest.
        let total: f64 = pc.iter().sum();
        if total > 1e-3 {
            for (s, v) in self.sum.iter_mut().zip(pc) {
                *s += v / total;
            }
            self.frames += 1;
        }
    }

    pub fn estimate(&self) -> Option<KeyEstimate> {
        if self.frames < 4 {
            return None;
        }
        let mut scores: Vec<(f64, String)> = Vec::with_capacity(24);
        for tonic in 0..12 {
            let rotated: Vec<f64> = (0..12).map(|i| self.sum[(i + tonic) % 12]).collect();
            scores.push((pearson(&rotated, &MAJOR), NAMES[tonic].to_string()));
            scores.push((pearson(&rotated, &MINOR), format!("{}m", NAMES[tonic])));
        }
        scores.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let (best, ref key) = scores[0];
        let margin = best - scores[1].0;
        // A strong fit that clearly beats the runner-up (often the relative
        // major/minor) is sure; a weak or close fit isn't.
        let confidence = (best.max(0.0) * (0.4 + 0.6 * (margin / 0.12).min(1.0))) as f32;
        Some(KeyEstimate { key: key.clone(), confidence: confidence.clamp(0.0, 1.0) })
    }
}

fn pearson(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len() as f64;
    let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
    let (mut sxy, mut sxx, mut syy) = (0.0, 0.0, 0.0);
    for (a, b) in x.iter().zip(y) {
        sxy += (a - mx) * (b - my);
        sxx += (a - mx).powi(2);
        syy += (b - my).powi(2);
    }
    if sxx <= 0.0 || syy <= 0.0 {
        0.0
    } else {
        sxy / (sxx * syy).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tones(freqs: &[f32], secs: f32) -> Chroma {
        let rate = 44_100u32;
        let mut c = Chroma::new();
        for i in 0..(rate as f32 * secs) as usize {
            let t = i as f32 / rate as f32;
            let s: f32 = freqs.iter().map(|f| (2.0 * std::f32::consts::PI * f * t).sin()).sum::<f32>() / freqs.len() as f32;
            c.push(s, rate);
        }
        c
    }

    #[test]
    fn a_minor_chord_is_a_minor() {
        // A2 bass + A3 C4 E4.
        let k = tones(&[110.0, 220.0, 261.63, 329.63], 8.0).estimate().unwrap();
        assert_eq!(k.key, "Am");
    }

    #[test]
    fn c_major_chord_is_c() {
        let k = tones(&[130.81, 261.63, 329.63, 392.0], 8.0).estimate().unwrap();
        assert_eq!(k.key, "C");
    }

    #[test]
    fn f_sharp_minor_uses_the_app_spelling() {
        // F#2 bass + F#3 A3 C#4.
        let k = tones(&[92.5, 185.0, 220.0, 277.18], 8.0).estimate().unwrap();
        assert_eq!(k.key, "F#m");
    }

    #[test]
    fn silence_has_no_key() {
        let mut c = Chroma::new();
        for _ in 0..FRAME * 6 {
            c.push(0.0, 44_100);
        }
        assert!(c.estimate().is_none());
    }
}
