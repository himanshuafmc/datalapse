// Scene inspector: a form per scene type, built from field descriptions.
// Every input writes straight into the story through the store, so the
// preview updates as you type.

import { h } from './dom.js';
import { FORMAT_PRESETS, makeFormatter } from '../core/format.js';
import { sceneClass } from '../scenes/registry.js';
import { Pace } from '../core/pace.js';
import { findEvents, pickEvents, dramaPace } from '../data/drama.js';

const T = (key, label, o = {}) => ({ kind: 'text', key, label, ...o });
const N = (key, label, o = {}) => ({ kind: 'number', key, label, ...o });

const TEXTS = {
  title: T('title', 'Title'),
  subtitle: T('subtitle', 'Subtitle'),
  source: T('source', 'Source line', { hint: 'Shown small at the bottom. Start with "Source:".' }),
  chapter: T('chapter', 'YouTube chapter', { hint: 'Leave empty for no chapter mark.' }),
};

const FLAGS = { kind: 'check', key: 'flags', label: 'Show flags and pictures (countries get flags; add logos in the Data tab)' };
const YEAR_LABEL = { kind: 'select', key: 'yearLabel', label: 'Date shown', options: [['year', 'Year (2023)'], ['month', 'Month (Mar 2023)']], width: 'narrow' };

const CAPTION_BY_YEAR = {
  kind: 'list', key: 'captions', label: 'Captions', addLabel: 'Add caption', atPlayhead: true,
  item: [N('year', 'Year', { step: 'any', width: 'narrow' }), T('kicker', 'Kicker', { width: 'narrow' }),
    N('dur', 'Seconds', { step: 0.5, min: 0.5, width: 'narrow', placeholder: '5' }), T('text', 'Text', { multiline: true }),
    T('chapter', 'Chapter', { hint: 'Optional YouTube chapter at this caption' })],
  make: (ctx) => ({ year: ctx.playheadYear() ?? ctx.dataStart(), kicker: '', text: 'Write what happened here.', dur: 5 }),
  summary: (c) => `${c.kicker || c.year} · ${c.text ?? ''}`,
  check: true,
};

const MOMENTS = { kind: 'moments', key: 'captions', label: 'Find the story' };

// Motion settings every scene has: how it enters, and camera moves.
const MOTION = [
  { kind: 'select', key: 'transition', label: 'Entrance', options: [['', 'Soft cut (standard)'], ['crossfade', 'Crossfade from the scene before'], ['slide', 'Slide the scene before away'], ['zoom', 'Zoom out of the scene before']] },
  { kind: 'list', key: 'camera', label: 'Camera moves', addLabel: 'Add camera move',
    item: [N('at', 'At (s)', { step: 0.5, min: 0, width: 'narrow' }), N('zoom', 'Zoom', { step: 0.1, min: 1, max: 4, width: 'narrow' }),
      N('x', 'Across (0-1)', { step: 0.05, min: 0, max: 1, width: 'narrow' }), N('y', 'Up (0-1)', { step: 0.05, min: 0, max: 1, width: 'narrow' }),
      N('dur', 'Over (s)', { step: 0.1, min: 0.1, width: 'narrow' })],
    make: (ctx) => ({ at: Math.max(0, Number((ctx.playheadSceneTime() ?? 2).toFixed(1))), zoom: 1.5, x: 0.4, y: 0.55, dur: 1.2 }),
    summary: (c) => `${c.at}s · ${c.zoom ?? 1}× at ${c.x ?? 0.5}, ${c.y ?? 0.5}` },
];
const SPOTLIGHT = { kind: 'list', key: 'spotlight', label: 'Spotlight', addLabel: 'Add spotlight',
  item: [T('entity', 'Name'), N('from', 'From year', { step: 'any', width: 'narrow' }), N('to', 'To year', { step: 'any', width: 'narrow' })],
  make: (ctx) => {
    const y = Math.round(ctx.playheadYear() ?? ctx.dataStart());
    return { entity: ctx.columns()[0] ?? '', from: y, to: y + 3 };
  },
  summary: (sp) => `${sp.entity} · ${sp.from}–${sp.to ?? sp.from}` };

const CAPTION_BY_TIME = {
  ...CAPTION_BY_YEAR,
  item: [N('at', 'At (s)', { step: 0.5, min: 0, width: 'narrow' }), T('kicker', 'Kicker', { width: 'narrow' }),
    N('dur', 'Seconds', { step: 0.5, min: 0.5, width: 'narrow', placeholder: '5' }), T('text', 'Text', { multiline: true })],
  make: (ctx) => ({ at: Math.max(0, Number((ctx.playheadSceneTime() ?? 1).toFixed(1))), kicker: '', text: 'Write the point here.', dur: 4 }),
  summary: (c) => `${c.at}s · ${c.text ?? ''}`,
  check: false,
};

