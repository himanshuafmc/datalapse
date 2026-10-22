// The Publish dialog: videos (several formats and languages in one go),
// Auto-Shorts, thumbnails and titles, subtitles and YouTube text, GIFs, and
// the web page / share link. Plugins can add sections via PUBLISH_SECTIONS.

import { h, $, toast, fmtBytes, slug, clone } from './dom.js';
import { validateSpec } from '../spec/validate.js';
import { exportVideo, exportSupport, exportStill } from '../export/encode.js';
import { subtitleCues, toSRT, toVTT } from '../export/subtitles.js';
import { describeCues } from '../export/describe.js';
import { Video } from '../render/video.js';
import { languageLabel } from '../spec/translate.js';
import { FORMATS } from '../core/layout.js';
import { saveOut } from './panels.js';
import { shortsSection, gifSection, thumbsSection, webSection } from './pubextra.js';

/** Extra sections registered by other modules: { id, label, render(body, ctx) }. */
export const PUBLISH_SECTIONS = [];

function languagesOf(spec) {
  return ['en', ...Object.keys(spec.translations ?? {})];
}

const langName = (l) => (l === 'en' ? 'English (original)' : languageLabel(l));

function videoSection(body, ctx) {
  const { spec, errs } = ctx;
  const langs = languagesOf(spec);
  let container = 'auto';
  let controller = null;

  const fmtBoxes = h('div', { class: 'check-grid', role: 'group', 'aria-label': 'Formats' });
  for (const [k, f] of Object.entries(FORMATS)) {
    const id = `pub-fmt-${k}`;
    fmtBoxes.append(h('label', { class: 'check-card', for: id },
      h('input', { type: 'checkbox', id, value: k, checked: k === ctx.fmt }),
      h('span', {}, h('strong', {}, f.label), h('small', {}, `${f.W} × ${f.H} · ${f.use}`))));
  }
  const langBoxes = h('div', { class: 'check-grid', role: 'group', 'aria-label': 'Languages' });
  langs.forEach((l) => {
    const id = `pub-lang-${l}`;
    langBoxes.append(h('label', { class: 'check-card', for: id },
      h('input', { type: 'checkbox', id, value: l, checked: l === (ctx.lang ?? 'en') }),
      h('span', {}, h('strong', {}, langName(l)))));
  });
  const contSel = h('select', { id: 'ex-container' }, h('option', { value: 'auto' }, 'Best available'), h('option', { value: 'mp4' }, 'MP4 (H.264)'), h('option', { value: 'webm' }, 'WebM (VP9)'));
  contSel.addEventListener('change', () => (container = contSel.value));
  const supportLine = h('p', { class: 'hint', 'aria-live': 'polite' }, 'Checking what this browser can encode…');
  const v0 = new Video(spec);
  const dur = v0.duration;
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, hidden: true }, h('div', { class: 'progress-fill' }));
  const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
  const outputs = h('ul', { class: 'outputs' });
  const start = h('button', { type: 'button', class: 'btn primary' }, 'Render');
  const cancel = h('button', { type: 'button', class: 'btn', hidden: true }, 'Cancel');

  exportSupport('landscape').then((s) => {
    supportLine.textContent = s.mp4
      ? 'This browser can make MP4 (H.264), the format YouTube prefers.'
      : s.webm
        ? 'This browser has no H.264 encoder, so videos will be WebM (VP9). YouTube accepts it. For MP4, use Chrome or Edge on Windows or macOS.'
        : s.realtimeOnly
          ? 'This browser can only record in real time: each export takes as long as the video.'
          : 'This browser cannot export video. Use a recent Chrome, Edge, Firefox or Safari.';
    supportLine.classList.toggle('problem', !!s.none);
    start.disabled = !!s.none || errs.length > 0;
  });

  start.addEventListener('click', async () => {
    const fmts = [...fmtBoxes.querySelectorAll('input:checked')].map((i) => i.value);
    const ls = [...langBoxes.querySelectorAll('input:checked')].map((i) => i.value);
    if (!fmts.length || !ls.length) return toast('Pick at least one format and one language.');
    const jobs = ls.flatMap((l) => fmts.map((f) => ({ lang: l, fmt: f })));
    controller = new AbortController();
    start.hidden = true;
    cancel.hidden = false;
    bar.hidden = false;
    status.classList.remove('problem');
    try {
      for (const [n, job] of jobs.entries()) {
        const video = new Video(spec, { lang: job.lang === 'en' ? null : job.lang });
        await video.ready();
        const label = `${FORMATS[job.fmt].label}${langs.length > 1 ? `, ${langName(job.lang)}` : ''}`;
        const result = await exportVideo(video, {
          fmt: job.fmt, container, signal: controller.signal, audio: ctx.audio?.(video, job.fmt),
          onProgress: (done, total, inf) => {
            const pct = Math.round((done / total) * 100);
            bar.firstChild.style.width = `${pct}%`;
            bar.setAttribute('aria-valuenow', String(pct));
            const rate = done / Math.max(0.001, inf.elapsed);
            const left = (total - done) / Math.max(rate, 0.001);
            status.textContent = `${jobs.length > 1 ? `Video ${n + 1} of ${jobs.length} (${label}): ` : ''}${pct}% · ${rate.toFixed(0)} frames/s · about ${Math.ceil(left)} s left`;
          },
        });
        const name = `${slug(spec.meta?.title ?? spec.id)}${FORMATS[job.fmt].suffix}${job.lang === 'en' ? '' : `_${job.lang}`}.${result.ext}`;
        const speed = (result.frames / video.fps / result.seconds).toFixed(1);
        outputs.append(h('li', {},
          h('span', {}, h('strong', {}, label), ` · ${fmtBytes(result.blob.size)} ${result.ext.toUpperCase()} · ${speed}× real time`),
          h('button', { type: 'button', class: 'btn small primary', onclick: () => saveOut(result.blob, name) }, 'Save')));
      }
      status.textContent = jobs.length > 1 ? `Done: ${jobs.length} videos.` : 'Done.';
    } catch (e) {
      status.textContent = e.name === 'AbortError' ? 'Cancelled.' : `Export failed: ${e.message}`;
      status.classList.toggle('problem', e.name !== 'AbortError');
    } finally {
      cancel.hidden = true;
      start.hidden = false;
      start.textContent = 'Render again';
      controller = null;
    }
  });
  cancel.addEventListener('click', () => controller?.abort());
  ctx.onClose(() => controller?.abort());

  body.append(
    errs.length ? h('div', { class: 'problem-box' }, h('strong', {}, 'Fix these first:'), h('ul', {}, errs.slice(0, 6).map((e) => h('li', {}, e)))) : '',
    h('p', { class: 'lede' }, `${Math.floor(dur / 60)} min ${Math.round(dur % 60)} s at ${v0.fps} fps. Rendering happens on this device; nothing is uploaded.`),
    h('p', { class: 'field-label' }, 'Formats'), fmtBoxes,
    langs.length > 1 ? h('p', { class: 'field-label' }, 'Languages') : '', langs.length > 1 ? langBoxes : '',
    h('div', { class: 'field narrow' }, h('label', { for: 'ex-container', class: 'field-label' }, 'File type'), contSel),
    supportLine,
    spec.credit === false ? h('p', { class: 'hint' }, 'The "Made with Datalapse" credit is off. Turning it on in Story settings is how other creators find the tool.') : '',
    bar, status,
    h('div', { class: 'row end' }, cancel, start),
    outputs,
  );
}

