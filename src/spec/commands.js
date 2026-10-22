// Plain-language edits: "make India saffron", "slow down around 1991",
// "show 12 bars". A small rule-based parser covers the common requests
// offline; anything else can go to an AI as a list of JSON edits.

import { THEMES } from '../core/theme.js';
import { LANGUAGES } from './translate.js';
import { findCountry } from '../data/countries.js';
import { isPaced } from '../scenes/registry.js';

const NAMED_COLORS = {
  saffron: '#FF9933', orange: '#FF8C1A', red: '#E63946', crimson: '#DC143C', green: '#2EC4B6', 'india green': '#138808', emerald: '#10B981',
  blue: '#3A86FF', navy: '#1D3557', 'sky blue': '#56B4E9', teal: '#14B8A6', purple: '#8B5CF6', violet: '#7C3AED', pink: '#FF5DA2',
  magenta: '#D946EF', yellow: '#FFD166', gold: '#FFB703', amber: '#F59E0B', brown: '#A16207', grey: '#9CA3AF', gray: '#9CA3AF',
  white: '#F4F6FB', black: '#111111', cyan: '#22D3EE', lime: '#84CC16', maroon: '#800000', olive: '#808000', coral: '#FF7F50',
};

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };

function parseColor(s) {
  const t = s.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) return `#${[...t.slice(1)].map((c) => c + c).join('')}`.toUpperCase();
  return NAMED_COLORS[t] ?? null;
}

function number(s) {
  const t = String(s).trim().toLowerCase();
  return WORD_NUM[t] ?? (Number.isFinite(Number(t)) ? Number(t) : null);
}

/** All entity names in the story's datasets. */
function allNames(spec) {
  const names = new Set();
  for (const d of Object.values(spec.datasets ?? {})) for (const c of d.columns ?? []) names.add(c);
  for (const s of spec.scenes ?? []) for (const it of s.items ?? []) names.add(Array.isArray(it) ? it[0] : it?.name);
  return [...names].filter(Boolean);
}

/** Resolve a typed name ("india", "us") to an entity in the story. */
function resolveName(spec, typed) {
  const names = allNames(spec);
  const t = typed.trim().toLowerCase().replace(/^the\s+/, '');
  const exact = names.find((n) => n.toLowerCase() === t);
  if (exact) return exact;
  const c = findCountry(typed);
  if (c) {
    const hit = names.find((n) => findCountry(n)?.a2 === c.a2);
    if (hit) return hit;
  }
  return names.find((n) => n.toLowerCase().startsWith(t)) ?? null;
}

const DATA_SCENES = { has: (type) => isPaced(type) };

function targetScene(spec, selected, types = null) {
  const sc = spec.scenes[selected];
  if (sc && (!types || types.has(sc.type))) return selected;
  const k = spec.scenes.findIndex((s) => !types || types.has(s.type));
  return k;
}

/** Stretch or shrink the travel parts of a pace. */
function scalePace(pace, f) {
  for (const st of pace.steps ?? []) if ('to' in st) st.dur = Math.round(st.dur * f * 100) / 100;
}

/** Insert a pause at `year`, slowing the approach. */
function pauseAt(pace, year, seconds = 2, slowFactor = 1.6) {
  const steps = [];
  let at = pace.start;
  let done = false;
  for (const st of pace.steps ?? []) {
    if (!done && 'to' in st && st.to > year && at < year) {
      const f = (year - at) / (st.to - at);
      steps.push({ to: year, dur: Math.round(st.dur * f * slowFactor * 100) / 100 });
      steps.push({ hold: seconds });
      steps.push({ to: st.to, dur: Math.round(st.dur * (1 - f) * 100) / 100 });
      done = true;
    } else if (!done && 'to' in st && st.to === year) {
      steps.push({ ...st, dur: Math.round(st.dur * slowFactor * 100) / 100 });
      steps.push({ hold: seconds });
      done = true;
    } else steps.push(st);
    if ('to' in st) at = st.to;
  }
  pace.steps = steps;
  return done;
}

/**
 * Try to apply a plain-language command. Returns { ok, message, apply(spec) }
 * when understood (apply mutates the spec), or { ok: false } otherwise.
 * ctx: { selected (scene index), setFormat(fmt), addLanguage(code) }
 */
