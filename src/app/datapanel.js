// Data tab: what the story's tables contain, their names, colours and
// pictures, and one-click clean-ups.

import { h, toast, slug } from './dom.js';
import { saveOut } from './panels.js';
import { imageFileToDataURL, pickFile } from './media.js';
import { suggestNameFixes, applyNameFixes, rollUpToContinents, findCountry } from '../data/countries.js';
import { flagFor } from '../render/images.js';
import { COLORS, THEMES } from '../core/theme.js';
import { checkStory } from '../data/factcheck.js';
import { diagnose, transform, TRANSFORMS } from '../data/doctor.js';
import { FORMAT_PRESETS } from '../core/format.js';

function factSection(spec, goToScene) {
  const results = checkStory(spec);
  const count = (k) => results.filter((r) => r.status === k).length;
  const sec = h('section', { class: 'group' }, h('h3', {}, 'Fact check'));
  if (!results.length) {
    sec.append(h('p', { class: 'hint' }, 'No captions on chart scenes yet.'));
    return sec;
  }
  sec.append(h('div', { class: 'row wrap' },
    h('span', { class: 'pill ok' }, `${count('ok')} match the data`),
    count('mixed') ? h('span', { class: 'pill ok' }, `${count('mixed')} partly checked`) : '',
    count('bad') ? h('span', { class: 'pill bad' }, `${count('bad')} to check`) : '',
    h('span', { class: 'pill' }, `${count('none')} with nothing to check`)));
  sec.append(h('p', { class: 'hint' }, 'Numbers in captions are tested against the scene\'s own data. Facts from outside the data (history, other sources) can\'t be checked here, so check those yourself.'));
  for (const r of results.filter((x) => x.status === 'bad')) {
    sec.append(h('div', { class: 'fc-row' },
      h('span', { class: 'pill bad' }, `Scene ${r.scene + 1}`),
      h('span', { class: 'fc-text' }, r.text, h('small', {}, r.claims.filter((c) => c.status === 'bad').map((c) => `${c.raw}: ${c.note}`).join(' '))),
      h('button', { type: 'button', class: 'btn small', onclick: () => goToScene?.(r.scene) }, 'Open')));
  }
  return sec;
}

function doctorSection(store, id, d) {
  const sec = h('div', { class: 'doctor' });
  const issues = diagnose(d);
  const kinds = [...new Set(issues.map((i) => i.kind))];
  if (!issues.length) sec.append(h('p', { class: 'hint ok-line' }, 'No gaps, unit jumps, negatives or totals found.'));
  else {
    const list = h('ul', { class: 'issues' });
    for (const it of issues.slice(0, 12)) list.append(h('li', {}, it.text));
    if (issues.length > 12) list.append(h('li', {}, `…and ${issues.length - 12} more`));
    sec.append(list);
    const quick = h('div', { class: 'row wrap' });
    if (kinds.includes('gap')) quick.append(h('button', { type: 'button', class: 'btn small', onclick: () => run('fillGaps') }, 'Fill gaps'));
    if (kinds.includes('aggregate')) quick.append(h('button', { type: 'button', class: 'btn small', onclick: () => run('dropAggregates') }, 'Leave out totals and regions'));
    if (quick.children.length) sec.append(quick);
  }
  const sel = h('select', { id: `dr-${id}` }, Object.entries(TRANSFORMS).map(([k, t]) => h('option', { value: k }, t.label)));
  const param = h('input', { type: 'number', id: `dr-${id}-p`, class: 'narrow-input', hidden: true, 'aria-label': 'Amount' });
  const hint = h('p', { class: 'hint' });
  const sync = () => {
    const t = TRANSFORMS[sel.value];
    hint.textContent = t.hint;
    param.hidden = !t.param;
    if (t.param) param.value = t.param.value;
  };
  sel.addEventListener('change', sync);
  sync();
  function run(key, p) {
    let res;
    try {
      res = transform(d, key, p);
    } catch (e) {
      return toast(e.message, 'error');
    }
    if (res.warn && res.table === d) return toast(res.warn);
    store.update((s) => {
      s.datasets[id] = { ...s.datasets[id], columns: res.table.columns, values: res.table.values };
      for (const sc of s.scenes) {
        if (sc.data !== id) continue;
        if (res.note && !(sc.source ?? '').includes(res.note)) sc.source = sc.source ? `${sc.source} ${res.note}.` : `${res.note}.`;
        if (res.format && FORMAT_PRESETS[res.format]) {
          sc.valueFormat = { ...FORMAT_PRESETS[res.format].value };
          if (sc.type === 'barRace') sc.tickFormat = { ...FORMAT_PRESETS[res.format].tick };
          if (sc.type === 'lineRace') sc.yTickFormat = { ...FORMAT_PRESETS[res.format].tick };
        }
        if (Array.isArray(sc.series)) sc.series = sc.series.filter((n) => res.table.columns.includes(n));
      }
    }, null, { data: true });
    toast(`${TRANSFORMS[key].label}: done.${res.warn ? ` ${res.warn}` : ''}${res.note ? ' A note was added to the source line.' : ''} Undo with Ctrl+Z.`);
  }
  sec.append(h('div', { class: 'row wrap' }, h('label', { for: sel.id, class: 'visually-hidden' }, 'Transform'), sel, param,
    h('button', { type: 'button', class: 'btn small primary', onclick: () => run(sel.value, param.hidden ? undefined : Number(param.value)) }, 'Apply')), hint);
  return sec;
}

