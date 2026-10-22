// Public data catalogue: well-known indicators from the World Bank, Our
// World in Data and Gapminder, fetched on request (only when online data is
// turned on) and turned into a table the CSV wizard understands.

import { onlineFetch } from './hosts.js';
import { findCountry } from '../data/countries.js';

const WB = (id, title, topic, code, format, unit = '') => ({ id, title, topic, source: 'World Bank', api: 'wb', code, format, unit });
const OWID = (id, title, topic, slug, format, unit = '', extra = {}) => ({ id, title, topic, source: 'Our World in Data', api: 'owid', slug, format, unit, ...extra });
const GM = (id, title, topic, file, format, unit = '') => ({ id, title, topic, source: 'Gapminder', api: 'gm', file, format, unit });

export const CATALOGUE = [
  WB('wb-gdp', 'GDP (current US$)', 'Economy', 'NY.GDP.MKTP.CD', 'money'),
  WB('wb-gdppc', 'GDP per person (current US$)', 'Economy', 'NY.GDP.PCAP.CD', 'money'),
  WB('wb-exports', 'Exports of goods and services (US$)', 'Economy', 'NE.EXP.GNFS.CD', 'money'),
  WB('wb-military', 'Military spending (current US$)', 'Economy', 'MS.MIL.XPND.CD', 'money'),
  WB('wb-tourism', 'International tourist arrivals', 'Economy', 'ST.INT.ARVL', 'count'),
  OWID('owid-gdppc', 'GDP per person, adjusted for prices (int. $)', 'Economy', 'gdp-per-capita-worldbank', 'money'),
  GM('gm-income', 'Income per person since 1800 (Gapminder, PPP $)', 'Economy', 'income_per_person_long_series', 'money'),
  WB('wb-pop', 'Population', 'People', 'SP.POP.TOTL', 'count'),
  OWID('owid-pop', 'Population since 1800, with UN projections', 'People', 'population', 'count', '', { from: 1800 }),
  GM('gm-pop', 'Population 1800 to 2100 (Gapminder)', 'People', 'total_population_with_projections', 'count'),
  WB('wb-urban', 'People living in cities (%)', 'People', 'SP.URB.TOTL.IN.ZS', 'percent'),
  WB('wb-fert', 'Births per woman', 'People', 'SP.DYN.TFRT.IN', 'decimal'),
  WB('wb-life', 'Life expectancy at birth', 'Health', 'SP.DYN.LE00.IN', 'decimal', 'years'),
  OWID('owid-life', 'Life expectancy since 1800', 'Health', 'life-expectancy', 'decimal', 'years', { from: 1800 }),
  WB('wb-u5', 'Under-5 deaths per 1,000 births', 'Health', 'SH.DYN.MORT', 'number'),
  OWID('owid-u5', 'Children dying before age 5 (%)', 'Health', 'child-mortality', 'percent'),
  GM('gm-sugar', 'Sugar eaten per person (grams a day)', 'Health', 'sugar_per_person_g_per_day', 'number', 'g'),
  GM('gm-alcohol', 'Alcohol per adult (litres a year)', 'Health', 'alcohol_consumption_per_adult_15plus_litres', 'decimal', 'L'),
  WB('wb-internet', 'Internet users (% of people)', 'Technology', 'IT.NET.USER.ZS', 'percent'),
  OWID('owid-internet', 'Share of people online (%)', 'Technology', 'share-of-individuals-using-the-internet', 'percent'),
  WB('wb-mobile', 'Mobile phone subscriptions', 'Technology', 'IT.CEL.SETS', 'count'),
  WB('wb-elec', 'Access to electricity (% of people)', 'Energy', 'EG.ELC.ACCS.ZS', 'percent'),
  OWID('owid-renew', 'Electricity from renewables (%)', 'Energy', 'share-electricity-renewables', 'percent'),
  OWID('owid-co2', 'CO2 emissions per year', 'Climate', 'annual-co2-emissions-per-country', 'decimal', 'Mt', { scale: 1e-6 }),
  OWID('owid-co2pc', 'CO2 per person (tonnes)', 'Climate', 'co-emissions-per-capita', 'decimal', 't'),
  GM('gm-forest', 'Forest cover (% of land)', 'Climate', 'forest_coverage_percent', 'percent'),
  GM('gm-murder', 'Murders per 100,000 people', 'Society', 'murder_per_100000_people', 'decimal'),
];

export const TOPICS = [...new Set(CATALOGUE.map((c) => c.topic))];

export function searchCatalogue(q, topic = '') {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return CATALOGUE.filter((c) => (!topic || c.topic === topic) && words.every((w) => `${c.title} ${c.topic} ${c.source}`.toLowerCase().includes(w)));
}

/** Country name for an ISO code (any case), or null for regions and groups. */
function countryOf(code) {
  if (!code) return null;
  const c = findCountry(String(code).toUpperCase());
  return c ? c.name : null;
}

/**
 * Rows [name, year, value] -> a wide table { index, columns, values },
 * keeping years most countries report and (optionally) the biggest countries.
 */
