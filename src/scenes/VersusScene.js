// Head to head: two entities side by side, their numbers counting through
// the years, who leads and by how much, and both lines underneath.

import { Scene, HEAD, drawHeader, drawSource, drawCaptions, yearLabel } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade } from '../core/easing.js';
import { interpScalar } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';

// name y, value y, lead-line y, mini chart rect; value size multiplier
const BOX = {
  landscape: { name: 0.735, value: 0.6, lead: 0.47, chart: [0.12, 0.215, 0.76, 0.19], big: 1.25 },
  vertical: { name: 0.74, value: 0.66, lead: 0.575, chart: [0.12, 0.34, 0.76, 0.17], big: 0.9 },
  square: { name: 0.735, value: 0.635, lead: 0.545, chart: [0.1, 0.26, 0.8, 0.2], big: 0.92 },
  portrait: { name: 0.745, value: 0.65, lead: 0.56, chart: [0.1, 0.27, 0.8, 0.2], big: 1.0 },
};

export class VersusScene extends Scene {
  static type = 'versus';
  static label = 'Head to head';
  static paced = true;
  static defaults = { title: '', subtitle: '', source: '', left: null, right: null, valueFormat: { type: 'count' }, captions: [], colors: {}, chapter: null };

  static validate(s, { w, ds, errs }) {
    for (const k of ['left', 'right']) {
      if (typeof s[k] !== 'string' || !s[k]) errs.push(`${w}.${k} must name a column`);
      else if (ds && !ds.columns?.includes(s[k])) errs.push(`${w}.${k}: "${s[k]}" is not a column of dataset "${s.data}"`);
    }
    if (s.left && s.left === s.right) errs.push(`${w}: left and right must be different`);
  }

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = makeFormatter(spec.valueFormat ?? { type: 'count' });
    this.a = this.ds.col(spec.left);
    this.b = this.ds.col(spec.right);
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    let hi = 0;
    for (const v of [...this.a, ...this.b]) if (Number.isFinite(v) && v > hi) hi = v;
    this.hi = hi || 1;
    const idx = this.ds.index;
    this.x0 = Math.max(idx[0], Math.min(Number(this.spec.pace.start), this.pace.endYear));
    this.x1 = Math.min(idx[idx.length - 1], Math.max(Number(this.spec.pace.start), this.pace.endYear));
    if (!(this.x1 > this.x0)) {
      this.x0 = idx[0];
      this.x1 = idx[idx.length - 1];
    }
    let top = 0;
    idx.forEach((x, k) => {
      if (x < this.x0 || x > this.x1) return;
      for (const v of [this.a[k], this.b[k]]) if (Number.isFinite(v) && v > top) top = v;
    });
    if (top > 0) this.hi = top;
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const year = this.ys[i];
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const box = BOX[L.fmt] ?? BOX.landscape;
    const va = interpScalar(year, this.ds.index, this.a);
    const vb = interpScalar(year, this.ds.index, this.b);
    const ca = this.env.colorOf(s.left, s.colors ?? {});
    let cb = this.env.colorOf(s.right, s.colors ?? {});
    if (cb === ca) cb = T.green;
    const sides = [[0.27, s.left, va, ca], [0.73, s.right, vb, cb]];
    for (const [x, name, v, col] of sides) {
      const icon = this.env.icon(name, s);
      let nx = x;
      if (icon) {
        const ih = L.fs.title * 0.9;
        const iw = (ih * 4) / 3;
        fig.icon(x - iw / 2 / L.W, box.name + 0.012, iw / L.W, ih / L.H, icon, { alpha: a0, zorder: 8 });
        nx = x;
      }
      fig.text(nx, box.name, this.env.label(name), { ha: 'center', va: 'top', size: L.fs.title * 0.95, color: col, family: HEAD, weight: 'bold', alpha: a0, zorder: 8 });
      fig.text(x, box.value, Number.isFinite(v) ? this.valueFmt(v) : '–', { ha: 'center', va: 'top', size: L.fs.card_big * box.big, color: T.text, family: HEAD, weight: 'bold', alpha: a0, zorder: 8 });
    }
    // "VS" badge between them
    fig.text(0.5, (box.name + box.value) / 2 + 0.01, 'VS', { ha: 'center', va: 'center', size: L.fs.title * 0.8, color: T.muted, family: HEAD, weight: 'bold', alpha: 0.6 * a0, zorder: 8 });
    // Who leads, by how much
    if (Number.isFinite(va) && Number.isFinite(vb) && va > 0 && vb > 0) {
      const [lead, lv, other, ov, col] = va >= vb ? [s.left, va, s.right, vb, ca] : [s.right, vb, s.left, va, cb];
      const ratio = lv / ov;
      const txt = ratio < 1.02
        ? 'Neck and neck'
        : ratio >= 2 ? `${this.env.label(lead)} is ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× ${this.env.label(other)}`
          : `${this.env.label(lead)} leads by ${Math.round((ratio - 1) * 100)}%`;
      fig.text(0.5, box.lead, txt, { ha: 'center', va: 'center', size: L.fs.subtitle * 1.1, color: col, weight: 'medium', alpha: a0, zorder: 8 });
      // Share bar: left part is the left entity's share of the two.
      const bw = 0.5;
      const by = box.lead - 0.045;
      const f = va / (va + vb);
      fig.rect(0.25, by, bw * f, 0.012, ca, 0.9 * a0, 7);
      fig.rect(0.25 + bw * f, by, bw * (1 - f), 0.012, cb, 0.9 * a0, 7);
    }
    // Both lines so far
    const ax = fig.axes(box.chart, 5);
    ax.setXlim(this.x0, this.x1);
    ax.setYlim(0, this.hi * 1.08);
    ax.axhline(0, { color: T.grid, lw: 1.2 });
    for (const [col, vals] of [[ca, this.a], [cb, this.b]]) {
      const xs = [];
      const yv = [];
      this.ds.index.forEach((x, k) => {
        if (x >= this.x0 && x <= year && Number.isFinite(vals[k])) {
          xs.push(x);
          yv.push(vals[k]);
        }
      });
      const hv = interpScalar(year, this.ds.index, vals);
      if (Number.isFinite(hv)) {
        xs.push(year);
        yv.push(hv);
      }
      if (xs.length) {
        ax.plot(xs, yv, { color: col, lw: 3.5, alpha: a0, cap: 'round' });
        ax.dot(xs[xs.length - 1], yv[yv.length - 1], 90, col, { zorder: 6, edgecolor: T.bg_top, lw: 2, alpha: a0 });
      }
    }
    ax.tickLabels([this.x0, this.x1], [String(Math.round(this.x0)), String(Math.round(this.x1))], 'bottom', { size: L.fs.tick, color: T.muted, pad: 4 });
    fig.text(box.chart[0] + box.chart[2], box.chart[1] + box.chart[3] + 0.01, yearLabel(year, s.yearLabel), { ha: 'right', va: 'bottom', size: L.fs.counter * 1.2, color: T.text, alpha: 0.5 * a0, family: HEAD, weight: 'bold', zorder: 6 });
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }

  /** One sentence for audio description at frame i. */
  describe(i) {
    const s = this.spec;
    const year = this.ys[i];
    const a = interpScalar(year, this.ds.index, this.a);
    const b = interpScalar(year, this.ds.index, this.b);
    return `${yearLabel(year, s.yearLabel)}. ${this.env.label(s.left)} ${Number.isFinite(a) ? this.valueFmt(a) : 'no data'}, ${this.env.label(s.right)} ${Number.isFinite(b) ? this.valueFmt(b) : 'no data'}.`;
  }
}
