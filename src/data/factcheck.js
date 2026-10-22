// Fact-checked captions: find the numbers in a caption and test them
// against the scene's own data. It can confirm or question a number that
// the data covers; anything from outside the data is reported as "can't
// check", never as wrong.

import { findCountry, normKey } from './countries.js';

const MULT = { t: 1e12, tn: 1e12, trillion: 1e12, b: 1e9, bn: 1e9, billion: 1e9, m: 1e6, mn: 1e6, million: 1e6, k: 1e3, thousand: 1e3,
  'lakh cr': 1e12, 'lakh crore': 1e12, cr: 1e7, crore: 1e7, lakh: 1e5, lakhs: 1e5 };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const TIMES = { twice: 2, double: 2, doubled: 2, triple: 3, tripled: 3, thrice: 3, quadrupled: 4, halved: 0.5, half: 0.5 };

function num(s) {
  return Number(String(s).replace(/,/g, ''));
}

/** Numbers in a caption, with what kind of number each one seems to be. */
export function extractClaims(text) {
  const out = [];
  const s = String(text ?? '');
  const used = [];
  const take = (m, claim) => {
    const a = m.index;
    const b = a + m[0].length;
    if (used.some(([x, y]) => a < y && b > x)) return;
    used.push([a, b]);
    out.push({ ...claim, raw: m[0].trim(), at: a });
  };
  // ranks: #5, No. 5, 5th, fifth
  for (const m of s.matchAll(/(?:#|No\.\s?|number\s)(\d{1,3})\b/gi)) take(m, { kind: 'rank', value: num(m[1]) });
  for (const m of s.matchAll(/\b(\d{1,3})(?:st|nd|rd|th)\b(?!\s*century)/gi)) take(m, { kind: 'rank', value: num(m[1]) });
  for (const m of s.matchAll(new RegExp(`\\b(${Object.keys(ORD).join('|')})\\b(?=[\\s-]+(?:largest|biggest|place|spot|most|highest|richest|ranked))`, 'gi'))) take(m, { kind: 'rank', value: ORD[m[1].toLowerCase()] });
  // money and big numbers: $3.55T, ₹4.2 lakh cr, 1.43 billion, 37.0B
  for (const m of s.matchAll(/([$€£¥₹])?\s?(\d[\d,]*(?:\.\d+)?)\s?(lakh\s?cr(?:ore)?|trillion|billion|million|thousand|crore|lakhs?|cr|tn|bn|mn|[TBMK])\b/gi)) {
    take(m, { kind: 'amount', value: num(m[2]) * (MULT[m[3].toLowerCase().replace(/\s+/g, ' ')] ?? 1), currency: m[1] ?? null });
  }
  // percentages
  for (const m of s.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(%|per\s?cent|percent)/gi)) take(m, { kind: 'percent', value: num(m[1]) });
  // multiples: 2x, 3 times, twice, doubled
  for (const m of s.matchAll(/\b(\d+(?:\.\d+)?)\s?(?:x|×|times)\b/gi)) take(m, { kind: 'multiple', value: num(m[1]) });
  for (const m of s.matchAll(new RegExp(`\\b(${Object.keys(TIMES).join('|')})\\b`, 'gi'))) take(m, { kind: 'multiple', value: TIMES[m[1].toLowerCase()] });
  // years (context, not claims)
  const years = [...s.matchAll(/\b(1[5-9]\d\d|20\d\d|21\d\d)s?\b/g)].map((m) => ({ year: num(m[1]), decade: m[0].endsWith('s'), at: m.index }));
  // "1959-61": the second part is a year too
  for (const m of s.matchAll(/\b(1[5-9]\d\d|20\d\d)[–—-](\d{2})\b/g)) {
    const at = m.index + m[0].length - 2;
    years.push({ year: Math.floor(num(m[1]) / 100) * 100 + num(m[2]), decade: false, at });
    used.push([at, at + 2]);
  }
  // other plain numbers with a currency sign or decimals: $812, 72.4
  for (const m of s.matchAll(/([$€£¥₹])?(\d[\d,]*\.\d+|\d{1,3}(?:,\d{3})+|[$€£¥₹]\d+)\b/g)) {
    if (years.some((y) => y.at === m.index)) continue;
    take(m, { kind: 'amount', value: num(m[2].replace(/[$€£¥₹]/g, '')), currency: m[1] ?? null });
  }
  for (const m of s.matchAll(/\b(\d{1,3})\b(?!\s*(?:%|st|nd|rd|th|x|×|times))/g)) {
    if (used.some(([x, y]) => m.index >= x && m.index < y) || years.some((y) => y.at === m.index)) continue;
    take(m, { kind: 'plain', value: num(m[1]) });
  }
  return { claims: out.sort((a, b) => a.at - b.at), years };
}

/** Where each entity is first named in the raw caption text: [{ name, at }]. */
function entityMentions(text, columns) {
  const low = String(text).toLowerCase();
  const out = [];
  for (const c of columns) {
    const keys = new Set([c]);
    const cc = findCountry(c);
    if (cc) for (const n of cc.names) keys.add(n);
    let at = -1;
    for (const k of keys) {
      if (k.length < 2) continue;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'u');
      const m = re.exec(low);
      if (m && (at < 0 || m.index < at)) at = m.index + m[1].length;
    }
    if (at >= 0) out.push({ name: c, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Entities named in a caption (column names, or other names of the same country). */
export function mentionedEntities(text, columns) {
  const t = ` ${normKey(text)} `;
  const out = [];
  for (const c of columns) {
    const keys = new Set([normKey(c)]);
    const cc = findCountry(c);
    if (cc) for (const n of cc.names) keys.add(normKey(n));
    let pos = -1;
    for (const k of keys) {
      if (k.length < 2) continue;
      const i = t.indexOf(` ${k} `);
      if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    }
    if (pos >= 0) out.push({ name: c, pos });
  }
  return out.sort((a, b) => a.pos - b.pos).map((e) => e.name);
}

function valueAt(ds, name, year) {
  const j = ds.columns.indexOf(name);
  if (j < 0) return null;
  const xs = ds.index;
  const ys = ds.values[j];
  let best = null;
  for (let k = 0; k < xs.length; k++) {
    if (ys[k] == null) continue;
    if (xs[k] === year) return ys[k];
    if (k > 0 && xs[k - 1] < year && xs[k] > year && ys[k - 1] != null) {
      const f = (year - xs[k - 1]) / (xs[k] - xs[k - 1]);
      return ys[k - 1] + f * (ys[k] - ys[k - 1]);
    }
    best = null;
  }
  return best;
}

function rankAt(ds, name, year) {
  const v = valueAt(ds, name, year);
  if (v == null) return null;
  let r = 1;
  for (const c of ds.columns) {
    if (c === name) continue;
    const o = valueAt(ds, c, year);
    if (o != null && o > v) r++;
  }
  return r;
}

/** Does `claimed` match `actual` the way people round numbers in captions? */
function close(claimed, actual, kind) {
  if (actual == null || !Number.isFinite(actual)) return false;
  if (kind === 'rank') return Math.round(actual) === claimed;
  if (kind === 'percent') return Math.abs(claimed - actual) <= Math.max(1, Math.abs(actual) * 0.03);
  if (kind === 'multiple') return Math.abs(claimed - actual) <= Math.max(0.15, actual * 0.08);
  const a = Math.abs(actual);
  const c = Math.abs(claimed);
  if (a === 0) return c === 0;
  return Math.abs(c - a) / a <= 0.03;
}

/**
 * Check one caption against a dataset at the caption's moment.
 * Returns { status: 'ok'|'mixed'|'bad'|'none', claims: [{ raw, status, note }] }.
 *   ok    every number matches the data
 *   bad   a number contradicts the data for an entity it names
 *   mixed some numbers match, others can't be checked here
 *   none  no numbers, or none the data can speak to
 */
export function checkCaption(caption, ds, { divisor = 1, subject = null } = {}) {
  const text = `${caption.kicker ?? ''} ${caption.text ?? ''}`;
  const { claims, years } = extractClaims(text);
  const mentions = entityMentions(text, ds.columns);
  const named = mentions.map((m) => m.name);
  // The scene's highlighted entity is the usual subject when none is named.
  const implicit = subject && ds.columns.includes(subject) && !named.includes(subject) ? subject : null;
  const ents = implicit ? [...named, implicit] : named;
  const at = caption.year != null ? Number(caption.year) : ds.index[ds.index.length - 1];
  const yearsToTry = [...new Set([...years.map((y) => y.year), Math.round(at), Math.floor(at), Math.ceil(at), at])]
    .filter((y) => y >= ds.index[0] - 1 && y <= ds.index[ds.index.length - 1] + 1);
  const results = [];
  for (const c of claims) {
    if (c.kind === 'plain' && !ents.length) continue;
    let status = 'none';
    let note = 'Not something this data covers.';
    const scale = (v) => v / divisor;
    // value of a named entity
    const tryEntities = ents.length ? ents : [];
    // Ranks belong to the sentence's subject: the first entity named in the
    // claim's sentence (or the one before), else the scene's highlight.
    const sentStart = Math.max(0, ...[...text.slice(0, c.at).matchAll(/[.!?]\s/g)].map((m) => m.index + 1));
    const prevStart = Math.max(0, ...[...text.slice(0, Math.max(0, sentStart - 1)).matchAll(/[.!?]\s/g)].map((m) => m.index + 1));
    const subjectOf = mentions.find((m) => m.at >= sentStart && m.at < c.at)?.name
      ?? mentions.find((m) => m.at >= prevStart && m.at < sentStart)?.name ?? implicit;
    const rankEntities = subjectOf ? [subjectOf] : [];
    outer: for (const y of yearsToTry) {
      for (const e of c.kind === 'rank' ? rankEntities : tryEntities) {
        const v = valueAt(ds, e, y);
        if (v == null) continue;
        if (c.kind === 'rank') {
          const r = rankAt(ds, e, y);
          if (close(c.value, r, 'rank')) {
            status = 'ok';
            note = `${e} ranks #${r} in ${Math.round(y)}.`;
            break outer;
          }
        } else if (c.kind === 'amount' || c.kind === 'plain') {
          if (close(c.value, scale(v), c.kind)) {
            status = 'ok';
            note = `${e} has ${Number(scale(v).toPrecision(4)).toLocaleString('en-US')} in ${Math.round(y)}.`;
            break outer;
          }
        }
      }
      // ratios between two named entities
      if ((c.kind === 'percent' || c.kind === 'multiple') && tryEntities.length >= 2) {
        const [a, b] = tryEntities;
        const va = valueAt(ds, a, y);
        const vb = valueAt(ds, b, y);
        if (va != null && vb != null && vb !== 0) {
          const ratio = va / vb;
          if (c.kind === 'percent' ? close(c.value, ratio * 100, 'percent') || close(c.value, (1 / ratio) * 100, 'percent') : close(c.value, Math.max(ratio, 1 / ratio), 'multiple')) {
            status = 'ok';
            note = `${a} is ${(ratio * 100).toFixed(0)}% of ${b} in ${Math.round(y)}.`;
            break outer;
          }
        }
      }
    }
    // growth of one entity between two years in the caption
    if (status === 'none' && (c.kind === 'percent' || c.kind === 'multiple') && tryEntities.length && yearsToTry.length >= 2) {
      const e = tryEntities[0];
      const ys = [...yearsToTry].sort((p, q) => p - q);
      for (let i = 0; i < ys.length && status === 'none'; i++) {
        for (let k = i + 1; k < ys.length; k++) {
          const v0 = valueAt(ds, e, ys[i]);
          const v1 = valueAt(ds, e, ys[k]);
          if (v0 == null || v1 == null || v0 === 0) continue;
          const change = c.kind === 'percent' ? Math.abs((v1 / v0 - 1) * 100) : v1 / v0;
          if (close(c.value, change, c.kind)) {
            status = 'ok';
            note = `${e} changes by ${c.kind === 'percent' ? `${change.toFixed(0)}%` : `${change.toFixed(1)}×`} from ${Math.round(ys[i])} to ${Math.round(ys[k])}.`;
            break;
          }
        }
      }
    }
    // A rank claim about the entity named just before it, that doesn't hold,
    // is a real problem. (Implicit subjects and later names only confirm.)
    const before = [...mentions].reverse().find((m) => m.at < c.at)?.name ?? null;
    const otherYears = years.some((y) => Math.abs(y.year - at) > 1);
    const namedSubject = subjectOf && subjectOf !== implicit ? subjectOf : null;
    if (status === 'none' && c.kind === 'rank' && namedSubject && !otherYears) {
      const e = namedSubject;
      const r = rankAt(ds, e, Math.round(at));
      if (r != null) {
        status = 'bad';
        note = `The data has ${e} at #${r} in ${Math.round(at)}, not #${c.value}.`;
      }
    }
    // A big amount attached to a named entity, far from the data, is suspicious.
    if (status === 'none' && c.kind === 'amount' && c.value >= 1000 && before && named.length === 1 && !otherYears) {
      const v = valueAt(ds, before, Math.round(at));
      if (v != null && v > 0) {
        const ratio = c.value / scale(v);
        if (ratio > 1.25 || ratio < 0.8) {
          status = 'bad';
          note = `The data has ${before} at ${Number(scale(v).toPrecision(4)).toLocaleString('en-US')} in ${Math.round(at)}.`;
        }
      }
    }
    results.push({ raw: c.raw, kind: c.kind, status, note });
  }
  const statuses = results.map((r) => r.status);
  const status = !results.length ? 'none'
    : statuses.includes('bad') ? 'bad'
      : statuses.every((x) => x === 'ok') ? 'ok'
        : statuses.includes('ok') ? 'mixed' : 'none';
  return { status, claims: results };
}

/** Check every caption in a story's data scenes. */
export function checkStory(spec) {
  const out = [];
  (spec.scenes ?? []).forEach((s, i) => {
    const ds = spec.datasets?.[s.data];
    if (!ds || !Array.isArray(s.captions)) return;
    const divisor = s.valueFormat?.divide ?? 1;
    const subject = s.highlight ?? s.pin ?? null;
    s.captions.forEach((c, j) => out.push({ scene: i, caption: j, text: c.text, ...checkCaption(c, ds, { divisor, subject }) }));
  });
  return out;
}
