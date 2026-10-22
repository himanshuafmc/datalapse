// Colour ramps for maps and other value-coloured marks.

function hexToRgb(h) {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r, g, b) => `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;

/** Sequential ramps, low to high, readable on dark and light backgrounds. */
export const RAMPS = {
  // viridis without its darkest end (which vanishes on a dark background)
  dark: ['#3B528B', '#2C728E', '#21918C', '#28AE80', '#5EC962', '#ADDC30', '#FDE725'],
  light: ['#DCEAF7', '#A9CCE8', '#6BAED6', '#3182BD', '#1F5FA8', '#08306B'],
};

/** A function t (0..1) -> colour, through the given stops. */
export function makeRamp(stops) {
  const rgb = stops.map(hexToRgb);
  return (t) => {
    if (!Number.isFinite(t)) return null;
    const x = Math.max(0, Math.min(1, t)) * (rgb.length - 1);
    const i = Math.min(rgb.length - 2, Math.floor(x));
    const f = x - i;
    const a = rgb[i];
    const b = rgb[i + 1];
    return toHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  };
}

/** Relative luminance (0 dark .. 1 light) of a hex colour. */
export function hexLuminance(h) {
  const [r, g, b] = hexToRgb(h).map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