export const SCENE_FIELDS = {
  hook: [
    { kind: 'list', key: 'lines', label: 'Lines', addLabel: 'Add line',
      item: [T('text', 'Text', { multiline: true }), { kind: 'select', key: 'size', label: 'Size', options: [['big', 'Big'], ['small', 'Small']], width: 'narrow' },
        { kind: 'color', key: 'color', label: 'Colour', width: 'narrow' }],
      make: () => ({ text: 'A line that makes people stay.', size: 'big', color: null }),
      summary: (l) => l.text },
    N('duration', 'Length (s)', { step: 0.5, min: 1 }), N('stagger', 'Delay between lines (s)', { step: 0.1, min: 0 }), TEXTS.chapter,
  ],
  title: [TEXTS.title, TEXTS.subtitle, T('span', 'Years shown', { hint: 'e.g. 1960 – 2023' }), N('duration', 'Length (s)', { step: 0.1, min: 1 }), TEXTS.chapter],
  barRace: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data' },
    { kind: 'column', key: 'highlight', label: 'Highlight', hint: 'Drawn brighter, with its rank.' },
    { kind: 'column', key: 'pin', label: 'Always show', hint: 'Stays on screen below the top bars, with its true rank.' },
    N('nBars', 'Bars shown', { min: 3, max: 20, step: 1, placeholder: 'Auto (10; 8 square, 9 for 4:5)' }),
    FLAGS, YEAR_LABEL,
    { kind: 'format', key: 'valueFormat', label: 'Value labels', role: 'value' },
    { kind: 'format', key: 'tickFormat', label: 'Axis labels', role: 'tick' },
    MOMENTS,
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  lineRace: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data' },
    { kind: 'columns', key: 'series', label: 'Lines', hint: 'Up to 8 stay readable.' },
    { kind: 'column', key: 'highlight', label: 'Highlight' },
    { kind: 'check', key: 'log', label: 'Log scale (for growth over many orders of magnitude)' },
    FLAGS, YEAR_LABEL,
    { kind: 'format', key: 'valueFormat', label: 'Value labels', role: 'value' },
    { kind: 'format', key: 'yTickFormat', label: 'Axis labels', role: 'tick' },
    { kind: 'list', key: 'markers', label: 'Event markers', addLabel: 'Add marker',
      item: [N('x', 'Year', { step: 'any', width: 'narrow' }), T('label', 'Label')],
      make: (ctx) => ({ x: Math.round(ctx.playheadYear() ?? ctx.dataStart()), label: 'Event' }),
      summary: (m) => (Array.isArray(m) ? `${m[0]} · ${m[1]}` : `${m.x} · ${m.label}`) },
    MOMENTS,
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  dotGrid: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data' },
    { kind: 'column', key: 'column', label: 'Value (out of 100)', required: true },
    T('smallText', 'Text under the number', { hint: 'e.g. "children out of 100 died before age 5"' }),
    { kind: 'format', key: 'bigFormat', label: 'Big number', role: 'value' },
    { kind: 'color', key: 'badColor', label: 'Dot colour (counted)' },
    { kind: 'color', key: 'goodColor', label: 'Dot colour (rest)' },
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  growBars: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'list', key: 'items', label: 'Bars', addLabel: 'Add bar',
      item: [T('name', 'Name'), N('value', 'Value', { step: 'any', width: 'narrow' })],
      make: () => ({ name: 'New bar', value: 10 }),
      summary: (it) => (Array.isArray(it) ? `${it[0]} · ${it[1]}` : `${it.name} · ${it.value}`) },
    { kind: 'itemName', key: 'highlight', label: 'Highlight' },
    FLAGS,
    { kind: 'format', key: 'valueFormat', label: 'Value labels', role: 'value' },
    N('duration', 'Length (s)', { step: 0.5, min: 2 }), N('stagger', 'Delay between bars (s)', { step: 0.05, min: 0 }),
    CAPTION_BY_TIME, TEXTS.chapter,
  ],
  statCards: [
    T('heading', 'Heading'),
    { kind: 'list', key: 'cards', label: 'Cards', addLabel: 'Add card', max: 4,
      item: [T('big', 'Big text', { width: 'narrow' }), T('small', 'Small text', { multiline: true }), { kind: 'color', key: 'color', label: 'Colour', width: 'narrow' }],
      make: () => ({ big: '42', small: 'What this number means', color: '#FFB703' }),
      summary: (c) => (Array.isArray(c) ? `${c[0]} · ${c[1]}` : `${c.big} · ${c.small}`) },
    T('footer', 'Footnote', { multiline: true }),
    N('duration', 'Length (s)', { step: 0.5, min: 2 }), TEXTS.chapter,
  ],
  mapRace: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data (one column per country)' },
    { kind: 'column', key: 'highlight', label: 'Highlight', hint: 'Outlined on the map and labelled.' },
    { kind: 'select', key: 'scale', label: 'Colour scale', options: [['auto', 'Automatic'], ['linear', 'Linear'], ['log', 'Log (for values spanning many powers of ten)']] },
    N('top', 'Leaders listed', { min: 0, max: 10, step: 1, placeholder: '5' }),
    { kind: 'color', key: 'lowColor', label: 'Low colour', width: 'narrow' }, { kind: 'color', key: 'highColor', label: 'High colour', width: 'narrow' },
    FLAGS, YEAR_LABEL,
    { kind: 'format', key: 'valueFormat', label: 'Value labels', role: 'value' },
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  bubble: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'xData', label: 'Across (x) data' }, T('xLabel', 'Across label'), { kind: 'check', key: 'xLog', label: 'Log scale across' },
    { kind: 'format', key: 'xFormat', label: 'Across numbers', role: 'tick' },
    { kind: 'dataset', key: 'yData', label: 'Up (y) data' }, T('yLabel', 'Up label'), { kind: 'check', key: 'yLog', label: 'Log scale up' },
    { kind: 'format', key: 'yFormat', label: 'Up numbers', role: 'tick' },
    { kind: 'dataset', key: 'sizeData', label: 'Bubble size data (optional)', optional: true },
    { kind: 'format', key: 'sizeFormat', label: 'Size numbers', role: 'value' },
    { kind: 'column', key: 'highlight', label: 'Highlight', dataKey: 'xData', hint: 'Drawn with a trail of where it has been.' },
    { kind: 'select', key: 'colorBy', label: 'Colours', options: [['continent', 'By continent'], ['entity', 'Each its own colour']] },
    N('labels', 'Bubbles labelled', { min: 0, max: 30, step: 1, placeholder: '6' }),
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  stackedArea: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data' },
    { kind: 'columns', key: 'series', label: 'Layers (bottom first)', hint: 'Up to 8 stay readable.' },
    { kind: 'check', key: 'percent', label: 'Show as shares of 100%' },
    { kind: 'column', key: 'highlight', label: 'Highlight' },
    { kind: 'format', key: 'valueFormat', label: 'Value labels', role: 'value' },
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  bump: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data' },
    N('nBars', 'Places shown', { min: 3, max: 15, step: 1, placeholder: '8' }),
    { kind: 'column', key: 'highlight', label: 'Highlight' },
    { kind: 'format', key: 'valueFormat', label: 'Values next to names (optional)', role: 'value' },
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  versus: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'dataset', key: 'data', label: 'Data' },
    { kind: 'column', key: 'left', label: 'Left', required: true }, { kind: 'column', key: 'right', label: 'Right', required: true },
    FLAGS,
    { kind: 'format', key: 'valueFormat', label: 'Numbers', role: 'value' },
    { kind: 'pace', key: 'pace', label: 'Pace' },
    CAPTION_BY_YEAR, TEXTS.chapter,
  ],
  waffle: [
    TEXTS.title, TEXTS.subtitle, TEXTS.source,
    { kind: 'list', key: 'items', label: 'Categories', addLabel: 'Add category', max: 8,
      item: [T('name', 'Name'), N('value', 'Value', { step: 'any', width: 'narrow' }), { kind: 'color', key: 'color', label: 'Colour', width: 'narrow' }],
      make: () => ({ name: 'New part', value: 10 }),
      summary: (it) => (Array.isArray(it) ? `${it[0]} · ${it[1]}` : `${it.name} · ${it.value}`) },
    { kind: 'format', key: 'valueFormat', label: 'Values in the key (optional)', role: 'value' },
    N('duration', 'Length (s)', { step: 0.5, min: 2 }), N('stagger', 'Delay between squares (s)', { step: 0.005, min: 0 }),
    CAPTION_BY_TIME, TEXTS.chapter,
  ],
  quiz: [
    T('question', 'Question', { multiline: true }),
    { kind: 'strings', key: 'options', label: 'Answers', max: 4 },
    { kind: 'answer', key: 'answer', label: 'Right answer' },
    T('explain', 'Explanation after the reveal', { multiline: true }),
    N('think', 'Seconds to think', { step: 0.5, min: 1 }), N('duration', 'Length (s)', { step: 0.5, min: 3 }), TEXTS.chapter,
  ],
  outro: [
    T('question', 'Question for viewers', { multiline: true }), T('cta', 'Call to action', { placeholder: 'Tell us in the comments' }),
    T('button', 'Button text', { placeholder: 'SUBSCRIBE' }), T('sources', 'Sources', { multiline: true }),
    N('duration', 'Length (s)', { step: 0.5, min: 2 }), TEXTS.chapter,
  ],
};

