// Easing curves, ported from engine.py.

export function clamp(x, a = 0.0, b = 1.0) {
  return Math.max(a, Math.min(b, x));
}

export function easeOut(x) {
  x = clamp(x);
  return 1 - (1 - x) ** 3;
}

export function easeInOut(x) {
  x = clamp(x);
  return 3 * x * x - 2 * x * x * x;
}

/** Alpha for something visible from 0..dur seconds, fading in and out. */
export function fade(t, dur, fin = 0.35, fout = 0.35) {
  if (t < 0 || t > dur) return 0.0;
  let a = 1.0;
  if (fin > 0) a = Math.min(a, easeOut(t / fin));
  if (fout > 0) a = Math.min(a, easeOut((dur - t) / fout));
  return a;
}
