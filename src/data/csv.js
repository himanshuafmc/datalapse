// CSV import: parse a spreadsheet export, work out its shape and turn it into
// a dataset { index, columns, values } that scenes can animate.
//
// Shapes understood:
//   wide   - one row per year, one column per entity    (Year, India, China, ...)
//   long   - one row per year and entity                 (Year, Country, GDP)
//   years-as-columns - one row per entity, years across  (World Bank downloads)

const MISSING = /^(|na|n\/a|nan|null|none|-|–|—|\.\.|\?|x)$/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** RFC 4180 CSV parser with delimiter detection (comma, semicolon, tab). */
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.split('\n').map((ln) => {
      let n = 0;
      let q = false;
      for (const ch of ln) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    }).filter((n) => n > 0);
    if (!counts.length) continue;
    // Prefer delimiters that appear consistently across lines.
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const score = counts.filter((n) => n === mode).length * 10 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

const MULT = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12, tn: 1e12, lakh: 1e5, lac: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

/**
 * Parse a number the way people type them in spreadsheets: "1,234.5",
 * "1,23,456" (Indian grouping), "1.234,5" (European), "$3.7T", "12%",
 * "(450)" for negatives, "4.2 cr". Returns null for blanks and markers like "..".
 */
export function parseNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (MISSING.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^[+]/, '').replace(/[$€£¥₹%\s  ']/g, '').replace(/^(usd|inr|eur|gbp|rs\.?)/i, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  let mult = 1;
  const suf = s.match(/^(.*?\d)([a-z]+)$/i);
  if (suf && MULT[suf[2].toLowerCase()] && !/e[+-]?$/i.test(suf[1])) {
    mult = MULT[suf[2].toLowerCase()];
    s = suf[1];
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  // European grouping only when unambiguous: "1.234.567" or "1.234,5".
  // A single dot ("2.327") is a decimal point.
  else if (/^\d{1,3}(\.\d{3}){2,}(,\d+)?$/.test(s) || /^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const v = Number(s) * mult;
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

function daysInYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

function fracYear(y, m = 1, d = 1) {
  const start = Date.UTC(y, 0, 1);
  const t = Date.UTC(y, m - 1, d);
  return y + (t - start) / 86400000 / daysInYear(y);
}

const FY_RE = /^(?:fy\s*)?(\d{4})[-/](\d{2})$/i;

/** True when every cell is a financial year like "2011-12" (read as 2011, not December). */
export function isFinancialYears(cells) {
  const v = cells.map((c) => String(c ?? '').trim()).filter((c) => c && !MISSING.test(c));
  return v.length > 0 && v.every((c) => {
    const m = c.match(FY_RE);
    return m && (Number(m[1]) + 1) % 100 === Number(m[2]);
  });
}

/** Months sit at exact twelfths of a year, so labels read back exactly. */
function monthYear(y, m) {
  return y + (m - 1) / 12;
}

/**
 * Parse a time cell into a (fractional) year. Returns { v, unit } or null.
 * unit is 'year', 'month' or 'day' (how fine the cell was).
 */
export function parseTime(raw, fy = false) {
  if (raw == null) return null;
  const s = String(raw).trim();
  let m;
  if (fy && (m = s.match(FY_RE))) return { v: Number(m[1]), unit: 'year' };
  if ((m = s.match(/^(\d{4})(?:\.0+)?$/))) {
    const y = Number(m[1]);
    return y >= 1000 && y <= 2200 ? { v: y, unit: 'year' } : null;
  }
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[ T].*)?$/))) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return m[3] ? { v: fracYear(y, mo, Number(m[3])), unit: 'day' } : { v: monthYear(y, mo), unit: 'month' };
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    // dd/mm/yyyy (India, UK, most of the world); fall back to mm/dd when dd > 12 is impossible
    let d = Number(m[1]);
    let mo = Number(m[2]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (mo < 1 || mo > 12) return null;
    return { v: fracYear(Number(m[3]), mo, d), unit: 'day' };
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) {
    const mo = Number(m[1]);
    return mo >= 1 && mo <= 12 ? { v: monthYear(Number(m[2]), mo), unit: 'month' } : null;
  }
  if ((m = s.match(/^([a-z]{3})[a-z]*[-\s,.']*(\d{2}|\d{4})$/i))) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    if (mo < 0) return null;
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return { v: monthYear(y, mo + 1), unit: 'month' };
  }
  if ((m = s.match(/^(?:q([1-4])[-\s]*(\d{4})|(\d{4})[-\s]*q([1-4]))$/i))) {
    const q = Number(m[1] ?? m[4]);
    const y = Number(m[2] ?? m[3]);
    return { v: monthYear(y, (q - 1) * 3 + 1), unit: 'month' };
  }
  if ((m = s.match(/^(?:fy\s*)?(\d{4})[-/](\d{2})$/i))) {
    // Financial year "2019-20" -> 2019 (start year)
    const a = Number(m[1]);
    if ((a + 1) % 100 === Number(m[2])) return { v: a, unit: 'year' };
  }
  return null;
}

function share(cells, fn) {
  const vals = cells.filter((c) => !MISSING.test(String(c ?? '').trim()));
  if (!vals.length) return 0;
  return vals.filter((c) => fn(c) != null).length / vals.length;
}

function classify(header, rows) {
  return header.map((name, j) => {
    const cells = rows.map((r) => r[j] ?? '');
    const time = share(cells, parseTime);
    const num = share(cells, parseNumber);
    const filled = cells.filter((c) => !MISSING.test(c)).length;
    const uniq = new Set(cells).size;
    let kind = 'text';
    const looksYearName = /^(year|yr|date|time|period|month|quarter|fy)$/i.test(name.trim());
    if (time >= 0.95 && (looksYearName || num < 0.95 || j === 0)) kind = 'time';
    else if (num >= 0.9) kind = 'number';
    return { name, j, kind, time, num, filled, uniq };
  });
}

function findHeaderRow(rows) {
  // Skip title lines above the table (World Bank files start with 4 of them).
  const widths = rows.slice(0, 50).map((r) => r.filter((c) => c !== '').length);
  const maxW = Math.max(...widths);
  return Math.max(0, widths.findIndex((w) => w >= Math.max(2, maxW * 0.6)));
}

function uniqueNames(names) {
  const seen = new Map();
  return names.map((n, k) => {
    let base = n || `Column ${k + 1}`;
    if (!seen.has(base)) {
      seen.set(base, 1);
      return base;
    }
    const c = seen.get(base) + 1;
    seen.set(base, c);
    return `${base} (${c})`;
  });
}

function finish(points, columns, unitSet, notes, meta) {
  const index = [...points.keys()].sort((a, b) => a - b);
  const values = columns.map((c) => index.map((t) => {
    const v = points.get(t).get(c);
    return v == null ? null : v;
  }));
  // Drop entities with no data at all.
  const keep = columns.map((_, k) => values[k].some((v) => v != null));
  const cols = columns.filter((_, k) => keep[k]);
  const vals = values.filter((_, k) => keep[k]);
  const dropped = columns.length - cols.length;
  if (dropped) notes.push(`${dropped} column${dropped > 1 ? 's were' : ' was'} empty and left out.`);
  const unit = unitSet.has('day') ? 'day' : unitSet.has('month') ? 'month' : 'year';
  return { index, columns: cols, values: vals, timeMode: unit === 'year' ? 'year' : 'month', notes, ...meta };
}

/**
 * Turn CSV text into a dataset.
 * options: { shape: 'auto'|'wide'|'long'|'years-as-columns', time, entity, value, aggregate: 'sum'|'last' }
 * Returns { index, columns, values, timeMode, shape, header, choices, notes }.
 */
export function tableFromCSV(text, options = {}) {
  const all = parseCSV(text);
  if (all.length < 2) throw new Error('The file needs a header row and at least one row of data.');
  const h = findHeaderRow(all);
  const header = uniqueNames(all[h].map((c) => c.trim()));
  const rows = all.slice(h + 1).filter((r) => r.length > 1 || r[0] !== '');
  if (!rows.length) throw new Error('No data rows found under the header.');
  const info = classify(header, rows);
  const notes = [];
  const timeCols = info.filter((c) => c.kind === 'time');
  const numCols = info.filter((c) => c.kind === 'number');
  const textCols = info.filter((c) => c.kind === 'text');
  const fyHeader = isFinancialYears(header.filter((c) => FY_RE.test(c))) && header.filter((c) => FY_RE.test(c)).length >= 2;
  const headerTimes = header.map((c) => parseTime(c, fyHeader));
  const yearHeaders = headerTimes.filter(Boolean).length;
  const choices = {
    time: timeCols.map((c) => c.name),
    entity: textCols.map((c) => c.name),
    value: numCols.map((c) => c.name),
  };

  let shape = options.shape ?? 'auto';
  if (shape === 'auto') {
    if (yearHeaders >= 3 && yearHeaders >= header.length * 0.5) shape = 'years-as-columns';
    else if (timeCols.length && textCols.length && numCols.length) shape = 'long';
    else if (timeCols.length && numCols.length) shape = 'wide';
    else if (yearHeaders >= 2) shape = 'years-as-columns';
    else {
      throw new Error('Could not find a time column (years or dates). Add a column like "Year" with values such as 2001, 2002, ...');
    }
  }
  const agg = options.aggregate ?? 'sum';
  const add = (points, t, name, v, unitSet, unit) => {
    if (v == null) return false;
    if (!points.has(t)) points.set(t, new Map());
    const m = points.get(t);
    unitSet.add(unit);
    if (m.has(name) && m.get(name) != null) {
      m.set(name, agg === 'sum' ? m.get(name) + v : v);
      return true;
    }
    m.set(name, v);
    return false;
  };

  if (shape === 'years-as-columns') {
    const entityCol = options.entity ? header.indexOf(options.entity) : header.findIndex((_, j) => !headerTimes[j]);
    if (entityCol < 0) throw new Error('Could not find the column with entity names.');
    const points = new Map();
    const unitSet = new Set();
    const names = [];
    let dup = 0;
    for (const r of rows) {
      const name = r[entityCol];
      if (!name) continue;
      if (!names.includes(name)) names.push(name);
      header.forEach((_, j) => {
        const ht = headerTimes[j];
        if (ht && add(points, ht.v, name, parseNumber(r[j]), unitSet, ht.unit)) dup++;
      });
    }
    if (dup) notes.push(`${dup} repeated cells were ${agg === 'sum' ? 'added together' : 'replaced by the last one'}.`);
    return finish(points, names, unitSet, notes, { shape, header, choices: { ...choices, entity: header.filter((_, j) => !headerTimes[j]) }, entity: header[entityCol] });
  }

  const timeName = options.time ?? choices.time[0];
  const tj = header.indexOf(timeName);
  if (tj < 0) throw new Error('Pick the column that holds the years or dates.');
  const fy = isFinancialYears(rows.map((r) => r[tj]));
  if (fy) notes.push('Financial years such as 2011-12 are placed at their first year (2011).');
  const readTime = (c) => parseTime(c, fy);

  if (shape === 'long') {
    const ej = header.indexOf(options.entity ?? choices.entity[0]);
    const vj = header.indexOf(options.value ?? choices.value[choices.value.length - 1]);
    if (ej < 0 || vj < 0) throw new Error('Pick the column with names (e.g. Country) and the column with values.');
    const points = new Map();
    const unitSet = new Set();
    const names = [];
    let dup = 0;
    let badTime = 0;
    for (const r of rows) {
      const t = readTime(r[tj]);
      if (!t) {
        badTime++;
        continue;
      }
      const name = r[ej];
      if (!name) continue;
      if (!names.includes(name)) names.push(name);
      if (add(points, t.v, name, parseNumber(r[vj]), unitSet, t.unit)) dup++;
    }
    if (badTime) notes.push(`${badTime} row${badTime > 1 ? 's' : ''} without a readable date ${badTime > 1 ? 'were' : 'was'} skipped.`);
    if (dup) notes.push(`${dup} rows shared a date and name; their values were ${agg === 'sum' ? 'added together' : 'replaced by the last one'}.`);
    return finish(points, names, unitSet, notes, { shape, header, choices, time: timeName, entity: header[ej], value: header[vj] });
  }

  // wide
  const valueCols = (options.columns ?? numCols.map((c) => c.name)).filter((n) => n !== timeName);
  if (!valueCols.length) throw new Error('No numeric columns found next to the time column.');
  const points = new Map();
  const unitSet = new Set();
  let badTime = 0;
  let dup = 0;
  for (const r of rows) {
    const t = readTime(r[tj]);
    if (!t) {
      badTime++;
      continue;
    }
    for (const name of valueCols) {
      if (add(points, t.v, name, parseNumber(r[header.indexOf(name)]), unitSet, t.unit)) dup++;
    }
  }
  if (badTime) notes.push(`${badTime} row${badTime > 1 ? 's' : ''} without a readable date ${badTime > 1 ? 'were' : 'was'} skipped.`);
  if (dup) notes.push(`${dup} repeated dates were ${agg === 'sum' ? 'added together' : 'replaced by the last one'}.`);
  return finish(points, valueCols, unitSet, notes, { shape, header, choices, time: timeName });
}

/** Running totals per column (for "how it added up" stories, e.g. spending). */
export function cumulative(table) {
  return {
    ...table,
    values: table.values.map((col) => {
      let acc = 0;
      let seen = false;
      return col.map((v) => {
        if (v != null) {
          acc += v;
          seen = true;
        }
        return seen ? acc : null;
      });
    }),
  };
}

/** Guess a number format preset from column names and raw cells. */
export function guessFormat(text, table) {
  const head = (table.header ?? []).join(' ') + ' ' + (table.value ?? '');
  const sample = String(text).slice(0, 20000);
  if (/₹|\binr\b|rupee|lakh|crore/i.test(sample)) return 'rupees';
  if (/\$|€|£|usd|gdp|revenue|sales|income|price|market cap|dollars?/i.test(head + sample.slice(0, 2000))) return 'money';
  if (/%|percent|share|rate\b/i.test(head)) return 'percent';
  const all = table.values.flat().filter((v) => v != null);
  const max = Math.max(...all.map(Math.abs));
  if (/population|people|users|count|number of/i.test(head) || max >= 1e5) return 'count';
  const decimals = all.some((v) => !Number.isInteger(v));
  return decimals ? 'decimal' : 'number';
}
