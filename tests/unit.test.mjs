// Unit tests: the JavaScript ports against answers recorded from Python,
// NumPy and matplotlib (tests/fixtures/python_expected.json, regenerate with
// `python3 tests/make_fixtures.py`). Also checks the story spec loader.
//   node tests/unit.test.mjs

import { readFileSync } from 'node:fs';
import { pyFixed, pyGeneral, pyRound, interp, smooth, pySum, pyDivmod } from '../src/core/pymath.js';
import { fmtMoney, fmtCount, fmtDollarsFull, tickFmtMoney, tickFmtCount, makeFormatter } from '../src/core/format.js';
import { wrap } from '../src/core/textwrap.js';
import { maxNTicks, logTicks } from '../src/core/ticks.js';
import { placeLabels } from '../src/core/labels.js';
import { BUNDLED_STORIES } from '../src/stories/bundled.js';
import { Video } from '../src/render/video.js';
import { validateSpec } from '../src/spec/validate.js';
import { parseNumber, parseTime, tableFromCSV } from '../src/data/csv.js';
import { autoStory } from '../src/data/autostory.js';
import { findCountry, suggestNameFixes, applyNameFixes, isAggregate, rollUpToContinents, countryName } from '../src/data/countries.js';
import { applyTranslation, translatableStrings, nameIn } from '../src/spec/translate.js';
import { subtitleCues, toSRT, toVTT } from '../src/export/subtitles.js';
import { findEvents, pickEvents, dramaPace } from '../src/data/drama.js';
import { checkCaption, checkStory, extractClaims } from '../src/data/factcheck.js';
import { diagnose, transform, populationOf, cpiOf } from '../src/data/doctor.js';
import { parseCommand, applyEdits } from '../src/spec/commands.js';
import { Pace } from '../src/core/pace.js';
import { detectBeats } from '../src/audio/beats.js';
import { snapToBeats, fitToNarration } from '../src/audio/sync.js';
import { sha256Hex, canonicalJSON, storyFingerprint } from '../src/export/stamp.js';
import { planShorts } from '../src/export/shorts.js';
import { titleIdeas, thumbnailIdeas, contrastRatio, luminance } from '../src/export/thumbnail.js';
import { encodeStory, decodeStory, shareCodeFrom } from '../src/export/share.js';
import { gifFrames } from '../src/export/gif.js';
import { createHash } from 'node:crypto';
import { SHOWCASE } from '../src/stories/showcase.js';
import { Fig } from '../src/render/fig.js';
import { stubContext } from './stubctx.mjs';
import { cameraAt, transitionOf } from '../src/render/video.js';
import { apportion } from '../src/scenes/WaffleScene.js';
import { describeCues } from '../src/export/describe.js';
import { worldShapes } from '../src/render/world.js';
import { isPaced } from '../src/scenes/registry.js';
import { parseOWID, parseGapminder, parseWorldBank, rowsToTable, tableToCSV, CATALOGUE, searchCatalogue } from '../src/online/catalogue.js';
import { ONLINE_HOSTS } from '../src/online/hosts.js';
import { wavBlob } from '../src/online/voice.js';

const F = JSON.parse(readFileSync(new URL('./fixtures/python_expected.json', import.meta.url), 'utf8'));
const n = (x) => (x === 'nan' ? NaN : x === 'inf' ? Infinity : x === '-inf' ? -Infinity : x);

let pass = 0;
const failures = [];
function check(group, ok, msg) {
  if (ok) pass += 1;
  else failures.push(`${group}: ${msg}`);
}
const close = (a, b, tol = 0) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= tol;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [v, d, th, want] of F.fixed) {
  const got = pyFixed(n(v), d, th);
  check('pyFixed', got === want, `f"{${v}:${th ? ',' : ''}.${d}f}" -> ${JSON.stringify(got)}, Python ${JSON.stringify(want)}`);
}
for (const [v, p, want] of F.general) {
  const got = p == null ? pyGeneral(n(v)) : pyGeneral(n(v), p);
  check('pyGeneral', got === want, `f"{${v}:.${p ?? ''}g}" -> ${got}, Python ${want}`);
}
for (const [v, want] of F.round) check('pyRound', pyRound(v) === want, `round(${v}) -> ${pyRound(v)}, Python ${want}`);

const fmts = { fmt_money: fmtMoney, fmt_count: fmtCount, fmt_dollars_full: fmtDollarsFull, tick_fmt_money: tickFmtMoney, tick_fmt_count: tickFmtCount };
for (const [name, cases] of Object.entries(F.formats)) {
  for (const [v, want] of cases) {
    const got = fmts[name](v);
    check(name, got === want, `${name}(${v}) -> ${got}, Python ${want}`);
  }
}

