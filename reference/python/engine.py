"""
The Chart Runner - video engine
================================
Shared building blocks used by every video script in this folder.

A video is a list of *scenes* (hook, title card, bar-chart race, line race,
dot grid, stat cards, outro). Each scene draws one frame at a time with
matplotlib, and the frames are piped straight into ffmpeg (bundled with the
`imageio-ffmpeg` pip package, so nothing else needs installing).

Two output formats:
    landscape  1920 x 1080  (normal YouTube video)
    vertical   1080 x 1920  (YouTube Shorts - keep total length under 3 min)
"""
import math
import os
import subprocess
import textwrap

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402
import matplotlib.transforms as mtransforms  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "output")
FPS = 30
DPI = 100

# ----------------------------------------------------------------------------
# Fonts & theme
# ----------------------------------------------------------------------------
_font_dir = os.path.join(HERE, "fonts")
if os.path.isdir(_font_dir):
    for _f in os.listdir(_font_dir):
        if _f.lower().endswith(".ttf"):
            font_manager.fontManager.addfont(os.path.join(_font_dir, _f))
HEAD = "Poppins"
BODY = "Roboto"
plt.rcParams["font.family"] = BODY
plt.rcParams["text.parse_math"] = False   # "$" signs are money, not maths

T = dict(
    bg_top="#0A0F1F", bg_bot="#151D36", text="#F4F6FB", muted="#8D97AE",
    grid="#27314D", accent="#FFB703", panel="#1A2342", red="#FF4D5E",
    green="#2EC4B6", brand="THE CHART RUNNER",
)

COLORS = {
    "India": "#FF9933", "China": "#EF3B3B", "USA": "#3D8BFF", "Japan": "#FF5DA2",
    "Germany": "#FFD23F", "UK": "#9B6BFF", "France": "#39C6F4", "Italy": "#2DC76D",
    "Brazil": "#11D3A0", "Russia": "#B8C4D6", "Canada": "#FF7A7A", "Spain": "#F4A261",
    "Mexico": "#A77BFF", "South Korea": "#00B4D8", "Australia": "#F15BB5",
    "Netherlands": "#FF8C42", "Indonesia": "#E76F51", "Pakistan": "#3FB950",
    "Nigeria": "#9BE38B", "Bangladesh": "#2A9D8F", "Ethiopia": "#C3E86B",
    "DR Congo": "#5ED3F3", "Iran": "#C08497", "Saudi Arabia": "#52B788",
    "Turkey": "#E07A5F", "Poland": "#E5989B", "Belgium": "#E9C46A", "Ukraine": "#4EA8DE",
    "Sweden": "#90E0EF", "Switzerland": "#FF477E", "Egypt": "#DDB892", "Tanzania": "#43AA8B",
    "Vietnam": "#F94144", "Philippines": "#7B9ACC", "Thailand": "#F8961E",
    "Argentina": "#90BE6D", "South Africa": "#F9C74F", "Denmark": "#FF99C8",
    "Portugal": "#80B918", "Austria": "#CDB4DB", "Czechia": "#A2D2FF", "Kazakhstan": "#B5E48C",
    "Chile": "#F28482", "Taiwan": "#84A59D", "Venezuela": "#F07167", "Norway": "#6D9DC5",
    "Malaysia": "#FFAFCC", "UAE": "#06D6A0", "Hong Kong": "#EE9B00", "Greece": "#48CAE4",
    "Israel": "#B8B8FF", "Romania": "#FFC6FF", "Morocco": "#E76F51", "Kenya": "#95D5B2",
    "Myanmar": "#DDA15E", "Uganda": "#E9FF70", "Sudan": "#FFB4A2", "Iraq": "#B5838D",
    "Afghanistan": "#A3B18A", "Algeria": "#CCD5AE", "Colombia": "#F6BD60",
    "World average": "#8D97AE", "World": "#8D97AE",
}
_FALLBACK = ["#8ECAE6", "#FFB4A2", "#B5E48C", "#CDB4DB", "#FFD6A5", "#A0C4FF",
             "#FDFFB6", "#BDB2FF", "#9BF6FF", "#FFC6FF", "#CAFFBF", "#E4C1F9"]


def color_of(name):
    if name in COLORS:
        return COLORS[name]
    return _FALLBACK[sum(map(ord, name)) % len(_FALLBACK)]


def pt(px):
    """Convert pixels to matplotlib points at our DPI."""
    return px * 72.0 / DPI


# ----------------------------------------------------------------------------
# Easing & small helpers
# ----------------------------------------------------------------------------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return 3 * x * x - 2 * x * x * x


def fade(t, dur, fin=0.35, fout=0.35):
    """Alpha for something visible from 0..dur seconds."""
    if t < 0 or t > dur:
        return 0.0
    a = 1.0
    if fin > 0:
        a = min(a, ease_out(t / fin))
    if fout > 0:
        a = min(a, ease_out((dur - t) / fout))
    return a


def smooth(arr, win):
    """Centered moving average along axis 0 (edges padded)."""
    win = int(win)
    if win <= 1:
        return arr
    if win % 2 == 0:
        win += 1
    pad = win // 2
    a = np.asarray(arr, dtype=float)
    if a.ndim == 1:
        a = a[:, None]
        squeeze = True
    else:
        squeeze = False
    p = np.concatenate([np.repeat(a[:1], pad, 0), a, np.repeat(a[-1:], pad, 0)])
    c = np.cumsum(np.vstack([np.zeros((1, a.shape[1])), p]), axis=0)
    out = (c[win:] - c[:-win]) / win
    return out[:, 0] if squeeze else out


# ----------------------------------------------------------------------------
# Number formats
# ----------------------------------------------------------------------------
def _sig(v, d=3):
    if v == 0:
        return "0"
    digits = max(0, d - 1 - int(math.floor(math.log10(abs(v)))))
    return f"{v:,.{digits}f}"


def fmt_money(v):
    v = float(v)
    for div, suf in [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]:
        if abs(v) >= div:
            return f"${_sig(v / div)}{suf}"
    return f"${v:,.0f}"


def fmt_count(v):
    v = float(v)
    for div, suf in [(1e9, " B"), (1e6, " M"), (1e3, " K")]:
        if abs(v) >= div:
            return f"{_sig(v / div)}{suf}"
    return f"{v:,.0f}"


def fmt_dollars_full(v):
    v = float(v)
    if v >= 1e6:
        return f"${v / 1e6:,.1f} million"
    return f"${v:,.0f}"


def tick_fmt_money(v):
    if v == 0:
        return "0"
    for div, suf in [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]:
        if abs(v) >= div:
            s = f"{v / div:.1f}".rstrip("0").rstrip(".")
            return f"${s}{suf}"
    return f"${v:,.0f}"


def tick_fmt_count(v):
    if v == 0:
        return "0"
    for div, suf in [(1e9, "B"), (1e6, "M"), (1e3, "K")]:
        if abs(v) >= div:
            s = f"{v / div:.1f}".rstrip("0").rstrip(".")
            return f"{s}{suf}"
    return f"{v:,.0f}"


