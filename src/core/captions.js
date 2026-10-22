// Timed lower-third captions, ported from engine.py's Captions class.
// Each item: { year } or { at } (seconds), plus dur, kicker, text, chapter.

import { fade } from './easing.js';

export class Captions {
  constructor(items = []) {
    this.items = items.map((c) => ({ ...c }));
    this.sched = [];
  }

  schedule(yearsPerFrame, fps) {
    const n = yearsPerFrame.length;
    const sched = [];
    for (const c of this.items) {
      let start;
      if (c.at != null) start = Number(c.at);
      else {
        const target = Number(c.year) - 1e-6;
        let idx = -1;
        for (let i = 0; i < n; i++) {
          if (yearsPerFrame[i] >= target) {
            idx = i;
            break;
          }
        }
        start = (idx >= 0 ? idx : n - 1) / fps;
      }
      sched.push({ start, end: start + (c.dur ?? 5.0), kicker: c.kicker ?? '', text: c.text ?? '', item: c });
    }
    sched.sort((a, b) => a.start - b.start);
    for (let k = 0; k + 1 < sched.length; k++) {
      const a = sched[k];
      const b = sched[k + 1];
      if (a.end > b.start - 0.1) a.end = b.start - 0.1;
    }
    this.sched = sched;
    return sched;
  }

  /** Captions visible at scene time t, with their alpha and time since entry. */
  active(t) {
    const out = [];
    for (const s of this.sched) {
      if (s.start <= t && t <= s.end) {
        out.push({ ...s, alpha: fade(t - s.start, s.end - s.start, 0.35, 0.3), tIn: t - s.start });
      }
    }
    return out;
  }
}