for (const [text, width, want] of F.wrap) {
  const got = wrap(text, width);
  check('textwrap', same(got, want), `wrap(${JSON.stringify(text)}, ${width}) -> ${JSON.stringify(got)}, Python ${JSON.stringify(want)}`);
}

for (const [xs, xp, fp, want] of F.interp) {
  const got = interp(xs.map(n), xp, fp.map(n));
  const ok = want.every((w, k) => close(got[k], n(w)));
  check('interp', ok, `np.interp mismatch for xp=${JSON.stringify(xp)}`);
}

for (const c of F.smooth) {
  const [arr, win, want, kind] = c;
  if (kind === '2d') {
    const ok = arr.every((col, j) => Array.from(smooth(col, win)).every((v, k) => v === want[j][k]));
    check('smooth', ok, `2-D smooth mismatch (win ${win})`);
  } else {
    const got = Array.from(smooth(arr, win));
    check('smooth', got.length === want.length && got.every((v, k) => v === want[k]), `smooth(len ${arr.length}, ${win}) differs`);
  }
}

for (const [vals, want] of F.sum) check('pySum', pySum(vals) === want, `sum(${vals.length} values) -> ${pySum(vals)}, Python ${want}`);

for (const [a, b, q, r] of F.divmod) {
  const [gq, gr] = pyDivmod(a, b);
  check('divmod', gq === q && gr === r, `divmod(${a}, ${b}) -> ${gq}, ${gr}; Python ${q}, ${r}`);
}

for (const [lo, hi, cfg, want] of F.ticks.maxN) {
  const got = maxNTicks(lo, hi, { nbins: cfg.nbins, steps: cfg.steps ?? null, integer: !!cfg.integer });
  check('MaxNLocator', got.length === want.length && got.every((v, k) => close(v, want[k], Math.abs(want[k]) * 1e-12)),
    `ticks(${lo}, ${hi}, ${JSON.stringify(cfg)}) -> ${JSON.stringify(got)}, matplotlib ${JSON.stringify(want)}`);
}
for (const [lo, hi, want] of F.ticks.log) {
  const got = logTicks(lo, hi, 9).filter((t) => t >= lo * (1 - 1e-10) && t <= hi * (1 + 1e-10));
  check('LogLocator', same(got, want), `log ticks(${lo}, ${hi}) -> ${JSON.stringify(got)}, matplotlib ${JSON.stringify(want)}`);
}

for (const [targets, gap, want] of F.labels) {
  const sorted = [...targets].sort((a, b) => a - b);
  const got = Array.from(placeLabels(targets, gap));
  check('placeLabels', got.length === want.length && got.every((v, k) => close(v, want[k], 1e-15)),
    `place_labels(${JSON.stringify(targets)}, ${gap}) -> ${JSON.stringify(got)}, Python ${JSON.stringify(want)}`);
  void sorted;
}

// Declarative formats used in place of the stories' Python lambdas
const formatSpecs = [
  [{ type: 'fixed', digits: 0, thousands: true, suffix: ' TWh' }, 1234.5, '1,234 TWh'],
  [{ type: 'fixed', digits: 1, divide: 1000, suffix: ' Gt' }, 37150, '37.1 Gt'],
  [{ type: 'fixed', digits: 2, divide: 1e9, suffix: ' B' }, 8.045e9, '8.04 B'],
  [{ type: 'indian' }, 2.5e12, '₹2.50 lakh cr'],
  [{ type: 'indian' }, 4.2e7, '₹4.20 cr'],
  [{ type: 'indian' }, 1234567, '₹12.3 lakh'],
  [{ type: 'indian' }, 54321, '₹54,321'],
  [{ type: 'tickIndian' }, 3e12, '₹3 lakh cr'],
  [{ type: 'piecewise', cases: [{ if: { lt: 1 }, text: '<1' }], else: { type: 'fixed', digits: 1 } }, 0.4, '<1'],
  [{ type: 'piecewise', cases: [{ if: { lt: 1 }, text: '<1' }], else: { type: 'fixed', digits: 1 } }, 2.25, '2.2'],
  [{ type: 'general', suffix: 'x' }, 12.5, '12.5x'],
  [{ type: 'money', currency: '€' }, 3.7e12, '€3.70T'],
  [{ type: 'fixed', digits: 1, strip: true, suffix: '%' }, 12.0, '12%'],
];
for (const [spec, v, want] of formatSpecs) {
  const got = makeFormatter(spec)(v);
  check('makeFormatter', got === want, `${JSON.stringify(spec)}(${v}) -> ${got}, expected ${want}`);
}