function csvOf(d) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [['Year', ...d.columns].map(esc).join(',')];
  d.index.forEach((y, k) => rows.push([y, ...d.values.map((col) => col[k] ?? '')].join(',')));
  return rows.join('\n');
}

function flagThumb(name) {
  const f = flagFor(name);
  if (!f) return null;
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 18;
  c.className = 'flag-thumb';
  c.getContext('2d').drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 24, 18);
  c.setAttribute('aria-hidden', 'true');
  return c;
}

export function renderDataPanel(root, { store, video, extra = [], goToScene }) {
  root.replaceChildren();
  const spec = store.spec;
  const T = THEMES[spec.theme?.name ?? 'midnight'] ?? THEMES.midnight;
  for (const el of extra) root.append(el);
  root.append(factSection(spec, goToScene));
  for (const [id, d] of Object.entries(spec.datasets ?? {})) {
    const lo = Math.min(...d.index);
    const hi = Math.max(...d.index);
    const nCountries = d.columns.filter((c) => findCountry(c)).length;

    // Names, colours and pictures
    const list = h('div', { class: 'entity-list' });
    const showAll = d.columns.length <= 24;
    const draw = (all) => {
      list.replaceChildren();
      for (const [k, c] of d.columns.entries()) {
        if (!all && k >= 24) break;
        const cur = spec.colors?.[c] ?? video?.env.colorOf(c) ?? COLORS[c] ?? T.accent;
        const color = h('input', { type: 'color', id: `col-${id}-${k}`, value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888', 'aria-label': `Colour for ${c}` });
        color.addEventListener('input', () => store.update((s) => (s.colors = { ...(s.colors ?? {}), [c]: color.value }), `color.${c}`));
        const img = spec.images?.[c];
        const pic = img ? h('img', { src: img, alt: '', class: 'entity-img' }) : flagThumb(c);
        const add = h('button', { type: 'button', class: 'btn ghost small', title: img ? 'Replace picture' : 'Add a logo or picture' }, img ? 'Replace' : 'Picture');
        add.addEventListener('click', async () => {
          const file = await pickFile('image/*');
          if (!file) return;
          try {
            const url = await imageFileToDataURL(file, 192);
            store.update((s) => (s.images = { ...(s.images ?? {}), [c]: url }));
            toast(`Picture added for ${c}. Turn on "Show flags and pictures" in a chart scene to see it.`);
            renderDataPanel(root, { store, video, extra, goToScene });
          } catch (e) {
            toast(e.message, 'error');
          }
        });
        const rm = img ? h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Remove picture for ${c}`, title: 'Remove picture',
          onclick: () => {
            store.update((s) => {
              delete s.images[c];
            });
            renderDataPanel(root, { store, video, extra, goToScene });
          },
        }, '×') : null;
        list.append(h('div', { class: 'entity' }, color, h('span', { class: 'entity-pic' }, pic), h('span', { class: 'entity-name' }, c), add, rm));
      }
      if (!all && d.columns.length > 24) {
        list.append(h('button', { type: 'button', class: 'btn small ghost', onclick: () => draw(true) }, `Show all ${d.columns.length}`));
      }
    };
    draw(showAll);

    // Clean-ups
    const fixes = suggestNameFixes(d.columns);
    const fixBox = h('div', { class: 'fixes' });
    if (fixes.length) {
      const checks = fixes.map((f, k) => {
        const cb = h('input', { type: 'checkbox', id: `fix-${id}-${k}`, checked: true });
        const verb = f.kind === 'merge' ? `Merge into "${f.into}"` : f.kind === 'rename' ? `Rename to "${f.into}"` : 'Leave out';
        fixBox.append(h('div', { class: 'field check' }, cb, h('label', { for: cb.id }, h('strong', {}, `${verb}: `), f.reason)));
        return cb;
      });
      fixBox.append(h('div', { class: 'row' }, h('button', {
        type: 'button', class: 'btn small primary',
        onclick: () => {
          const chosen = fixes.filter((_, k) => checks[k].checked);
          if (!chosen.length) return;
          store.update((s) => {
            const t = applyNameFixes(s.datasets[id], chosen);
            s.datasets[id] = { ...s.datasets[id], columns: t.columns, values: t.values };
            for (const sc of s.scenes) {
              if (sc.data !== id) continue;
              for (const f of chosen) {
                if (f.kind === 'rename' || f.kind === 'merge') {
                  const from = f.kind === 'rename' ? [f.from] : f.from;
                  for (const k of ['highlight', 'pin', 'column']) if (from.includes(sc[k])) sc[k] = f.into;
                  if (Array.isArray(sc.series)) sc.series = [...new Set(sc.series.map((n) => (from.includes(n) ? f.into : n)))];
                }
                if (f.kind === 'drop' && Array.isArray(sc.series)) sc.series = sc.series.filter((n) => !f.from.includes(n));
              }
            }
          }, null, { data: true });
          toast(`${chosen.length} name ${chosen.length === 1 ? 'fix' : 'fixes'} applied. Undo with Ctrl+Z.`);
        },
      }, 'Apply selected fixes')));
    } else {
      fixBox.append(h('p', { class: 'hint ok-line' }, 'Names look clean: no duplicates, codes or totals found.'));
    }

    const continents = nCountries >= 3 ? h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        const { table, skipped } = rollUpToContinents(d);
        const newId = `${id}_continents`;
        store.update((s) => (s.datasets[newId] = { index: [...table.index], columns: table.columns, values: table.values }), null, { data: true });
        toast(`Added "${newId}" with ${table.columns.length} continents${skipped.length ? ` (${skipped.length} names that aren't countries were left out)` : ''}. Pick it in a chart scene's Data field.`);
      },
    }, 'Add a by-continent table') : null;

    root.append(h('section', { class: 'group' },
      h('h3', {}, id),
      h('p', { class: 'hint' }, `${d.columns.length} series · ${d.index.length} time points · ${lo} to ${hi}${nCountries ? ` · ${nCountries} countries recognised` : ''}`),
      h('p', { class: 'field-label' }, 'Names, colours and pictures'),
      list,
      h('p', { class: 'field-label' }, 'Clean up names'),
      fixBox,
      h('p', { class: 'field-label' }, 'Health check and transforms'),
      doctorSection(store, id, d),
      h('div', { class: 'row wrap' }, continents,
        h('button', { type: 'button', class: 'btn small', onclick: () => saveOut(csvOf(d), `${slug(id)}.csv`) }, 'Save as CSV'))));
  }
  if (!Object.keys(spec.datasets ?? {}).length) root.append(h('p', { class: 'empty' }, 'This story has no data tables. Start one with New from CSV.'));
}