# ----------------------------------------------------------------------------
# Layout (all positions in figure fractions, font sizes in px)
# ----------------------------------------------------------------------------
class Layout:
    def __init__(self, fmt):
        self.fmt = fmt
        self.landscape = fmt == "landscape"
        if self.landscape:
            self.W, self.H = 1920, 1080
            self.fs = dict(title=50, subtitle=27, brand=19, caption=34, kicker=21, name=26,
                           value=24, year=150, counter=30, source=17, tick=20, hook=76,
                           hook_small=44, label=24, marker=19, card_big=78, card_small=26)
            self.title_x, self.title_y = 0.045, 0.925
            self.title_wrap = 60
            self.chart = [0.165, 0.215, 0.75, 0.58]
            self.line_chart = [0.075, 0.215, 0.74, 0.58]
            self.caption = (0.045, 0.035, 0.91, 0.125)
            self.source_xy = (0.955, 0.012)
            self.year_xy = (0.905, 0.235)
            self.brand_xy = (0.955, 0.94)
            self.nbars = 10
        else:
            self.W, self.H = 1080, 1920
            self.fs = dict(title=56, subtitle=31, brand=24, caption=38, kicker=24, name=31,
                           value=28, year=135, counter=32, source=19, tick=24, hook=84,
                           hook_small=48, label=28, marker=22, card_big=84, card_small=30)
            self.title_x, self.title_y = 0.065, 0.905
            self.title_wrap = 26
            self.chart = [0.255, 0.335, 0.60, 0.45]
            self.line_chart = [0.12, 0.335, 0.64, 0.45]
            self.caption = (0.065, 0.15, 0.80, 0.155)
            self.source_xy = (0.065, 0.127)
            self.year_xy = (0.845, 0.36)
            self.brand_xy = (0.065, 0.955)
            self.nbars = 10
        self.aspect = self.W / self.H


# ----------------------------------------------------------------------------
# Common drawing helpers
# ----------------------------------------------------------------------------
_GRAD_CACHE = {}


def draw_background(fig, L):
    """Dark gradient with a soft glow. Pre-rendered once at full size, then blitted (fast)."""
    key = (L.W, L.H)
    if key not in _GRAD_CACHE:
        h, w = L.H, L.W
        top = np.array(matplotlib.colors.to_rgb(T["bg_top"]))
        bot = np.array(matplotlib.colors.to_rgb(T["bg_bot"]))
        yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
        img = top * (1 - yy) + bot * yy
        gx, gy = np.meshgrid(np.linspace(0, 1, w, dtype=np.float32), np.linspace(0, 1, h, dtype=np.float32))
        glow = np.exp(-(((gx - 0.2) ** 2) / 0.12 + ((gy - 0.15) ** 2) / 0.08))[:, :, None]
        img = np.clip(img + glow * np.array([0.03, 0.04, 0.08]), 0, 1)
        _GRAD_CACHE[key] = (img * 255).astype(np.uint8)
    fig.figimage(_GRAD_CACHE[key], xo=0, yo=0, origin="upper", zorder=-10, resize=False)


def draw_brand(fig, L, alpha=1.0):
    x, y = L.brand_xy
    ha = "right" if L.landscape else "left"
    fig.text(x, y, T["brand"], ha=ha, va="center", fontsize=pt(L.fs["brand"]),
             color=T["accent"], family=HEAD, weight="bold", alpha=0.85 * alpha, zorder=30)


def draw_header(fig, L, title, subtitle=None, alpha=1.0):
    lines = textwrap.wrap(title, L.title_wrap)
    fs = L.fs["title"]
    y = L.title_y
    for ln in lines:
        fig.text(L.title_x, y, ln, ha="left", va="top", fontsize=pt(fs), color=T["text"],
                 family=HEAD, weight="bold", alpha=alpha, zorder=30)
        y -= fs * 1.18 / L.H
    if subtitle:
        for ln in textwrap.wrap(subtitle, int(L.title_wrap * (1.75 if L.landscape else 2.3))):
            fig.text(L.title_x, y - 0.004, ln, ha="left", va="top", fontsize=pt(L.fs["subtitle"]),
                     color=T["muted"], alpha=alpha, zorder=30)
            y -= L.fs["subtitle"] * 1.25 / L.H


def draw_source(fig, L, text, alpha=1.0):
    if not text:
        return
    x, y = L.source_xy
    ha = "right" if L.landscape else "left"
    if not L.landscape:
        text = "\n".join(textwrap.wrap(text, 70))
    fig.text(x, y, text, ha=ha, va="bottom" if L.landscape else "top", fontsize=pt(L.fs["source"]),
             color=T["muted"], alpha=0.8 * alpha, zorder=30, linespacing=1.3)


def rounded_box(fig, L, x, y, w, h, color, alpha, r=0.012, z=20, ec="none", lw=0):
    box = FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}",
                         transform=fig.transFigure, facecolor=color, edgecolor=ec, linewidth=lw,
                         alpha=alpha, zorder=z, mutation_aspect=L.aspect)
    fig.add_artist(box)
    return box


def draw_caption(fig, L, kicker, text, alpha, t_in):
    if alpha <= 0.01:
        return
    x, y, w, h = L.caption
    dy = (1 - ease_out(t_in / 0.45)) * 0.012
    y = y - dy
    rounded_box(fig, L, x, y, w, h, T["panel"], 0.93 * alpha, z=20)
    fig.add_artist(Rectangle((x + 0.012 * (1 if L.landscape else 1.4), y + h * 0.2), 5 / L.W * 1.2, h * 0.6,
                             transform=fig.transFigure, color=T["accent"], alpha=alpha, zorder=21))
    fs = L.fs["caption"]
    char_px = fs * 0.50
    width_chars = max(20, int((w * L.W - 70) / char_px))
    lines = textwrap.wrap(text, width_chars)
    tx = x + 0.028 * (1 if L.landscape else 1.4)
    kfs = L.fs["kicker"] if kicker else 0
    block = kfs * 1.5 + len(lines) * fs * 1.22
    top = y + h / 2 + (block / 2) / L.H
    if kicker:
        fig.text(tx, top, kicker.upper(), ha="left", va="top", fontsize=pt(kfs), color=T["accent"],
                 family=HEAD, weight="bold", alpha=alpha, zorder=22)
        top -= kfs * 1.5 / L.H
    fig.text(tx, top, "\n".join(lines), ha="left", va="top", fontsize=pt(fs), color=T["text"],
             alpha=alpha, zorder=22, linespacing=1.22, weight="medium")


