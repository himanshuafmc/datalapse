// Story tab: look (theme, channel name, logo, colours), saved brand kits,
// languages, and the YouTube text.

import { h, toast, store as kv, clone } from './dom.js';
import { THEMES } from '../core/theme.js';
import { imageFileToDataURL, pickFile } from './media.js';
import { copyText } from './save.js';
import { claudeSample, askClaude } from './ai.js';
import { extractJSON } from '../spec/prompt.js';
import {
  LANGUAGES, EMBEDDED_SCRIPTS, languageLabel, translatableStrings, entityNames, translationProgress, translationPrompt,
} from '../spec/translate.js';
import { countryName } from '../data/countries.js';

const KITS_KEY = 'dl.kits.v1';

const field = (label, el, hint) => h('div', { class: 'field' }, h('label', { for: el.id, class: 'field-label' }, label), el, hint ? h('p', { class: 'hint' }, hint) : null);

export function renderStoryPanel(root, ctx) {
  const { store } = ctx;
  const spec = store.spec;
  root.replaceChildren();
  const theme = spec.theme ?? {};
  const set = (fn, key) => store.update(fn, key);
  const rerender = () => renderStoryPanel(root, ctx);

  // ------------------------------------------------------------ look
  const themeSel = h('select', { id: 'st-theme' }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k }, t.label)));
  themeSel.value = theme.name ?? 'midnight';
  themeSel.addEventListener('change', () => set((s) => (s.theme = { ...(s.theme ?? {}), name: themeSel.value })));
  const brand = h('input', { type: 'text', id: 'st-brand', value: theme.brand ?? '', placeholder: 'YOUR CHANNEL' });
  brand.addEventListener('input', () => set((s) => (s.theme = { ...(s.theme ?? {}), brand: brand.value }), 'brand'));
  const logoPreview = theme.logo ? h('img', { src: theme.logo, alt: 'Current logo', class: 'logo-preview' }) : h('span', { class: 'hint' }, 'No logo');
  const logoBtn = h('button', {
    type: 'button', class: 'btn small',
    onclick: async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      try {
        const url = await imageFileToDataURL(file, 320);
        set((s) => (s.theme = { ...(s.theme ?? {}), logo: url }));
        rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    },
  }, theme.logo ? 'Replace logo' : 'Add logo');
  const logoRm = theme.logo ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { set((s) => delete s.theme.logo); rerender(); } }, 'Remove') : null;
  const accent = h('input', { type: 'color', id: 'st-accent', value: theme.overrides?.accent ?? THEMES[theme.name ?? 'midnight']?.accent ?? '#FFB703' });
  accent.addEventListener('input', () => set((s) => {
    s.theme = { ...(s.theme ?? {}), overrides: { ...(s.theme?.overrides ?? {}), accent: accent.value } };
  }, 'accent'));
  const accentReset = h('button', {
    type: 'button', class: 'btn ghost small',
    onclick: () => {
      set((s) => {
        if (s.theme?.overrides) delete s.theme.overrides.accent;
      });
      accent.value = THEMES[themeSel.value]?.accent ?? '#FFB703';
    },
  }, 'Theme default');
  const cbSafe = h('input', { type: 'checkbox', id: 'st-cbsafe', checked: spec.palette === 'colorblind' });
  cbSafe.addEventListener('change', () => set((s) => {
    if (cbSafe.checked) s.palette = 'colorblind';
    else delete s.palette;
  }));
  const credit = h('input', { type: 'checkbox', id: 'st-credit', checked: spec.credit !== false });
  credit.addEventListener('change', () => set((s) => (s.credit = credit.checked)));
  const fps = h('select', { id: 'st-fps' }, [24, 25, 30, 60].map((n) => h('option', { value: n }, `${n} fps`)));
  fps.value = String(spec.fps ?? 30);
  fps.addEventListener('change', () => set((s) => (s.fps = Number(fps.value))));

  root.append(h('section', { class: 'group' },
    h('h3', {}, 'Look'),
    field('Theme', themeSel),
    field('Channel name', brand, 'Shown in the corner of chart scenes and on the title card. Leave empty for none.'),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Logo'), h('div', { class: 'row wrap' }, logoPreview, logoBtn, logoRm),
      h('p', { class: 'hint' }, 'Shown beside the channel name. A square or wide PNG with a transparent background works best.')),
    h('div', { class: 'field' }, h('label', { for: 'st-accent', class: 'field-label' }, 'Accent colour'), h('div', { class: 'color-row' }, accent, accentReset)),
    h('div', { class: 'field check' }, cbSafe, h('label', { for: 'st-cbsafe' }, 'Colour-blind-safe colours for entities')),
    field('Frame rate', fps),
    h('div', { class: 'field check' }, credit, h('label', { for: 'st-credit' }, 'Add a small "Made with Datalapse" line to the outro')),
  ));

  // ------------------------------------------------------------ brand kits
  const kits = kv(KITS_KEY) ?? [];
  const kitSel = h('select', { id: 'st-kit' }, kits.length ? kits.map((k, i) => h('option', { value: i }, k.name)) : h('option', { value: '' }, 'No saved kits yet'));
  const kitName = h('input', { type: 'text', id: 'st-kitname', placeholder: 'e.g. My channel' });
  root.append(h('section', { class: 'group' },
    h('h3', {}, 'Brand kits'),
    h('p', { class: 'hint' }, 'Save this look (theme, channel name, logo, accent, credit) and apply it to any story. Kits are kept in this browser.'),
    h('div', { class: 'row' }, kitSel,
      h('button', {
        type: 'button', class: 'btn small', disabled: !kits.length,
        onclick: () => {
          const k = kits[Number(kitSel.value)];
          if (!k) return;
          set((s) => {
            s.theme = clone(k.theme);
            s.credit = k.credit;
            if (k.palette) s.palette = k.palette;
            else delete s.palette;
          });
          toast(`Applied "${k.name}"`);
          rerender();
        },
      }, 'Apply'),
      h('button', {
        type: 'button', class: 'btn small ghost', disabled: !kits.length,
        onclick: () => {
          kits.splice(Number(kitSel.value), 1);
          kv(KITS_KEY, kits);
          rerender();
        },
      }, 'Delete')),
    h('div', { class: 'row' }, h('label', { for: 'st-kitname', class: 'visually-hidden' }, 'Kit name'), kitName,
      h('button', {
        type: 'button', class: 'btn small',
        onclick: () => {
          const name = kitName.value.trim() || spec.theme?.brand || 'My kit';
          const k = { name, theme: clone(spec.theme ?? {}), credit: spec.credit !== false, palette: spec.palette };
          const at = kits.findIndex((x) => x.name === name);
          if (at >= 0) kits[at] = k;
          else kits.push(k);
          kv(KITS_KEY, kits);
          toast(`Saved kit "${name}"`);
          rerender();
        },
      }, 'Save as kit'))));

  // ------------------------------------------------------------ languages
  root.append(languagesSection(ctx, rerender));

  // ------------------------------------------------------------ YouTube
  const meta = spec.meta ?? {};
  const mText = (key, label, rows = 0, hint = null) => {
    const el = rows ? h('textarea', { id: `st-${key}`, rows }) : h('input', { type: 'text', id: `st-${key}` });
    const v = meta[key];
    el.value = Array.isArray(v) ? v.join(key === 'tags' ? ', ' : ' ') : v ?? '';
    el.addEventListener('input', () => set((s) => {
      s.meta = { ...(s.meta ?? {}) };
      if (key === 'hashtags') s.meta[key] = el.value.split(/\s+/).filter(Boolean);
      else if (key === 'tags') s.meta[key] = el.value.split(',').map((t) => t.trim()).filter(Boolean);
      else s.meta[key] = el.value;
    }, `meta.${key}`));
    return field(label, el, hint);
  };
  root.append(h('section', { class: 'group' },
    h('h3', {}, 'YouTube'),
    mText('title', 'Video title'),
    mText('shorts_title', 'Shorts title (vertical version)'),
    mText('description', 'Description', 4),
    mText('sources', 'Sources (one line)'),
    mText('hashtags', 'Hashtags', 0, 'Separated by spaces, e.g. #dataviz #india'),
    mText('tags', 'Tags', 0, 'Separated by commas'),
    mText('pinned_comment', 'Pinned comment idea', 2),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: ctx.onYoutube }, 'Save description with chapters (.txt)'))));
}

