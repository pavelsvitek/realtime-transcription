//! Acoustic echo cancellation for dual mic + system-audio capture.
//!
//! When the speakers are playing the system stream, the microphone hears that
//! same audio a few milliseconds later. The system loopback is a clean copy of
//! what was sent to the speakers, so it can be used as the far-end reference.
//! This module lines the two streams up on one clock, estimates the delay, and
//! subtracts the estimated echo with a partitioned frequency-domain NLMS filter
//! (the same MDF structure Speex uses) before the mic samples reach the
//! transcription model.
//!
//! Mic-only and system-only sessions never construct a canceller. Headphones
//! and a quiet room produce a weak correlation, and in that case the mic is
//! forwarded unchanged.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

const MAX_FAR_END_SAMPLES: usize = 48_000 * 15;
const PARTITIONS: usize = 12;
const MIN_CANCEL_NCC: f32 = 0.5;

struct FarChunk {
    seq: u64,
    samples: Vec<f32>,
    captured_at: Instant,
}

struct FarState {
    chunks: VecDeque<FarChunk>,
    next_seq: u64,
    sample_count: usize,
}

/// Loopback audio published by the system-audio capture and consumed by the
/// mic canceller. Chunks keep the callback timestamp so the two devices can
/// be aligned even though their sample clocks start at different moments.
pub struct SharedFarEnd {
    t0: Instant,
    inner: Mutex<FarState>,
}

impl SharedFarEnd {
    pub fn new(t0: Instant) -> Self {
        Self {
            t0,
            inner: Mutex::new(FarState {
                chunks: VecDeque::new(),
                next_seq: 0,
                sample_count: 0,
            }),
        }
    }

    pub fn t0(&self) -> Instant {
        self.t0
    }

    pub fn push(&self, samples: &[f32], captured_at: Instant) {
        if samples.is_empty() {
            return;
        }
        let mut state = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        let seq = state.next_seq;
        state.next_seq += 1;
        state.sample_count += samples.len();
        state.chunks.push_back(FarChunk {
            seq,
            samples: samples.to_vec(),
            captured_at,
        });
        while state.sample_count > MAX_FAR_END_SAMPLES && state.chunks.len() > 1 {
            if let Some(old) = state.chunks.pop_front() {
                state.sample_count = state.sample_count.saturating_sub(old.samples.len());
            }
        }
    }

    fn drain(&self) -> Vec<FarChunk> {
        let mut state = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        state.sample_count = 0;
        state.chunks.drain(..).collect()
    }
}

/// Mono audio placed on a shared sample clock.
struct Timeline {
    origin: i64,
    samples: VecDeque<f32>,
}

impl Timeline {
    fn new() -> Self {
        Self {
            origin: 0,
            samples: VecDeque::new(),
        }
    }

    fn len(&self) -> usize {
        self.samples.len()
    }

    fn end(&self) -> i64 {
        self.origin + self.samples.len() as i64
    }

    fn push(&mut self, start: i64, data: &[f32]) {
        if data.is_empty() {
            return;
        }
        if self.samples.is_empty() {
            self.origin = start;
            self.samples.extend(data);
            return;
        }
        let end = self.end();
        if start >= end {
            let gap = (start - end) as usize;
            self.samples.extend(std::iter::repeat(0.0).take(gap));
            self.samples.extend(data);
            return;
        }
        let already = (end - start) as usize;
        if already < data.len() {
            self.samples.extend(data[already..].iter().copied());
        }
    }

    fn slice(&self, start: i64, len: usize) -> Option<Vec<f32>> {
        if start < self.origin {
            return None;
        }
        let offset = (start - self.origin) as usize;
        if offset.saturating_add(len) > self.samples.len() {
            return None;
        }
        Some(
            self.samples
                .iter()
                .skip(offset)
                .take(len)
                .copied()
                .collect(),
        )
    }

    fn discard_before(&mut self, tick: i64) {
        if tick <= self.origin {
            return;
        }
        let drop_n = ((tick - self.origin) as usize).min(self.samples.len());
        self.samples.drain(..drop_n);
        self.origin += drop_n as i64;
    }

    fn take_all(&mut self) -> Vec<f32> {
        let out: Vec<f32> = self.samples.drain(..).collect();
        self.origin += out.len() as i64;
        out
    }
}

