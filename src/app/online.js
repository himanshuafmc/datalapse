// UI for the opt-in online features: a consent box naming every site, the
// public data catalogue (in the CSV wizard), and the AI voice (Audio tab).

import { h, toast } from './dom.js';
import { ONLINE_FEATURES, onlineOn, setOnline } from '../online/hosts.js';
import { CATALOGUE, TOPICS, searchCatalogue, fetchEntry } from '../online/catalogue.js';
import { VOICES, speak, loadVoice } from '../online/voice.js';
import { addAudio } from '../audio/library.js';

/** "Turn on" box listing exactly which sites the feature uses. */
export function consentBox(feature, onChange) {
  const f = ONLINE_FEATURES[feature];
  const on = onlineOn(feature);
  const box = h('div', { class: `consent${on ? ' on' : ''}` },
    h('p', { class: 'consent-head' }, h('strong', {}, f.label), on ? h('span', { class: 'pill ok' }, 'On') : h('span', { class: 'pill' }, 'Off')),
    h('p', { class: 'hint' }, f.why),
    h('p', { class: 'hint' }, 'It connects only to:'),
    h('ul', { class: 'hosts' }, f.hosts.map(([host, why]) => h('li', {}, h('code', {}, host), ` · ${why}`))),
    h('p', { class: 'hint' }, 'Everything else in Datalapse stays offline. You can turn this off again at any time.'),
    h('div', { class: 'row' }, h('button', {
      type: 'button', class: `btn small${on ? '' : ' primary'}`,
      onclick: () => {
        setOnline(feature, !on);
        toast(on ? `${f.label} turned off.` : `${f.label} turned on.`);
        onChange?.(!on);
      },
    }, on ? 'Turn off' : 'Turn on')));
  return box;
}

/** Public data catalogue inside the CSV wizard. onPick(sample) gets the table. */
export function renderCatalogue(container, onPick) {
  container.replaceChildren();
  if (!onlineOn('data')) {
    container.append(consentBox('data', () => renderCatalogue(container, onPick)));
    return;
  }
  const q = h('input', { type: 'search', id: 'cat-q', placeholder: 'Search, e.g. life expectancy, CO2, internet', 'aria-label': 'Search public data' });
  const topic = h('select', { id: 'cat-topic', 'aria-label': 'Topic' }, h('option', { value: '' }, 'All topics'), TOPICS.map((t) => h('option', { value: t }, t)));
  const keep = h('input', { type: 'checkbox', id: 'cat-keep', checked: true });
  const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
  const list = h('ul', { class: 'cat-list' });
  const draw = () => {
    const hits = searchCatalogue(q.value, topic.value);
    list.replaceChildren(...hits.map((e) => h('li', {},
      h('button', {
        type: 'button', class: 'cat-item',
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          status.classList.remove('problem');
          try {
            const sample = await fetchEntry(e, { keep: keep.checked ? 40 : 0, onStatus: (s) => (status.textContent = s) });
            status.textContent = `Got ${sample.table.columns.length} countries, ${sample.table.index[0]} to ${sample.table.index[sample.table.index.length - 1]}.`;
            onPick(sample);
          } catch (err) {
            status.textContent = err.message;
            status.classList.add('problem');
          } finally {
            btn.disabled = false;
          }
        },
      }, h('span', { class: 'cat-title' }, e.title), h('span', { class: 'cat-meta' }, `${e.topic} · ${e.source}`)))));
    if (!hits.length) list.append(h('li', { class: 'hint' }, 'Nothing matches. Try another word.'));
  };
  q.addEventListener('input', draw);
  topic.addEventListener('change', draw);
  draw();
  container.append(
    h('div', { class: 'row wrap' }, q, topic),
    h('label', { class: 'check', for: 'cat-keep' }, keep, ' Keep only countries that are ever in the top 40 (smaller, faster stories)'),
    list, status,
    h('p', { class: 'hint' }, `${CATALOGUE.length} datasets. Regions and income groups are left out; country names are matched to flags and translations. `,
      h('button', { type: 'button', class: 'linkish', onclick: () => { setOnline('data', false); renderCatalogue(container, onPick); } }, 'Turn online data off')),
  );
}

/** AI voice section for the Audio tab: speak every narration line. */
export function voicePanel(lines, setClip, rerender) {
  const box = h('div', { class: 'voice-box' });
  const draw = () => {
    box.replaceChildren(h('h4', {}, 'Free AI voice (English)'));
    if (!onlineOn('voice')) {
      box.append(consentBox('voice', draw));
      return;
    }
    const voice = h('select', { id: 'au-voice', 'aria-label': 'Voice' }, VOICES.map(([id, label]) => h('option', { value: id }, label)));
    const speed = h('input', { type: 'number', id: 'au-speed', min: 0.7, max: 1.3, step: 0.05, value: 1, class: 'narrow-input', 'aria-label': 'Speed' });
    const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
    const bar = h('div', { class: 'progress', hidden: true }, h('div', { class: 'progress-fill' }));
    const go = h('button', { type: 'button', class: 'btn small primary' }, 'Speak every line');
    const one = (l) => (l.text || '').trim();
    go.addEventListener('click', async () => {
      const todo = lines.filter((l) => one(l));
      if (!todo.length) return toast('Write the narration lines first (or have Claude write them).');
      go.disabled = true;
      status.classList.remove('problem');
      bar.hidden = false;
      try {
        await loadVoice((f, msg) => {
          bar.firstChild.style.width = `${Math.round(f * 100)}%`;
          status.textContent = msg;
        });
        for (const [k, l] of todo.entries()) {
          status.textContent = `Speaking line ${k + 1} of ${todo.length}…`;
          bar.firstChild.style.width = `${Math.round((k / todo.length) * 100)}%`;
          const blob = await speak(one(l), { voice: voice.value, speed: Number(speed.value) || 1 });
          setClip(l, await addAudio(blob, `${l.label} (${voice.value}).wav`));
        }
        bar.firstChild.style.width = '100%';
        status.textContent = `Done: ${todo.length} lines. Use "Fit the pace to the narration" so the video waits for the voice.`;
        rerender();
      } catch (e) {
        status.textContent = e.message;
        status.classList.add('problem');
      } finally {
        go.disabled = false;
      }
    });
    box.append(
      h('p', { class: 'hint' }, 'Kokoro-82M (Apache-2.0) runs on this device. The first use downloads about 90 MB; after that it works offline. AI voices are marked as such in the YouTube text; keep it that way for honesty with viewers.'),
      h('div', { class: 'row wrap' }, voice, h('label', { for: 'au-speed', class: 'inline-label' }, 'Speed'), speed, go),
      bar, status,
      h('p', { class: 'hint' }, h('button', { type: 'button', class: 'linkish', onclick: () => { setOnline('voice', false); draw(); } }, 'Turn the AI voice off')),
    );
  };
  draw();
  return box;
}
