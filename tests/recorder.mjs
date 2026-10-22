// A stand-in for render/fig.js that records what a scene draws instead of
// painting pixels. tests/parity_check.py records the Python engine the same
// way (by wrapping matplotlib calls), and the two logs are compared.

const PX_PER_PT = 100 / 72;

function hex(c) {
  return String(c ?? '').toLowerCase();
}

function fam(f) {
  return f === 'Poppins' ? 'head' : 'body';
}

function wt(w) {
  if (w == null || w === 'normal') return 'regular';
  return String(w);
}

export class RecordingFig {
  constructor(L, T) {
    this.L = L;
    this.T = T;
    this.calls = [];
    this.axesList = [];
  }

  text(x, y, s, o = {}) {
    if (s == null || s === '') return;
    this.calls.push(['ftext', x, y, String(s), o.size, o.alpha ?? 1, hex(o.color), o.ha ?? 'left', o.va ?? 'baseline', wt(o.weight), fam(o.family), o.zorder ?? 3]);
  }

  rect(x, y, w, h, color, alpha = 1, zorder = 1) {
    this.calls.push(['rect', x, y, w, h, alpha, hex(color), zorder]);
  }

  roundedBox(x, y, w, h, color, alpha, r = 0.012, zorder = 20) {
    this.calls.push(['rbox', x, y, w, h, alpha, hex(color), zorder]);
  }

  icon() {}

  custom() {}

  axes(rect, zorder = 0) {
    const ax = new RecordingAxes(this, rect, zorder);
    this.axesList.push(ax);
    return ax;
  }

  flush() {}
}

export class RecordingAxes {
  constructor(fig, rect, zorder) {
    this.fig = fig;
    this.rect = rect;
    this.zorder = zorder;
    this.xlim = [0, 1];
    this.ylim = [0, 1];
    this.ylog = false;
    this.ticks = {};
  }
  custom() {}

  fillBetween() {}


  setXlim(a, b) {
    this.xlim = [a, b];
  }

  setYlim(a, b) {
    this.ylim = [a, b];
  }

  barh(y, width, height, color, alpha) {
    this.fig.calls.push(['barh', y, width, height, alpha, hex(color)]);
  }

  text(x, y, s, o = {}) {
    if (s == null || s === '') return;
    this.fig.calls.push(['atext', x, y, String(s), o.size, o.alpha ?? 1, hex(o.color), o.ha ?? 'left', o.va ?? 'baseline', wt(o.weight), fam(o.family)]);
  }

  plot(xs, ys, o = {}) {
    let sum = 0;
    for (const v of ys) sum += v;
    this.fig.calls.push(['plot', xs.length, xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1], sum, o.lw ?? 1.5, o.alpha ?? 1, hex(o.color)]);
  }

  dot(x, y, s, color, o = {}) {
    this.fig.calls.push(['dot', x, y, s, hex(color), o.alpha ?? 1]);
  }

  axhline(y, o = {}) {
    this.fig.calls.push(['hline', y, o.lw ?? 1, o.alpha ?? 1]);
  }

  axvline(x, o = {}) {
    this.fig.calls.push(['vline', x, o.lw ?? 1, o.alpha ?? 1]);
  }

  icon() {}

  iconWidthPx() {
    return 0;
  }

  gridX() {}

  gridY() {}

  tickLabels(ticks, labels, side) {
    this.ticks[side] = [ticks, labels];
  }

  summary() {
    return { rect: this.rect, zorder: this.zorder, xlim: this.xlim, ylim: this.ylim, ticks: this.ticks };
  }
}

export { PX_PER_PT };
