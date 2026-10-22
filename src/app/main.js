// Datalapse: the editor shell. Wires the store, preview player,
// timeline, scene list and panels together.

import { h, $, $$, toast, debounce, clone, store as kv, timecode, slug } from './dom.js';
import { Store } from './store.js';
import { Player } from './player.js';
import { renderInspector, newScene } from './inspector.js';
import { renderJsonPanel, openAiDialog, saveOut } from './panels.js';
import { renderStoryPanel } from './storypanel.js';
import { renderDataPanel } from './datapanel.js';
import { openPublish } from './publish.js';
import { onImageLoad, preload, FLAGS_SRC } from '../render/images.js';
import { languageLabel } from '../spec/translate.js';
import { checkCaption } from '../data/factcheck.js';
import { initCommandBar } from './commandbar.js';
import { renderAudioPanel } from './audiopanel.js';
import { AudioPreview, audioPlan, renderMix, missingAudio } from '../audio/mix.js';
import { openWizard } from './wizard.js';
import { BUNDLED_STORIES as PY_STORIES } from '../stories/bundled.js';
import { SHOWCASE } from '../stories/showcase.js';

const BUNDLED_STORIES = [...PY_STORIES, SHOWCASE];
import { Video } from '../render/video.js';
import { validateSpec } from '../spec/validate.js';
import { SCENE_TYPES, sceneClass, isPaced } from '../scenes/registry.js';
import { loadFonts } from '../render/fonts.js';
import { FORMATS } from '../core/layout.js';
import { startViewer } from './viewer.js';
import { voicePanel } from './online.js';
import { installApi } from './api.js';
import { shareCodeFrom, decodeStory } from '../export/share.js';
import '../export/webpage.js';

const DRAFTS_KEY = 'dl.drafts.v1';
const PREFS_KEY = 'dl.prefs.v1';
const DATA_SCENES = { has: (type) => isPaced(type) };

const state = {
  fmt: 'landscape',
  selected: 0,
  tab: 'scene',
  draftKey: null, // null while showing an untouched example
  video: null,
  errors: [],
  lang: null, // preview language (null = original)
  storyCtx: { editingLang: null },
};

const st = new Store();
let player;
const audioPreview = new AudioPreview();
let audioPlanSeq = 0;
// Handle for tests and the browser console (read-only use).
window.__crs = state;

// ---------------------------------------------------------------- drafts
function drafts() {
  return kv(DRAFTS_KEY) ?? {};
}

const saveDraft = debounce(() => {
  if (!state.draftKey || !st.spec) return;
  const all = drafts();
  all[state.draftKey] = { title: st.spec.meta?.title || st.spec.scenes?.find((s) => s.title)?.title || 'Untitled story', savedAt: Date.now(), spec: st.spec };
  // Keep the five most recent.
  const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt);
  for (const k of keys.slice(5)) delete all[k];
  kv(DRAFTS_KEY, all);
  fillStoryPicker();
}, 800);

function fillStoryPicker() {
  const sel = $('#story-select');
  const all = drafts();
  if (state.draftKey && !all[state.draftKey] && st.spec) {
    all[state.draftKey] = { title: st.spec.meta?.title || 'Untitled story', savedAt: Date.now() };
  }
  const mine = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt);
  sel.replaceChildren(...[
    mine.length ? h('optgroup', { label: 'Your stories (saved in this browser)' },
      mine.map(([k, d]) => h('option', { value: `draft:${k}` }, `${d.title} · ${new Date(d.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`))) : null,
    h('optgroup', { label: 'Examples' }, BUNDLED_STORIES.map((s) => h('option', { value: `ex:${s.id}` }, s.meta?.shorts_title || s.meta?.title || s.id))),
  ].filter(Boolean));
  sel.value = state.draftKey ? `draft:${state.draftKey}` : `ex:${st.spec?.id}`;
}

function loadExample(id) {
  const s = BUNDLED_STORIES.find((x) => x.id === id) ?? BUNDLED_STORIES[0];
  state.draftKey = null;
  state.selected = Math.max(0, s.scenes.findIndex((x) => DATA_SCENES.has(x.type)));
  st.load(s, 'load');
}

