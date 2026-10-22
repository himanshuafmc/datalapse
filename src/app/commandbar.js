// The command box: type what you want changed. Common requests are
// understood offline; others go to Claude (when available here) or to any
// AI through a copied prompt.

import { h, $, toast } from './dom.js';
import { parseCommand, COMMAND_EXAMPLES, editPrompt, applyEdits } from '../spec/commands.js';
import { extractJSON } from '../spec/prompt.js';
import { claudeSample, askClaude } from './ai.js';
import { copyText } from './save.js';

export function initCommandBar({ store, getSelected, setFormat, addLanguage }) {
  const form = $('#cmd-form');
  const input = $('#cmd');
  const list = $('#cmd-examples');
  list.replaceChildren(...COMMAND_EXAMPLES.map((c) => h('option', { value: c })));
  const run = async (text) => {
    if (!text.trim()) return;
    const res = parseCommand(text, store.spec, { selected: getSelected(), setFormat, addLanguage });
    if (res.ok) {
      store.update((s) => res.apply(s));
      res.ui?.();
      toast(`${res.message} Undo with Ctrl+Z.`);
      input.value = '';
      return;
    }
    openAiFallback({ store, text, selected: getSelected(), onDone: () => (input.value = '') });
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
  });
}

function openAiFallback({ store, text, selected, onDone }) {
  const dlg = $('#cmd-dialog');
  const body = $('#cmd-dialog-body');
  const prompt = editPrompt(store.spec, text, selected);
  const reply = h('textarea', { id: 'cmd-reply', rows: 6, class: 'code', spellcheck: false, placeholder: 'Paste the AI reply (a JSON list of edits)' });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const apply = (raw) => {
    try {
      const edits = extractJSON(raw);
      const list = Array.isArray(edits) ? edits : edits.edits;
      let n = 0;
      store.update((s) => {
        n = applyEdits(s, list);
      });
      toast(`${n} change${n === 1 ? '' : 's'} applied. Undo with Ctrl+Z.`);
      onDone();
      dlg.close();
    } catch (e) {
      status.textContent = `Could not apply: ${e.message}`;
    }
  };
  const aiRow = h('div', { class: 'row wrap' },
    h('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(prompt)) ? 'Prompt copied. Paste it into any AI.' : 'Copy failed.') }, 'Copy prompt for your AI'));
  claudeSample().then((sample) => {
    if (!sample) return;
    const btn = h('button', { type: 'button', class: 'btn small primary' }, 'Ask Claude to do it');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.textContent = 'Claude is working on it…';
      try {
        const out = await askClaude(prompt, { tier: 'default' });
        reply.value = out;
        apply(out);
      } catch (e) {
        status.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });
    aiRow.prepend(btn);
  });
  body.replaceChildren(
    h('p', {}, h('strong', {}, 'Datalapse doesn\'t know how to do that on its own yet: '), `"${text}"`),
    h('p', { class: 'hint' }, `Things it understands: ${COMMAND_EXAMPLES.slice(0, 6).join(' · ')}.`),
    aiRow,
    h('label', { for: 'cmd-reply', class: 'visually-hidden' }, 'AI reply'), reply,
    h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn small', onclick: () => apply(reply.value) }, 'Apply the reply')),
    status);
  dlg.showModal();
}
