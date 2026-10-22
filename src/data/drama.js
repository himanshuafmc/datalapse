// The drama finder: scan a table for the moments a race is worth watching
// for (lead changes, overtakes, records, crashes, surges, streaks), score
// them, and turn the best into captions and pacing.

const label = (t, mode) => {
  if (mode === 'month') {
    const y = Math.floor(t + 1e-9);
    const m = Math.min(11, Math.max(0, Math.floor((t - y) * 12 + 1e-6)));
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]} ${y}`;
  }
  return String(Math.round(t));
};

const POWERS = (() => {
  const out = [];
  for (let e = -2; e <= 15; e++) out.push(10 ** e);
  return out;
})();

/** Ranks at time k among entities with a value (1 = largest); null when missing. */
function ranksAt(values, k) {
  const present = [];
  values.forEach((col, j) => {
    const v = col[k];
    if (v != null && Number.isFinite(v)) present.push([j, v]);
  });
  present.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const r = new Array(values.length).fill(null);
  present.forEach(([j], i) => (r[j] = i + 1));
  return r;
}

/** Time within [x0, x1] where a - b changes sign (linear interpolation). */
function crossing(x0, x1, d0, d1) {
  if (d0 === d1) return x1;
  const f = d0 / (d0 - d1);
  return x0 + Math.max(0, Math.min(1, f)) * (x1 - x0);
}

/**
 * Find moments in a table { index, columns, values, timeMode }.
 * opts: { kind: 'bar'|'line', nBars, highlight, series, format(v) -> string }
 * Returns events [{ t, kind, score, kicker, text, entities }] sorted by time.
 */
export function findEvents(table, opts = {}) {
  const { index, columns } = table;
  const mode = table.timeMode ?? (index.some((v) => !Number.isInteger(v)) ? 'month' : 'year');
  const period = mode === 'month' ? 'month' : 'year';
  const fmt = opts.format ?? ((v) => Number(v.toPrecision(3)).toLocaleString('en-US'));
  const N = opts.nBars ?? 10;
  const hl = opts.highlight ?? null;
  const useCols = opts.series?.length ? opts.series.filter((s) => columns.includes(s)) : columns;
  const cols = useCols.map((c) => columns.indexOf(c));
  const values = cols.map((j) => table.values[j].map((v) => (v == null ? null : Number(v))));
  const names = cols.map((j) => columns[j]);
  const hj = hl ? names.indexOf(hl) : -1;
  const events = [];
  const add = (e) => events.push({ ...e, kicker: label(e.t, mode) });
  if (index.length < 2 || !names.length) return [];
  const ranks = index.map((_, k) => ranksAt(values, k));
  const span = index[index.length - 1] - index[0];

  // Lead changes and overtakes in the top places
  for (let k = 1; k < index.length; k++) {
    const r0 = ranks[k - 1];
    const r1 = ranks[k];
    for (let a = 0; a < names.length; a++) {
      if (r1[a] == null || r0[a] == null || r1[a] >= r0[a]) continue;
      for (let b = 0; b < names.length; b++) {
        if (a === b || r0[b] == null || r1[b] == null) continue;
        // a was below b and is now above it
        if (!(r0[a] > r0[b] && r1[a] < r1[b])) continue;
        const newRank = r1[a];
        // Report passing the one whose place a takes (one event per climb).
        if (opts.kind !== 'line' && r0[b] !== newRank) continue;
        const top = opts.kind === 'line' ? 99 : Math.min(3, N);
        const involvesHl = a === hj || b === hj;
        if (newRank > top && !(involvesHl && newRank <= N)) continue;
        const t = crossing(index[k - 1], index[k], values[a][k - 1] - values[b][k - 1], values[a][k] - values[b][k]);
        if (newRank === 1 && r0[b] === 1) {
          add({ t, kind: 'lead', score: 10 + (involvesHl ? 3 : 0), entities: [names[a], names[b]],
            text: `${names[a]} overtakes ${names[b]} to take the #1 spot.` });
        } else if (opts.kind === 'line') {
          add({ t, kind: 'cross', score: 5 + (involvesHl ? 4 : 0), entities: [names[a], names[b]],
            text: `${names[a]} overtakes ${names[b]}.` });
        } else {
          // The highlight passing others matters more than others passing it,
          // and higher places matter more than lower ones.
          const hlScore = a === hj ? 2 + 2 * (1 - (newRank - 1) / Math.max(1, N)) : b === hj ? 0.5 : 0;
          add({ t, kind: 'overtake', score: 4.5 + 1.5 * (top - Math.min(top, newRank)) + hlScore, entities: [names[a], names[b]],
            text: `${names[a]} passes ${names[b]} for #${newRank}.` });
        }
      }
    }
  }

  // The highlighted entity's climb
  if (hj >= 0) {
    let best = Infinity;
    let inTop = false;
    for (let k = 0; k < index.length; k++) {
      const r = ranks[k][hj];
      if (r == null) continue;
      if (k > 0 && !inTop && r <= N && opts.kind !== 'line') {
        add({ t: index[k], kind: 'enter', score: 6, entities: [hl], text: `${hl} enters the top ${N}.` });
      }
      inTop = inTop || r <= N;
      if (k > 0 && r < best && r <= 5 && r > 1) {
        add({ t: index[k], kind: 'best', score: 8 + (r <= 3 ? 1 : 0), entities: [hl], text: `${hl} climbs to #${r}, its best rank yet.` });
      }
      best = Math.min(best, r);
    }
  }

  // Milestones: the first entity to pass each power of ten
  const passed = new Set();
  for (let k = 0; k < index.length; k++) {
    for (let a = 0; a < names.length; a++) {
      const v = values[a][k];
      if (v == null) continue;
      for (const p of POWERS) {
        if (v < p || passed.has(p)) continue;
        passed.add(p);
        if (k === 0) continue;
        const prev = values[a][k - 1];
        const t = prev != null && prev < p ? crossing(index[k - 1], index[k], prev - p, v - p) : index[k];
        add({ t, kind: 'milestone', score: 4, entities: [names[a]], text: `${names[a]} becomes the first to pass ${fmt(p)}.` });
      }
    }
  }

  // Crashes and surges among the leaders
  for (let k = 1; k < index.length; k++) {
    for (let a = 0; a < names.length; a++) {
      const v0 = values[a][k - 1];
      const v1 = values[a][k];
      const r = ranks[k - 1][a];
      if (v0 == null || v1 == null || !(v0 > 0) || r == null || r > (opts.kind === 'line' ? 99 : N)) continue;
      const ratio = v1 / v0;
      const isHl = a === hj;
      if (ratio <= 0.85) {
        const pct = Math.round((1 - ratio) * 100);
        add({ t: index[k], kind: 'crash', score: Math.min(6.5, 3.5 + 10 * (1 - ratio)) + (isHl ? 2 : 0), entities: [names[a]],
          text: `${names[a]} falls ${pct}% in a single ${period}.` });
      } else if (ratio >= 1.35 && v1 > 0.05 * Math.max(...values.map((c) => c[k] ?? 0))) {
        const pct = Math.round((ratio - 1) * 100);
        add({ t: index[k], kind: 'surge', score: Math.min(6, 3 + 3 * (ratio - 1)) + (isHl ? 2 : 0), entities: [names[a]],
          text: `${names[a]} jumps ${pct}% in a single ${period}.` });
      }
    }
  }

  // The longest reign at #1
  let run = null;
  let bestRun = null;
  for (let k = 0; k < index.length; k++) {
    const leader = ranks[k].indexOf(1);
    if (run && run.who === leader) run.end = k;
    else {
      if (run && (!bestRun || run.end - run.start > bestRun.end - bestRun.start)) bestRun = run;
      run = { who: leader, start: k, end: k };
    }
  }
  if (run && (!bestRun || run.end - run.start > bestRun.end - bestRun.start)) bestRun = run;
  if (bestRun && bestRun.who >= 0) {
    const n = Math.round(index[bestRun.end] - index[bestRun.start]);
    if (n >= 5 && n >= span * 0.2 && bestRun.end > bestRun.start) {
      add({ t: index[bestRun.end], kind: 'streak', score: 5, entities: [names[bestRun.who]],
        text: `${names[bestRun.who]} has held #1 for ${n} ${period === 'month' ? 'years' : 'years'} straight.` });
    }
  }

  // Two entities swapping places back and forth is one story: keep the
  // last swap of a pair within a few periods.
  const step = span / Math.max(1, index.length - 1);
  const sorted = events.sort((a, b) => a.t - b.t || b.score - a.score);
  const pairKey = (e) => (e.kind === 'overtake' || e.kind === 'cross' ? [...e.entities].sort().join('|') : null);
  const out = [];
  for (const e of sorted) {
    const key = pairKey(e);
    if (key) {
      const prev = out.findIndex((o) => pairKey(o) === key && e.t - o.t <= step * 4);
      if (prev >= 0) {
        out.splice(prev, 1);
      }
    }
    out.push(e);
  }
  return out;
}

