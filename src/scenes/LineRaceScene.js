// Lines that draw themselves over time, with labels riding the line heads
// (engine.py LineRaceScene). Supports log scale and event markers.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions, yearLabel, spotlightAt } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade, clamp } from '../core/easing.js';
import { interpScalar, smooth, maximumAccumulate, ffillBfill, nanmax, pyFixed } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';
import { maxNTicks, logTicks, inInterval } from '../core/ticks.js';
import { placeLabels } from '../core/labels.js';

function scalarTick(v) {
  // matplotlib's ScalarFormatter for integer ticks, with a proper minus sign.
  return pyFixed(v, 0).replace('-', '−');
}

export class LineRaceScene extends Scene {
  static type = 'lineRace';
  static label = 'Line race';
  static defaults = {
    title: '', subtitle: '', source: '', series: [], valueFormat: { type: 'fixed', digits: 1 },
    yTickFormat: null, yRange: null, log: false, xRange: null, highlight: null, markers: [], captions: [],
    display: {}, colors: {}, lw: 3.0, xMode: 'fixed', minSpan: 20, chapter: null,
  };

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.series = (spec.series && spec.series.length ? spec.series : this.ds.columns).filter((s) => this.ds.has(s));
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = makeFormatter(spec.valueFormat ?? { type: 'fixed', digits: 1 });
    this.yTickFmt = spec.yTickFormat ? makeFormatter(spec.yTickFormat) : null;
    this.labelFmt = spec.labelFormat ? makeFormatter(spec.labelFormat) : null;
    this.display = spec.display ?? {};
    this.colors = spec.colors ?? {};
    this.lw = spec.lw ?? 3.0;
    this.log = !!spec.log;
    this.markers = spec.markers ?? [];
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    const x = this.ds.index;
    this.x = x;
    this.vals = this.series.map((s) => this.ds.col(s));
    if (!this.spec.yRange) {
      // Running max of everything visible so far (prefix NaN-max per series).
      const prefix = this.vals.map((v) => {
        const out = new Float64Array(v.length);
        let m = NaN;
        for (let k = 0; k < v.length; k++) {
          if (!Number.isNaN(v[k]) && (Number.isNaN(m) || v[k] > m)) m = v[k];
          out[k] = m;
        }
        return out;
      });
      const vis = new Float64Array(this.ys.length);
      for (let i = 0; i < this.ys.length; i++) {
        const yr = this.ys[i];
        let k = -1;
        let lo = 0;
        let hi = x.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (x[mid] <= yr) {
            k = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        vis[i] = k < 0 ? NaN : nanmax(prefix.map((p) => p[k]));
      }
      const filled = ffillBfill(vis);
      const f = this.log ? 1.35 : 1.12;
      this.ymax = maximumAccumulate(smooth(filled.map((v) => v * f), 0.6 * fps));
    }
    let lo = Infinity;
    for (const v of this.vals) for (const a of v) if (!Number.isNaN(a) && a < lo) lo = a;
    this.dataMin = lo;
  }

