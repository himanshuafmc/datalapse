// Thumbnails and title ideas for YouTube.
//
// A thumbnail is a 1280 x 720 frame of the story with a few big words on
// it. The text is checked against what is behind it (WCAG contrast of the
// text colour against the lightest tenth of the pixels under it) and the
// backing shade is darkened until it reads at phone size.

import { makeCanvas } from './encode.js';
import { findEvents } from '../data/drama.js';
import { makeFormatter } from '../core/format.js';
import { Pace } from '../core/pace.js';

export const THUMB_W = 1280;
export const THUMB_H = 720;
const RACES = new Set(['barRace', 'lineRace']);

/** Relative luminance of an sRGB colour (0-255 channels). */
export function luminance(r, g, b) {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(l1, l2) {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

export function hexRgb(hex) {
  const m = String(hex).replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6);
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const words = (s) => String(s ?? '').replace(/[.!]+$/, '').trim();

function firstRace(spec) {
  const k = (spec.scenes ?? []).findIndex((s) => RACES.has(s.type) && spec.datasets?.[s.data]);
  return k;
}

function topEvent(spec, k) {
  const sc = spec.scenes[k];
  const ds = spec.datasets[sc.data];
  let fmt;
  try {
    fmt = makeFormatter(sc.valueFormat ?? { type: 'count' });
  } catch {
    fmt = (v) => String(v);
  }
  const evs = findEvents({ ...ds, timeMode: sc.yearLabel === 'month' ? 'month' : 'year' }, {
    kind: sc.type === 'lineRace' ? 'line' : 'bar', nBars: sc.nBars ?? 10, highlight: sc.highlight ?? sc.pin, series: sc.series, format: fmt,
  });
  const t0 = ds.index[0];
  const span = ds.index[ds.index.length - 1] - t0;
  return evs.filter((e) => e.t > t0 + span * 0.04).sort((a, b) => b.score - a.score)[0] ?? null;
}

/** Time (s) into scene k at which the race shows data time `year`. */
function sceneTimeAt(sc, year) {
  try {
    const p = new Pace(sc.pace);
    const keys = p.keys;
    for (let j = 1; j < keys.length; j++) {
      const [t0, y0] = keys[j - 1];
      const [t1, y1] = keys[j];
      if ((year >= y0 && year <= y1) || (year <= y0 && year >= y1)) {
        if (y1 === y0) return t1;
        return t0 + ((year - y0) / (y1 - y0)) * (t1 - t0) + 0.6;
      }
    }
    return p.duration * 0.85;
  } catch {
    return null;
  }
}

/**
 * Three starting points: [{ text, frame: { scene, at } (seconds into scene), side, zoom }].
 */
export function thumbnailIdeas(spec) {
  const out = [];
  const texts = [];
  const push = (t) => {
    const w = words(t);
    if (w && w.split(/\s+/).length <= 7 && !texts.some((x) => x.toLowerCase() === w.toLowerCase())) texts.push(w);
  };
  if (spec.meta?.thumbnail) push(spec.meta.thumbnail);
  push(spec.meta?.shorts_title);
  // A hook's big line works on its own only if it is not the middle of a
  // sentence ("#17 economy." yes, "lived in just two countries" no).
  for (const s of spec.scenes ?? []) if (s.type === 'hook') for (const ln of s.lines ?? []) if (ln.size === 'big' && /\d/.test(ln.text ?? '') && !/^\p{Ll}/u.test(ln.text ?? '')) push(ln.text);
  const k = firstRace(spec);
  let ev = null;
  if (k >= 0) {
    ev = topEvent(spec, k);
    if (ev?.kind === 'lead' && spec.scenes[k].type === 'barRace') push(`${ev.entities[0]} takes #1`);
    else if (ev?.entities?.length === 2) push(`${ev.entities[0]} vs ${ev.entities[1]}`);
    const sc = spec.scenes[k];
    if (sc.highlight) push(`${sc.highlight}'s rise`);
  }
  for (const s of spec.scenes ?? []) if (s.type === 'title') push(s.title);
  while (texts.length < 3) texts.push(texts[0] ?? 'Watch this');
  // Background: the first race, or failing that the first chart of any kind.
  const kChart = k >= 0 ? k : (spec.scenes ?? []).findIndex((x) => x.pace && x.type !== 'dotGrid');
  const sc = kChart >= 0 ? spec.scenes[kChart] : null;
  let dur = 10;
  try {
    dur = sc ? new Pace(sc.pace).duration : 10;
  } catch {
    /* keep */
  }
  const evAt = sc && ev ? sceneTimeAt(sc, ev.t) : null;
  const frames = sc
    ? [{ scene: kChart, at: dur * 0.9 }, { scene: kChart, at: evAt ?? dur * 0.6 }, { scene: kChart, at: dur * 0.75 }]
    : [{ scene: 0, at: 1 }, { scene: 0, at: 1 }, { scene: 0, at: 1 }];
  const side = sc?.type === 'barRace' ? 'right' : 'left';
  out.push({ text: texts[0], frame: frames[0], side, zoom: 1 });
  out.push({ text: texts[1], frame: frames[1], side: side === 'right' ? 'left' : 'right', zoom: 1.35 });
  out.push({ text: texts[2], frame: frames[2], side: 'top', zoom: 1.15 });
  return out;
}

function wrapToWidth(ctx, text, maxW) {
  const ws = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of ws) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Draw one thumbnail. idea: { text, frame, side, zoom }. Returns
 * { canvas, contrast, scrim, lines }.
 */
export function drawThumbnail(video, idea, opts = {}) {
  const canvas = opts.canvas ?? makeCanvas(THUMB_W, THUMB_H);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const { frames, L } = video.prepare('landscape');
  const f = frames[idea.frame?.scene ?? 0] ?? frames[0];
  const g = f ? f.start + Math.max(0, Math.min(f.n - 1, Math.round((idea.frame?.at ?? 0) * video.fps))) : 0;
  const zoom = Math.max(1, idea.zoom ?? 1);
  const base = THUMB_W / L.W;
  // Draw the frame (zoomed toward the chart for some variants).
  if (zoom > 1) {
    const big = makeCanvas(Math.round(THUMB_W * zoom), Math.round(THUMB_H * zoom));
    const bctx = big.getContext('2d', { alpha: false });
    video.drawFrame(bctx, 'landscape', g, base * zoom);
    const cx = (L.chart[0] + L.chart[2] * 0.5) * big.width;
    const cy = (1 - (L.chart[1] + L.chart[3] * 0.5)) * big.height;
    const sx = Math.max(0, Math.min(big.width - THUMB_W, cx - THUMB_W / 2));
    const sy = Math.max(0, Math.min(big.height - THUMB_H, cy - THUMB_H / 2));
    ctx.drawImage(big, sx, sy, THUMB_W, THUMB_H, 0, 0, THUMB_W, THUMB_H);
  } else {
    video.drawFrame(ctx, 'landscape', g, base);
  }
  const T = video.T;
  const dark = luminance(...hexRgb(T.bg_top ?? '#0B1020')) < 0.2;
  const textColor = dark ? '#FFFFFF' : '#0B0F19';
  const shade = dark ? [6, 9, 20] : [255, 255, 255];
  const accent = T.accent ?? '#FFC233';
  const family = '"Poppins", "Noto Sans", system-ui, sans-serif';
  // Text block geometry
  const side = idea.side ?? 'left';
  const pad = 64;
  const boxW = side === 'top' ? THUMB_W - pad * 2 : THUMB_W * 0.52;
  let size = 150;
  let lines;
  for (; size >= 64; size -= 6) {
    ctx.font = `700 ${size}px ${family}`;
    lines = wrapToWidth(ctx, idea.text ?? '', boxW);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const tall = lines.length * size * 1.08;
    if (widest <= boxW && tall <= (side === 'top' ? THUMB_H * 0.42 : THUMB_H - pad * 2) && lines.length <= 4) break;
  }
  const lineH = size * 1.08;
  const blockH = lines.length * lineH;
  const x0 = side === 'right' ? THUMB_W - pad - boxW : pad;
  const y0 = side === 'top' ? pad * 0.8 : (THUMB_H - blockH) / 2;
  // Region behind the text, before any shade: the lightest tenth decides.
  const region = ctx.getImageData(Math.max(0, x0 - 10), Math.max(0, y0 - 10), Math.min(THUMB_W, boxW + 20), Math.min(THUMB_H, blockH + 20)).data;
  const lums = [];
  for (let i = 0; i < region.length; i += 16) lums.push(luminance(region[i], region[i + 1], region[i + 2]));
  lums.sort((a, b) => a - b);
  const p90 = lums[Math.floor(lums.length * 0.9)] ?? 0;
  const shadeL = luminance(...shade);
  const textL = luminance(...hexRgb(textColor));
  // Smallest shade strength that reaches 4.5:1 (WCAG AA) against the worst
  // case, never less than a light touch so the chart recedes a little.
  let alpha = 0.35;
  const after = (a) => {
    // Blend in linear light (close enough for a check).
    const l = p90 * (1 - a) + shadeL * a;
    return contrastRatio(textL, l);
  };
  while (alpha < 0.95 && after(alpha) < 4.5 * 1.15) alpha += 0.05;
  const contrast = after(alpha);
  // Shade: a soft gradient on the text side.
  const rgba = (a) => `rgba(${shade[0]},${shade[1]},${shade[2]},${a})`;
  let grad;
  if (side === 'top') grad = ctx.createLinearGradient(0, 0, 0, THUMB_H);
  else if (side === 'right') grad = ctx.createLinearGradient(THUMB_W, 0, 0, 0);
  else grad = ctx.createLinearGradient(0, 0, THUMB_W, 0);
  grad.addColorStop(0, rgba(alpha));
  grad.addColorStop(0.55, rgba(alpha * 0.85));
  grad.addColorStop(1, rgba(0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  // Words: numbers and #ranks in the accent colour.
  ctx.textBaseline = 'top';
  ctx.font = `700 ${size}px ${family}`;
  ctx.lineJoin = 'round';
  lines.forEach((ln, j) => {
    const y = y0 + j * lineH;
    const tokens = ln.split(/(\s+)/);
    const total = ctx.measureText(ln).width;
    let x = side === 'right' ? x0 + boxW - total : side === 'top' ? (THUMB_W - total) / 2 : x0;
    for (const tk of tokens) {
      const w = ctx.measureText(tk).width;
      if (tk.trim()) {
        const hot = /[#\d$€£₹%]/.test(tk);
        ctx.lineWidth = size * 0.1;
        ctx.strokeStyle = rgba(0.55);
        ctx.strokeText(tk, x, y);
        ctx.fillStyle = hot ? accent : textColor;
        ctx.fillText(tk, x, y);
      }
      x += w;
    }
  });
  // Channel name in a corner, small.
  if (T.brand) {
    ctx.font = `700 30px ${family}`;
    ctx.fillStyle = accent;
    ctx.textBaseline = 'alphabetic';
    const bw = ctx.measureText(T.brand).width;
    ctx.fillText(T.brand, side === 'right' ? pad : THUMB_W - pad - bw, THUMB_H - 40);
  }
  return { canvas, contrast, alpha, lines, size };
}

export async function thumbnailBlob(video, idea) {
  const { canvas, contrast } = drawThumbnail(video, idea);
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return { blob, contrast };
}

/** Rank (1 = largest) of `name` at row k of a raw dataset. */
function rankAt(ds, name, k) {
  const j = ds.columns.indexOf(name);
  const v = ds.values[j]?.[k];
  if (v == null) return null;
  let r = 1;
  for (const col of ds.values) if (col[k] != null && col[k] > v) r++;
  return r;
}

/** Title ideas: [{ text, note }]. YouTube shows about 70 characters. */
export function titleIdeas(spec) {
  const out = [];
  const add = (text, note) => {
    const t = String(text ?? '').trim();
    if (t && !out.some((o) => o.text.toLowerCase() === t.toLowerCase())) out.push({ text: t, note });
  };
  add(spec.meta?.title, 'Current title');
  const k = firstRace(spec);
  if (k >= 0) {
    const sc = spec.scenes[k];
    const ds = spec.datasets[sc.data];
    const i0 = 0;
    const i1 = ds.index.length - 1;
    const y0 = Math.round(ds.index[i0]);
    const y1 = Math.round(ds.index[i1]);
    const who = sc.highlight ?? sc.pin;
    if (who && ds.columns.includes(who) && sc.type === 'barRace') {
      const firstK = ds.values[ds.columns.indexOf(who)].findIndex((v) => v != null);
      const r0 = rankAt(ds, who, Math.max(0, firstK));
      const r1 = rankAt(ds, who, i1);
      if (r0 && r1 && r0 !== r1) add(`${who}: from #${r0} to #${r1} in ${y1 - Math.round(ds.index[Math.max(0, firstK)])} years`, 'Rank change');
    }
    if (sc.title) add(`${sc.title} (${y0}–${y1})`, 'Plain and searchable');
    const ev = topEvent(spec, k);
    if (ev) {
      const [a, b] = ev.entities ?? [];
      if (ev.kind === 'lead' && sc.type === 'barRace') add(`The year ${a} took #1 from ${b}`, 'Biggest moment');
      else if (b) add(`When ${a} passed ${b}`, 'Biggest moment');
      else add(words(ev.text), 'Biggest moment');
    }
    // Who leads at the end, as a question.
    const leaderJ = ds.values.reduce((best, col, j) => ((col[i1] ?? -Infinity) > (ds.values[best]?.[i1] ?? -Infinity) ? j : best), 0);
    const leader0 = ds.values.reduce((best, col, j) => ((col[i0] ?? -Infinity) > (ds.values[best]?.[i0] ?? -Infinity) ? j : best), 0);
    if (sc.type === 'barRace' && ds.columns[leaderJ]) {
      add(leader0 === leaderJ ? `${y1 - y0} years at the top: how ${ds.columns[leaderJ]} stayed #1` : `How ${ds.columns[leaderJ]} ended up #1 by ${y1}`, 'Story');
    }
  }
  for (const s of spec.scenes ?? []) if (s.type === 'hook') {
    const t = (s.lines ?? []).map((l) => l.text).join(' ').replace(/\s+/g, ' ');
    if (t.length <= 90) add(t, 'From the hook');
  }
  return out.map((o) => ({ ...o, length: [...o.text].length, tooLong: [...o.text].length > 70 }));
}
