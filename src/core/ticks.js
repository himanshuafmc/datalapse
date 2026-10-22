// Axis tick placement: ports of matplotlib's MaxNLocator and LogLocator,
// so tick positions match what the Python engine drew.

import { pyDivmod, pyFloorDiv, pow10Int } from './pymath.js';

function nonsingular(vmin, vmax, expander = 1e-13, tiny = 1e-14) {
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) return [-expander, expander];
  if (vmax < vmin) [vmin, vmax] = [vmax, vmin];
  const maxabs = Math.max(Math.abs(vmin), Math.abs(vmax));
  const finfoTiny = 2.2250738585072014e-308;
  if (maxabs < (1e6 / tiny) * finfoTiny) return [-expander, expander];
  if (vmax - vmin <= maxabs * tiny) {
    if (vmax === 0 && vmin === 0) return [-expander, expander];
    return [vmin - expander * Math.abs(vmin), vmax + expander * Math.abs(vmax)];
  }
  return [vmin, vmax];
}

function scaleRange(vmin, vmax, n = 1, threshold = 100) {
  const dv = Math.abs(vmax - vmin);
  const meanv = (vmax + vmin) / 2;
  let offset;
  if (Math.abs(meanv) / dv < threshold) offset = 0;
  else offset = Math.sign(meanv) * pow10Int(pyFloorDiv(Math.log10(Math.abs(meanv)), 1));
  const scale = pow10Int(pyFloorDiv(Math.log10(dv / n), 1));
  return [scale, offset];
}

class EdgeInteger {
  constructor(step, offset) {
    this.step = step;
    this.offset = Math.abs(offset);
  }
  closeto(ms, edge) {
    let tol;
    if (this.offset > 0) {
      const digits = Math.log10(this.offset / this.step);
      tol = Math.max(1e-10, 10 ** (digits - 12));
      tol = Math.min(0.4999, tol);
    } else tol = 1e-10;
    return Math.abs(ms - edge) < tol;
  }
  le(x) {
    const [d, m] = pyDivmod(x, this.step);
    if (this.closeto(m / this.step, 1)) return d + 1;
    return d;
  }
  ge(x) {
    const [d, m] = pyDivmod(x, this.step);
    if (this.closeto(m / this.step, 0)) return d;
    return d + 1;
  }
}

function roundHalfEven(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const DEFAULT_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * matplotlib.ticker.MaxNLocator(nbins, steps, integer).tick_values(vmin, vmax).
 * Returns every candidate tick (callers filter to the visible range).
 */
export function maxNTicks(vmin, vmax, { nbins = 10, steps = null, integer = false, minNTicks = 2 } = {}) {
  let st = steps ? [...steps] : [...DEFAULT_STEPS];
  if (st[0] !== 1) st = [1, ...st];
  if (st[st.length - 1] !== 10) st = [...st, 10];
  const extended = [...st.slice(0, -1).map((s) => 0.1 * s), ...st, 10 * st[1]];
  [vmin, vmax] = nonsingular(vmin, vmax);
  const [scale, offset] = scaleRange(vmin, vmax, nbins);
  const _vmin = vmin - offset;
  const _vmax = vmax - offset;
  let cand = extended.map((s) => s * scale);
  if (integer) cand = cand.filter((s) => s < 1 || Math.abs(s - roundHalfEven(s)) < 0.001);
  const rawStep = (_vmax - _vmin) / nbins;
  let istep = cand.findIndex((s) => s >= rawStep);
  if (istep < 0) istep = cand.length - 1;
  let ticks = [];
  for (let k = istep; k >= 0; k--) {
    let step = cand[k];
    if (integer && Math.floor(_vmax) - Math.ceil(_vmin) >= minNTicks - 1) step = Math.max(1, step);
    const bestVmin = pyFloorDiv(_vmin, step) * step;
    const edge = new EdgeInteger(step, offset);
    const low = edge.le(_vmin - bestVmin);
    const high = edge.ge(_vmax - bestVmin);
    ticks = [];
    for (let i = low; i < high + 1; i += 1) ticks.push(i * step + bestVmin);
    const nticks = ticks.filter((t) => t <= _vmax && t >= _vmin).length;
    if (nticks >= minNTicks) break;
  }
  return ticks.map((t) => t + offset);
}

/**
 * Major ticks for a base-10 log axis: matplotlib's LogLocator.tick_values
 * (3.8+ algorithm) with subs=(1.0,). nRequest is the tick budget; the
 * engine's axes always get 9 (np.clip(tick_space, 2, 9)).
 */
export function logTicks(vmin, vmax, nRequest = 9) {
  if (!(vmin > 0) || !(vmax > 0)) return [];
  if (vmax < vmin) [vmin, vmax] = [vmax, vmin];
  const efmin = Math.log10(vmin);
  const efmax = Math.log10(vmax);
  const emin = Math.ceil(efmin);
  const emax = Math.floor(efmax);
  const nAvail = emax - emin + 1;
  let stride = Math.floor(nAvail / (nRequest + 1)) + 1;
  const nr = Math.ceil(nAvail / stride);
  if (nr <= nRequest) nRequest = nr;
  let decades;
  if (nRequest <= 0) {
    decades = [emin - 1, emax + 1];
  } else if (nRequest === 1) {
    const mid = pyRoundHalfEven((efmin + efmax) / 2);
    stride = Math.max(mid - (emin - 1), emax + 1 - mid);
    decades = [mid - stride, mid, mid + stride];
  } else {
    stride = Math.floor((nAvail - 1) / (nRequest - 1));
    if (stride < nAvail / nRequest) stride = Math.floor(nAvail / nRequest);
    const olo = Math.max(nAvail - stride * nRequest, 0);
    const ohi = Math.min(nAvail - stride * (nRequest - 1), stride);
    let offset = (((-emin) % stride) + stride) % stride;
    if (!(olo <= offset && offset < ohi)) offset = olo;
    decades = [];
    for (let d = emin + offset - stride; d < emax + stride + 1; d += stride) decades.push(d);
  }
  return decades.map((d) => pow10Int(d));
}

function pyRoundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** True when v lies inside [lo, hi] up to matplotlib's tolerance. */
export function inInterval(v, lo, hi, rtol = 1e-10) {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  const tol = rtol * (b - a);
  return v >= a - tol && v <= b + tol;
}
