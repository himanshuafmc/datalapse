// A Video is a story spec turned into prepared scenes that can draw any frame.

import { Layout } from '../core/layout.js';
import { makeTheme, colorOf as baseColorOf, COLORS, CATEGORY } from '../core/theme.js';
import { Dataset } from '../core/dataset.js';
import { pyRound, pySum } from '../core/pymath.js';
import { sceneClass } from '../scenes/registry.js';
import { drawBrand } from '../scenes/common.js';
import { Fig } from './fig.js';
import { backgroundImage } from './background.js';
import { applyTranslation, nameIn, fixedText } from '../spec/translate.js';
import { flagFor, wholeImage, preload, FLAGS_SRC } from './images.js';
import { storyFingerprint } from '../export/stamp.js';

export const DEFAULT_FPS = 30;

const easeInOutT = (x) => {
  const v = Math.max(0, Math.min(1, x));
  return 3 * v * v - 2 * v * v * v;
};

/** A scene's incoming transition: { type, dur } or null for the standard soft cut. */
export function transitionOf(spec) {
  const tr = spec?.transition;
  if (!tr || tr === 'cut') return null;
  const type = typeof tr === 'string' ? tr : tr.type;
  if (!['crossfade', 'slide', 'zoom'].includes(type)) return null;
  return { type, dur: Math.max(0.1, Number(typeof tr === 'object' ? tr.dur ?? 0.7 : 0.7)) };
}

/** Camera { zoom, x, y } at scene time t from keyframes [{ at, zoom, x, y, dur }]. */
export function cameraAt(keys, t) {
  let cur = { zoom: 1, x: 0.5, y: 0.5 };
  for (const k of [...keys].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) {
    const at = Number(k.at ?? 0);
    if (t < at) break;
    const p = easeInOutT((t - at) / Math.max(0.01, Number(k.dur ?? 1)));
    const to = { zoom: Math.max(1, Number(k.zoom ?? 1)), x: Number(k.x ?? 0.5), y: Number(k.y ?? 0.5) };
    cur = { zoom: cur.zoom + (to.zoom - cur.zoom) * p, x: cur.x + (to.x - cur.x) * p, y: cur.y + (to.y - cur.y) * p };
  }
  return cur;
}

/** Okabe & Ito (2008) and Paul Tol's "bright" scheme, readable with common colour-vision deficiencies. */
export const COLORBLIND = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'];

export class Video {
  /**
   * spec: a story. opts.lang renders a translation from spec.translations
   * (entity names and country names translate too).
   */
  constructor(spec, opts = {}) {
    this.source = spec;
    this.lang = opts.lang && opts.lang !== 'en' ? opts.lang : null;
    spec = this.lang ? applyTranslation(spec, this.lang) : spec;
    this.spec = spec;
    this.fps = spec.fps ?? DEFAULT_FPS;
    const th = spec.theme ?? {};
    this.T = makeTheme(th.name ?? 'midnight', { ...th.overrides, brand: th.brand ?? undefined });
    if (th.brand === '') this.T.brand = '';
    this.T.logo = th.logo ?? null;
    this.datasets = new Map();
    for (const [id, raw] of Object.entries(spec.datasets ?? {})) this.datasets.set(id, new Dataset(raw, id));
    const storyColors = spec.colors ?? {};
    // Colour-blind-safe palette: entities get Okabe-Ito then Tol colours in
    // the order they first appear in the data.
    let cbIndex = null;
    if (spec.palette === 'colorblind') {
      cbIndex = new Map();
      for (const d of Object.values(spec.datasets ?? {})) for (const c of d.columns ?? []) if (!cbIndex.has(c)) cbIndex.set(c, cbIndex.size);
      for (const sc of spec.scenes ?? []) for (const it of sc.items ?? []) {
        const n = Array.isArray(it) ? it[0] : it?.name;
        if (n != null && !cbIndex.has(n)) cbIndex.set(n, cbIndex.size);
      }
    }
    const T = this.T;
    this.env = {
      dataset: (id) => {
        const d = this.datasets.get(id);
        if (!d) throw new Error(`Unknown dataset "${id}"`);
        return d;
      },
      colorOf: (name, sceneColors = {}) => {
        if (sceneColors && sceneColors[name]) return sceneColors[name];
        if (cbIndex && !storyColors[name]) {
          const k = cbIndex.get(name) ?? [...String(name)].reduce((a, c) => a + c.codePointAt(0), 0);
          return COLORBLIND[k % COLORBLIND.length];
        }
        return baseColorOf(name, storyColors, T);
      },
      /**
       * Colour for the k-th of a set of categories: its own colour when it has
       * one (scene, story or built-in), otherwise distinct colours in order.
       */
      categoryColor: (name, k, sceneColors = {}) => {
        if (sceneColors?.[name] || storyColors[name] || COLORS[name] || cbIndex) return this.env.colorOf(name, sceneColors);
        return CATEGORY[k % CATEGORY.length];
      },
      credit: spec.credit !== false,
      T,
      lang: this.lang,
      /** Name shown on screen for an entity (translated when rendering a language). */
      label: (name) => (this.lang ? nameIn(this.source, this.lang, name) : name),
      /** Fixed words the scenes print ("Data:", "SUBSCRIBE"), in the story's language. */
      text: (key, fallback) => fixedText(this.lang, key, fallback),
      /** Flag or uploaded image for an entity, when the scene shows them. */
      icon: (name, sceneSpec) => {
        const on = sceneSpec?.flags ?? spec.flags ?? false;
        if (!on) return null;
        const img = spec.images?.[name];
        if (img) return wholeImage(img);
        return flagFor(name);
      },
      logo: () => (th.logo ? wholeImage(th.logo) : null),
      /** Story fingerprint printed on the outro when spec.stamp is on. */
      stamp: spec.stamp ? () => this.fingerprint : null,
    };
    this.scenes = (spec.scenes ?? []).map((s, k) => {
      const S = sceneClass(s.type);
      try {
        return new S(s, this.env);
      } catch (e) {
        throw new Error(`Scene ${k + 1} (${s.type}): ${e.message}`);
      }
    });
    this.prepared = new Map();
  }