  xlim(yr) {
    const s = this.spec;
    const x = this.x;
    if ((s.xMode ?? 'fixed') === 'fixed') {
      return s.xRange ? [Number(s.xRange[0]), Number(s.xRange[1])] : [x[0], x[x.length - 1]];
    }
    const x0 = s.xRange ? Number(s.xRange[0]) : x[0];
    return [x0, Math.max(yr, x0 + (s.minSpan ?? 20))];
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const yr = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const ax = fig.axes(L.line_chart, 5);
    const [x0, x1] = this.xlim(yr);
    const pad = (x1 - x0) * L.t.lineXPad;
    ax.setXlim(x0, x1 + pad);
    ax.ylog = this.log;
    if (s.yRange) ax.setYlim(Number(s.yRange[0]), Number(s.yRange[1]));
    else ax.setYlim(this.log ? this.dataMin * 0.7 : 0, this.ymax[i]);
    const [ylo, yhi] = ax.ylim;
    // ticks and grid
    const xt = maxNTicks(x0, x1 + pad, { nbins: L.t.lineXTicks, integer: true }).filter((tk) => x0 <= tk && tk <= x1);
    const tickStyle = { size: L.fs.tick, color: T.muted, pad: 6 };
    ax.tickLabels(xt, xt.map(scalarTick), 'bottom', tickStyle);
    let yt = this.log ? logTicks(ylo, yhi, 9) : maxNTicks(ylo, yhi, { nbins: 5, steps: [1, 2, 2.5, 5, 10] });
    yt = yt.filter((v) => inInterval(v, ylo, yhi));
    ax.gridY(yt, T.grid, 1.2);
    ax.tickLabels(yt, yt.map((v) => (this.yTickFmt ? this.yTickFmt(v) : scalarTick(v))), 'left', tickStyle);
    // event markers
    this.markers.forEach((mk, k) => {
      const mx = Number(Array.isArray(mk) ? mk[0] : mk.x);
      const label = Array.isArray(mk) ? mk[1] : mk.label;
      if (yr >= mx) {
        const ma = clamp((yr - mx) / 2.0 + 0.3) * a0;
        ax.axvline(mx, { color: T.muted, lw: 1.2, dash: [3, 4], alpha: 0.7 * ma });
        ax.text(mx, 0.985 - 0.06 * (k % 2), ' ' + label, { ha: 'left', va: 'top', size: L.fs.marker, color: T.muted, alpha: ma }, 'yaxes');
      }
    });
    // lines
    const heads = [];
    const spot = spotlightAt(s.spotlight, yr);
    this.series.forEach((name, si) => {
      const v = this.vals[si];
      const xs = [];
      const yv0 = [];
      for (let k = 0; k < this.x.length && this.x[k] <= yr; k++) {
        if (!Number.isNaN(v[k])) {
          xs.push(this.x[k]);
          yv0.push(v[k]);
        }
      }
      if (!(this.x.length && this.x[0] <= yr)) return;
      const yv = interpScalar(yr, this.x, v);
      if (!Number.isNaN(yv)) {
        xs.push(yr);
        yv0.push(yv);
      }
      const disp = this.display[name] ?? name;
      const col = this.colors[name] ?? this.env.colorOf(disp, {});
      const hl = name === s.highlight || (spot && spot.entity === name && spot.k > 0.5);
      const lw = this.lw * (hl ? 1.6 : 1.0);
      const dim = spot && spot.entity !== name ? 1 - 0.7 * spot.k : 1;
      if (xs.length) {
        if (hl) ax.plot(xs, yv0, { color: col, lw: lw * 3, alpha: 0.18 * a0, cap: 'round' });
        ax.plot(xs, yv0, { color: col, lw, alpha: a0 * dim, cap: 'round' });
      }
      if (Number.isNaN(yv)) return;
      const sz = (L.fs.label * (hl ? 1.4 : 1.0)) ** 2 * 0.35;
      ax.dot(yr, yv, sz, col, { zorder: 6, edgecolor: T.bg_top, lw: 2, alpha: a0 });
      heads.push({ yv, name, col, hl });
    });
    // label de-overlap in axes-fraction space
    const frac = (val) => (this.log
      ? (Math.log10(val) - Math.log10(ylo)) / (Math.log10(yhi) - Math.log10(ylo))
      : (val - ylo) / (yhi - ylo));
    const gap = (L.fs.label * 1.25) / (L.line_chart[3] * L.H);
    const keyed = heads.map((h) => ({ ...h, f: frac(h.yv) }));
    keyed.sort((a, b) => a.f - b.f);
    const targets = keyed.map((h) => h.f);
    const fr = placeLabels(targets, gap);
    const xl = ax.xlim;
    const hx = (yr - xl[0]) / (xl[1] - xl[0]);
    const off = 26.0 / (L.line_chart[2] * L.W);
    keyed.forEach((h, k) => {
      const f = fr[k];
      const t0 = targets[k];
      const disp = this.display[h.name] ?? this.env.label(h.name);
      const txt = this.labelFmt ? `${disp}  ${this.labelFmt(h.yv)}` : `${disp}  ${this.valueFmt(h.yv)}`;
      if (Math.abs(f - t0) > gap * 0.3) {
        ax.plot([hx + off * 0.35, hx + off * 0.85], [t0, f], { color: h.col, lw: 1.4, alpha: 0.8 * a0, clip: false, cap: 'round' }, 'axes');
      }
      let tx = hx + off;
      const icon = this.env.icon(h.name, s);
      if (icon) {
        const hPx = L.fs.label * 1.05;
        ax.icon(tx, f, icon, { hPx, coords: 'axes', alpha: a0, zorder: 7 });
        tx += (hPx * (4 / 3) + 8) / ax.widthPx;
      }
      ax.text(tx, f, txt, {
        ha: 'left', va: 'center', size: L.fs.label * (h.hl ? 1.1 : 1.0), color: h.col, alpha: a0,
        weight: h.hl ? 'bold' : 'medium', family: h.hl ? HEAD : BODY,
      }, 'axes');
    });
    const [x, y] = L.year_xy;
    fig.text(x, y, yearLabel(yr, s.yearLabel), { ha: 'right', va: 'bottom', size: L.fs.year, color: T.text, alpha: 0.16 * a0, family: HEAD, weight: 'bold', zorder: 4 });
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const yr = this.ys[i];
    const now = this.series.map((n, k) => [n, interpScalar(yr, this.x, this.vals[k])]).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]);
    const parts = now.slice(0, 4).map(([n, v]) => `${this.display[n] ?? this.env.label(n)} ${this.valueFmt(v)}`);
    return `${yearLabel(yr, this.spec.yearLabel)}. Highest to lowest: ${parts.join(', ')}.`;
  }
}
