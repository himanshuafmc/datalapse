// Spread line-end labels so none overlap, keeping each cluster centred on
// its dots. Port of engine.py place_labels(); targets must be sorted.

import { pySum } from './pymath.js';

export function placeLabels(targets, gap, lo = -0.02, hi = 1.02) {
  let groups = targets.map((t, i) => [t, [i]]);
  let merged = true;
  while (merged) {
    merged = false;
    for (let k = 0; k < groups.length - 1; k++) {
      const a = groups[k];
      const b = groups[k + 1];
      const aTop = a[0] + (a[1].length - 1) * gap / 2;
      const bBot = b[0] - (b[1].length - 1) * gap / 2;
      if (bBot - aTop < gap) {
        const mem = [...a[1], ...b[1]];
        groups[k] = [pySum(mem.map((m) => targets[m])) / mem.length, mem];
        groups.splice(k + 1, 1);
        merged = true;
        break;
      }
    }
  }
  const pos = new Array(targets.length).fill(0.0);
  for (const [c, mem] of groups) {
    let start = c - (mem.length - 1) * gap / 2;
    start = Math.min(Math.max(start, lo), hi - (mem.length - 1) * gap);
    mem.forEach((m, j) => {
      pos[m] = start + j * gap;
    });
  }
  return pos;
}
