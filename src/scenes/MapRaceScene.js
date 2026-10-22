// A world map that colours each country by its value as the years go by,
// with the leaders listed beside it.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions, yearLabel } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade } from '../core/easing.js';
import { interpScalar } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';
import { RAMPS, makeRamp, hexLuminance } from '../core/ramp.js';
import { findCountry, countryShare } from '../data/countries.js';
import { worldShapes, countryPath, WORLD_W, WORLD_H } from '../render/world.js';

// Map box (left, bottom, width) and the leader list for each format.
const BOX = {
  landscape: { map: [0.035, 0.235, 0.66], list: { mode: 'rows', x: 0.725, w: 0.23, top: 0.70, row: 0.058 }, legend: [0.035, 0.198, 0.26] },
  vertical: { map: [0.03, 0.53, 0.94], list: { mode: 'rows', x: 0.07, w: 0.86, top: 0.455, row: 0.034 }, legend: [0.07, 0.505, 0.4] },
  square: { map: [0.04, 0.37, 0.92], list: { mode: 'row3', x: 0.06, w: 0.88, y: 0.252, h: 0.075 }, legend: [0.06, 0.345, 0.34] },
  portrait: { map: [0.04, 0.45, 0.92], list: { mode: 'rows', x: 0.065, w: 0.87, top: 0.385, row: 0.032 }, legend: [0.065, 0.426, 0.36] },
};

export class MapRaceScene extends Scene {
  static type = 'mapRace';
  static label = 'Map race';
  static paced = true;
  static defaults = {
    title: '', subtitle: '', source: '', valueFormat: { type: 'count' }, scale: 'auto', top: 5,
    highlight: null, captions: [], lowColor: null, highColor: null, chapter: null,
  };