class Captions:
    """Timed lower-third captions.

    Each caption is a dict: year (data-time trigger) or at (seconds), dur, kicker, text.
    """

    def __init__(self, items):
        self.items = [dict(c) for c in items]

    def schedule(self, years_per_frame, fps):
        n = len(years_per_frame)
        sched = []
        for c in self.items:
            if "at" in c:
                start = c["at"]
            else:
                idx = np.nonzero(years_per_frame >= c["year"] - 1e-6)[0]
                start = (idx[0] if len(idx) else n - 1) / fps
            sched.append([start, start + c.get("dur", 5.0), c.get("kicker", ""), c["text"], c])
        sched.sort(key=lambda s: s[0])
        for a, b in zip(sched, sched[1:]):
            if a[1] > b[0] - 0.1:
                a[1] = b[0] - 0.1
        self.sched = sched
        return sched

    def draw(self, fig, L, t):
        for start, end, kicker, text, _ in self.sched:
            if start <= t <= end:
                draw_caption(fig, L, kicker, text, fade(t - start, end - start, 0.35, 0.3), t - start)


class Pace:
    """Maps video time -> data time (e.g. year) for a chart scene.

    Pace(1960).to(1975, 8).hold(2).to(1991, 10)   # reach 1975 after 8 s, pause 2 s, ...
    """

    def __init__(self, start, lead=0.8):
        self.keys = [(0.0, float(start))]
        if lead:
            self.keys.append((lead, float(start)))

    def to(self, year, seconds):
        t, _ = self.keys[-1]
        self.keys.append((t + seconds, float(year)))
        return self

    def hold(self, seconds):
        t, y = self.keys[-1]
        self.keys.append((t + seconds, y))
        return self

    @property
    def duration(self):
        return self.keys[-1][0]

    def frames(self, fps, smooth_s=0.6):
        n = int(round(self.duration * fps))
        ts = np.arange(n) / fps
        kt = np.array([k[0] for k in self.keys])
        ky = np.array([k[1] for k in self.keys])
        ys = np.interp(ts, kt, ky)
        return smooth(ys, smooth_s * fps)


# ----------------------------------------------------------------------------
# Scenes
# ----------------------------------------------------------------------------
class Scene:
    duration = 3.0
    chapter = None
    show_brand = True

    def prepare(self, L, fps):
        pass

    def nframes(self, fps):
        return int(round(self.duration * fps))

    def draw(self, fig, L, i, t):
        raise NotImplementedError


class HookScene(Scene):
    """Opening hook: 2-4 punchy lines revealed one by one."""
    show_brand = False

    def __init__(self, lines, duration=5.5, stagger=0.9, chapter="Intro"):
        # lines: list of (text, color or None, "big"/"small")
        self.lines = lines
        self.duration = duration
        self.stagger = stagger
        self.chapter = chapter

    def prepare(self, L, fps):
        rng = np.random.default_rng(7)
        self.walks = []
        for k in range(7):
            steps = rng.normal(0.004, 0.02, 400).cumsum()
            self.walks.append((0.08 + 0.12 * k, steps, color_of(list(COLORS)[k * 3])))

    def draw(self, fig, L, i, t):
        ax = fig.add_axes([0, 0, 1, 1], zorder=-5)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        prog = clamp(t / self.duration)
        for y0, steps, col in self.walks:
            n = max(2, int(len(steps) * (0.25 + 0.75 * prog)))
            xs = np.linspace(0, 1, len(steps))[:n]
            ax.plot(xs, y0 + steps[:n] * 0.6, color=col, alpha=0.10, lw=3)
        sizes = {"big": L.fs["hook"], "small": L.fs["hook_small"]}
        wrap_big = 26 if L.landscape else 16
        wrap_small = 48 if L.landscape else 28
        blocks = []
        for k, (text, col, size) in enumerate(self.lines):
            fs = sizes[size]
            lines = textwrap.wrap(text, wrap_big if size == "big" else wrap_small)
            blocks.append((k, lines, col or T["text"], fs, size))
        total = sum(len(b[1]) * b[3] * 1.2 + b[3] * 0.35 for b in blocks)
        y = 0.5 + (total / 2) / L.H
        for k, lines, col, fs, size in blocks:
            a = fade(t - k * self.stagger, self.duration - k * self.stagger + 1, 0.45, 0.0)
            rise = (1 - ease_out((t - k * self.stagger) / 0.5)) * 0.02
            for ln in lines:
                fig.text(0.5, y - rise, ln, ha="center", va="top", fontsize=pt(fs), color=col,
                         family=HEAD, weight="bold" if size == "big" else "medium", alpha=a, zorder=30)
                y -= fs * 1.2 / L.H
            y -= fs * 0.35 / L.H


class TitleScene(Scene):
    def __init__(self, title, subtitle="", span="", duration=3.2, chapter=None):
        self.title, self.subtitle, self.span = title, subtitle, span
        self.duration = duration
        self.chapter = chapter
        self.show_brand = False

    def draw(self, fig, L, i, t):
        a = fade(t, self.duration, 0.4, 0.4)
        big = L.fs["hook"] * (0.95 if L.landscape else 0.85)
        wrap = 24 if L.landscape else 16
        lines = textwrap.wrap(self.title, wrap)
        y = 0.56 + len(lines) * big * 0.6 / L.H
        fig.text(0.5, y + 0.07, T["brand"], ha="center", va="bottom", fontsize=pt(L.fs["brand"] * 1.4),
                 color=T["accent"], family=HEAD, weight="bold", alpha=a)
        w = 0.12 * ease_out(t / 0.8)
        fig.add_artist(Rectangle((0.5 - w / 2, y + 0.055), w, 0.004 * (1 if L.landscape else 0.56),
                                 transform=fig.transFigure, color=T["accent"], alpha=a))
        for ln in lines:
            fig.text(0.5, y, ln, ha="center", va="top", fontsize=pt(big), color=T["text"],
                     family=HEAD, weight="bold", alpha=a)
            y -= big * 1.18 / L.H
        if self.subtitle:
            for ln in textwrap.wrap(self.subtitle, 50 if L.landscape else 30):
                fig.text(0.5, y - 0.01, ln, ha="center", va="top", fontsize=pt(L.fs["subtitle"] * 1.2),
                         color=T["muted"], alpha=a)
                y -= L.fs["subtitle"] * 1.5 / L.H
        if self.span:
            fs = L.fs["subtitle"] * 1.1
            wbox = (len(self.span) * fs * 0.62 + 60) / L.W
            hbox = fs * 2.0 / L.H
            rounded_box(fig, L, 0.5 - wbox / 2, y - 0.03 - hbox, wbox, hbox, T["panel"], a, r=0.01)
            fig.text(0.5, y - 0.03 - hbox / 2, self.span, ha="center", va="center", fontsize=pt(fs),
                     color=T["accent"], family=HEAD, weight="bold", alpha=a, zorder=25)


