// A static ranking whose bars grow in one after another.

import { Scene, HEAD, BODY, drawHeader, drawSource, drawCaptions } from './common.js';
import { Captions } from '../core/captions.js';
import { fade, clamp, easeOut } from '../core/easing.js';
import { makeFormatter } from '../core/format.js';
import { pyRound } from '../core/pymath.js';

export class GrowBarsScene extends Scene {
  static type = 'growBars';
  static label = 'Growing bars';
  static defaults = {
    title: '', subtitle: '', source: '', items: [], valueFormat: { type: 'count' },
    duration: 9.0, highlight: null, captions: [], stagger: 0.25, chapter: null,
  };

  constructor(spec, env) {
    super(spec, env);
    this.captions = new Captions(spec.captions ?? []);
    this.valueFmt = makeFormatter(spec.valueFormat ?? { type: 'count' });
    this.items = (spec.items ?? []).map((it) => (Array.isArray(it) ? { name: it[0], value: Number(it[1]) } : { name: it.name, value: Number(it.value) }));
  }

  get duration() {
    return Number(this.spec.duration ?? 9.0);
  }

  prepare(L, fps) {
    const n = pyRound(this.duration * fps);
    this.captions.schedule(new Float64Array(n), fps);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const a0 = fade(t, this.duration, 0.4, 0.0);
    drawHeader(fig, L, s.title, s.subtitle, a0);
    const ax = fig.axes(L.chart, 5);
    const n = this.items.length;
    const vmax = n ? Math.max(...this.items.map((it) => it.value)) : 1;
    ax.setXlim(0, vmax * 1.2);
    ax.setYlim(n - 0.4, -0.6);
    const stagger = Number(s.stagger ?? 0.25);
    this.items.forEach(({ name, value: v }, k) => {
      const g = easeOut((t - 0.3 - k * stagger) / 0.9);
      if (g <= 0) return;
      const col = this.env.colorOf(name, s.colors ?? {});
      const hl = name === s.highlight;
      if (hl) ax.barh(k, v * g, 0.94, col, 0.25 * a0);
      ax.barh(k, v * g, 0.78, col, 0.95 * a0);
      ax.text(-0.012, k, this.env.label(name), {
        ha: 'right', va: 'center', size: L.fs.name, color: hl ? col : T.text, alpha: a0 * clamp(g * 2),
        weight: hl ? 'bold' : 'medium', family: hl ? HEAD : BODY,
      }, 'xaxes');
      let lx = v * g + vmax * 0.012;
      const icon = this.env.icon(name, s);
      if (icon) {
        const wPx = ax.iconWidthPx(k, 0.72);
        ax.icon(lx, k, icon, { hData: 0.72, alpha: a0 * clamp(g * 2) });
        lx += ((wPx + 8) / ax.widthPx) * vmax * 1.2;
      }
      ax.text(lx, k, this.valueFmt(v * g), {
        ha: 'left', va: 'center', size: L.fs.value, color: hl ? col : T.text, alpha: a0 * clamp(g * 2),
        weight: hl ? 'bold' : 'regular',
      });
    });
    drawSource(fig, L, s.source, a0);
    drawCaptions(fig, L, this.captions, t);
  }
}
