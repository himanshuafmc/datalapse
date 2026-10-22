"""
Generate tests/fixtures/python_expected.json: inputs and the answers Python,
NumPy and matplotlib give for them. tests/unit.test.mjs checks the JavaScript
ports against this file, so the JS tests run without Python installed.

    python3 tests/make_fixtures.py
"""
import json
import math
import os
import random
import sys
import textwrap

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "reference", "python"))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
from matplotlib.ticker import LogLocator, MaxNLocator, ScalarFormatter  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

import engine  # noqa: E402

rnd = random.Random(20261021)


def num(x):
    """JSON-safe float (NaN/inf as strings)."""
    x = float(x)
    if math.isnan(x):
        return "nan"
    if math.isinf(x):
        return "inf" if x > 0 else "-inf"
    return x


def values():
    out = [0.0, -0.0, 0.5, 1.5, 2.5, -0.5, -1.5, 0.125, 0.375, 2.675, 1.005, 0.045, 1e21, 1.5e22, 123456789.125,
           999.5, 999.95, 999.995, 9.995, 99.95, 1e-7, -1e-7, 5e-324, 1.7976931348623157e308, 0.1 + 0.2,
           1234.5, 12345.5, 0.0005, 0.00049999999999999999, 4.35, 4.45, 8.345, 1e15 + 0.5, 2 ** 53]
    for _ in range(400):
        e = rnd.uniform(-4, 15)
        v = 10 ** e * rnd.choice([1, -1, 1, 1])
        out.append(v)
        # values sitting exactly on a decimal tie, e.g. 12.345 with 3 digits
        d = rnd.randint(0, 4)
        out.append(round(rnd.uniform(-5000, 5000), d) + 5 * 10 ** (-d - 1))
    return out


def fixed_cases():
    cases = []
    for v in values():
        for d in range(0, 5):
            cases.append([v, d, False, f"{v:.{d}f}"])
            cases.append([v, d, True, f"{v:,.{d}f}"])
    return cases


def general_cases():
    cases = []
    for v in values():
        for p in (1, 2, 3, 6):
            cases.append([v, p, f"{v:.{p}g}"])
        cases.append([v, None, f"{v:g}"])
    return cases


def round_cases():
    vs = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, 4.4999999999999, 1e16 + 1, 2 ** 52 + 0.5, 0.49999999999999994]
    vs += [rnd.uniform(-1e6, 1e6) for _ in range(200)] + [rnd.randint(-1000, 1000) + 0.5 for _ in range(100)]
    return [[v, round(v)] for v in vs]


def format_cases():
    out = {k: [] for k in ("fmt_money", "fmt_count", "fmt_dollars_full", "tick_fmt_money", "tick_fmt_count")}
    vs = [0.0, 1.0, 999.0, 999.4, 999.5, 1000.0, 999_499.0, 999_500.0, 999_999.0, 1e6, 1.5e6, 2.5e9, 1e12, 9.995e11,
          9.9949e11, 1234567.0, -2.5e9, -1234.0, 12.5, 0.5, 1.5]
    vs += [10 ** rnd.uniform(0, 14) for _ in range(500)]
    vs += [rnd.choice([1, 2, 2.5, 5]) * 10 ** rnd.randint(0, 13) * rnd.randint(1, 9) for _ in range(200)]
    for v in vs:
        for k in out:
            out[k].append([v, getattr(engine, k)(v)])
    return out


WORDS = ("the of and a to in is you that it he was for on are as with his they I at be this have from or one had "
         "by word but not what all were we when your can said there use an each which she do how their if will up "
         "other about out many then them these so some her would make like him into time has look two more write go "
         "see number no way could people my than first water been call who oil its now find long down day did get "
         "come made may part India's GDP-per-capita well-known state-of-the-art 1,000,000 $3.7T 2024: (approx.) "
         "co-operation e.g. — – ₹4.2 कुल 中国 Ünïcödé supercalifragilisticexpialidocious "
         "antidisestablishmentarianism x-y-z a--b end. Why? Yes! semi;colon tab\tseparated").split(" ")


def wrap_cases():
    cases = []
    fixed = ["India overtook the UK in 2022 to become the world's fifth-largest economy.",
             "From 1960 to 2024 — six decades of growth, in 90 seconds.",
             "A well-known, state-of-the-art, run-of-the-mill sentence-with-hyphens.",
             "Supercalifragilisticexpialidocious is longer than the width.",
             "  leading and trailing spaces  ", "", "one", "word  double  spaced", "a-b-c-d-e-f-g-h-i-j",
             "Ends with an em dash—and keeps going—without spaces.", "Numbers 1,234.56 and 7.8% and 9-10 ranges."]
    for text in fixed:
        for w in (5, 8, 12, 16, 20, 26, 28, 34, 40, 48, 60):
            cases.append([text, w, textwrap.wrap(text, w)])
    for _ in range(600):
        text = " ".join(rnd.choice(WORDS) for _ in range(rnd.randint(1, 30)))
        if rnd.random() < 0.2:
            text = "  " + text + " "
        w = rnd.randint(4, 60)
        cases.append([text, w, textwrap.wrap(text, w)])
    return cases


def interp_cases():
    cases = []
    for _ in range(150):
        n = rnd.randint(1, 12)
        xp = sorted(rnd.sample(range(1950, 2030), n))
        xp = [float(v) for v in xp]
        fp = [rnd.uniform(-100, 1e4) if rnd.random() > 0.1 else float("nan") for _ in xp]
        xs = [rnd.uniform(1940, 2040) for _ in range(20)] + xp + [xp[0] - 1, xp[-1] + 1]
        cases.append([[num(v) for v in xs], xp, [num(v) for v in fp], [num(v) for v in np.interp(xs, xp, fp)]])
    return cases


