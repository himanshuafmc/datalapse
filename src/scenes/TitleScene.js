// Title card: brand, accent rule, big title, subtitle and a date-span pill.

import { Scene, HEAD } from './common.js';
import { wholeImage } from '../render/images.js';
import { wrap } from '../core/textwrap.js';
import { fade, easeOut } from '../core/easing.js';

export class TitleScene extends Scene {
  static type = 'title';
  static label = 'Title card';
  static defaults = { title: 'Your title', subtitle: '', span: '', duration: 3.2, chapter: null };

  constructor(spec, env) {
    super(spec, env);
    this.showBrand = false;
  }

  get duration() {
    return Number(this.spec.duration ?? 3.2);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const a = fade(t, this.duration, 0.4, 0.4);
    const big = L.fs.hook * L.t.titleBig;
    const lines = wrap(s.title ?? '', L.t.titleWrap);
    let y = 0.56 + (lines.length * big * 0.6) / L.H;
    const logo = T.logo ? wholeImage(T.logo) : null;
    if (logo) {
      const h = (L.fs.brand * 4.2) / L.H;
      const w = (h * L.H * Math.min(3, Math.max(1, logo.aspect))) / L.W;
      fig.icon(0.5 - w / 2, y + 0.07 + (T.brand ? (L.fs.brand * 2.2) / L.H : 0), w, h, logo, { alpha: a, radius: 0.12, zorder: 30 });
    }
    if (T.brand) {
      fig.text(0.5, y + 0.07, T.brand, { ha: 'center', va: 'bottom', size: L.fs.brand * 1.4, color: T.accent, family: HEAD, weight: 'bold', alpha: a });
    }
    const w = 0.12 * easeOut(t / 0.8);
    fig.rect(0.5 - w / 2, y + 0.055, w, 0.004 * L.t.ruleScale, T.accent, a, 1);
    for (const ln of lines) {
      fig.text(0.5, y, ln, { ha: 'center', va: 'top', size: big, color: T.text, family: HEAD, weight: 'bold', alpha: a });
      y -= (big * 1.18) / L.H;
    }
    if (s.subtitle) {
      for (const ln of wrap(s.subtitle, L.t.titleSubWrap)) {
        fig.text(0.5, y - 0.01, ln, { ha: 'center', va: 'top', size: L.fs.subtitle * 1.2, color: T.muted, alpha: a });
        y -= (L.fs.subtitle * 1.5) / L.H;
      }
    }
    if (s.span) {
      const fs = L.fs.subtitle * 1.1;
      const wbox = ([...s.span].length * fs * 0.62 + 60) / L.W;
      const hbox = (fs * 2.0) / L.H;
      fig.roundedBox(0.5 - wbox / 2, y - 0.03 - hbox, wbox, hbox, T.panel, a, 0.01, 20);
      fig.text(0.5, y - 0.03 - hbox / 2, s.span, { ha: 'center', va: 'center', size: fs, color: T.accent, family: HEAD, weight: 'bold', alpha: a, zorder: 25 });
    }
  }
}
