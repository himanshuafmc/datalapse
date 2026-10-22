// Opening hook: 2-4 punchy lines revealed one by one over faint random walks.

import { Scene, HEAD } from './common.js';
import { wrap } from '../core/textwrap.js';
import { clamp, fade, easeOut } from '../core/easing.js';
import { pySum } from '../core/pymath.js';
import { COLORS } from '../core/theme.js';
import { HOOK_WALKS } from '../core/hookWalks.js';

export class HookScene extends Scene {
  static type = 'hook';
  static label = 'Opening hook';
  static defaults = { lines: [], duration: 5.5, stagger: 0.9, chapter: 'Intro' };

  constructor(spec, env) {
    super(spec, env);
    this.showBrand = false;
    this.chapter = spec.chapter === undefined ? 'Intro' : spec.chapter;
  }

  get duration() {
    return Number(this.spec.duration ?? 5.5);
  }

  prepare() {
    const names = Object.keys(COLORS);
    this.walks = HOOK_WALKS.map((steps, k) => ({
      y0: 0.08 + 0.12 * k,
      steps,
      color: COLORS[names[k * 3]],
    }));
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const dur = this.duration;
    const stagger = Number(this.spec.stagger ?? 0.9);
    const ax = fig.axes([0, 0, 1, 1], -5);
    ax.setXlim(0, 1);
    ax.setYlim(0, 1);
    const prog = clamp(t / dur);
    for (const { y0, steps, color } of this.walks) {
      const n = Math.max(2, Math.trunc(steps.length * (0.25 + 0.75 * prog)));
      const step = 1 / (steps.length - 1);
      const xs = [];
      const ys = [];
      for (let k = 0; k < n; k++) {
        xs.push(k * step);
        ys.push(y0 + steps[k] * 0.6);
      }
      ax.plot(xs, ys, { color, alpha: 0.10, lw: 3, cap: 'square' });
    }
    const sizes = { big: L.fs.hook, small: L.fs.hook_small };
    const wrapBig = L.t.hookWrapBig;
    const wrapSmall = L.t.hookWrapSmall;
    const blocks = (this.spec.lines ?? []).map((ln, k) => {
      const size = ln.size === 'big' ? 'big' : 'small';
      const fs = sizes[size];
      return { k, lines: wrap(ln.text ?? '', size === 'big' ? wrapBig : wrapSmall), color: ln.color || T.text, fs, size };
    });
    const total = pySum(blocks.map((b) => b.lines.length * b.fs * 1.2 + b.fs * 0.35));
    let y = 0.5 + total / 2 / L.H;
    for (const b of blocks) {
      const a = fade(t - b.k * stagger, dur - b.k * stagger + 1, 0.45, 0.0);
      const rise = (1 - easeOut((t - b.k * stagger) / 0.5)) * 0.02;
      for (const ln of b.lines) {
        fig.text(0.5, y - rise, ln, {
          ha: 'center', va: 'top', size: b.fs, color: b.color, family: HEAD,
          weight: b.size === 'big' ? 'bold' : 'medium', alpha: a, zorder: 30,
        });
        y -= (b.fs * 1.2) / L.H;
      }
      y -= (b.fs * 0.35) / L.H;
    }
  }
}
