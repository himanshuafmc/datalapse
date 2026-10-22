// Country outlines for maps, decoded once from worldData.js.

import { WORLD_W, WORLD_H, WORLD_SHAPES } from './worldData.js';

export { WORLD_W, WORLD_H };

function b64bytes(s) {
  if (typeof atob === 'function') {
    const b = atob(s);
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(s, 'base64'));
}

function decodeBlock(s) {
  const bytes = b64bytes(s);
  let i = 0;
  const read = () => {
    let v = 0;
    let shift = 0;
    let b;
    do {
      b = bytes[i++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  const rings = [];
  const n = read();
  for (let r = 0; r < n; r++) {
    const m = read();
    const pts = new Float32Array(m * 2);
    let x = 0;
    let y = 0;
    for (let k = 0; k < m; k++) {
      x += read();
      y += read();
      pts[k * 2] = x;
      pts[k * 2 + 1] = y;
    }
    rings.push(pts);
  }
  return rings;
}

function ringArea(p) {
  let a = 0;
  for (let k = 0, n = p.length / 2; k < n; k++) {
    const j = (k + 1) % n;
    a += p[k * 2] * p[j * 2 + 1] - p[j * 2] * p[k * 2 + 1];
  }
  return a / 2;
}

function ringCentroid(p) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let k = 0, n = p.length / 2; k < n; k++) {
    const j = (k + 1) % n;
    const f = p[k * 2] * p[j * 2 + 1] - p[j * 2] * p[k * 2 + 1];
    a += f;
    cx += (p[k * 2] + p[j * 2]) * f;
    cy += (p[k * 2 + 1] + p[j * 2 + 1]) * f;
  }
  if (!a) return [p[0], p[1]];
  return [cx / (3 * a), cy / (3 * a)];
}

let decoded = null;

/** { code: { rings: [Float32Array x,y,...], centroid: [x, y], area } } in map units. */
export function worldShapes() {
  if (decoded) return decoded;
  decoded = {};
  for (const [code, data] of Object.entries(WORLD_SHAPES)) {
    const rings = data.split(' ').flatMap(decodeBlock);
    let big = rings[0];
    let bigA = 0;
    let area = 0;
    for (const r of rings) {
      const a = Math.abs(ringArea(r));
      area += a;
      if (a > bigA) {
        bigA = a;
        big = r;
      }
    }
    decoded[code] = { rings, centroid: ringCentroid(big), area };
  }
  return decoded;
}

const pathCache = new Map();

/** A Path2D of one country in map units (browser only; null elsewhere). */
export function countryPath(code) {
  if (typeof Path2D === 'undefined') return null;
  let p = pathCache.get(code);
  if (p !== undefined) return p;
  const s = worldShapes()[code];
  if (!s) {
    pathCache.set(code, null);
    return null;
  }
  p = new Path2D();
  for (const r of s.rings) {
    p.moveTo(r[0], r[1]);
    for (let k = 2; k < r.length; k += 2) p.lineTo(r[k], r[k + 1]);
    p.closePath();
  }
  pathCache.set(code, p);
  return p;
}