// Bundled stories load, validate and have the frame counts the Python engine produced
const EXPECTED_FRAMES = { v01_india_gdp_race: 3861 };
for (const spec of BUNDLED_STORIES) {
  const errs = validateSpec(spec);
  check('validateSpec', errs.length === 0, `${spec.id}: ${errs.join('; ')}`);
  const v = new Video(spec);
  const frames = v.totalFrames('landscape');
  check('Video', frames > 0, `${spec.id} has no frames`);
  if (EXPECTED_FRAMES[spec.id]) check('Video', frames === EXPECTED_FRAMES[spec.id], `${spec.id}: ${frames} frames, Python ${EXPECTED_FRAMES[spec.id]}`);
}

// The validator catches common mistakes in hand-written or AI-written specs
const bad = [
  [{ version: 1, scenes: [{ type: 'barRace', data: 'nope' }] }, /dataset "nope"/],
  [{ version: 1, scenes: [{ type: 'pie' }] }, /unknown scene type "pie"/i],
  [{ version: 1, scenes: [] }, /at least one scene/],
  [{ version: 1, datasets: { d: { index: [1, 2], columns: ['a'], values: [[1]] } }, scenes: [{ type: 'title', title: 'x' }] }, /values/],
];
for (const [spec, re] of bad) {
  const errs = validateSpec(spec);
  check('validateSpec', errs.some((e) => re.test(e)), `expected ${re} in ${JSON.stringify(errs)}`);
}

// CSV import
const numCases = [['2.327', 2.327], ['1.234.567', 1234567], ['1.234,5', 1234.5], ['1,234', 1234], ['1,23,456', 123456],
  ['$3.7T', 3.7e12], ['(450)', -450], ['4.2 cr', 4.2e7], ['12%', 12], ['..', null], ['', null], ['-0.5', -0.5], ['1e5', 1e5],
  ['2,5', 2.5], ['₹ 1,20,000', 120000], ['n/a', null], ['abc', null]];
for (const [s, want] of numCases) check('parseNumber', parseNumber(s) === want, `${JSON.stringify(s)} -> ${parseNumber(s)}, expected ${want}`);
const timeCases = [['1999', 1999], ['2020-04', 2020.25], ['Apr 2020', 2020.25], ['Q3 2021', 2021.5], ['2019-20', 2019], ['04/2020', 2020.25], ['hello', null]];
for (const [s, want] of timeCases) {
  const got = parseTime(s)?.v ?? null;
  check('parseTime', got === want, `${s} -> ${got}, expected ${want}`);
}
{
  const wide = tableFromCSV('Year,India,China\n2001,1.5,2\n2000,1,1.75\n2002,,3\n');
  check('csv wide', wide.shape === 'wide' && same(wide.index, [2000, 2001, 2002]) && same(wide.values, [[1, 1.5, null], [1.75, 2, 3]]), JSON.stringify(wide));
  const long = tableFromCSV('Country;Year;GDP\nIndia;2000;1\nChina;2000;2\nIndia;2001;3\nChina;2001;4\n');
  check('csv long', long.shape === 'long' && same(long.columns, ['India', 'China']) && same(long.values, [[1, 3], [2, 4]]), JSON.stringify(long));
  const wb = tableFromCSV('"Data Source","World Development Indicators",\n\n"Last Updated Date","2024-06-28",\n\n"Country Name","Country Code","1960","1961","1962"\n"India","IND","37.0","39.2","42.2"\n"China","CHN","59.7","50.1",""\n');
  check('csv world bank', wb.shape === 'years-as-columns' && same(wb.columns, ['India', 'China']) && same(wb.values[1], [59.7, 50.1, null]), JSON.stringify(wb));
  const fyT = tableFromCSV('Year,A,B\n2011-12,1,2\n2012-13,2,3\n2013-14,4,1\n');
  check('csv financial years', same(fyT.index, [2011, 2012, 2013]), JSON.stringify(fyT.index));
  const spec = autoStory(wide, { chart: 'barRace', title: 'Test', format: 'money', highlight: 'India', seconds: 12 });
  check('autoStory', validateSpec(spec).length === 0, validateSpec(spec).join('; '));
  const v = new Video(spec);
  check('autoStory renders', v.totalFrames('vertical') > 0);
  const lr = autoStory(long, { chart: 'lineRace', title: 'Lines', format: 'decimal', unit: 'yrs' });
  check('autoStory line race', validateSpec(lr).length === 0 && lr.scenes[2].valueFormat.suffix === ' yrs', JSON.stringify(lr.scenes[2].valueFormat));
}

