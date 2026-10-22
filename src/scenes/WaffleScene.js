// Waffle chart: 100 squares split between categories, filling in one by
// one. From fixed items, or from a dataset at one year.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions } from './common.js';
import { Captions } from '../core/captions.js';
import { fade, clamp, easeOut } from '../core/easing.js';
import { interpScalar } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';

// grid box (left, bottom, side) and legend position, figure fractions
const BOX = {
  landscape: { grid: [0.12, 0.2, 0.6], legend: { x: 0.58, top: 0.7, row: 0.085, big: 1.25 } },
  vertical: { grid: [0.17, 0.42, 0.37], legend: { x: 0.12, top: 0.385, row: 0.036, cols: 2 } },
  square: { grid: [0.06, 0.24, 0.52], legend: { x: 0.64, top: 0.72, row: 0.072 } },
  portrait: { grid: [0.065, 0.27, 0.46], legend: { x: 0.69, top: 0.72, row: 0.07 } },
};

/** Whole squares per item that add up to `total` (largest remainder). */
export function apportion(values, total = 100) {
  const sum = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (!sum) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, k) => [r - Math.floor(r), k]).sort((a, b) => b[0] - a[0]);
  for (let j = 0; left > 0; j = (j + 1) % order.length, left--) out[order[j][1]]++;
  return out;
}

export class WaffleScene extends Scene {
  static type = 'waffle';
  static label = 'Waffle (out of 100)';
  static defaults = { title: '', subtitle: '', source: '', items: [], data: null, year: null, series: [], valueFormat: null, duration: 8, stagger: 0.02, captions: [], chapter: null };

  static validate(s, { w, datasets, errs }) {
    if (s.data != null) {
      if (!datasets[s.data]) errs.push(`${w}.data: no dataset "${s.data}"`);
      if (s.year != null && !Number.isFinite(s.year)) errs.push(`${w}.year must be a number`);
    } else if (!Array.isArray(s.items) || !s.items.length) errs.push(`${w}.items must list categories, e.g. [{"name": "Coal", "value": 35}]`);
    else s.items.forEach((it, j) => {
      const v = Array.isArray(it) ? it[1] : it?.value;
      if (!Number.isFinite(Number(v))) errs.push(`${w}.items[${j}] needs a numeric value`);
    });
    if (Array.isArray(s.items) && s.items.length > 8) errs.push(`${w}.items: at most 8 categories stay readable`);
  }

  constructor(spec, env) {
    super(spec, env);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = spec.valueFormat ? makeFormatter(spec.valueFormat) : null;
    let items;
    if (spec.data) {
      const ds = env.dataset(spec.data);
      const year = spec.year ?? ds.index[ds.index.length - 1];
      const names = spec.series?.length ? spec.series.filter((n) => ds.has(n)) : ds.columns;
      items = names.map((n) => ({ name: n, value: interpScalar(year, ds.index, ds.col(n)) })).filter((it) => Number.isFinite(it.value));
      this.year = year;
    } else {
      items = (spec.items ?? []).map((it) => (Array.isArray(it) ? { name: it[0], value: Number(it[1]), color: it[2] } : { ...it, value: Number(it.value) }));
    }
    this.items = items.slice(0, 8);
    this.counts = apportion(this.items.map((it) => it.value));
    this.total = this.items.reduce((a, it) => a + Math.max(0, it.value), 0);
  }

  get duration() {
    return Number(this.spec.duration ?? 8);
  }

  prepare(L, fps) {
    const n = Math.round(this.duration * fps);
    this.captions.schedule(Float64Array.from({ length: n }, (_, k) => k / fps), fps);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const a0 = fade(t, this.duration, 0.4, 0.6);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const box = BOX[L.fmt] ?? BOX.landscape;
    const [gx, gy, side] = box.grid;
    const cellW = (side * L.H) / 10 / L.W; // square cells: side is a fraction of height
    const cellH = side / 10;
    const gap = 0.12;
    const stagger = Number(s.stagger ?? 0.02);
    const colors = this.items.map((it, k) => it.color || this.env.categoryColor(it.name, k, s.colors ?? {}));
    let cell = 0;
    this.counts.forEach((cnt, k) => {
      for (let j = 0; j < cnt; j++, cell++) {
        const row = Math.floor(cell / 10);
        const colN = cell % 10;
        const appear = clamp((t - 0.5 - cell * stagger) / 0.25);
        if (appear <= 0) continue;
        const x = gx + colN * cellW;
        const y = gy + row * cellH;
        const sc = 0.6 + 0.4 * easeOut(appear);
        const w = cellW * (1 - gap) * sc;
        const h = cellH * (1 - gap) * sc;
        fig.roundedBox(x + (cellW - w) / 2, y + (cellH - h) / 2, w, h, colors[k], a0 * appear, 0.002, 6);
      }
    });
    // Empty cells (if values are all zero) stay faint
    for (; cell < 100; cell++) {
      const x = gx + (cell % 10) * cellW;
      const y = gy + Math.floor(cell / 10) * cellH;
      fig.roundedBox(x + cellW * gap / 2, y + cellH * gap / 2, cellW * (1 - gap), cellH * (1 - gap), T.grid, 0.5 * a0, 0.002, 5);
    }
    // Legend
    const lg = box.legend;
    const cols = lg.cols ?? 1;
    const colW = cols > 1 ? 0.42 : 0;
    this.items.forEach((it, k) => {
      const show = clamp((t - 0.8 - k * 0.25) / 0.4) * a0;
      if (show <= 0) return;
      const x = lg.x + (k % cols) * colW;
      const y = lg.top - Math.floor(k / cols) * lg.row;
      const big = lg.big ?? 1;
      const sq = L.fs.name * 0.8 * big;
      fig.roundedBox(x, y - sq / 2 / L.H, sq / L.W, sq / L.H, colors[k], show, 0.002, 7);
      const pct = this.total ? (Math.max(0, it.value) / this.total) * 100 : 0;
      const val = this.valueFmt ? this.valueFmt(it.value) : null;
      fig.text(x + (sq + 12) / L.W, y, this.env.label(it.name), { ha: 'left', va: 'center', size: L.fs.name * big, color: T.text, family: BODY, weight: 'medium', alpha: show, zorder: 8 });
      fig.text(x + (sq + 12) / L.W, y - (L.fs.name * 1.1 * big) / L.H, `${pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%${val ? `  ·  ${val}` : ''}`, {
        ha: 'left', va: 'center', size: L.fs.value * 0.95 * big, color: colors[k], family: HEAD, weight: 'bold', alpha: show, zorder: 8,
      });
    });
    if (this.year != null) {
      fig.text(gx + (cellW * 10), gy + side + 0.008, String(Math.round(this.year)), { ha: 'right', va: 'bottom', size: L.fs.counter, color: T.muted, alpha: a0, zorder: 8 });
    }
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description. */
  describe() {
    return `Out of 100 squares: ${this.items.map((it, k) => `${this.env.label(it.name)} ${this.counts[k]}`).join(', ')}.`;
  }
}
