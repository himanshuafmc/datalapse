// Python- and NumPy-compatible numeric helpers.
//
// The original Chart Runner engine is Python (NumPy + matplotlib). These
// functions reproduce the exact arithmetic it relies on, so a story renders
// with the same numbers in the browser: round-half-to-even, f-string number
// formatting, float floor division, np.interp and the cumulative-sum moving
// average. tests/parity_check.py checks them against the Python engine.

/** Python's round(x) for floats: round half to even. */
export function pyRound(x) {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return ((f % 2) + 2) % 2 === 0 ? f : f + 1;
}

/** Insert thousands separators into a plain decimal string ("-1234.5" -> "-1,234.5"). */
export function addCommas(s) {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  let int = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? '' : body.slice(dot);
  let out = '';
  while (int.length > 3) {
    out = ',' + int.slice(-3) + out;
    int = int.slice(0, -3);
  }
  return (neg ? '-' : '') + int + out + frac;
}

/** Indian digit grouping ("1234567" -> "12,34,567"). */
export function addIndianCommas(s) {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  const int = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? '' : body.slice(dot);
  if (int.length <= 3) return s;
  let head = int.slice(0, -3);
  const tail = int.slice(-3);
  const parts = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) parts.unshift(head);
  return (neg ? '-' : '') + parts.join(',') + ',' + tail + frac;
}

/**
 * Python f"{x:.{d}f}" (optionally with "," grouping).
 * JavaScript's toFixed rounds exact ties away from zero; Python rounds them
 * to even. Every other case is identical because both convert the exact
 * binary value.
 */
export function pyFixed(x, d = 0, thousands = false) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const neg = x < 0 || Object.is(x, -0);
  const ax = Math.abs(x);
  let s;
  if (ax >= 1e21) {
    // toFixed switches to exponent notation here; fall back to BigInt for the integer part.
    s = BigInt(Math.round(ax)).toString() + (d > 0 ? '.' + '0'.repeat(d) : '');
  } else {
    s = ax.toFixed(d);
    const ext = ax.toFixed(Math.min(100, d + 40));
    const dot = ext.indexOf('.');
    const tail = ext.slice(dot + 1 + d);
    if (/^50*$/.test(tail)) {
      const truncated = d === 0 ? ext.slice(0, dot) : ext.slice(0, dot + 1 + d);
      const last = Number(truncated[truncated.length - 1]);
      if (last % 2 === 0) s = truncated;
    }
  }
  if (neg) s = '-' + s;
  return thousands ? addCommas(s) : s;
}

/** Python f"{x:g}" (precision 6 by default). */
export function pyGeneral(x, precision = 6) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const p = Math.max(1, precision);
  const expStr = x.toExponential(p - 1); // e.g. "1.23457e+5"
  const exp = Number(expStr.split('e')[1]);
  if (exp >= -4 && exp < p) {
    let s = pyFixed(x, p - 1 - exp);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  let [mant, e] = expStr.split('e');
  if (mant.includes('.')) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
  const en = Number(e);
  const sign = en < 0 ? '-' : '+';
  const digits = String(Math.abs(en)).padStart(2, '0');
  return `${mant}e${sign}${digits}`;
}

/** CPython float divmod. Returns [floordiv, mod]. */
export function pyDivmod(vx, wx) {
  let mod = vx % wx;
  let div = (vx - mod) / wx;
  if (mod) {
    if ((wx < 0) !== (mod < 0)) {
      mod += wx;
      div -= 1.0;
    }
  } else {
    mod = wx < 0 ? -0 : 0;
  }
  let floordiv;
  if (div) {
    floordiv = Math.floor(div);
    if (div - floordiv > 0.5) floordiv += 1.0;
  } else {
    floordiv = (vx / wx) < 0 || Object.is(vx / wx, -0) ? -0 : 0;
  }
  return [floordiv, mod];
}

export function pyFloorDiv(a, b) {
  return pyDivmod(a, b)[0];
}

/** 10 ** k for integer k, correctly rounded (matches C pow for these inputs). */
export function pow10Int(k) {
  return Number('1e' + k);
}

/**
 * numpy.interp for one value. xp must be increasing.
 * Follows NumPy's C implementation, including its NaN handling.
 */
export function interpScalar(x, xp, fp) {
  const n = xp.length;
  if (Number.isNaN(x)) return x;
  if (n === 1) return fp[0];
  if (x < xp[0]) return fp[0];
  if (x > xp[n - 1]) return fp[n - 1];
  // largest j with xp[j] <= x
  let lo = 0;
  let hi = n - 1;
  if (x >= xp[n - 1]) return fp[n - 1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xp[mid] <= x) lo = mid;
    else hi = mid;
  }
  const j = lo;
  if (xp[j] === x) return fp[j];
  const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
  let r = slope * (x - xp[j]) + fp[j];
  if (Number.isNaN(r)) {
    r = slope * (x - xp[j + 1]) + fp[j + 1];
    if (Number.isNaN(r) && fp[j] === fp[j + 1]) r = fp[j];
  }
  return r;
}

/** numpy.interp over many x values. Returns a Float64Array. */
export function interp(xs, xp, fp) {
  const out = new Float64Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = interpScalar(xs[i], xp, fp);
  return out;
}

/**
 * The engine's smooth(): centred moving average along time, edges padded by
 * repeating the first and last values, computed with a cumulative sum in the
 * same order NumPy uses.
 */
export function smooth(arr, win) {
  win = Math.trunc(win);
  if (win <= 1) return Float64Array.from(arr);
  if (win % 2 === 0) win += 1;
  const pad = Math.floor(win / 2);
  const n = arr.length;
  const m = n + 2 * pad;
  const c = new Float64Array(m + 1);
  let acc = 0;
  c[0] = 0;
  for (let k = 0; k < m; k++) {
    const src = k < pad ? arr[0] : k >= pad + n ? arr[n - 1] : arr[k - pad];
    acc = k === 0 ? 0 + src : acc + src;
    c[k + 1] = acc;
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (c[i + win] - c[i]) / win;
  return out;
}

/** np.nanmax of a list (NaN if all NaN or empty). */
export function nanmax(values) {
  let best = NaN;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(best) || v > best) best = v;
  }
  return best;
}

/** np.maximum.accumulate (NaN propagates like NumPy). */
export function maximumAccumulate(arr) {
  const out = new Float64Array(arr.length);
  let cur = arr.length ? arr[0] : NaN;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (i === 0) cur = v;
    else if (Number.isNaN(cur) || Number.isNaN(v)) cur = NaN;
    else if (v > cur) cur = v;
    out[i] = cur;
  }
  return out;
}

/** pandas ffill then bfill on a Float64Array. */
export function ffillBfill(arr) {
  const out = Float64Array.from(arr);
  let last = NaN;
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(out[i])) out[i] = last;
    else last = out[i];
  }
  let next = NaN;
  for (let i = out.length - 1; i >= 0; i--) {
    if (Number.isNaN(out[i])) out[i] = next;
    else next = out[i];
  }
  return out;
}

/** Python 3.12+ sum() over floats (Neumaier compensated summation). */
export function pySum(values) {
  let s = 0.0;
  let c = 0.0;
  for (const x of values) {
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += (s - t) + x;
    else c += (x - t) + s;
    s = t;
  }
  if (c && Number.isFinite(c)) s += c;
  return s;
}