struct LinearResampler {
    from: u32,
    to: u32,
    pending: VecDeque<f32>,
    pos: f64,
}

impl LinearResampler {
    fn new(from: u32, to: u32) -> Self {
        Self {
            from: from.max(1),
            to: to.max(1),
            pending: VecDeque::new(),
            pos: 0.0,
        }
    }

    fn push(&mut self, input: &[f32]) -> Vec<f32> {
        if input.is_empty() {
            return Vec::new();
        }
        if self.from == self.to {
            return input.to_vec();
        }
        self.pending.extend(input);
        let step = f64::from(self.from) / f64::from(self.to);
        let mut out = Vec::new();
        while self.pos + 1.0 < self.pending.len() as f64 {
            let index = self.pos.floor() as usize;
            let frac = (self.pos - index as f64) as f32;
            let left = self.pending[index];
            let right = self.pending[index + 1];
            out.push(left + (right - left) * frac);
            self.pos += step;
        }
        let drop_n = self.pos.floor() as usize;
        if drop_n > 0 {
            self.pending.drain(..drop_n);
            self.pos -= drop_n as f64;
            if self.pos < 0.0 {
                self.pos = 0.0;
            }
        }
        out
    }
}

struct Mdf {
    frame: usize,
    fft_len: usize,
    h: Vec<Vec<f32>>,
    h_freq: Vec<Vec<Complex<f32>>>,
    u_hist: VecDeque<Vec<Complex<f32>>>,
    prev: Vec<f32>,
    power: Vec<f32>,
    fft: Arc<dyn Fft<f32>>,
    ifft: Arc<dyn Fft<f32>>,
    scratch: Vec<Complex<f32>>,
}

impl Mdf {
    fn new(sample_rate: u32) -> Self {
        let frame = (sample_rate as usize / 100).max(40);
        let fft_len = frame * 2;
        let mut planner = FftPlanner::<f32>::new();
        let mut h_freq = Vec::with_capacity(PARTITIONS);
        for _ in 0..PARTITIONS {
            h_freq.push(vec![Complex::new(0.0, 0.0); fft_len]);
        }
        Self {
            frame,
            fft_len,
            h: vec![vec![0.0; frame]; PARTITIONS],
            h_freq,
            u_hist: VecDeque::new(),
            prev: vec![0.0; frame],
            power: vec![1e-8; fft_len],
            fft: planner.plan_fft_forward(fft_len),
            ifft: planner.plan_fft_inverse(fft_len),
            scratch: vec![Complex::new(0.0, 0.0); fft_len],
        }
    }

    fn reset(&mut self) {
        for taps in &mut self.h {
            taps.fill(0.0);
        }
        for freq in &mut self.h_freq {
            for bin in freq {
                *bin = Complex::new(0.0, 0.0);
            }
        }
        self.u_hist.clear();
        self.prev.fill(0.0);
        self.power.fill(1e-8);
    }

