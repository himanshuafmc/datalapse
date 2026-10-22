// The dark gradient with a soft glow (engine.py draw_background), rendered
// once per frame size and theme, then blitted.

import { hexToRgb } from '../core/theme.js';

const cache = new Map();

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function backgroundImage(W, H, T) {
  const key = `${W}x${H}:${T.bg_top}:${T.bg_bot}:${T.glow.join(',')}`;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const top = hexToRgb(T.bg_top);
  const bot = hexToRgb(T.bg_bot);
  const [gr, gg, gb] = T.glow;
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const yy = H > 1 ? y / (H - 1) : 0;
    const base = [top[0] * (1 - yy) + bot[0] * yy, top[1] * (1 - yy) + bot[1] * yy, top[2] * (1 - yy) + bot[2] * yy];
    const gy = (yy - 0.15) ** 2 / 0.08;
    for (let x = 0; x < W; x++) {
      const gx = W > 1 ? x / (W - 1) : 0;
      const glow = Math.exp(-(((gx - 0.2) ** 2) / 0.12 + gy));
      const i = (y * W + x) * 4;
      d[i] = Math.trunc(Math.min(1, Math.max(0, base[0] + glow * gr)) * 255);
      d[i + 1] = Math.trunc(Math.min(1, Math.max(0, base[1] + glow * gg)) * 255);
      d[i + 2] = Math.trunc(Math.min(1, Math.max(0, base[2] + glow * gb)) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
