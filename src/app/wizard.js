// "New from CSV": upload or paste a table, check how it was read, choose a
// chart, get a complete story to refine.

import { h, $, toast } from './dom.js';
import { tableFromCSV, cumulative, guessFormat } from '../data/csv.js';
import { autoStory } from '../data/autostory.js';
import { FORMAT_PRESETS } from '../core/format.js';
import { suggestNameFixes, applyNameFixes, countryShare } from '../data/countries.js';
import { renderCatalogue } from './online.js';

function sampleCSV(stories) {
  // Real data already in the app: CO2 emissions by country (Our World in Data).
  const st = stories.find((s) => s.id === 'v05_co2_emitters') ?? stories[0];
  const id = Object.keys(st.datasets).find((k) => st.datasets[k].columns.length > 8) ?? Object.keys(st.datasets)[0];
  const d = st.datasets[id];
  const lines = [['Year', ...d.columns].map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')];
  d.index.forEach((y, k) => lines.push([y, ...d.values.map((col) => (col[k] == null ? '' : col[k]))].join(',')));
  return { text: lines.join('\n'), name: 'co2_by_country.csv', source: st.meta?.sources || 'Our World in Data', title: 'The Biggest CO₂ Emitters', format: 'decimal', unit: 'Mt' };
}

export function openWizard({ stories, onCreate, brand }) {
  const dlg = $('#wizard');
  const body = $('#wizard-body', dlg);
  let csvText = '';
  let fileName = '';
  let table = null;
  let shapeOpts = { shape: 'auto' };
  let sample = null;

  const fileInput = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv', id: 'wiz-file', class: 'visually-hidden' });
  const paste = h('textarea', { id: 'wiz-paste', rows: 6, class: 'code', placeholder: 'Year,India,China,USA\n2000,476,1211,10250\n2001,494,1339,10582', spellcheck: false });
  const drop = h('div', { class: 'drop', tabindex: 0, role: 'button', 'aria-label': 'Choose a CSV file' },
    h('strong', {}, 'Drop a CSV file here'), h('span', {}, 'or click to choose one. Excel: File › Save as › CSV.'));
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileInput.click()));
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer.files?.[0];
    if (f) readFile(f);
  });
  fileInput.addEventListener('change', () => fileInput.files[0] && readFile(fileInput.files[0]));
  paste.addEventListener('input', () => {
    csvText = paste.value;
    fileName = 'pasted data';
    sample = null;
    shapeOpts = { shape: 'auto' };
    analyse();
  });

  async function readFile(f) {
    if (f.size > 30e6) return toast('That file is over 30 MB. Keep only the columns you need and try again.', 'error');
    csvText = await f.text();
    fileName = f.name;
    sample = null;
    shapeOpts = { shape: 'auto' };
    paste.value = '';
    analyse();
  }

  const trySample = h('button', {
    type: 'button', class: 'btn ghost small',
    onclick: () => {
      sample = sampleCSV(stories);
      csvText = sample.text;
      fileName = sample.name;
      shapeOpts = { shape: 'auto' };
      analyse();
    },
  }, 'Try sample data (CO₂ by country)');

  const catBox = h('div', { class: 'catalogue', hidden: true });
  const browse = h('button', {
    type: 'button', class: 'btn ghost small', 'aria-expanded': 'false',
    onclick: () => {
      const open = catBox.hidden;
      catBox.hidden = !open;
      browse.setAttribute('aria-expanded', String(open));
      if (open) renderCatalogue(catBox, (pick) => {
        sample = pick;
        csvText = pick.text;
        fileName = pick.name;
        shapeOpts = { shape: 'auto' };
        catBox.hidden = true;
        browse.setAttribute('aria-expanded', 'false');
        analyse();
      });
    },
  }, 'Browse public data (online)');

  const result = h('div', { class: 'wiz-result', 'aria-live': 'polite' });
  const step1 = h('section', { class: 'wiz-step' },
    h('h3', {}, h('span', { class: 'step-no' }, '1'), 'Your data'),
    h('p', { class: 'lede' }, 'One column of years or dates, plus one column per thing that races. Long tables (Year, Country, Value) and World Bank downloads work too. Your file never leaves this device.'),
    drop, fileInput,
    h('details', {}, h('summary', {}, 'Or paste from a spreadsheet'), h('label', { for: 'wiz-paste', class: 'visually-hidden' }, 'Paste CSV'), paste),
    h('div', { class: 'row wrap' }, trySample, browse),
    catBox,
    result);
  body.replaceChildren(step1);

  function analyse() {
    result.replaceChildren();
    if (!csvText.trim()) return;
    try {
      table = tableFromCSV(csvText, shapeOpts);
    } catch (e) {
      table = null;
      result.append(h('p', { class: 'problem' }, e.message));
      return;
    }
    result.append(shapeControls(), nameFixControls(), previewTable(table), storyControls());
  }

  function shapeControls() {
    const shapeSel = h('select', { id: 'wiz-shape' },
      [['auto', 'Detect automatically'], ['wide', 'One column per entity'], ['long', 'Long (date, name, value)'], ['years-as-columns', 'Years across the top']]
        .map(([v, l]) => h('option', { value: v }, l)));
    shapeSel.value = shapeOpts.shape ?? 'auto';
    shapeSel.addEventListener('change', () => {
      shapeOpts = { shape: shapeSel.value };
      analyse();
    });
    const pick = (key, label, options, current) => {
      if (!options?.length) return null;
      const sel = h('select', { id: `wiz-${key}` }, options.map((o) => h('option', { value: o }, o)));
      sel.value = current ?? options[0];
      sel.addEventListener('change', () => {
        shapeOpts = { ...shapeOpts, shape: table.shape, [key]: sel.value };
        analyse();
      });
      return h('div', { class: 'field narrow' }, h('label', { for: sel.id, class: 'field-label' }, label), sel);
    };
    const c = table.choices;
    const n = table.columns.length;
    const span = `${fmtT(table.index[0], table.timeMode)} to ${fmtT(table.index[table.index.length - 1], table.timeMode)}`;
    return h('div', { class: 'wiz-detect' },
      h('p', { class: 'ok' }, `Read ${fileName}: ${n} ${n === 1 ? 'series' : 'series'}, ${table.index.length} time points, ${span}.`),
      ...table.notes.map((t) => h('p', { class: 'hint' }, t)),
      h('div', { class: 'grid-fields' },
        h('div', { class: 'field narrow' }, h('label', { for: 'wiz-shape', class: 'field-label' }, 'Table layout'), shapeSel),
        table.shape !== 'years-as-columns' ? pick('time', 'Time column', c.time, table.time) : null,
        table.shape === 'long' || table.shape === 'years-as-columns' ? pick('entity', 'Names column', c.entity, table.entity) : null,
        table.shape === 'long' ? pick('value', 'Values column', c.value, table.value) : null));
  }

  function nameFixControls() {
    const fixes = suggestNameFixes(table.columns);
    if (!fixes.length) return '';
    const box = h('div', { class: 'fixes' }, h('p', { class: 'field-label' }, 'Suggested name fixes'));
    const checks = fixes.map((f, k) => {
      const cb = h('input', { type: 'checkbox', id: `wiz-fix-${k}`, checked: true });
      const verb = f.kind === 'merge' ? `Merge into "${f.into}"` : f.kind === 'rename' ? `Rename to "${f.into}"` : 'Leave out';
      box.append(h('div', { class: 'field check' }, cb, h('label', { for: cb.id }, h('strong', {}, `${verb}: `), f.reason)));
      return cb;
    });
    table.fixes = () => fixes.filter((_, k) => checks[k].checked);
    return box;
  }

  function previewTable(t) {
    const cols = t.columns.slice(0, 7);
    const rows = [];
    const ks = t.index.length <= 6 ? t.index.map((_, k) => k) : [0, 1, 2, -1, t.index.length - 2, t.index.length - 1];
    for (const k of ks) {
      if (k === -1) {
        rows.push(h('tr', { class: 'gap' }, h('td', { colspan: cols.length + 1 }, '…')));
        continue;
      }
      rows.push(h('tr', {}, h('th', { scope: 'row' }, fmtT(t.index[k], t.timeMode)),
        cols.map((c) => {
          const v = t.values[t.columns.indexOf(c)][k];
          return h('td', {}, v == null ? '–' : Number(v.toPrecision(6)).toLocaleString('en-US'));
        })));
    }
    return h('div', { class: 'table-scroll' },
      h('table', { class: 'preview' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Time'), cols.map((c) => h('th', { scope: 'col' }, c)), t.columns.length > 7 ? h('th', {}, `+${t.columns.length - 7} more`) : null)),
        h('tbody', {}, rows)));
  }

  function storyControls() {
    const many = table.columns.length > 8;
    const chart = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Chart type' });
    let chartType = many ? 'barRace' : 'lineRace';
    const segBtn = (v, l, d) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === chartType), class: 'seg-btn' }, h('strong', {}, l), h('span', {}, d));
      b.addEventListener('click', () => {
        chartType = v;
        for (const x of chart.children) x.setAttribute('aria-checked', String(x === b));
      });
      return b;
    };
    chart.append(segBtn('barRace', 'Bar chart race', 'Ranks change, bars overtake'), segBtn('lineRace', 'Line race', 'Lines grow, up to 7 shown'));
    const fmtGuess = sample?.format ?? guessFormat(csvText, table);
    const title = h('input', { type: 'text', id: 'wiz-title', value: sample?.title ?? titleFrom(fileName) });
    const subtitle = h('input', { type: 'text', id: 'wiz-sub', placeholder: 'e.g. GDP in current US dollars' });
    const source = h('input', { type: 'text', id: 'wiz-source', value: sample?.source ?? '', placeholder: 'e.g. World Bank' });
    const format = h('select', { id: 'wiz-format' }, Object.entries(FORMAT_PRESETS).map(([k, p]) => h('option', { value: k }, p.label)));
    format.value = fmtGuess;
    const unit = h('input', { type: 'text', id: 'wiz-unit', value: sample?.unit ?? '', placeholder: 'e.g. TWh, years, Mt' });
    const highlight = h('select', { id: 'wiz-highlight' }, h('option', { value: '' }, '— None —'), table.columns.map((c) => h('option', { value: c }, c)));
    const india = table.columns.find((c) => /^india$/i.test(c));
    if (india) highlight.value = india;
    const running = h('input', { type: 'checkbox', id: 'wiz-cum' });
    const flagsBox = h('input', { type: 'checkbox', id: 'wiz-flags', checked: countryShare(table.columns) >= 0.5 });
    const span = table.index[table.index.length - 1] - table.index[0];
    const autoSecs = Math.max(18, Math.min(75, Math.round(span * (table.timeMode === 'month' ? 6 : 0.55))));
    const secs = h('input', { type: 'range', id: 'wiz-secs', min: 10, max: 120, step: 1, value: autoSecs });
    const secsOut = h('output', { for: 'wiz-secs' }, `${autoSecs} s`);
    secs.addEventListener('input', () => (secsOut.textContent = `${secs.value} s`));
    const create = h('button', { type: 'button', class: 'btn primary' }, 'Create story');
    create.addEventListener('click', () => {
      const fixed = table.fixes ? applyNameFixes(table, table.fixes()) : table;
      const t = running.checked ? cumulative(fixed) : fixed;
      const spec = autoStory(t, {
        chart: chartType, title: title.value.trim(), subtitle: subtitle.value.trim(), source: source.value.trim(),
        format: format.value, unit: unit.value.trim(), highlight: highlight.value || null, seconds: Number(secs.value),
        brand, flags: flagsBox.checked, id: titleFrom(fileName).toLowerCase().replace(/\W+/g, '_').slice(0, 40) || 'my_story',
      });
      onCreate(spec);
      dlg.close();
    });
    const field = (label, el, hint) => h('div', { class: 'field' }, h('label', { for: el.id, class: 'field-label' }, label), el, hint ? h('p', { class: 'hint' }, hint) : null);
    return h('section', { class: 'wiz-step' },
      h('h3', {}, h('span', { class: 'step-no' }, '2'), 'Your story'),
      chart,
      h('div', { class: 'grid-fields' },
        field('Title', title), field('Subtitle', subtitle), field('Source', source, 'Shown on screen. Credit your data.'),
        field('Numbers look like', format), field('Unit', unit), field('Highlight', highlight, 'Brighter, always on screen in a bar race.'),
        h('div', { class: 'field' }, h('label', { for: 'wiz-secs', class: 'field-label' }, 'Race length'), h('div', { class: 'row' }, secs, secsOut)),
        h('div', { class: 'field check' }, running, h('label', { for: 'wiz-cum' }, 'Show running totals (add each period to the last)')),
        h('div', { class: 'field check' }, flagsBox, h('label', { for: 'wiz-flags' }, 'Show country flags next to the bars'))),
      h('p', { class: 'hint' }, 'You get an opening hook, a title card, the race with captions where the lead changes, and an outro. Everything stays editable.'),
      h('div', { class: 'row end' }, create));
  }

  dlg.showModal();
}

function titleFrom(name) {
  const base = String(name || '').replace(/\.(csv|tsv|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
  if (!base || base === 'pasted data') return 'Who leads the race?';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function fmtT(t, mode) {
  if (mode === 'month') {
    const y = Math.floor(t + 1e-9);
    const m = Math.min(11, Math.floor((t - y) * 12 + 1e-6));
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]} ${y}`;
  }
  return String(Math.round(t * 100) / 100);
}