  static validate(s, { w, ds, errs }) {
    if (ds && countryShare(ds.columns ?? []) < 0.3) errs.push(`${w}: a map race needs countries as columns (fewer than a third of "${s.data}" columns are countries)`);
    if (s.scale != null && !['auto', 'linear', 'log'].includes(s.scale)) errs.push(`${w}.scale must be "auto", "linear" or "log"`);
    if (s.top != null && !(Number.isInteger(s.top) && s.top >= 0 && s.top <= 10)) errs.push(`${w}.top must be a whole number from 0 to 10`);
  }

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = makeFormatter(spec.valueFormat ?? { type: 'count' });
    this.highlight = spec.highlight || null;
    const shapes = worldShapes();
    this.entries = [];
    const seen = new Set();
    for (const name of this.ds.columns) {
      const c = findCountry(name);
      const code = c?.a2;
      if (!code || seen.has(code)) continue;
      seen.add(code);
      this.entries.push({ name, code, shape: shapes[code] ?? null, col: this.ds.col(name) });
    }
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    // Colour scale from the values the scene actually shows (its years),
    // ignoring the smallest 5% so a few tiny values don't wash out the map.
    const y0 = Math.min(Number(this.spec.pace.start), this.pace.endYear);
    const y1 = Math.max(Number(this.spec.pace.start), this.pace.endYear);
    const vals = [];
    for (const e of this.entries) {
      this.ds.index.forEach((yr, k) => {
        const v = e.col[k];
        if (yr >= y0 && yr <= y1 && Number.isFinite(v)) vals.push(v);
      });
    }
    vals.sort((a, b) => a - b);
    const q = (f) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(f * (vals.length - 1))))];
    const pos = vals.filter((v) => v > 0);
    const qp = (f) => pos[Math.min(pos.length - 1, Math.max(0, Math.floor(f * (pos.length - 1))))];
    const hi = vals.length ? vals[vals.length - 1] : 1;
    const want = this.spec.scale ?? 'auto';
    this.log = pos.length > 3 && (want === 'log' || (want === 'auto' && hi / qp(0.5) > 30));
    if (this.log) {
      this.lo = Math.max(qp(0.05), hi / 1e6);
    } else {
      this.lo = vals.length ? Math.min(0, q(0)) : 0;
    }
    this.hi = hi > this.lo ? hi : this.lo + 1;
    this.fps = fps;
  }

  frac(v) {
    if (!Number.isFinite(v)) return NaN;
    if (this.log) {
      if (v <= 0) return 0;
      return (Math.log10(v) - Math.log10(this.lo)) / (Math.log10(this.hi) - Math.log10(this.lo));
    }
    return (v - this.lo) / (this.hi - this.lo);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const year = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const box = BOX[L.fmt] ?? BOX.landscape;
    const dark = hexLuminance(T.bg_top) < 0.2;
    const stops = s.lowColor && s.highColor ? [s.lowColor, s.highColor] : dark ? RAMPS.dark : RAMPS.light;
    const ramp = makeRamp(stops);
    const vals = this.entries.map((e) => ({ ...e, v: interpScalar(year, this.ds.index, e.col) }));
    const [mx, my, mw] = box.map;
    const scale = (mw * L.W) / WORLD_W;
    const mh = (WORLD_H * scale) / L.H;
    const px0 = mx * L.W;
    const py0 = (1 - (my + mh)) * L.H;
    const hl = this.highlight;
    const noData = T.grid;
    fig.custom(5, (ctx) => {
      ctx.globalAlpha = a0;
      ctx.translate(px0, py0);
      ctx.scale(scale, scale);
      const shown = new Set();
      // Countries with data
      for (const e of vals) {
        const p = countryPath(e.code);
        if (!p) continue;
        shown.add(e.code);
        const f = this.frac(e.v);
        ctx.fillStyle = Number.isFinite(f) ? ramp(f) : noData;
        ctx.fill(p, 'evenodd');
      }
      // The rest of the world, faint
      ctx.fillStyle = noData;
      for (const code of Object.keys(worldShapes())) {
        if (shown.has(code)) continue;
        const p = countryPath(code);
        if (p) ctx.fill(p, 'evenodd');
      }
      ctx.lineWidth = 0.9 / scale;
      ctx.strokeStyle = T.bg_top;
      ctx.lineJoin = 'round';
      for (const code of Object.keys(worldShapes())) {
        const p = countryPath(code);
        if (p) ctx.stroke(p);
      }
      const he = hl ? vals.find((e) => e.name === hl) : null;
      if (he) {
        const p = countryPath(he.code);
        if (p) {
          ctx.lineWidth = 3 / scale;
          ctx.strokeStyle = T.accent;
          ctx.stroke(p);
        }
      }
    });
    // The year, big and faint, in the empty South Pacific.
    fig.text(mx + mw * 0.015, my + mh * 0.03, yearLabel(year, s.yearLabel), {
      ha: 'left', va: 'bottom', size: Math.round(mh * L.H * 0.2), color: T.text, alpha: 0.2 * a0, family: HEAD, weight: 'bold', zorder: 6,
    });
    // Highlighted country: label at its centre.
    const ranked = vals.filter((e) => Number.isFinite(e.v)).sort((a, b) => b.v - a.v);
    if (hl) {
      const he = vals.find((e) => e.name === hl);
      if (he?.shape) {
        const [cx, cy] = he.shape.centroid;
        const fx = mx + (cx * scale) / L.W;
        const fy = my + mh - (cy * scale) / L.H;
        const rank = ranked.indexOf(he) + 1;
        const txt = Number.isFinite(he.v) ? `${this.env.label(he.name)}  ${this.valueFmt(he.v)}${rank ? `  #${rank}` : ''}` : this.env.label(he.name);
        const fs = L.fs.label;
        const wPx = [...txt].length * fs * 0.56 + 18;
        const right = fx + (wPx + 14) / L.W > 0.98;
        const bx = right ? fx - (wPx + 10) / L.W : fx + 10 / L.W;
        fig.rect(fx - 4 / L.W, fy - 4 / L.H, 8 / L.W, 8 / L.H, T.accent, a0, 8);
        fig.roundedBox(bx, fy + 8 / L.H, wPx / L.W, (fs * 1.5) / L.H, T.panel, 0.88 * a0, 0.004, 8.5);
        fig.text(bx + 9 / L.W, fy + 8 / L.H + (fs * 0.75) / L.H, txt, { ha: 'left', va: 'center', size: fs, color: T.accent, family: HEAD, weight: 'bold', alpha: a0, zorder: 9 });
      }
    }
    // Legend
    const [lx, ly, lw] = box.legend;
    const lh = 12 / L.H;
    const n = 24;
    for (let k = 0; k < n; k++) fig.rect(lx + (lw * k) / n, ly, lw / n + 0.5 / L.W, lh, ramp(k / (n - 1)), a0, 6);
    const small = { size: L.fs.tick * 0.9, color: T.muted, alpha: a0, zorder: 6 };
    fig.text(lx, ly - 6 / L.H, this.valueFmt(this.lo), { ...small, ha: 'left', va: 'top' });
    fig.text(lx + lw, ly - 6 / L.H, this.valueFmt(this.hi), { ...small, ha: 'right', va: 'top' });
    if (this.log) fig.text(lx + lw / 2, ly - 6 / L.H, 'log scale', { ...small, ha: 'center', va: 'top' });
    fig.rect(lx + lw + 14 / L.W, ly, lh * (L.H / L.W), lh, noData, a0, 6);
    fig.text(lx + lw + 14 / L.W + (lh * L.H) / L.W + 6 / L.W, ly + lh / 2, 'no data', { ...small, ha: 'left', va: 'center' });
    // Leaders
    const top = Math.max(0, s.top ?? 5);
    const list = box.list;
    const leaders = ranked.slice(0, list.mode === 'row3' ? Math.min(3, top) : top);
    const maxV = ranked[0]?.v ?? 1;
    leaders.forEach((e, k) => {
      const isHl = e.name === hl;
      const col = isHl ? T.accent : T.text;
      const icon = this.env.icon(e.name, s);
      if (list.mode === 'row3') {
        const cw = list.w / 3;
        const x = list.x + k * cw;
        fig.roundedBox(x + 4 / L.W, list.y, cw - 8 / L.W, list.h, T.panel, 0.9 * a0, 0.008, 6);
        fig.text(x + 18 / L.W, list.y + list.h * 0.68, `#${k + 1}  ${this.env.label(e.name)}`, { ha: 'left', va: 'center', size: L.fs.name * 0.9, color: col, family: HEAD, weight: 'bold', alpha: a0, zorder: 7 });
        fig.text(x + 18 / L.W, list.y + list.h * 0.3, this.valueFmt(e.v), { ha: 'left', va: 'center', size: L.fs.value * 0.9, color: T.muted, alpha: a0, zorder: 7 });
        return;
      }
      const y = list.top - k * list.row;
      const bw = list.w * Math.max(0, Math.min(1, e.v / maxV));
      fig.rect(list.x, y - list.row * 0.42, bw, list.row * 0.84, ramp(this.frac(e.v)), 0.28 * a0, 6);
      fig.text(list.x + 8 / L.W, y, `${k + 1}`, { ha: 'left', va: 'center', size: L.fs.name, color: T.muted, family: HEAD, weight: 'bold', alpha: a0, zorder: 7 });
      let tx = list.x + 46 / L.W;
      if (icon) {
        const ih = L.fs.name * 0.95;
        fig.icon(tx, y - ih / 2 / L.H, (ih * 4) / 3 / L.W, ih / L.H, icon, { alpha: a0, zorder: 7 });
        tx += ((ih * 4) / 3 + 10) / L.W;
      }
      fig.text(tx, y, this.env.label(e.name), { ha: 'left', va: 'center', size: L.fs.name, color: col, family: isHl ? HEAD : BODY, weight: isHl ? 'bold' : 'medium', alpha: a0, zorder: 7 });
      fig.text(list.x + list.w - 8 / L.W, y, this.valueFmt(e.v), { ha: 'right', va: 'center', size: L.fs.value, color: col, weight: isHl ? 'bold' : 'regular', alpha: a0, zorder: 7 });
    });
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const year = this.ys[i];
    const r = this.entries.map((e) => [e.name, interpScalar(year, this.ds.index, e.col)]).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]);
    const top = r.slice(0, 3).map(([n, v]) => `${this.env.label(n)} ${this.valueFmt(v)}`).join(', ');
    return `${yearLabel(year, this.spec.yearLabel)}. Map: darkest to brightest by value. Highest: ${top}.`;
  }
}