  get duration() {
    return pySum(this.scenes.map((s) => s.duration));
  }

  /** Fingerprint of the original story (the same for every language). */
  get fingerprint() {
    if (!this._fp) this._fp = storyFingerprint(this.source);
    return this._fp;
  }

  /** Images this story draws (flags, uploaded logos, channel logo). */
  imageSources() {
    const spec = this.spec;
    const out = [];
    if (spec.flags || (spec.scenes ?? []).some((s) => s.flags)) out.push(FLAGS_SRC);
    for (const src of Object.values(spec.images ?? {})) out.push(src);
    if (spec.theme?.logo) out.push(spec.theme.logo);
    return out;
  }

  /** Resolves once every image is loaded (exports wait for this). */
  ready() {
    return preload(this.imageSources());
  }

  /** Prepare every scene for one format (cached). */
  prepare(fmt = 'landscape') {
    let p = this.prepared.get(fmt);
    if (p) return p;
    const L = new Layout(fmt);
    const frames = [];
    let total = 0;
    this.scenes.forEach((sc) => {
      sc.prepare(L, this.fps);
      const n = sc.nframes(this.fps);
      frames.push({ scene: sc, start: total, n });
      total += n;
    });
    // Scenes are stateful per format, so re-preparing for the other format
    // invalidates this one: keep only the latest.
    this.prepared.clear();
    this._lastFrames?.clear();
    p = { L, frames, total };
    this.prepared.set(fmt, p);
    return p;
  }

  totalFrames(fmt = 'landscape') {
    return this.prepare(fmt).total;
  }

  locate(fmt, g) {
    const { frames } = this.prepare(fmt);
    for (const f of frames) if (g < f.start + f.n) return { ...f, i: Math.max(0, g - f.start) };
    const last = frames[frames.length - 1];
    return last ? { ...last, i: last.n - 1 } : null;
  }

  /** Scene start times in seconds (for the timeline). */
  sceneTimes(fmt = 'landscape') {
    const { frames } = this.prepare(fmt);
    return frames.map((f) => ({ scene: f.scene, start: f.start / this.fps, dur: f.n / this.fps }));
  }

