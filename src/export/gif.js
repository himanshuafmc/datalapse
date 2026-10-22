// Animated GIF export: a short, small clip for places that don't autoplay
// video (READMEs, slides, chat apps, some forums).
//
// One palette is built from frames sampled across the clip, so colours stay
// steady from frame to frame (no shimmer on flat bars), and every frame is
// mapped onto it.

import { GIFEncoder, quantize, applyPalette } from 'gifenc/dist/gifenc.esm.js';
import { makeCanvas } from './encode.js';

/** GIF delays are whole hundredths of a second; these rates divide evenly. */
export const GIF_RATES = [10, 20, 25];

function abortError() {
  const e = new Error('Export cancelled');
  e.name = 'AbortError';
  return e;
}

/** Which video frames a clip of [g0, g1) at `rate` frames per second uses. */
export function gifFrames(g0, g1, videoFps, rate) {
  const step = videoFps / rate;
  const out = [];
  for (let x = g0; x < g1 - 1e-9; x += step) out.push(Math.min(g1 - 1, Math.round(x)));
  return out;
}

/** Rough size in bytes, to warn before rendering something huge. */
export function estimateGifBytes(width, height, nFrames) {
  // Flat chart graphics compress to roughly 0.12 bytes per pixel per frame.
  return Math.round(width * height * nFrames * 0.12);
}

/**
 * options: { fmt, width, rate, range: [g0, g1], colors, onProgress(done, total), signal }
 * Resolves to { blob, frames, width, height, seconds }.
 */
export async function exportGif(video, options = {}) {
  const fmt = options.fmt ?? 'landscape';
  const { L, total } = video.prepare(fmt);
  const [g0, g1] = options.range ?? [0, total];
  const rate = GIF_RATES.includes(options.rate) ? options.rate : 20;
  const width = Math.round(options.width ?? 640);
  const scale = width / L.W;
  const height = Math.round(L.H * scale);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const frames = gifFrames(g0, g1, video.fps, rate);
  if (!frames.length) throw new Error('The clip is empty.');
  const started = performance.now();

  // Palette from up to 12 frames spread over the clip (every 3rd pixel).
  const samples = [];
  const nSample = Math.min(12, frames.length);
  for (let k = 0; k < nSample; k++) {
    const g = frames[Math.floor((k * (frames.length - 1)) / Math.max(1, nSample - 1))];
    video.drawFrame(ctx, fmt, g, scale);
    const d = ctx.getImageData(0, 0, width, height).data;
    const part = new Uint8Array(Math.ceil(d.length / 12) * 4);
    let o = 0;
    for (let i = 0; i < d.length; i += 12) {
      part[o++] = d[i];
      part[o++] = d[i + 1];
      part[o++] = d[i + 2];
      part[o++] = 255;
    }
    samples.push(part.subarray(0, o));
  }
  const all = new Uint8Array(samples.reduce((a, s) => a + s.length, 0));
  let at = 0;
  for (const s of samples) {
    all.set(s, at);
    at += s.length;
  }
  const palette = quantize(all, Math.min(256, Math.max(16, options.colors ?? 192)), { format: 'rgb565' });

  const gif = GIFEncoder();
  const delay = 1000 / rate;
  for (let k = 0; k < frames.length; k++) {
    if (options.signal?.aborted) throw abortError();
    video.drawFrame(ctx, fmt, frames[k], scale);
    const data = ctx.getImageData(0, 0, width, height).data;
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, width, height, k === 0 ? { palette, delay, repeat: 0 } : { delay });
    if (k % 5 === 0 || k === frames.length - 1) {
      options.onProgress?.(k + 1, frames.length, { elapsed: (performance.now() - started) / 1000 });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  gif.finish();
  const bytes = gif.bytes();
  return {
    blob: new Blob([bytes], { type: 'image/gif' }),
    frames: frames.length,
    width,
    height,
    seconds: (performance.now() - started) / 1000,
  };
}