function loadNew(spec, { seekScene = true } = {}) {
  state.draftKey = `d${Date.now().toString(36)}`;
  state.selected = seekScene ? Math.max(0, spec.scenes.findIndex((x) => DATA_SCENES.has(x.type))) : 0;
  st.load(spec, 'load');
  saveDraft.flush();
}

// ---------------------------------------------------------------- rebuild
const rebuild = debounce((reason) => {
  const spec = st.spec;
  state.errors = validateSpec(spec);
  let video = null;
  let buildError = null;
  try {
    if (state.lang && !spec.translations?.[state.lang]) state.lang = null;
    video = new Video({ ...spec, scenes: spec.scenes.map((s) => ({ ...s })) }, { lang: state.lang });
    video.prepare(state.fmt);
    video.ready().then(() => player.draw());
    // Soundtrack for the preview (decoding can take a moment).
    const seq = ++audioPlanSeq;
    const forPlan = video;
    audioPlan(forPlan).then((plan) => {
      if (seq !== audioPlanSeq) return;
      audioPreview.setPlan(plan);
      if (player.playing && plan) audioPreview.play(player.g / player.fps);
    }).catch(() => audioPreview.setPlan(null));
  } catch (e) {
    buildError = e;
  }
  if (video && !buildError) {
    state.video = video;
    const keep = player.g;
    player.setVideo(video, state.fmt);
    if (reason === 'load') seekToScene(state.selected, false);
    else player.seek(keep);
  }
  showErrors(buildError);
  renderSceneList();
  renderTimeline();
  updateUndo();
  fillLanguagePicker();
}, 120);

function fillLanguagePicker() {
  const sel = $('#lang-select');
  const langs = Object.keys(st.spec?.translations ?? {});
  sel.hidden = !langs.length;
  if (!langs.length) return;
  sel.replaceChildren(h('option', { value: '' }, 'Original language'), ...langs.map((l) => h('option', { value: l }, languageLabel(l))));
  sel.value = state.lang ?? '';
}

function setPreviewLang(lang) {
  state.lang = lang || null;
  rebuild('lang');
  if (lang) toast(`Previewing ${languageLabel(lang)}`);
}

function showErrors(buildError) {
  const box = $('#status');
  const errs = buildError ? [buildError.message, ...state.errors] : state.errors;
  const err = $('#stage-error');
  if (buildError && !state.video) {
    err.hidden = false;
    err.textContent = buildError.message;
  } else err.hidden = true;
  if (!errs.length) {
    const d = state.video?.duration ?? 0;
    box.className = 'status ok';
    box.textContent = `${state.video?.scenes.length ?? 0} scenes · ${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')} · ${(state.video?.totalFrames(state.fmt) ?? 0).toLocaleString()} frames at ${state.video?.fps ?? 30} fps`;
    return;
  }
  box.className = 'status problem';
  box.replaceChildren(...[h('strong', {}, `${errs.length} ${errs.length === 1 ? 'problem' : 'problems'}: `), errs[0],
    errs.length > 1 ? h('button', { type: 'button', class: 'linkish', onclick: () => selectTab('json') }, ' See all') : null].filter(Boolean));
}

// ---------------------------------------------------------------- scenes
function sceneName(s) {
  const t = s.title || s.heading || s.question || s.lines?.[0]?.text || '';
  return t || (() => {
    try {
      return sceneClass(s.type).label;
    } catch {
      return s.type;
    }
  })();
}

function currentSceneIndex() {
  if (!state.video) return state.selected;
  const loc = state.video.locate(state.fmt, player.g);
  return loc ? state.video.scenes.indexOf(loc.scene) : 0;
}

function seekToScene(k, play = false) {
  if (!state.video) return;
  const { frames } = state.video.prepare(state.fmt);
  const f = frames[k];
  if (!f) return;
  const type = st.spec.scenes[k]?.type;
  const at = DATA_SCENES.has(type) ? Math.floor(f.n * 0.55) : type === 'hook' ? Math.min(f.n - 1, Math.round(state.video.fps * 3.5)) : Math.floor(f.n * 0.5);
  player.seek(f.start + (play ? 0 : at));
  if (play) player.play();
}

function selectScene(k, { seek = true } = {}) {
  state.selected = k;
  if (seek) seekToScene(k);
  renderSceneList();
  renderPanel('scene');
  if (window.matchMedia('(max-width: 899px)').matches && state.tab !== 'scene') selectTab('scene');
}

