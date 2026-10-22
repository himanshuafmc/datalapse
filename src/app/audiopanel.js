// Audio tab: background music with beat sync, and narration (write a
// script, record or import a clip per line, fit the pace to it).

import { h, $, toast } from './dom.js';
import { addAudio, getBuffer, hasLoaded, audioContext } from '../audio/library.js';
import { detectBeats } from '../audio/beats.js';
import { snapToBeats, fitToNarration } from '../audio/sync.js';
import { pickFile } from './media.js';
import { claudeSample, askClaude } from './ai.js';
import { copyText } from './save.js';
import { extractJSON } from '../spec/prompt.js';

const DATA = new Set(['barRace', 'lineRace', 'dotGrid', 'growBars']);

/** Lines a narrator might read: one per caption, plus the hook, title and outro. */
export function narrationLines(spec) {
  const script = spec.audio?.narration?.lines ?? [];
  const find = (scene, caption) => script.find((l) => l.scene === scene && (l.caption ?? null) === (caption ?? null));
  const out = [];
  spec.scenes.forEach((s, i) => {
    if (s.type === 'hook') out.push({ scene: i, caption: null, at: 0.3, label: `Scene ${i + 1} · Hook`, text: find(i, null)?.text ?? (s.lines ?? []).map((l) => l.text).join(' ') });
    else if (s.type === 'title') out.push({ scene: i, caption: null, at: 0.3, label: `Scene ${i + 1} · Title`, text: find(i, null)?.text ?? [s.title, s.subtitle].filter(Boolean).join('. ') });
    else if (DATA.has(s.type)) {
      (s.captions ?? []).forEach((c, j) => out.push({ scene: i, caption: j, label: `Scene ${i + 1} · ${c.kicker || c.year || `${c.at}s`}`, text: find(i, j)?.text ?? c.text ?? '' }));
    } else if (s.type === 'statCards') out.push({ scene: i, caption: null, at: 0.5, label: `Scene ${i + 1} · Recap`, text: find(i, null)?.text ?? [s.heading, ...(s.cards ?? []).map((c) => (Array.isArray(c) ? `${c[0]}: ${c[1]}` : `${c.big}: ${c.small}`))].filter(Boolean).join('. ') });
    else if (s.type === 'outro') out.push({ scene: i, caption: null, at: 0.4, label: `Scene ${i + 1} · Outro`, text: find(i, null)?.text ?? [s.question, s.cta ?? 'Tell us in the comments'].filter(Boolean).join(' ') });
  });
  return out;
}

function scriptPrompt(spec) {
  const lines = narrationLines(spec).map((l, k) => ({ k, where: l.label, onScreen: l.text }));
  return [
    'Write a voiceover script for this data video. One spoken line per item, timed to what is on screen.',
    'Each line: 1-3 short sentences, conversational, under 12 seconds when read aloud. Do not repeat the on-screen text word for word; add the why. Keep every number exactly as given.',
    'Reply with ONLY JSON: { "lines": [ { "k": <same k>, "text": "..." } ] }.',
    '',
    `Video title: ${spec.meta?.title ?? spec.scenes.find((s) => s.title)?.title ?? ''}`,
    JSON.stringify(lines, null, 1),
  ].join('\n');
}

async function playBuffer(id) {
  const buf = await getBuffer(id);
  if (!buf) return toast('That clip is not in this browser any more. Record or import it again.', 'error');
  const ctx = audioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}