    fn process_frame(&mut self, mic: &[f32], reference: &[f32], mu: f32) -> Vec<f32> {
        let n = self.frame;
        let fft_len = self.fft_len;
        debug_assert_eq!(mic.len(), n);
        debug_assert_eq!(reference.len(), n);

        for i in 0..n {
            self.scratch[i] = Complex::new(self.prev[i], 0.0);
            self.scratch[n + i] = Complex::new(reference[i], 0.0);
        }
        self.prev.copy_from_slice(reference);
        self.fft.process(&mut self.scratch);
        self.u_hist.push_front(self.scratch.clone());
        if self.u_hist.len() > PARTITIONS {
            self.u_hist.pop_back();
        }

        self.scratch.fill(Complex::new(0.0, 0.0));
        for (partition, spectrum) in self.u_hist.iter().enumerate() {
            let weights = &self.h_freq[partition];
            for bin in 0..fft_len {
                self.scratch[bin] += weights[bin] * spectrum[bin];
            }
        }
        self.ifft.process(&mut self.scratch);
        let scale = 1.0 / fft_len as f32;
        let mut error = vec![0.0f32; n];
        for i in 0..n {
            let echo = self.scratch[n + i].re * scale;
            error[i] = mic[i] - echo;
        }

        let mic_energy = energy(mic);
        let error_energy = energy(&error);
        if error_energy > mic_energy * 8.0 + 1e-3 {
            self.zero_weights();
            return mic.to_vec();
        }

        if mu > 0.0 && energy(reference) > 1e-8 {
            let mut instant = vec![0.0f32; fft_len];
            for spectrum in &self.u_hist {
                for bin in 0..fft_len {
                    instant[bin] += spectrum[bin].norm_sqr();
                }
            }
            for bin in 0..fft_len {
                self.power[bin] = 0.85 * self.power[bin] + 0.15 * instant[bin];
            }
            let mean_power = self.power.iter().sum::<f32>() / fft_len as f32 + 1e-12;

            for i in 0..n {
                self.scratch[i] = Complex::new(0.0, 0.0);
                self.scratch[n + i] = Complex::new(error[i], 0.0);
            }
            self.fft.process(&mut self.scratch);
            let error_spectrum = self.scratch.clone();

            let partitions = self.u_hist.len();
            for partition in 0..partitions {
                let spectrum = self.u_hist[partition].clone();
                for bin in 0..fft_len {
                    let denom = self.power[bin] + 0.02 * mean_power;
                    self.scratch[bin] = spectrum[bin].conj() * error_spectrum[bin] / denom;
                }
                self.ifft.process(&mut self.scratch);
                for i in 0..n {
                    self.h[partition][i] += mu * self.scratch[i].re * scale;
                }
                self.rebuild_partition(partition);
            }

            let mut tap_energy = 0.0f32;
            for taps in &self.h {
                tap_energy += energy(taps);
            }
            if !tap_energy.is_finite() || tap_energy > 50.0 {
                self.zero_weights();
                return mic.to_vec();
            }
        }

        for sample in &mut error {
            if !sample.is_finite() {
                return mic.to_vec();
            }
        }
        error
    }

    fn zero_weights(&mut self) {
        for taps in &mut self.h {
            taps.fill(0.0);
        }
        for freq in &mut self.h_freq {
            for bin in freq {
                *bin = Complex::new(0.0, 0.0);
            }
        }
    }

    fn rebuild_partition(&mut self, partition: usize) {
        let n = self.frame;
        for i in 0..n {
            self.scratch[i] = Complex::new(self.h[partition][i], 0.0);
        }
        for i in n..self.fft_len {
            self.scratch[i] = Complex::new(0.0, 0.0);
        }
        self.fft.process(&mut self.scratch);
        self.h_freq[partition].copy_from_slice(&self.scratch);
    }
}

/// Subtracts system-audio echo from the microphone.
pub struct AcousticEchoCanceller {
    mic_rate: u32,
    t0: Instant,
    far_end: Arc<SharedFarEnd>,
    resampler: LinearResampler,
    reference: Timeline,
    mic: Timeline,
    /// Recent microphone audio kept after playback so delay can be re-estimated.
    mic_history: Timeline,
    next_far_seq: u64,
    saw_far_seq: bool,
    reference_started: bool,
    mic_started: bool,
    next_out: Option<i64>,
    lag: i64,
    ncc: f32,
    cancelling: bool,
    decided: bool,
    samples_since_estimate: usize,
    mdf: Mdf,
}

impl AcousticEchoCanceller {
    pub fn new(mic_rate: u32, reference_rate: u32, far_end: Arc<SharedFarEnd>) -> Self {
        let mic_rate = mic_rate.max(1);
        tracing::info!(
            mic_rate,
            reference_rate,
            "Echo canceller armed (system loopback is the far-end reference)"
        );
        Self {
            mic_rate,
            t0: far_end.t0(),
            far_end,
            resampler: LinearResampler::new(reference_rate.max(1), mic_rate),
            reference: Timeline::new(),
            mic: Timeline::new(),
            mic_history: Timeline::new(),
            next_far_seq: 0,
            saw_far_seq: false,
            reference_started: false,
            mic_started: false,
            next_out: None,
            lag: 0,
            ncc: 0.0,
            cancelling: false,
            decided: false,
            samples_since_estimate: 0,
            mdf: Mdf::new(mic_rate),
        }
    }

    /// Remove echo from one microphone chunk. May return an empty buffer while
    /// the first few hundred milliseconds are held back for delay estimation.
    pub fn process_mic(&mut self, samples: &[f32], captured_at: Instant) -> Vec<f32> {
        self.ingest_far_end();
        self.ingest_mic(samples, captured_at);
        self.pump(false)
    }

