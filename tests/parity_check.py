"""
Parity test: does the JavaScript engine compute and draw the same thing as
the original Python engine (reference/python/engine.py)?

    python3 tests/parity_check.py            # every 45th frame + caption moments
    python3 tests/parity_check.py --step 15  # denser sampling

Two layers are compared for all seven bundled stories, in both formats:

1. Prepared arrays: data time per frame (pace), interpolated values, bar
   positions, ranks, axis maxima and caption timings.
2. Draw calls on sampled frames: every text (string, position, size, colour,
   alpha, alignment), bar, line, dot, rectangle, axis limit and tick label.
   matplotlib calls are wrapped to record them; the JavaScript side uses a
   recording figure (tests/recorder.mjs).

Rank differences are allowed only where two entities have exactly equal
values (a tie), because NumPy's quicksort and JavaScript's stable sort may
order ties differently.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "reference", "python")
sys.path.insert(0, REF)
os.chdir(REF)

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import colors as mcolors  # noqa: E402
from matplotlib.axes import Axes  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

import engine  # noqa: E402

STORIES = ["v01_india_gdp_race", "v02_population_race", "v03_life_expectancy", "v04_solar_explosion",
           "v05_co2_emitters", "v06_stocks_vs_gold", "v07_internet_race"]
REL, ABS = 1e-9, 1e-9
REC = None


def hexc(c):
    return mcolors.to_hex(c, keep_alpha=False).lower()


def px(fontsize):
    return fontsize * engine.DPI / 72.0


def wt(w):
    return "regular" if w in (None, "normal") else str(w)


def fam(f):
    return "head" if f == engine.HEAD else "body"


# --- wrap matplotlib so the engine's drawing calls are recorded -------------
_ftext, _atext, _barh, _plot, _scatter = Figure.text, Axes.text, Axes.barh, Axes.plot, Axes.scatter
_hline, _vline, _add_artist = Axes.axhline, Axes.axvline, Figure.add_artist
_set_xticklabels = Axes.set_xticklabels


def ftext(self, x, y, s, *a, **kw):
    if REC is not None and s != "":
        REC.append(["ftext", x, y, str(s), px(kw["fontsize"]), kw.get("alpha", 1.0) if kw.get("alpha") is not None else 1.0,
                    hexc(kw.get("color", "k")), kw.get("ha", "left"), kw.get("va", "baseline"),
                    wt(kw.get("weight")), fam(kw.get("family")), kw.get("zorder", 3)])
    return _ftext(self, x, y, s, *a, **kw)


def atext(self, x, y, s, *a, **kw):
    if REC is not None and s != "":
        REC.append(["atext", x, y, str(s), px(kw["fontsize"]), kw.get("alpha", 1.0), hexc(kw.get("color", "k")),
                    kw.get("ha", "left"), kw.get("va", "baseline"), wt(kw.get("weight")), fam(kw.get("family"))])
    return _atext(self, x, y, s, *a, **kw)


def barh(self, y, width, *a, **kw):
    if REC is not None:
        REC.append(["barh", float(y), float(width), float(kw.get("height", 0.8)), kw.get("alpha", 1.0),
                    hexc(kw.get("color"))])
    return _barh(self, y, width, *a, **kw)


def plot(self, xs, ys, *a, **kw):
    if REC is not None:
        xs = list(map(float, xs))
        ys = list(map(float, ys))
        s = 0.0
        for v in ys:
            s += v
        REC.append(["plot", len(xs), xs[0], xs[-1], ys[0], ys[-1], s, kw.get("lw", 1.5), kw.get("alpha", 1.0),
                    hexc(kw.get("color"))])
    return _plot(self, xs, ys, *a, **kw)


def scatter(self, xs, ys, *a, **kw):
    if REC is not None:
        if "c" in kw:
            for x, y, c in zip(xs, ys, kw["c"]):
                REC.append(["dot", float(x), float(y), float(kw["s"]), hexc(c[:3]), float(c[3])])
        else:
            for x, y in zip(xs, ys):
                REC.append(["dot", float(x), float(y), float(kw["s"]), hexc(kw["color"]), kw.get("alpha", 1.0)])
    return _scatter(self, xs, ys, *a, **kw)


def hline(self, y, *a, **kw):
    if REC is not None:
        REC.append(["hline", float(y), kw.get("lw", 1), kw.get("alpha", 1.0)])
    return _hline(self, y, *a, **kw)


def vline(self, x, *a, **kw):
    if REC is not None:
        REC.append(["vline", float(x), kw.get("lw", 1), kw.get("alpha", 1.0)])
    return _vline(self, x, *a, **kw)


def add_artist(self, artist, *a, **kw):
    if REC is not None:
        kind = "rbox" if isinstance(artist, FancyBboxPatch) else "rect" if isinstance(artist, Rectangle) else None
        if kind:
            REC.append([kind, artist.get_x(), artist.get_y(), artist.get_width(), artist.get_height(),
                        artist.get_alpha() if artist.get_alpha() is not None else 1.0, hexc(artist.get_facecolor()),
                        artist.get_zorder()])
    return _add_artist(self, artist, *a, **kw)


def set_xticklabels(self, labels, *a, **kw):
    self._cr_xticklabels = [str(x) for x in labels]
    return _set_xticklabels(self, labels, *a, **kw)


Figure.text, Axes.text, Axes.barh, Axes.plot, Axes.scatter = ftext, atext, barh, plot, scatter
Axes.axhline, Axes.axvline, Figure.add_artist, Axes.set_xticklabels = hline, vline, add_artist, set_xticklabels


def axes_summary(ax, kind):
    lo, hi = ax.get_ylim()
    summ = {"xlim": list(ax.get_xlim()), "ylim": [lo, hi], "ticks": {}}
    if kind == "barRace":
        summ["ticks"]["top"] = [list(map(float, ax.get_xticks())), getattr(ax, "_cr_xticklabels", [])]
    elif kind == "lineRace":
        xt = list(map(float, ax.get_xticks()))
        summ["ticks"]["bottom"] = [xt, list(ax.xaxis.get_major_formatter().format_ticks(xt))]
        a, b = min(lo, hi), max(lo, hi)
        tol = 1e-10 * (b - a) if not ax.get_yscale() == "log" else 0
        if ax.get_yscale() == "log":
            yt = [float(t) for t in ax.get_yticks() if a * (1 - 1e-10) <= t <= b * (1 + 1e-10)]
        else:
            yt = [float(t) for t in ax.get_yticks() if a - tol <= t <= b + tol]
        summ["ticks"]["left"] = [yt, list(ax.yaxis.get_major_formatter().format_ticks(yt))]
    return summ


# --- comparison helpers -------------------------------------------------------
class Report:
    def __init__(self):
        self.fail = []
        self.checked = 0
        self.max_err = 0.0

    def num(self, where, a, b):
        self.checked += 1
        if a is None or b is None:
            if not (a is None and (b is None or (isinstance(b, float) and math.isnan(b)))) and \
               not (b is None and (isinstance(a, float) and math.isnan(a))):
                self.fail.append(f"{where}: {a!r} vs {b!r}")
            return
        a, b = float(a), float(b)
        if math.isnan(a) and math.isnan(b):
            return
        err = abs(a - b)
        scale = max(abs(a), abs(b))
        if scale > 0 and err > 0:
            self.max_err = max(self.max_err, err / scale if scale > 1 else err)
        if not (err <= ABS or err <= REL * scale):
            self.fail.append(f"{where}: JS {a!r} vs Python {b!r} (diff {err:.3g})")

    def eq(self, where, a, b):
        self.checked += 1
        if a != b:
            self.fail.append(f"{where}: JS {a!r} vs Python {b!r}")

    def arr(self, where, a, b):
        if a is None and b is None:
            return
        b = list(np.asarray(b, dtype=float))
        if len(a) != len(b):
            self.fail.append(f"{where}: length {len(a)} vs {len(b)}")
            return
        for k, (x, y) in enumerate(zip(a, b)):
            before = len(self.fail)
            self.num(f"{where}[{k}]", x, y)
            if len(self.fail) > before + 0 and len(self.fail) - before >= 1:
                return  # first difference per array is enough

    def call(self, where, js, py):
        if js[0] != py[0]:
            self.fail.append(f"{where}: JS draws {js[0]} {js[1:4]} but Python draws {py[0]} {py[1:4]}")
            return False
        for k, (a, b) in enumerate(zip(js[1:], py[1:])):
            if isinstance(a, str) or isinstance(b, str):
                self.eq(f"{where} {js[0]}[{k + 1}]", a, b)
            else:
                self.num(f"{where} {js[0]}[{k + 1}] ({js[3] if js[0] in ('ftext', 'atext') else ''})", a, b)
        return True


def main():
    global REC
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", type=int, default=45)
    ap.add_argument("--stories", nargs="*", default=STORIES)
    args = ap.parse_args()
    dump_path = os.path.join(tempfile.gettempdir(), "cr_js_dump.json")
    subprocess.run(["node", os.path.join(ROOT, "tests", "js_dump.mjs"), dump_path, str(args.step)], check=True, cwd=ROOT)
    with open(dump_path) as f:
        dump = json.load(f)

    rep = Report()
    frames_compared = 0
    calls_compared = 0
    rank_ties = 0
    for story in args.stories:
        mod = __import__(story)
        video = mod.video
        for fmt in ["landscape", "vertical"]:
            L = engine.Layout(fmt)
            js_scenes = dump[story][fmt]
            fig = plt.figure(figsize=(L.W / engine.DPI, L.H / engine.DPI), dpi=engine.DPI)
            for k, (sc, js) in enumerate(zip(video.scenes, js_scenes)):
                where = f"{story}/{fmt}/scene{k}:{js['type']}"
                sc.prepare(L, video.fps)
                rep.eq(f"{where} nframes", js["nframes"], sc.nframes(video.fps))
                rep.num(f"{where} duration", js["duration"], sc.duration)
                if hasattr(sc, "ys"):
                    rep.arr(f"{where} ys", js["ys"], sc.ys)
                if hasattr(sc, "captions"):
                    py = sc.captions.sched
                    rep.eq(f"{where} caption count", len(js["sched"]), len(py))
                    for c, (a, b) in enumerate(zip(js["sched"], py)):
                        rep.num(f"{where} caption{c} start", a[0], b[0])
                        rep.num(f"{where} caption{c} end", a[1], b[1])
                        rep.eq(f"{where} caption{c} text", a[3], b[3])
                if js["type"] == "barRace":
                    rep.eq(f"{where} cols", js["cols"], list(sc.cols))
                    for j, name in enumerate(sc.cols):
                        rep.arr(f"{where} V[{name}]", js["V"][j], sc.V[:, j])
                    rep.arr(f"{where} xmax", js["xmax"], sc.xmax)
                    # Ranks must match except where values tie exactly: NumPy's
                    # argsort orders ties in a CPU-dependent way, JavaScript
                    # breaks them by column order. A JS rank is valid when every
                    # entity ranked above another has a value >= it.
                    jr = np.array(js["trueRank"]).T
                    pr = sc.true_rank
                    jp = np.array(js["pos"], dtype=float).T
                    rep.checked += 1
                    if (jr != pr).any():
                        V = sc.V
                        bad = None
                        for r in np.unique(np.argwhere(jr != pr)[:, 0]):
                            order = np.argsort(jr[r])
                            if (np.diff(V[r, order]) > 0).any() or sorted(jr[r]) != list(range(len(jr[r]))):
                                bad = r
                                break
                        if bad is not None:
                            rep.fail.append(f"{where} rank frame {bad}: JS ranks are not a valid ordering")
                        else:
                            rank_ties += int((jr != pr).sum())
                            # Draw the Python frames with the same tie order so
                            # every other draw call can still be compared exactly.
                            sc.true_rank = jr.copy()
                            sc.pos = engine.smooth(jr.astype(float), 0.4 * video.fps)
                    for j, name in enumerate(sc.cols):
                        rep.arr(f"{where} pos[{name}]", list(jp[:, j]), sc.pos[:, j])
                    if js["pinRank"] is not None:
                        rep.arr(f"{where} pinRank", js["pinRank"], sc.pin_rank)
                if js["type"] == "lineRace" and js.get("ymax") is not None:
                    rep.arr(f"{where} ymax", js["ymax"], sc.ymax)
                if js["type"] == "dotGrid":
                    rep.arr(f"{where} v", js["v"], sc.v)
                # draw calls on sampled frames
                for si, jf in js["frames"].items():
                    i = int(si)
                    fig.clf()
                    REC = []
                    sc.draw(fig, L, i, i / video.fps)
                    calls, REC = REC, None
                    fw = f"{where} frame {i}"
                    frames_compared += 1
                    if len(jf["calls"]) != len(calls):
                        rep.fail.append(f"{fw}: JS made {len(jf['calls'])} draw calls, Python {len(calls)}")
                    for c, (a, b) in enumerate(zip(jf["calls"], calls)):
                        calls_compared += 1
                        if not rep.call(f"{fw} call{c}", a, b):
                            break
                    axs = fig.axes
                    for ai, (ja, pa) in enumerate(zip(jf["axes"], axs)):
                        ps = axes_summary(pa, js["type"])
                        rep.num(f"{fw} xlim0", ja["xlim"][0], ps["xlim"][0])
                        rep.num(f"{fw} xlim1", ja["xlim"][1], ps["xlim"][1])
                        rep.num(f"{fw} ylim0", ja["ylim"][0], ps["ylim"][0])
                        rep.num(f"{fw} ylim1", ja["ylim"][1], ps["ylim"][1])
                        for side, (pt, pl) in ps["ticks"].items():
                            jt, jl = ja["ticks"].get(side, [[], []])
                            rep.eq(f"{fw} {side} tick count", len(jt), len(pt))
                            for t1, t2 in zip(jt, pt):
                                rep.num(f"{fw} {side} tick", t1, t2)
                            rep.eq(f"{fw} {side} tick labels", jl, pl)
            plt.close(fig)
        print(f"  {story}: done ({len(rep.fail)} differences so far)", flush=True)

    print()
    print(f"Compared {rep.checked:,} values, {frames_compared:,} frames and {calls_compared:,} draw calls.")
    print(f"Largest numeric difference: {rep.max_err:.3g}. Rank ties ordered differently: {rank_ties}.")
    if rep.fail:
        print(f"\nFAIL: {len(rep.fail)} differences. First 40:")
        for f in rep.fail[:40]:
            print("  " + f)
        sys.exit(1)
    print("PASS: the JavaScript engine matches the Python engine.")


if __name__ == "__main__":
    main()