function getValue(obj, key) {
  return obj?.[key];
}

function fieldId(path) {
  return `f-${path.replace(/[^\w-]/g, '-')}`;
}

function wrapField(f, path, control, extra = null) {
  const id = fieldId(path);
  const target = /INPUT|SELECT|TEXTAREA/.test(control.tagName) ? control : control.querySelector('input, select, textarea');
  if (target && !target.id) target.id = id;
  return h('div', { class: `field ${f.width === 'narrow' ? 'narrow' : ''} kind-${f.kind}` },
    h('label', { for: target?.id ?? id, class: 'field-label' }, f.label),
    control, extra,
    f.hint ? h('p', { class: 'hint' }, f.hint) : null);
}

/** Which preset a format spec is, plus any unit appended to its suffix. */
function presetFor(spec, role) {
  if (spec == null) return { key: '', unit: '' };
  for (const [k, p] of Object.entries(FORMAT_PRESETS)) {
    const base = role === 'tick' ? p.tick : p.value;
    const { suffix: bs = '', ...brest } = base;
    const { suffix: ss = '', ...srest } = spec;
    if (JSON.stringify(brest) === JSON.stringify(srest) && ss.startsWith(bs)) {
      const unit = ss.slice(bs.length);
      if (role === 'tick' && unit) continue;
      return { key: k, unit: unit.trim() };
    }
  }
  return { key: 'custom', unit: '' };
}

function withUnit(base, unit) {
  if (!unit) return { ...base };
  return { ...base, suffix: `${base.suffix ?? ''} ${unit.trim()}` };
}

function sampleText(spec) {
  try {
    const f = makeFormatter(spec);
    return [12.34, 1234.5, 2.5e6, 3.7e12].map((v) => f(v)).join('   ');
  } catch (e) {
    return e.message;
  }
}

/**
 * Render the inspector for scene `index` of the current story.
 * ctx: { store, index, datasets(), playheadYear(), playheadSceneTime(), dataStart(), rerender() }
 */
