// Recap: a heading plus 2-4 big-number cards that pop in one by one.

import { Scene, HEAD } from './common.js';
import { fade, easeOut } from '../core/easing.js';
import { wrap } from '../core/textwrap.js';

export class StatCardsScene extends Scene {
  static type = 'statCards';
  static label = 'Stat cards';
  static defaults = { heading: '', cards: [], duration: 8.0, chapter: 'Recap', footer: null };

  constructor(spec, env) {
    super(spec, env);
    this.chapter = spec.chapter === undefined ? 'Recap' : spec.chapter;
  }

  get duration() {
    return Number(this.spec.duration ?? 8.0);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const a0 = fade(t, this.duration, 0.4, 0.4);
    const cards = (s.cards ?? []).map((c) => (Array.isArray(c) ? { big: c[0], small: c[1], color: c[2] } : c));
    const n = cards.length;
    const c = L.t.cards;
    const hy = c.hy;
    wrap(s.heading ?? '', c.wrap).forEach((ln, k) => {
      fig.text(0.5, hy - (k * L.fs.title * 1.2) / L.H, ln, { ha: 'center', va: 'top', size: L.fs.title, color: T.text, family: HEAD, weight: 'bold', alpha: a0 });
    });
    let boxes;
    if (c.row) {
      const gap = 0.025;
      const cw = (0.9 - gap * (n - 1)) / n;
      const ch = c.rowH;
      boxes = cards.map((_, k) => [0.05 + k * (cw + gap), c.rowY, cw, ch]);
    } else {
      const gap = 0.018;
      const ch = (c.area - gap * (n - 1)) / n;
      boxes = cards.map((_, k) => [0.08, c.top - (k + 1) * ch - k * gap, 0.84, ch]);
    }
    cards.forEach((card, k) => {
      const [x, y, w, h] = boxes[k];
      const g = easeOut((t - 0.4 - k * 0.45) / 0.5);
      if (g <= 0) return;
      const a = a0 * g;
      const dy = (1 - g) * 0.02;
      const col = card.color || T.accent;
      fig.roundedBox(x, y - dy, w, h, T.panel, 0.95 * a, 0.015, 20);
      const barH = 0.008 * L.t.ruleScale;
      fig.rect(x, y - dy + h - barH, w, barH, col, a, 21);
      const big = String(card.big ?? '');
      const bfs = L.fs.card_big * ([...big].length <= 7 ? 1.0 : 0.75);
      fig.text(x + w / 2, y - dy + h * 0.62, big, { ha: 'center', va: 'center', size: bfs, color: col, family: HEAD, weight: 'bold', alpha: a, zorder: 22 });
      const ww = Math.trunc((w * L.W) / (L.fs.card_small * 0.52));
      fig.text(x + w / 2, y - dy + h * 0.30, wrap(card.small ?? '', Math.max(12, ww)).join('\n'), {
        ha: 'center', va: 'center', size: L.fs.card_small, color: T.text, alpha: a, zorder: 22, linespacing: 1.25,
      });
    });
    if (s.footer) {
      fig.text(0.5, c.footerY, wrap(s.footer, c.footerWrap).join('\n'), {
        ha: 'center', va: 'center', size: L.fs.subtitle, color: T.muted, alpha: a0 * easeOut((t - 2.0) / 0.6),
      });
    }
  }
}
