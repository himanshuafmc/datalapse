// Beat detection for music: onset strength from spectral flux, tempo from
// autocorrelation, beat phase from the strongest alignment. Good enough to
// land overtakes and scene cuts on the beat of typical background music.

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Mono samples at ~11 kHz from an AudioBuffer-like { sampleRate, numberOfChannels, getChannelData }. */
function monoDown(buf, maxSeconds = 300) {
  const step = Math.max(1, Math.round(buf.sampleRate / 11025));
  const n = Math.min(buf.length, Math.floor(buf.sampleRate * maxSeconds));
  const out = new Float32Array(Math.floor(n / step));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const ch of chans) s += ch[i * step];
    out[i] = s / chans.length;
  }
  return { samples: out, rate: buf.sampleRate / step };
}

/**
 * Analyse music. Returns { bpm, beats: [seconds], strength } where strength
 * (0..1) says how clear the beat is.
 */
export function detectBeats(buf) {
  const { samples, rate } = monoDown(buf);
  const N = 1024;
  const hop = 256;
  const frames = Math.max(0, Math.floor((samples.length - N) / hop));
  const flux = new Float32Array(frames);
  let prev = new Float32Array(N / 2);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = samples[f * hop + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(N / 2);
    let s = 0;
    for (let k = 1; k < N / 2; k++) {
      mag[k] = Math.log1p(Math.hypot(re[k], im[k]) * 10);
      const d = mag[k] - prev[k];
      if (d > 0) s += k < 40 ? d * 2 : d; // weight the low end (kick drums)
    }
    flux[f] = s;
    prev = mag;
  }
  const fps = rate / hop;
  // Normalise: subtract a moving average so loud passages don't dominate.
  const w = Math.round(fps * 0.5);
  const onset = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += flux[f];
    if (f >= w) acc -= flux[f - w];
    const avg = acc / Math.min(f + 1, w);
    onset[f] = Math.max(0, flux[f] - avg);
  }
  if (frames < fps * 4) return { bpm: null, beats: [], strength: 0 };
  // Tempo by autocorrelation, 60-180 bpm, gently preferring ~120.
  const minLag = Math.round((fps * 60) / 180);
  const maxLag = Math.round((fps * 60) / 60);
  let bestLag = minLag;
  let best = -Infinity;
  let mean = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    s /= frames - lag;
    const bpm = (60 * fps) / lag;
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = s * weight;
    mean += score;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  mean /= maxLag - minLag + 1;
  // Refine the period to a fraction of a frame and find the phase: the beat
  // grid that collects the most onset energy over the whole track. (An
  // integer lag alone drifts by a beat within a minute.)
  const at = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    return i + 1 < frames ? onset[i] * (1 - f) + onset[i + 1] * f : 0;
  };
  let bestP = bestLag;
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let P = bestLag - 1; P <= bestLag + 1 + 1e-9; P += 0.02) {
    for (let ph = 0; ph < P; ph += 0.5) {
      let s = 0;
      for (let x = ph; x < frames - 1; x += P) s += at(x);
      if (s > bestSum) {
        bestSum = s;
        bestP = P;
        bestPhase = ph;
      }
    }
  }
  const period = bestP / fps;
  const beats = [];
  // Onset frames sit half a window after the sound starts.
  const lagFix = (0.55 * N) / rate;
  for (let t = bestPhase / fps + lagFix; t < buf.duration; t += period) if (t >= 0) beats.push(Math.round(t * 1000) / 1000);
  const strength = Math.max(0, Math.min(1, (best / Math.max(1e-9, mean) - 1) / 3));
  return { bpm: Math.round((60 / period) * 10) / 10, beats, strength };
}