class BarRaceScene(Scene):
    """Classic animated bar-chart race.

    df        : DataFrame, index = year (int), columns = entity names, values = numbers
    pace      : Pace object (video time -> year)
    highlight : entity drawn with a glow and its rank shown (e.g. "India")
    pin       : entity always shown (below the top N with its rank) when it drops out
    """

    def __init__(self, df, pace, title, subtitle="", source="", value_fmt=fmt_money,
                 tick_fmt=tick_fmt_money, highlight=None, pin=None, captions=(), n_bars=None,
                 counter=None, year_label=None, chapter=None, notes=None, colors=None, min_frac=0.003):
        self.min_frac = min_frac        # bars smaller than this share of the axis are hidden
        self.df = df.sort_index()
        self.pace = pace
        self.title, self.subtitle, self.source = title, subtitle, source
        self.value_fmt, self.tick_fmt = value_fmt, tick_fmt
        self.highlight, self.pin = highlight, pin
        self.captions = Captions(captions)
        self.n_bars = n_bars
        self.counter = counter          # function(year) -> str, drawn under the year
        self.year_label = year_label    # function(year) -> str
        self.chapter = chapter
        self.notes = notes              # function(year) -> str or None, small note above chart
        self.colors = colors or {}
        self.duration = pace.duration

    def prepare(self, L, fps):
        N = self.n_bars or L.nbars
        self.N = N
        ys = self.pace.frames(fps)
        self.ys = ys
        idx = self.df.index.values.astype(float)
        vals = self.df.fillna(0).values
        # keep only entities that ever reach the top N+2 (plus the pinned one)
        yr_rank = (-vals).argsort(axis=1).argsort(axis=1)
        keep = (yr_rank < N + 2).any(axis=0)
        cols = [c for c, k in zip(self.df.columns, keep) if k or c in (self.pin, self.highlight)]
        self.cols = cols
        V = np.column_stack([np.interp(ys, idx, self.df[c].fillna(0).values) for c in cols])
        self.V = V
        order = (-V).argsort(axis=1)
        ranks = np.empty_like(order)
        rows = np.arange(V.shape[0])[:, None]
        ranks[rows, order] = np.arange(V.shape[1])[None, :]
        self.true_rank = ranks.copy()
        # rank among *all* entities for the pinned one
        if self.pin:
            allv = np.column_stack([np.interp(ys, idx, self.df[c].fillna(0).values) for c in self.df.columns])
            pv = np.interp(ys, idx, self.df[self.pin].fillna(0).values)
            self.pin_rank = (allv > pv[:, None]).sum(axis=1) + 1
        self.pos = smooth(ranks.astype(float), 0.4 * fps)
        vis_max = np.sort(V, axis=1)[:, -1]
        head = 1.14 if L.landscape else 1.3
        self.xmax = np.maximum(smooth(vis_max * head, 0.5 * fps), vis_max * (head - 0.08))
        self.captions.schedule(ys, fps)
        self.fps = fps

    def draw(self, fig, L, i, t):
        N = self.N
        year = self.ys[i]
        a0 = fade(t, self.duration, 0.4, 0.0)
        draw_header(fig, L, self.title, self.subtitle, alpha=a0)
        ax = fig.add_axes(L.chart, zorder=5)
        ax.set_facecolor("none")
        for s in ax.spines.values():
            s.set_visible(False)
        xmax = self.xmax[i]
        bottom = N - 0.35 + (1.25 if self.pin else 0)
        ax.set_xlim(0, xmax)
        ax.set_ylim(bottom, -0.65)
        ax.xaxis.set_ticks_position("top")
        ax.xaxis.set_major_locator(MaxNLocator(nbins=4 if not L.landscape else 5, steps=[1, 2, 2.5, 5, 10]))
        ax.tick_params(axis="x", colors=T["muted"], labelsize=pt(L.fs["tick"]), length=0, pad=6)
        ax.set_xticks([tk for tk in ax.get_xticks() if 0 <= tk <= xmax])
        ax.set_xticklabels([self.tick_fmt(tk) for tk in ax.get_xticks()])
        ax.set_yticks([])
        ax.grid(axis="x", color=T["grid"], lw=1.3)
        ax.set_axisbelow(True)
        trans = mtransforms.blended_transform_factory(ax.transAxes, ax.transData)
        bar_h = 0.78
        for j, name in enumerate(self.cols):
            p = self.pos[i, j]
            v = self.V[i, j]
            if name == self.pin:
                continue
            if v <= xmax * self.min_frac or p > N - 0.4:
                continue
            alpha = clamp(N - 0.4 - p) * a0
            col = self.colors.get(name, color_of(name))
            hl = name == self.highlight
            if hl:
                ax.barh(p, v, height=bar_h + 0.16, color=col, alpha=0.25 * alpha, lw=0)
            ax.barh(p, v, height=bar_h, color=col, alpha=0.95 * alpha, lw=0)
            ax.text(-0.012, p, name, transform=trans, ha="right", va="center",
                    fontsize=pt(L.fs["name"]), color=col if hl else T["text"], alpha=alpha ** 2,
                    weight="bold" if hl else "medium", family=HEAD if hl else BODY)
            label = self.value_fmt(v)
            if hl:
                label += f"   #{self.true_rank[i, j] + 1}"
            ax.text(v + xmax * 0.008, p, label, ha="left", va="center", fontsize=pt(L.fs["value"]),
                    color=col if hl else T["text"], alpha=alpha ** 2 * (1 if hl else 0.85),
                    weight="bold" if hl else "regular")
        if self.pin:
            # the pinned entity is always on screen: inside the top N it behaves like any bar,
            # below it, it slides into a reserved slot under a dashed line and shows its rank
            j = self.cols.index(self.pin)
            p = self.pos[i, j]
            v = self.V[i, j]
            out = clamp(p - (N - 1))
            py = p if p <= N - 1 else (N - 1) + out * 1.45
            col = self.colors.get(self.pin, color_of(self.pin))
            if out > 0.01:
                ax.axhline(N - 0.1, color=T["grid"], lw=1.5, ls=(0, (4, 4)), alpha=out * a0)
            if v > 0:
                ax.barh(py, v, height=bar_h + 0.16, color=col, alpha=0.25 * a0, lw=0)
                ax.barh(py, v, height=bar_h, color=col, alpha=0.95 * a0, lw=0)
                ax.text(-0.012, py, self.pin, transform=trans, ha="right", va="center",
                        fontsize=pt(L.fs["name"]), color=col, weight="bold", family=HEAD, alpha=a0)
                ax.text(v + xmax * 0.008, py, f"{self.value_fmt(v)}   #{self.pin_rank[i]}", ha="left",
                        va="center", fontsize=pt(L.fs["value"]), color=col, weight="bold", alpha=a0)
        # year counter
        ylab = self.year_label(year) if self.year_label else f"{int(round(year - 0.4999))}"
        x, y = L.year_xy
        fig.text(x, y, ylab, ha="right", va="bottom", fontsize=pt(L.fs["year"]), color=T["text"],
                 alpha=0.22 * a0, family=HEAD, weight="bold", zorder=4)
        if self.counter:
            fig.text(x, y - 0.004, self.counter(year), ha="right", va="top", fontsize=pt(L.fs["counter"]),
                     color=T["muted"], alpha=a0, zorder=4)
        if self.notes:
            n = self.notes(year)
            if n:
                fig.text(L.chart[0] + L.chart[2], L.chart[1] + L.chart[3] + 0.045, n, ha="right", va="bottom",
                         fontsize=pt(L.fs["marker"]), color=T["accent"], alpha=a0, style="italic")
        draw_source(fig, L, self.source, a0)
        self.captions.draw(fig, L, t)


