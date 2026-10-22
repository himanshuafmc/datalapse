// Shared drawing helpers (engine.py draw_header, draw_source, draw_brand,
// draw_caption) and the Scene base class.

import { wrap } from '../core/textwrap.js';
import { easeOut } from '../core/easing.js';
import { pyRound } from '../core/pymath.js';
import { HEAD, BODY } from '../render/fig.js';
import { wholeImage } from '../render/images.js';

export { HEAD, BODY };

export class Scene {
  constructor(spec, env) {
    this.spec = spec;
    this.env = env;
    this.chapter = spec.chapter ?? null;
    this.showBrand = true;
  }

  get duration() {
    return Number(this.spec.duration ?? 3.0);
  }

  nframes(fps) {
    return pyRound(this.duration * fps);
  }

  prepare() {}

  draw() {}
}

export function drawHeader(fig, L, title, subtitle, alpha = 1.0) {
  const T = fig.T;
  const lines = wrap(title ?? '', L.title_wrap);
  const fs = L.fs.title;
  let y = L.title_y;
  for (const ln of lines) {
    fig.text(L.title_x, y, ln, { ha: 'left', va: 'top', size: fs, color: T.text, family: HEAD, weight: 'bold', alpha, zorder: 30 });
    y -= (fs * 1.18) / L.H;
  }
  if (subtitle) {
    const w = Math.trunc(L.title_wrap * L.t.subWrapMul);
    for (const ln of wrap(subtitle, w)) {
      fig.text(L.title_x, y - 0.004, ln, { ha: 'left', va: 'top', size: L.fs.subtitle, color: T.muted, alpha, zorder: 30 });
      y -= (L.fs.subtitle * 1.25) / L.H;
    }
  }
}

export function drawSource(fig, L, text, alpha = 1.0) {
  if (!text) return;
  const [x, y] = L.source_xy;
  const right = L.t.sourceSide === 'right';
  const ha = right ? 'right' : 'left';
  if (!right) text = wrap(text, 70).join('\n');
  fig.text(x, y, text, {
    ha, va: right ? 'bottom' : 'top', size: L.fs.source, color: fig.T.muted,
    alpha: 0.8 * alpha, zorder: 30, linespacing: 1.3,
  });
}

export function drawBrand(fig, L, alpha = 1.0) {
  const logo = fig.T.logo ? wholeImage(fig.T.logo) : null;
  if (!fig.T.brand && !logo) return;
  let [x, y] = L.brand_xy;
  if (logo) {
    // Logo in the corner, the channel name beside it.
    const h = (L.fs.brand * 2.0) / L.H;
    const w = (h * L.H * Math.min(3, Math.max(1, logo.aspect))) / L.W;
    const lx = L.t.sourceSide === 'right' ? x - w : x;
    fig.icon(lx, y - h / 2, w, h, logo, { alpha: 0.95 * alpha, radius: 0.12, zorder: 30 });
    x = L.t.sourceSide === 'right' ? lx - 10 / L.W : x + w + 10 / L.W;
  }
  if (!fig.T.brand) return;
  fig.text(x, y, fig.T.brand, {
    ha: L.t.sourceSide === 'right' ? 'right' : 'left', va: 'center', size: L.fs.brand, color: fig.T.accent,
    family: HEAD, weight: 'bold', alpha: 0.85 * alpha, zorder: 30,
  });
}

export function drawCaption(fig, L, kicker, text, alpha, tIn) {
  if (alpha <= 0.01) return;
  const T = fig.T;
  let [x, y, w, h] = L.caption;
  const dy = (1 - easeOut(tIn / 0.45)) * 0.012;
  y -= dy;
  fig.roundedBox(x, y, w, h, T.panel, 0.93 * alpha, 0.012, 20);
  fig.rect(x + 0.012 * L.t.captionPad, y + h * 0.2, (5 / L.W) * 1.2, h * 0.6, T.accent, alpha, 21);
  const fs = L.fs.caption;
  const charPx = fs * 0.5;
  const widthChars = Math.max(20, Math.trunc((w * L.W - 70) / charPx));
  const lines = wrap(text, widthChars);
  const tx = x + 0.028 * L.t.captionPad;
  const kfs = kicker ? L.fs.kicker : 0;
  const block = kfs * 1.5 + lines.length * fs * 1.22;
  let top = y + h / 2 + block / 2 / L.H;
  if (kicker) {
    fig.text(tx, top, String(kicker).toUpperCase(), { ha: 'left', va: 'top', size: kfs, color: T.accent, family: HEAD, weight: 'bold', alpha, zorder: 22 });
    top -= (kfs * 1.5) / L.H;
  }
  fig.text(tx, top, lines.join('\n'), { ha: 'left', va: 'top', size: fs, color: T.text, alpha, zorder: 22, linespacing: 1.22, weight: 'medium' });
}

export function drawCaptions(fig, L, captions, t) {
  for (const c of captions.active(t)) drawCaption(fig, L, c.kicker, c.text, c.alpha, c.tIn);
}

/** Year shown on screen: int(round(year - 0.4999)), or a month label. */
export function yearLabel(year, mode = 'year') {
  if (mode === 'month') {
    const y = Math.floor(year + 1e-9);
    const m = Math.min(11, Math.max(0, Math.floor((year - y) * 12 + 1e-6)));
    return `${MONTHS[m]} ${y}`;
  }
  return String(pyRound(year - 0.4999));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function entityColor(env, name, sceneColors) {
  return env.colorOf(name, sceneColors);
}

/**
 * Spotlight: [{ entity, from, to }] in data time (years). Returns
 * { entity, k } with k 0..1 (how strongly the rest is dimmed), or null.
 */
export function spotlightAt(list, year) {
  if (!Array.isArray(list)) return null;
  for (const sp of list) {
    const a = Number(sp.from);
    const b = Number(sp.to ?? sp.from);
    if (!(year >= a - 1e-9 && year <= b + 1e-9) || !sp.entity) continue;
    const ramp = Math.max(0.25, (b - a) * 0.15);
    const k = Math.min(1, (year - a) / ramp + 0.0001, (b - year) / ramp + 0.0001);
    return { entity: sp.entity, k: Math.max(0, Math.min(1, k)) };
  }
  return null;
}
