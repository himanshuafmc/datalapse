// Country lookups: the many names datasets use for one country, ISO codes,
// continents, and country names in other languages.

import { COUNTRY_ROWS, AGGREGATE_NAMES, CONTINENT_NAMES, LANGS } from './countryData.js';

export { CONTINENT_NAMES, LANGS };

/** Lower-case, accents and punctuation removed: "Côte d'Ivoire" -> "cote d ivoire". */
export function normKey(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const COUNTRIES = COUNTRY_ROWS.map(([a2, a3, n3, continent, names, local]) => ({ a2, a3, n3, continent, name: names[0], names, local }));
const byKey = new Map();
const byCode = new Map();
for (const c of COUNTRIES) {
  for (const n of c.names) if (!byKey.has(normKey(n))) byKey.set(normKey(n), c);
  byCode.set(c.a2, c);
  if (c.a3) byCode.set(c.a3, c);
}
const AGG = new Set(AGGREGATE_NAMES.map(normKey));
const AGG_PATTERN = /\b(income|countries|members|excl|incl|region|regions|total|small states|dividend|ida|ibrd|euro area|oecd|opec|g20|g7|gcp|wb|un)\b/;

/** The country a name or ISO code refers to, or null. */
export function findCountry(name) {
  if (name == null) return null;
  const raw = String(name).trim();
  if (/^[A-Z]{2,3}$/.test(raw) && byCode.has(raw)) return byCode.get(raw);
  return byKey.get(normKey(raw)) ?? null;
}

export function countryByCode(code) {
  return byCode.get(String(code).toUpperCase()) ?? null;
}

/** "World", "High income", "Asia (excl. China)": totals that shouldn't race against countries. */
export function isAggregate(name) {
  const k = normKey(name);
  if (!k) return false;
  if (AGG.has(k)) return true;
  if (findCountry(name)) return false;
  return AGG_PATTERN.test(k);
}

/** A country's name in another language, if known. */
export function countryName(name, lang) {
  const c = findCountry(name);
  if (!c) return null;
  return lang === 'en' ? c.name : c.local[lang] ?? null;
}

export function continentOf(name) {
  return findCountry(name)?.continent ?? null;
}

/** Share of names that are countries (used to decide whether to show flags). */
export function countryShare(names) {
  if (!names.length) return 0;
  return names.filter((n) => findCountry(n)).length / names.length;
}

const SUFFIXES = /\b(inc|incorporated|ltd|limited|corp|corporation|co|company|plc|llc|ag|sa|nv|the|group|holdings)\b/g;

/**
 * Suggest name fixes for a list of column names:
 *  - merge:  several names for one country ("USA", "United States")
 *  - rename: ISO codes to names ("IND" -> "India")
 *  - drop:   totals and regions ("World", "High income")
 *  - merge:  near-identical names ("Apple Inc." and "Apple")
 */
export function suggestNameFixes(columns) {
  const out = [];
  const groups = new Map();
  for (const name of columns) {
    const c = findCountry(name);
    if (c) {
      if (!groups.has(c.a2)) groups.set(c.a2, { country: c, names: [] });
      groups.get(c.a2).names.push(name);
    }
  }
  const handled = new Set();
  for (const { country, names } of groups.values()) {
    if (names.length > 1) {
      const into = names.includes(country.name) ? country.name : names[0];
      out.push({ kind: 'merge', into, from: names.filter((n) => n !== into), reason: `${names.map((n) => `"${n}"`).join(' and ')} are the same country` });
      names.forEach((n) => handled.add(n));
    } else if (/^[A-Z]{2,3}$/.test(names[0]) && !country.names.includes(names[0])) {
      // A bare ISO code ("IND"), not a familiar short name ("UK", "USA").
      out.push({ kind: 'rename', from: names[0], into: country.name, reason: `"${names[0]}" is the code for ${country.name}` });
      handled.add(names[0]);
    }
  }
  const loose = new Map();
  for (const name of columns) {
    if (handled.has(name) || findCountry(name)) continue;
    if (isAggregate(name)) {
      out.push({ kind: 'drop', from: [name], reason: `"${name}" looks like a total or a region, not a single entity` });
      continue;
    }
    const k = normKey(name).replace(SUFFIXES, '').replace(/\s+/g, ' ').trim();
    if (!k) continue;
    if (!loose.has(k)) loose.set(k, []);
    loose.get(k).push(name);
  }
  for (const names of loose.values()) {
    if (names.length > 1) out.push({ kind: 'merge', into: names[0], from: names.slice(1), reason: `${names.map((n) => `"${n}"`).join(' and ')} look like the same name` });
  }
  return out;
}

/**
 * Apply fixes to a table { index, columns, values }. Merged columns take the
 * first non-empty value at each time point.
 */
export function applyNameFixes(table, fixes) {
  let columns = [...table.columns];
  let values = table.values.map((v) => [...v]);
  for (const f of fixes) {
    if (f.kind === 'drop') {
      const keep = columns.map((c) => !f.from.includes(c));
      values = values.filter((_, j) => keep[j]);
      columns = columns.filter((_, j) => keep[j]);
    } else if (f.kind === 'rename') {
      const j = columns.indexOf(f.from);
      if (j >= 0 && !columns.includes(f.into)) columns[j] = f.into;
    } else if (f.kind === 'merge') {
      const j = columns.indexOf(f.into);
      if (j < 0) continue;
      for (const name of f.from) {
        const k = columns.indexOf(name);
        if (k < 0) continue;
        values[j] = values[j].map((v, t) => (v == null ? values[k][t] : v));
        values.splice(k, 1);
        columns.splice(k, 1);
      }
    }
  }
  return { ...table, columns, values };
}

/** Sum countries into continents (for "by continent" stories). */
export function rollUpToContinents(table) {
  const out = new Map();
  const skipped = [];
  table.columns.forEach((name, j) => {
    const cont = continentOf(name);
    if (!cont) {
      skipped.push(name);
      return;
    }
    const label = CONTINENT_NAMES[cont];
    if (!out.has(label)) out.set(label, table.index.map(() => null));
    const acc = out.get(label);
    table.values[j].forEach((v, t) => {
      if (v != null) acc[t] = (acc[t] ?? 0) + v;
    });
  });
  return { table: { ...table, columns: [...out.keys()], values: [...out.values()] }, skipped };
}
