// The player inside an exported web page: the story, a scrubber with
// chapters, formats and languages, and the data behind it. No editor.

import { h } from './dom.js';
import { Player } from './player.js';
import { Video } from '../render/video.js';
import { loadFonts } from '../render/fonts.js';
import { FORMATS } from '../core/layout.js';
import { languageLabel } from '../spec/translate.js';
import { REPO } from '../core/buildinfo.js';

const CSS = `
:root { color-scheme: dark; --bg:#070A14; --panel:#0F1424; --ink:#EEF1F8; --muted:#9AA3B8; --line:#262D42; --accent:#FFC233; }
@media (prefers-color-scheme: light) { :root:not([data-theme=dark]) { color-scheme: light; --bg:#F3F4F8; --panel:#FFFFFF; --ink:#141824; --muted:#5A6275; --line:#D9DCE5; --accent:#B7791F; } }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
[hidden] { display: none !important; }
.v-wrap { display: flex; flex-direction: column; height: 100%; }
.v-stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; cursor: pointer; }
.v-stage canvas { display: block; border-radius: 6px; box-shadow: 0 6px 30px rgba(0,0,0,.35); }
.v-big { position: absolute; inset: 0; margin: auto; width: 84px; height: 84px; border-radius: 50%; border: 0; background: rgba(0,0,0,.55); color: #fff; cursor: pointer; display: grid; place-items: center; }
.v-big svg { width: 38px; height: 38px; margin-left: 6px; fill: currentColor; }
.v-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px)); background: var(--panel); border-top: 1px solid var(--line); }
.v-btn { appearance: none; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 8px; padding: 6px 10px; font: inherit; cursor: pointer; min-height: 36px; }
.v-btn[aria-pressed=true], .v-btn[aria-checked=true] { background: var(--ink); color: var(--panel); border-color: var(--ink); }
.v-btn:focus-visible, .v-scrub:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.v-play { width: 40px; padding: 0; display: grid; place-items: center; }
.v-play svg { width: 18px; height: 18px; fill: currentColor; }
.v-time { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 92px; }
.v-scrub { position: relative; flex: 1 1 240px; height: 28px; cursor: pointer; touch-action: none; }
.v-track { position: absolute; left: 0; right: 0; top: 12px; height: 4px; border-radius: 2px; background: var(--line); }
.v-fill { position: absolute; left: 0; top: 12px; height: 4px; border-radius: 2px; background: var(--accent); }
.v-tick { position: absolute; top: 9px; width: 2px; height: 10px; background: var(--muted); opacity: .6; }
.v-knob { position: absolute; top: 7px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--ink); }
.v-tip { position: absolute; bottom: 30px; transform: translateX(-50%); background: var(--ink); color: var(--panel); padding: 2px 6px; border-radius: 4px; font-size: 12px; white-space: nowrap; pointer-events: none; }
.v-chapter { color: var(--muted); font-size: 13px; flex-basis: 100%; order: 9; min-height: 1.2em; }
.v-seg { display: inline-flex; gap: 4px; }
select { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; min-height: 36px; }
.v-foot { margin-left: auto; color: var(--muted); font-size: 12px; }
.v-foot a { color: inherit; }
@media (max-width: 560px) { .v-time { min-width: 0; } .v-foot { flex-basis: 100%; margin: 0; } }
`;

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>';

function csvOf(ds) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const rows = [['period', ...ds.columns].map(q).join(',')];
  ds.index.forEach((t, k) => rows.push([t, ...ds.values.map((col) => (col[k] == null ? '' : col[k]))].join(',')));
  return rows.join('\n');
}

