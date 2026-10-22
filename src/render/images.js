// Images drawn in frames: the flag sprite, entity logos, channel logos.
// Loading is asynchronous; drawing code asks for an image and gets null
// until it has loaded (the preview redraws on load, exports wait first).

import { FLAG_SPRITE } from './flagData.js';
import { findCountry } from '../data/countries.js';

const cache = new Map();
const listeners = new Set();
const canLoad = () => typeof Image !== 'undefined';

function load(src) {
  let e = cache.get(src);
  if (e) return e;
  e = { img: null, promise: null };
  cache.set(src, e);
  if (!canLoad()) {
    e.promise = Promise.resolve(null);
    return e;
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  e.promise = img.decode().then(
    () => {
      e.img = img;
      for (const fn of listeners) fn(src);
      return img;
    },
    () => null,
  );
  return e;
}

/** Call fn whenever an image finishes loading (to redraw a preview). */
export function onImageLoad(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The loaded image for a data URL or null (and start loading it). */
export function imageFor(src) {
  if (!src) return null;
  return load(src).img;
}

export function preload(srcs) {
  return Promise.all(srcs.filter(Boolean).map((s) => load(s).promise));
}

export const FLAGS_SRC = FLAG_SPRITE.data;

/** A drawable for a country's flag: { img, sx, sy, sw, sh, aspect } or null. */
export function flagFor(name) {
  const c = findCountry(name);
  if (!c) return null;
  const k = FLAG_SPRITE.index[c.a2];
  if (k == null) return null;
  const img = imageFor(FLAGS_SRC);
  if (!img) return null;
  const { w, h, cols } = FLAG_SPRITE;
  return { img, sx: (k % cols) * w, sy: Math.floor(k / cols) * h, sw: w, sh: h, aspect: w / h };
}

/** A drawable for a whole image (a logo). */
export function wholeImage(src) {
  const img = imageFor(src);
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return { img, sx: 0, sy: 0, sw: w, sh: h, aspect: w / Math.max(1, h) };
}

/** Draw a drawable into a box, contained and centred, with rounded corners. */
export function drawIcon(ctx, icon, x, y, w, h, radius = 0.18, alpha = 1) {
  if (!icon) return;
  let dw = w;
  let dh = w / icon.aspect;
  if (dh > h) {
    dh = h;
    dw = h * icon.aspect;
  }
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  const r = Math.min(dw, dh) * radius;
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, r);
    ctx.clip();
  }
  ctx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, dx, dy, dw, dh);
  ctx.restore();
}
