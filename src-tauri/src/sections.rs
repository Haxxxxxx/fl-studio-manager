//! Where the hook is (Launch Kit snippets). Loudness alone is a poor guide on
//! a mastered rap track: the limiter makes every section about as loud, so
//! the "loudest 15 s" is close to random. What sets a hook apart is that it
//! comes back: the same vocal over the same beat, often the very same audio
//! pasted 2-3 times, while each verse is new. So we take a timbre
//! fingerprint (energy in 12 bands) every half second, find the stretch that
//! repeats most elsewhere in the song, and only then weigh in loudness.
//! A fine loudness envelope also lets clips start on a real onset instead of
//! a bar grid that assumes the first beat is at 0:00.

use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;

pub const BANDS: usize = 12;
/// ~46 ms at 44.1 kHz: fine enough to follow vocal syllables.
const FRAME: usize = 2048;
const LOW_HZ: f32 = 60.0;
const HIGH_HZ: f32 = 8_000.0;
/// Resolution of the onset envelope used for snapping.
pub const FINE_SEC: f64 = 0.05;

pub type Features = [f32; BANDS];

pub struct Timbre {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    buf: Vec<f32>,
    rate: u32,
    /// (frame start in seconds, log band energies)
    frames: Vec<(f64, Features)>,
    samples: u64,
    fine: Vec<f32>,
    fine_acc: f64,
    fine_n: usize,
}

impl Timbre {
    pub fn new() -> Self {
        let window = (0..FRAME)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (FRAME - 1) as f32).cos())
            .collect();
        Timbre {
            fft: FftPlanner::new().plan_fft_forward(FRAME),
            window,
            buf: Vec::with_capacity(FRAME),
            rate: 0,
            frames: Vec::new(),
            samples: 0,
            fine: Vec::new(),
            fine_acc: 0.0,
            fine_n: 0,
        }
    }

    /// One mono sample at `rate` Hz.
    pub fn push(&mut self, sample: f32, rate: u32) {
        self.rate = rate;
        self.samples += 1;
        self.fine_acc += (sample as f64) * (sample as f64);
        self.fine_n += 1;
        if self.fine_n >= ((rate as f64 * FINE_SEC) as usize).max(1) {
            self.fine.push((self.fine_acc / self.fine_n as f64).sqrt() as f32);
            self.fine_acc = 0.0;
            self.fine_n = 0;
        }
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
        let mut bands = [0f32; BANDS];
        for (k, c) in data.iter().enumerate().take(FRAME / 2).skip(1) {
            let f = k as f32 * bin_hz;
            if !(LOW_HZ..HIGH_HZ).contains(&f) {
                continue;
            }
            let b = ((f / LOW_HZ).ln() / (HIGH_HZ / LOW_HZ).ln() * BANDS as f32) as usize;
            bands[b.min(BANDS - 1)] += c.norm_sqr();
        }
        let start = (self.samples - FRAME as u64) as f64 / self.rate.max(1) as f64;
        self.frames.push((start, bands.map(|e| (e + 1e-9).ln())));
    }

    /// Features per `window_sec` window (`windows` of them, aligned with the
    /// loudness windows) and the fine onset envelope.
    pub fn finish(self, window_sec: f64, windows: usize) -> (Vec<Features>, Vec<f32>) {
        let mut sums = vec![[0f32; BANDS]; windows];
        let mut counts = vec![0u32; windows];
        for (t, f) in &self.frames {
            let w = (t / window_sec) as usize;
            if w < windows {
                for (s, v) in sums[w].iter_mut().zip(f) {
                    *s += v;
                }
                counts[w] += 1;
            }
        }
        // A window no frame landed in (tiny files) borrows its neighbour.
        let mut feats: Vec<Features> = Vec::with_capacity(windows);
        for w in 0..windows {
            if counts[w] > 0 {
                feats.push(sums[w].map(|s| s / counts[w] as f32));
            } else {
                let prev = feats.last().copied().unwrap_or([0.0; BANDS]);
                feats.push(prev);
            }
        }
        (feats, self.fine)
    }
}

/// Each band centred and scaled over the song (so the beat that plays
/// throughout cancels out and what changes stands out), then each window
/// scaled to unit length.
fn normalize(feats: &[Features]) -> Vec<Features> {
    let n = feats.len().max(1) as f32;
    let mut mean = [0f32; BANDS];
    let mut sd = [0f32; BANDS];
    for f in feats {
        for b in 0..BANDS {
            mean[b] += f[b] / n;
        }
    }
    for f in feats {
        for b in 0..BANDS {
            sd[b] += (f[b] - mean[b]).powi(2) / n;
        }
    }
    feats
        .iter()
        .map(|f| {
            let mut v = [0f32; BANDS];
            for b in 0..BANDS {
                v[b] = (f[b] - mean[b]) / sd[b].sqrt().max(1e-3);
            }
            let len = v.iter().map(|x| x * x).sum::<f32>().sqrt();
            if len > 1e-6 {
                v.iter_mut().for_each(|x| *x /= len);
            }
            v
        })
        .collect()
}