def smooth_cases():
    cases = []
    for _ in range(60):
        n = rnd.randint(1, 200)
        arr = np.cumsum([rnd.uniform(-1, 1) for _ in range(n)])
        win = rnd.choice([0, 1, 2, 3, 5, 12, 18.0, 0.6 * 30, 0.4 * 30, 0.4 * 60, 250])
        cases.append([list(arr), win, list(map(float, engine.smooth(arr, win)))])
    # 2-D (columns smoothed independently), as the bar race does for ranks
    for _ in range(10):
        n, m = rnd.randint(2, 120), rnd.randint(1, 6)
        arr = np.array([[float(rnd.randint(0, m)) for _ in range(m)] for _ in range(n)])
        res = engine.smooth(arr, 12.0)
        cases.append([arr.T.tolist(), 12.0, res.T.tolist(), "2d"])
    return cases


def sum_cases():
    cases = []
    for _ in range(100):
        vals = [rnd.uniform(-1, 1) * 10 ** rnd.randint(-8, 8) for _ in range(rnd.randint(0, 30))]
        cases.append([vals, sum(vals)])
    cases.append([[0.1] * 10, sum([0.1] * 10)])
    cases.append([[1e100, 1.0, -1e100], sum([1e100, 1.0, -1e100])])
    return cases


def tick_cases():
    fig = plt.figure()
    ax = fig.add_subplot()
    lin, log = [], []
    configs = [dict(nbins=5, steps=[1, 2, 2.5, 5, 10]), dict(nbins=4, steps=[1, 2, 2.5, 5, 10]),
               dict(nbins=6, integer=True), dict(nbins=4, integer=True), dict(nbins=10)]
    ranges = [(0, 1), (0, 1.14), (0, 3.7e12), (1960, 2024), (1990.0, 1990.4), (0, 0), (5, 5), (-3, 7),
              (1e-9, 3e-9), (2000, 2000.0001), (0, 97.3), (0, 1.43e9), (1800, 2023)]
    for _ in range(300):
        a = rnd.uniform(-1e3, 1e3) * 10 ** rnd.randint(-3, 9)
        b = a + abs(rnd.uniform(0, 1)) * 10 ** rnd.randint(-3, 10)
        ranges.append((a, b))
        y0 = rnd.randint(1800, 2020)
        ranges.append((float(y0), y0 + rnd.uniform(0.05, 80)))
    for lo, hi in ranges:
        for cfg in configs:
            loc = MaxNLocator(**cfg)
            ticks = list(map(float, loc.tick_values(lo, hi)))
            ax.set_ylim(lo, hi) if lo != hi else None
            lin.append([lo, hi, cfg, ticks])
    for _ in range(200):
        lo = 10 ** rnd.uniform(-3, 9)
        hi = lo * 10 ** rnd.uniform(0.01, 14)
        loc = LogLocator(numticks=9)
        ticks = [float(t) for t in loc.tick_values(lo, hi)]
        vis = [t for t in ticks if lo * (1 - 1e-10) <= t <= hi * (1 + 1e-10)]
        log.append([lo, hi, vis])
    # ScalarFormatter labels for integer year axes, as the line race x axis uses
    fmt = []
    for lo, hi in [(1960, 2024), (1800, 2023), (1990, 1991), (2000, 2030), (0, 5)]:
        ax2 = fig.add_subplot()
        ax2.set_xlim(lo, hi)
        ax2.xaxis.set_major_locator(MaxNLocator(nbins=6, integer=True))
        t = [float(v) for v in ax2.get_xticks()]
        fmt.append([t, list(ax2.xaxis.get_major_formatter().format_ticks(t))])
    plt.close(fig)
    return {"maxN": lin, "log": log, "scalar": fmt}


def label_cases():
    cases = []
    for _ in range(150):
        n = rnd.randint(1, 10)
        targets = [rnd.uniform(-0.1, 1.1) for _ in range(n)]
        gap = rnd.choice([0.02, 0.035, 0.05, 0.08, 0.15, 0.3])
        cases.append([targets, gap, [float(v) for v in engine.place_labels(targets, gap)]])
    return cases


def divmod_cases():
    cases = []
    for _ in range(200):
        a = rnd.uniform(-1e4, 1e4) * 10 ** rnd.randint(-3, 3)
        b = rnd.choice([1.0, 0.5, 0.25, 2.5, 10.0, 1e-3, -1.0, -2.5, 3.0, 0.1])
        q, r = divmod(a, b)
        cases.append([a, b, q, r])
    return cases


def main():
    out = {
        "fixed": fixed_cases(), "general": general_cases(), "round": round_cases(), "formats": format_cases(),
        "wrap": wrap_cases(), "interp": interp_cases(), "smooth": smooth_cases(), "sum": sum_cases(),
        "ticks": tick_cases(), "labels": label_cases(), "divmod": divmod_cases(),
        "versions": {"python": sys.version.split()[0], "numpy": np.__version__, "matplotlib": matplotlib.__version__},
    }
    os.makedirs(os.path.join(ROOT, "tests", "fixtures"), exist_ok=True)
    path = os.path.join(ROOT, "tests", "fixtures", "python_expected.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
