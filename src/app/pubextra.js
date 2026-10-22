// Publish dialog sections beyond the main video: Auto-Shorts, GIF,
// thumbnails and titles, and the web page / share link / fingerprint.

import { h, toast, fmtBytes, slug } from './dom.js';
import { saveOut } from './panels.js';
import { copyText } from './save.js';
import { askClaude, claudeSample } from './ai.js';
import { extractJSON } from '../spec/prompt.js';
import { Video } from '../render/video.js';
import { FORMATS } from '../core/layout.js';
import { HOMEPAGE } from '../core/buildinfo.js';
import { exportVideo } from '../export/encode.js';
import { exportGif, gifFrames, estimateGifBytes, GIF_RATES } from '../export/gif.js';
import { planShorts } from '../export/shorts.js';
import { thumbnailIdeas, drawThumbnail, thumbnailBlob, titleIdeas, THUMB_W } from '../export/thumbnail.js';
import { storyFingerprint } from '../export/stamp.js';
import { webPageHTML, canMakeWebPage, embedSnippet } from '../export/webpage.js';
import { canShare, encodeStory, shareBase, shareLink } from '../export/share.js';
import { sceneClass } from '../scenes/registry.js';

const base = (spec) => slug(spec.meta?.title ?? spec.id);
const secs = (s) => `${Math.floor(s / 60) ? `${Math.floor(s / 60)} min ` : ''}${Math.round(s % 60)} s`;

function progressBits() {
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, hidden: true }, h('div', { class: 'progress-fill' }));
  const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
  const set = (pct, text) => {
    bar.hidden = false;
    bar.firstChild.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (text != null) status.textContent = text;
  };
  return { bar, status, set };
}

function sceneLabel(s, k) {
  let label = s.type;
  try {
    label = sceneClass(s.type).label;
  } catch {
    /* keep */
  }
  const name = s.title || s.heading || s.question || s.lines?.[0]?.text || '';
  return `${k + 1}. ${label}${name ? `: ${name.slice(0, 40)}` : ''}`;
}