export function renderInspector(root, ctx) {
  const { store, index } = ctx;
  const spec = store.spec;
  root.replaceChildren();
  const scene = spec.scenes[index];
  if (!scene) {
    root.append(h('p', { class: 'empty' }, 'Pick a scene on the left to edit it.'));
    return;
  }
  let S;
  try {
    S = sceneClass(scene.type);
  } catch (e) {
    root.append(h('p', { class: 'problem' }, e.message));
    return;
  }
  root.append(h('div', { class: 'inspector-head' },
    h('span', { class: `type-chip t-${scene.type}` }, S.label),
    h('span', { class: 'scene-no' }, `Scene ${index + 1} of ${spec.scenes.length}`)));
  const fields = SCENE_FIELDS[scene.type] ?? [];
  const set = (key, value, group = key) => store.update((s) => {
    const sc = s.scenes[index];
    if (value === undefined || value === null || value === '') delete sc[key];
    else sc[key] = value;
  }, `s${index}.${group}`);

  const form = h('div', { class: 'form' });
  for (const f of fields) form.append(renderField(f, scene, set, ctx, `s${index}.${f.key}`));
  const motion = [...(scene.type === 'barRace' || scene.type === 'lineRace' ? [SPOTLIGHT] : []), ...MOTION];
  const mbox = h('details', { class: 'raw motion', open: !!(scene.camera?.length || scene.spotlight?.length || scene.transition) },
    h('summary', {}, 'Motion: entrance, camera, spotlight'),
    h('div', { class: 'form' }, motion.map((f) => renderField(f, scene, set, ctx, `s${index}.${f.key}`))));
  root.append(form, mbox);

  root.append(h('details', { class: 'raw' },
    h('summary', {}, 'Edit this scene as JSON'),
    rawEditor(scene, (obj) => {
      store.update((s) => {
        s.scenes[index] = obj;
      });
      ctx.rerender();
    })));
}

function rawEditor(obj, apply) {
  const ta = h('textarea', { class: 'code', rows: 12, spellcheck: false, id: 'scene-json' });
  ta.value = JSON.stringify(obj, null, 2);
  const msg = h('p', { class: 'hint' });
  const btn = h('button', {
    class: 'btn small', type: 'button',
    onclick: () => {
      try {
        const o = JSON.parse(ta.value);
        if (!o || typeof o !== 'object' || !o.type) throw new Error('A scene needs a "type".');
        apply(o);
      } catch (e) {
        msg.textContent = e.message;
        msg.className = 'hint problem';
      }
    },
  }, 'Apply JSON');
  return h('div', { class: 'raw-body' }, ta, h('div', { class: 'row' }, btn), msg);
}