def place_labels(targets, gap, lo=-0.02, hi=1.02):
    """Spread sorted label positions so none overlap, keeping each cluster centred on its dots."""
    groups = [[t, [i]] for i, t in enumerate(targets)]
    merged = True
    while merged:
        merged = False
        for k in range(len(groups) - 1):
            a, b = groups[k], groups[k + 1]
            a_top = a[0] + (len(a[1]) - 1) * gap / 2
            b_bot = b[0] - (len(b[1]) - 1) * gap / 2
            if b_bot - a_top < gap:
                mem = a[1] + b[1]
                groups[k] = [sum(targets[m] for m in mem) / len(mem), mem]
                del groups[k + 1]
                merged = True
                break
    pos = [0.0] * len(targets)
    for c, mem in groups:
        start = c - (len(mem) - 1) * gap / 2
        start = min(max(start, lo), hi - (len(mem) - 1) * gap)
        for j, m in enumerate(mem):
            pos[m] = start + j * gap
    return pos


class LineRaceScene(Scene):
    """Lines that draw themselves over time, with labels riding the line heads.

    df      : DataFrame, index = x (year, may be fractional), columns = series
    markers : list of (x, label) vertical event lines that appear as time passes them
    """

    def __init__(self, df, pace, series, title, subtitle="", source="", value_fmt=None,
                 y_range=None, log=False, x_range=None, highlight=None, markers=(), captions=(),
                 chapter=None, y_tick_fmt=None, display=None, colors=None, lw=3.0,
                 label_fmt=None, x_mode="fixed", min_span=20):
        self.df = df.sort_index()
        self.pace = pace
        self.series = series
        self.title, self.subtitle, self.source = title, subtitle, source
        self.value_fmt = value_fmt or (lambda v: f"{v:.1f}")
        self.y_range, self.log, self.x_range = y_range, log, x_range
        self.highlight = highlight
        self.markers = markers
        self.captions = Captions(captions)
        self.chapter = chapter
        self.y_tick_fmt = y_tick_fmt
        self.display = display or {}
        self.colors = colors or {}
        self.lw = lw
        self.label_fmt = label_fmt
        self.x_mode = x_mode
        self.min_span = min_span
        self.duration = pace.duration

    def prepare(self, L, fps):
        self.ys = self.pace.frames(fps)
        self.captions.schedule(self.ys, fps)
        x = self.df.index.values.astype(float)
        self.x = x
        self.vals = {s: self.df[s].values.astype(float) for s in self.series}
        if self.y_range is None:
            vis = []
            for yr in self.ys:
                m = x <= yr
                vis.append(np.nanmax([np.nanmax(self.vals[s][m]) if m.any() else np.nan for s in self.series]))
            vis = np.array(vis)
            vis = pd.Series(vis).ffill().bfill().values
            self.ymax = np.maximum.accumulate(smooth(vis * (1.35 if self.log else 1.12), 0.6 * fps))
        else:
            self.ymax = None

    def _xlim(self, yr):
        if self.x_mode == "fixed":
            x0, x1 = self.x_range or (self.x[0], self.x[-1])
        else:
            x0 = (self.x_range or (self.x[0], None))[0]
            x1 = max(yr, x0 + self.min_span)
        return x0, x1

    def draw(self, fig, L, i, t):
        yr = self.ys[i]
        a0 = fade(t, self.duration, 0.4, 0.0)
        draw_header(fig, L, self.title, self.subtitle, alpha=a0)
        ax = fig.add_axes(L.line_chart, zorder=5)
        ax.set_facecolor("none")
        for s in ax.spines.values():
            s.set_visible(False)
        x0, x1 = self._xlim(yr)
        pad = (x1 - x0) * (0.2 if L.landscape else 0.3)
        ax.set_xlim(x0, x1 + pad)
        if self.log:
            ax.set_yscale("log")
        if self.y_range:
            ax.set_ylim(*self.y_range)
        else:
            lo = self.df[self.series].min().min()
            ax.set_ylim(lo * 0.7 if self.log else 0, self.ymax[i])
        ax.tick_params(colors=T["muted"], labelsize=pt(L.fs["tick"]), length=0, pad=6)
        ax.xaxis.set_major_locator(MaxNLocator(nbins=6 if L.landscape else 4, integer=True))
        ax.set_xticks([tk for tk in ax.get_xticks() if x0 <= tk <= x1])
        if not self.log:
            ax.yaxis.set_major_locator(MaxNLocator(nbins=5, steps=[1, 2, 2.5, 5, 10]))
        if self.y_tick_fmt:
            ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: self.y_tick_fmt(v)))
        ax.yaxis.set_minor_formatter(matplotlib.ticker.NullFormatter())
        ax.grid(axis="y", which="major", color=T["grid"], lw=1.2)
        ax.set_axisbelow(True)
        # event markers
        ylo, yhi = ax.get_ylim()
        for k, (mx, mlabel) in enumerate(self.markers):
            if yr >= mx:
                ma = clamp((yr - mx) / 2.0 + 0.3) * a0
                ax.axvline(mx, color=T["muted"], lw=1.2, ls=(0, (3, 4)), alpha=0.7 * ma)
                ax.text(mx, 0.985 - 0.06 * (k % 2), " " + mlabel, transform=ax.get_xaxis_transform(),
                        ha="left", va="top", fontsize=pt(L.fs["marker"]), color=T["muted"], alpha=ma)
        # lines
        heads = []
        for s in self.series:
            v = self.vals[s]
            m = self.x <= yr
            if not m.any():
                continue
            xs = np.append(self.x[m], yr)
            yv = np.interp(yr, self.x, v)
            ys = np.append(v[m], yv)
            ok = ~np.isnan(ys)
            col = self.colors.get(s, color_of(self.display.get(s, s)))
            hl = s == self.highlight
            lw = self.lw * (1.6 if hl else 1.0)
            if hl:
                ax.plot(xs[ok], ys[ok], color=col, lw=lw * 3, alpha=0.18 * a0, solid_capstyle="round")
            ax.plot(xs[ok], ys[ok], color=col, lw=lw, alpha=a0, solid_capstyle="round")
            if np.isnan(yv):
                continue
            ax.scatter([yr], [yv], s=(L.fs["label"] * (1.4 if hl else 1.0)) ** 2 * 0.35, color=col, zorder=6,
                       edgecolor=T["bg_top"], linewidth=2, alpha=a0)
            heads.append([yv, s, col, hl])
        # label de-overlap in axes-fraction space
        def frac(v):
            if self.log:
                return (math.log10(v) - math.log10(ylo)) / (math.log10(yhi) - math.log10(ylo))
            return (v - ylo) / (yhi - ylo)
        gap = L.fs["label"] * 1.25 / (L.line_chart[3] * L.H)
        heads.sort(key=lambda h: frac(h[0]))
        targets = [frac(h[0]) for h in heads]
        fr = place_labels(targets, gap)
        hx = (yr - ax.get_xlim()[0]) / (ax.get_xlim()[1] - ax.get_xlim()[0])
        off = 26.0 / (L.line_chart[2] * L.W)
        for (yv, s, col, hl), f, t0 in zip(heads, fr, targets):
            name = self.display.get(s, s)
            txt = self.label_fmt(name, yv) if self.label_fmt else f"{name}  {self.value_fmt(yv)}"
            if abs(f - t0) > gap * 0.3:     # label moved away from its dot: draw a thin leader line
                ax.plot([hx + off * 0.35, hx + off * 0.85], [t0, f], transform=ax.transAxes, color=col,
                        lw=1.4, alpha=0.8 * a0, clip_on=False, solid_capstyle="round")
            ax.text(hx + off, f, txt, transform=ax.transAxes, ha="left", va="center",
                    fontsize=pt(L.fs["label"] * (1.1 if hl else 1.0)), color=col, alpha=a0,
                    weight="bold" if hl else "medium", family=HEAD if hl else BODY, clip_on=False)
        # year
        x, y = L.year_xy
        fig.text(x, y, f"{int(round(yr - 0.4999))}", ha="right", va="bottom", fontsize=pt(L.fs["year"]),
                 color=T["text"], alpha=0.16 * a0, family=HEAD, weight="bold", zorder=4)
        draw_source(fig, L, self.source, a0)
        self.captions.draw(fig, L, t)


