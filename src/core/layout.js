// Frame geometry for each output format. Positions are figure fractions
// measured from the bottom-left, exactly as in engine.py; font sizes are
// pixels. Landscape and vertical reproduce the Python engine; square and
// 4:5 portrait are additions tuned the same way.
//
// `t` holds per-format choices the scenes make (wrap widths, where the
// outro button sits, whether cards sit in a row...).

const TUNE = {
  landscape: {
    barHead: 1.14, barTicks: 5, lineXPad: 0.2, lineXTicks: 6, hookWrapBig: 26, hookWrapSmall: 48,
    titleBig: 0.95, titleWrap: 24, titleSubWrap: 50, ruleScale: 1, subWrapMul: 1.75, sourceSide: 'right', captionPad: 1,
    outro: { fs: 0.72, y: 0.70, wrap: 30, bw: 0.20, bh: 0.085, by: 0.30, srcY: 0.06, srcWrap: 110 },
    cards: { hy: 0.80, wrap: 40, row: true, rowY: 0.25, rowH: 0.40, footerY: 0.12, footerWrap: 80, top: 0.72, area: 0.56 },
    dots: { row: true, size: 560, rectX: 0.07, rectY: 0.235, tx: 0.47, ty: 0.64, bigFs: 150, wrap: 30, year: [0.905, 0.235] },
  },
  vertical: {
    barHead: 1.3, barTicks: 4, lineXPad: 0.3, lineXTicks: 4, hookWrapBig: 16, hookWrapSmall: 28,
    titleBig: 0.85, titleWrap: 16, titleSubWrap: 30, ruleScale: 0.56, subWrapMul: 2.3, sourceSide: 'left', captionPad: 1.4,
    outro: { fs: 0.7, y: 0.72, wrap: 18, bw: 0.46, bh: 0.05, by: 0.40, srcY: 0.2, srcWrap: 50 },
    cards: { hy: 0.86, wrap: 22, row: false, footerY: 0.12, footerWrap: 40, top: 0.72, area: 0.56 },
    dots: { row: false, size: 700, rectY: 0.345, tx: 0.065, ty: 0.805, bigFs: 120, wrap: 34, yearFs: 90 },
  },
  square: {
    barHead: 1.28, barTicks: 4, lineXPad: 0.28, lineXTicks: 4, hookWrapBig: 18, hookWrapSmall: 32,
    titleBig: 0.85, titleWrap: 18, titleSubWrap: 36, ruleScale: 1, subWrapMul: 1.9, sourceSide: 'left', captionPad: 1.3,
    outro: { fs: 0.68, y: 0.76, wrap: 20, bw: 0.40, bh: 0.08, by: 0.36, srcY: 0.08, srcWrap: 64 },
    cards: { hy: 0.88, wrap: 26, row: true, rowY: 0.22, rowH: 0.46, footerY: 0.11, footerWrap: 56, top: 0.72, area: 0.56 },
    dots: { row: true, size: 500, rectX: 0.06, rectY: 0.25, tx: 0.585, ty: 0.62, bigFs: 110, wrap: 17, year: [0.94, 0.235] },
  },
  portrait: {
    barHead: 1.3, barTicks: 4, lineXPad: 0.3, lineXTicks: 4, hookWrapBig: 17, hookWrapSmall: 30,
    titleBig: 0.85, titleWrap: 17, titleSubWrap: 32, ruleScale: 0.8, subWrapMul: 2.1, sourceSide: 'left', captionPad: 1.4,
    outro: { fs: 0.7, y: 0.74, wrap: 19, bw: 0.46, bh: 0.065, by: 0.38, srcY: 0.12, srcWrap: 56 },
    cards: { hy: 0.87, wrap: 24, row: false, footerY: 0.10, footerWrap: 44, top: 0.74, area: 0.56 },
    dots: { row: false, size: 560, rectY: 0.25, tx: 0.065, ty: 0.785, bigFs: 110, wrap: 36, yearFs: 84 },
  },
};