function renderField(f, obj, set, ctx, path) {
  const val = getValue(obj, f.key);
  switch (f.kind) {
    case 'text': {
      const el = f.multiline
        ? h('textarea', { rows: 2, placeholder: f.placeholder ?? '' })
        : h('input', { type: 'text', placeholder: f.placeholder ?? '' });
      el.value = val ?? '';
      el.addEventListener('input', () => set(f.key, el.value));
      return wrapField(f, path, el);
    }
    case 'number': {
      const el = h('input', { type: 'number', step: f.step ?? 'any', min: f.min, max: f.max, placeholder: f.placeholder ?? '', inputmode: 'decimal' });
      el.value = val ?? '';
      el.addEventListener('input', () => {
        if (el.value === '') return set(f.key, null);
        const n = Number(el.value);
        if (Number.isFinite(n)) set(f.key, n);
      });
      return wrapField(f, path, el);
    }
    case 'check': {
      const el = h('input', { type: 'checkbox', id: fieldId(path) });
      el.checked = !!val;
      el.addEventListener('change', () => set(f.key, el.checked ? true : null));
      return h('div', { class: 'field check' }, el, h('label', { for: el.id }, f.label));
    }
    case 'select': {
      const el = h('select', {}, f.options.map(([v, l]) => h('option', { value: v }, l)));
      el.value = val ?? f.options[0][0];
      el.addEventListener('change', () => set(f.key, el.value));
      return wrapField(f, path, el);
    }
    case 'color': {
      const el = h('input', { type: 'color' });
      el.value = /^#[0-9a-f]{6}$/i.test(val ?? '') ? val : '#ffb703';
      const clear = h('button', { type: 'button', class: 'btn ghost small', title: 'Use the theme colour' }, val ? 'Reset' : 'Theme');
      const set2 = (v) => {
        set(f.key, v);
        clear.textContent = v ? 'Reset' : 'Theme';
        el.classList.toggle('unset', !v);
      };
      el.classList.toggle('unset', !val);
      el.addEventListener('input', () => set2(el.value));
      clear.addEventListener('click', () => set2(null));
      return wrapField(f, path, h('div', { class: 'color-row' }, el, clear));
    }
    case 'dataset': {
      const ids = ctx.datasets();
      const el = h('select', {}, f.optional ? h('option', { value: '' }, '— None —') : null, ids.map((id) => h('option', { value: id }, id)));
      el.value = val ?? (f.optional ? '' : ids[0] ?? '');
      el.addEventListener('change', () => {
        set(f.key, el.value || null);
        ctx.rerender();
      });
      return wrapField(f, path, el);
    }
    case 'strings': {
      const list = Array.isArray(val) ? [...val] : [];
      const box = h('div', { class: 'list' });
      const draw = () => {
        box.replaceChildren(...list.map((txt, k) => {
          const inp = h('input', { type: 'text', value: txt, 'aria-label': `${f.label} ${k + 1}` });
          inp.addEventListener('input', () => {
            list[k] = inp.value;
            set(f.key, [...list]);
          });
          const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${k + 1}`, disabled: list.length <= 2 }, '×');
          del.addEventListener('click', () => {
            list.splice(k, 1);
            set(f.key, [...list]);
            draw();
            ctx.rerender();
          });
          return h('div', { class: 'row' }, h('span', { class: 'item-no' }, 'ABCD'[k]), inp, del);
        }), list.length < (f.max ?? 4) ? h('button', {
          type: 'button', class: 'btn small',
          onclick: () => {
            list.push('Another answer');
            set(f.key, [...list]);
            draw();
            ctx.rerender();
          },
        }, 'Add answer') : '');
      };
      draw();
      return h('div', { class: 'field wide' }, h('span', { class: 'field-label' }, f.label), box);
    }
    case 'answer': {
      const opts = Array.isArray(obj.options) ? obj.options : [];
      const el = h('select', {}, opts.map((o, k) => h('option', { value: k }, `${'ABCD'[k]}: ${o}`)));
      el.value = String(val ?? 0);
      el.addEventListener('change', () => set(f.key, Number(el.value)));
      return wrapField(f, path, el);
    }
    case 'column':
    case 'itemName': {
      const names = f.kind === 'column'
        ? ctx.columns(obj[f.dataKey ?? 'data'])
        : (obj.items ?? []).map((it) => (Array.isArray(it) ? it[0] : it.name));
      const el = h('select', {}, f.required ? null : h('option', { value: '' }, '— None —'), names.map((n) => h('option', { value: n }, n)));
      el.value = val ?? '';
      el.addEventListener('change', () => set(f.key, el.value || null));
      return wrapField(f, path, el);
    }
    case 'columns': {
      const names = ctx.columns(obj[f.dataKey ?? 'data']);
      const chosen = new Set(Array.isArray(val) && val.length ? val : names);
      const box = h('div', { class: 'chips', role: 'group', 'aria-label': f.label });
      names.forEach((n, k) => {
        const id = `${fieldId(path)}-${k}`;
        const cb = h('input', { type: 'checkbox', id, checked: chosen.has(n) });
        cb.addEventListener('change', () => {
          if (cb.checked) chosen.add(n);
          else chosen.delete(n);
          set(f.key, names.filter((x) => chosen.has(x)));
        });
        box.append(h('label', { class: 'chip', for: id }, cb, h('span', {}, n)));
      });
      return h('div', { class: 'field wide' }, h('span', { class: 'field-label' }, f.label), box, f.hint ? h('p', { class: 'hint' }, f.hint) : null);
    }
    case 'format':
      return formatField(f, val, set, path);
    case 'pace':
      return paceField(f, val, set, ctx, path);
    case 'list':
      return listField(f, val, set, ctx, path);
    case 'moments':
      return momentsField(obj, set, ctx, path);
    default:
      return h('div');
  }
}

function formatField(f, val, set, path) {
  const opts = Object.entries(FORMAT_PRESETS).map(([k, p]) => h('option', { value: k }, p.label));
  const sel = h('select', { id: `${fieldId(path)}-preset` }, opts, h('option', { value: 'custom' }, 'Custom (JSON)'));
  const cur = presetFor(val, f.role);
  sel.value = cur.key || 'decimal';
  const unit = h('input', { type: 'text', id: `${fieldId(path)}-unit`, value: cur.unit, placeholder: 'Unit, e.g. Mt', 'aria-label': `${f.label} unit` });
  const ta = h('textarea', { class: 'code', rows: 3, spellcheck: false, id: `${fieldId(path)}-json`, 'aria-label': `${f.label} as JSON` });
  ta.value = val ? JSON.stringify(val) : '';
  const sample = h('p', { class: 'sample' }, val ? sampleText(val) : 'Default');
  const sync = () => {
    ta.hidden = sel.value !== 'custom';
    unit.hidden = sel.value === 'custom' || f.role === 'tick';
  };
  const apply = () => {
    if (sel.value === 'custom') return;
    const p = FORMAT_PRESETS[sel.value];
    const spec = f.role === 'tick' ? { ...p.tick } : withUnit(p.value, unit.value);
    ta.value = JSON.stringify(spec);
    sample.textContent = sampleText(spec);
    sample.classList.remove('problem');
    set(f.key, spec);
  };
  sel.addEventListener('change', () => {
    sync();
    if (sel.value === 'custom') {
      if (!ta.value) ta.value = JSON.stringify(val ?? { type: 'fixed', digits: 1 });
      ta.focus();
      return;
    }
    apply();
  });
  unit.addEventListener('input', apply);
  ta.addEventListener('input', () => {
    try {
      const spec = JSON.parse(ta.value);
      makeFormatter(spec)(1);
      sample.textContent = sampleText(spec);
      sample.classList.remove('problem');
      set(f.key, spec);
    } catch (e) {
      sample.textContent = e.message;
      sample.classList.add('problem');
    }
  });
  sync();
  return wrapField(f, path, h('div', { class: 'format-row' }, sel, unit), h('div', {}, ta, sample));
}

function paceField(f, val, set, ctx, path) {
  const pace = val ?? { start: ctx.dataStart(), lead: 1, steps: [] };
  const wrap = h('div', { class: 'pace' });
  const total = h('span', { class: 'pace-total' });
  const write = () => {
    set(f.key, JSON.parse(JSON.stringify(pace)), `${path}`);
    try {
      total.textContent = `${new Pace(pace).duration.toFixed(1)} s`;
    } catch {
      total.textContent = '';
    }
  };
  const rows = h('ol', { class: 'pace-steps' });
  const draw = () => {
    rows.replaceChildren();
    pace.steps.forEach((st, k) => {
      const isHold = 'hold' in st;
      const kind = h('select', { 'aria-label': `Step ${k + 1} kind` }, h('option', { value: 'to' }, 'Move to'), h('option', { value: 'hold' }, 'Hold'));
      kind.value = isHold ? 'hold' : 'to';
      const year = h('input', { type: 'number', step: 'any', 'aria-label': `Step ${k + 1} year`, value: isHold ? '' : st.to, disabled: isHold, inputmode: 'decimal' });
      const secs = h('input', { type: 'number', step: 0.1, min: 0, 'aria-label': `Step ${k + 1} seconds`, value: isHold ? st.hold : st.dur, inputmode: 'decimal' });
      const del = h('button', { type: 'button', class: 'icon-btn', title: 'Remove step', 'aria-label': `Remove step ${k + 1}` }, '×');
      kind.addEventListener('change', () => {
        const s = Number(secs.value) || 2;
        pace.steps[k] = kind.value === 'hold' ? { hold: s } : { to: Number(year.value) || ctx.dataEnd(), dur: s };
        draw();
        write();
      });
      year.addEventListener('input', () => {
        if (year.value !== '' && Number.isFinite(Number(year.value))) {
          pace.steps[k].to = Number(year.value);
          write();
        }
      });
      secs.addEventListener('input', () => {
        const n = Number(secs.value);
        if (secs.value === '' || !Number.isFinite(n) || n < 0) return;
        if ('hold' in pace.steps[k]) pace.steps[k].hold = n;
        else pace.steps[k].dur = Math.max(0.1, n);
        write();
      });
      del.addEventListener('click', () => {
        pace.steps.splice(k, 1);
        draw();
        write();
      });
      rows.append(h('li', {}, kind, h('span', { class: 'to-year' }, year), secs, h('span', { class: 'unit' }, 's'), del));
    });
  };
  draw();
  const start = h('input', { type: 'number', step: 'any', value: pace.start, id: `${fieldId(path)}-start`, inputmode: 'decimal' });
  start.addEventListener('input', () => {
    if (start.value !== '' && Number.isFinite(Number(start.value))) {
      pace.start = Number(start.value);
      write();
    }
  });
  const addMove = h('button', { type: 'button', class: 'btn small' }, '+ Move');
  const addHold = h('button', { type: 'button', class: 'btn small' }, '+ Hold');
  addMove.addEventListener('click', () => {
    const last = [...pace.steps].reverse().find((s) => 'to' in s);
    pace.steps.push({ to: Math.min(ctx.dataEnd(), (last?.to ?? pace.start) + 10), dur: 5 });
    draw();
    write();
  });
  addHold.addEventListener('click', () => {
    pace.steps.push({ hold: 2 });
    draw();
    write();
  });
  const evenSecs = h('input', { type: 'number', min: 5, step: 1, value: 40, 'aria-label': 'Seconds for the whole timeline', class: 'narrow-input' });
  const even = h('button', { type: 'button', class: 'btn small ghost' }, 'Even pace');
  even.addEventListener('click', () => {
    const s = Math.max(5, Number(evenSecs.value) || 40);
    pace.start = ctx.dataStart();
    pace.lead = 1;
    pace.steps = [{ hold: 1.5 }, { to: ctx.dataEnd(), dur: s }, { hold: 4 }];
    start.value = pace.start;
    draw();
    write();
  });
  try {
    total.textContent = `${new Pace(pace).duration.toFixed(1)} s`;
  } catch {
    /* shown once valid */
  }
  wrap.append(
    h('div', { class: 'row' }, h('label', { for: start.id, class: 'inline-label' }, 'Start year'), start, total),
    h('div', { class: 'pace-head', 'aria-hidden': 'true' }, h('span', {}, 'Step'), h('span', {}, 'Year'), h('span', {}, 'Seconds')),
    rows,
    h('div', { class: 'row wrap' }, addMove, addHold, h('span', { class: 'spacer' }), evenSecs, even),
  );
  return h('div', { class: 'field wide kind-pace' }, h('span', { class: 'field-label' }, f.label),
    h('p', { class: 'hint' }, 'How the years move while the video plays. Slow down or hold where your captions need reading time.'), wrap);
}

/** Drama finder: suggest captions from the data and pace the race around them. */
function momentsField(obj, set, ctx, path) {
  const box = h('div', { class: 'moments' });
  const raw = ctx.datasetRaw(obj.data);
  if (!raw) return h('div');
  const find = h('button', { type: 'button', class: 'btn small primary' }, 'Find dramatic moments');
  const secs = h('input', { type: 'number', min: 10, max: 300, step: 1, id: `${fieldId(path)}-secs`, class: 'narrow-input', 'aria-label': 'Seconds for the race, before pauses' });
  const span = raw.index[raw.index.length - 1] - raw.index[0];
  const travel = (obj.pace?.steps ?? []).reduce((a, st) => a + ('to' in st ? st.dur : 0), 0);
  secs.value = String(Math.round(travel || Math.max(18, Math.min(75, span * 0.55))));
  const repace = h('button', { type: 'button', class: 'btn small' }, 'Pace around the captions');
  repace.addEventListener('click', () => {
    const years = (obj.captions ?? []).map((c) => Number(c.year)).filter(Number.isFinite);
    const pace = dramaPace(raw.index, Math.max(5, Number(secs.value) || 40), years);
    set('pace', pace, `${path}.pace`);
    ctx.rerender();
  });
  const list = h('div', { class: 'moment-list' });
  find.addEventListener('click', () => {
    let fmt;
    try {
      fmt = makeFormatter(obj.valueFormat ?? { type: 'count' });
    } catch {
      fmt = (v) => String(v);
    }
    const timeMode = obj.yearLabel === 'month' ? 'month' : 'year';
    const events = findEvents({ ...raw, timeMode }, { kind: obj.type === 'lineRace' ? 'line' : 'bar', nBars: obj.nBars ?? 10, highlight: obj.highlight ?? obj.pin, series: obj.series, format: fmt });
    const picked = new Set(pickEvents(events, { max: 7, span, start: raw.index[0] }));
    list.replaceChildren();
    if (!events.length) {
      list.append(h('p', { class: 'hint' }, 'No overtakes, records or big swings found in this data.'));
      return;
    }
    const top = [...events].sort((a, b) => b.score - a.score).slice(0, 24).sort((a, b) => a.t - b.t);
    const checks = top.map((e, k) => {
      const id = `${fieldId(path)}-m${k}`;
      const cb = h('input', { type: 'checkbox', id, checked: picked.has(e) });
      list.append(h('div', { class: 'moment' }, cb,
        h('label', { for: id }, h('span', { class: 'moment-year' }, e.kicker), ` ${e.text}`),
        h('span', { class: 'moment-score', title: 'How dramatic this moment is' }, '●'.repeat(Math.max(1, Math.min(5, Math.round((e.score - 2) / 2)))))));
      return cb;
    });
    const chosen = () => top.filter((_, k) => checks[k].checked).map((e) => ({ year: Math.round(e.t * 100) / 100, kicker: e.kicker, text: e.text, dur: 4.5 }));
    list.append(h('div', { class: 'row wrap' },
      h('button', {
        type: 'button', class: 'btn small primary',
        onclick: () => {
          const caps = chosen();
          set('captions', caps, `${path}.caps`);
          const pace = dramaPace(raw.index, Math.max(5, Number(secs.value) || 40), caps.map((c) => c.year));
          set('pace', pace, `${path}.pace`);
          ctx.rerender();
        },
      }, 'Use as captions and pace'),
      h('button', {
        type: 'button', class: 'btn small',
        onclick: () => {
          const caps = [...(obj.captions ?? []), ...chosen()].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
          set('captions', caps, `${path}.caps`);
          ctx.rerender();
        },
      }, 'Add to my captions')));
  });
  box.append(
    h('p', { class: 'hint' }, 'Scans the data for lead changes, overtakes, records, crashes and surges, and writes a caption for each. The pace then slows into each moment and pauses on it.'),
    h('div', { class: 'row wrap' }, find, h('span', { class: 'spacer' }), h('label', { for: secs.id, class: 'inline-label' }, 'Race'), secs, h('span', { class: 'unit' }, 's'), repace),
    list);
  return h('div', { class: 'field wide kind-moments' }, h('span', { class: 'field-label' }, 'Find the story'), box);
}

function listField(f, val, set, ctx, path) {
  const items = Array.isArray(val) ? JSON.parse(JSON.stringify(val)) : [];
  const box = h('div', { class: 'list' });
  const write = (rerender = false) => {
    set(f.key, JSON.parse(JSON.stringify(items)), path);
    if (rerender) draw();
  };
  const draw = () => {
    box.replaceChildren();
    items.forEach((it, k) => {
      // Older stories store some items as arrays; convert on first edit.
      const obj = Array.isArray(it) ? Object.fromEntries(f.item.map((fi, j) => [fi.key, it[j]])) : it;
      const card = h('details', { class: 'item', open: items.length <= 3 });
      const sumText = h('span', { class: 'item-sum' }, f.summary ? f.summary(it) : `Item ${k + 1}`);
      const badge = h('span', { class: 'fc', hidden: true });
      const sum = h('summary', {}, h('span', { class: 'item-no' }, String(k + 1)), sumText, badge);
      const body = h('div', { class: 'item-body' });
      const notes = h('ul', { class: 'fc-notes', hidden: true });
      const refreshCheck = () => {
        if (!f.check || !ctx.checkCaption) return;
        const r = ctx.checkCaption(Array.isArray(items[k]) ? obj : items[k]);
        const map = { ok: ['ok', 'Matches the data'], mixed: ['ok', 'Partly checked'], bad: ['bad', 'Check this'], none: [null, null] };
        const [cls, text] = map[r.status];
        badge.hidden = !cls;
        badge.className = `pill fc ${cls ?? ''}`;
        badge.textContent = text ?? '';
        const shown = r.claims.filter((c) => c.status !== 'none' || r.status !== 'none');
        notes.hidden = !shown.length;
        notes.replaceChildren(...shown.map((c) => h('li', { class: `fc-${c.status}` }, h('strong', {}, c.raw), ` ${c.status === 'ok' ? '✓' : c.status === 'bad' ? '✗' : '–'} ${c.note}`)));
      };
      for (const fi of f.item) {
        const setItem = (key, value) => {
          items[k] = { ...obj, [key]: value };
          if (value === null || value === '' || value === undefined) delete items[k][key];
          Object.assign(obj, items[k]);
          sumText.textContent = f.summary ? f.summary(items[k]) : '';
          refreshCheck();
          write();
        };
        body.append(renderField(fi, obj, setItem, ctx, `${path}.${k}.${fi.key}`));
      }
      const tools = h('div', { class: 'row item-tools' },
        h('button', { type: 'button', class: 'btn small ghost', disabled: k === 0, onclick: () => { [items[k - 1], items[k]] = [items[k], items[k - 1]]; write(true); } }, 'Move up'),
        h('button', { type: 'button', class: 'btn small ghost', disabled: k === items.length - 1, onclick: () => { [items[k + 1], items[k]] = [items[k], items[k + 1]]; write(true); } }, 'Move down'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn small danger', onclick: () => { items.splice(k, 1); write(true); } }, 'Remove'));
      body.append(notes, tools);
      refreshCheck();
      card.append(sum, body);
      box.append(card);
    });
    const full = f.max && items.length >= f.max;
    box.append(h('button', {
      type: 'button', class: 'btn small add', disabled: full,
      onclick: () => {
        items.push(f.make(ctx));
        if (f.key === 'captions' && items.every((c) => 'year' in c)) items.sort((a, b) => a.year - b.year);
        write(true);
      },
    }, full ? `${f.max} is the most that fits` : `+ ${f.addLabel}${f.atPlayhead ? ' at playhead' : ''}`));
  };
  draw();
  return h('div', { class: 'field wide kind-list' }, h('span', { class: 'field-label' }, `${f.label}${items.length ? ` (${items.length})` : ''}`), box);
}

/** Default spec for a new scene of `type`, using the story's first dataset. */
export function newScene(type, spec) {
  const ids = Object.keys(spec.datasets ?? {});
  const ds = spec.datasets?.[ids[0]];
  const start = ds ? Math.min(...ds.index) : 2000;
  const end = ds ? Math.max(...ds.index) : 2020;
  const pace = { start, lead: 1, steps: [{ hold: 1.5 }, { to: end, dur: 30 }, { hold: 4 }] };
  switch (type) {
    case 'hook':
      return { type, lines: [{ text: 'A question that makes people stay?', size: 'big' }, { text: 'The answer is in the data.', size: 'small' }], duration: 5 };
    case 'title':
      return { type, title: 'Your title here', subtitle: '', span: ds ? `${start} – ${end}` : '', duration: 3.2 };
    case 'barRace':
      return { type, data: ids[0], pace, title: 'Your chart title', subtitle: '', source: '', valueFormat: { type: 'count' }, tickFormat: { type: 'tickCount' }, captions: [] };
    case 'lineRace':
      return { type, data: ids[0], pace, title: 'Your chart title', series: (ds?.columns ?? []).slice(0, 6), valueFormat: { type: 'fixed', digits: 1 }, captions: [] };
    case 'dotGrid':
      return { type, data: ids[0], column: ds?.columns?.[0], pace, title: 'Out of every 100', smallText: 'out of 100', captions: [] };
    case 'growBars':
      return { type, title: 'Compared side by side', items: [{ name: 'A', value: 30 }, { name: 'B', value: 55 }, { name: 'C', value: 80 }], valueFormat: { type: 'fixed', digits: 0 }, duration: 8 };
    case 'statCards':
      return { type, heading: 'In three numbers', cards: [{ big: '1st', small: 'What it means', color: '#FFB703' }, { big: '2x', small: 'What it means', color: '#2EC4B6' }], duration: 7 };
    case 'outro':
      return { type, question: 'What should we chart next?', sources: '', duration: 6 };
    case 'mapRace':
      return { type, data: ids[0], pace, title: 'Around the world', subtitle: '', source: '', valueFormat: { type: 'count' }, captions: [] };
    case 'bubble':
      return { type, xData: ids[0], yData: ids[1] ?? ids[0], sizeData: ids[2] ?? null, pace, title: 'Two measures at once', xLabel: ids[0] ?? '', yLabel: ids[1] ?? ids[0] ?? '', captions: [] };
    case 'stackedArea':
      return { type, data: ids[0], pace, title: 'How the whole splits up', series: (ds?.columns ?? []).slice(0, 6), valueFormat: { type: 'count' }, captions: [] };
    case 'bump':
      return { type, data: ids[0], pace, title: 'Who was where', nBars: 8, captions: [] };
    case 'versus': {
      const [l, r] = ds?.columns ?? [];
      return { type, data: ids[0], pace, title: `${l ?? 'A'} vs ${r ?? 'B'}`, left: l, right: r ?? l, valueFormat: { type: 'count' }, captions: [] };
    }
    case 'waffle':
      return { type, title: 'Out of every 100', items: [{ name: 'First part', value: 45 }, { name: 'Second part', value: 35 }, { name: 'The rest', value: 20 }], duration: 7 };
    case 'quiz':
      return { type, question: 'Which country was #1 in the first year?', options: (ds?.columns ?? ['A', 'B', 'C', 'D']).slice(0, 4), answer: 0, explain: '', think: 4, duration: 9 };
    default:
      return { type, duration: 3 };
  }
}