/** Teleprompter: read the line, record it with the microphone. Resolves to a Blob or null. */
function recordLine(text) {
  return new Promise((resolve) => {
    const dlg = $('#rec-dialog');
    const body = $('#rec-dialog-body');
    let stream = null;
    let rec = null;
    let chunks = [];
    let blob = null;
    const status = h('p', { class: 'hint', 'aria-live': 'polite' }, 'Press Record, wait for the count, then read the line.');
    const start = h('button', { type: 'button', class: 'btn primary' }, 'Record');
    const stop = h('button', { type: 'button', class: 'btn', hidden: true }, 'Stop');
    const listen = h('button', { type: 'button', class: 'btn', hidden: true }, 'Listen');
    const keep = h('button', { type: 'button', class: 'btn primary', hidden: true }, 'Use this take');
    const cleanup = () => stream?.getTracks().forEach((t) => t.stop());
    start.addEventListener('click', async () => {
      try {
        stream = stream ?? (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
      } catch {
        status.textContent = 'The microphone is not available here. Open Datalapse in its own browser tab to record, or import a recording instead.';
        status.classList.add('problem');
        return;
      }
      for (const n of [3, 2, 1]) {
        status.textContent = `Recording in ${n}…`;
        await new Promise((r) => setTimeout(r, 700));
      }
      chunks = [];
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        status.textContent = 'Done. Listen, then use it or record again.';
        listen.hidden = false;
        keep.hidden = false;
        start.hidden = false;
        start.textContent = 'Record again';
        stop.hidden = true;
      };
      rec.start();
      status.textContent = 'Recording… read the line now.';
      start.hidden = true;
      stop.hidden = false;
    });
    stop.addEventListener('click', () => rec?.state === 'recording' && rec.stop());
    listen.addEventListener('click', () => blob && new Audio(URL.createObjectURL(blob)).play());
    keep.addEventListener('click', () => {
      cleanup();
      dlg.close();
      resolve(blob);
    });
    dlg.addEventListener('close', () => {
      cleanup();
      resolve(null);
    }, { once: true });
    body.replaceChildren(h('p', { class: 'prompter' }, text || '(no text)'), status, h('div', { class: 'row end' }, start, stop, listen, keep));
    dlg.showModal();
  });
}