    /// Emit any mic audio still held for alignment. Leftover partial frames
    /// are passed through so stopping a session does not drop the tail.
    pub fn flush(&mut self) -> Vec<f32> {
        self.ingest_far_end();
        let mut out = self.pump(true);
        out.extend(self.mic.take_all());
        out
    }

    fn ingest_far_end(&mut self) {
        let chunks = self.far_end.drain();
        for chunk in chunks {
            if self.saw_far_seq && chunk.seq != self.next_far_seq {
                tracing::warn!(
                    expected = self.next_far_seq,
                    got = chunk.seq,
                    "Far-end reference had a gap; resetting the echo filter"
                );
                self.mdf.reset();
            }
            self.saw_far_seq = true;
            self.next_far_seq = chunk.seq + 1;
            self.ingest_reference(&chunk.samples, chunk.captured_at);
        }
    }

    fn ingest_reference(&mut self, samples: &[f32], captured_at: Instant) {
        let resampled = self.resampler.push(samples);
        if resampled.is_empty() {
            return;
        }
        if !self.reference_started {
            // Anchor once. Later chunks are packed sample-by-sample so callback
            // jitter does not stretch the reference the filter is matching.
            let end_tick = self.tick(captured_at);
            let start = end_tick - resampled.len() as i64;
            self.reference.push(start, &resampled);
            self.reference_started = true;
        } else {
            let start = self.reference.end();
            self.reference.push(start, &resampled);
        }
    }

    fn ingest_mic(&mut self, samples: &[f32], captured_at: Instant) {
        if samples.is_empty() {
            return;
        }
        let start = if !self.mic_started {
            self.mic_started = true;
            self.tick(captured_at) - samples.len() as i64
        } else {
            self.mic.end()
        };
        self.mic.push(start, samples);
        self.mic_history.push(start, samples);
        self.mic_history
            .discard_before(self.mic_history.end() - self.ms(2_000));
    }

    fn pump(&mut self, flushing: bool) -> Vec<f32> {
        if !self.decided {
            // Wait until the overlap is long enough for the delay search to see
            // a typical speaker path. Deciding on the first 100ms locks onto a
            // side lobe and then never cancels the real echo.
            let ready = self.aligned_span() >= self.ms(500);
            if ready {
                if let Some((lag, ncc)) = self.estimate_lag() {
                    self.apply_lock(lag, ncc);
                } else if flushing || self.mic_history.len() as i64 >= self.ms(800) {
                    self.force_passthrough();
                } else {
                    return Vec::new();
                }
            } else if flushing || self.mic_history.len() as i64 >= self.ms(800) {
                self.force_passthrough();
            } else {
                return Vec::new();
            }
        } else if self.samples_since_estimate >= self.mic_rate as usize {
            self.samples_since_estimate = 0;
            if let Some((lag, ncc)) = self.estimate_lag() {
                self.apply_reestimate(lag, ncc);
            }
        }

        if !self.cancelling {
            let passed = self.mic.take_all();
            self.samples_since_estimate = self.samples_since_estimate.saturating_add(passed.len());
            let mic_end = self.mic.end();
            self.reference.discard_before(mic_end - self.ms(2_000));
            return passed;
        }

        let mut out = Vec::new();
        let frame = self.mdf.frame as i64;
        loop {
            let start = self.next_out.unwrap_or(self.mic.origin);
            if self.mic.end() < start + frame {
                break;
            }
            let ref_start = start - self.shift();
            if ref_start < self.reference.origin {
                if let Some(mic) = self.mic.slice(start, frame as usize) {
                    out.extend(mic);
                    self.next_out = Some(start + frame);
                    continue;
                }
                break;
            }
            if self.reference.end() < ref_start + frame {
                let waiting = self.mic.end() - start;
                if flushing || waiting > self.ms(300) {
                    if let Some(mic) = self.mic.slice(start, frame as usize) {
                        out.extend(mic);
                        self.next_out = Some(start + frame);
                        continue;
                    }
                }
                break;
            }
            let Some(mic_frame) = self.mic.slice(start, frame as usize) else {
                break;
            };
            let Some(ref_frame) = self.reference.slice(ref_start, frame as usize) else {
                break;
            };
            out.extend(self.mdf.process_frame(&mic_frame, &ref_frame, self.mu()));
            self.next_out = Some(start + frame);
        }

        if let Some(next) = self.next_out {
            self.mic.discard_before(next);
            // Keep a couple of seconds so a later delay re-estimate can still
            // see the reference that lines up with recent mic audio.
            self.reference.discard_before(next - self.ms(2_000));
        }
        self.samples_since_estimate = self.samples_since_estimate.saturating_add(out.len());
        out
    }

