// Video export in the browser, faster than real time where WebCodecs exists.
//
//   1. H.264 in MP4 (WebCodecs + mp4-muxer): plays everywhere, YouTube-ready.
//   2. VP9 in WebM (WebCodecs + webm-muxer): when the browser has no H.264
//      encoder (some Linux builds of Chromium, Firefox).
//   3. MediaRecorder on the canvas: last resort, records in real time.
//
// Nothing is uploaded: frames are drawn, encoded and muxed on this device.

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { Layout } from '../core/layout.js';

const H264 = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640033'];
const VP9 = ['vp09.00.40.08', 'vp09.00.41.08', 'vp09.00.31.08'];
const VP8 = ['vp8'];

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function firstSupported(codecs, base) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of codecs) {
    const config = { ...base, codec };
    if (codec.startsWith('avc1')) config.avc = { format: 'avc' };
    try {
      const r = await VideoEncoder.isConfigSupported(config);
      if (r.supported) return r.config ?? config;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * What this browser can export, for showing in the UI before the user clicks.
 * Returns e.g. { mp4: true, webm: true, realtimeOnly: false }.
 */
export async function exportSupport(fmt = 'landscape') {
  const L = new Layout(fmt);
  const base = { width: L.W, height: L.H, bitrate: 8e6, framerate: 30 };
  const mp4 = !!(await firstSupported(H264, base));
  const webm = !!(await firstSupported([...VP9, ...VP8], base));
  const recorder = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' &&
    !!HTMLCanvasElement.prototype.captureStream;
  return { mp4, webm, realtimeOnly: !mp4 && !webm && recorder, none: !mp4 && !webm && !recorder };
}

function mp4CodecName(codec) {
  if (codec.startsWith('avc1')) return 'avc';
  if (codec.startsWith('vp09')) return 'vp9';
  if (codec.startsWith('av01')) return 'av1';
  if (codec.startsWith('hvc1') || codec.startsWith('hev1')) return 'hevc';
  throw new Error(`No MP4 mapping for codec ${codec}`);
}

/** Encode a stereo AudioBuffer (from time t0 to t1 s) with the first codec this browser supports. */
async function encodeAudio(buf, codecs, t0, t1) {
  if (typeof AudioEncoder === 'undefined' || !buf) return null;
  const sampleRate = buf.sampleRate;
  const channels = Math.min(2, buf.numberOfChannels);
  let config = null;
  for (const codec of codecs) {
    const c = { codec, sampleRate, numberOfChannels: channels, bitrate: 160000 };
    try {
      if ((await AudioEncoder.isConfigSupported(c)).supported) {
        config = c;
        break;
      }
    } catch {
      /* next */
    }
  }
  if (!config) return null;
  const chunks = [];
  let failure = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => chunks.push({ chunk, meta }), error: (e) => (failure = e) });
  enc.configure(config);
  const a = Math.floor(t0 * sampleRate);
  const b = Math.min(buf.length, Math.ceil(t1 * sampleRate));
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
  const block = 4800;
  for (let i = a; i < b; i += block) {
    const n = Math.min(block, b - i);
    const planar = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) planar.set(data[c].subarray(i, i + n), c * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round(((i - a) / sampleRate) * 1e6), data: planar });
    enc.encode(ad);
    ad.close();
    if (failure) throw failure;
    if (enc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 0));
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
  return { codec: config.codec, sampleRate, channels, chunks };
}

function abortError() {
  const e = new Error('Export cancelled');
  e.name = 'AbortError';
  return e;
}

/**
 * Render every frame of `video` and encode it.
 * options: { fmt, container: 'auto'|'mp4'|'webm', bitrate, onProgress(done, total, info), signal, range: [g0, g1] }
 * Resolves to { blob, mime, ext, codec, frames, seconds }.
 */