fn dot(a: &Features, b: &Features) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// For each start, how closely the `len` windows from there come back
/// somewhere else in the song (mean cosine similarity of the best
/// non-overlapping repeat, -1..1).
pub fn repetition(feats: &[Features], len: usize) -> Vec<f32> {
    let n = feats.len();
    if len == 0 || n < len {
        return Vec::new();
    }
    let f = normalize(feats);
    let mut best = vec![-1f32; n - len + 1];
    // Every lag of at least one segment length: diagonal prefix sums give
    // each start's segment similarity in O(1).
    for lag in len..=n - len {
        let mut prefix = vec![0f32; n - lag + 1];
        for i in 0..n - lag {
            prefix[i + 1] = prefix[i] + dot(&f[i], &f[i + lag]);
        }
        for i in 0..=n - lag - len {
            let s = (prefix[i + len] - prefix[i]) / len as f32;
            if s > best[i] {
                best[i] = s;
            }
            if s > best[i + lag] {
                best[i + lag] = s;
            }
        }
    }
    best
}

/// Mean similarity between the segments starting at `a` and `b`.
pub fn segment_similarity(feats: &[Features], a: usize, b: usize, len: usize) -> f32 {
    let f = normalize(feats);
    if a + len > f.len() || b + len > f.len() || len == 0 {
        return 0.0;
    }
    (0..len).map(|k| dot(&f[a + k], &f[b + k])).sum::<f32>() / len as f32
}

/// The time near `around` (within `radius` seconds) where the sound jumps
/// up the most: a downbeat, a vocal entry. None when nothing stands out.
pub fn onset_near(fine: &[f32], around: f64, radius: f64) -> Option<f64> {
    if fine.len() < 8 {
        return None;
    }
    let lo = ((around - radius) / FINE_SEC).floor().max(4.0) as usize;
    let hi = (((around + radius) / FINE_SEC).ceil() as usize).min(fine.len() - 1);
    let peak = fine.iter().cloned().fold(0f32, f32::max).max(1e-6);
    let mut best: Option<(usize, f32)> = None;
    for t in lo..=hi {
        let before = fine[t - 4..t].iter().sum::<f32>() / 4.0;
        let rise = (fine[t] - before) / peak;
        if best.is_none_or(|(_, r)| rise > r) {
            best = Some((t, rise));
        }
    }
    // A jump of a few percent of the peak is noise, not an onset.
    best.filter(|(_, r)| *r > 0.04).map(|(t, _)| t as f64 * FINE_SEC)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(f: f32, rate: u32, secs: f32, amp: f32) -> Vec<f32> {
        (0..(rate as f32 * secs) as usize).map(|i| amp * (i as f32 / rate as f32 * f * std::f32::consts::TAU).sin()).collect()
    }

    #[test]
    fn tells_bands_apart() {
        let rate = 22_050;
        let mut low = Timbre::new();
        tone(100.0, rate, 1.0, 0.5).into_iter().for_each(|s| low.push(s, rate));
        let mut high = Timbre::new();
        tone(3000.0, rate, 1.0, 0.5).into_iter().for_each(|s| high.push(s, rate));
        let (a, _) = low.finish(0.5, 2);
        let (b, _) = high.finish(0.5, 2);
        let loudest = |f: &Features| f.iter().enumerate().max_by(|x, y| x.1.total_cmp(y.1)).unwrap().0;
        assert!(loudest(&a[0]) < loudest(&b[0]), "100 Hz lands in a lower band than 3 kHz");
    }

    #[test]
    fn a_repeated_stretch_scores_highest() {
        // 40 windows: 10 random, 10 "hook", 10 random, the hook again.
        let mut seed = 7u32;
        let mut rnd = || {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            (seed >> 16) as f32 / 65_536.0
        };
        let hook: Vec<Features> = (0..10).map(|_| std::array::from_fn(|_| rnd())).collect();
        let mut feats: Vec<Features> = Vec::new();
        feats.extend((0..10).map(|_| std::array::from_fn(|_| rnd())));
        feats.extend(hook.iter().copied());
        feats.extend((0..10).map(|_| std::array::from_fn(|_| rnd())));
        feats.extend(hook.iter().copied());
        let r = repetition(&feats, 10);
        let best = (0..r.len()).max_by(|&a, &b| r[a].total_cmp(&r[b])).unwrap();
        assert!(best == 10 || best == 30, "best start {best}");
        assert!(r[10] > 0.99 && r[0] < 0.6);
        assert!(segment_similarity(&feats, 10, 30, 10) > 0.99);
    }

    #[test]
    fn finds_the_onset() {
        let mut fine = vec![0.05f32; 100];
        fine[60..].iter_mut().for_each(|x| *x = 0.9);
        assert_eq!(onset_near(&fine, 2.8, 0.5), Some(60.0 * FINE_SEC));
        assert_eq!(onset_near(&vec![0.5f32; 100], 2.0, 0.5), None, "flat: no onset");
    }
}
