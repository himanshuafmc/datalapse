// Number formats, described as JSON so a story spec stays plain data.
//
// Named formats reproduce engine.py exactly (fmt_money, fmt_count, ...).
// "fixed", "general" and "piecewise" cover the custom lambdas the stories
// used, e.g. f"{v:,.0f} TWh" or f"{v / 1000:.1f} Gt".
//
// Spec examples:
//   { "type": "money" }                       -> $37.0B
//   { "type": "count" }                       -> 1.43 B
//   { "type": "fixed", "digits": 1, "suffix": "%" }
//   { "type": "fixed", "digits": 2, "divide": 1e9, "suffix": " B" }
//   { "type": "piecewise", "cases": [ { "if": { "gte": 1000 }, "format": {...} } ], "else": {...} }
//   { "type": "indian", "currency": "₹" }     -> ₹1.24 lakh cr

import { pyFixed, pyGeneral, addIndianCommas } from './pymath.js';

export function sig(v, d = 3) {
  if (v === 0) return '0';
  const digits = Math.max(0, d - 1 - Math.floor(Math.log10(Math.abs(v))));
  return pyFixed(v, digits, true);
}

export function fmtMoney(v, currency = '$') {
  v = Number(v);
  for (const [div, suf] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (Math.abs(v) >= div) return `${currency}${sig(v / div)}${suf}`;
  }
  return `${currency}${pyFixed(v, 0, true)}`;
}

export function fmtCount(v) {
  v = Number(v);
  for (const [div, suf] of [[1e9, ' B'], [1e6, ' M'], [1e3, ' K']]) {
    if (Math.abs(v) >= div) return `${sig(v / div)}${suf}`;
  }
  return pyFixed(v, 0, true);
}

export function fmtDollarsFull(v, currency = '$') {
  v = Number(v);
  if (v >= 1e6) return `${currency}${pyFixed(v / 1e6, 1, true)} million`;
  return `${currency}${pyFixed(v, 0, true)}`;
}

