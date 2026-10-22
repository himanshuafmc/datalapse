// The soundtrack: background music (looped, faded, ducked under the voice)
// plus narration clips placed at captions or scene times. The same plan
// drives the live preview and the offline mix that goes into exports.
//
// Story spec:
//   "audio": {
//     "music": { "id": "…", "name": "track.mp3", "volume": 0.7, "offset": 0, "fadeIn": 1, "fadeOut": 3, "loop": true, "bpm": 118, "beats": [...] },
//     "narration": { "clips": [{ "id": "…", "scene": 2, "caption": 0 }], "duck": 0.3, "pauseRace": true }
//   }

import { getBuffer, audioContext } from './library.js';

const DUCK_IN = 0.25;
const DUCK_OUT = 0.45;

/** Global start time (s) of every scene and caption. */
export function timeline(video) {
  const { frames, total } = video.prepare('landscape');
  const fps = video.fps;
  const scenes = frames.map((f) => ({
    start: f.start / fps,
    duration: f.n / fps,
    captions: (f.scene.captions?.sched ?? []).map((c) => f.start / fps + c.start),
  }));
  return { scenes, duration: total / fps };
}

/** Resolve the story's audio to concrete clips: { duration, music, clips }. */
export async function audioPlan(video) {
  const a = video.spec.audio;
  if (!a) return null;
  const tl = timeline(video);
  const plan = { duration: tl.duration, music: null, clips: [], duck: a.narration?.duck ?? 0.3 };
  if (a.music?.id) {
    const buffer = await getBuffer(a.music.id);
    if (buffer) plan.music = { buffer, volume: a.music.volume ?? 0.7, offset: a.music.offset ?? 0, fadeIn: a.music.fadeIn ?? 1, fadeOut: a.music.fadeOut ?? 3, loop: a.music.loop !== false };
  }
  for (const c of a.narration?.clips ?? []) {
    const buffer = await getBuffer(c.id);
    if (!buffer) continue;
    const sc = tl.scenes[c.scene];
    if (!sc) continue;
    const start = c.caption != null ? sc.captions[c.caption] ?? sc.start : sc.start + (c.at ?? 0);
    plan.clips.push({ buffer, start: start + (c.delay ?? 0.15), gain: c.gain ?? 1 });
  }
  if (!plan.music && !plan.clips.length) return null;
  return plan;
}

/** Ids of audio the story uses that this browser doesn't have. */
export async function missingAudio(spec) {
  const ids = [spec.audio?.music?.id, ...(spec.audio?.narration?.clips ?? []).map((c) => c.id)].filter(Boolean);
  const out = [];
  for (const id of ids) if (!(await getBuffer(id))) out.push(id);
  return out;
}

function musicGain(param, plan, t0, ctxStart) {
  const m = plan.music;
  const v = m.volume;
  const end = plan.duration;
  // times relative to the video; ctxStart maps video time t to context time
  const at = (t) => ctxStart + (t - t0);
  param.setValueAtTime(t0 < m.fadeIn ? v * (t0 / Math.max(0.01, m.fadeIn)) : v, at(t0));
  if (t0 < m.fadeIn) param.linearRampToValueAtTime(v, at(m.fadeIn));
  for (const c of plan.clips) {
    const s = c.start;
    const e = c.start + c.buffer.duration;
    if (e < t0) continue;
    const low = v * plan.duck;
    param.setValueAtTime(v, at(Math.max(t0, s - DUCK_IN)));
    param.linearRampToValueAtTime(low, at(Math.max(t0, s)));
    param.setValueAtTime(low, at(Math.max(t0, e)));
    param.linearRampToValueAtTime(v, at(Math.max(t0, e + DUCK_OUT)));
  }
  const fo = Math.max(t0, end - m.fadeOut);
  param.setValueAtTime(v, at(fo));
  param.linearRampToValueAtTime(0, at(end));
}

function schedule(ctx, plan, t0, ctxStart, dest) {
  const nodes = [];
  if (plan.music) {
    const src = ctx.createBufferSource();
    src.buffer = plan.music.buffer;
    src.loop = plan.music.loop;
    const g = ctx.createGain();
    musicGain(g.gain, plan, t0, ctxStart);
    src.connect(g).connect(dest);
    const pos = plan.music.offset + t0;
    const off = plan.music.loop ? pos % plan.music.buffer.duration : pos;
    if (plan.music.loop || off < plan.music.buffer.duration) {
      src.start(ctxStart, off);
      src.stop(ctxStart + (plan.duration - t0));
      nodes.push(src);
    }
  }
  for (const c of plan.clips) {
    const end = c.start + c.buffer.duration;
    if (end <= t0) continue;
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;
    const g = ctx.createGain();
    g.gain.value = c.gain;
    src.connect(g).connect(dest);
    if (c.start >= t0) src.start(ctxStart + (c.start - t0));
    else src.start(ctxStart, t0 - c.start);
    nodes.push(src);
  }
  return nodes;
}

/** Render the soundtrack to a stereo AudioBuffer (for exports). */
export async function renderMix(plan, sampleRate = 48000) {
  const length = Math.ceil(plan.duration * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  schedule(ctx, plan, 0, 0, ctx.destination);
  return ctx.startRendering();
}

/** Live preview: plays the soundtrack in step with the player. */
export class AudioPreview {
  constructor() {
    this.plan = null;
    this.nodes = [];
    this.master = null;
  }

  setPlan(plan) {
    this.stop();
    this.plan = plan;
  }

  play(t0) {
    this.stop();
    if (!this.plan) return;
    const ctx = audioContext();
    if (ctx.state === 'suspended') ctx.resume();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.nodes = schedule(ctx, this.plan, t0, ctx.currentTime + 0.05, this.master);
  }

  stop() {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
    if (this.master) this.master.disconnect();
    this.master = null;
  }
}