export function parseCommand(input, spec, ctx = {}) {
  const raw = String(input).trim();
  const t = raw.toLowerCase().replace(/[.!]+$/, '');
  const sel = ctx.selected ?? 0;
  let m;

  // colours: "make India saffron", "India in #ff9933", "colour China red"
  if ((m = t.match(/^(?:make|colou?r|paint|set)\s+(.+?)\s+(?:to\s+|in\s+|as\s+)?(#[0-9a-f]{3,6}|[a-z ]+?)(?:\s+colou?r)?$/i)) || (m = t.match(/^(.+?)\s+(?:in|should be|=)\s+(#[0-9a-f]{3,6}|[a-z ]+)$/i))) {
    const color = parseColor(m[2]);
    const who = color && resolveName(spec, m[1]);
    if (color && who) return { ok: true, message: `${who} is now ${m[2].trim()}.`, apply: (s) => (s.colors = { ...(s.colors ?? {}), [who]: color }) };
  }
  // highlight / pin
  if ((m = t.match(/^(?:highlight|focus on|spotlight)\s+(.+)$/))) {
    const who = resolveName(spec, m[1]);
    const k = targetScene(spec, sel, new Set(['barRace', 'lineRace', 'growBars']));
    if (who && k >= 0) return { ok: true, message: `Highlighting ${who} in scene ${k + 1}.`, apply: (s) => (s.scenes[k].highlight = who) };
  }
  if ((m = t.match(/^(?:pin|always show|keep)\s+(.+?)(?:\s+on screen)?$/))) {
    const who = resolveName(spec, m[1]);
    const k = targetScene(spec, sel, new Set(['barRace']));
    if (who && k >= 0) return { ok: true, message: `${who} now always shows in scene ${k + 1}.`, apply: (s) => (s.scenes[k].pin = who) };
  }
  // bars: "show 12 bars", "top 15"
  if ((m = t.match(/^(?:show\s+)?(?:top\s+)?(\w+)\s+bars$/)) || (m = t.match(/^top\s+(\w+)$/))) {
    const n = number(m[1]);
    const k = targetScene(spec, sel, new Set(['barRace']));
    if (n && n >= 3 && n <= 20 && k >= 0) return { ok: true, message: `Scene ${k + 1} shows ${n} bars.`, apply: (s) => (s.scenes[k].nBars = n) };
  }
  // pace: slow down / pause around a year
  if ((m = t.match(/^(?:slow down|slow|pause|hold|stop)\s+(?:around|at|in|on|near)\s+(\d{4})(?:\s+for\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds))?$/))) {
    const year = Number(m[1]);
    const secs = m[2] ? Number(m[2]) : 2.5;
    const k = spec.scenes.findIndex((s, i) => DATA_SCENES.has(s.type) && s.pace && (i === sel || true) && year > s.pace.start && (s.pace.steps ?? []).some((st) => 'to' in st && st.to >= year));
    if (k >= 0) {
      return {
        ok: true, message: `Scene ${k + 1} slows down and pauses ${secs} s at ${year}.`,
        apply: (s) => pauseAt(s.scenes[k].pace, year, secs),
      };
    }
  }
  // faster / slower
  if ((m = t.match(/^(?:make it\s+)?(faster|slower|quicker|speed up|slow down)(?:\s+by\s+(\d+)\s*%)?$/))) {
    const pct = m[2] ? Number(m[2]) / 100 : 0.25;
    const f = /slow/.test(m[1]) ? 1 + pct : 1 / (1 + pct);
    const ks = spec.scenes.map((s, i) => (DATA_SCENES.has(s.type) && s.pace ? i : -1)).filter((i) => i >= 0);
    if (ks.length) return { ok: true, message: `Races are ${Math.round(Math.abs(1 - f) * 100)}% ${f > 1 ? 'slower' : 'faster'}.`, apply: (s) => ks.forEach((k) => scalePace(s.scenes[k].pace, f)) };
  }
  // total length: "make it 60 seconds", "90 second video"
  if ((m = t.match(/^(?:make it|make the video|length|video length|make the race)?\s*(\d+)\s*(?:s|sec|secs|seconds?)(?:\s+long)?(?:\s+video)?$/))) {
    const want = Number(m[1]);
    const ks = spec.scenes.map((s, i) => (DATA_SCENES.has(s.type) && s.pace ? i : -1)).filter((i) => i >= 0);
    if (want >= 10 && ks.length) {
      return {
        ok: true, message: `Adjusted the races so the video is about ${want} seconds.`,
        apply: (s) => {
          const travel = (sc) => (sc.pace.steps ?? []).reduce((a, st) => a + ('to' in st ? st.dur : 0), 0);
          const total = s.scenes.reduce((a, sc) => a + (sc.pace ? (sc.pace.lead ?? 0.8) + (sc.pace.steps ?? []).reduce((b, st) => b + (st.hold ?? st.dur ?? 0), 0) : Number(sc.duration ?? 3)), 0);
          const movable = ks.reduce((a, k) => a + travel(s.scenes[k]), 0);
          const f = Math.max(0.2, (movable + (want - total)) / Math.max(1, movable));
          ks.forEach((k) => scalePace(s.scenes[k].pace, f));
        },
      };
    }
  }
  // theme
  if ((m = t.match(/^(?:use\s+)?(?:the\s+)?(dark|midnight|black|ink|light|daylight|paper|white)\s*(?:theme|mode|background)?$/)) || (m = t.match(/^(?:theme|switch to)\s+(\w+)$/))) {
    const key = { dark: 'midnight', midnight: 'midnight', black: 'ink', ink: 'ink', light: 'paper', daylight: 'paper', paper: 'paper', white: 'paper' }[m[1]];
    if (key && THEMES[key]) return { ok: true, message: `Theme: ${THEMES[key].label}.`, apply: (s) => (s.theme = { ...(s.theme ?? {}), name: key }) };
  }
  // channel name
  if ((m = raw.match(/^(?:channel(?:\s+name)?|brand)\s*(?:is|:|=|to)?\s+(.+)$/i))) {
    const name = m[1].trim().replace(/^["']|["']$/g, '');
    return { ok: true, message: `Channel name: ${name}.`, apply: (s) => (s.theme = { ...(s.theme ?? {}), brand: name }) };
  }
  // title
  if ((m = raw.match(/^(?:title|rename (?:the )?title(?: to)?|change (?:the )?title to)\s*:?\s+(.+)$/i))) {
    const k = targetScene(spec, sel, new Set(['title', 'barRace', 'lineRace', 'dotGrid', 'growBars']));
    const title = m[1].trim().replace(/^["']|["']$/g, '');
    if (k >= 0) return { ok: true, message: `Scene ${k + 1} title changed.`, apply: (s) => (s.scenes[k].title = title) };
  }
  // log / linear
  if ((m = t.match(/^(?:use\s+(?:a\s+)?)?(log|logarithmic|linear)\s+scale$/))) {
    const k = targetScene(spec, sel, new Set(['lineRace']));
    const on = m[1] !== 'linear';
    if (k >= 0) return { ok: true, message: `Scene ${k + 1} uses a ${on ? 'log' : 'linear'} scale.`, apply: (s) => (on ? (s.scenes[k].log = true) : delete s.scenes[k].log) };
  }
  // flags
  if ((m = t.match(/^(show|hide|add|remove)\s+(?:the\s+)?flags$/))) {
    const on = /show|add/.test(m[1]);
    const ks = spec.scenes.map((s, i) => (['barRace', 'lineRace', 'growBars'].includes(s.type) ? i : -1)).filter((i) => i >= 0);
    return { ok: true, message: on ? 'Flags on.' : 'Flags off.', apply: (s) => ks.forEach((k) => (on ? (s.scenes[k].flags = true) : delete s.scenes[k].flags)) };
  }
  // caption: "add caption at 1991: India opens up"
  if ((m = raw.match(/^add (?:a )?caption (?:at|in|for) (\d{4})\s*[:,-]\s*(.+)$/i))) {
    const year = Number(m[1]);
    const text = m[2].trim();
    const k = spec.scenes.findIndex((s) => DATA_SCENES.has(s.type) && s.pace && year >= s.pace.start);
    if (k >= 0) {
      return {
        ok: true, message: `Caption added at ${year} in scene ${k + 1}.`,
        apply: (s) => {
          const caps = s.scenes[k].captions ?? (s.scenes[k].captions = []);
          caps.push({ year, kicker: String(year), text, dur: 5 });
          caps.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
        },
      };
    }
  }
  // colour-blind palette
  if (/colou?r[- ]?blind/.test(t)) return { ok: true, message: 'Colour-blind-safe colours on.', apply: (s) => (s.palette = 'colorblind') };
  // credit
  if (/^(?:remove|hide|turn off)\s+(?:the\s+)?credit/.test(t)) return { ok: true, message: 'Credit line removed from the outro.', apply: (s) => (s.credit = false) };
  // formats and languages are UI actions
  if ((m = t.match(/^(?:make (?:a |it )?|switch to |show (?:the |a )?)?(vertical|short|shorts|reels?|tiktok|9:16|landscape|horizontal|16:9|youtube|square|1:1|portrait|4:5|instagram|feed)(?: version| video| format)?$/))) {
    const w = m[1];
    const fmt = /vertical|short|reel|tiktok|9:16/.test(w) ? 'vertical' : /square|1:1/.test(w) ? 'square' : /portrait|4:5|instagram|feed/.test(w) ? 'portrait' : 'landscape';
    const label = { vertical: '9:16', landscape: '16:9', square: '1:1', portrait: '4:5' }[fmt];
    return { ok: true, message: `Showing the ${label} version.`, ui: () => ctx.setFormat?.(fmt), apply: () => {} };
  }
  if ((m = t.match(/^(?:translate|make it|add)\s+(?:it\s+)?(?:in|into|to)?\s*([a-z]+)(?:\s+version)?$/))) {
    const lang = LANGUAGES.find(([code, en]) => en.toLowerCase() === m[1] || code === m[1]);
    if (lang) return { ok: true, message: `Added ${lang[1]}. Translate the text in the Story tab.`, ui: () => ctx.addLanguage?.(lang[0]), apply: (s) => (s.translations = { ...(s.translations ?? {}), [lang[0]]: s.translations?.[lang[0]] ?? { strings: {}, names: {}, countryNames: true } }) };
  }
  return { ok: false };
}

/** Example commands shown in the command box. */
export const COMMAND_EXAMPLES = [
  'make India saffron', 'highlight China', 'slow down around 1991', 'pause at 2008 for 3 seconds', 'show 12 bars',
  'make it 90 seconds', 'faster', 'light theme', 'show flags', 'add caption at 1991: India opens its economy', 'translate to hindi',
];

/** Prompt asking an AI for edits as JSON operations on the story. */
export function editPrompt(spec, request, selected) {
  const slim = JSON.parse(JSON.stringify({ ...spec, datasets: undefined, translations: undefined, images: undefined }));
  if (slim.theme?.logo) slim.theme.logo = '(image)';
  const data = Object.fromEntries(Object.entries(spec.datasets ?? {}).map(([id, d]) => [id, { columns: d.columns, from: d.index[0], to: d.index[d.index.length - 1] }]));
  return [
    'You edit a Datalapse story (a JSON spec for a data video). Apply the request below.',
    'Reply with ONLY a JSON array of edits, each { "op": "set" | "delete" | "insert", "path": "scenes.2.title", "value": ... }.',
    'Paths are dot-separated keys and list indexes into the story. "insert" adds value at a list index (use the list length to append). Do not touch "datasets".',
    `The person is looking at scene ${selected + 1} (path scenes.${selected}).`,
    '',
    `REQUEST: ${request}`,
    '',
    `DATASETS (columns and years only): ${JSON.stringify(data)}`,
    '',
    `STORY: ${JSON.stringify(slim)}`,
  ].join('\n');
}

/** Apply JSON edits from an AI. Returns the number applied; throws on bad paths. */
export function applyEdits(spec, edits) {
  if (!Array.isArray(edits)) throw new Error('Expected a list of edits.');
  let n = 0;
  for (const e of edits) {
    if (!e || typeof e.path !== 'string' || !['set', 'delete', 'insert'].includes(e.op)) throw new Error(`Not an edit: ${JSON.stringify(e).slice(0, 80)}`);
    if (/^datasets\b/.test(e.path)) throw new Error('Edits may not change the data tables.');
    const keys = e.path.split('.');
    let o = spec;
    for (let k = 0; k < keys.length - 1; k++) {
      const key = keys[k];
      if (o[key] == null) o[key] = /^\d+$/.test(keys[k + 1]) ? [] : {};
      o = o[key];
      if (typeof o !== 'object') throw new Error(`Path "${e.path}" does not exist.`);
    }
    const last = keys[keys.length - 1];
    if (e.op === 'set') o[last] = e.value;
    else if (e.op === 'delete') {
      if (Array.isArray(o)) o.splice(Number(last), 1);
      else delete o[last];
    } else if (e.op === 'insert') {
      if (!Array.isArray(o)) throw new Error(`"${e.path}" is not a list position.`);
      o.splice(Number(last), 0, e.value);
    }
    n++;
  }
  return n;
}
