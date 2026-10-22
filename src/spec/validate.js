// Story spec validation with messages a non-programmer can act on.
// validateSpec(spec) returns a list of error strings (empty = valid).
// Used by the studio's JSON editor and by tests; the schema is described
// in docs/STORY_SPEC.md.

import { THEMES } from '../core/theme.js';
import { makeFormatter } from '../core/format.js';
import { SCENE_TYPES } from '../scenes/registry.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const DATA_SCENES = new Set(['barRace', 'lineRace', 'dotGrid']);
const MAX_SECONDS = 30 * 60;

function checkFormat(errs, where, f) {
  if (f == null) return;
  try {
    makeFormatter(f)(1234.5);
  } catch (e) {
    errs.push(`${where}: ${e.message}`);
  }
}

function checkPace(errs, where, p) {
  if (!isObj(p)) {
    errs.push(`${where}: needs a pace, e.g. {"start": 1960, "steps": [{"to": 2023, "dur": 30}]}`);
    return 0;
  }
  if (!isNum(p.start)) errs.push(`${where}.start must be a number (the first year shown)`);
  if (p.lead != null && !(isNum(p.lead) && p.lead >= 0)) errs.push(`${where}.lead must be a number of seconds, 0 or more`);
  if (!Array.isArray(p.steps) || !p.steps.length) {
    errs.push(`${where}.steps must list at least one step, e.g. {"to": 2023, "dur": 30} or {"hold": 3}`);
    return 0;
  }
  let total = p.lead ?? 0.8;
  p.steps.forEach((s, k) => {
    const w = `${where}.steps[${k}]`;
    if (!isObj(s)) errs.push(`${w} must be {"hold": seconds} or {"to": year, "dur": seconds}`);
    else if ('hold' in s) {
      if (!(isNum(s.hold) && s.hold >= 0)) errs.push(`${w}.hold must be a number of seconds`);
      else total += s.hold;
    } else if ('to' in s) {
      if (!isNum(s.to)) errs.push(`${w}.to must be a number (a year)`);
      if (!(isNum(s.dur) && s.dur > 0)) errs.push(`${w}.dur must be a positive number of seconds`);
      else total += s.dur;
    } else errs.push(`${w} needs "hold" or "to"`);
  });
  return total;
}

function checkCaptions(errs, where, caps, byYear) {
  if (caps == null) return;
  if (!Array.isArray(caps)) {
    errs.push(`${where} must be a list`);
    return;
  }
  caps.forEach((c, k) => {
    const w = `${where}[${k}]`;
    if (!isObj(c)) return errs.push(`${w} must be an object like {"year": 1991, "kicker": "1991", "text": "..."}`);
    if (byYear && c.at == null && !isNum(c.year)) errs.push(`${w} needs "year" (when to show it)`);
    if (!byYear && !isNum(c.at)) errs.push(`${w} needs "at" (seconds into the scene)`);
    if (c.text != null && !isStr(c.text)) errs.push(`${w}.text must be text`);
    if (c.dur != null && !(isNum(c.dur) && c.dur > 0)) errs.push(`${w}.dur must be a positive number of seconds`);
  });
}

function checkDataset(errs, id, d) {
  const w = `datasets.${id}`;
  if (!isObj(d)) return errs.push(`${w} must be {"index": [...], "columns": [...], "values": [[...], ...]}`);
  if (!Array.isArray(d.index) || !d.index.length) errs.push(`${w}.index must be a non-empty list of numbers (usually years)`);
  else if (!d.index.every(isNum)) errs.push(`${w}.index must contain only numbers`);
  if (!Array.isArray(d.columns) || !d.columns.length) errs.push(`${w}.columns must be a non-empty list of names`);
  else if (new Set(d.columns).size !== d.columns.length) errs.push(`${w}.columns has duplicate names`);
  if (!Array.isArray(d.values)) return errs.push(`${w}.values must be a list with one list of numbers per column`);
  if (Array.isArray(d.columns) && d.values.length !== d.columns.length) {
    errs.push(`${w}.values must have one list per column (${d.columns.length} columns, got ${d.values.length} lists)`);
  }
  d.values.forEach((col, k) => {
    if (!Array.isArray(col)) return errs.push(`${w}.values[${k}] must be a list of numbers`);
    if (Array.isArray(d.index) && col.length !== d.index.length) {
      errs.push(`${w}.values[${k}] (${d.columns?.[k] ?? k}) has ${col.length} values but index has ${d.index.length}`);
    }
    const bad = col.findIndex((v) => !(v === null || isNum(v)));
    if (bad >= 0) errs.push(`${w}.values[${k}][${bad}] must be a number or null (got ${JSON.stringify(col[bad])})`);
  });
}

