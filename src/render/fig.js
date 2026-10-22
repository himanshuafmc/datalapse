// A small matplotlib-like figure for Canvas 2D.
//
// Scenes add drawing operations with a z-order; the figure sorts and runs
// them, so layering matches matplotlib. Coordinates are figure fractions from
// the bottom-left, like the Python engine; text is laid out with matplotlib's
// rules (ink-box alignment, "lp" line metrics, 1.2 line spacing).

import { PT } from '../core/layout.js';
import { drawIcon } from './images.js';

export const HEAD = 'Poppins';
export const BODY = 'Roboto';

const KIND = { artist: 0, axes: 1, text: 2 };
const metricCache = new Map();

export function fontString(size, family = BODY, weight = 400) {
  // Poppins also covers Devanagari, so Hindi and Marathi text renders in the
  // video's own type even inside Roboto text.
  return `${weight} ${size}px "${family}", "Poppins", system-ui, sans-serif`;
}

function weightOf(w) {
  if (w === 'bold') return 700;
  if (w === 'medium') return 500;
  if (w === 'light') return 300;
  if (w === 'regular' || w === 'normal' || w == null) return 400;
  return Number(w) || 400;
}

function lpMetrics(ctx, font) {
  let m = metricCache.get(font);
  if (!m) {
    ctx.font = font;
    const t = ctx.measureText('lp');
    m = { asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent };
    metricCache.set(font, m);
  }
  return m;
}

export function clearMetricCache() {
  metricCache.clear();
}

/**
 * Lay out (and optionally draw) multi-line text the way matplotlib does.
 * x, y are canvas pixels (y down). Returns the text box in pixels.
 */
