// Moving bubbles (in the style Hans Rosling made famous): each entity is a
// bubble placed by two measures, sized by a third, moving through the years.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions, yearLabel } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade } from '../core/easing.js';
import { interpScalar } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';
import { maxNTicks, logTicks, inInterval } from '../core/ticks.js';
import { findCountry, CONTINENT_NAMES } from '../data/countries.js';

export const CONTINENT_COLORS = {
  AS: '#FF5D73', EU: '#FFD23F', AF: '#3DDBC6', NA: '#6FA8FF', SA: '#B48CFF', OC: '#FF9F43',
};

const PLOT = {
  landscape: [0.075, 0.215, 0.85, 0.58],
  vertical: [0.13, 0.34, 0.80, 0.44],
  square: [0.11, 0.25, 0.83, 0.51],
  portrait: [0.12, 0.26, 0.82, 0.48],
};

export class BubbleScene extends Scene {
  static type = 'bubble';
  static label = 'Bubble chart';
  static paced = true;
  static dataKeys = ['xData', 'yData', 'sizeData'];
  static defaults = {
    title: '', subtitle: '', source: '', xLabel: '', yLabel: '', xLog: false, yLog: false,
    xFormat: null, yFormat: null, sizeFormat: null, highlight: null, labels: 6, colorBy: 'continent', trail: true, captions: [], chapter: null,
  };

  static validate(s, { w, datasets, errs }) {
    for (const k of ['xData', 'yData']) {
      if (typeof s[k] !== 'string') errs.push(`${w}.${k} must name a dataset`);
      else if (!datasets[s[k]]) errs.push(`${w}.${k}: no dataset "${s[k]}"`);
    }
    if (s.sizeData != null && !datasets[s.sizeData]) errs.push(`${w}.sizeData: no dataset "${s.sizeData}"`);
    if (s.colorBy != null && !['continent', 'entity'].includes(s.colorBy)) errs.push(`${w}.colorBy must be "continent" or "entity"`);
    for (const f of ['xRange', 'yRange']) {
      if (s[f] != null && !(Array.isArray(s[f]) && s[f].length === 2 && s[f].every(Number.isFinite))) errs.push(`${w}.${f} must be [low, high]`);
    }
    const xs = datasets[s.xData]?.columns ?? [];
    const ys = new Set(datasets[s.yData]?.columns ?? []);
    if (xs.length && ys.size && !xs.some((c) => ys.has(c))) errs.push(`${w}: the x and y datasets share no column names, so there are no bubbles to draw`);
  }