function textSection(body, ctx) {
  const { spec } = ctx;
  const langs = languagesOf(spec);
  const base = slug(spec.meta?.title ?? spec.id);
  const list = h('div', { class: 'text-outputs' });
  for (const l of langs) {
    const lang = l === 'en' ? null : l;
    const sfx = lang ? `_${lang}` : '';
    const row = h('div', { class: 'lang-row' }, h('span', { class: 'lang-name' }, langName(l)), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn small', onclick: () => saveOut(toSRT(subtitleCues(new Video(spec, { lang }))), `${base}${sfx}.srt`) }, 'Subtitles (.srt)'),
      h('button', { type: 'button', class: 'btn small', onclick: () => saveOut(toVTT(subtitleCues(new Video(spec, { lang }))), `${base}${sfx}.vtt`) }, '.vtt'),
      h('button', { type: 'button', class: 'btn small', onclick: () => saveOut(new Video(spec, { lang }).youtubeText(), `${base}${sfx}_youtube.txt`) }, 'YouTube text'),
      h('button', { type: 'button', class: 'btn small', title: 'What is on screen, in words, for blind and low-vision viewers', onclick: () => saveOut(toVTT(describeCues(new Video(spec, { lang })), 'descriptions'), `${base}${sfx}_audio_description.vtt`) }, 'Audio description (.vtt)'));
    list.append(row);
  }
  const fmtSel = h('select', { id: 'pub-still-fmt' }, Object.entries(FORMATS).map(([k, f]) => h('option', { value: k }, f.label)));
  fmtSel.value = ctx.fmt;
  body.append(
    h('p', { class: 'lede' }, 'Upload subtitles to YouTube (Subtitles › Upload file) so viewers can read along, search finds your video, and YouTube can auto-translate it. The audio description track says what each chart shows, in words.'),
    list,
    h('p', { class: 'field-label' }, 'A still frame'),
    h('div', { class: 'row' }, fmtSel, h('button', {
      type: 'button', class: 'btn small',
      onclick: async () => {
        const video = new Video(spec, { lang: ctx.lang });
        await video.ready();
        const fmt = fmtSel.value;
        const g = ctx.frame != null && fmt === ctx.fmt ? ctx.frame : Math.floor(video.totalFrames(fmt) * 0.6);
        saveOut(await exportStill(video, fmt, g), `${base}${FORMATS[fmt].suffix}_frame.png`);
      },
    }, 'Save the frame at the playhead (.png)')));
}

