// Turn a table into a complete, watchable story: hook, title, the race
// (with captions where the lead changes), and an outro. Every field it
// writes can be edited afterwards in the studio or the JSON editor.

import { FORMAT_PRESETS, makeFormatter } from '../core/format.js';
import { pyFixed } from '../core/pymath.js';
import { countryShare } from './countries.js';
import { findEvents, pickEvents, dramaPace } from './drama.js';

const clampN = (x, a, b) => Math.max(a, Math.min(b, x));

function label(t, mode) {
  if (mode === 'month') {
    const y = Math.floor(t + 1e-9);
    const m = Math.min(11, Math.floor((t - y) * 12 + 1e-6));
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]} ${y}`;
  }
  return String(Math.round(t));
}

function leaderAt(table, k) {
  let best = null;
  let bv = -Infinity;
  table.columns.forEach((c, j) => {
    const v = table.values[j][k];
    if (v != null && v > bv) {
      bv = v;
      best = c;
    }
  });
  return [best, bv];
}

/** Moments worth a caption: changes of #1, and the highlighted entity's best rank. */
export function findMoments(table, { highlight = null, nBars = 10, max = 6 } = {}) {
  const out = [];
  const { index } = table;
  const span = index[index.length - 1] - index[0];
  let prev = null;
  for (let k = 0; k < index.length; k++) {
    const [lead] = leaderAt(table, k);
    if (lead && prev && lead !== prev) out.push({ t: index[k], kind: 'lead', text: `${lead} overtakes ${prev} to take the #1 spot.`, kicker: label(index[k], table.timeMode) });
    if (lead) prev = lead;
  }
  if (highlight && table.columns.includes(highlight)) {
    const j = table.columns.indexOf(highlight);
    let bestRank = Infinity;
    let enteredTop = false;
    for (let k = 0; k < index.length; k++) {
      const v = table.values[j][k];
      if (v == null) continue;
      const rank = 1 + table.values.filter((col) => col[k] != null && col[k] > v).length;
      if (!enteredTop && rank <= nBars && k > 0) {
        enteredTop = true;
        if (rank > 1) out.push({ t: index[k], kind: 'enter', text: `${highlight} enters the top ${nBars}.`, kicker: label(index[k], table.timeMode) });
      }
      if (rank < bestRank && rank <= 3 && k > 0) {
        bestRank = rank;
        if (rank > 1) out.push({ t: index[k], kind: 'rank', text: `${highlight} climbs to #${rank}.`, kicker: label(index[k], table.timeMode) });
      }
    }
  }
  // Keep captions apart: at least 8% of the timeline between two of them.
  out.sort((a, b) => a.t - b.t);
  const gap = span * 0.08;
  const kept = [];
  for (const m of out) {
    if (m.t <= index[0]) continue;
    if (kept.length && m.t - kept[kept.length - 1].t < gap) {
      if (m.kind === 'lead') kept[kept.length - 1] = m; // leadership changes matter most
      continue;
    }
    kept.push(m);
  }
  return kept.slice(0, max);
}

/**
 * Build pace steps: travel the timeline in `seconds`, pausing briefly at each
 * caption so the viewer can read it.
 */
export function paceFor(index, seconds, moments = [], { pause = 1.6, endHold = 4.0 } = {}) {
  const t0 = index[0];
  const t1 = index[index.length - 1];
  const span = Math.max(1e-9, t1 - t0);
  const steps = [{ hold: 1.2 }];
  let at = t0;
  for (const m of moments) {
    if (m.t <= at || m.t >= t1) continue;
    steps.push({ to: m.t, dur: Number(pyFixed(Math.max(0.6, ((m.t - at) / span) * seconds), 2)) });
    steps.push({ hold: pause });
    at = m.t;
  }
  steps.push({ to: t1, dur: Number(pyFixed(Math.max(0.6, ((t1 - at) / span) * seconds), 2)) });
  steps.push({ hold: endHold });
  return { start: t0, lead: 1.0, steps };
}

/**
 * options: { title, subtitle, source, chart: 'barRace'|'lineRace', format (preset key),
 *            unit, highlight, seconds, nBars, brand, theme, id, cumulative }
 */