class DotGridScene(Scene):
    """100 dots = 100 children (or people). Red dots show the share affected.

    series : pandas Series indexed by year with a value per 100 (0..100)
    """

    def __init__(self, series, pace, title, subtitle, big_fmt, small_text, source="", captions=(),
                 chapter=None, bad_color=None, good_color=None):
        self.s = series.sort_index()
        self.pace = pace
        self.title, self.subtitle, self.source = title, subtitle, source
        self.big_fmt, self.small_text = big_fmt, small_text
        self.captions = Captions(captions)
        self.chapter = chapter
        self.bad = bad_color or T["red"]
        self.good = good_color or T["green"]
        self.duration = pace.duration

    def prepare(self, L, fps):
        self.ys = self.pace.frames(fps)
        self.captions.schedule(self.ys, fps)
        self.v = np.interp(self.ys, self.s.index.values.astype(float), self.s.values)

    def draw(self, fig, L, i, t):
        a0 = fade(t, self.duration, 0.4, 0.0)
        draw_header(fig, L, self.title, self.subtitle, alpha=a0)
        v = self.v[i]
        n_bad = int(round(v))
        if L.landscape:
            size = 560
            rect = [0.07, 0.235, size / L.W, size / L.H]
            tx, ty = 0.47, 0.64
            big_fs = 150
        else:
            size = 700
            rect = [(1 - size / L.W) / 2, 0.345, size / L.W, size / L.H]
            tx, ty = 0.065, 0.805
            big_fs = 120
        ax = fig.add_axes(rect, zorder=5)
        ax.set_xlim(-0.6, 9.6)
        ax.set_ylim(9.6, -0.6)
        ax.axis("off")
        xs, ys, cs, al = [], [], [], []
        for k in range(100):
            r, c = divmod(k, 10)
            xs.append(c)
            ys.append(r)
            bad = k < n_bad
            cs.append(self.bad if bad else self.good)
            al.append(1.0 if bad else 0.55)
        dot = (size / 10 * 0.62) ** 2
        cols = [matplotlib.colors.to_rgba(c, a * a0) for c, a in zip(cs, al)]
        ax.scatter(xs, ys, s=dot, c=cols, linewidths=0)
        big = self.big_fmt(v)
        fig.text(tx, ty, big, ha="left", va="center", fontsize=pt(big_fs), color=self.bad,
                 family=HEAD, weight="bold", alpha=a0, zorder=10)
        wrap = 30 if L.landscape else 34
        fig.text(tx, ty - big_fs * 0.62 / L.H, "\n".join(textwrap.wrap(self.small_text, wrap)), ha="left",
                 va="top", fontsize=pt(L.fs["caption"]), color=T["text"], alpha=a0, zorder=10, linespacing=1.25)
        yr = f"{int(round(self.ys[i] - 0.4999))}"
        if L.landscape:
            fig.text(0.905, 0.235, yr, ha="right", va="bottom", fontsize=pt(L.fs["year"]), color=T["text"],
                     alpha=0.22 * a0, family=HEAD, weight="bold")
        else:
            fig.text(0.935, ty, yr, ha="right", va="center", fontsize=pt(90), color=T["text"],
                     alpha=0.25 * a0, family=HEAD, weight="bold")
        draw_source(fig, L, self.source, a0)
        self.captions.draw(fig, L, t)


class GrowBarsScene(Scene):
    """Static ranking whose bars grow in one after another (good for 'total' comparisons)."""

    def __init__(self, items, title, subtitle="", source="", value_fmt=fmt_count, duration=9.0,
                 highlight=None, captions=(), chapter=None, stagger=0.25):
        # items: list of (name, value) already sorted
        self.items = items
        self.title, self.subtitle, self.source = title, subtitle, source
        self.value_fmt = value_fmt
        self.duration = duration
        self.highlight = highlight
        self.captions = Captions(captions)
        self.chapter = chapter
        self.stagger = stagger

    def prepare(self, L, fps):
        n = int(round(self.duration * fps))
        self.captions.schedule(np.zeros(n), fps)

    def draw(self, fig, L, i, t):
        a0 = fade(t, self.duration, 0.4, 0.0)
        draw_header(fig, L, self.title, self.subtitle, alpha=a0)
        ax = fig.add_axes(L.chart, zorder=5)
        ax.set_facecolor("none")
        for s in ax.spines.values():
            s.set_visible(False)
        n = len(self.items)
        vmax = max(v for _, v in self.items)
        ax.set_xlim(0, vmax * 1.2)
        ax.set_ylim(n - 0.4, -0.6)
        ax.set_xticks([])
        ax.set_yticks([])
        trans = mtransforms.blended_transform_factory(ax.transAxes, ax.transData)
        for k, (name, v) in enumerate(self.items):
            g = ease_out((t - 0.3 - k * self.stagger) / 0.9)
            if g <= 0:
                continue
            col = color_of(name)
            hl = name == self.highlight
            if hl:
                ax.barh(k, v * g, height=0.94, color=col, alpha=0.25 * a0, lw=0)
            ax.barh(k, v * g, height=0.78, color=col, alpha=0.95 * a0, lw=0)
            ax.text(-0.012, k, name, transform=trans, ha="right", va="center", fontsize=pt(L.fs["name"]),
                    color=col if hl else T["text"], alpha=a0 * clamp(g * 2), weight="bold" if hl else "medium",
                    family=HEAD if hl else BODY)
            ax.text(v * g + vmax * 0.012, k, self.value_fmt(v * g), ha="left", va="center",
                    fontsize=pt(L.fs["value"]), color=col if hl else T["text"], alpha=a0 * clamp(g * 2),
                    weight="bold" if hl else "regular")
        draw_source(fig, L, self.source, a0)
        self.captions.draw(fig, L, t)