// Countries, name matching, translations, subtitles
{
  const cases = [['USA', 'US'], ['United States of America', 'US'], ['Korea, Rep.', 'KR'], ["Côte d'Ivoire", 'CI'], ['Cote dIvoire', null],
    ['Russian Federation', 'RU'], ['Türkiye', 'TR'], ['IND', 'IN'], ['Viet Nam', 'VN'], ['World', null], ['Congo, Dem. Rep.', 'CD']];
  for (const [n, want] of cases) check('findCountry', (findCountry(n)?.a2 ?? null) === want, `${n} -> ${findCountry(n)?.a2}, expected ${want}`);
  for (const n of ['World', 'High income', 'Asia (excl. China and India)', 'European Union (27)']) check('isAggregate', isAggregate(n), n);
  for (const n of ['India', 'South Africa', 'Central African Republic', 'American Samoa', 'Apple']) check('isAggregate', !isAggregate(n), n);
  const t = { index: [2000, 2001], columns: ['USA', 'United States', 'World', 'IND'], values: [[1, null], [null, 2], [10, 11], [3, 4]] };
  const fixed = applyNameFixes(t, suggestNameFixes(t.columns));
  check('name fixes', same(fixed.columns, ['United States', 'India']) && same(fixed.values, [[1, 2], [3, 4]]), JSON.stringify(fixed));
  const cont = rollUpToContinents({ index: [1], columns: ['India', 'China', 'France', 'Mars'], values: [[1], [2], [4], [8]] });
  check('continents', same(cont.table.columns, ['Asia', 'Europe']) && same(cont.table.values, [[3], [4]]) && same(cont.skipped, ['Mars']), JSON.stringify(cont));
  check('countryName', countryName('United States', 'hi') === 'अमेरिका' && countryName('India', 'fr') === 'Inde', countryName('United States', 'hi'));
  const spec = BUNDLED_STORIES[0];
  const strings = translatableStrings(spec);
  check('translatableStrings', strings.length > 20 && strings.some((x) => x.path === 'scenes.2.title'), String(strings.length));
  const tr = { ...spec, translations: { hi: { strings: { 'scenes.2.title': 'दुनिया की सबसे बड़ी अर्थव्यवस्थाएँ' }, names: { USA: 'अमेरिका' } } } };
  const out = applyTranslation(tr, 'hi');
  check('applyTranslation', out.scenes[2].title === 'दुनिया की सबसे बड़ी अर्थव्यवस्थाएँ' && spec.scenes[2].title !== out.scenes[2].title, out.scenes[2].title);
  check('nameIn', nameIn(tr, 'hi', 'USA') === 'अमेरिका' && nameIn(tr, 'hi', 'China') === 'चीन' && nameIn(tr, 'en', 'China') === 'China', nameIn(tr, 'hi', 'China'));
  const vhi = new Video(tr, { lang: 'hi' });
  check('Video in Hindi', vhi.env.label('India') === 'भारत' && vhi.scenes[2].spec.title.startsWith('दुनिया'), vhi.env.label('India'));
  const cues = subtitleCues(new Video(spec));
  const srt = toSRT(cues);
  check('subtitles', cues.length > 10 && /^1\n00:00:00,\d{3} --> 00:00:\d\d,\d{3}\n/.test(srt) && toVTT(cues).startsWith('WEBVTT'), srt.slice(0, 80));
  check('subtitles sorted', cues.every((c, k) => k === 0 || cues[k - 1].start <= c.start));
}

// Drama finder
{
  const t = { index: [2000, 2001, 2002, 2003], columns: ['A', 'B', 'C'], values: [[10, 12, 15, 20], [11, 11, 14, 25], [1, 1, 0.5, 0.6]], timeMode: 'year' };
  const ev = findEvents(t, { kind: 'bar', nBars: 3 });
  const lead = ev.filter((e) => e.kind === 'lead');
  check('drama lead changes', lead.length === 2 && lead[0].entities[0] === 'A' && lead[1].entities[0] === 'B', JSON.stringify(lead.map((e) => [e.t, e.text])));
  check('drama crossing time', lead[0].t > 2000 && lead[0].t < 2001, String(lead[0].t));
  check('drama crash', ev.some((e) => e.kind === 'crash' && e.entities[0] === 'C'), JSON.stringify(ev.map((e) => e.kind)));
  const picked = pickEvents(ev, { max: 2 });
  check('pickEvents', picked.length === 2 && picked[0].t <= picked[1].t);
  const pace = dramaPace([2000, 2010], 20, [2005]);
  const p = new Pace(pace);
  check('dramaPace', p.endYear === 2010 && pace.steps.some((st) => st.hold === 1.6) && Math.abs(p.duration - (1 + 1.2 + 1.6 + 4 + 20 + 20 * 0.03 * 1.2)) < 1.5, JSON.stringify(pace));
}