export function rowsToTable(rows, { keep = 40, from = null } = {}) {
  const byName = new Map();
  const years = new Set();
  for (const [name, year, value] of rows) {
    if (!name || !Number.isFinite(year) || !Number.isFinite(value)) continue;
    if (from != null && year < from) continue;
    if (!byName.has(name)) byName.set(name, new Map());
    byName.get(name).set(year, value);
    years.add(year);
  }
  let index = [...years].sort((a, b) => a - b);
  // Drop years at the edges that fewer than a quarter of countries report.
  const counts = index.map((y) => [...byName.values()].filter((m) => m.has(y)).length);
  const enough = Math.max(1, Math.max(...counts, 0) * 0.25);
  let a = 0;
  let b = index.length - 1;
  while (a < b && counts[a] < enough) a++;
  while (b > a && counts[b] < enough) b--;
  index = index.slice(a, b + 1);
  let names = [...byName.keys()];
  if (keep && names.length > keep) {
    // The countries that are ever among the `keep` largest.
    const best = new Map(names.map((n) => [n, Infinity]));
    for (const y of index) {
      const ranked = names.filter((n) => byName.get(n).has(y)).sort((p, q) => byName.get(q).get(y) - byName.get(p).get(y));
      ranked.forEach((n, r) => best.set(n, Math.min(best.get(n), r)));
    }
    names = names.filter((n) => best.get(n) < keep).sort((p, q) => best.get(p) - best.get(q));
    if (names.length > keep * 2) names = names.slice(0, keep * 2);
  }
  names.sort((p, q) => p.localeCompare(q));
  return { index, columns: names, values: names.map((n) => index.map((y) => byName.get(n).get(y) ?? null)) };
}

export function tableToCSV(t) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const lines = [['Year', ...t.columns].map(q).join(',')];
  t.index.forEach((y, k) => lines.push([y, ...t.values.map((c) => (c[k] == null ? '' : c[k]))].join(',')));
  return lines.join('\n');
}

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Our World in Data grapher CSV: Entity,Code,Year,Value[,...] */
export function parseOWID(text, scale = 1) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [, code, year, value] = parseCSVLine(line);
    if (!code || code.startsWith('OWID')) continue;
    const name = countryOf(code);
    if (name) rows.push([name, Number(year), value === '' ? NaN : Number(value) * scale]);
  }
  return rows;
}

/** Gapminder DDF datapoints CSV: geo,time,value (geo = lowercase ISO3). */
export function parseGapminder(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const [geo, time, value] = line.split(',');
    const name = countryOf(geo);
    if (name) rows.push([name, Number(time), value === '' ? NaN : Number(value)]);
  }
  return rows;
}

/** World Bank API JSON: [meta, [{ countryiso3code, date, value }]] */
export function parseWorldBank(pages) {
  const rows = [];
  for (const page of pages) {
    for (const r of page?.[1] ?? []) {
      const name = countryOf(r.countryiso3code);
      if (name && r.value != null) rows.push([name, Number(r.date), Number(r.value)]);
    }
  }
  return rows;
}

/**
 * Download one entry; resolves to what the CSV wizard takes as a sample:
 * { text, name, title, source, format, unit, table }.
 */
export async function fetchEntry(entry, { keep = 40, onStatus } = {}) {
  let rows;
  if (entry.api === 'wb') {
    const base = `https://api.worldbank.org/v2/country/all/indicator/${encodeURIComponent(entry.code)}?format=json&per_page=20000&date=1960:2030`;
    onStatus?.('Asking the World Bank…');
    const first = await (await onlineFetch(base, 'data')).json();
    const pages = [first];
    const n = Math.min(10, first?.[0]?.pages ?? 1);
    for (let p = 2; p <= n; p++) pages.push(await (await onlineFetch(`${base}&page=${p}`, 'data')).json());
    if (!Array.isArray(first?.[1])) throw new Error(first?.[0]?.message?.[0]?.value ?? 'The World Bank sent no data for this indicator.');
    rows = parseWorldBank(pages);
  } else if (entry.api === 'owid') {
    onStatus?.('Downloading from Our World in Data…');
    const text = await (await onlineFetch(`https://ourworldindata.org/grapher/${encodeURIComponent(entry.slug)}.csv?v=1&csvType=full&useColumnShortNames=false`, 'data')).text();
    rows = parseOWID(text, entry.scale ?? 1);
  } else if (entry.api === 'gm') {
    onStatus?.('Downloading Gapminder data from GitHub…');
    const url = `https://raw.githubusercontent.com/open-numbers/ddf--gapminder--systema_globalis/master/countries-etc-datapoints/ddf--datapoints--${entry.file}--by--geo--time.csv`;
    rows = parseGapminder(await (await onlineFetch(url, 'data')).text());
  } else throw new Error('Unknown data source');
  const table = rowsToTable(rows, { keep, from: entry.from ?? null });
  if (!table.columns.length || table.index.length < 2) throw new Error('That dataset came back empty. Try another one.');
  return {
    text: tableToCSV(table),
    name: `${entry.id}.csv`,
    title: entry.title.replace(/\s*\([^)]*\)\s*$/, ''),
    source: `${entry.source}${entry.api === 'wb' ? ` (${entry.code})` : ''}`,
    format: entry.format,
    unit: entry.unit,
    table,
  };
}