/**
 * Pick the best events, spaced out, then in time order. Each further event
 * of a kind already chosen counts for less, so a story isn't all crashes.
 */
export function pickEvents(events, { max = 7, minGapFrac = 0.07, span = null, start = null } = {}) {
  if (!events.length) return [];
  const t0 = start ?? Math.min(...events.map((e) => e.t));
  const s = span ?? Math.max(1e-9, Math.max(...events.map((e) => e.t)) - t0);
  const gap = s * minGapFrac;
  const chosen = [];
  const kinds = new Map();
  const left = [...events];
  while (chosen.length < max && left.length) {
    let best = -1;
    let bestScore = -Infinity;
    left.forEach((e, k) => {
      if (chosen.some((c) => Math.abs(c.t - e.t) < gap)) return;
      const eff = e.score * 0.7 ** (kinds.get(e.kind) ?? 0);
      if (eff > bestScore) {
        bestScore = eff;
        best = k;
      }
    });
    if (best < 0) break;
    const [e] = left.splice(best, 1);
    chosen.push(e);
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  }
  return chosen.sort((a, b) => a.t - b.t);
}

/**
 * Pace that slows into each moment and pauses on it, so captions can be
 * read: about `seconds` for the whole timeline plus the pauses.
 */
export function dramaPace(index, seconds, momentTimes = [], { pause = 1.6, endHold = 4.0, slow = 2.2 } = {}) {
  const t0 = index[0];
  const t1 = index[index.length - 1];
  const span = Math.max(1e-9, t1 - t0);
  const rate = seconds / span;
  const round = (x) => Math.round(x * 100) / 100;
  const steps = [{ hold: 1.2 }];
  let at = t0;
  const delta = span * 0.03;
  for (const m of [...momentTimes].sort((a, b) => a - b)) {
    if (m <= at + 1e-9 || m >= t1) continue;
    const slowFrom = Math.max(at, m - delta);
    if (slowFrom > at + 1e-9) steps.push({ to: slowFrom, dur: round(Math.max(0.4, (slowFrom - at) * rate)) });
    steps.push({ to: m, dur: round(Math.max(0.5, (m - slowFrom) * rate * slow)) });
    steps.push({ hold: pause });
    at = m;
  }
  steps.push({ to: t1, dur: round(Math.max(0.6, (t1 - at) * rate)) });
  steps.push({ hold: endHold });
  return { start: t0, lead: 1.0, steps };
}
