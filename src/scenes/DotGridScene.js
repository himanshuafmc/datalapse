// 100 dots = 100 people. Coloured dots show the share affected over time.

import { Scene, HEAD, drawHeader, drawSource, drawCaptions, yearLabel } from './common.js';
import { Pace } from '../core/pace.js';
import { Captions } from '../core/captions.js';
import { fade } from '../core/easing.js';
import { interp, pyRound } from '../core/pymath.js';
import { makeFormatter } from '../core/format.js';
import { wrap } from '../core/textwrap.js';

export class DotGridScene extends Scene {
  static type = 'dotGrid';
  static label = '100-dot grid';
  static defaults = {
    title: '', subtitle: '', source: '', bigFormat: { type: 'fixed', digits: 0, suffix: ' in 100' },
    smallText: '', captions: [], badColor: null, goodColor: null, chapter: null,
  };

  constructor(spec, env) {
    super(spec, env);
    this.ds = env.dataset(spec.data);
    this.column = spec.column ?? this.ds.columns[0];
    this.pace = new Pace(spec.pace);
    this.captions = new Captions(spec.captions ?? []);
    this.bigFmt = makeFormatter(spec.bigFormat ?? { type: 'fixed', digits: 0, suffix: ' in 100' });
  }

  get duration() {
    return this.pace.duration;
  }

  prepare(L, fps) {
    this.ys = this.pace.frames(fps);
    this.captions.schedule(this.ys, fps);
    const scale = this.spec.scale ?? 1;
    const raw = this.ds.col(this.column);
    const vals = scale === 1 ? raw : raw.map((v) => v / scale);
    this.v = interp(this.ys, this.ds.index, vals);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const bad = s.badColor || T.red;
    const good = s.goodColor || T.green;
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const v = this.v[i];
    const nBad = pyRound(v);
    let size;
    let rect;
    let tx;
    let ty;
    let bigFs;
    const d = L.t.dots;
    size = d.size;
    rect = d.row ? [d.rectX, d.rectY, size / L.W, size / L.H] : [(1 - size / L.W) / 2, d.rectY, size / L.W, size / L.H];
    [tx, ty] = [d.tx, d.ty];
    bigFs = d.bigFs;
    const ax = fig.axes(rect, 5);
    ax.setXlim(-0.6, 9.6);
    ax.setYlim(9.6, -0.6);
    const dot = (size / 10 * 0.62) ** 2;
    for (let k = 0; k < 100; k++) {
      const r = Math.floor(k / 10);
      const c = k % 10;
      const isBad = k < nBad;
      ax.dot(c, r, dot, isBad ? bad : good, { alpha: (isBad ? 1.0 : 0.55) * a0 });
    }
    fig.text(tx, ty, this.bigFmt(v), { ha: 'left', va: 'center', size: bigFs, color: bad, family: HEAD, weight: 'bold', alpha: a0, zorder: 10 });
    const w = d.wrap;
    fig.text(tx, ty - (bigFs * 0.62) / L.H, wrap(s.smallText ?? '', w).join('\n'), {
      ha: 'left', va: 'top', size: L.fs.caption, color: T.text, alpha: a0, zorder: 10, linespacing: 1.25,
    });
    const yr = yearLabel(this.ys[i], s.yearLabel);
    if (d.row) {
      fig.text(d.year[0], d.year[1], yr, { ha: 'right', va: 'bottom', size: L.fs.year, color: T.text, alpha: 0.22 * a0, family: HEAD, weight: 'bold' });
    } else {
      fig.text(0.935, ty, yr, { ha: 'right', va: 'center', size: d.yearFs, color: T.text, alpha: 0.25 * a0, family: HEAD, weight: 'bold' });
    }
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }
}