function stripZeros(s) {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

export function tickFmtMoney(v, currency = '$') {
  if (v === 0) return '0';
  for (const [div, suf] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (Math.abs(v) >= div) return `${currency}${stripZeros(pyFixed(v / div, 1))}${suf}`;
  }
  return `${currency}${pyFixed(v, 0, true)}`;
}

export function tickFmtCount(v) {
  if (v === 0) return '0';
  for (const [div, suf] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (Math.abs(v) >= div) return `${stripZeros(pyFixed(v / div, 1))}${suf}`;
  }
  return pyFixed(v, 0, true);
}

const INDIAN_UNITS = {
  en: [' lakh cr', ' cr', ' lakh'],
  hi: [' लाख करोड़', ' करोड़', ' लाख'],
  mr: [' लाख कोटी', ' कोटी', ' लाख'],
};

function fmtIndian(v, currency = '₹', tick = false, lang = 'en') {
  v = Number(v);
  if (tick && v === 0) return '0';
  const u = INDIAN_UNITS[lang] ?? INDIAN_UNITS.en;
  const units = [[1e12, u[0]], [1e7, u[1]], [1e5, u[2]]];
  for (const [div, suf] of units) {
    if (Math.abs(v) >= div) {
      const n = tick ? stripZeros(pyFixed(v / div, 1)) : sig(v / div);
      return `${currency}${n}${suf}`;
    }
  }
  return `${currency}${addIndianCommas(pyFixed(v, 0))}`;
}

function test(cond, v) {
  if (!cond) return true;
  if ('lt' in cond && !(v < cond.lt)) return false;
  if ('lte' in cond && !(v <= cond.lte)) return false;
  if ('gt' in cond && !(v > cond.gt)) return false;
  if ('gte' in cond && !(v >= cond.gte)) return false;
  if ('eq' in cond && !(v === cond.eq)) return false;
  if ('absGte' in cond && !(Math.abs(v) >= cond.absGte)) return false;
  return true;
}

function withAffixes(spec, body) {
  let s = `${spec.prefix ?? ''}${body}${spec.suffix ?? ''}`;
  for (const [from, to] of spec.replace ?? []) s = s.split(from).join(to);
  return s;
}

const DEVA = '०१२३४५६७८९';

/** Build a formatter function from a JSON spec. */
export function makeFormatter(spec) {
  if (spec && typeof spec === 'object' && spec.numerals === 'deva') {
    const { numerals, ...rest } = spec;
    const f = makeFormatter(rest);
    return (v) => f(v).replace(/[0-9]/g, (d) => DEVA[d]);
  }
  return makeFormatterInner(spec);
}

function makeFormatterInner(spec) {
  if (spec == null) return (v) => pyFixed(v, 1);
  if (typeof spec === 'string') spec = { type: spec };
  const t = spec.type;
  const cur = spec.currency ?? '$';
  const div = (v) => (spec.divide ? v / spec.divide : spec.multiply ? v * spec.multiply : v);
  switch (t) {
    case 'money':
      return (v) => withAffixes(spec, fmtMoney(div(v), cur));
    case 'count':
      return (v) => withAffixes(spec, fmtCount(div(v)));
    case 'dollarsFull':
      return (v) => withAffixes(spec, fmtDollarsFull(div(v), cur));
    case 'tickMoney':
      return (v) => withAffixes(spec, tickFmtMoney(div(v), cur));
    case 'tickCount':
      return (v) => withAffixes(spec, tickFmtCount(div(v)));
    case 'indian':
      return (v) => withAffixes(spec, fmtIndian(div(v), spec.currency ?? '₹', false, spec.lang));
    case 'tickIndian':
      return (v) => withAffixes(spec, fmtIndian(div(v), spec.currency ?? '₹', true, spec.lang));
    case 'fixed':
      return (v) => {
        let s = pyFixed(div(v), spec.digits ?? 0, !!spec.thousands);
        if (spec.strip) s = stripZeros(s);
        return withAffixes(spec, s);
      };
    case 'general':
      return (v) => withAffixes(spec, pyGeneral(div(v), spec.precision ?? 6));
    case 'text':
      return () => withAffixes(spec, spec.text ?? '');
    case 'piecewise': {
      const cases = (spec.cases ?? []).map((c) => ({ cond: c.if, f: c.text != null ? () => c.text : makeFormatter(c.format) }));
      const fallback = makeFormatter(spec.else ?? { type: 'fixed', digits: 1 });
      return (v) => {
        for (const c of cases) if (test(c.cond, v)) return withAffixes(spec, c.f(v));
        return withAffixes(spec, fallback(v));
      };
    }
    default:
      throw new Error(`Unknown number format "${t}"`);
  }
}

/** Ready-made formats offered in the studio, paired value/tick formats. */
export const FORMAT_PRESETS = {
  money: { label: 'Money ($1.2B)', value: { type: 'money' }, tick: { type: 'tickMoney' } },
  count: { label: 'Count (1.43 B)', value: { type: 'count' }, tick: { type: 'tickCount' } },
  percent: { label: 'Percent (12.3%)', value: { type: 'fixed', digits: 1, suffix: '%' }, tick: { type: 'fixed', digits: 0, suffix: '%' } },
  number: { label: 'Number (12,345)', value: { type: 'fixed', digits: 0, thousands: true }, tick: { type: 'fixed', digits: 0, thousands: true } },
  decimal: { label: 'Decimal (12.3)', value: { type: 'fixed', digits: 1, thousands: true }, tick: { type: 'fixed', digits: 1, thousands: true, strip: true } },
  rupees: { label: 'Rupees (₹4.2 lakh cr)', value: { type: 'indian', currency: '₹' }, tick: { type: 'tickIndian', currency: '₹' } },
};

/** Attach a unit suffix to a preset (e.g. " TWh"), returning [valueSpec, tickSpec]. */
export function presetWithUnit(key, unit) {
  const p = FORMAT_PRESETS[key] ?? FORMAT_PRESETS.decimal;
  if (!unit) return [p.value, p.tick];
  const sfx = unit.startsWith(' ') ? unit : ` ${unit}`;
  return [{ ...p.value, suffix: (p.value.suffix ?? '') + sfx }, p.tick];
}