    fn force_passthrough(&mut self) {
        self.decided = true;
        self.cancelling = false;
        tracing::info!("Echo canceller passing the mic through; reference alignment is not ready");
    }

    fn aligned_span(&self) -> i64 {
        let end = self.mic_history.end().min(self.reference.end());
        let start = self.mic_history.origin.max(self.reference.origin);
        (end - start).max(0)
    }

    fn apply_lock(&mut self, lag: i64, ncc: f32) {
        self.decided = true;
        self.lag = lag;
        self.ncc = ncc;
        self.cancelling = ncc >= MIN_CANCEL_NCC;
        self.samples_since_estimate = 0;
        if self.cancelling {
            self.next_out = Some(self.mic.origin);
            self.mdf.reset();
            tracing::info!(
                lag_ms = self.lag_ms(),
                ncc,
                "Echo canceller locked onto the speaker path"
            );
        } else {
            tracing::info!(
                ncc,
                "Echo canceller leaving the mic unchanged; speaker correlation is low"
            );
        }
    }

    fn apply_reestimate(&mut self, lag: i64, ncc: f32) {
        let previous = self.lag;
        self.ncc = ncc;
        if !self.cancelling {
            if ncc >= MIN_CANCEL_NCC {
                self.cancelling = true;
                self.lag = lag;
                self.mdf.reset();
                self.next_out = Some(self.mic.origin);
                tracing::info!(
                    lag_ms = self.lag_ms(),
                    ncc,
                    "Echo canceller started subtracting speaker bleed"
                );
            }
            return;
        }
        if ncc >= 0.5 && (lag - previous).abs() > self.ms(15) {
            self.lag = lag;
            self.mdf.reset();
            tracing::info!(
                lag_ms = self.lag_ms(),
                previous_lag_ms = previous as f32 * 1000.0 / self.mic_rate as f32,
                ncc,
                "Echo canceller shifted the reference delay"
            );
        }
    }

    fn mu(&self) -> f32 {
        if self.ncc >= 0.45 {
            0.65
        } else if self.ncc >= 0.30 {
            0.20
        } else {
            0.0
        }
    }

    fn shift(&self) -> i64 {
        self.lag - self.ms(20)
    }

    fn lag_ms(&self) -> f32 {
        self.lag as f32 * 1000.0 / self.mic_rate as f32
    }

    fn ms(&self, millis: i64) -> i64 {
        self.mic_rate as i64 * millis / 1000
    }

    fn tick(&self, at: Instant) -> i64 {
        let rate = f64::from(self.mic_rate);
        if at >= self.t0 {
            (at.duration_since(self.t0).as_secs_f64() * rate).round() as i64
        } else {
            -((self.t0.duration_since(at).as_secs_f64() * rate).round() as i64)
        }
    }