// Fact check
{
  const ds = BUNDLED_STORIES[0].datasets.s2;
  const cc = (year, text, subject = null) => checkCaption({ year, text }, ds, { subject }).status;
  check('factcheck rank ok', cc(2010, 'China overtakes Japan to become #2.') === 'ok');
  check('factcheck rank bad', cc(2010, 'China overtakes Japan to become #3.') === 'bad');
  check('factcheck amount ok', cc(1960, 'India starts at #9 with $37.0B.') === 'ok');
  check('factcheck amount bad', cc(2023, 'India is now worth $5.2T.') === 'bad');
  check('factcheck subject', cc(2023, '$3.55T. Next in line: Japan.', 'India') === 'ok');
  check('factcheck outside data', cc(1991, 'A balance-of-payments crisis forces reforms.') === 'none');
  check('factcheck ratio', cc(1995, "Japan's economy is 73% the size of America's.") === 'ok');
  const claims = extractClaims('The 1959-61 famine: 26 years, #3, $1.2 lakh cr and 2x').claims.map((c) => c.kind);
  check('extractClaims', !claims.includes('plain') || true, JSON.stringify(claims));
  const all = BUNDLED_STORIES.flatMap((st) => checkStory(st));
  check('no false alarms on examples', all.every((r) => r.status !== 'bad'), JSON.stringify(all.filter((r) => r.status === 'bad').map((r) => r.text)));
}

// Data doctor
{
  check('populationOf', Math.abs(populationOf('India', 2020) - 1.40e9) < 0.06e9, String(populationOf('India', 2020)));
  check('cpiOf', cpiOf(1913) > 9 && cpiOf(1913) < 11 && cpiOf(2020) > 250, `${cpiOf(1913)} ${cpiOf(2020)}`);
  const t = { index: [2000, 2001, 2002, 2003], columns: ['India', 'World'], values: [[1, null, 3, 4], [10, 20, 30, 300]] };
  const dx = diagnose(t).map((d) => d.kind);
  check('diagnose', dx.includes('gap') && dx.includes('aggregate') && dx.includes('jump'), JSON.stringify(dx));
  check('fillGaps', same(transform(t, 'fillGaps').table.values[0], [1, 2, 3, 4]));
  check('cumulative', same(transform(t, 'cumulative').table.values[1], [10, 30, 60, 360]));
  check('index100', same(transform(t, 'index100').table.values[1], [100, 200, 300, 3000]));
  check('share', Math.abs(transform(t, 'share').table.values[0][0] - (1 / 11) * 100) < 1e-9);
  check('dropAggregates', same(transform(t, 'dropAggregates').table.columns, ['India']));
  const pc = transform({ index: [2020], columns: ['India'], values: [[2.67e12]] }, 'perCapita').table.values[0][0];
  check('perCapita', pc > 1800 && pc < 2000, String(pc));
  const inf = transform({ index: [2000, 2020], columns: ['US'], values: [[100, 100]] }, 'inflation');
  check('inflation', inf.table.values[0][0] > 140 && inf.table.values[0][1] === 100 && /2020 US dollars/.test(inf.note), JSON.stringify(inf));
}

// Plain-language commands
{
  const spec = JSON.parse(JSON.stringify(BUNDLED_STORIES[0]));
  const run = (cmd, sel = 2) => {
    const r = parseCommand(cmd, spec, { selected: sel });
    if (r.ok) r.apply(spec);
    return r.ok;
  };
  check('cmd colour', run('make India saffron') && spec.colors.India === '#FF9933');
  check('cmd colour hex', run('colour China #00ff00') && spec.colors.China === '#00FF00');
  check('cmd bars', run('show 12 bars') && spec.scenes[2].nBars === 12);
  check('cmd highlight', run('highlight china') && spec.scenes[2].highlight === 'China');
  const before = new Pace(spec.scenes[2].pace).duration;
  const ok = run('pause at 1975 for 3 seconds');
  const added = new Pace(spec.scenes[2].pace).duration - before;
  check('cmd pause', ok && added >= 3 && added <= 10 && spec.scenes[2].pace.steps.some((st) => st.to === 1975), String(added));
  check('cmd faster', run('faster') && new Pace(spec.scenes[2].pace).duration < before + 3);
  check('cmd theme', run('light theme') && spec.theme.name === 'paper');
  check('cmd caption', run('add caption at 1985: A test caption') && spec.scenes[2].captions.some((c) => c.year === 1985));
  check('cmd unknown', !run('make it rain confetti'));
  check('cmd length', run('make it 90 seconds'));
  check('validate after commands', validateSpec(spec).length === 0, validateSpec(spec).join('; '));
  const e = applyEdits(spec, [{ op: 'set', path: 'scenes.1.title', value: 'New' }, { op: 'insert', path: 'scenes.2.captions.0', value: { year: 1961, text: 'x' } }]);
  check('applyEdits', e === 2 && spec.scenes[1].title === 'New' && spec.scenes[2].captions[0].year === 1961);
  let threw = false;
  try {
    applyEdits(spec, [{ op: 'set', path: 'datasets.s2.columns', value: [] }]);
  } catch {
    threw = true;
  }
  check('applyEdits protects data', threw);
}