// ------------------------------------------------------------ Auto-Shorts
export function shortsSection(body, ctx) {
  const { spec } = ctx;
  const countSel = h('select', { id: 'sh-count' }, [2, 3, 4, 5].map((n) => h('option', { value: n }, `${n} Shorts`)));
  countSel.value = '3';
  const raceSel = h('select', { id: 'sh-secs' }, [15, 22, 30, 40].map((n) => h('option', { value: n }, `about ${n} s of race`)));
  raceSel.value = '22';
  const fmtSel = h('select', { id: 'sh-fmt' }, ['vertical', 'square', 'portrait'].map((k) => h('option', { value: k }, `${FORMATS[k].label} (${FORMATS[k].use})`)));
  const list = h('div', { class: 'short-list' });
  const outputs = h('ul', { class: 'outputs' });
  const { bar, status, set } = progressBits();
  const render = h('button', { type: 'button', class: 'btn primary' }, 'Render selected Shorts');
  const cancel = h('button', { type: 'button', class: 'btn', hidden: true }, 'Cancel');
  let plans = [];
  let controller = null;

  const refresh = () => {
    plans = planShorts(spec, { count: Number(countSel.value), raceSeconds: Number(raceSel.value) });
    list.replaceChildren();
    if (!plans.length) {
      list.append(h('p', { class: 'hint' }, 'No race with dramatic moments found. Shorts are cut from bar chart races and line races.'));
      render.disabled = true;
      return;
    }
    render.disabled = false;
    plans.forEach((p, n) => {
      const title = h('input', { type: 'text', value: p.title, 'aria-label': `Title of Short ${n + 1}`, class: 'grow' });
      title.addEventListener('input', () => {
        p.title = title.value;
        p.spec.meta.title = title.value;
        p.spec.meta.shorts_title = title.value;
      });
      const pick = h('input', { type: 'checkbox', checked: true, 'aria-label': `Include Short ${n + 1}` });
      p.pick = pick;
      list.append(h('div', { class: 'short-card' },
        h('div', { class: 'row' }, pick, h('strong', {}, `Short ${n + 1}`), h('span', { class: 'pill' }, p.moment.kicker), h('span', { class: 'hint' }, `${secs(p.seconds)} · scene ${p.scene + 1}`)),
        h('p', { class: 'moment-text' }, p.moment.text),
        h('div', { class: 'row' }, title,
          h('button', { type: 'button', class: 'btn small', onclick: () => ctx.onLoadSpec?.(p.spec) }, 'Edit in the studio'),
          h('button', { type: 'button', class: 'btn small', onclick: () => saveOut(new Video(p.spec).youtubeText(), `${base(p.spec)}_youtube.txt`) }, 'YouTube text'))));
    });
  };
  countSel.addEventListener('change', refresh);
  raceSel.addEventListener('change', refresh);

  render.addEventListener('click', async () => {
    const jobs = plans.filter((p) => p.pick?.checked);
    if (!jobs.length) return toast('Tick at least one Short.');
    controller = new AbortController();
    render.hidden = true;
    cancel.hidden = false;
    status.classList.remove('problem');
    const fmt = fmtSel.value;
    try {
      for (const [n, p] of jobs.entries()) {
        const video = new Video(p.spec, { lang: ctx.lang });
        await video.ready();
        const result = await exportVideo(video, {
          fmt, signal: controller.signal, audio: ctx.audio?.(video, fmt),
          onProgress: (done, total) => set((done / total) * 100, `Short ${n + 1} of ${jobs.length}: ${Math.round((done / total) * 100)}%`),
        });
        const name = `${base(p.spec)}${FORMATS[fmt].suffix}.${result.ext}`;
        outputs.append(h('li', {}, h('span', {}, h('strong', {}, p.title), ` · ${fmtBytes(result.blob.size)} ${result.ext.toUpperCase()}`),
          h('button', { type: 'button', class: 'btn small primary', onclick: () => saveOut(result.blob, name) }, 'Save')));
      }
      status.textContent = `Done: ${jobs.length} Short${jobs.length === 1 ? '' : 's'}.`;
    } catch (e) {
      status.textContent = e.name === 'AbortError' ? 'Cancelled.' : `Export failed: ${e.message}`;
      status.classList.toggle('problem', e.name !== 'AbortError');
    } finally {
      render.hidden = false;
      cancel.hidden = true;
      controller = null;
    }
  });
  cancel.addEventListener('click', () => controller?.abort());
  ctx.onClose(() => controller?.abort());
  refresh();
  body.append(
    h('p', { class: 'lede' }, 'Short clips cut around the race\'s most dramatic moments: a quick hook, the moment slowed down and paused on, and an end card pointing to the full video.'),
    h('div', { class: 'row wrap' }, countSel, raceSel, fmtSel),
    list, bar, status, h('div', { class: 'row end' }, cancel, render), outputs,
  );
}