    /// Normalized correlation peak between the mic and the reference.
    ///
    /// The window sits far enough back that both positive acoustic delay and a
    /// late loopback still land inside the samples already captured.
    fn estimate_lag(&self) -> Option<(i64, f32)> {
        let win = self.ms(80);
        if (self.mic_history.len() as i64) < win || (self.reference.len() as i64) < win {
            return None;
        }
        let overlap_end = self.mic_history.end().min(self.reference.end());
        let overlap_start = self.mic_history.origin.max(self.reference.origin);
        if overlap_end - overlap_start < win + self.ms(40) {
            return None;
        }
        let history = overlap_end - overlap_start;
        let guard = (history / 4).min(self.ms(200));
        let mic_end = overlap_end - guard;
        let mic_start = mic_end - win;
        if mic_start < self.mic_history.origin {
            return None;
        }

        let desired_min = -self.ms(250);
        let desired_max = self.ms(400);
        let lag_min = desired_min.max(mic_end - self.reference.end());
        let lag_max = desired_max.min(mic_start - self.reference.origin);
        if lag_min > lag_max {
            return None;
        }

        let mic_window = self.mic_history.slice(mic_start, win as usize)?;
        if rms(&mic_window) < 1e-3 {
            return None;
        }

        let step = (self.mic_rate as i64 / 4_000).max(1);
        let coarse = step * 4;
        let mut best_lag = lag_min;
        let mut best = f32::NEG_INFINITY;
        let mut lag = lag_min;
        while lag <= lag_max {
            if let Some(score) = self.ncc_window(&mic_window, mic_start, lag) {
                if score > best {
                    best = score;
                    best_lag = lag;
                }
            }
            lag += coarse;
        }
        if !best.is_finite() {
            return None;
        }
        let refine_lo = (best_lag - coarse).max(lag_min);
        let refine_hi = (best_lag + coarse).min(lag_max);
        let mut lag = refine_lo;
        while lag <= refine_hi {
            if let Some(score) = self.ncc_window(&mic_window, mic_start, lag) {
                if score > best {
                    best = score;
                    best_lag = lag;
                }
            }
            lag += step;
        }
        if best < 0.0 {
            return None;
        }
        Some((best_lag, best))
    }

    fn ncc_window(&self, mic_window: &[f32], mic_start: i64, lag: i64) -> Option<f32> {
        let reference = self.reference.slice(mic_start - lag, mic_window.len())?;
        if rms(&reference) < 1e-3 {
            return None;
        }
        Some(normalized_correlation(mic_window, &reference))
    }
}

fn energy(samples: &[f32]) -> f32 {
    samples.iter().map(|sample| sample * sample).sum()
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (energy(samples) / samples.len() as f32).sqrt()
}