export function validateSpec(spec) {
  const errs = [];
  if (!isObj(spec)) return ['The story must be a JSON object'];
  if (spec.version != null && spec.version !== 1) errs.push('version must be 1');
  if (spec.fps != null && !(isNum(spec.fps) && spec.fps >= 1 && spec.fps <= 120)) errs.push('fps must be between 1 and 120');
  if (spec.theme != null) {
    if (!isObj(spec.theme)) errs.push('theme must be an object like {"name": "midnight", "brand": "MY CHANNEL"}');
    else {
      if (spec.theme.name != null && !THEMES[spec.theme.name]) errs.push(`theme.name must be one of: ${Object.keys(THEMES).join(', ')}`);
      if (spec.theme.brand != null && !isStr(spec.theme.brand)) errs.push('theme.brand must be text');
      for (const [k, v] of Object.entries(spec.theme.overrides ?? {})) {
        if (!(isStr(v) && HEX.test(v))) errs.push(`theme.overrides.${k} must be a colour like "#FFB703"`);
      }
    }
  }
  if (spec.theme?.logo != null && !(isStr(spec.theme.logo) && /^data:image\//.test(spec.theme.logo))) errs.push('theme.logo must be an image (a data: URL)');
  if (spec.flags != null && typeof spec.flags !== 'boolean') errs.push('flags must be true or false');
  if (spec.palette != null && !['colorblind'].includes(spec.palette)) errs.push('palette must be "colorblind" (or left out)');
  if (spec.stamp != null && typeof spec.stamp !== 'boolean') errs.push('stamp must be true or false');
  for (const [k, v] of Object.entries(spec.images ?? {})) {
    if (!(isStr(v) && /^data:image\//.test(v))) errs.push(`images.${k} must be an image (a data: URL)`);
  }
  if (spec.translations != null) {
    if (!isObj(spec.translations)) errs.push('translations must be an object like {"hi": {"strings": {...}}}');
    else for (const [lang, tr] of Object.entries(spec.translations)) {
      if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang)) errs.push(`translations: "${lang}" is not a language code like "hi" or "es"`);
      if (!isObj(tr)) errs.push(`translations.${lang} must be an object`);
      else {
        if (tr.strings != null && !isObj(tr.strings)) errs.push(`translations.${lang}.strings must map text paths to translations`);
        if (tr.names != null && !isObj(tr.names)) errs.push(`translations.${lang}.names must map names to translations`);
      }
    }
  }
  if (spec.audio != null) {
    const a = spec.audio;
    if (!isObj(a)) errs.push('audio must be an object with "music" and/or "narration"');
    else {
      if (a.music != null && !(isObj(a.music) && isStr(a.music.id))) errs.push('audio.music needs an "id" (add music in the Audio tab)');
      if (a.music?.volume != null && !(isNum(a.music.volume) && a.music.volume >= 0 && a.music.volume <= 2)) errs.push('audio.music.volume must be between 0 and 2');
      for (const [k, c] of (a.narration?.clips ?? []).entries()) {
        if (!isObj(c) || !isStr(c.id) || !Number.isInteger(c.scene)) errs.push(`audio.narration.clips[${k}] needs an "id" and a "scene" number`);
        else if (!spec.scenes?.[c.scene]) errs.push(`audio.narration.clips[${k}] points to scene ${c.scene + 1}, which doesn't exist`);
      }
    }
  }
  for (const [k, v] of Object.entries(spec.colors ?? {})) {
    if (!(isStr(v) && HEX.test(v))) errs.push(`colors.${k} must be a colour like "#FF9933"`);
  }
  const datasets = isObj(spec.datasets) ? spec.datasets : {};
  if (spec.datasets != null && !isObj(spec.datasets)) errs.push('datasets must be an object of named tables');
  for (const [id, d] of Object.entries(datasets)) checkDataset(errs, id, d);

  const types = new Map(SCENE_TYPES.map((S) => [S.type, S]));
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) {
    errs.push('The story needs at least one scene in "scenes"');
    return errs;
  }
  let total = 0;
  spec.scenes.forEach((s, k) => {
    const w = `scenes[${k}]`;
    if (!isObj(s)) return errs.push(`${w} must be an object with a "type"`);
    if (!types.has(s.type)) {
      return errs.push(`${w}: unknown scene type "${s.type}". Known types: ${[...types.keys()].join(', ')}`);
    }
    if (s.duration != null && !(isNum(s.duration) && s.duration > 0)) errs.push(`${w}.duration must be a positive number of seconds`);
    if (s.flags != null && typeof s.flags !== 'boolean') errs.push(`${w}.flags must be true or false`);
    if (s.yearLabel != null && !['year', 'month'].includes(s.yearLabel)) errs.push(`${w}.yearLabel must be "year" or "month"`);
    if (s.transition != null) {
      const type = isStr(s.transition) ? s.transition : s.transition?.type;
      if (!['crossfade', 'slide', 'zoom', 'cut'].includes(type)) errs.push(`${w}.transition must be "crossfade", "slide", "zoom" or "cut" (or {"type": ..., "dur": seconds})`);
    }
    if (s.camera != null) {
      if (!Array.isArray(s.camera)) errs.push(`${w}.camera must be a list like [{"at": 5, "zoom": 1.5, "x": 0.3, "y": 0.6, "dur": 1.2}]`);
      else s.camera.forEach((c, j) => {
        if (!isObj(c) || !isNum(c.at)) errs.push(`${w}.camera[${j}] needs "at" (seconds into the scene)`);
        else {
          if (c.zoom != null && !(isNum(c.zoom) && c.zoom >= 1 && c.zoom <= 4)) errs.push(`${w}.camera[${j}].zoom must be between 1 and 4`);
          for (const a of ['x', 'y']) if (c[a] != null && !(isNum(c[a]) && c[a] >= 0 && c[a] <= 1)) errs.push(`${w}.camera[${j}].${a} must be between 0 and 1 (a fraction of the frame)`);
        }
      });
    }
    if (s.spotlight != null) {
      if (!Array.isArray(s.spotlight)) errs.push(`${w}.spotlight must be a list like [{"entity": "India", "from": 1991, "to": 1995}]`);
      else s.spotlight.forEach((sp, j) => {
        if (!isObj(sp) || !isStr(sp.entity) || !isNum(sp.from)) errs.push(`${w}.spotlight[${j}] needs "entity" and "from"`);
      });
    }
    let ds = null;
    const S = types.get(s.type);
    if (DATA_SCENES.has(s.type) || S.paced) {
      if (!S.dataKeys) {
        if (!isStr(s.data)) errs.push(`${w}.data must name a dataset`);
        else if (!datasets[s.data]) errs.push(`${w}.data: no dataset "${s.data}" (have: ${Object.keys(datasets).join(', ') || 'none'})`);
        else ds = datasets[s.data];
      }
      total += checkPace(errs, `${w}.pace`, s.pace);
      checkCaptions(errs, `${w}.captions`, s.captions, true);
    } else {
      total += isNum(s.duration) ? s.duration : 0;
    }
    const cols = new Set(Array.isArray(ds?.columns) ? ds.columns : []);
    const needCol = (field, v) => {
      if (v != null && v !== '' && ds && !cols.has(v)) errs.push(`${w}.${field}: "${v}" is not a column of dataset "${s.data}"`);
    };
    for (const f of ['valueFormat', 'tickFormat', 'yTickFormat', 'labelFormat', 'bigFormat']) checkFormat(errs, `${w}.${f}`, s[f]);
    switch (s.type) {
      case 'hook':
        if (!Array.isArray(s.lines) || !s.lines.length) errs.push(`${w}.lines must list at least one line, e.g. {"text": "...", "size": "big"}`);
        else s.lines.forEach((ln, j) => {
          if (!isObj(ln) || !isStr(ln.text)) errs.push(`${w}.lines[${j}] needs "text"`);
          else if (ln.size != null && !['big', 'small'].includes(ln.size)) errs.push(`${w}.lines[${j}].size must be "big" or "small"`);
        });
        break;
      case 'title':
        if (!isStr(s.title) || !s.title.trim()) errs.push(`${w}.title is required`);
        break;
      case 'barRace':
        needCol('highlight', s.highlight);
        needCol('pin', s.pin);
        if (s.nBars != null && !(Number.isInteger(s.nBars) && s.nBars >= 1 && s.nBars <= 30)) errs.push(`${w}.nBars must be a whole number from 1 to 30`);
        if (s.counter != null) {
          const c = s.counter;
          if (!isObj(c) || !datasets[c.data]) errs.push(`${w}.counter.data must name a dataset`);
          else if (!datasets[c.data].columns?.includes(c.column)) errs.push(`${w}.counter.column: "${c.column}" is not in dataset "${c.data}"`);
          if (isObj(c)) checkFormat(errs, `${w}.counter.format`, c.format);
        }
        break;
      case 'lineRace':
        if (s.series != null && !Array.isArray(s.series)) errs.push(`${w}.series must be a list of column names`);
        else for (const name of s.series ?? []) needCol('series', name);
        needCol('highlight', s.highlight);
        for (const f of ['yRange', 'xRange']) {
          if (s[f] != null && !(Array.isArray(s[f]) && s[f].length === 2 && s[f].every(isNum))) errs.push(`${w}.${f} must be [low, high]`);
        }
        if (s.markers != null && !Array.isArray(s.markers)) errs.push(`${w}.markers must be a list like [{"x": 2008, "label": "Crash"}]`);
        if (s.xMode != null && !['fixed', 'grow'].includes(s.xMode)) errs.push(`${w}.xMode must be "fixed" or "grow"`);
        break;
      case 'dotGrid':
        needCol('column', s.column);
        break;
      case 'growBars':
        if (!Array.isArray(s.items) || !s.items.length) errs.push(`${w}.items must list bars, e.g. [{"name": "India", "value": 72}]`);
        else s.items.forEach((it, j) => {
          const v = Array.isArray(it) ? it[1] : it?.value;
          const nm = Array.isArray(it) ? it[0] : it?.name;
          if (!isStr(nm) || !isNum(Number(v)) || v === null || v === '') errs.push(`${w}.items[${j}] needs a name and a numeric value`);
        });
        checkCaptions(errs, `${w}.captions`, s.captions, false);
        break;
      case 'statCards':
        if (!Array.isArray(s.cards) || !s.cards.length) errs.push(`${w}.cards must list 1 to 4 cards, e.g. {"big": "5th", "small": "largest economy"}`);
        else if (s.cards.length > 4) errs.push(`${w}.cards: at most 4 cards fit on screen`);
        break;
      default:
        break;
    }
    // Scene types can check their own fields (see scenes/*.js "static validate").
    if (typeof S.validate === 'function') {
      try {
        S.validate(s, { w, ds, datasets, errs, needCol });
      } catch (e) {
        errs.push(`${w}: ${e.message}`);
      }
    }
    for (const f of ['highlight']) if (S.paced && !S.dataKeys && s.type !== 'barRace' && s.type !== 'lineRace') needCol(f, s[f]);
  });
  if (total > MAX_SECONDS) errs.push(`The story is ${Math.round(total / 60)} minutes long; the limit is ${MAX_SECONDS / 60}`);
  return errs;
}