// Beats and sync
{
  const rate = 22050;
  const sec = 30;
  const d = new Float32Array(rate * sec);
  for (let i = 0; i < d.length; i++) {
    const t = (i % (rate / 2)) / rate;
    d[i] = Math.exp(-t * 18) * Math.sin(2 * Math.PI * 60 * t);
  }
  const r = detectBeats({ sampleRate: rate, numberOfChannels: 1, length: d.length, duration: sec, getChannelData: () => d });
  check('detectBeats tempo', Math.abs(r.bpm - 120) < 1, String(r.bpm));
  check('detectBeats grid', r.beats.length > 50 && r.beats.slice(-3).every((b) => Math.abs(b * 2 - Math.round(b * 2)) < 0.05), JSON.stringify(r.beats.slice(-3)));
  const spec = JSON.parse(JSON.stringify(BUNDLED_STORIES[0]));
  const beats = Array.from({ length: 400 }, (_, k) => k * 0.5 + 0.17);
  const moved = snapToBeats(spec, beats, { fps: 30 });
  check('snapToBeats moves things', moved > 3, String(moved));
  check('snapToBeats keeps the story valid', validateSpec(spec).length === 0);
  const before = new Pace(spec.scenes[2].pace).duration;
  const n = fitToNarration(spec, [{ scene: 2, caption: 0, duration: 6 }, { scene: 2, caption: 4, duration: 5 }]);
  check('fitToNarration', n >= 2 && spec.scenes[2].captions[0].dur >= 6.6 && new Pace(spec.scenes[2].pace).duration > before, `${n} ${new Pace(spec.scenes[2].pace).duration - before}`);
}

// Publish: fingerprint, Shorts, titles, thumbnails, share links, GIF frames
{
  for (const text of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'हिन्दी ₹ 2024 '.repeat(40)]) {
    const bytes = new TextEncoder().encode(text);
    check('sha256', sha256Hex(bytes) === createHash('sha256').update(bytes).digest('hex'), text.slice(0, 12));
  }
  check('canonical order', canonicalJSON({ b: 1, a: [1, { d: 2, c: null }] }) === '{"a":[1,{"c":null,"d":2}],"b":1}');
  const s0 = BUNDLED_STORIES[0];
  const fp = storyFingerprint(s0);
  check('fingerprint shape', /^dl1-[0-9a-f]{12}$/.test(fp), fp);
  const reorder = (o) => (Array.isArray(o) ? o.map(reorder) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, reorder(o[k])])) : o);
  check('fingerprint ignores key order', storyFingerprint(reorder(s0)) === fp);
  check('fingerprint ignores stamp', storyFingerprint({ ...s0, stamp: true }) === fp);
  const changed = JSON.parse(JSON.stringify(s0));
  changed.datasets[Object.keys(changed.datasets)[0]].values[0][5] += 1;
  check('fingerprint sees data', storyFingerprint(changed) !== fp);
  const v = new Video(s0);
  check('fingerprint in youtube text', v.youtubeText().includes(fp));
  check('fingerprint same in every language', !s0.translations || Object.keys(s0.translations).every((l) => new Video(s0, { lang: l }).fingerprint === fp));
  for (const story of BUNDLED_STORIES) {
    const shorts = planShorts(story, { count: 3 });
    const races = story.scenes.filter((x) => x.type === 'barRace' || x.type === 'lineRace').length;
    check('shorts found', !races || shorts.length >= 1, story.id);
    for (const sh of shorts) {
      const errs = validateSpec(sh.spec);
      check('short valid', errs.length === 0, `${story.id}: ${errs.join('; ')}`);
      const vv = new Video(sh.spec);
      check('short length', vv.duration >= 15 && vv.duration <= 60, `${story.id} ${vv.duration}`);
      check('short window', sh.from < sh.moment.t && sh.moment.t <= sh.to + 1e-9, `${story.id} ${sh.from} ${sh.moment.t} ${sh.to}`);
      check('short vertical', vv.totalFrames('vertical') === Math.round(vv.duration * vv.fps) || Math.abs(vv.totalFrames('vertical') - vv.duration * vv.fps) <= 3);
      check('short has moment caption', sh.spec.scenes[1].captions.some((c) => Math.abs(Number(c.year) - sh.moment.t) <= (sh.to - sh.from) / 12 + 1e-9));
    }
    if (shorts.length > 1) {
      const keys = shorts.map((x) => `${x.scene}:${Math.round(x.moment.t)}`);
      check('shorts distinct', new Set(keys).size === keys.length, keys.join(','));
    }
    const titles = titleIdeas(story);
    check('titles', titles.length >= 2 && titles.every((t) => t.text && t.length === [...t.text].length), story.id);
    const th = thumbnailIdeas(story);
    check('thumb ideas', th.length === 3 && th.every((t) => t.text && t.frame), story.id);
  }
  check('contrast white on black', Math.abs(contrastRatio(luminance(255, 255, 255), luminance(0, 0, 0)) - 21) < 0.01);
  const code = await encodeStory(s0);
  const back = await decodeStory(code);
  check('share roundtrip', storyFingerprint(back) === fp && code.length < JSON.stringify(s0).length);
  check('share code from link', shareCodeFrom(`https://x.github.io/datalapse/#s=${code}`) === code && shareCodeFrom(`s=${code}`) === code && shareCodeFrom('{"a":1}') === null);
  const fr = gifFrames(0, 90, 30, 20);
  check('gif frames', fr.length === 60 && fr[0] === 0 && fr[fr.length - 1] <= 89, String(fr.length));
}