export function renderAudioPanel(root, ctx) {
  const { store } = ctx;
  const spec = store.spec;
  const audio = spec.audio ?? {};
  const music = audio.music ?? null;
  const rerender = () => renderAudioPanel(root, ctx);
  const setAudio = (fn, key) => store.update((s) => {
    s.audio = s.audio ?? {};
    fn(s.audio);
  }, key);
  root.replaceChildren();

  // ------------------------------------------------------------ music
  const sec = h('section', { class: 'group' }, h('h3', {}, 'Music'));
  const add = h('button', { type: 'button', class: 'btn small primary' }, music ? 'Replace music' : 'Add music');
  add.addEventListener('click', async () => {
    const file = await pickFile('audio/*');
    if (!file) return;
    add.disabled = true;
    add.textContent = 'Reading…';
    try {
      const info = await addAudio(file, file.name);
      const buf = await getBuffer(info.id);
      const beat = detectBeats(buf);
      setAudio((a) => (a.music = { id: info.id, name: info.name, duration: Math.round(info.duration * 10) / 10, volume: 0.7, offset: 0, fadeIn: 1, fadeOut: 3, loop: true, bpm: beat.bpm, beatStrength: Math.round(beat.strength * 100) / 100, beats: beat.beats.slice(0, 2000) }));
      toast(beat.bpm ? `Music added: about ${Math.round(beat.bpm)} beats per minute.` : 'Music added. No clear beat found, so beat sync is off.');
    } catch (e) {
      toast(e.message, 'error');
    }
    rerender();
  });
  sec.append(h('p', { class: 'hint' }, 'Use music you have the rights to use, such as tracks from the YouTube Audio Library. The file stays on this device.'));
  if (!music) sec.append(h('div', { class: 'row' }, add));
  else {
    const loaded = hasLoaded(music.id);
    const status = h('span', { class: `pill ${loaded ? 'ok' : 'warn'}` }, loaded ? 'Ready' : 'Checking…');
    if (!loaded) getBuffer(music.id).then((b) => {
      status.className = `pill ${b ? 'ok' : 'bad'}`;
      status.textContent = b ? 'Ready' : 'File missing: add it again';
    });
    const vol = h('input', { type: 'range', id: 'au-vol', min: 0, max: 1, step: 0.05, value: music.volume ?? 0.7 });
    vol.addEventListener('input', () => setAudio((a) => (a.music.volume = Number(vol.value)), 'au.vol'));
    const num = (id, key, label, step, min) => {
      const el = h('input', { type: 'number', id, step, min, value: music[key] ?? 0, class: 'narrow-input' });
      el.addEventListener('input', () => Number.isFinite(Number(el.value)) && setAudio((a) => (a.music[key] = Number(el.value)), `au.${key}`));
      return h('div', { class: 'field narrow' }, h('label', { for: id, class: 'field-label' }, label), el);
    };
    const loop = h('input', { type: 'checkbox', id: 'au-loop', checked: music.loop !== false });
    loop.addEventListener('change', () => setAudio((a) => (a.music.loop = loop.checked)));
    const snap = h('button', { type: 'button', class: 'btn small', disabled: !music.beats?.length }, 'Snap captions and cuts to the beat');
    snap.addEventListener('click', () => {
      const beats = (music.beats ?? []).map((b) => b - (music.offset ?? 0)).filter((b) => b >= 0);
      let moved = 0;
      store.update((s) => {
        moved = snapToBeats(s, beats, { fps: s.fps ?? 30 });
      });
      toast(moved ? `${moved} captions and cuts moved onto the beat. Undo with Ctrl+Z.` : 'Everything already sits on the beat.');
    });
    sec.append(
      h('div', { class: 'lang-row' }, h('span', { class: 'lang-name' }, music.name), status, h('span', { class: 'spacer' }),
        h('span', { class: 'hint' }, `${music.duration ?? '?'} s${music.bpm ? ` · ${Math.round(music.bpm)} bpm` : ''}`)),
      h('div', { class: 'field' }, h('label', { for: 'au-vol', class: 'field-label' }, 'Volume'), vol),
      h('div', { class: 'grid-fields' }, num('au-off', 'offset', 'Start the track at (s)', 0.1, 0), num('au-fi', 'fadeIn', 'Fade in (s)', 0.5, 0), num('au-fo', 'fadeOut', 'Fade out (s)', 0.5, 0)),
      h('div', { class: 'field check' }, loop, h('label', { for: 'au-loop' }, 'Loop the track if the video is longer')),
      h('div', { class: 'row wrap' }, snap, add, h('button', { type: 'button', class: 'btn small ghost', onclick: () => { setAudio((a) => delete a.music); rerender(); } }, 'Remove')),
      music.bpm ? h('p', { class: 'hint' }, 'Beat sync makes tiny changes to the pace so captions and scene changes land on a beat.') : h('p', { class: 'hint' }, 'No clear beat was found in this track.'));
  }
  root.append(sec);

  // ------------------------------------------------------------ narration
  const nar = audio.narration ?? {};
  const clips = nar.clips ?? [];
  const nsec = h('section', { class: 'group' }, h('h3', {}, 'Narration'));
  const duck = h('input', { type: 'range', id: 'au-duck', min: 0, max: 1, step: 0.05, value: nar.duck ?? 0.3 });
  duck.addEventListener('input', () => setAudio((a) => (a.narration = { ...(a.narration ?? {}), duck: Number(duck.value) }), 'au.duck'));
  const pause = h('input', { type: 'checkbox', id: 'au-pause', checked: nar.pauseRace !== false });
  pause.addEventListener('change', () => setAudio((a) => (a.narration = { ...(a.narration ?? {}), pauseRace: pause.checked })));
  const lines = narrationLines(spec);
  const clipFor = (l) => clips.find((c) => c.scene === l.scene && (c.caption ?? null) === (l.caption ?? null));
  const setClip = (l, clip) => setAudio((a) => {
    a.narration = { ...(a.narration ?? {}) };
    const list = (a.narration.clips ?? []).filter((c) => !(c.scene === l.scene && (c.caption ?? null) === (l.caption ?? null)));
    if (clip) list.push({ id: clip.id, name: clip.name, duration: Math.round(clip.duration * 100) / 100, scene: l.scene, caption: l.caption, at: l.caption == null ? l.at : undefined });
    a.narration.clips = list;
  });
  const setLine = (l, text) => setAudio((a) => {
    a.narration = { ...(a.narration ?? {}) };
    const list = (a.narration.lines ?? []).filter((x) => !(x.scene === l.scene && (x.caption ?? null) === (l.caption ?? null)));
    list.push({ scene: l.scene, caption: l.caption, text });
    a.narration.lines = list;
  }, `au.line.${l.scene}.${l.caption}`);

  const scriptStatus = h('p', { class: 'hint', 'aria-live': 'polite' });
  const applyScript = (raw) => {
    try {
      const obj = extractJSON(raw);
      const got = obj.lines ?? obj;
      setAudio((a) => {
        a.narration = { ...(a.narration ?? {}) };
        a.narration.lines = got.filter((x) => lines[x.k] && x.text).map((x) => ({ scene: lines[x.k].scene, caption: lines[x.k].caption, text: x.text }));
      });
      toast('Script added. Record each line, or import recordings.');
      rerender();
    } catch (e) {
      scriptStatus.textContent = `Could not read the script: ${e.message}`;
    }
  };
  const scriptRow = h('div', { class: 'row wrap' },
    h('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(scriptPrompt(spec))) ? 'Prompt copied. Paste the reply into the box below.' : 'Copy failed.') }, 'Copy script prompt'));
  claudeSample().then((sample) => {
    if (!sample) return;
    const b = h('button', { type: 'button', class: 'btn small primary' }, 'Write the script with Claude');
    b.addEventListener('click', async () => {
      b.disabled = true;
      scriptStatus.textContent = 'Claude is writing…';
      try {
        applyScript(await askClaude(scriptPrompt(spec)));
      } catch (e) {
        scriptStatus.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    });
    scriptRow.prepend(b);
  });
  const reply = h('textarea', { id: 'au-reply', rows: 3, class: 'code', placeholder: 'Paste an AI-written script here (optional)', spellcheck: false });
  const list = h('div', { class: 'nar-list' });
  lines.forEach((l, k) => {
    const clip = clipFor(l);
    const ta = h('textarea', { id: `au-l-${k}`, rows: 2, 'aria-label': `Narration for ${l.label}` });
    ta.value = l.text;
    ta.addEventListener('input', () => setLine(l, ta.value));
    const rec = h('button', { type: 'button', class: 'btn small' }, clip ? 'Re-record' : 'Record');
    rec.addEventListener('click', async () => {
      const blob = await recordLine(ta.value);
      if (!blob) return;
      try {
        setClip(l, await addAudio(blob, `${l.label}.webm`));
        rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    const imp = h('button', { type: 'button', class: 'btn small ghost' }, 'Import');
    imp.addEventListener('click', async () => {
      const file = await pickFile('audio/*');
      if (!file) return;
      try {
        setClip(l, await addAudio(file, file.name));
        rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    list.append(h('div', { class: 'nar-item' },
      h('div', { class: 'row' }, h('span', { class: 'nar-label' }, l.label), clip ? h('span', { class: 'pill ok' }, `${clip.duration}s`) : ''),
      ta,
      h('div', { class: 'row wrap' }, rec, imp,
        clip ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => playBuffer(clip.id) }, 'Play') : '',
        clip ? h('button', { type: 'button', class: 'btn small ghost danger', onclick: () => { setClip(l, null); rerender(); } }, 'Remove') : '')));
  });
  const fit = h('button', { type: 'button', class: 'btn small primary', disabled: !clips.length }, 'Fit the pace to the narration');
  fit.addEventListener('click', () => {
    let n = 0;
    store.update((s) => {
      n = fitToNarration(s, s.audio?.narration?.clips ?? [], { pauseRace: s.audio?.narration?.pauseRace !== false });
    });
    toast(n ? `Made room for ${n} narration ${n === 1 ? 'clip' : 'clips'}. Undo with Ctrl+Z.` : 'The pace already leaves room for every clip.');
  });
  nsec.append(
    h('p', { class: 'hint' }, 'Record a line for each caption with the teleprompter, or import recordings (from your phone, or any text-to-speech tool). Music gets quieter while the voice plays.'),
    scriptRow, reply, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small', onclick: () => applyScript(reply.value) }, 'Use this script')), scriptStatus,
    h('div', { class: 'field' }, h('label', { for: 'au-duck', class: 'field-label' }, 'Music volume under the voice'), duck),
    h('div', { class: 'field check' }, pause, h('label', { for: 'au-pause' }, 'Pause the race while the narrator speaks')),
    h('div', { class: 'row' }, fit),
    list);
  if (ctx.extraNarration) nsec.append(ctx.extraNarration(lines, setClip, rerender));
  root.append(nsec);
}