export function layoutText(ctx, x, y, str, o = {}) {
  const size = o.size ?? 20;
  const family = o.family ?? BODY;
  const weight = weightOf(o.weight);
  const font = fontString(size, family, weight);
  const ls = o.linespacing ?? 1.2;
  const lines = String(str).split('\n');
  ctx.font = font;
  const lp = lpMetrics(ctx, font);
  const lpH = lp.asc + lp.desc;
  const lpD = lp.desc;
  const minDy = (lpH - lpD) * ls;
  let thisy = 0;
  const rows = [];
  let maxW = 0;
  lines.forEach((line, i) => {
    let w = 0;
    let h = 0;
    let d = 0;
    let left = 0;
    if (line) {
      const m = ctx.measureText(line);
      left = m.actualBoundingBoxLeft;
      w = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
      h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      d = m.actualBoundingBoxDescent;
    }
    h = Math.max(h, lpH);
    d = Math.max(d, lpD);
    if (i === 0) thisy = -(h - d);
    else thisy -= Math.max(minDy, (h - d) * ls);
    rows.push({ line, w, left, base: thisy });
    thisy -= d;
    maxW = Math.max(maxW, w);
  });
  const height = -thisy;
  const ha = o.ha ?? 'left';
  const va = o.va ?? 'baseline';
  let boxLeft = x;
  if (ha === 'center') boxLeft = x - maxW / 2;
  else if (ha === 'right') boxLeft = x - maxW;
  let boxTop;
  if (va === 'top') boxTop = y;
  else if (va === 'bottom') boxTop = y - height;
  else if (va === 'center') boxTop = y - height / 2;
  else boxTop = y + rows[0].base; // baseline: first baseline sits on y
  if (o.draw !== false) {
    ctx.font = font;
    ctx.fillStyle = o.color ?? '#fff';
    ctx.globalAlpha = clampAlpha(o.alpha ?? 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (const r of rows) {
      if (!r.line) continue;
      let lx = boxLeft;
      if (ha === 'center') lx = boxLeft + (maxW - r.w) / 2;
      else if (ha === 'right') lx = boxLeft + (maxW - r.w);
      ctx.fillText(r.line, lx + r.left, boxTop - r.base);
    }
  }
  return { left: boxLeft, top: boxTop, width: maxW, height };
}

function clampAlpha(a) {
  return Math.max(0, Math.min(1, a));
}

export function roundedRectPath(ctx, x, y, w, h, r) {
  // matplotlib BoxStyle.Round: straight edges joined by quadratic corners.
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export class Fig {
  constructor(ctx, L, T) {
    this.ctx = ctx;
    this.L = L;
    this.T = T;
    this.ops = [];
    this.seq = 0;
  }

  px(x) {
    return x * this.L.W;
  }

  py(y) {
    return (1 - y) * this.L.H;
  }

  add(z, fn, kind = 'artist') {
    this.ops.push({ z, k: KIND[kind] ?? 0, seq: this.seq++, fn });
  }

  /**
   * Draw everything queued for this frame, in matplotlib's order. With a
   * camera ({ zoom, x, y }), the chart layers (z below 20) are zoomed and
   * titles, captions and the channel name stay put.
   */
  flush() {
    const ctx = this.ctx;
    this.ops.sort((a, b) => a.z - b.z || a.k - b.k || a.seq - b.seq);
    const cam = this.camera && this.camera.zoom > 1.0005 ? this.camera : null;
    let m = null;
    if (cam) {
      const { W, H } = this.L;
      const z = cam.zoom;
      const fx = cam.x * W;
      const fy = (1 - cam.y) * H;
      const tx = Math.min(0, Math.max(W * (1 - z), W / 2 - fx * z));
      const ty = Math.min(0, Math.max(H * (1 - z), H / 2 - fy * z));
      m = [z, tx, ty];
    }
    for (const op of this.ops) {
      ctx.save();
      if (m && op.z < 20) ctx.transform(m[0], 0, 0, m[0], m[1], m[2]);
      op.fn(ctx);
      ctx.restore();
    }
    this.ops = [];
    this.seq = 0;
  }

  /** fig.text(x, y, s, ...) in figure fractions. */
  text(x, y, s, o = {}) {
    if (s == null || s === '') return;
    const X = this.px(x);
    const Y = this.py(y);
    this.add(o.zorder ?? 3, (ctx) => layoutText(ctx, X, Y, s, o), 'text');
  }

  /** fig.add_artist(Rectangle(...)) in figure fractions. */
  rect(x, y, w, h, color, alpha = 1, zorder = 1) {
    const X = this.px(x);
    const Y = this.py(y + h);
    const Wd = w * this.L.W;
    const Ht = h * this.L.H;
    this.add(zorder, (ctx) => {
      ctx.globalAlpha = clampAlpha(alpha);
      ctx.fillStyle = color;
      ctx.fillRect(X, Y, Wd, Ht);
    });
  }

  /** engine.py rounded_box(): radius r is a fraction of the frame width. */
  roundedBox(x, y, w, h, color, alpha, r = 0.012, zorder = 20) {
    const X = this.px(x);
    const Y = this.py(y + h);
    const Wd = w * this.L.W;
    const Ht = h * this.L.H;
    const R = r * this.L.W;
    this.add(zorder, (ctx) => {
      ctx.globalAlpha = clampAlpha(alpha);
      ctx.fillStyle = color;
      roundedRectPath(ctx, X, Y, Wd, Ht, R);
      ctx.fill();
    });
  }

  /** An image (flag or logo) in a box given in figure fractions. */
  icon(x, y, w, h, icon, o = {}) {
    if (!icon) return;
    const X = this.px(x);
    const Y = this.py(y + h);
    const Wd = w * this.L.W;
    const Ht = h * this.L.H;
    this.add(o.zorder ?? 30, (ctx) => drawIcon(ctx, icon, X, Y, Wd, Ht, o.radius ?? 0.12, o.alpha ?? 1));
  }

  /** Free drawing in canvas pixels (maps, custom marks): fn(ctx). */
  custom(zorder, fn) {
    this.add(zorder, fn);
  }

  axes(rect, zorder = 0) {
    const ax = new Axes(this, rect);
    this.add(zorder, (ctx) => ax.render(ctx), 'axes');
    return ax;
  }
}

/** A rectangle of the figure with data coordinates, like a matplotlib Axes. */
export class Axes {
  constructor(fig, rect) {
    this.fig = fig;
    const { W, H } = fig.L;
    const [l, b, w, h] = rect;
    this.x0 = l * W;
    this.x1 = (l + w) * W;
    this.yTop = (1 - (b + h)) * H;
    this.yBot = (1 - b) * H;
    this.xlim = [0, 1];
    this.ylim = [0, 1];
    this.ylog = false;
    this.ops = [];
    this.seq = 0;
  }

  setXlim(a, b) {
    this.xlim = [a, b];
  }

  setYlim(a, b) {
    this.ylim = [a, b];
  }

  get widthPx() {
    return this.x1 - this.x0;
  }

  get heightPx() {
    return this.yBot - this.yTop;
  }

  xFrac(x) {
    return (x - this.xlim[0]) / (this.xlim[1] - this.xlim[0]);
  }

  yFrac(y) {
    if (this.ylog) {
      const a = Math.log10(this.ylim[0]);
      const b = Math.log10(this.ylim[1]);
      return (Math.log10(y) - a) / (b - a);
    }
    return (y - this.ylim[0]) / (this.ylim[1] - this.ylim[0]);
  }

  X(x) {
    return this.x0 + this.xFrac(x) * this.widthPx;
  }

  Y(y) {
    return this.yBot - this.yFrac(y) * this.heightPx;
  }

  /** Axes-fraction to canvas pixels. */
  AX(fx) {
    return this.x0 + fx * this.widthPx;
  }

  AY(fy) {
    return this.yBot - fy * this.heightPx;
  }

  add(z, fn, clip = true) {
    this.ops.push({ z, seq: this.seq++, fn, clip });
  }

  render(ctx) {
    this.ops.sort((a, b) => a.z - b.z || a.seq - b.seq);
    for (const op of this.ops) {
      ctx.save();
      if (op.clip) {
        ctx.beginPath();
        ctx.rect(this.x0, this.yTop, this.widthPx, this.heightPx);
        ctx.clip();
      }
      op.fn(ctx);
      ctx.restore();
    }
  }

  /** ax.barh(y, width, height=...) */
  barh(y, width, height, color, alpha, zorder = 1) {
    this.add(zorder, (ctx) => {
      const xa = this.X(0);
      const xb = this.X(width);
      const ya = this.Y(y - height / 2);
      const yb = this.Y(y + height / 2);
      ctx.globalAlpha = clampAlpha(alpha);
      ctx.fillStyle = color;
      ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
    });
  }

  /** Text at (x, y); coords: 'data' | 'axes' | 'xaxes' (x in axes fraction, y in data) | 'yaxes'. */
  text(x, y, s, o = {}, coords = 'data') {
    if (s == null || s === '') return;
    const z = o.zorder ?? 3;
    this.add(z, (ctx) => {
      const X = coords === 'axes' || coords === 'xaxes' ? this.AX(x) : this.X(x);
      const Y = coords === 'axes' || coords === 'yaxes' ? this.AY(y) : this.Y(y);
      layoutText(ctx, X, Y, s, o);
    }, false);
  }

  /** ax.plot(xs, ys, ...) ; widths in points. */
  plot(xs, ys, o = {}, coords = 'data') {
    if (xs.length < 1) return;
    this.add(o.zorder ?? 2, (ctx) => {
      ctx.globalAlpha = clampAlpha(o.alpha ?? 1);
      ctx.strokeStyle = o.color ?? '#fff';
      ctx.lineWidth = (o.lw ?? 1.5) * PT;
      ctx.lineCap = o.cap ?? 'round';
      ctx.lineJoin = 'round';
      if (o.dash) ctx.setLineDash(o.dash.map((d) => d * (o.lw ?? 1.5) * PT));
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const X = coords === 'axes' ? this.AX(xs[i]) : this.X(xs[i]);
        const Y = coords === 'axes' ? this.AY(ys[i]) : this.Y(ys[i]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      if (xs.length === 1) ctx.lineTo(this.X(xs[0]) + 0.01, this.Y(ys[0]));
      ctx.stroke();
    }, o.clip !== false);
  }

  /** ax.scatter with s in points^2. */
  dot(x, y, s, color, o = {}) {
    this.add(o.zorder ?? 1, (ctx) => {
      const r = (Math.sqrt(s) * PT) / 2;
      ctx.globalAlpha = clampAlpha(o.alpha ?? 1);
      ctx.beginPath();
      ctx.arc(this.X(x), this.Y(y), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (o.edgecolor && o.lw) {
        ctx.lineWidth = o.lw * PT;
        ctx.strokeStyle = o.edgecolor;
        ctx.stroke();
      }
    });
  }

  /** Filled band between two lines (stacked areas): xs, lower ys, upper ys. */
  fillBetween(xs, lo, hi, color, alpha = 1, zorder = 1) {
    if (xs.length < 2) return;
    this.add(zorder, (ctx) => {
      ctx.globalAlpha = clampAlpha(alpha);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const X = this.X(xs[i]);
        const Y = this.Y(hi[i]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(this.X(xs[i]), this.Y(lo[i]));
      ctx.closePath();
      ctx.fill();
    });
  }

  /** Free drawing inside the axes (clipped), with this axes' transforms: fn(ctx, ax). */
  custom(zorder, fn, clip = true) {
    this.add(zorder, (ctx) => fn(ctx, this), clip);
  }

  /** Horizontal line across the axes at data y. */
  axhline(y, o = {}) {
    this.add(o.zorder ?? 2, (ctx) => {
      ctx.globalAlpha = clampAlpha(o.alpha ?? 1);
      ctx.strokeStyle = o.color ?? '#fff';
      ctx.lineWidth = (o.lw ?? 1) * PT;
      if (o.dash) ctx.setLineDash(o.dash.map((d) => d * (o.lw ?? 1) * PT));
      ctx.beginPath();
      const Y = this.Y(y);
      ctx.moveTo(this.x0, Y);
      ctx.lineTo(this.x1, Y);
      ctx.stroke();
    });
  }

  /** Vertical line across the axes at data x. */
  axvline(x, o = {}) {
    this.add(o.zorder ?? 2, (ctx) => {
      ctx.globalAlpha = clampAlpha(o.alpha ?? 1);
      ctx.strokeStyle = o.color ?? '#fff';
      ctx.lineWidth = (o.lw ?? 1) * PT;
      if (o.dash) ctx.setLineDash(o.dash.map((d) => d * (o.lw ?? 1) * PT));
      ctx.beginPath();
      const X = this.X(x);
      ctx.moveTo(X, this.yTop);
      ctx.lineTo(X, this.yBot);
      ctx.stroke();
    });
  }

  /** Grid lines behind the data (axisbelow). */
  gridX(ticks, color, lw) {
    this.add(0.5, (ctx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw * PT;
      ctx.beginPath();
      for (const t of ticks) {
        const X = Math.round(this.X(t) * 2) / 2;
        ctx.moveTo(X, this.yTop);
        ctx.lineTo(X, this.yBot);
      }
      ctx.stroke();
    });
  }

  gridY(ticks, color, lw) {
    this.add(0.5, (ctx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw * PT;
      ctx.beginPath();
      for (const t of ticks) {
        const Y = Math.round(this.Y(t) * 2) / 2;
        ctx.moveTo(this.x0, Y);
        ctx.lineTo(this.x1, Y);
      }
      ctx.stroke();
    });
  }

  /**
   * An image box centred vertically on data y. hData is its height in data
   * units (like a bar); width follows the image's shape (4:3 for flags).
   * x is data (or axes fraction with coords 'axes'); dx shifts it in pixels.
   */
  icon(x, y, icon, o = {}) {
    if (!icon) return;
    this.add(o.zorder ?? 3, (ctx) => {
      const hPx = o.hPx ?? Math.abs(this.Y(y + (o.hData ?? 0.7) / 2) - this.Y(y - (o.hData ?? 0.7) / 2));
      const wPx = hPx * (o.boxAspect ?? 4 / 3);
      const X = (o.coords === 'axes' ? this.AX(x) : this.X(x)) + (o.dx ?? 0);
      const Y = o.coords === 'axes' ? this.AY(y) : this.Y(y);
      drawIcon(ctx, icon, X, Y - hPx / 2, wPx, hPx, o.radius ?? 0.14, o.alpha ?? 1);
    }, false);
  }

  /** Width in pixels of an icon of hData data units (for placing text after it). */
  iconWidthPx(y, hData, boxAspect = 4 / 3) {
    return Math.abs(this.Y(y + hData / 2) - this.Y(y - hData / 2)) * boxAspect;
  }

  /** Tick labels. side: 'top' | 'bottom' | 'left'. pad in points. */
  tickLabels(ticks, labels, side, o) {
    const pad = (o.pad ?? 6) * PT;
    this.add(2.5, (ctx) => {
      ticks.forEach((t, i) => {
        const s = labels[i];
        if (!s) return;
        if (side === 'top') layoutText(ctx, this.X(t), this.yTop - pad, s, { ...o, ha: 'center', va: 'bottom' });
        else if (side === 'bottom') layoutText(ctx, this.X(t), this.yBot + pad, s, { ...o, ha: 'center', va: 'top' });
        else if (side === 'left') layoutText(ctx, this.x0 - pad, this.Y(t), s, { ...o, ha: 'right', va: 'center' });
      });
    }, false);
  }
}
