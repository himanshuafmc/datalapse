// Quiz card: a question, up to four answers, a countdown, then the right
// answer lights up (with an optional one-line explanation). Good for
// classrooms and for keeping viewers watching.

import { Scene, HEAD } from './common.js';
import { fade, clamp, easeOut } from '../core/easing.js';
import { wrap } from '../core/textwrap.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export class QuizScene extends Scene {
  static type = 'quiz';
  static label = 'Quiz question';
  static defaults = { question: 'Which country…?', options: ['A', 'B', 'C', 'D'], answer: 0, explain: '', think: 4, duration: 9, chapter: 'Quiz' };

  static validate(s, { w, errs }) {
    if (typeof s.question !== 'string' || !s.question.trim()) errs.push(`${w}.question is required`);
    if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > 4) errs.push(`${w}.options must list 2 to 4 answers`);
    else if (!(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < s.options.length)) errs.push(`${w}.answer must be the number of the right option, counting from 0`);
    if (s.think != null && !(Number.isFinite(s.think) && s.think > 0)) errs.push(`${w}.think must be a number of seconds`);
  }

  constructor(spec, env) {
    super(spec, env);
    this.showBrand = true;
    this.chapter = spec.chapter === undefined ? 'Quiz' : spec.chapter;
  }

  get duration() {
    return Number(this.spec.duration ?? 9);
  }

  draw(fig, L, i, t) {
    const T = fig.T;
    const s = this.spec;
    const a0 = fade(t, this.duration, 0.4, 0.5);
    const think = Number(s.think ?? 4);
    const reveal = 0.8 + think;
    const landscape = L.fmt === 'landscape';
    // Question
    const qfs = L.fs.title * (landscape ? 1.05 : 1.0);
    const lines = wrap(s.question ?? '', landscape ? 40 : L.fmt === 'vertical' ? 20 : 24);
    let y = landscape ? 0.82 : L.fmt === 'vertical' ? 0.8 : 0.84;
    fig.text(0.5, y + 0.05, this.env.text('quiz', 'QUIZ'), { ha: 'center', va: 'bottom', size: L.fs.kicker * 1.1, color: T.accent, family: HEAD, weight: 'bold', alpha: a0, zorder: 30 });
    for (const ln of lines) {
      fig.text(0.5, y, ln, { ha: 'center', va: 'top', size: qfs, color: T.text, family: HEAD, weight: 'bold', alpha: a0, zorder: 30 });
      y -= (qfs * 1.18) / L.H;
    }
    // Options: 2 x 2 on wide frames, stacked otherwise
    const opts = (s.options ?? []).slice(0, 4);
    const grid = landscape || L.fmt === 'square';
    const bw = grid ? 0.4 : 0.84;
    const bh = grid ? (landscape ? 0.13 : 0.11) : L.fmt === 'vertical' ? 0.07 : 0.085;
    const gapY = grid ? 0.035 : 0.022;
    const top = y - 0.05;
    const shown = t >= reveal;
    const r = clamp((t - reveal) / 0.35);
    opts.forEach((opt, k) => {
      const col = grid ? k % 2 : 0;
      const row = grid ? Math.floor(k / 2) : k;
      const x = grid ? 0.5 + (col === 0 ? -bw - 0.012 : 0.012) : 0.08;
      const by = top - (row + 1) * bh - row * gapY;
      const appear = easeOut((t - 0.4 - k * 0.15) / 0.4) * a0;
      const right = k === s.answer;
      let fill = T.panel;
      let alpha = 0.95 * appear;
      if (shown && right) fill = T.green;
      else if (shown) alpha *= 1 - 0.55 * r;
      fig.roundedBox(x, by, bw, bh, fill, alpha, 0.012, 20);
      fig.text(x + 0.025 * (grid ? 1 : 1.4), by + bh / 2, LETTERS[k], { ha: 'left', va: 'center', size: L.fs.caption, color: shown && right ? '#08221F' : T.accent, family: HEAD, weight: 'bold', alpha: appear, zorder: 22 });
      fig.text(x + (grid ? 0.07 : 0.1), by + bh / 2, String(opt), { ha: 'left', va: 'center', size: L.fs.caption * 1.05, color: shown && right ? '#08221F' : T.text, family: HEAD, weight: 'bold', alpha: shown && !right ? appear * (1 - 0.5 * r) : appear, zorder: 22 });
    });
    const rows = grid ? Math.ceil(opts.length / 2) : opts.length;
    const bottom = top - rows * bh - (rows - 1) * gapY;
    // Countdown bar, then the explanation
    if (!shown) {
      const left = clamp(1 - (t - 0.8) / think);
      const w = 0.5 * left;
      fig.rect(0.25, bottom - 0.05, 0.5, 0.01, T.grid, a0, 21);
      fig.rect(0.25, bottom - 0.05, w, 0.01, T.accent, a0, 22);
      const secs = Math.max(0, Math.ceil(think - (t - 0.8)));
      if (t > 0.8) fig.text(0.5, bottom - 0.065, String(secs), { ha: 'center', va: 'top', size: L.fs.subtitle * 1.3, color: T.muted, family: HEAD, weight: 'bold', alpha: a0, zorder: 22 });
    } else if (s.explain) {
      const ww = landscape ? 70 : 34;
      fig.text(0.5, bottom - 0.04, wrap(s.explain, ww).join('\n'), { ha: 'center', va: 'top', size: L.fs.subtitle * 1.05, color: T.text, alpha: a0 * r, zorder: 22, linespacing: 1.3 });
    }
  }

  /** One sentence for audio description. */
  describe() {
    const s = this.spec;
    return `Options: ${(s.options ?? []).map((o, k) => `${'ABCD'[k]}, ${o}`).join('; ')}.`;
  }
}
