// The JSON editor, the "Ask your AI" dialog and file saving.

import { h, $, toast, slug, clone } from './dom.js';
import { validateSpec } from '../spec/validate.js';
import { buildPrompt, extractJSON } from '../spec/prompt.js';
import { saveFile, copyText } from './save.js';
import { claudeSample, askClaude } from './ai.js';
import { storyFingerprint } from '../export/stamp.js';
import { shareCodeFrom, decodeStory } from '../export/share.js';

/** JSON with short arrays of numbers/strings kept on one line. */
export function prettySpec(v, ind = '') {
  const next = ind + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
    return `[\n${v.map((x) => next + prettySpec(x, next)).join(',\n')}\n${ind}]`;
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!keys.length) return '{}';
    const flat = keys.every((k) => v[k] === null || typeof v[k] !== 'object');
    const one = `{ ${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(v[k])}`).join(', ')} }`;
    if (flat && one.length < 100) return one;
    return `{\n${keys.map((k) => `${next}${JSON.stringify(k)}: ${prettySpec(v[k], next)}`).join(',\n')}\n${ind}}`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------- JSON tab
export function renderJsonPanel(root, { store, onApply }) {
  root.replaceChildren();
  const ta = h('textarea', { id: 'json-editor', class: 'code big', spellcheck: false, 'aria-label': 'Story as JSON' });
  ta.value = prettySpec(store.spec);
  const problems = h('ul', { class: 'problems', 'aria-live': 'polite' });
  const fp = h('p', { class: 'hint tnum' });
  const showFp = () => (fp.textContent = `Story fingerprint: ${storyFingerprint(store.spec)} (changes whenever the data, text or timing changes)`);
  showFp();
  const check = () => {
    problems.replaceChildren();
    let spec;
    if (shareCodeFrom(ta.value)) return 'share';
    try {
      spec = extractJSON(ta.value);
    } catch (e) {
      problems.append(h('li', {}, `Not valid JSON: ${e.message}`));
      return null;
    }
    const errs = validateSpec(spec);
    for (const e of errs.slice(0, 12)) problems.append(h('li', {}, e));
    if (errs.length > 12) problems.append(h('li', {}, `…and ${errs.length - 12} more`));
    return errs.length ? null : spec;
  };
  const open = h('input', { type: 'file', accept: '.json,application/json', id: 'json-open', class: 'visually-hidden' });
  open.addEventListener('change', async () => {
    const f = open.files[0];
    if (!f) return;
    ta.value = await f.text();
    const spec = check();
    if (spec) onApply(spec);
  });
  root.append(
    h('p', { class: 'hint' }, 'The whole story is plain JSON: scenes, data, captions and styles. Edit it here, keep it in Git, or have an AI write it. You can also paste a Datalapse share link here and press Apply.'),
    h('div', { class: 'row wrap' },
      h('button', {
        type: 'button', class: 'btn primary small',
        onclick: async () => {
          const s = check();
          if (s === 'share') {
            try {
              const spec = await decodeStory(shareCodeFrom(ta.value));
              ta.value = prettySpec(spec);
              const ok = check();
              if (ok) {
                onApply(ok);
                toast('Opened the shared story');
              }
            } catch (e) {
              problems.replaceChildren(h('li', {}, `That share link could not be read: ${e.message}`));
            }
          } else if (s) {
            onApply(s);
            toast('Story updated');
          }
          showFp();
        },
      }, 'Apply'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { ta.value = prettySpec(store.spec); check(); } }, 'Reload from preview'),
      h('button', { type: 'button', class: 'btn small', onclick: () => open.click() }, 'Open .json'),
      h('button', { type: 'button', class: 'btn small', onclick: () => saveOut(prettySpec(store.spec), `${slug(store.spec.id ?? store.spec.meta?.title)}.json`) }, 'Save .json'),
      open),
    ta, problems, fp);
  check();
}

async function saveOut(data, name) {
  try {
    const r = await saveFile(data, name);
    if (r === 'saved') toast(`Saved ${name}`);
    else if (r === 'maybe') toast(`Downloading ${name}. If nothing appears, open the studio in its own tab.`);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ------------------------------------------------------------ Ask your AI
export function openAiDialog({ store, onLoad }) {
  const dlg = $('#ai');
  const body = $('#ai-body', dlg);
  const topic = h('textarea', { id: 'ai-topic', rows: 3, placeholder: 'e.g. How smartphones took over India, 2007–2024' });
  const useData = h('input', { type: 'checkbox', id: 'ai-usedata' });
  const prompt = h('textarea', { id: 'ai-prompt', rows: 9, class: 'code', readonly: true, spellcheck: false });
  const firstDs = Object.entries(store.spec?.datasets ?? {})[0];
  const refresh = () => {
    prompt.value = buildPrompt({ topic: topic.value.trim(), table: useData.checked && firstDs ? firstDs[1] : null });
  };
  topic.addEventListener('input', refresh);
  useData.addEventListener('change', refresh);
  refresh();
  const copy = h('button', {
    type: 'button', class: 'btn primary small',
    onclick: async () => toast((await copyText(prompt.value, prompt)) ? 'Prompt copied. Paste it into ChatGPT, Claude or Gemini.' : 'Press Ctrl+C (Cmd+C) to copy the selected prompt.'),
  }, 'Copy prompt');
  const reply = h('textarea', { id: 'ai-reply', rows: 8, class: 'code', spellcheck: false, placeholder: 'Paste the whole reply here. Code fences and extra text are fine.' });
  const problems = h('ul', { class: 'problems', 'aria-live': 'polite' });
  const claudeStatus = h('p', { class: 'hint', 'aria-live': 'polite' });
  const copyRow = h('div', { class: 'row wrap' }, copy);
  claudeSample().then((sample) => {
    if (!sample) return;
    const ask = h('button', { type: 'button', class: 'btn primary small' }, 'Write it with Claude');
    ask.addEventListener('click', async () => {
      ask.disabled = true;
      claudeStatus.textContent = 'Claude is writing the story. This can take a minute…';
      try {
        reply.value = await askClaude(prompt.value, { onText: ({ text }) => { reply.value = text; claudeStatus.textContent = `Writing… ${text.length.toLocaleString()} characters`; } });
        claudeStatus.textContent = 'Done. Check it, then Load story.';
      } catch (e) {
        claudeStatus.textContent = e.message;
      } finally {
        ask.disabled = false;
      }
    });
    copyRow.prepend(ask);
  });
  const load = h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => {
      problems.replaceChildren();
      let spec;
      try {
        spec = extractJSON(reply.value);
      } catch (e) {
        problems.append(h('li', {}, e.message));
        return;
      }
      if (!spec.datasets && useData.checked && firstDs) spec.datasets = { main: clone(firstDs[1]) };
      spec.version ??= 1;
      const errs = validateSpec(spec);
      if (errs.length) {
        for (const e of errs.slice(0, 10)) problems.append(h('li', {}, e));
        problems.append(h('li', { class: 'hint' }, 'Paste these problems back to your AI and ask it to fix them.'));
        return;
      }
      onLoad(spec);
      dlg.close();
      toast('Story loaded from your AI. Check every number against its source before you publish.');
    },
  }, 'Load story');
  body.replaceChildren(
    h('section', { class: 'wiz-step' },
      h('h3', {}, h('span', { class: 'step-no' }, '1'), 'Copy a prompt'),
      h('div', { class: 'field' }, h('label', { for: 'ai-topic', class: 'field-label' }, 'Topic'), topic),
      firstDs ? h('div', { class: 'field check' }, useData, h('label', { for: 'ai-usedata' }, `Build it on my current data (${firstDs[1].columns.length} series)`)) : null,
      h('label', { for: 'ai-prompt', class: 'visually-hidden' }, 'Prompt'), prompt,
      copyRow, claudeStatus),
    h('section', { class: 'wiz-step' },
      h('h3', {}, h('span', { class: 'step-no' }, '2'), 'Paste the reply'),
      h('label', { for: 'ai-reply', class: 'visually-hidden' }, 'AI reply'), reply, problems,
      h('p', { class: 'hint' }, 'AI models get numbers wrong. Treat the result as a draft and check the data.'),
      h('div', { class: 'row end' }, load)));
  dlg.showModal();
}

export { saveOut };