fn normalized_correlation(left: &[f32], right: &[f32]) -> f32 {
    let n = left.len().min(right.len());
    if n == 0 {
        return 0.0;
    }
    let mut mean_l = 0.0f32;
    let mut mean_r = 0.0f32;
    for i in 0..n {
        mean_l += left[i];
        mean_r += right[i];
    }
    mean_l /= n as f32;
    mean_r /= n as f32;
    let mut dot = 0.0f32;
    let mut energy_l = 0.0f32;
    let mut energy_r = 0.0f32;
    for i in 0..n {
        let a = left[i] - mean_l;
        let b = right[i] - mean_r;
        dot += a * b;
        energy_l += a * a;
        energy_r += b * b;
    }
    let denom = (energy_l * energy_r).sqrt();
    if denom < 1e-8 {
        0.0
    } else {
        dot / denom
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcription::audio_source::AudioSource;
    use crate::transcription::pipeline::{AsrOutput, StreamingAsr, StreamingPipeline};
    use crate::transcription::worker::run_worker;
    use std::sync::atomic::{AtomicBool, AtomicU64};
    use std::sync::mpsc;
    use std::time::Duration;

    struct Noise(u64);

    impl Noise {
        fn next_sample(&mut self) -> f32 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1);
            let bits = (self.0 >> 40) as u32;
            (bits as f32 / 1_048_576.0) - 0.5
        }

        fn lowpass(&mut self, len: usize, mix: f32) -> Vec<f32> {
            let mut out = vec![0.0; len];
            let mut prev = 0.0f32;
            for sample in &mut out {
                prev = mix * prev + (1.0 - mix) * self.next_sample();
                *sample = prev;
            }
            let scale = 0.25 / rms(&out).max(1e-8);
            for sample in &mut out {
                *sample *= scale;
            }
            out
        }
    }

    fn apply_echo(reference: &[f32], delay: usize, taps: &[f32]) -> Vec<f32> {
        let mut echoed = vec![0.0; reference.len()];
        for (tap_index, tap) in taps.iter().enumerate() {
            let offset = delay + tap_index;
            if offset >= reference.len() {
                continue;
            }
            for index in offset..reference.len() {
                echoed[index] += tap * reference[index - offset];
            }
        }
        echoed
    }

    fn canceller(mic_rate: u32, reference_rate: u32) -> (AcousticEchoCanceller, Arc<SharedFarEnd>) {
        let far_end = Arc::new(SharedFarEnd::new(Instant::now()));
        let canceller = AcousticEchoCanceller::new(mic_rate, reference_rate, far_end.clone());
        (canceller, far_end)
    }

    fn run_pair(
        mic: &[f32],
        reference: &[f32],
        mic_rate: u32,
        reference_rate: u32,
        far_time_shift: Duration,
    ) -> Vec<f32> {
        let (mut canceller, far_end) = canceller(mic_rate, reference_rate);
        let t0 = far_end.t0();
        let mic_chunk = (mic_rate / 50).max(1) as usize;
        let ref_chunk = (reference_rate / 50).max(1) as usize;
        let mut out = Vec::new();
        let mut mic_pos = 0usize;
        let mut ref_pos = 0usize;
        while mic_pos < mic.len() || ref_pos < reference.len() {
            if ref_pos < reference.len() {
                let next = (ref_pos + ref_chunk).min(reference.len());
                let at = t0
                    + Duration::from_secs_f64(next as f64 / reference_rate as f64)
                    + far_time_shift;
                far_end.push(&reference[ref_pos..next], at);
                ref_pos = next;
            }
            if mic_pos < mic.len() {
                let next = (mic_pos + mic_chunk).min(mic.len());
                let at = t0 + Duration::from_secs_f64(next as f64 / mic_rate as f64);
                out.extend(canceller.process_mic(&mic[mic_pos..next], at));
                mic_pos = next;
            }
        }
        out.extend(canceller.flush());
        out
    }

    fn erle_db(original: &[f32], cleaned: &[f32]) -> f32 {
        let skip = original.len() / 5;
        let tail = original.len() / 10;
        let end = cleaned.len().saturating_sub(tail);
        let n = (end.saturating_sub(skip)).min(original.len().saturating_sub(skip));
        assert!(n > 100, "not enough cleaned audio to score echo reduction");
        let original_energy = energy(&original[skip..skip + n]) / n as f32;
        let cleaned_energy = energy(&cleaned[skip..skip + n]) / n as f32;
        10.0 * (original_energy / cleaned_energy.max(1e-12)).log10()
    }

    #[test]
    fn cancels_speaker_echo_that_the_mic_picks_up() {
        let rate: u32 = 16_000;
        let mut noise = Noise(7);
        let reference = noise.lowpass(rate as usize * 3, 0.95);
        let mic = apply_echo(
            &reference,
            (0.06 * rate as f32) as usize,
            &[0.6, 0.25, 0.12],
        );
        let cleaned = run_pair(&mic, &reference, rate, rate, Duration::ZERO);
        let erle = erle_db(&mic, &cleaned);
        assert!(
            erle > 15.0,
            "expected the speaker echo to drop by more than 15 dB, got {erle:.1} dB"
        );
        assert!(cleaned.len() + (rate as usize) / 5 > mic.len() * 4 / 5);
    }

    #[test]
    fn cancels_echo_when_the_loopback_arrives_late() {
        let rate: u32 = 16_000;
        let mut noise = Noise(11);
        let played = noise.lowpass(rate as usize * 3, 0.95);
        let mic = apply_echo(&played, (0.015 * rate as f32) as usize, &[0.65, 0.2]);
        // The loopback buffer is 100ms behind the samples that actually reached the speaker.
        let late_by = (0.10 * rate as f32) as usize;
        let mut reference = vec![0.0; late_by];
        reference.extend_from_slice(&played[..played.len() - late_by]);
        let cleaned = run_pair(&mic, &reference, rate, rate, Duration::ZERO);
        let erle = erle_db(&mic, &cleaned);
        assert!(
            erle > 12.0,
            "expected a late loopback to still be cancelled, got {erle:.1} dB"
        );
    }

    #[test]
    fn cancels_echo_when_reference_timestamps_are_late() {
        let rate: u32 = 16_000;
        let mut noise = Noise(13);
        let reference = noise.lowpass(rate as usize * 3, 0.94);
        let mic = apply_echo(&reference, (0.02 * rate as f32) as usize, &[0.7, 0.15]);
        let cleaned = run_pair(&mic, &reference, rate, rate, Duration::from_millis(80));
        let erle = erle_db(&mic, &cleaned);
        assert!(
            erle > 12.0,
            "expected timestamp skew between the devices to be absorbed, got {erle:.1} dB"
        );
    }

    #[test]
    fn leaves_the_mic_alone_when_it_does_not_hear_the_speakers() {
        let rate: u32 = 16_000;
        let mic = Noise(21).lowpass(rate as usize * 2, 0.97);
        let reference = Noise(22).lowpass(rate as usize * 2, 0.9);
        let cleaned = run_pair(&mic, &reference, rate, rate, Duration::ZERO);
        let n = mic.len().min(cleaned.len());
        let score = normalized_correlation(&mic[..n], &cleaned[..n]);
        assert!(
            score > 0.98,
            "uncorrelated mic audio should pass through, correlation was {score:.3}"
        );
    }

    #[test]
    fn cancels_echo_when_the_reference_sample_rate_differs() {
        let mic_rate = 16_000u32;
        let reference_rate = 48_000u32;
        let mut noise = Noise(31);
        let reference = noise.lowpass((reference_rate * 3) as usize, 0.97);
        // Build the acoustic echo from the same signal the canceller will hear
        // after it resamples 48 kHz loopback down to the 16 kHz mic clock.
        let mut resampler = LinearResampler::new(reference_rate, mic_rate);
        let reference_at_mic_rate = resampler.push(&reference);
        let delay = (0.04 * mic_rate as f32) as usize;
        let mic = apply_echo(&reference_at_mic_rate, delay, &[0.55, 0.3, 0.1]);
        let cleaned = run_pair(&mic, &reference, mic_rate, reference_rate, Duration::ZERO);
        let erle = erle_db(&mic, &cleaned);
        assert!(
            erle > 10.0,
            "resampling the loopback onto the mic clock should still cancel echo, got {erle:.1} dB"
        );
    }

    struct Collect(Arc<std::sync::Mutex<Vec<f32>>>);

    impl StreamingAsr for Collect {
        fn push_mono(&mut self, samples: &[f32]) -> anyhow::Result<Option<AsrOutput>> {
            self.0.lock().unwrap().extend_from_slice(samples);
            Ok(None)
        }

        fn finish(&mut self) -> anyhow::Result<AsrOutput> {
            Ok(AsrOutput::default())
        }
    }

    #[test]
    fn worker_feeds_the_model_echo_cancelled_mic_audio() {
        let rate: u32 = 16_000;
        let mut noise = Noise(41);
        let reference = noise.lowpass(rate as usize * 3, 0.95);
        let mic = apply_echo(&reference, (0.05 * rate as f32) as usize, &[0.6, 0.2, 0.1]);
        let far_end = Arc::new(SharedFarEnd::new(Instant::now()));
        let canceller = AcousticEchoCanceller::new(rate, rate, far_end.clone());
        let collected = Arc::new(std::sync::Mutex::new(Vec::new()));
        let (tx, rx) = mpsc::sync_channel(32);
        let pipeline = StreamingPipeline::new(Box::new(Collect(collected.clone())));
        let stop = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(AtomicU64::new(0));
        let worker = std::thread::spawn(move || {
            run_worker(
                rx,
                pipeline,
                AudioSource::Mic.labels(),
                |_| {},
                stop,
                counter,
                None,
                Some(canceller),
            );
        });

        let t0 = far_end.t0();
        let chunk = (rate / 50) as usize;
        let mut pos = 0;
        while pos < mic.len() {
            let next = (pos + chunk).min(mic.len());
            let at = t0 + Duration::from_secs_f64(next as f64 / rate as f64);
            far_end.push(&reference[pos..next], at);
            tx.send(crate::transcription::cpal_capture::AudioBlock {
                samples: mic[pos..next].to_vec(),
                captured_at: at,
            })
            .unwrap();
            pos = next;
        }
        drop(tx);
        worker.join().unwrap();

        let cleaned = collected.lock().unwrap();
        let erle = erle_db(&mic, &cleaned);
        assert!(
            erle > 15.0,
            "the ASR pipeline should receive mic audio with the speaker echo removed, got {erle:.1} dB"
        );
    }

    #[test]
    fn resampler_preserves_duration() {
        let mut resampler = LinearResampler::new(48_000, 16_000);
        let input = vec![0.2f32; 48_000];
        let output = resampler.push(&input);
        let drift = (output.len() as i32 - 16_000).abs();
        assert!(
            drift < 8,
            "resampled length {}, drift {drift}",
            output.len()
        );
    }
}