  constructor(spec, env) {
    super(spec, env);
    this.dx = env.dataset(spec.xData);
    this.dy = env.dataset(spec.yData);
    this.dsz = spec.sizeData ? env.dataset(spec.sizeData) : null;
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    const fmt = (f, d) => makeFormatter(f ?? d);
    this.xFmt = fmt(spec.xFormat, { type: 'fixed', digits: 0 });
    this.yFmt = fmt(spec.yFormat, { type: 'fixed', digits: 0 });
    this.sizeFmt = fmt(spec.sizeFormat, { type: 'count' });
    const ycols = new Set(this.dy.columns);
    const want = Array.isArray(spec.series) && spec.series.length ? new Set(spec.series) : null;
    this.names = this.dx.columns.filter((c) => ycols.has(c) && (!want || want.has(c)) && (!this.dsz || this.dsz.has(c)));
    this.cols = this.names.map((n) => ({ name: n, x: this.dx.col(n), y: this.dy.col(n), s: this.dsz ? this.dsz.col(n) : null, continent: findCountry(n)?.continent ?? null }));
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    const s = this.spec;
    const range = (key, ds, log, fixed) => {
      if (fixed) return [Number(fixed[0]), Number(fixed[1])];
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of this.cols) for (const v of c[key]) {
        if (!Number.isFinite(v) || (log && v <= 0)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (!Number.isFinite(lo)) return log ? [1, 10] : [0, 1];
      if (log) return [lo / 1.3, hi * 1.3];
      const pad = (hi - lo) * 0.06 || 1;
      return [lo >= 0 && lo - pad < 0 ? 0 : lo - pad, hi + pad];
    };
    this.xr = range('x', this.dx, !!s.xLog, s.xRange);
    this.yr = range('y', this.dy, !!s.yLog, s.yRange);
    let smax = 0;
    if (this.dsz) for (const c of this.cols) for (const v of c.s) if (Number.isFinite(v) && v > smax) smax = v;
    this.smax = smax || 1;
  }

  colorOf(c) {
    if ((this.spec.colorBy ?? 'continent') === 'continent' && c.continent && CONTINENT_COLORS[c.continent]) {
      return this.spec.colors?.[c.name] ?? CONTINENT_COLORS[c.continent];
    }
    return this.env.colorOf(c.name, this.spec.colors ?? {});
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const year = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const rect = PLOT[L.fmt] ?? PLOT.landscape;
    const ax = fig.axes(rect, 5);
    ax.setXlim(...this.xr);
    ax.setYlim(...this.yr);
    ax.ylog = !!s.yLog;
    const xlog = !!s.xLog;
    // x scale: the Axes class has a log y only, so place x by hand when log.
    const xf = (v) => (xlog ? (Math.log10(v) - Math.log10(this.xr[0])) / (Math.log10(this.xr[1]) - Math.log10(this.xr[0])) : (v - this.xr[0]) / (this.xr[1] - this.xr[0]));
    const tickStyle = { size: L.fs.tick, color: T.muted, pad: 6 };
    const yt = (s.yLog ? logTicks(...this.yr, 9) : maxNTicks(...this.yr, { nbins: 5, steps: [1, 2, 2.5, 5, 10] })).filter((v) => inInterval(v, ...this.yr));
    ax.gridY(yt, T.grid, 1.2);
    ax.tickLabels(yt, yt.map((v) => this.yFmt(v)), 'left', tickStyle);
    const xt = (xlog ? logTicks(...this.xr, 9) : maxNTicks(...this.xr, { nbins: L.fmt === 'landscape' ? 6 : 4, steps: [1, 2, 2.5, 5, 10] })).filter((v) => inInterval(v, ...this.xr));
    ax.custom(0.5, (ctx, a) => {
      ctx.strokeStyle = T.grid;
      ctx.lineWidth = 1.2 * (100 / 72);
      ctx.beginPath();
      for (const v of xt) {
        const X = Math.round(a.AX(xf(v)) * 2) / 2;
        ctx.moveTo(X, a.yTop);
        ctx.lineTo(X, a.yBot);
      }
      ctx.stroke();
    });
    xt.forEach((v) => ax.text(xf(v), -8 / ax.heightPx, this.xFmt(v), { size: L.fs.tick, color: T.muted, ha: 'center', va: 'top' }, 'axes'));
    // Axis names inside the plot, so nothing crowds the captions.
    if (s.xLabel) ax.text(0.995, 0.02, s.xLabel, { ha: 'right', va: 'bottom', size: L.fs.tick, color: T.muted, alpha: a0, weight: 'medium' }, 'axes');
    if (s.yLabel) ax.text(0.008, 0.985, s.yLabel, { ha: 'left', va: 'top', size: L.fs.tick, color: T.muted, alpha: a0, weight: 'medium' }, 'axes');
    // The year, huge and faint, behind the bubbles.
    ax.text(0.5, 0.5, yearLabel(year, s.yearLabel), { ha: 'center', va: 'center', size: Math.round(ax.heightPx * 0.42), color: T.text, alpha: 0.07 * a0, family: HEAD, weight: 'bold', zorder: 0.6 }, 'axes');
    const rMax = Math.min(ax.heightPx, ax.widthPx) * (L.fmt === 'landscape' ? 0.11 : 0.12);
    const pts = [];
    for (const c of this.cols) {
      const x = interpScalar(year, this.dx.index, c.x);
      const y = interpScalar(year, this.dy.index, c.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (xlog && x <= 0) || (s.yLog && y <= 0)) continue;
      const sv = c.s ? interpScalar(year, this.dsz.index, c.s) : null;
      if (c.s && !Number.isFinite(sv)) continue;
      const r = c.s ? Math.max(3, rMax * Math.sqrt(Math.max(0, sv) / this.smax)) : Math.max(8, rMax * 0.28);
      pts.push({ c, x, y, sv, r, X: ax.AX(xf(x)), Y: ax.Y(y) });
    }
    pts.sort((a, b) => b.r - a.r);
    const hl = s.highlight;
    // Trail of the highlighted bubble through the years so far.
    const hc = hl ? this.cols.find((c) => c.name === hl) : null;
    if (hc && s.trail !== false) {
      const col = this.colorOf(hc);
      ax.custom(3, (ctx) => {
        ctx.globalAlpha = 0.45 * a0;
        ctx.fillStyle = col;
        for (const yr of this.dx.index) {
          if (yr > year) break;
          const x = interpScalar(yr, this.dx.index, hc.x);
          const y = interpScalar(yr, this.dy.index, hc.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          ctx.beginPath();
          ctx.arc(ax.AX(xf(x)), ax.Y(y), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
    ax.custom(4, (ctx) => {
      for (const p of pts) {
        const isHl = p.c.name === hl;
        ctx.globalAlpha = (hl && !isHl ? 0.55 : 0.85) * a0;
        ctx.fillStyle = this.colorOf(p.c);
        ctx.beginPath();
        ctx.arc(p.X, p.Y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a0;
        ctx.lineWidth = isHl ? 3 : 1.2;
        ctx.strokeStyle = isHl ? T.text : T.bg_top;
        ctx.stroke();
      }
    });
    // Labels: the biggest bubbles and the highlight, skipping any that would overlap.
    const nLab = Math.max(0, s.labels ?? 6);
    const order = [...pts].sort((a, b) => (b.c.name === hl) - (a.c.name === hl) || b.r - a.r);
    const boxes = [];
    let placed = 0;
    for (const p of order) {
      const isHl = p.c.name === hl;
      if (!isHl && placed >= nLab) continue;
      const fs = L.fs.label * (isHl ? 1.05 : 0.85);
      const text = this.env.label(p.c.name);
      const wPx = [...text].length * fs * 0.55;
      const bx = p.X + p.r * 0.75 + 4;
      const by = p.Y - p.r * 0.75 - fs;
      const box = [bx, by, bx + wPx, by + fs * 1.1];
      if (!isHl && boxes.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      if (box[2] > ax.x1 + 40) continue;
      boxes.push(box);
      placed++;
      ax.text((bx - ax.x0) / ax.widthPx, (ax.yBot - (by + fs * 0.55)) / ax.heightPx, text, {
        ha: 'left', va: 'center', size: fs, color: T.text, family: isHl ? HEAD : BODY, weight: isHl ? 'bold' : 'medium', alpha: (isHl ? 1 : 0.85) * a0, zorder: 7,
      }, 'axes');
    }
    // Colour key for continents
    if ((s.colorBy ?? 'continent') === 'continent' && this.cols.some((c) => c.continent)) {
      const present = Object.keys(CONTINENT_COLORS).filter((k) => this.cols.some((c) => c.continent === k));
      const fs = L.fs.tick * 0.85;
      if (L.fmt !== 'landscape') {
        // A row under the plot on narrow frames, clear of the bubbles.
        const y = rect[1] - (L.fs.tick * 2.6) / L.H;
        let x = rect[0];
        for (const k of present) {
          const name = CONTINENT_NAMES[k];
          fig.rect(x, y - (fs * 0.35) / L.H, (fs * 0.7) / L.W, (fs * 0.7) / L.H, CONTINENT_COLORS[k], a0, 6);
          fig.text(x + (fs * 1.0) / L.W, y, name, { ha: 'left', va: 'center', size: fs, color: T.muted, alpha: a0, zorder: 6 });
          x += ((name.length * 0.55 + 2.4) * fs) / L.W;
        }
      }
      if (L.fmt === 'landscape') present.forEach((k, j) => {
        const fy = 0.985 - j * ((fs * 1.5) / ax.heightPx) - (s.yLabel ? (L.fs.tick * 1.6) / ax.heightPx : 0);
        ax.custom(6, (ctx, a) => {
          ctx.globalAlpha = a0;
          ctx.fillStyle = CONTINENT_COLORS[k];
          ctx.beginPath();
          ctx.arc(a.AX(0.985), a.AY(fy) + fs * 0.55, fs * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }, false);
        ax.text(0.985 - (fs * 0.9) / ax.widthPx, fy, CONTINENT_NAMES[k], { ha: 'right', va: 'top', size: fs, color: T.muted, alpha: a0, zorder: 6 }, 'axes');
      });
    }
    // The highlighted bubble's numbers, under the title.
    const hp = pts.find((p) => p.c.name === hl);
    if (hp) {
      const bits = [`${s.xLabel || 'x'}: ${this.xFmt(hp.x)}`, `${s.yLabel || 'y'}: ${this.yFmt(hp.y)}`];
      if (hp.sv != null) bits.push(this.sizeFmt(hp.sv));
      fig.text(rect[0] + rect[2], rect[1] + rect[3] + 0.012, `${this.env.label(hl)} · ${bits.join(' · ')}`, { ha: 'right', va: 'bottom', size: L.fs.marker, color: T.accent, alpha: a0, zorder: 8 });
    }
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const s = this.spec;
    const year = this.ys[i];
    const hl = this.cols.find((c) => c.name === s.highlight);
    let txt = `${yearLabel(year, s.yearLabel)}. Each bubble is a ${s.colorBy === 'entity' ? 'series' : 'country'}: across, ${s.xLabel || 'x'}; up, ${s.yLabel || 'y'}.`;
    if (hl) {
      const x = interpScalar(year, this.dx.index, hl.x);
      const y = interpScalar(year, this.dy.index, hl.y);
      if (Number.isFinite(x) && Number.isFinite(y)) txt += ` ${this.env.label(hl.name)}: ${this.xFmt(x)} across, ${this.yFmt(y)} up.`;
    }
    return txt;
  }
}