export async function startViewer(spec, config = {}) {
  document.head.append(h('style', {}, CSS));
  const formats = (config.formats ?? ['landscape']).filter((f) => FORMATS[f]);
  if (!formats.length) formats.push('landscape');
  const langs = ['', ...Object.keys(spec.translations ?? {})];
  const state = { fmt: formats[0], lang: config.lang ?? '' };
  const canvas = h('canvas', { 'aria-label': spec.meta?.title ?? 'Data story', role: 'img' });
  const big = h('button', { type: 'button', class: 'v-big', 'aria-label': 'Play', html: PLAY });
  const stage = h('div', { class: 'v-stage' }, canvas, big);
  const play = h('button', { type: 'button', class: 'v-btn v-play', 'aria-label': 'Play', title: 'Play or pause (Space)', html: PLAY });
  const time = h('span', { class: 'v-time', 'aria-live': 'off' }, '0:00 / 0:00');
  const fill = h('div', { class: 'v-fill' });
  const knob = h('div', { class: 'v-knob' });
  const tip = h('div', { class: 'v-tip', hidden: true });
  const ticks = h('div');
  const scrub = h('div', { class: 'v-scrub', role: 'slider', tabindex: 0, 'aria-label': 'Playhead', 'aria-valuemin': 0 }, h('div', { class: 'v-track' }), ticks, fill, knob, tip);
  const chapter = h('div', { class: 'v-chapter', 'aria-live': 'polite' });
  const fmtGroup = h('div', { class: 'v-seg', role: 'radiogroup', 'aria-label': 'Format', hidden: formats.length < 2 },
    formats.map((f) => h('button', { type: 'button', role: 'radio', class: 'v-btn', 'data-fmt': f, 'aria-checked': String(f === state.fmt), title: FORMATS[f].use }, FORMATS[f].label.split(' ')[0])));
  const langSel = h('select', { 'aria-label': 'Language', hidden: langs.length < 2 },
    langs.map((l) => h('option', { value: l }, l ? languageLabel(l) : 'Original language')));
  langSel.value = state.lang;
  const dsIds = Object.keys(spec.datasets ?? {});
  const dataBtn = h('button', { type: 'button', class: 'v-btn', hidden: !dsIds.length, title: 'Download the numbers behind this video (CSV)' }, 'Data');
  const foot = h('span', { class: 'v-foot' }, REPO ? h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'Made with Datalapse') : 'Made with Datalapse');
  const bar = h('div', { class: 'v-bar' }, play, time, scrub, fmtGroup, langSel, dataBtn, foot, chapter);
  const root = h('div', { class: 'v-wrap' }, stage, bar);
  document.body.append(root);
  document.title = spec.meta?.title ?? document.title;

  try {
    await loadFonts();
  } catch {
    /* system fonts */
  }
  const player = new Player(canvas);
  let video = null;
  const build = () => {
    video = new Video(spec, { lang: state.lang || null });
    const keep = player.total ? player.g / player.total : 0;
    player.setVideo(video, state.fmt);
    player.seek(Math.round(keep * player.total));
    video.ready().then(() => player.draw());
    drawTicks();
  };
  const drawTicks = () => {
    const total = player.total || 1;
    const { frames } = video.prepare(state.fmt);
    ticks.replaceChildren(...frames.slice(1).map((f) => h('i', { class: 'v-tick', style: { left: `${(f.start / total) * 100}%` } })));
  };
  const mmss = (g) => {
    const s = Math.floor(g / player.fps);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const yearAt = (g) => {
    const loc = video?.locate(state.fmt, g);
    const y = loc?.scene?.ys?.[loc.i];
    return y != null ? String(Math.round(y)) : null;
  };
  const sync = () => {
    const total = player.total;
    const pct = total > 1 ? (player.g / (total - 1)) * 100 : 0;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    time.textContent = `${mmss(player.g)} / ${mmss(total)}`;
    scrub.setAttribute('aria-valuemax', String(Math.max(0, total - 1)));
    scrub.setAttribute('aria-valuenow', String(player.g));
    scrub.setAttribute('aria-valuetext', `${mmss(player.g)}${yearAt(player.g) ? `, ${yearAt(player.g)}` : ''}`);
    play.innerHTML = player.playing ? PAUSE : PLAY;
    play.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
    big.hidden = player.playing || player.g > 0;
    const loc = video?.locate(state.fmt, player.g);
    const sc = loc?.scene;
    const name = sc?.spec?.title || sc?.spec?.heading || sc?.chapter || '';
    if (chapter.textContent !== name) chapter.textContent = name;
  };
  player.on(sync);
  build();
  sync();

  const toggle = () => player.toggle();
  play.addEventListener('click', toggle);
  big.addEventListener('click', (e) => {
    e.stopPropagation();
    player.play();
  });
  stage.addEventListener('click', toggle);
  const frameAt = (x) => {
    const r = scrub.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * (player.total - 1));
  };
  let drag = false;
  let resume = false;
  scrub.addEventListener('pointerdown', (e) => {
    drag = true;
    resume = player.playing;
    player.pause();
    scrub.setPointerCapture(e.pointerId);
    player.seek(frameAt(e.clientX));
  });
  scrub.addEventListener('pointermove', (e) => {
    const g = frameAt(e.clientX);
    const y = yearAt(g);
    tip.hidden = false;
    tip.textContent = y ? `${y} · ${mmss(g)}` : mmss(g);
    tip.style.left = `${(g / Math.max(1, player.total - 1)) * 100}%`;
    if (drag) player.seek(g);
  });
  scrub.addEventListener('pointerleave', () => (tip.hidden = true));
  const end = () => {
    if (drag && resume) player.play();
    drag = false;
  };
  scrub.addEventListener('pointerup', end);
  scrub.addEventListener('pointercancel', end);
  scrub.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : player.fps * 5;
    if (e.key === 'ArrowRight') player.seek(player.g + step);
    else if (e.key === 'ArrowLeft') player.seek(player.g - step);
    else if (e.key === 'Home') player.seek(0);
    else if (e.key === 'End') player.seek(player.total - 1);
    else return;
    e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !e.target.closest('select, input')) {
      e.preventDefault();
      toggle();
    }
  });
  for (const b of fmtGroup.querySelectorAll('[data-fmt]')) {
    b.addEventListener('click', () => {
      state.fmt = b.dataset.fmt;
      for (const x of fmtGroup.querySelectorAll('[data-fmt]')) x.setAttribute('aria-checked', String(x === b));
      player.pause();
      build();
    });
  }
  langSel.addEventListener('change', () => {
    state.lang = langSel.value;
    player.pause();
    build();
  });
  dataBtn.addEventListener('click', () => {
    for (const id of dsIds) {
      const blob = new Blob([csvOf(spec.datasets[id])], { type: 'text/csv' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${id}.csv` });
      document.body.append(a);
      a.click();
      a.remove();
    }
  });
  new ResizeObserver(() => {
    player.resize();
    player.draw();
  }).observe(stage);
}
