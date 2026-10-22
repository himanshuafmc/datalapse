// Bump chart: who held which place, year by year. Lines draw themselves
// from left to right; crossings are overtakes.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions, yearLabel } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade } from '../core/easing.js';
import { maxNTicks } from '../core/ticks.js';
import { makeFormatter } from '../core/format.js';

const PLOT = {
  landscape: [0.075, 0.215, 0.70, 0.58],
  vertical: [0.12, 0.335, 0.56, 0.45],
  square: [0.1, 0.25, 0.6, 0.51],
  portrait: [0.11, 0.255, 0.58, 0.50],
};

export class BumpScene extends Scene {
  static type = 'bump';
  static label = 'Bump chart (ranks)';
  static paced = true;
  static defaults = { title: '', subtitle: '', source: '', nBars: 8, highlight: null, valueFormat: null, captions: [], colors: {}, chapter: null };

  static validate(s, { w, errs }) {
    if (s.nBars != null && !(Number.isInteger(s.nBars) && s.nBars >= 3 && s.nBars <= 15)) errs.push(`${w}.nBars must be a whole number from 3 to 15`);
  }

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = spec.valueFormat ? makeFormatter(spec.valueFormat) : null;
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    const N = this.spec.nBars ?? 8;
    this.N = N;
    const idx = this.ds.index;
    const cols = this.ds.columns.map((c) => this.ds.col(c));
    // Rank (1 = largest) of every column at every index year; null if no value.
    this.rank = cols.map(() => new Array(idx.length).fill(null));
    for (let k = 0; k < idx.length; k++) {
      const present = [];
      cols.forEach((col, j) => Number.isFinite(col[k]) && present.push([j, col[k]]));
      present.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      present.forEach(([j], r) => (this.rank[j][k] = r + 1));
    }
    const y0 = Number(this.spec.pace.start);
    const y1 = this.pace.endYear;
    this.x0 = Math.min(y0, y1);
    this.x1 = Math.max(y0, y1);
    this.keep = [];
    this.ds.columns.forEach((name, j) => {
      const ever = idx.some((yr, k) => yr >= this.x0 && yr <= this.x1 && this.rank[j][k] != null && this.rank[j][k] <= N);
      if (ever || name === this.spec.highlight) this.keep.push(j);
    });
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const N = this.N;
    const year = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const rect = PLOT[L.fmt] ?? PLOT.landscape;
    const ax = fig.axes(rect, 5);
    ax.setXlim(this.x0, this.x1);
    ax.setYlim(N + 0.6, 0.4);
    const ranks = Array.from({ length: N }, (_, k) => k + 1);
    ax.gridY(ranks, T.grid, 1);
    ax.tickLabels(ranks, ranks.map((r) => `#${r}`), 'left', { size: L.fs.tick, color: T.muted, pad: 6 });
    const xt = maxNTicks(this.x0, this.x1, { nbins: L.fmt === 'landscape' ? 6 : 4, integer: true }).filter((v) => v >= this.x0 && v <= this.x1);
    ax.tickLabels(xt, xt.map((v) => String(Math.round(v))), 'bottom', { size: L.fs.tick, color: T.muted, pad: 6 });
    const idx = this.ds.index;
    const hl = s.highlight;
    const heads = [];
    for (const j of this.keep) {
      const name = this.ds.columns[j];
      const col = this.env.colorOf(name, s.colors ?? {});
      const xs = [];
      const yv = [];
      let headR = null;
      for (let k = 0; k < idx.length; k++) {
        const yr = idx[k];
        if (yr < this.x0) continue;
        const r = this.rank[j][k];
        if (yr > year) {
          // interpolate the head between the last point and this one
          const prev = xs.length ? yv[yv.length - 1] : null;
          if (prev != null && r != null && k > 0 && idx[k - 1] <= year) {
            const f = (year - idx[k - 1]) / (yr - idx[k - 1]);
            const rr = Math.min(r, N + 1);
            const hy = prev + (rr - prev) * f;
            xs.push(year);
            yv.push(hy);
            headR = hy;
          }
          break;
        }
        if (r == null) {
          if (xs.length) break;
          continue;
        }
        xs.push(yr);
        yv.push(Math.min(r, N + 1));
        headR = Math.min(r, N + 1);
      }
      if (!xs.length) continue;
      const isHl = name === hl;
      const alpha = (hl && !isHl ? 0.45 : 0.95) * a0;
      ax.plot(xs, yv, { color: col, lw: isHl ? 6 : 4, alpha, cap: 'round', zorder: isHl ? 4 : 3 });
      if (headR != null && headR <= N + 0.4) {
        ax.dot(xs[xs.length - 1], headR, (L.fs.label * 0.9) ** 2 * 0.35, col, { zorder: 5, edgecolor: T.bg_top, lw: 2, alpha: a0 });
        heads.push({ name, r: headR, col, isHl, j });
      }
    }
    // Labels to the right of the plot, one per place.
    const lx = rect[0] + rect[2] + 0.012;
    for (const h of heads) {
      const fy = rect[1] + rect[3] * (1 - (h.r - 0.4) / (N + 0.2));
      let label = this.env.label(h.name);
      if (this.valueFmt) {
        const v = this.ds.col(h.name);
        const k = idx.findIndex((yr) => yr >= year);
        const val = v[Math.max(0, k < 0 ? idx.length - 1 : k)];
        if (Number.isFinite(val)) label += `  ${this.valueFmt(val)}`;
      }
      fig.text(lx, fy, label, {
        ha: 'left', va: 'center', size: L.fs.label * (h.isHl ? 1.05 : 0.92), color: h.col, alpha: a0,
        family: h.isHl ? HEAD : BODY, weight: h.isHl ? 'bold' : 'medium', zorder: 8,
      });
    }
    fig.text(rect[0] + rect[2], rect[1] + rect[3] + 0.03, yearLabel(year, s.yearLabel), { ha: 'right', va: 'bottom', size: L.fs.counter * 1.5, color: T.text, alpha: 0.55 * a0, family: HEAD, weight: 'bold', zorder: 8 });
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const year = this.ys[i];
    let k = this.ds.index.findIndex((y) => y > year) - 1;
    if (k < -1) k = this.ds.index.length - 1;
    k = Math.max(0, k);
    const order = this.keep.filter((j) => this.rank[j][k] != null && this.rank[j][k] <= 3).sort((a, b) => this.rank[a][k] - this.rank[b][k]);
    return `${yearLabel(year, this.spec.yearLabel)}. Places: ${order.map((j) => `${this.rank[j][k]}, ${this.env.label(this.ds.columns[j])}`).join('; ')}.`;
  }
}