class StatCardsScene(Scene):
    """Recap: a heading plus 2-4 big-number cards that pop in one by one."""

    def __init__(self, heading, cards, duration=8.0, chapter="Recap", footer=None):
        # cards: list of (big, small, color)
        self.heading, self.cards = heading, cards
        self.duration = duration
        self.chapter = chapter
        self.footer = footer

    def draw(self, fig, L, i, t):
        a0 = fade(t, self.duration, 0.4, 0.4)
        n = len(self.cards)
        hy = 0.80 if L.landscape else 0.86
        for k, ln in enumerate(textwrap.wrap(self.heading, 40 if L.landscape else 22)):
            fig.text(0.5, hy - k * L.fs["title"] * 1.2 / L.H, ln, ha="center", va="top",
                     fontsize=pt(L.fs["title"]), color=T["text"], family=HEAD, weight="bold", alpha=a0)
        if L.landscape:
            gap = 0.025
            cw = (0.9 - gap * (n - 1)) / n
            ch = 0.40
            boxes = [(0.05 + k * (cw + gap), 0.25, cw, ch) for k in range(n)]
        else:
            gap = 0.018
            ch = (0.56 - gap * (n - 1)) / n
            boxes = [(0.08, 0.72 - (k + 1) * ch - k * gap, 0.84, ch) for k in range(n)]
        for k, ((big, small, col), (x, y, w, h)) in enumerate(zip(self.cards, boxes)):
            g = ease_out((t - 0.4 - k * 0.45) / 0.5)
            if g <= 0:
                continue
            a = a0 * g
            dy = (1 - g) * 0.02
            rounded_box(fig, L, x, y - dy, w, h, T["panel"], 0.95 * a, r=0.015)
            fig.add_artist(Rectangle((x, y - dy + h - 0.008 * (1 if L.landscape else 0.56)), w,
                                     0.008 * (1 if L.landscape else 0.56), transform=fig.transFigure,
                                     color=col, alpha=a, zorder=21))
            bfs = L.fs["card_big"] * (1.0 if len(big) <= 7 else 0.75)
            fig.text(x + w / 2, y - dy + h * 0.62, big, ha="center", va="center", fontsize=pt(bfs),
                     color=col, family=HEAD, weight="bold", alpha=a, zorder=22)
            wrap = int(w * L.W / (L.fs["card_small"] * 0.52))
            fig.text(x + w / 2, y - dy + h * 0.30, "\n".join(textwrap.wrap(small, max(12, wrap))),
                     ha="center", va="center", fontsize=pt(L.fs["card_small"]), color=T["text"], alpha=a,
                     zorder=22, linespacing=1.25)
        if self.footer:
            fy = 0.12 if L.landscape else 0.12
            fig.text(0.5, fy, "\n".join(textwrap.wrap(self.footer, 80 if L.landscape else 40)), ha="center",
                     va="center", fontsize=pt(L.fs["subtitle"]), color=T["muted"],
                     alpha=a0 * ease_out((t - 2.0) / 0.6))


class OutroScene(Scene):
    show_brand = False

    def __init__(self, question, sources, duration=6.5, chapter="Your turn"):
        self.question, self.sources = question, sources
        self.duration = duration
        self.chapter = chapter

    def draw(self, fig, L, i, t):
        a0 = fade(t, self.duration, 0.4, 0.6)
        fs = L.fs["hook"] * (0.72 if L.landscape else 0.7)
        y = 0.70 if L.landscape else 0.72
        for ln in textwrap.wrap(self.question, 30 if L.landscape else 18):
            fig.text(0.5, y, ln, ha="center", va="top", fontsize=pt(fs), color=T["text"], family=HEAD,
                     weight="bold", alpha=a0)
            y -= fs * 1.2 / L.H
        fig.text(0.5, y - 0.02, "Tell us in the comments", ha="center", va="top",
                 fontsize=pt(L.fs["subtitle"] * 1.2), color=T["muted"], alpha=a0)
        g = ease_out((t - 0.8) / 0.5)
        pulse = 1 + 0.03 * math.sin(t * 5) * (t > 1.3)
        bw, bh = (0.20 if L.landscape else 0.46) * pulse, (0.085 if L.landscape else 0.05) * pulse
        by = 0.30 if L.landscape else 0.40
        if g > 0:
            rounded_box(fig, L, 0.5 - bw / 2, by, bw, bh, "#FF0033", a0 * g, r=0.012, z=25)
            fig.text(0.5, by + bh / 2, "SUBSCRIBE", ha="center", va="center", fontsize=pt(L.fs["subtitle"] * 1.35),
                     color="white", family=HEAD, weight="bold", alpha=a0 * g, zorder=26)
            fig.text(0.5, by - 0.03, T["brand"], ha="center", va="top", fontsize=pt(L.fs["brand"] * 1.3),
                     color=T["accent"], family=HEAD, weight="bold", alpha=a0 * g)
        src = "Data: " + self.sources
        wrap = 110 if L.landscape else 50
        fig.text(0.5, 0.06 if L.landscape else 0.2, "\n".join(textwrap.wrap(src, wrap)), ha="center",
                 va="bottom", fontsize=pt(L.fs["source"]), color=T["muted"], alpha=0.8 * a0, linespacing=1.3)


