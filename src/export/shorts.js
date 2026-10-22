// Auto-Shorts: cut a long story into a few vertical clips, each built
// around one dramatic moment the drama finder spots in a race. Every Short
// is a small story of its own: a 3-second hook, the stretch of the race
// around the moment (slowed and paused on it), and a closing card that
// points to the full video.

import { findEvents, dramaPace } from '../data/drama.js';
import { makeFormatter } from '../core/format.js';
import { Pace } from '../core/pace.js';
import { makeTheme } from '../core/theme.js';

// Scenes a Short can be cut from, and how the drama finder reads them.
const RACE_KIND = { barRace: 'bar', mapRace: 'bar', bump: 'bar', lineRace: 'line', stackedArea: 'line', versus: 'line' };
const RACES = new Set(Object.keys(RACE_KIND));

const periodLabel = (t, month, end = false) => {
  if (!month) return String(end ? Math.floor(t + 1e-3) : Math.round(t));
  const y = Math.floor(t + 1e-9);
  const m = Math.min(11, Math.max(0, Math.floor((t - y) * 12 + 1e-6)));
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]} ${y}`;
};

/** A punchy opening line for a moment (the Short's hook). */
function headline(e, sc) {
  const [a, b] = e.entities ?? [];
  switch (e.kind) {
    case 'lead': return RACE_KIND[sc.type] === 'line' ? `${a} vs ${b}` : `${a} vs ${b}: the fight for #1`;
    case 'overtake': return `Watch ${a} pass ${b}`;
    case 'cross': return `${a} vs ${b}`;
    case 'best':
    case 'enter': return `${a}'s big climb`;
    case 'crash': return `The year ${a} crashed`;
    case 'surge': return `${a} takes off`;
    case 'milestone': return `The race to ${e.text.replace(/^.*pass\s+/i, '').replace(/\.$/, '')}`;
    case 'streak': return `${a}'s long reign at #1`;
    default: return sc.title || 'Watch this';
  }
}

function sceneEvents(spec, sc, k) {
  const ds = spec.datasets?.[sc.data];
  if (!ds || !Array.isArray(ds.index) || ds.index.length < 3) return [];
  let fmt;
  try {
    fmt = makeFormatter(sc.valueFormat ?? { type: 'count' });
  } catch {
    fmt = (v) => String(v);
  }
  const month = sc.yearLabel === 'month';
  let p0 = ds.index[0];
  let p1 = ds.index[ds.index.length - 1];
  try {
    const pace = new Pace(sc.pace);
    p0 = Number(sc.pace.start);
    p1 = pace.endYear;
  } catch {
    /* no pace: use the whole table */
  }
  const series = sc.type === 'versus' ? [sc.left, sc.right] : sc.series;
  const evs = findEvents({ ...ds, timeMode: month ? 'month' : 'year' }, {
    kind: RACE_KIND[sc.type] ?? 'bar', nBars: sc.nBars ?? (sc.type === 'mapRace' ? 5 : 10), highlight: sc.highlight ?? sc.pin, series, format: fmt,
  });
  // Skip the first few percent: series that start level "overtake" each
  // other there by noise, not by story.
  const skip = (p1 - p0) * 0.04;
  return evs.filter((e) => e.t > p0 + skip && e.t <= p1).map((e) => ({ ...e, scene: k, p0, p1, month }));
}

/**
 * Up to `count` Shorts: [{ id, title, moment, scene, from, to, seconds, spec }].
 * opts: { count, raceSeconds }
 */
export function planShorts(spec, opts = {}) {
  const count = opts.count ?? 3;
  const raceSeconds = opts.raceSeconds ?? 22;
  const cands = [];
  (spec.scenes ?? []).forEach((sc, k) => {
    if (RACES.has(sc.type)) cands.push(...sceneEvents(spec, sc, k));
  });
  // Best first, but each further moment of a kind already chosen counts for
  // less, and two Shorts from one race must not overlap much.
  const chosen = [];
  const kinds = new Map();
  const left = [...cands];
  while (chosen.length < count && left.length) {
    let best = -1;
    let bestScore = -Infinity;
    left.forEach((e, j) => {
      const span = e.p1 - e.p0;
      if (chosen.some((c) => c.scene === e.scene && Math.abs(c.t - e.t) < span * 0.22)) return;
      const s = e.score * 0.7 ** (kinds.get(e.kind) ?? 0);
      if (s > bestScore) {
        bestScore = s;
        best = j;
      }
    });
    if (best < 0) break;
    const [e] = left.splice(best, 1);
    chosen.push(e);
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  }
  const outro = [...(spec.scenes ?? [])].reverse().find((s) => s.type === 'outro');
  const outroIndex = outro ? spec.scenes.lastIndexOf(outro) : -1;
  return chosen.map((e, n) => buildShort(spec, e, n, { raceSeconds, outro, outroIndex }));
}