// ------------------------------------------------------------ GIF
export function gifSection(body, ctx) {
  const { spec } = ctx;
  const v0 = new Video(spec);
  const times = v0.sceneTimes('landscape');
  const first = Math.max(0, spec.scenes.findIndex((s) => s.type === 'barRace' || s.type === 'lineRace'));
  const sceneSel = h('select', { id: 'gif-scene' }, spec.scenes.map((s, k) => h('option', { value: k }, sceneLabel(s, k))));
  sceneSel.value = String(first);
  const from = h('input', { type: 'number', id: 'gif-from', min: 0, step: 0.5, value: 0, class: 'narrow-input' });
  const to = h('input', { type: 'number', id: 'gif-to', min: 0.5, step: 0.5, class: 'narrow-input' });
  const fmtSel = h('select', { id: 'gif-fmt' }, Object.entries(FORMATS).map(([k, f]) => h('option', { value: k }, f.label)));
  fmtSel.value = ctx.fmt;
  const widthSel = h('select', { id: 'gif-width' }, [360, 480, 640, 800].map((w) => h('option', { value: w }, `${w} px wide`)));
  widthSel.value = '480';
  const rateSel = h('select', { id: 'gif-rate' }, GIF_RATES.map((r) => h('option', { value: r }, `${r} frames/s`)));
  rateSel.value = '20';
  const est = h('p', { class: 'hint tnum', 'aria-live': 'polite' });
  const { bar, status, set } = progressBits();
  const go = h('button', { type: 'button', class: 'btn primary' }, 'Make GIF');
  const out = h('div', { class: 'gif-out' });
  let controller = null;
  const sceneDur = () => times[Number(sceneSel.value)]?.dur ?? 10;
  const resetRange = () => {
    from.value = '0';
    to.value = String(Math.min(Math.floor(sceneDur() * 2) / 2, 12));
    from.max = to.max = String(sceneDur());
    update();
  };
  const range = () => {
    const fmt = fmtSel.value;
    const { frames } = v0.prepare(fmt);
    const f = frames[Number(sceneSel.value)];
    const a = Math.max(0, Math.min(Number(from.value) || 0, sceneDur()));
    const b = Math.max(a + 0.5, Math.min(Number(to.value) || sceneDur(), sceneDur()));
    return [f.start + Math.round(a * v0.fps), Math.min(f.start + f.n, f.start + Math.round(b * v0.fps))];
  };
  const update = () => {
    const fmt = fmtSel.value;
    const w = Number(widthSel.value);
    const hgt = Math.round((FORMATS[fmt].H * w) / FORMATS[fmt].W);
    const [g0, g1] = range();
    const n = gifFrames(g0, g1, v0.fps, Number(rateSel.value)).length;
    const bytes = estimateGifBytes(w, hgt, n);
    est.textContent = `${w} × ${hgt}, ${n} frames, ${((g1 - g0) / v0.fps).toFixed(1)} s. Roughly ${fmtBytes(bytes)}${bytes > 15e6 ? ' (large: try a shorter clip or smaller size)' : ''}.`;
  };
  sceneSel.addEventListener('change', resetRange);
  for (const el of [from, to, fmtSel, widthSel, rateSel]) el.addEventListener('input', update);
  go.addEventListener('click', async () => {
    controller = new AbortController();
    go.disabled = true;
    status.classList.remove('problem');
    try {
      const video = new Video(spec, { lang: ctx.lang });
      await video.ready();
      const fmt = fmtSel.value;
      const r = await exportGif(video, {
        fmt, width: Number(widthSel.value), rate: Number(rateSel.value), range: range(), signal: controller.signal,
        onProgress: (d, t) => set((d / t) * 100, `Frame ${d} of ${t}`),
      });
      const url = URL.createObjectURL(r.blob);
      const name = `${base(spec)}${FORMATS[fmt].suffix}.gif`;
      out.replaceChildren(
        h('img', { src: url, alt: 'GIF preview', width: r.width, height: r.height }),
        h('div', { class: 'row' }, h('span', {}, `${fmtBytes(r.blob.size)} · ${r.frames} frames`), h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn small primary', onclick: () => saveOut(r.blob, name) }, 'Save GIF')));
      status.textContent = 'Done.';
    } catch (e) {
      status.textContent = e.name === 'AbortError' ? 'Cancelled.' : `GIF failed: ${e.message}`;
      status.classList.toggle('problem', e.name !== 'AbortError');
    } finally {
      go.disabled = false;
      controller = null;
    }
  });
  ctx.onClose(() => controller?.abort());
  resetRange();
  body.append(
    h('p', { class: 'lede' }, 'A short looping clip for places that don\'t play video: a README, slides, chat, forums. Keep it under 15 seconds.'),
    h('div', { class: 'field' }, h('label', { for: 'gif-scene', class: 'field-label' }, 'Scene'), sceneSel),
    h('div', { class: 'row wrap' },
      h('label', { for: 'gif-from' }, 'From'), from, h('label', { for: 'gif-to' }, 'to'), to, h('span', {}, 'seconds into the scene')),
    h('div', { class: 'row wrap' }, fmtSel, widthSel, rateSel),
    est, bar, status, h('div', { class: 'row end' }, go), out,
  );
}

// ------------------------------------------------------------ Thumbnails & titles
export function thumbsSection(body, ctx) {
  const { spec } = ctx;
  const video = new Video(spec, { lang: ctx.lang });
  const ideas = thumbnailIdeas(video.spec);
  const grid = h('div', { class: 'thumb-grid' });
  const cards = ideas.map((idea, n) => {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = 720;
    canvas.className = 'thumb-big';
    canvas.setAttribute('aria-label', `Thumbnail ${n + 1}`);
    const small = document.createElement('canvas');
    small.width = 336;
    small.height = 189;
    small.className = 'thumb-small';
    small.setAttribute('aria-label', `Thumbnail ${n + 1} at phone size`);
    const badge = h('span', { class: 'pill' });
    const text = h('input', { type: 'text', value: idea.text, 'aria-label': `Words on thumbnail ${n + 1}`, class: 'grow' });
    const draw = () => {
      const r = drawThumbnail(video, { ...idea, text: text.value }, { canvas });
      const sctx = small.getContext('2d');
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, small.width, small.height);
      const ok = r.contrast >= 4.5;
      badge.textContent = `Contrast ${r.contrast.toFixed(1)}:1 ${ok ? '(passes)' : '(too low)'}`;
      badge.classList.toggle('bad', !ok);
      badge.classList.toggle('ok', ok);
    };
    text.addEventListener('input', () => {
      clearTimeout(text._t);
      text._t = setTimeout(draw, 150);
    });
    const save = h('button', {
      type: 'button', class: 'btn small primary',
      onclick: async () => {
        const { blob } = await thumbnailBlob(video, { ...idea, text: text.value });
        saveOut(blob, `${base(spec)}_thumbnail_${n + 1}.png`);
      },
    }, 'Save PNG');
    grid.append(h('figure', { class: 'thumb-card' }, canvas,
      h('figcaption', {}, h('div', { class: 'row' }, text), h('div', { class: 'row' }, small, h('div', { class: 'thumb-meta' }, badge, h('span', { class: 'hint' }, 'Left: how it looks in a phone feed.'), save)))));
    return draw;
  });
  video.ready().then(() => cards.forEach((d) => d()));
  cards.forEach((d) => d());

  const titles = h('ul', { class: 'title-list' });
  const addTitle = (t) => {
    const len = [...t.text].length;
    const use = h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        ctx.store.update((s) => {
          s.meta = { ...(s.meta ?? {}), title: t.text };
        }, 'meta.title');
        spec.meta = { ...(spec.meta ?? {}), title: t.text };
        toast('Title updated');
      },
    }, 'Use');
    titles.append(h('li', {}, h('span', { class: 'grow' }, t.text, ' ', h('small', { class: len > 70 ? 'warn' : 'hint' }, `${len} characters${len > 70 ? ': YouTube cuts it off' : ''}`), t.note ? h('small', { class: 'hint' }, ` · ${t.note}`) : ''),
      h('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(t.text)) ? 'Copied' : 'Select and copy it') }, 'Copy'), use));
  };
  titleIdeas(spec).forEach(addTitle);
  const prompt = () => [
    'Suggest 6 YouTube titles for this data video. Each under 65 characters, specific (names, numbers, years), honest: no claim the data does not support. Mix: a plain searchable one, a question, a surprising number.',
    'Reply with ONLY a JSON array of strings.',
    '', `Current title: ${spec.meta?.title ?? ''}`, `Description: ${(spec.meta?.description ?? '').slice(0, 600)}`,
    `Scenes: ${spec.scenes.map((s) => s.title || s.heading || s.question || s.lines?.map((l) => l.text).join(' ') || s.type).join(' | ')}`,
  ].join('\n');
  const more = h('div', { class: 'row wrap' });
  claudeSample().then((sample) => {
    if (sample) {
      const btn = h('button', { type: 'button', class: 'btn small primary' }, 'More ideas with Claude');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Thinking…';
        try {
          const arr = extractJSON(await askClaude(prompt()));
          (Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'string').forEach((text) => addTitle({ text, note: 'Claude' }));
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'More ideas with Claude';
        }
      });
      more.append(btn);
    }
    more.append(h('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(prompt())) ? 'Prompt copied: paste it into any AI.' : 'Could not copy.') }, 'Copy a prompt for any AI'));
  });
  body.append(
    h('p', { class: 'lede' }, 'Three thumbnails from your story. Edit the words; the backing shade is darkened until the text passes the WCAG 4.5:1 contrast check against the brightest part behind it.'),
    grid,
    h('p', { class: 'field-label' }, 'Title ideas'), titles, more,
  );
}

// ------------------------------------------------------------ Web page, share link, fingerprint
export function webSection(body, ctx) {
  const { spec } = ctx;
  const fp = storyFingerprint(spec);
  const stamp = h('input', { type: 'checkbox', id: 'pub-stamp', checked: !!spec.stamp });
  stamp.addEventListener('change', () => {
    ctx.store.update((s) => {
      if (stamp.checked) s.stamp = true;
      else delete s.stamp;
    }, 'stamp');
    if (stamp.checked) spec.stamp = true;
    else delete spec.stamp;
  });
  const fmtBoxes = h('div', { class: 'check-grid', role: 'group', 'aria-label': 'Formats in the web page' },
    Object.entries(FORMATS).map(([k, f]) => h('label', { class: 'check-card', for: `web-fmt-${k}` },
      h('input', { type: 'checkbox', id: `web-fmt-${k}`, value: k, checked: k === 'landscape' || k === ctx.fmt }), h('span', {}, h('strong', {}, f.label)))));
  const embed = h('textarea', { class: 'code', rows: 4, readonly: true, spellcheck: false, 'aria-label': 'Embed code' });
  const fileName = `${base(spec)}.html`;
  embed.value = embedSnippet(fileName, ctx.fmt);
  const saveWeb = h('button', {
    type: 'button', class: 'btn primary small', disabled: !canMakeWebPage(),
    onclick: () => {
      const formats = [...fmtBoxes.querySelectorAll('input:checked')].map((i) => i.value);
      if (!formats.length) return toast('Pick at least one format.');
      try {
        const html = webPageHTML(spec, { formats, lang: ctx.lang });
        saveOut(new Blob([html], { type: 'text/html' }), fileName);
      } catch (e) {
        toast(e.message, 'error');
      }
    },
  }, 'Save web page (.html)');

  const linkBox = h('textarea', { class: 'code', rows: 3, readonly: true, spellcheck: false, 'aria-label': 'Share link' });
  const linkNote = h('p', { class: 'hint', 'aria-live': 'polite' });
  const copyLink = h('button', { type: 'button', class: 'btn small', disabled: true, onclick: async () => toast((await copyText(linkBox.value, linkBox)) ? 'Copied' : 'Selected: press Ctrl+C to copy') }, 'Copy');
  if (canShare()) {
    encodeStory(spec).then((code) => {
      const where = shareBase(HOMEPAGE);
      linkBox.value = where ? shareLink(where, code) : `s=${code}`;
      copyLink.disabled = false;
      const n = linkBox.value.length;
      linkNote.textContent = where
        ? `${n.toLocaleString()} characters. Opening it shows this story in Datalapse on the viewer's device; nothing is uploaded.${n > 8000 ? ' Long links can break in some chat apps; send the story file instead if it does not open.' : ''}`
        : `${n.toLocaleString()} characters. This copy of Datalapse has no public address, so this is a story code: paste it into the JSON tab of any Datalapse and press Apply.`;
    }).catch((e) => (linkNote.textContent = `Could not make a link: ${e.message}`));
  } else linkNote.textContent = 'This browser cannot compress stories into links. Send the story file instead.';

  body.append(
    h('p', { class: 'field-label' }, 'Story fingerprint'),
    h('p', { class: 'lede' }, h('code', { class: 'fingerprint' }, fp), ' identifies this exact story: data, text, timing and colours. It is in the YouTube text. Anyone with the story file can open it in Datalapse, see the same fingerprint, and render the same video.'),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn small primary', onclick: () => saveOut(JSON.stringify(spec, null, 1), `${base(spec)}_${fp}.json`) }, 'Save story file (.json)'),
      h('label', { class: 'check', for: 'pub-stamp' }, stamp, ' Print the fingerprint on the closing card')),
    h('p', { class: 'field-label' }, 'Interactive web page'),
    h('p', { class: 'hint' }, 'One .html file that plays the story in any browser. Viewers can pause on any year, switch format or language, and download the data. Works offline, on GitHub Pages, or embedded in a blog. (No sound: the soundtrack is only in rendered videos.)'),
    fmtBoxes,
    canMakeWebPage() ? '' : h('p', { class: 'hint problem' }, 'This copy of Datalapse cannot build web pages; the downloadable version (index.html) can.'),
    h('div', { class: 'row' }, saveWeb, h('span', { class: 'spacer' })),
    h('details', {}, h('summary', {}, 'Embed code for a blog'), embed),
    h('p', { class: 'field-label' }, 'Share link'),
    linkBox, h('div', { class: 'row' }, linkNote, h('span', { class: 'spacer' }), copyLink),
  );
}