# ----------------------------------------------------------------------------
# Video assembly & rendering
# ----------------------------------------------------------------------------
class Video:
    def __init__(self, slug, scenes, meta=None, fps=FPS):
        self.slug = slug
        self.scenes = scenes
        self.meta = meta or {}
        self.fps = fps

    @property
    def duration(self):
        return sum(s.duration for s in self.scenes)

    def _frame(self, fig, L, scene, i):
        fig.clf()
        draw_background(fig, L)
        t = i / self.fps
        scene.draw(fig, L, i, t)
        if scene.show_brand:
            draw_brand(fig, L)
        # quick dip-to-dark between scenes
        d = scene.duration
        edge = min(t, d - t)
        if edge < 0.18:
            fig.add_artist(Rectangle((0, 0), 1, 1, transform=fig.transFigure, color=T["bg_top"],
                                     alpha=0.55 * (1 - edge / 0.18), zorder=200))

    def render(self, fmt="landscape", out_dir=OUT, crf=19, preset="medium", verbose=True):
        import imageio_ffmpeg
        L = Layout(fmt)
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{self.slug}_{fmt}.mp4")
        fig = plt.figure(figsize=(L.W / DPI, L.H / DPI), dpi=DPI)
        cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo",
               "-pix_fmt", "rgba", "-s", f"{L.W}x{L.H}", "-r", str(self.fps), "-i", "-",
               "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", path]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        total = sum(s.nframes(self.fps) for s in self.scenes)
        done = 0
        for sc in self.scenes:
            sc.prepare(L, self.fps)
            for i in range(sc.nframes(self.fps)):
                self._frame(fig, L, sc, i)
                fig.canvas.draw()
                proc.stdin.write(fig.canvas.buffer_rgba())
                done += 1
                if verbose and done % (self.fps * 10) == 0:
                    print(f"  {self.slug} [{fmt}] {done}/{total} frames", flush=True)
        proc.stdin.close()
        proc.wait()
        plt.close(fig)
        if verbose:
            print(f"saved {path}  ({total / self.fps:.1f} s)")
        return path

    def stills(self, fmt="landscape", out_dir=None, every=10.0):
        """Save PNG snapshots every `every` seconds - handy for checking layout quickly."""
        L = Layout(fmt)
        out_dir = out_dir or os.path.join(OUT, "stills", self.slug)
        os.makedirs(out_dir, exist_ok=True)
        fig = plt.figure(figsize=(L.W / DPI, L.H / DPI), dpi=DPI)
        t0 = 0.0
        paths = []
        for sc in self.scenes:
            sc.prepare(L, self.fps)
            n = sc.nframes(self.fps)
            k = 0
            while k * every * self.fps < n:
                i = min(n - 1, int(k * every * self.fps + (0.6 * self.fps if k == 0 else 0)))
                self._frame(fig, L, sc, i)
                p = os.path.join(out_dir, f"{fmt}_{t0 + i / self.fps:06.1f}s.png")
                fig.savefig(p, dpi=DPI)
                paths.append(p)
                k += 1
            t0 += sc.duration
        plt.close(fig)
        return paths

    def chapters(self):
        out, t = [], 0.0
        for sc in self.scenes:
            if sc.chapter:
                out.append((t, sc.chapter))
            for c in getattr(getattr(sc, "captions", None), "sched", []) or []:
                if c[4].get("chapter"):
                    out.append((t + c[0], c[4]["chapter"]))
            t += sc.duration
        out.sort()
        # YouTube needs chapters >= 10 s apart and the first at 0:00
        clean = []
        for tt, name in out:
            if clean and tt - clean[-1][0] < 10:
                continue
            clean.append((tt, name))
        if clean:
            clean[0] = (0.0, clean[0][1])
        return clean

    def write_metadata(self, out_dir=OUT):
        m = self.meta
        L = Layout("landscape")
        for sc in self.scenes:          # captions must be scheduled to know chapter times
            sc.prepare(L, self.fps) if isinstance(sc, (BarRaceScene, LineRaceScene, DotGridScene,
                                                       GrowBarsScene)) else None
        ch = self.chapters()
        lines = [f"TITLE:\n{m.get('title', self.slug)}\n",
                 f"SHORTS TITLE (vertical version):\n{m.get('shorts_title', m.get('title', ''))} #shorts\n",
                 "DESCRIPTION:", m.get("description", "").strip(), ""]
        if len(ch) >= 3:
            lines.append("Chapters:")
            for tt, name in ch:
                lines.append(f"{int(tt // 60)}:{int(tt % 60):02d} {name}")
            lines.append("")
        lines += ["Data sources:", m.get("sources_long", m.get("sources", "")), "",
                  "Made with Python + matplotlib. Subscribe to The Chart Runner for more data stories.", "",
                  " ".join(m.get("hashtags", [])), "", "TAGS (paste into YouTube Studio > Tags):",
                  ", ".join(m.get("tags", [])), "",
                  f"LENGTH: {self.duration:.0f} s ({int(self.duration // 60)}:{int(self.duration % 60):02d})",
                  "", "PINNED COMMENT IDEA:", m.get("pinned_comment", "")]
        os.makedirs(out_dir, exist_ok=True)
        p = os.path.join(out_dir, f"{self.slug}_youtube.txt")
        with open(p, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        return p


# ----------------------------------------------------------------------------
# Thumbnail (1280 x 720)
# ----------------------------------------------------------------------------
def make_thumbnail(path, lines, bars=None, highlight=None, badge=None, right=None, bar_colors=None):
    """lines: list of (text, color, px). bars: list of (label, value) for a mini chart on the right."""
    W, H = 1280, 720
    L = Layout("landscape")
    L.W, L.H, L.aspect = W, H, W / H
    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI)
    draw_background(fig, L)
    if bars:
        ax = fig.add_axes([0.58, 0.12, 0.30, 0.74])
        ax.set_facecolor("none")
        ax.axis("off")
        n = len(bars)
        vmax = max(v for _, v in bars)
        for k, (lab, v) in enumerate(bars):
            col = (bar_colors or {}).get(lab, color_of(lab))
            hl = lab == highlight
            ax.barh(n - 1 - k, v, height=0.74, color=col, alpha=1 if hl else 0.45)
            ax.text(v + vmax * 0.03, n - 1 - k, lab, va="center", ha="left", fontsize=pt(34 if hl else 24),
                    color=col if hl else T["muted"], weight="bold", family=HEAD, clip_on=False)
        ax.set_xlim(0, vmax * 1.5)
        ax.set_ylim(-0.6, n - 0.4)
    if right:
        yr = 0.78
        for text, col, px in right:
            fig.text(0.93, yr, text, ha="right", va="top", fontsize=pt(px), color=col or T["text"], family=HEAD,
                     weight="bold")
            yr -= px * 1.25 / H
    y = 0.86
    for text, col, px in lines:
        fig.text(0.05, y, text, ha="left", va="top", fontsize=pt(px), color=col or T["text"], family=HEAD,
                 weight="bold")
        y -= px * 1.12 / H
    if badge:
        t = fig.text(0.065, 0.12, badge, ha="left", va="center", fontsize=pt(34), color="#0A0F1F", family=HEAD,
                     weight="bold", zorder=30)
        w = t.get_window_extent(renderer=fig.canvas.get_renderer()).width / W
        rounded_box(fig, L, 0.05, 0.07, w + 0.03, 0.1, T["accent"], 1.0, r=0.01)
    fig.text(0.95, 0.95, T["brand"], ha="right", va="top", fontsize=pt(18), color=T["accent"], family=HEAD,
             weight="bold")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path, dpi=DPI)
    plt.close(fig)
    return path


# ----------------------------------------------------------------------------
# Data helpers
# ----------------------------------------------------------------------------
def load(name, **kw):
    return pd.read_csv(os.path.join(DATA, name), **kw)


def load_wide(name):
    df = load(name, index_col=0)
    df.index = df.index.astype(int)
    return df


def cli(video, thumb=None):
    """Standard command line for every video script.

    python 01_india_gdp_race.py                 -> both formats + thumbnail + YouTube text
    python 01_india_gdp_race.py --format vertical
    python 01_india_gdp_race.py --stills        -> PNG snapshots only (fast layout check)
    """
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", choices=["landscape", "vertical", "both"], default="both")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--every", type=float, default=10.0)
    ap.add_argument("--fast", action="store_true", help="faster, slightly larger files")
    ap.add_argument("--no-extras", action="store_true", help="skip thumbnail and YouTube text")
    a = ap.parse_args()
    fmts = ["landscape", "vertical"] if a.format == "both" else [a.format]
    if a.stills:
        for f in fmts:
            video.stills(f, every=a.every)
        return
    print(f"{video.slug}: {video.duration:.1f} s per video")
    if not a.no_extras:
        if thumb:
            thumb()
        video.write_metadata()
    for f in fmts:
        video.render(f, preset="veryfast" if a.fast else "medium")