export function autoStory(table, options = {}) {
  const chart = options.chart ?? (table.columns.length > 8 ? 'barRace' : 'lineRace');
  const preset = FORMAT_PRESETS[options.format] ?? FORMAT_PRESETS.decimal;
  const unit = options.unit ? (options.unit.startsWith(' ') ? options.unit : ` ${options.unit}`) : '';
  const valueFormat = unit ? { ...preset.value, suffix: (preset.value.suffix ?? '') + unit } : preset.value;
  const tickFormat = preset.tick;
  const index = table.index;
  const t0 = index[0];
  const t1 = index[index.length - 1];
  const span = t1 - t0;
  const nBars = options.nBars ?? null;
  const highlight = options.highlight && table.columns.includes(options.highlight) ? options.highlight : null;
  const seconds = options.seconds ?? clampN(Math.round(span * (table.timeMode === 'month' ? 6 : 0.55)), 18, 75);
  const fmt = makeFormatter(valueFormat);
  const events = findEvents(table, { kind: chart === 'lineRace' ? 'line' : 'bar', nBars: nBars ?? 10, highlight, format: fmt });
  const moments = pickEvents(events.filter((e) => e.t < t1 - span * 0.02), { max: 6, span, start: t0 });
  const pace = dramaPace(index, seconds, moments.map((m) => m.t));
  const [firstLead] = leaderAt(table, 0);
  const [lastLead, lastVal] = leaderAt(table, index.length - 1);
  const a = label(t0, table.timeMode);
  const b = label(t1, table.timeMode);
  const title = options.title || 'Who leads the race?';
  const source = options.source ? (/^source/i.test(options.source) ? options.source : `Source: ${options.source}`) : '';
  const captions = moments.map((m) => ({ year: m.t, kicker: m.kicker, text: m.text, dur: 4.5 }));
  captions.push({ year: t1, kicker: b, text: `${lastLead} finishes on top at ${fmt(lastVal)}.`, dur: 4.0 });

  const race = {
    type: chart,
    data: 'main',
    pace,
    title,
    subtitle: options.subtitle ?? '',
    source,
    valueFormat,
    highlight,
    captions,
    chapter: 'The race',
  };
  if (table.timeMode === 'month') race.yearLabel = 'month';
  // Flags make country races easier to follow at a glance.
  if (options.flags ?? countryShare(table.columns) >= 0.5) race.flags = true;
  if (chart === 'barRace') {
    Object.assign(race, { tickFormat, pin: highlight, nBars, minFrac: 0.003 });
  } else {
    // At most 7 lines stay readable: the biggest at the end, plus the highlight.
    const last = index.length - 1;
    const ranked = table.columns
      .map((c, j) => [c, table.values[j].reduce((m, v) => (v != null && v > m ? v : m), -Infinity), table.values[j][last]])
      .sort((x, y) => (y[2] ?? y[1]) - (x[2] ?? x[1]))
      .map((x) => x[0]);
    const series = ranked.slice(0, 7);
    if (highlight && !series.includes(highlight)) series[series.length - 1] = highlight;
    Object.assign(race, { series, yTickFormat: tickFormat, log: !!options.log, markers: [], xMode: 'fixed' });
  }

  const hookLines = firstLead && firstLead !== lastLead
    ? [{ text: `In ${a}, ${firstLead} was on top.`, size: 'big' }, { text: `By ${b}, everything changed.`, size: 'big', color: null }]
    : [{ text: `${span >= 1 ? Math.round(span) + ' years' : 'One race'}. ${table.columns.length} contenders.`, size: 'big' },
      { text: 'Watch who comes out on top.', size: 'small' }];

  return {
    version: 1,
    id: options.id ?? 'my_story',
    fps: 30,
    theme: { name: options.theme ?? 'midnight', brand: options.brand ?? '' },
    credit: true,
    meta: {
      title: `${title} (${a}–${b})`,
      shorts_title: title,
      description: `${title}, from ${a} to ${b}.`,
      sources: options.source ?? '',
      hashtags: ['#dataviz', '#barchartrace'],
      tags: ['data visualization', 'bar chart race'],
      pinned_comment: 'What should we chart next?',
    },
    datasets: { main: { index: table.index, columns: table.columns, values: table.values } },
    scenes: [
      { type: 'hook', lines: hookLines, duration: 4.5, chapter: 'Intro' },
      { type: 'title', title, subtitle: options.subtitle ?? '', span: `${a} – ${b}`, duration: 3.2 },
      race,
      { type: 'outro', question: 'What should we chart next?', sources: options.source ?? '', duration: 6.0, chapter: 'Your turn' },
    ],
  };
}