/** ctx: { store, fmt, lang, frame, audio, onLoadSpec, section } */
export function openPublish(ctx0) {
  const dlg = $('#export');
  const body = $('#export-body', dlg);
  const spec = clone(ctx0.store.spec);
  const closers = [];
  const ctx = { ...ctx0, spec, errs: validateSpec(spec), onClose: (fn) => closers.push(fn) };
  const sections = [
    { id: 'video', label: 'Video', render: videoSection },
    { id: 'shorts', label: 'Auto-Shorts', render: shortsSection },
    { id: 'thumbs', label: 'Thumbnails & titles', render: thumbsSection },
    { id: 'text', label: 'Subtitles & text', render: textSection },
    { id: 'gif', label: 'GIF', render: gifSection },
    { id: 'web', label: 'Web page & share', render: webSection },
    ...PUBLISH_SECTIONS,
  ];
  const nav = h('div', { class: 'pub-nav', role: 'tablist', 'aria-label': 'What to publish' });
  const panel = h('div', { class: 'pub-panel', role: 'tabpanel' });
  const show = (sec) => {
    for (const b of nav.children) b.setAttribute('aria-selected', String(b.dataset.id === sec.id));
    panel.replaceChildren();
    sec.render(panel, ctx);
  };
  for (const sec of sections) {
    nav.append(h('button', { type: 'button', role: 'tab', 'data-id': sec.id, 'aria-selected': 'false', onclick: () => show(sec) }, sec.label));
  }
  body.replaceChildren(nav, panel);
  show(sections.find((s) => s.id === ctx0.section) ?? sections[0]);
  dlg.addEventListener('close', () => closers.forEach((fn) => fn()), { once: true });
  dlg.showModal();
}