function languagesSection(ctx, rerender) {
  const { store } = ctx;
  const spec = store.spec;
  const trs = spec.translations ?? {};
  const box = h('section', { class: 'group' }, h('h3', {}, 'Languages'),
    h('p', { class: 'hint' }, 'Make the same video in other languages. Country names translate automatically; the rest you translate here or with an AI. Hindi and Marathi use the video\'s own fonts; other scripts use the viewer\'s system fonts.'));
  for (const [lang] of Object.entries(trs)) {
    const pct = Math.round(translationProgress(spec, lang) * 100);
    box.append(h('div', { class: 'lang-row' },
      h('span', { class: 'lang-name' }, languageLabel(lang)),
      h('span', { class: `pill ${pct === 100 ? 'ok' : 'warn'}` }, `${pct}% translated`),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.onPreviewLang(lang) }, 'Preview'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { ctx.editingLang = lang; rerender(); } }, 'Edit'),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Remove ${languageLabel(lang)}`, title: 'Remove',
        onclick: () => {
          store.update((s) => delete s.translations[lang]);
          if (ctx.editingLang === lang) ctx.editingLang = null;
          ctx.onPreviewLang(null);
          rerender();
        },
      }, '×')));
  }
  const add = h('select', { id: 'st-addlang' }, LANGUAGES.filter(([c]) => !trs[c]).map(([c, en, native]) => h('option', { value: c }, `${en} (${native})`)));
  box.append(h('div', { class: 'row' }, h('label', { for: 'st-addlang', class: 'visually-hidden' }, 'Language to add'), add,
    h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        const lang = add.value;
        store.update((s) => (s.translations = { ...(s.translations ?? {}), [lang]: { strings: {}, names: {}, countryNames: true } }));
        ctx.editingLang = lang;
        rerender();
      },
    }, 'Add language')));
  if (ctx.editingLang && trs[ctx.editingLang]) box.append(translationEditor(ctx, ctx.editingLang, rerender));
  return box;
}

function translationEditor(ctx, lang, rerender) {
  const { store } = ctx;
  const spec = store.spec;
  const tr = spec.translations[lang];
  const wrap = h('div', { class: 'tr-editor' }, h('h4', {}, `Translating to ${languageLabel(lang)}`));
  if (!EMBEDDED_SCRIPTS.has(lang)) wrap.append(h('p', { class: 'hint' }, 'This script is not embedded: check the export on the computer you will render on, since fonts come from its system.'));

  // AI route
  const prompt = translationPrompt(spec, lang);
  const reply = h('textarea', { id: 'tr-reply', rows: 4, class: 'code', placeholder: 'Paste the AI reply here', spellcheck: false });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const applyReply = (text) => {
    try {
      const obj = extractJSON(text);
      const strings = obj.strings ?? obj;
      const names = obj.names ?? {};
      store.update((s) => {
        const t = s.translations[lang];
        t.strings = { ...t.strings, ...Object.fromEntries(Object.entries(strings).filter(([, v]) => typeof v === 'string' && v.trim())) };
        t.names = { ...t.names, ...Object.fromEntries(Object.entries(names).filter(([k, v]) => typeof v === 'string' && v.trim() && v !== k)) };
      });
      toast('Translation added. Preview it, and check it with a native speaker before publishing.');
      rerender();
    } catch (e) {
      status.textContent = `Could not read the reply: ${e.message}`;
    }
  };
  const aiRow = h('div', { class: 'row wrap' },
    h('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(prompt)) ? 'Prompt copied. Paste it into any AI, then paste the reply below.' : 'Copy failed; select the prompt text instead.') }, 'Copy prompt'));
  claudeSample().then((sample) => {
    if (!sample) return;
    const btn = h('button', { type: 'button', class: 'btn small primary' }, 'Translate with Claude');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.textContent = 'Claude is translating…';
      try {
        const text = await askClaude(prompt, { onText: ({ text: tt }) => (status.textContent = `Claude is translating… ${tt.length} characters`) });
        applyReply(text);
      } catch (e) {
        status.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });
    aiRow.prepend(btn);
  });
  wrap.append(aiRow, h('label', { for: 'tr-reply', class: 'visually-hidden' }, 'AI reply'), reply,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small', onclick: () => applyReply(reply.value) }, 'Use this reply')), status);

  // Names
  const auto = h('input', { type: 'checkbox', id: 'tr-auto', checked: tr.countryNames !== false });
  auto.addEventListener('change', () => store.update((s) => (s.translations[lang].countryNames = auto.checked)));
  wrap.append(h('div', { class: 'field check' }, auto, h('label', { for: 'tr-auto' }, 'Translate country names automatically')));
  const names = entityNames(spec);
  if (names.length) {
    const list = h('div', { class: 'tr-list' });
    names.slice(0, 80).forEach((n, k) => {
      const autoName = tr.countryNames !== false ? countryName(n, lang) : null;
      const inp = h('input', { type: 'text', id: `tr-n-${k}`, value: tr.names?.[n] ?? '', placeholder: autoName ?? n, 'aria-label': `${n} in ${languageLabel(lang)}` });
      inp.addEventListener('input', () => store.update((s) => {
        const t = s.translations[lang];
        t.names = { ...(t.names ?? {}) };
        if (inp.value.trim()) t.names[n] = inp.value;
        else delete t.names[n];
      }, `tr.${lang}.n.${n}`));
      list.append(h('div', { class: 'tr-item' }, h('span', { class: 'tr-src' }, n), inp));
    });
    wrap.append(h('details', {}, h('summary', {}, `Names (${names.length})`), list));
  }

  // Strings
  const list = h('div', { class: 'tr-list' });
  translatableStrings(spec).forEach((item, k) => {
    const el = item.text.length > 60 ? h('textarea', { id: `tr-s-${k}`, rows: 2 }) : h('input', { type: 'text', id: `tr-s-${k}` });
    el.value = tr.strings?.[item.path] ?? '';
    el.placeholder = item.text;
    el.setAttribute('aria-label', `${item.where}: ${item.text}`);
    el.addEventListener('input', () => store.update((s) => {
      const t = s.translations[lang];
      t.strings = { ...(t.strings ?? {}) };
      if (el.value.trim()) t.strings[item.path] = el.value;
      else delete t.strings[item.path];
    }, `tr.${lang}.${item.path}`));
    list.append(h('div', { class: 'tr-item' }, h('span', { class: 'tr-src' }, h('small', {}, item.where), item.text), el));
  });
  wrap.append(h('details', { open: true }, h('summary', {}, `Text (${translatableStrings(spec).length} pieces)`), list));
  return wrap;
}