export async function exportVideo(video, options = {}) {
  const fmt = options.fmt ?? 'landscape';
  const fps = video.fps;
  const { L, total } = video.prepare(fmt);
  const [g0, g1] = options.range ?? [0, total];
  const bitrate = options.bitrate ?? (fmt === 'landscape' ? 8e6 : 7e6);
  const base = { width: L.W, height: L.H, bitrate, framerate: fps, latencyMode: 'quality', bitrateMode: 'variable' };
  const want = options.container ?? 'auto';
  let config = null;
  let kind = null;
  if (want !== 'webm') {
    // options.mp4Codecs lets tests (and browsers without H.264) put another
    // codec in the MP4 container, e.g. ['vp09.00.40.08'].
    config = await firstSupported(options.mp4Codecs ?? H264, base);
    if (config) kind = 'mp4';
  }
  if (!config && want !== 'mp4') {
    config = await firstSupported(VP9, base);
    if (config) kind = 'webm-vp9';
    else {
      config = await firstSupported(VP8, base);
      if (config) kind = 'webm-vp8';
    }
  }
  if (!config && want === 'mp4') {
    throw new Error('This browser cannot encode H.264 video. Try Chrome or Edge on Windows/macOS, or choose WebM.');
  }
  if (!config) return recordRealtime(video, { ...options, fmt, g0, g1 });

  // Soundtrack (music and narration), encoded up front and interleaved
  // with the video chunks as they arrive.
  const audioBuf = options.audio ? await options.audio : null;
  const audio = audioBuf ? await encodeAudio(audioBuf, kind === 'mp4' ? ['mp4a.40.2', 'opus'] : ['opus'], g0 / fps, g1 / fps) : null;

  const width = L.W;
  const height = L.H;
  let muxer;
  let target;
  if (kind === 'mp4') {
    target = new Mp4Target();
    muxer = new Mp4Muxer({
      target,
      video: { codec: mp4CodecName(config.codec), width, height, frameRate: fps },
      audio: audio ? { codec: audio.codec === 'opus' ? 'opus' : 'aac', numberOfChannels: audio.channels, sampleRate: audio.sampleRate } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
  } else {
    target = new WebmTarget();
    muxer = new WebmMuxer({
      target,
      video: { codec: kind === 'webm-vp9' ? 'V_VP9' : 'V_VP8', width, height, frameRate: fps },
      audio: audio ? { codec: 'A_OPUS', numberOfChannels: audio.channels, sampleRate: audio.sampleRate } : undefined,
      firstTimestampBehavior: 'offset',
    });
  }
  let ai = 0;
  const flushAudio = (upTo) => {
    if (!audio) return;
    while (ai < audio.chunks.length && audio.chunks[ai].chunk.timestamp <= upTo) {
      const { chunk, meta } = audio.chunks[ai++];
      muxer.addAudioChunk(chunk, meta);
    }
  };

  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      flushAudio(chunk.timestamp + (chunk.duration ?? 0));
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  const gop = fps * 2;
  const started = performance.now();
  const count = g1 - g0;
  try {
    for (let g = g0; g < g1; g++) {
      if (options.signal?.aborted) throw abortError();
      if (failure) throw failure;
      video.drawFrame(ctx, fmt, g);
      const k = g - g0;
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((k * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      encoder.encode(frame, { keyFrame: k % gop === 0 });
      frame.close();
      // Back-pressure: don't let the encoder queue grow without bound.
      while (encoder.encodeQueueSize > 6) {
        await new Promise((r) => setTimeout(r, 4));
        if (failure) throw failure;
      }
      if (k % 15 === 0 || k === count - 1) {
        options.onProgress?.(k + 1, count, { codec: config.codec, kind, elapsed: (performance.now() - started) / 1000 });
        // Yield so the page stays responsive and can show progress.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await encoder.flush();
    if (failure) throw failure;
    flushAudio(Infinity);
    muxer.finalize();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  const mime = kind === 'mp4' ? 'video/mp4' : 'video/webm';
  return {
    blob: new Blob([target.buffer], { type: mime }),
    mime,
    ext: kind === 'mp4' ? 'mp4' : 'webm',
    codec: config.codec,
    audioCodec: audio?.codec ?? null,
    frames: count,
    seconds: (performance.now() - started) / 1000,
  };
}

/** Fallback: play the frames onto a canvas in real time and record it. */
async function recordRealtime(video, { fmt, g0, g1, onProgress, signal }) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot export video. Please use a recent Chrome, Edge, Firefox or Safari.');
  }
  const { L } = video.prepare(fmt);
  const fps = video.fps;
  const canvas = document.createElement('canvas');
  canvas.width = L.W;
  canvas.height = L.H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(fps);
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  const started = performance.now();
  rec.start(1000);
  const count = g1 - g0;
  for (let k = 0; k < count; k++) {
    if (signal?.aborted) {
      rec.stop();
      throw abortError();
    }
    video.drawFrame(ctx, fmt, g0 + k);
    const due = started + ((k + 1) * 1000) / fps;
    const wait = due - performance.now();
    if (k % 15 === 0) onProgress?.(k + 1, count, { codec: mimeType, kind: 'realtime', elapsed: (performance.now() - started) / 1000 });
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
  }
  rec.stop();
  await done;
  const mime = (mimeType || 'video/webm').split(';')[0];
  return {
    blob: new Blob(chunks, { type: mime }),
    mime,
    ext: mime === 'video/mp4' ? 'mp4' : 'webm',
    codec: mimeType,
    frames: count,
    seconds: (performance.now() - started) / 1000,
  };
}

/** A PNG of one frame (for thumbnails and sharing stills). */
export async function exportStill(video, fmt, g) {
  const { L } = video.prepare(fmt);
  const canvas = makeCanvas(L.W, L.H);
  const ctx = canvas.getContext('2d', { alpha: false });
  video.drawFrame(ctx, fmt, g);
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}

/** Trigger a browser download of a Blob. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
