// The data doctor: spot problems in a table and fix them in one click.
// Every transform returns a new table plus a note for the on-screen source
// line, so viewers know what was done to the numbers.

import { findCountry, isAggregate } from './countries.js';
import { POPULATION, US_CPI } from './refData.js';

const copy = (t) => ({ ...t, index: [...t.index], columns: [...t.columns], values: t.values.map((c) => [...c]) });

/** Population (people) of a country in a year, or null (1950-2050). */
export function populationOf(name, year) {
  const c = findCountry(name);
  const s = c && POPULATION.countries[c.a2];
  if (!s) return null;
  const y = Math.round(year);
  if (y < POPULATION.from || y > POPULATION.to) return null;
  const v = s[y - POPULATION.from];
  return v == null ? null : v * POPULATION.unit;
}

/** US CPI-U annual average for a year, or null. */
export function cpiOf(year) {
  const y = Math.floor(year);
  if (y < US_CPI.from || y > US_CPI.to) return null;
  return US_CPI.values[y - US_CPI.from];
}

// ------------------------------------------------------------- diagnosis

/**
 * Problems worth knowing about before animating:
 *  gaps (missing values inside a series), jumps (a 10x step that smells
 *  like a unit change), negatives in a bar race, totals mixed with entities,
 *  very sparse series.
 */
export function diagnose(t) {
  const out = [];
  const n = t.index.length;
  t.columns.forEach((name, j) => {
    const col = t.values[j];
    const present = col.map((v, k) => (v == null ? -1 : k)).filter((k) => k >= 0);
    if (!present.length) {
      out.push({ kind: 'empty', name, text: `${name} has no values.` });
      return;
    }
    const first = present[0];
    const last = present[present.length - 1];
    const inside = last - first + 1 - present.length;
    if (inside > 0) out.push({ kind: 'gap', name, count: inside, text: `${name} has ${inside} missing value${inside > 1 ? 's' : ''} between ${t.index[first]} and ${t.index[last]}.`, fix: 'fillGaps' });
    if (present.length < Math.max(3, n * 0.2)) out.push({ kind: 'sparse', name, text: `${name} has only ${present.length} of ${n} values.` });
    for (let i = 1; i < present.length; i++) {
      const a = col[present[i - 1]];
      const b = col[present[i]];
      if (a > 0 && b > 0) {
        const r = b / a;
        if (r >= 8 || r <= 1 / 8) {
          out.push({ kind: 'jump', name, text: `${name} jumps ${r >= 1 ? `${r.toFixed(0)}×` : `to 1/${(1 / r).toFixed(0)}`} between ${t.index[present[i - 1]]} and ${t.index[present[i]]}. Check for a change of units.` });
          break;
        }
      }
    }
    if (col.some((v) => v != null && v < 0)) out.push({ kind: 'negative', name, text: `${name} has negative values; bars can't show them (use a line race).` });
    if (isAggregate(name)) out.push({ kind: 'aggregate', name, text: `"${name}" looks like a total or a region. Leave it out of a race between single entities.` });
  });
  return out;
}

// ------------------------------------------------------------- transforms

