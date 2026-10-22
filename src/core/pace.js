// Pace maps video time to data time (usually the year on screen).
//
// Spec: { "start": 1960, "lead": 1.0, "steps": [ { "hold": 4.5 }, { "to": 1966, "dur": 8 } ] }
// is the same as engine.py's  Pace(1960, lead=1.0).hold(4.5).to(1966, 8)

import { interp, smooth, pyRound } from './pymath.js';

export class Pace {
  constructor(spec) {
    const start = Number(spec.start);
    const lead = spec.lead ?? 0.8;
    this.keys = [[0.0, start]];
    if (lead) this.keys.push([Number(lead), start]);
    for (const step of spec.steps ?? []) {
      if ('hold' in step) this.hold(Number(step.hold));
      else if ('to' in step) this.to(Number(step.to), Number(step.dur));
      else throw new Error('A pace step needs "hold" or "to"');
    }
  }

  to(year, seconds) {
    const [t] = this.keys[this.keys.length - 1];
    this.keys.push([t + seconds, Number(year)]);
    return this;
  }

  hold(seconds) {
    const [t, y] = this.keys[this.keys.length - 1];
    this.keys.push([t + seconds, y]);
    return this;
  }

  get duration() {
    return this.keys[this.keys.length - 1][0];
  }

  get endYear() {
    return this.keys[this.keys.length - 1][1];
  }

  /** Data time for every frame, smoothed so the motion eases in and out. */
  frames(fps, smoothS = 0.6) {
    const n = pyRound(this.duration * fps);
    const ts = new Float64Array(n);
    for (let i = 0; i < n; i++) ts[i] = i / fps;
    const kt = this.keys.map((k) => k[0]);
    const ky = this.keys.map((k) => k[1]);
    return smooth(interp(ts, kt, ky), smoothS * fps);
  }
}