function buildShort(spec, e, n, { raceSeconds, outro, outroIndex }) {
  const sc = spec.scenes[e.scene];
  const span = e.p1 - e.p0;
  const minW = e.month ? 1.5 : 6;
  const W = Math.min(span, Math.max(minW, span * 0.4));
  let from = Math.max(e.p0, e.t - 0.7 * W);
  const to = Math.min(e.p1, from + W);
  from = Math.max(e.p0, to - W);
  const round = (x) => Math.round(x * 1000) / 1000;
  // Captions: the race's own captions in the window, plus the moment itself
  // if nothing already covers it.
  const capMap = new Map(); // original caption index -> its copy
  const caps = [];
  (sc.captions ?? []).forEach((c, j) => {
    const y = Number(c.year);
    if (Number.isFinite(y) && y > from && y <= to) {
      const copy = { ...c };
      capMap.set(j, copy);
      caps.push(copy);
    }
  });
  const near = (W / 12) || 1;
  if (!caps.some((c) => Math.abs(Number(c.year) - e.t) <= near)) {
    caps.push({ year: round(e.t), kicker: e.kicker, text: e.text, dur: 4.5 });
    caps.sort((a, b) => Number(a.year) - Number(b.year));
  }
  const pace = dramaPace([from, to], raceSeconds, caps.map((c) => Number(c.year)), { endHold: 2.5 });
  pace.start = round(from);
  const race = { ...sc, captions: caps, pace, chapter: null };
  const a = periodLabel(from, e.month);
  const b = periodLabel(to, e.month, true);
  const hook = {
    type: 'hook', duration: 3.4, stagger: 0.6, chapter: null,
    lines: [
      { text: `${sc.title || spec.meta?.title || ''}, ${a} to ${b}`.replace(/^, /, ''), size: 'small' },
      { text: headline(e, sc), size: 'big', color: makeTheme(spec.theme?.name ?? 'midnight', spec.theme?.overrides ?? {}).accent },
    ],
  };
  const end = {
    type: 'outro', duration: 4.5, chapter: null,
    question: outro?.question || 'Want the whole story?',
    cta: 'Full video on the channel',
    button: outro?.button ?? 'SUBSCRIBE',
    sources: outro?.sources ?? sc.source ?? '',
  };
  const title = `${headline(e, sc)} (${a}–${b})`;
  const sub = {
    ...spec,
    id: `${spec.id ?? 'story'}_short${n + 1}`,
    meta: { ...(spec.meta ?? {}), title, shorts_title: title, description: `${e.text} ${spec.meta?.description ?? ''}`.trim() },
    scenes: [hook, race, end],
  };
  // Music carries over; narration lines belong to the long version's scenes.
  if (spec.audio?.music) sub.audio = { music: { ...spec.audio.music, beats: undefined } };
  else delete sub.audio;
  // Translations: keep names, and move the race's and outro's strings to
  // their new places.
  if (spec.translations) {
    sub.translations = {};
    for (const [lang, tr] of Object.entries(spec.translations)) {
      const strings = {};
      for (const [path, text] of Object.entries(tr.strings ?? {})) {
        const m = path.match(/^scenes\.(\d+)\.(.+)$/);
        if (!m) continue;
        const i = Number(m[1]);
        let rest = m[2];
        if (i === e.scene) {
          const cm = rest.match(/^captions\.(\d+)\.(.+)$/);
          if (cm) {
            const now = caps.indexOf(capMap.get(Number(cm[1])));
            if (now < 0) continue;
            rest = `captions.${now}.${cm[2]}`;
          }
          strings[`scenes.1.${rest}`] = text;
        } else if (i === outroIndex && /^(question|button|sources)$/.test(rest)) {
          strings[`scenes.2.${rest}`] = text;
        }
      }
      sub.translations[lang] = { ...tr, strings };
    }
  }
  const seconds = hook.duration + new Pace(pace).duration + end.duration;
  return { id: sub.id, title, moment: e, scene: e.scene, from, to, seconds, spec: sub };
}