export const TRANSFORMS = {
  perCapita: {
    label: 'Per person',
    hint: 'Divide each country by its population (Gapminder, 1950-2050). Non-countries become empty.',
    apply(t) {
      const out = copy(t);
      let missing = 0;
      out.values = t.values.map((col, j) => col.map((v, k) => {
        if (v == null) return null;
        const p = populationOf(t.columns[j], t.index[k]);
        if (!p) {
          missing++;
          return null;
        }
        return v / p;
      }));
      return { table: out, note: 'Per person (population: Gapminder)', warn: missing ? `${missing} values had no population figure and were left empty.` : null };
    },
  },
  inflation: {
    label: 'Adjust for inflation (US dollars)',
    hint: 'Convert US-dollar values to the prices of the last year, using US consumer prices (CPI-U).',
    apply(t) {
      const out = copy(t);
      const lastYear = Math.min(Math.floor(t.index[t.index.length - 1]), US_CPI.to);
      const base = cpiOf(lastYear);
      out.values = t.values.map((col) => col.map((v, k) => {
        const c = cpiOf(t.index[k]);
        return v == null || !c ? null : (v * base) / c;
      }));
      return { table: out, note: `Adjusted for inflation, ${lastYear} US dollars (US CPI-U)` };
    },
  },
  rolling: {
    label: 'Smooth (rolling average)',
    hint: 'Average each value with its neighbours to calm noisy data.',
    param: { label: 'Periods', value: 3, min: 2, max: 24 },
    apply(t, w = 3) {
      const out = copy(t);
      const half = Math.floor(w / 2);
      out.values = t.values.map((col) => col.map((v, k) => {
        if (v == null) return null;
        let s = 0;
        let n = 0;
        for (let i = k - half; i <= k + (w - 1 - half); i++) {
          if (i >= 0 && i < col.length && col[i] != null) {
            s += col[i];
            n++;
          }
        }
        return n ? s / n : null;
      }));
      return { table: out, note: `${w}-period rolling average` };
    },
  },
  cumulative: {
    label: 'Running total',
    hint: 'Add each period to everything before it (e.g. total emissions since 1850).',
    apply(t) {
      const out = copy(t);
      out.values = t.values.map((col) => {
        let acc = 0;
        let seen = false;
        return col.map((v) => {
          if (v != null) {
            acc += v;
            seen = true;
          }
          return seen ? acc : null;
        });
      });
      return { table: out, note: 'Running total' };
    },
  },
  change: {
    label: 'Change from the year before (%)',
    hint: 'Growth rates instead of levels.',
    apply(t) {
      const out = copy(t);
      out.values = t.values.map((col) => col.map((v, k) => (k > 0 && v != null && col[k - 1] ? (v / col[k - 1] - 1) * 100 : null)));
      return { table: out, note: 'Change on previous period, %', format: 'percent' };
    },
  },
  index100: {
    label: 'Index (first year = 100)',
    hint: 'Compare growth: every series starts at 100.',
    apply(t) {
      const out = copy(t);
      out.values = t.values.map((col) => {
        const base = col.find((v) => v != null && v !== 0);
        return col.map((v) => (v == null || base == null ? null : (v / base) * 100));
      });
      return { table: out, note: 'Index, first year = 100', format: 'decimal' };
    },
  },
  share: {
    label: 'Share of the total (%)',
    hint: 'Each series as a percentage of all of them added up.',
    apply(t) {
      const out = copy(t);
      const totals = t.index.map((_, k) => t.values.reduce((s, col) => s + (col[k] ?? 0), 0));
      out.values = t.values.map((col) => col.map((v, k) => (v == null || !totals[k] ? null : (v / totals[k]) * 100)));
      return { table: out, note: 'Share of total, %', format: 'percent' };
    },
  },
  scale: {
    label: 'Divide by…',
    hint: 'Change units, e.g. divide by 1,000 to go from kt to Mt.',
    param: { label: 'Divide by', value: 1000, min: 0.000001, max: 1e12 },
    apply(t, d = 1000) {
      const out = copy(t);
      out.values = t.values.map((col) => col.map((v) => (v == null ? null : v / d)));
      return { table: out, note: null };
    },
  },
  fillGaps: {
    label: 'Fill gaps',
    hint: 'Draw a straight line across missing values inside each series (not before its first or after its last value).',
    apply(t) {
      const out = copy(t);
      let filled = 0;
      out.values = t.values.map((col) => {
        const c = [...col];
        let last = -1;
        for (let k = 0; k < c.length; k++) {
          if (c[k] == null) continue;
          if (last >= 0 && k - last > 1) {
            for (let i = last + 1; i < k; i++) {
              const f = (t.index[i] - t.index[last]) / (t.index[k] - t.index[last]);
              c[i] = c[last] + f * (c[k] - c[last]);
              filled++;
            }
          }
          last = k;
        }
        return c;
      });
      return { table: out, note: filled ? 'Gaps filled by straight-line interpolation' : null, warn: filled ? null : 'No gaps to fill.' };
    },
  },
  dropAggregates: {
    label: 'Leave out totals and regions',
    hint: 'Remove World, income groups, continents and similar.',
    apply(t) {
      const keep = t.columns.map((c) => !isAggregate(c));
      const out = { ...t, columns: t.columns.filter((_, j) => keep[j]), values: t.values.filter((_, j) => keep[j]) };
      const n = t.columns.length - out.columns.length;
      return { table: out, note: null, warn: n ? null : 'No totals or regions found.' };
    },
  },
};

/** Apply a transform; returns { table, note, warn, format }. */
export function transform(t, key, param) {
  const tr = TRANSFORMS[key];
  if (!tr) throw new Error(`Unknown transform "${key}"`);
  return tr.apply(t, param ?? tr.param?.value);
}
