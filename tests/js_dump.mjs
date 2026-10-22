// Dump what the JavaScript engine computes and draws, for tests/parity_check.py.
//   node tests/js_dump.mjs out.json [frameStep]

import { writeFileSync } from 'node:fs';
import { BUNDLED_STORIES } from '../src/stories/bundled.js';
import { Video } from '../src/render/video.js';
import { Layout } from '../src/core/layout.js';
import { RecordingFig } from './recorder.mjs';

const out = process.argv[2] ?? 'js_dump.json';
const step = Number(process.argv[3] ?? 45);

const arr = (a) => (a ? Array.from(a, (v) => (Number.isNaN(v) ? null : v)) : null);

const result = {};
for (const spec0 of BUNDLED_STORIES) {
  const spec = { ...spec0, credit: false };
  const story = {};
  for (const fmt of ['landscape', 'vertical']) {
    const v = new Video(spec);
    const L = new Layout(fmt);
    const scenes = [];
    for (const sc of v.scenes) {
      sc.prepare(L, v.fps);
      const n = sc.nframes(v.fps);
      const rec = { type: sc.constructor.type, nframes: n, duration: sc.duration };
      if (sc.ys) rec.ys = arr(sc.ys);
      if (sc.captions) rec.sched = sc.captions.sched.map((c) => [c.start, c.end, c.kicker, c.text]);
      if (sc.constructor.type === 'barRace') {
        rec.cols = sc.cols;
        rec.V = sc.V.map(arr);
        rec.pos = sc.pos.map(arr);
        const nC = sc.cols.length;
        rec.trueRank = sc.cols.map((_, c) => Array.from({ length: sc.ys.length }, (_, r) => sc.trueRank[r * nC + c]));
        rec.pinRank = sc.pinRank ? Array.from(sc.pinRank) : null;
        rec.xmax = arr(sc.xmax);
      }
      if (sc.constructor.type === 'lineRace') rec.ymax = arr(sc.ymax);
      if (sc.constructor.type === 'dotGrid') rec.v = arr(sc.v);
      const frames = {};
      const idx = new Set();
      for (let i = 0; i < n; i += step) idx.add(i);
      idx.add(n - 1);
      for (const c of sc.captions?.sched ?? []) {
        for (const dt of [0.1, 0.5, 2.0]) {
          const i = Math.round((c.start + dt) * v.fps);
          if (i >= 0 && i < n) idx.add(i);
        }
      }
      for (const i of [...idx].sort((a, b) => a - b)) {
        const fig = new RecordingFig(L, v.T);
        sc.draw(fig, L, i, i / v.fps);
        frames[i] = { calls: fig.calls, axes: fig.axesList.map((a) => a.summary()) };
      }
      rec.frames = frames;
      scenes.push(rec);
    }
    story[fmt] = scenes;
  }
  result[spec.id] = story;
}
writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${out}`);