export class Layout {
  constructor(fmt = 'landscape') {
    if (!TUNE[fmt]) fmt = 'landscape';
    this.fmt = fmt;
    this.landscape = fmt === 'landscape';
    this.t = TUNE[fmt];
    if (fmt === 'landscape') {
      this.W = 1920;
      this.H = 1080;
      this.fs = { title: 50, subtitle: 27, brand: 19, caption: 34, kicker: 21, name: 26,
        value: 24, year: 150, counter: 30, source: 17, tick: 20, hook: 76,
        hook_small: 44, label: 24, marker: 19, card_big: 78, card_small: 26 };
      this.title_x = 0.045;
      this.title_y = 0.925;
      this.title_wrap = 60;
      this.chart = [0.165, 0.215, 0.75, 0.58];
      this.line_chart = [0.075, 0.215, 0.74, 0.58];
      this.caption = [0.045, 0.035, 0.91, 0.125];
      this.source_xy = [0.955, 0.012];
      this.year_xy = [0.905, 0.235];
      this.brand_xy = [0.955, 0.94];
      this.nbars = 10;
    } else if (fmt === 'vertical') {
      this.W = 1080;
      this.H = 1920;
      this.fs = { title: 56, subtitle: 31, brand: 24, caption: 38, kicker: 24, name: 31,
        value: 28, year: 135, counter: 32, source: 19, tick: 24, hook: 84,
        hook_small: 48, label: 28, marker: 22, card_big: 84, card_small: 30 };
      this.title_x = 0.065;
      this.title_y = 0.905;
      this.title_wrap = 26;
      this.chart = [0.255, 0.335, 0.60, 0.45];
      this.line_chart = [0.12, 0.335, 0.64, 0.45];
      this.caption = [0.065, 0.15, 0.80, 0.155];
      this.source_xy = [0.065, 0.127];
      this.year_xy = [0.845, 0.36];
      this.brand_xy = [0.065, 0.955];
      this.nbars = 10;
    } else if (fmt === 'square') {
      this.W = 1080;
      this.H = 1080;
      this.fs = { title: 46, subtitle: 26, brand: 20, caption: 30, kicker: 20, name: 24,
        value: 22, year: 110, counter: 26, source: 16, tick: 19, hook: 68,
        hook_small: 40, label: 23, marker: 18, card_big: 64, card_small: 24 };
      this.title_x = 0.06;
      this.title_y = 0.925;
      this.title_wrap = 30;
      this.chart = [0.22, 0.25, 0.68, 0.51];
      this.line_chart = [0.10, 0.25, 0.66, 0.51];
      this.caption = [0.06, 0.07, 0.88, 0.145];
      this.source_xy = [0.06, 0.058];
      this.year_xy = [0.88, 0.27];
      this.brand_xy = [0.06, 0.965];
      this.nbars = 8;
    } else {
      this.W = 1080;
      this.H = 1350;
      this.fs = { title: 52, subtitle: 29, brand: 22, caption: 33, kicker: 21, name: 27,
        value: 25, year: 120, counter: 28, source: 17, tick: 21, hook: 76,
        hook_small: 44, label: 25, marker: 19, card_big: 72, card_small: 27 };
      this.title_x = 0.065;
      this.title_y = 0.918;
      this.title_wrap = 28;
      this.chart = [0.235, 0.255, 0.635, 0.50];
      this.line_chart = [0.11, 0.255, 0.64, 0.50];
      this.caption = [0.065, 0.075, 0.87, 0.14];
      this.source_xy = [0.065, 0.062];
      this.year_xy = [0.85, 0.285];
      this.brand_xy = [0.065, 0.962];
      this.nbars = 9;
    }
    this.aspect = this.W / this.H;
  }
}

export const DPI = 100;
/** Points (matplotlib line widths, paddings) to pixels at the engine's 100 dpi. */
export const PT = DPI / 72;

/** Output formats offered in the studio. Layout(key) builds each. */
export const FORMATS = {
  landscape: { label: '16:9 video', W: 1920, H: 1080, use: 'YouTube', suffix: '' },
  vertical: { label: '9:16 Short', W: 1080, H: 1920, use: 'Shorts, Reels, TikTok', suffix: '_short' },
  square: { label: '1:1 square', W: 1080, H: 1080, use: 'Instagram, LinkedIn, X', suffix: '_square' },
  portrait: { label: '4:5 portrait', W: 1080, H: 1350, use: 'Instagram and Facebook feeds', suffix: '_4x5' },
};