  /**
   * Draw global frame g onto a 2D context sized L.W x L.H (times `scale`;
   * the preview draws at reduced scale on small screens).
   */
  drawFrame(ctx, fmt, g, scale = 1) {
    const { L, frames } = this.prepare(fmt);
    const loc = this.locate(fmt, g);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(backgroundImage(L.W, L.H, this.T), 0, 0);
    if (!loc) {
      ctx.restore();
      return;
    }
    const { scene, i } = loc;
    const k = frames.findIndex((f) => f.scene === scene);
    const t = i / this.fps;
    const trIn = transitionOf(scene.spec);
    const trOut = transitionOf(frames[k + 1]?.scene.spec);
    this.drawScene(ctx, L, scene, i, { fadeIn: !trIn || k === 0, fadeOut: !trOut });
    ctx.restore();
    // Transition from the previous scene: its last frame is blended over this one.
    if (trIn && k > 0 && t < trIn.dur) {
      const prev = this.lastFrame(fmt, k - 1, scale);
      if (prev) {
        const p = easeInOutT(t / trIn.dur);
        const W = L.W * scale;
        const H = L.H * scale;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (trIn.type === 'slide') {
          // Slide: the old frame moves out left (the new one is already drawn underneath).
          ctx.globalAlpha = 1;
          ctx.drawImage(prev, -W * p, 0, W, H);
        } else if (trIn.type === 'zoom') {
          const z = 1 + 0.18 * p;
          ctx.globalAlpha = 1 - p;
          ctx.drawImage(prev, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
        } else {
          ctx.globalAlpha = 1 - p;
          ctx.drawImage(prev, 0, 0, W, H);
        }
        ctx.restore();
      }
    }
  }

  /** One scene's frame onto ctx (already scaled), with the soft cut at its edges. */
  drawScene(ctx, L, scene, i, { fadeIn = true, fadeOut = true } = {}) {
    const t = i / this.fps;
    const fig = new Fig(ctx, L, this.T);
    if (Array.isArray(scene.spec.camera) && scene.spec.camera.length) fig.camera = cameraAt(scene.spec.camera, t);
    scene.draw(fig, L, i, t);
    if (scene.showBrand) drawBrand(fig, L);
    const d = scene.duration;
    const edge = Math.min(fadeIn ? t : Infinity, fadeOut ? d - t : Infinity);
    if (edge < 0.18) fig.rect(0, 0, 1, 1, this.T.bg_top, 0.55 * (1 - edge / 0.18), 200);
    fig.flush();
  }

  /** The last frame of scene k as an image (cached), for transitions. */
  lastFrame(fmt, k, scale) {
    if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
    const key = `${fmt}:${k}:${scale}`;
    this._lastFrames ??= new Map();
    if (this._lastFrames.has(key)) return this._lastFrames.get(key);
    const { L, frames } = this.prepare(fmt);
    const f = frames[k];
    const w = Math.round(L.W * scale);
    const h = Math.round(L.H * scale);
    let c;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
    else {
      c = document.createElement('canvas');
      c.width = w;
      c.height = h;
    }
    const cx = c.getContext('2d', { alpha: false });
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    cx.drawImage(backgroundImage(L.W, L.H, this.T), 0, 0);
    this.drawScene(cx, L, f.scene, f.n - 1, { fadeIn: true, fadeOut: false });
    if (this._lastFrames.size > 8) this._lastFrames.clear();
    this._lastFrames.set(key, c);
    return c;
  }

  /** YouTube chapters: first at 0:00, at least 10 s apart. */
  chapters() {
    const out = [];
    let t = 0.0;
    const L = new Layout('landscape');
    for (const sc of this.scenes) {
      if (sc.captions && !sc.captions.sched.length) sc.prepare(L, this.fps);
      if (sc.chapter) out.push([t, sc.chapter]);
      for (const c of sc.captions?.sched ?? []) if (c.item.chapter) out.push([t + c.start, c.item.chapter]);
      t += sc.duration;
    }
    out.sort((a, b) => a[0] - b[0]);
    const clean = [];
    for (const [tt, name] of out) {
      if (clean.length && tt - clean[clean.length - 1][0] < 10) continue;
      clean.push([tt, name]);
    }
    if (clean.length) clean[0] = [0.0, clean[0][1]];
    return clean;
  }

  /** The text file the Python engine wrote next to each video. */
  youtubeText() {
    const m = this.spec.meta ?? {};
    const ch = this.chapters();
    const mmss = (s) => `${Math.trunc(s / 60)}:${String(Math.trunc(s % 60)).padStart(2, '0')}`;
    const lines = [
      `TITLE:\n${m.title ?? this.spec.id ?? 'Untitled'}\n`,
      `SHORTS TITLE (vertical version):\n${m.shorts_title ?? m.title ?? ''} #shorts\n`,
      'DESCRIPTION:', (m.description ?? '').trim(), '',
    ];
    if (ch.length >= 3) {
      lines.push('Chapters:');
      for (const [tt, name] of ch) lines.push(`${mmss(tt)} ${name}`);
      lines.push('');
    }
    const dur = this.duration;
    lines.push('Data sources:', m.sources_long ?? m.sources ?? '', '',
      this.spec.credit === false ? '' : 'Made with Datalapse.', '',
      (m.hashtags ?? []).join(' '), '', 'TAGS (paste into YouTube Studio > Tags):',
      (m.tags ?? []).join(', '), '',
      `LENGTH: ${pyRound(dur)} s (${mmss(dur)})`, '', 'PINNED COMMENT IDEA:', m.pinned_comment ?? '', '',
      ...((this.spec.audio?.narration?.clips ?? []).some((c) => /\((?:af|am|bf|bm)_[a-z]+\)\.wav$/.test(c.name ?? '')) ? ['NARRATION: an AI voice (Kokoro-82M) reads the script.', ''] : []),
      `STORY FINGERPRINT: ${this.fingerprint}`,
      'Load the story file in Datalapse to check this fingerprint and render the same video again.');
    return lines.join('\n');
  }
}