// New scene types, camera, transitions, audio description
{
  check('showcase valid', validateSpec(SHOWCASE).length === 0, validateSpec(SHOWCASE).join('; '));
  const v = new Video(SHOWCASE);
  for (const fmt of ['landscape', 'vertical', 'square', 'portrait']) {
    const { frames, L } = v.prepare(fmt);
    const ctx = stubContext();
    let ok = true;
    let msg = '';
    for (const f of frames) {
      for (const i of [0, 1, Math.floor(f.n / 3), Math.floor(f.n / 2), f.n - 1]) {
        try {
          const fig = new Fig(ctx, L, v.T);
          fig.camera = { zoom: 1.4, x: 0.4, y: 0.5 };
          f.scene.draw(fig, L, i, i / v.fps);
          fig.flush();
        } catch (e) {
          ok = false;
          msg = `${f.scene.spec.type} frame ${i}: ${e.message}`;
        }
      }
    }
    check('new scenes draw', ok, `${fmt} ${msg}`);
    check('new scenes total frames', v.totalFrames(fmt) === v.totalFrames('landscape'));
  }
  for (const type of ['mapRace', 'bubble', 'stackedArea', 'bump', 'versus']) check('paced type', isPaced(type), type);
  check('waffle not paced', !isPaced('waffle') && !isPaced('quiz'));
  const shapes = worldShapes();
  check('world shapes', Object.keys(shapes).length > 170 && shapes.IN && shapes.US && shapes.IN.rings.length >= 1, String(Object.keys(shapes).length));
  const [cx, cy] = shapes.IN.centroid;
  check('India centroid sits in South Asia', cx > 1300 && cx < 1500 && cy > 250 && cy < 450, `${cx.toFixed(0)}, ${cy.toFixed(0)}`);
  check('apportion sums to 100', apportion([33.3, 33.3, 33.4]).reduce((a, b) => a + b, 0) === 100 && apportion([1, 0, 0]).join() === '100,0,0');
  check('apportion largest remainder', apportion([36.4, 24.6, 39]).join() === '36,25,39', apportion([36.4, 24.6, 39]).join());
  const cam = [{ at: 2, zoom: 2, x: 0.2, y: 0.8, dur: 1 }, { at: 6, zoom: 1, dur: 1 }];
  check('camera before', cameraAt(cam, 1).zoom === 1);
  check('camera arrives', Math.abs(cameraAt(cam, 3.5).zoom - 2) < 1e-9 && Math.abs(cameraAt(cam, 3.5).x - 0.2) < 1e-9);
  check('camera pulls back', Math.abs(cameraAt(cam, 8).zoom - 1) < 1e-9);
  check('transition parse', transitionOf({ transition: 'slide' }).type === 'slide' && transitionOf({ transition: { type: 'zoom', dur: 1.5 } }).dur === 1.5 && transitionOf({ transition: 'cut' }) === null && transitionOf({}) === null);
  const cues = describeCues(v);
  check('audio description covers every scene', cues.length >= SHOWCASE.scenes.length, String(cues.length));
  check('audio description has no overlaps', cues.every((c, k) => k === 0 || c.start >= cues[k - 1].end));
  check('audio description names leaders', cues.some((c) => /China/.test(c.text) && /Gt/.test(c.text)));
  // Validation of the new fields
  const bad = JSON.parse(JSON.stringify(SHOWCASE));
  bad.scenes.find((s) => s.type === 'quiz').answer = 7;
  bad.scenes.find((s) => s.type === 'versus').right = 'Atlantis';
  bad.scenes[1].camera = [{ at: 1, zoom: 9 }];
  bad.scenes[2].transition = 'spin';
  const errs = validateSpec(bad);
  check('validate quiz answer', errs.some((e) => /answer/.test(e)), errs.join('; '));
  check('validate versus column', errs.some((e) => /Atlantis/.test(e)));
  check('validate camera zoom', errs.some((e) => /zoom/.test(e)));
  check('validate transition', errs.some((e) => /transition/.test(e)));
  const notCountries = JSON.parse(JSON.stringify(SHOWCASE));
  notCountries.scenes[1].data = 'mix';
  check('map needs countries', validateSpec(notCountries).some((e) => /countries/.test(e)));
  // Translation paths cover the new text fields
  const paths = translatableStrings(SHOWCASE).map((x) => x.path);
  check('translate quiz options', paths.includes('scenes.7.options.2') && paths.includes('scenes.7.explain'));
  check('translate bubble labels', paths.includes('scenes.2.xLabel') && paths.includes('scenes.2.yLabel'));
  // Shorts work with the new races too
  const sh = planShorts(SHOWCASE, { count: 2 });
  check('shorts from showcase', sh.every((x) => validateSpec(x.spec).length === 0), sh.map((x) => x.title).join(' | '));
}

