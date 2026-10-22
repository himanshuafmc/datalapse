// Closing card: a question for the comments, a call-to-action button,
// the channel name and the data sources.

import { Scene, HEAD } from './common.js';
import { fade, easeOut } from '../core/easing.js';
import { wrap } from '../core/textwrap.js';

export const CREDIT_TEXT = 'Made with Datalapse';

export class OutroScene extends Scene {
  static type = 'outro';
  static label = 'Outro';
  static defaults = { question: '', sources: '', duration: 6.5, chapter: 'Your turn', cta: 'Tell us in the comments', button: 'SUBSCRIBE' };

  constructor(spec, env) {
    super(spec, env);
    this.showBrand = false;
    this.chapter = spec.chapter === undefined ? 'Your turn' : spec.chapter;
  }

  get duration() {
    return Number(this.spec.duration ?? 6.5);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const a0 = fade(t, this.duration, 0.4, 0.6);
    const o = L.t.outro;
    const fs = L.fs.hook * o.fs;
    let y = o.y;
    for (const ln of wrap(s.question ?? '', o.wrap)) {
      fig.text(0.5, y, ln, { ha: 'center', va: 'top', size: fs, color: T.text, family: HEAD, weight: 'bold', alpha: a0 });
      y -= (fs * 1.2) / L.H;
    }
    const cta = s.cta ?? this.env.text('cta', 'Tell us in the comments');
    if (cta) fig.text(0.5, y - 0.02, cta, { ha: 'center', va: 'top', size: L.fs.subtitle * 1.2, color: T.muted, alpha: a0 });
    const g = easeOut((t - 0.8) / 0.5);
    const pulse = 1 + 0.03 * Math.sin(t * 5) * (t > 1.3 ? 1 : 0);
    const bw = o.bw * pulse;
    const bh = o.bh * pulse;
    const by = o.by;
    const button = s.button ?? this.env.text('button', 'SUBSCRIBE');
    if (g > 0) {
      if (button) {
        fig.roundedBox(0.5 - bw / 2, by, bw, bh, T.subscribe ?? '#FF0033', a0 * g, 0.012, 25);
        fig.text(0.5, by + bh / 2, button, { ha: 'center', va: 'center', size: L.fs.subtitle * 1.35, color: '#FFFFFF', family: HEAD, weight: 'bold', alpha: a0 * g, zorder: 26 });
      }
      if (T.brand) {
        fig.text(0.5, by - 0.03, T.brand, { ha: 'center', va: 'top', size: L.fs.brand * 1.3, color: T.accent, family: HEAD, weight: 'bold', alpha: a0 * g });
      }
      if (this.env.credit) {
        const cy = by - 0.03 - (L.fs.brand * 1.3 * 2.0) / L.H;
        fig.text(0.5, cy, this.env.text('credit', CREDIT_TEXT), { ha: 'center', va: 'top', size: L.fs.source * 1.1, color: T.muted, alpha: 0.75 * a0 * g });
      }
    }
    const stamp = this.env.stamp?.();
    if (stamp) {
      fig.text(0.5, o.srcY * 0.45, `Story ${stamp}`, { ha: 'center', va: 'bottom', size: L.fs.source * 0.95, color: T.muted, alpha: 0.6 * a0 });
    }
    if (s.sources) {
      const src = this.env.text('data', 'Data: ') + s.sources;
      fig.text(0.5, o.srcY, wrap(src, o.srcWrap).join('\n'), {
        ha: 'center', va: 'bottom', size: L.fs.source, color: T.muted, alpha: 0.8 * a0, linespacing: 1.3,
      });
    }
  }
}