function renderSceneList() {
  const list = $('#scene-list');
  const spec = st.spec;
  const durs = state.video?.scenes.map((s) => s.duration) ?? [];
  const playing = currentSceneIndex();
  list.replaceChildren(...spec.scenes.map((s, k) => {
    let label;
    try {
      label = sceneClass(s.type).label;
    } catch {
      label = s.type;
    }
    const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Delete scene ${k + 1}`, title: 'Delete' }, '×');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (spec.scenes.length <= 1) return toast('A story needs at least one scene.');
      if (del.dataset.armed) {
        st.update((sp) => sp.scenes.splice(k, 1));
        state.selected = Math.min(state.selected, st.spec.scenes.length - 1);
        renderPanel('scene');
        toast('Scene deleted. Undo with Ctrl+Z.');
      } else {
        del.dataset.armed = '1';
        del.textContent = 'Delete?';
        del.classList.add('armed');
        setTimeout(() => {
          delete del.dataset.armed;
          del.textContent = '×';
          del.classList.remove('armed');
        }, 2500);
      }
    });
    const move = (d) => (e) => {
      e.stopPropagation();
      const j = k + d;
      if (j < 0 || j >= spec.scenes.length) return;
      st.update((sp) => ([sp.scenes[k], sp.scenes[j]] = [sp.scenes[j], sp.scenes[k]]));
      state.selected = j;
      renderPanel('scene');
    };
    const dup = (e) => {
      e.stopPropagation();
      st.update((sp) => sp.scenes.splice(k + 1, 0, clone(sp.scenes[k])));
      state.selected = k + 1;
      renderPanel('scene');
    };
    const item = h('li', {
      class: `scene-item${k === state.selected ? ' selected' : ''}${k === playing ? ' live' : ''}`,
    },
    h('button', { type: 'button', class: 'scene-main', 'aria-current': k === state.selected ? 'true' : null, onclick: () => selectScene(k) },
      h('span', { class: 'scene-no' }, String(k + 1).padStart(2, '0')),
      h('span', { class: 'scene-text' },
        h('span', { class: `type-chip t-${s.type}` }, label),
        h('span', { class: 'scene-title' }, sceneName(s))),
      h('span', { class: 'scene-dur' }, durs[k] != null ? `${durs[k].toFixed(1)}s` : '')),
    h('span', { class: 'scene-tools' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move scene ${k + 1} up`, title: 'Move up', disabled: k === 0, onclick: move(-1) }, '↑'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move scene ${k + 1} down`, title: 'Move down', disabled: k === spec.scenes.length - 1, onclick: move(1) }, '↓'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Duplicate scene ${k + 1}`, title: 'Duplicate', onclick: dup }, '⧉'),
      del));
    return item;
  }));
  const d = state.video?.duration ?? 0;
  $('#story-length').textContent = `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- timeline
function renderTimeline() {
  const seg = $('#segments');
  const cues = $('#cues');
  if (!state.video) return;
  const total = state.video.totalFrames(state.fmt);
  const { frames } = state.video.prepare(state.fmt);
  seg.replaceChildren(...frames.map((f, k) => {
    const t = st.spec.scenes[k]?.type;
    return h('button', {
      type: 'button', tabindex: -1, class: `seg-part t-${t}`, style: { flexGrow: String(f.n) },
      title: `${k + 1}. ${sceneName(st.spec.scenes[k] ?? {})}`,
      onclick: (e) => e.detail === 2 && selectScene(k),
    }, h('span', {}, `${k + 1}`));
  }));
  const marks = [];
  frames.forEach((f) => {
    for (const c of f.scene.captions?.sched ?? []) {
      const g = f.start + Math.round(c.start * state.video.fps);
      if (g < f.start + f.n) marks.push(h('i', { style: { left: `${(g / total) * 100}%` }, title: c.text }));
    }
  });
  cues.replaceChildren(...marks);
  $('#tc-total').textContent = timecode(total, state.video.fps);
  syncTransport();
}

function syncTransport() {
  if (!player?.video) return;
  const total = player.total;
  const pct = total > 1 ? (player.g / (total - 1)) * 100 : 0;
  $('#head').style.left = `${pct}%`;
  $('#tc').textContent = timecode(player.g, player.fps);
  const scrub = $('#scrub');
  scrub.setAttribute('aria-valuemax', String(total - 1));
  scrub.setAttribute('aria-valuenow', String(player.g));
  scrub.setAttribute('aria-valuetext', timecode(player.g, player.fps));
  const btn = $('#btn-play');
  btn.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  btn.classList.toggle('is-playing', player.playing);
  const live = currentSceneIndex();
  $$('#scene-list .scene-item').forEach((li, k) => li.classList.toggle('live', k === live));
}

function bindScrub() {
  const scrub = $('#scrub');
  const toFrame = (clientX) => {
    const r = scrub.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(f * (player.total - 1));
  };
  let dragging = false;
  let wasPlaying = false;
  scrub.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.seg-part') && e.detail === 2) return;
    dragging = true;
    wasPlaying = player.playing;
    player.pause();
    scrub.setPointerCapture(e.pointerId);
    player.seek(toFrame(e.clientX));
  });
  scrub.addEventListener('pointermove', (e) => dragging && player.seek(toFrame(e.clientX)));
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (wasPlaying) player.play();
    const k = currentSceneIndex();
    if (k !== state.selected) selectScene(k, { seek: false });
  };
  scrub.addEventListener('pointerup', end);
  scrub.addEventListener('pointercancel', end);
  scrub.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? player.fps : 1;
    if (e.key === 'ArrowRight') player.seek(player.g + step);
    else if (e.key === 'ArrowLeft') player.seek(player.g - step);
    else if (e.key === 'Home') player.seek(0);
    else if (e.key === 'End') player.seek(player.total - 1);
    else return;
    e.preventDefault();
  });
}

// ---------------------------------------------------------------- panels
function inspectorCtx() {
  return {
    store: st,
    index: state.selected,
    datasets: () => Object.keys(st.spec.datasets ?? {}),
    columns: (id) => st.spec.datasets?.[id ?? Object.keys(st.spec.datasets ?? {})[0]]?.columns ?? [],
    dataStart: () => {
      const sc = st.spec.scenes[state.selected];
      const ds = st.spec.datasets?.[sc?.data] ?? Object.values(st.spec.datasets ?? {})[0];
      return ds ? Math.min(...ds.index) : 2000;
    },
    dataEnd: () => {
      const sc = st.spec.scenes[state.selected];
      const ds = st.spec.datasets?.[sc?.data] ?? Object.values(st.spec.datasets ?? {})[0];
      return ds ? Math.max(...ds.index) : 2020;
    },
    playheadYear: () => {
      const loc = state.video?.locate(state.fmt, player.g);
      if (!loc || state.video.scenes.indexOf(loc.scene) !== state.selected || !loc.scene.ys) return null;
      return Math.round(loc.scene.ys[loc.i] * 10) / 10;
    },
    playheadSceneTime: () => {
      const loc = state.video?.locate(state.fmt, player.g);
      if (!loc || state.video.scenes.indexOf(loc.scene) !== state.selected) return null;
      return loc.i / state.video.fps;
    },
    rerender: () => renderPanel('scene'),
    datasetRaw: (id) => st.spec.datasets?.[id ?? Object.keys(st.spec.datasets ?? {})[0]] ?? null,
    checkCaption: (cap) => {
      const sc = st.spec.scenes[state.selected];
      const ds = st.spec.datasets?.[sc?.data];
      if (!ds) return { status: 'none', claims: [] };
      return checkCaption(cap, ds, { divisor: sc.valueFormat?.divide ?? 1, subject: sc.highlight ?? sc.pin ?? null });
    },
  };
}

function renderPanel(tab) {
  if (tab !== state.tab && tab !== 'scene') return;
  if (tab === 'scene' && state.tab !== 'scene') return;
  const root = $(`#panel-${tab}`);
  if (tab === 'scene') renderInspector(root, inspectorCtx());
  else if (tab === 'story') {
    Object.assign(state.storyCtx, {
      store: st,
      onYoutube: () => saveOut(new Video(st.spec, { lang: state.lang }).youtubeText(), `${slug(st.spec.meta?.title ?? st.spec.id)}_youtube.txt`),
      onPreviewLang: setPreviewLang,
    });
    renderStoryPanel(root, state.storyCtx);
  } else if (tab === 'audio') renderAudioPanel(root, { store: st, extraNarration: (lines, setClip, rerender) => voicePanel(lines, setClip, rerender) });
  else if (tab === 'data') renderDataPanel(root, { store: st, video: state.video, goToScene: (k) => { selectScene(k); selectTab('scene'); } });
  else if (tab === 'json') renderJsonPanel(root, { store: st, onApply: (spec) => { if (!state.draftKey) state.draftKey = `d${Date.now().toString(36)}`; st.load(spec, 'load'); saveDraft(); } });
}