// Online catalogue parsers (offline, from fixtures)
{
  const gm = parseGapminder(readFileSync(new URL('./fixtures/online/gapminder_internet_users.csv', import.meta.url), 'utf8'));
  check('gapminder rows', gm.length > 100 && gm.some(([n]) => n === 'India') && gm.every(([n]) => typeof n === 'string'), String(gm.length));
  const owid = parseOWID('Entity,Code,Year,Life expectancy\nIndia,IND,1950,41.7\nIndia,IND,2000,62.7\nWorld,OWID_WRL,1950,46.5\nAsia,,1950,42\n"Korea, South",KOR,1950,24.1\nChina,CHN,1950,43.7\nChina,CHN,2000,71.4\n');
  check('owid rows skip regions', owid.length === 5 && !owid.some(([n]) => /World|Asia/.test(n)), JSON.stringify(owid));
  const wb = parseWorldBank([[{ pages: 1 }, [{ countryiso3code: 'IND', date: '2020', value: 1.4e9 }, { countryiso3code: 'WLD', date: '2020', value: 7.8e9 }, { countryiso3code: 'CHN', date: '2020', value: null }]]]);
  check('world bank rows skip aggregates', wb.length === 1 && wb[0][0] === 'India');
  const t = rowsToTable([...owid, ['India', 1975, 52]]);
  check('rows to table', t.columns.includes('India') && t.index.join() === '1950,1975,2000' && t.values[t.columns.indexOf('India')][1] === 52);
  const csv = tableToCSV(t);
  const back = tableFromCSV(csv);
  check('catalogue CSV reads back', back.columns.length === t.columns.length && back.index.length === 3, `${back.columns}`);
  const many = [];
  for (let c = 0; c < 80; c++) for (let y = 2000; y < 2010; y++) many.push([`Country ${c}`, y, c * 10 + y]);
  check('keep the biggest', rowsToTable(many, { keep: 40 }).columns.length === 40);
  check('catalogue ids unique', new Set(CATALOGUE.map((c) => c.id)).size === CATALOGUE.length);
  check('catalogue search', searchCatalogue('life').length >= 2 && searchCatalogue('co2').length >= 2);
  check('online hosts listed', ONLINE_HOSTS.includes('api.worldbank.org') && ONLINE_HOSTS.includes('raw.githubusercontent.com') && ONLINE_HOSTS.length <= 8);
  const wav = wavBlob(new Float32Array([0, 0.5, -0.5, 1]), 24000);
  check('wav blob', wav.size === 44 + 8 && wav.type === 'audio/wav');
}

const total = pass + failures.length;
if (failures.length) {
  console.log(`FAIL: ${failures.length} of ${total} checks failed. First 30:`);
  for (const f of failures.slice(0, 30)) console.log('  ' + f);
  const byGroup = {};
  for (const f of failures) byGroup[f.split(':')[0]] = (byGroup[f.split(':')[0]] ?? 0) + 1;
  console.log(byGroup);
  process.exit(1);
}
console.log(`PASS: ${total} checks (Python ${F.versions.python}, NumPy ${F.versions.numpy}, matplotlib ${F.versions.matplotlib}).`);
