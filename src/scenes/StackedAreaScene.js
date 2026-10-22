// Stacked areas that grow through time: how a whole splits into parts
// (an electricity mix, a population by region). Optionally as shares of 100%.

import { Scene, HEAD, drawHeader, drawSource, drawCaptions, yearLabel } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade } from '../core/easing.js';
import { interpScalar, smooth, maximumAccumulate } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';
import { maxNTicks } from '../core/ticks.js';

const PLOT = {
  landscape: [0.075, 0.215, 0.70, 0.58],
  vertical: [0.12, 0.335, 0.58, 0.45],
  square: [0.1, 0.25, 0.62, 0.51],
  portrait: [0.11, 0.255, 0.6, 0.50],
};

export class StackedAreaScene extends Scene {
  static type = 'stackedArea';
  static label = 'Stacked area';
  static paced = true;
  static defaults = { title: '', subtitle: '', source: '', series: [], percent: false, valueFormat: { type: 'count' }, yTickFormat: null, highlight: null, captions: [], colors: {}, chapter: null };

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.series = (spec.series?.length ? spec.series : this.ds.columns).filter((c) => this.ds.has(c));
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = makeFormatter(spec.valueFormat ?? { type: 'count' });
    this.tickFmt = spec.yTickFormat ? makeFormatter(spec.yTickFormat) : null;
  }

  get duration() {
    return this.pace.duration;
  }

  /** Values of every series at time x (missing counts as 0). */
  at(x) {
    return this.series.map((n) => {
      const v = interpScalar(x, this.ds.index, this.ds.col(n));
      return Number.isFinite(v) ? Math.max(0, v) : 0;
    });
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    const idx = this.ds.index;
    this.x0 = Math.min(idx[0], Number(this.spec.pace.start));
    this.x1 = idx[idx.length - 1];
    if (!this.spec.percent) {
      const sum = (x) => this.at(x).reduce((a, b) => a + b, 0);
      const prefix = [];
      let m = 0;
      for (const x of idx) prefix.push((m = Math.max(m, sum(x))));
      let k = -1;
      const totals = this.ys.map((y) => {
        while (k + 1 < idx.length && idx[k + 1] <= y) k++;
        return Math.max(k >= 0 ? prefix[k] : 0, sum(y));
      });
      this.ymax = maximumAccumulate(smooth(totals.map((v) => v * 1.12 || 1), 0.6 * fps));
    }
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const year = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const rect = PLOT[L.fmt] ?? PLOT.landscape;
    const ax = fig.axes(rect, 5);
    const pct = !!s.percent;
    const yhi = pct ? 100 : this.ymax[i];
    ax.setXlim(this.x0, this.x1);
    ax.setYlim(0, yhi);
    const yt = maxNTicks(0, yhi, { nbins: 5, steps: [1, 2, 2.5, 5, 10] }).filter((v) => v >= 0 && v <= yhi);
    ax.gridY(yt, T.grid, 1.2);
    ax.tickLabels(yt, yt.map((v) => (pct ? `${Math.round(v)}%` : this.tickFmt ? this.tickFmt(v) : this.valueFmt(v))), 'left', { size: L.fs.tick, color: T.muted, pad: 6 });
    const xt = maxNTicks(this.x0, this.x1, { nbins: L.fmt === 'landscape' ? 6 : 4, integer: true }).filter((v) => v >= this.x0 && v <= this.x1);
    ax.tickLabels(xt, xt.map((v) => String(Math.round(v))), 'bottom', { size: L.fs.tick, color: T.muted, pad: 6 });
    // Points: data years up to now, plus the moving head.
    const xs = Array.from(this.ds.index).filter((x) => x <= year);
    if (!xs.length || xs[xs.length - 1] < year) xs.push(year);
    const stacks = xs.map((x) => {
      const v = this.at(x);
      const tot = v.reduce((a, b) => a + b, 0) || 1;
      return pct ? v.map((u) => (u / tot) * 100) : v;
    });
    const n = this.series.length;
    const lower = xs.map(() => 0);
    const bands = [];
    for (let k = 0; k < n; k++) {
      const lo = lower.slice();
      const hi = lo.map((b, j) => b + stacks[j][k]);
      for (let j = 0; j < xs.length; j++) lower[j] = hi[j];
      bands.push({ lo, hi });
    }
    const hl = s.highlight;
    const colOf = (name, k) => this.env.categoryColor(name, k, s.colors ?? {});
    this.series.forEach((name, k) => {
      const col = colOf(name, k);
      const dim = hl && name !== hl ? 0.72 : 0.92;
      ax.fillBetween(xs, bands[k].lo, bands[k].hi, col, dim * a0, 2);
      ax.plot(xs, bands[k].hi, { color: T.bg_top, lw: 1.2, alpha: 0.8 * a0, zorder: 3 });
    });
    // Labels at the head, in the middle of each band that is tall enough.
    const last = xs.length - 1;
    const tot = stacks[last].reduce((a, b) => a + b, 0) || 1;
    const minPx = L.fs.label * 1.15;
    const lx = rect[0] + rect[2] + 0.012;
    let prevY = -Infinity;
    this.series.forEach((name, k) => {
      const lo = bands[k].lo[last];
      const hi = bands[k].hi[last];
      const hPx = ((hi - lo) / yhi) * rect[3] * L.H;
      if (hPx < minPx * 0.6) return;
      let fy = rect[1] + rect[3] * (((lo + hi) / 2) / yhi);
      fy = Math.max(fy, prevY + minPx / L.H);
      prevY = fy;
      const v = stacks[last][k];
      const share = pct ? v : (v / tot) * 100;
      const txt = `${this.env.label(name)}  ${pct ? `${share.toFixed(0)}%` : this.valueFmt(v)}`;
      fig.text(lx, fy, txt, { ha: 'left', va: 'center', size: L.fs.label * (name === hl ? 1.05 : 0.92), color: colOf(name, k), alpha: a0, family: name === hl ? HEAD : undefined, weight: name === hl ? 'bold' : 'medium', zorder: 8 });
    });
    fig.text(rect[0] + rect[2], rect[1] + rect[3] + 0.012, yearLabel(year, s.yearLabel), { ha: 'right', va: 'bottom', size: L.fs.counter * 1.5, color: T.text, alpha: 0.55 * a0, family: HEAD, weight: 'bold', zorder: 8 });
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const year = this.ys[i];
    const v = this.at(year);
    const tot = v.reduce((a, b) => a + b, 0) || 1;
    const parts = this.series.map((n, k) => [n, v[k]]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, x]) => `${this.env.label(n)} ${Math.round((x / tot) * 100)}%`);
    return `${yearLabel(year, this.spec.yearLabel)}. Shares: ${parts.join(', ')}.`;
  }
}