function selectTab(tab) {
  state.tab = tab;
  for (const b of $$('.tabs [role=tab]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of $$('.tab-panel')) p.hidden = p.id !== `panel-${tab}`;
  renderPanel(tab);
  kv(PREFS_KEY, { ...(kv(PREFS_KEY) ?? {}), tab });
}

function updateUndo() {
  $('#btn-undo').disabled = !st.undoStack.length;
  $('#btn-redo').disabled = !st.redoStack.length;
}

function setFormat(fmt) {
  state.fmt = fmt;
  for (const b of $$('[data-fmt]')) b.setAttribute('aria-checked', String(b.dataset.fmt === fmt));
  $('#stage').dataset.fmt = fmt;
  player.setFormat(fmt);
  requestAnimationFrame(() => {
    player.resize();
    player.draw();
  });
  renderTimeline();
  showErrors(null);
  kv(PREFS_KEY, { ...(kv(PREFS_KEY) ?? {}), fmt });
}

// ---------------------------------------------------------------- startup
async function main() {
  player = new Player($('#canvas'));
  player.on(() => syncTransport());
  player.onPlayState = (on, t) => (on ? audioPreview.play(t) : audioPreview.stop());

  st.on((spec, reason) => {
    if ((reason === 'edit' || reason === 'data') && !state.draftKey) {
      // First edit of an example: it becomes the user's own story.
      state.draftKey = `d${Date.now().toString(36)}`;
    }
    if (reason !== 'load') saveDraft();
    rebuild(reason);
    if (reason !== 'edit') {
      renderPanel('scene');
      if (state.tab !== 'scene') renderPanel(state.tab);
      fillStoryPicker();
    }
    if (reason === 'load') {
      state.storyCtx.editingLang = null;
      missingAudio(spec).then((ids) => ids.length && toast(`${ids.length} audio ${ids.length === 1 ? 'file is' : 'files are'} not in this browser. Add ${ids.length === 1 ? 'it' : 'them'} again in the Audio tab.`));
    }
  });

  // Controls
  $('#btn-play').addEventListener('click', () => player.toggle());
  $('#btn-undo').addEventListener('click', () => st.undo());
  $('#btn-redo').addEventListener('click', () => st.redo());
  for (const b of $$('[data-fmt]')) b.addEventListener('click', () => setFormat(b.dataset.fmt));
  for (const b of $$('.tabs [role=tab]')) b.addEventListener('click', () => selectTab(b.dataset.tab));
  $('.tabs').addEventListener('keydown', (e) => {
    const tabs = $$('.tabs [role=tab]');
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : -1;
    if (j >= 0) {
      tabs[j].focus();
      selectTab(tabs[j].dataset.tab);
    }
  });
  $('#story-select').addEventListener('change', (e) => {
    const v = e.target.value;
    player.pause();
    if (v.startsWith('ex:')) loadExample(v.slice(3));
    else {
      const d = drafts()[v.slice(6)];
      if (d) {
        state.draftKey = v.slice(6);
        state.selected = Math.max(0, d.spec.scenes.findIndex((x) => DATA_SCENES.has(x.type)));
        st.load(d.spec, 'load');
      }
    }
  });
  $('#btn-csv').addEventListener('click', () => openWizard({ stories: BUNDLED_STORIES, brand: state.draftKey ? (st.spec?.theme?.brand ?? '') : '', onCreate: (spec) => { loadNew(spec); toast('Story created. Press play, then fine-tune scene by scene.'); } }));
  $('#btn-ai').addEventListener('click', () => openAiDialog({ store: st, onLoad: (spec) => loadNew(spec) }));
  $('#btn-export').addEventListener('click', () => {
    player.pause();
    openPublish({
      store: st, fmt: state.fmt, lang: state.lang, frame: player.g,
      audio: (video) => audioPlan(video).then((plan) => (plan ? renderMix(plan) : null)),
      onLoadSpec: (spec) => {
        $('#export').close();
        loadNew(spec);
        toast('Opened as a new story. Your original is still in the story list.');
      },
    });
  });
  $('#lang-select').addEventListener('change', (e) => setPreviewLang(e.target.value));
  initCommandBar({
    store: st,
    getSelected: () => state.selected,
    setFormat: (f) => setFormat(f),
    addLanguage: (lang) => {
      state.storyCtx.editingLang = lang;
      selectTab('story');
    },
  });
  onImageLoad(() => {
    player.draw();
    if (state.tab === 'data') renderPanel('data');
  });
  preload([FLAGS_SRC]);
  const addSel = $('#add-type');
  addSel.replaceChildren(...SCENE_TYPES.map((S) => h('option', { value: S.type }, S.label)));
  addSel.value = 'barRace';
  $('#btn-add').addEventListener('click', () => {
    const at = Math.min(st.spec.scenes.length, state.selected + 1);
    const sc = newScene(addSel.value, st.spec);
    if (DATA_SCENES.has(sc.type) && !Object.keys(st.spec.datasets ?? {}).length) return toast('That scene needs data. Start with New from CSV.', 'error');
    st.update((s) => s.scenes.splice(at, 0, sc));
    state.selected = at;
    renderPanel('scene');
    setTimeout(() => seekToScene(at), 200);
  });
  for (const dlg of $$('dialog')) {
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
    $('.dlg-close', dlg)?.addEventListener('click', () => dlg.close());
  }
  bindScrub();
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) st.redo();
      else st.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      st.redo();
    } else if (e.key === ' ' && !typing && !e.target.closest('button, dialog')) {
      e.preventDefault();
      player.toggle();
    }
  });
  new ResizeObserver(debounce(() => {
    player.resize();
    player.draw();
  }, 80)).observe($('#stage'));

  // Fonts first, so the first frame is drawn in the right typefaces.
  try {
    await loadFonts();
  } catch {
    toast('Could not load the video fonts; using system fonts.', 'error');
  }
  const prefs = kv(PREFS_KEY) ?? {};
  state.fmt = FORMATS[prefs.fmt] ? prefs.fmt : 'landscape';
  for (const b of $$('[data-fmt]')) b.setAttribute('aria-checked', String(b.dataset.fmt === state.fmt));
  $('#stage').dataset.fmt = state.fmt;
  player.fmt = state.fmt;
  // A share link ("#s=...") opens its story as a new draft.
  const shared = shareCodeFrom(location.hash);
  let opened = false;
  if (shared) {
    try {
      const spec = await decodeStory(shared);
      const errs = validateSpec(spec);
      if (!spec?.scenes?.length) throw new Error('no scenes');
      loadNew(spec);
      opened = true;
      toast(errs.length ? `Opened the shared story (${errs.length} problem${errs.length === 1 ? '' : 's'} to fix).` : 'Opened the shared story. It is saved in this browser as your own copy.');
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        /* sandboxed */
      }
    } catch (e) {
      toast(`That share link could not be opened (${e.message}).`, 'error');
    }
  }
  if (!opened) loadExample(BUNDLED_STORIES[0].id);
  rebuild.flush('load');
  fillStoryPicker();
  selectTab(prefs.tab && ['scene', 'story', 'data', 'audio', 'json'].includes(prefs.tab) ? prefs.tab : 'scene');
  document.body.classList.add('ready');
}

// An exported web page carries its story in #dl-story and opens the
// player only; otherwise this is the studio.
installApi();
const embedded = document.getElementById('dl-story');
if (embedded) {
  let config = {};
  try {
    config = JSON.parse(document.getElementById('dl-config')?.textContent || '{}');
  } catch {
    /* defaults */
  }
  startViewer(JSON.parse(embedded.textContent), config).catch((e) => {
    console.error(e);
    document.body.append(h('p', { style: { padding: '16px' } }, `This story could not be shown: ${e.message}`));
  });
} else {
  main().catch((e) => {
    console.error(e);
    const err = document.getElementById('stage-error');
    if (err) {
      err.hidden = false;
      err.textContent = `The studio could not start: ${e.message}`;
    }
  });
}
