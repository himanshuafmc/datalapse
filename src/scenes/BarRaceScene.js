// The classic animated bar-chart race (engine.py BarRaceScene).
//
// Ranks are recomputed every frame from interpolated values and then
// smoothed, so overtaking bars glide past each other. An optional "pin"
// entity is always on screen: below the top N it slides into a reserved slot
// under a dashed line and shows its true rank.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions, yearLabel, spotlightAt } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade, clamp } from '../core/easing.js';
import { interp, interpScalar, smooth } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';
import { maxNTicks } from '../core/ticks.js';

/** Ranks per row (0 = largest), ties broken by column order. */
function rowRanks(getValue, nRows, nCols) {
  const ranks = new Int32Array(nRows * nCols);
  const order = new Array(nCols);
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) order[c] = c;
    order.sort((a, b) => getValue(r, b) - getValue(r, a) || a - b);
    for (let k = 0; k < nCols; k++) ranks[r * nCols + order[k]] = k;
  }
  return ranks;
}

export class BarRaceScene extends Scene {
  static type = 'barRace';
  static label = 'Bar chart race';
  static defaults = {
    title: '', subtitle: '', source: '', valueFormat: { type: 'count' }, tickFormat: { type: 'tickCount' },
    highlight: null, pin: null, captions: [], nBars: null, minFrac: 0.003, colors: {}, chapter: null,
  };

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = makeFormatter(spec.valueFormat ?? { type: 'count' });
    this.tickFmt = makeFormatter(spec.tickFormat ?? { type: 'tickCount' });
    this.minFrac = spec.minFrac ?? 0.003;
    this.colors = spec.colors ?? {};
    this.highlight = spec.highlight || null;
    this.pin = spec.pin || null;
    if (spec.counter) {
      const cds = env.dataset(spec.counter.data);
      const xs = cds.index;
      const ys = cds.col(spec.counter.column);
      const f = makeFormatter(spec.counter.format ?? { type: 'count' });
      const prefix = spec.counter.prefix ?? '';
      this.counter = (y) => prefix + f(interpScalar(y, xs, ys));
    }
    if (Array.isArray(spec.notes) && spec.notes.length) {
      const rules = spec.notes;
      this.notes = (y) => {
        for (const r of rules) {
          if (r.after != null && !(y > r.after)) continue;
          if (r.before != null && !(y < r.before)) continue;
          return r.text;
        }
        return null;
      };
    }
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    const N = this.spec.nBars || L.nbars;
    this.N = N;
    const ys = this.pace.frames(fps);
    this.ys = ys;
    const ds = this.ds;
    const idx = ds.index;
    const all = ds.columns;
    const filled = all.map((c) => ds.colFilled(c));
    // Keep only entities that ever reach the top N + 2 (plus pinned/highlighted).
    const nYears = idx.length;
    const yrRank = rowRanks((r, c) => filled[c][r], nYears, all.length);
    const cols = [];
    const colIdx = [];
    all.forEach((name, c) => {
      let keep = false;
      for (let r = 0; r < nYears && !keep; r++) if (yrRank[r * all.length + c] < N + 2) keep = true;
      if (keep || name === this.pin || name === this.highlight) {
        cols.push(name);
        colIdx.push(c);
      }
    });
    this.cols = cols;
    const nF = ys.length;
    const nC = cols.length;
    const V = colIdx.map((c) => interp(ys, idx, filled[c]));
    this.V = V;
    const ranks = rowRanks((r, c) => V[c][r], nF, nC);
    this.trueRank = ranks;
    if (this.pin && this.cols.includes(this.pin)) {
      const pv = interp(ys, idx, filled[all.indexOf(this.pin)]);
      const allV = filled.map((f) => interp(ys, idx, f));
      const pr = new Int32Array(nF);
      for (let r = 0; r < nF; r++) {
        let cnt = 0;
        for (const col of allV) if (col[r] > pv[r]) cnt++;
        pr[r] = cnt + 1;
      }
      this.pinRank = pr;
    }
    this.pos = cols.map((_, c) => {
      const arr = new Float64Array(nF);
      for (let r = 0; r < nF; r++) arr[r] = ranks[r * nC + c];
      return smooth(arr, 0.4 * fps);
    });
    const visMax = new Float64Array(nF);
    for (let r = 0; r < nF; r++) {
      let m = -Infinity;
      for (let c = 0; c < nC; c++) if (V[c][r] > m) m = V[c][r];
      visMax[r] = nC ? m : 0;
    }
    const head = L.t.barHead;
    const scaled = visMax.map((v) => v * head);
    const sm = smooth(scaled, 0.5 * fps);
    this.xmax = sm.map((v, r) => Math.max(v, visMax[r] * (head - 0.08)));
    this.captions.schedule(ys, fps);
    this.fps = fps;
  }

  /**
   * Flag or logo just past the end of a bar; returns where the value label
   * goes (unchanged from the Python engine when there is no icon).
   */
  drawIcon(ax, name, v, p, xmax, barH, alpha) {
    const base = v + xmax * 0.008;
    const icon = this.env.icon(name, this.spec);
    if (!icon) return base;
    const h = barH * 0.92;
    const wPx = ax.iconWidthPx(p, h);
    ax.icon(base, p, icon, { hData: h, alpha });
    return base + ((wPx + 8) / ax.widthPx) * xmax;
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const N = this.N;
    const year = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const ax = fig.axes(L.chart, 5);
    let xmax = this.xmax[i];
    if (!(xmax > 0)) xmax = 1;
    const bottom = N - 0.35 + (this.pin ? 1.25 : 0);
    ax.setXlim(0, xmax);
    ax.setYlim(bottom, -0.65);
    const ticks = maxNTicks(0, xmax, { nbins: L.t.barTicks, steps: [1, 2, 2.5, 5, 10] }).filter((tk) => tk >= 0 && tk <= xmax);
    ax.gridX(ticks, T.grid, 1.3);
    ax.tickLabels(ticks, ticks.map((tk) => this.tickFmt(tk)), 'top', { size: L.fs.tick, color: T.muted, pad: 6 });
    const barH = 0.78;
    const nC = this.cols.length;
    const spot = spotlightAt(s.spotlight, year);
    this.cols.forEach((name, j) => {
      if (name === this.pin) return;
      const p = this.pos[j][i];
      const v = this.V[j][i];
      if (v <= xmax * this.minFrac || p > N - 0.4) return;
      const dim = spot && spot.entity !== name ? 1 - 0.7 * spot.k : 1;
      const alpha = clamp(N - 0.4 - p) * a0 * dim;
      const col = this.env.colorOf(name, this.colors);
      const hl = name === this.highlight || (spot && spot.entity === name && spot.k > 0.5);
      if (hl) ax.barh(p, v, barH + 0.16, col, 0.25 * alpha);
      ax.barh(p, v, barH, col, 0.95 * alpha);
      ax.text(-0.012, p, this.env.label(name), {
        ha: 'right', va: 'center', size: L.fs.name, color: hl ? col : T.text, alpha: alpha ** 2,
        weight: hl ? 'bold' : 'medium', family: hl ? HEAD : BODY,
      }, 'xaxes');
      let label = this.valueFmt(v);
      if (hl) label += `   #${this.trueRank[i * nC + j] + 1}`;
      const lx = this.drawIcon(ax, name, v, p, xmax, barH, alpha);
      ax.text(lx, p, label, {
        ha: 'left', va: 'center', size: L.fs.value, color: hl ? col : T.text,
        alpha: alpha ** 2 * (hl ? 1 : 0.85), weight: hl ? 'bold' : 'regular',
      });
    });
    if (this.pin && this.pinRank) {
      const j = this.cols.indexOf(this.pin);
      const p = this.pos[j][i];
      const v = this.V[j][i];
      const out = clamp(p - (N - 1));
      const py = p <= N - 1 ? p : N - 1 + out * 1.45;
      const col = this.env.colorOf(this.pin, this.colors);
      if (out > 0.01) ax.axhline(N - 0.1, { color: T.grid, lw: 1.5, dash: [4, 4], alpha: out * a0 });
      if (v > 0) {
        ax.barh(py, v, barH + 0.16, col, 0.25 * a0);
        ax.barh(py, v, barH, col, 0.95 * a0);
        ax.text(-0.012, py, this.env.label(this.pin), { ha: 'right', va: 'center', size: L.fs.name, color: col, weight: 'bold', family: HEAD, alpha: a0 }, 'xaxes');
        const lx = this.drawIcon(ax, this.pin, v, py, xmax, barH, a0);
        ax.text(lx, py, `${this.valueFmt(v)}   #${this.pinRank[i]}`, {
          ha: 'left', va: 'center', size: L.fs.value, color: col, weight: 'bold', alpha: a0,
        });
      }
    }
    const ylab = yearLabel(year, s.yearLabel);
    const [x, y] = L.year_xy;
    fig.text(x, y, ylab, { ha: 'right', va: 'bottom', size: L.fs.year, color: T.text, alpha: 0.22 * a0, family: HEAD, weight: 'bold', zorder: 4 });
    if (this.counter) {
      fig.text(x, y - 0.004, this.counter(year), { ha: 'right', va: 'top', size: L.fs.counter, color: T.muted, alpha: a0, zorder: 4 });
    }
    if (this.notes) {
      const n = this.notes(year);
      if (n) {
        fig.text(L.chart[0] + L.chart[2], L.chart[1] + L.chart[3] + 0.045, n, {
          ha: 'right', va: 'bottom', size: L.fs.marker, color: T.accent, alpha: a0,
        });
      }
    }
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const year = yearLabel(this.ys[i], this.spec.yearLabel);
    const order = this.cols.map((n, j) => [n, this.V[j][i]]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top = order.map(([n, v], k) => `${k + 1}, ${this.env.label(n)}, ${this.valueFmt(v)}`).join('; ');
    const hl = this.highlight ?? this.pin;
    let extra = '';
    if (hl && this.cols.includes(hl) && !order.some(([n]) => n === hl)) {
      const j = this.cols.indexOf(hl);
      const r = this.pinRank && hl === this.pin ? this.pinRank[i] : this.trueRank[i * this.cols.length + j] + 1;
      extra = ` ${this.env.label(hl)} is number ${r}, ${this.valueFmt(this.V[j][i])}.`;
    }
    return `${year}. Top: ${top}.${extra}`;
  }
}
