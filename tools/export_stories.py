"""
Export the seven Python Chart Runner stories (reference/python/v0*.py) as
JSON story specs for Datalapse.

    python3 tools/export_stories.py

Each story script is imported (it computes its captions and pacing from the
data, exactly as when rendering with Python), then every scene is written
out as plain JSON. Number-format lambdas are translated to the declarative
format language in src/core/format.js; tests/parity_check.py confirms every
translation gives the same text as the original Python function.

Writes stories/<slug>.json and src/stories/bundled.js.
"""
import json
import math
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "reference", "python")
sys.path.insert(0, REF)
os.chdir(REF)

import engine  # noqa: E402

STORIES = ["v01_india_gdp_race", "v02_population_race", "v03_life_expectancy", "v04_solar_explosion",
           "v05_co2_emitters", "v06_stocks_vs_gold", "v07_internet_race"]

# --- record the exact Pace calls so JavaScript rebuilds identical key times ---
_orig_init, _orig_to, _orig_hold = engine.Pace.__init__, engine.Pace.to, engine.Pace.hold


def _init(self, start, lead=0.8):
    _orig_init(self, start, lead)
    self._spec = {"start": float(start), "lead": float(lead), "steps": []}


def _to(self, year, seconds):
    self._spec["steps"].append({"to": float(year), "dur": float(seconds)})
    return _orig_to(self, year, seconds)


def _hold(self, seconds):
    self._spec["steps"].append({"hold": float(seconds)})
    return _orig_hold(self, seconds)


engine.Pace.__init__, engine.Pace.to, engine.Pace.hold = _init, _to, _hold

# --- number formats ---------------------------------------------------------
NAMED = {
    engine.fmt_money: {"type": "money"},
    engine.fmt_count: {"type": "count"},
    engine.tick_fmt_money: {"type": "tickMoney"},
    engine.tick_fmt_count: {"type": "tickCount"},
    engine.fmt_dollars_full: {"type": "dollarsFull"},
}
LOCAL = {
    "fmt_twh": {"type": "piecewise", "cases": [
        {"if": {"lt": 0.1}, "text": "<0.1 TWh"},
        {"if": {"gte": 10}, "format": {"type": "fixed", "digits": 0, "thousands": True, "suffix": " TWh"}}],
        "else": {"type": "fixed", "digits": 1, "suffix": " TWh"}},
    "tick_twh": {"type": "piecewise", "cases": [
        {"if": {"gte": 10}, "format": {"type": "fixed", "digits": 0, "thousands": True}},
        {"if": {"eq": 0}, "format": {"type": "fixed", "digits": 0, "thousands": True}}],
        "else": {"type": "fixed", "digits": 1, "strip": True}},
    "fmt_mt": {"type": "piecewise", "cases": [
        {"if": {"gte": 1000}, "format": {"type": "fixed", "digits": 1, "divide": 1000, "suffix": " Gt"}}],
        "else": {"type": "fixed", "digits": 0, "thousands": True, "suffix": " Mt"}},
    "tick_mt": {"type": "piecewise", "cases": [
        {"if": {"eq": 0}, "text": "0"},
        {"if": {"gte": 1000}, "format": {"type": "general", "divide": 1000, "suffix": " Gt"}}],
        "else": {"type": "fixed", "digits": 0, "thousands": True, "suffix": " Mt"}},
    "short_money": {"type": "money", "replace": [[".0M", "M"]]},
}

# Lambdas, keyed by (story, scene index, attribute). Verified by tests/parity_check.py.
FIXED = lambda d, sfx="", **kw: dict({"type": "fixed", "digits": d, "suffix": sfx} if sfx else {"type": "fixed", "digits": d}, **kw)  # noqa: E731
LAMBDAS = {
    ("v03_life_expectancy", 2, "value_fmt"): FIXED(0),
    ("v03_life_expectancy", 2, "y_tick_fmt"): FIXED(0),
    ("v03_life_expectancy", 3, "big_fmt"): FIXED(0, " in 100"),
    ("v04_solar_explosion", 3, "value_fmt"): FIXED(1, "%"),
    ("v04_solar_explosion", 3, "y_tick_fmt"): FIXED(0, "%"),
    ("v05_co2_emitters", 3, "value_fmt"): FIXED(0, " Gt", thousands=True),
    ("v05_co2_emitters", 4, "value_fmt"): FIXED(1, " t"),
    ("v07_internet_race", 3, "value_fmt"): FIXED(0, "%"),
    ("v07_internet_race", 3, "y_tick_fmt"): FIXED(0, "%"),
}
# Counters drawn under the year: (module attribute holding the series, column, prefix, format)
COUNTERS = {
    "v02_population_race": ("world", None, "World: ", FIXED(2, " B", divide=1e9)),
    "v04_solar_explosion": ("world_solar", None, "World: ", FIXED(0, " TWh", thousands=True)),
    "v05_co2_emitters": ("world", "co2", "World: ", FIXED(1, " Gt", divide=1000)),
    "v07_internet_race": ("world_users", None, "World: ", FIXED(2, " B online", divide=1e9)),
}
NOTES = {"v02_population_race": [{"after": 2023.5, "text": "UN projection"}]}


def fmt_spec(story, k, attr, fn):
    if fn is None:
        return None
    if fn in NAMED:
        return NAMED[fn]
    name = getattr(fn, "__name__", "")
    if name in LOCAL:
        return LOCAL[name]
    key = (story, k, attr)
    if key in LAMBDAS:
        return LAMBDAS[key]
    raise SystemExit(f"No format translation for {key} ({name})")



def clean(o):
    """Make numpy/pandas values JSON-safe (NaN -> null)."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if math.isnan(f) else f
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def table(index, columns, getcol):
    return {"index": [float(x) for x in index], "columns": [str(c) for c in columns],
            "values": [[None if (v is None or (isinstance(v, float) and math.isnan(v))) else float(v)
                        for v in getcol(c)] for c in columns]}


def bar_race_columns(sc):
    """Columns the bar race needs: those it keeps, plus any that ever beat the pinned entity."""
    L = engine.Layout("landscape")
    sc.prepare(L, engine.FPS)
    cols = list(sc.cols)
    if sc.pin:
        f = sc.df.fillna(0)
        beats = (f.gt(f[sc.pin], axis=0)).any(axis=0)
        extra = [c for c in sc.df.columns if beats[c] and c not in cols]
        cols += extra
    order = {c: i for i, c in enumerate(sc.df.columns)}
    return sorted(set(cols), key=order.get)


def export(story):
    mod = __import__(story)
    video = mod.video
    datasets = {}
    scenes = []
    for k, sc in enumerate(video.scenes):
        kind = type(sc).__name__
        if kind == "HookScene":
            s = {"type": "hook", "lines": [{"text": t, "color": c, "size": z} for t, c, z in sc.lines],
                 "duration": sc.duration, "stagger": sc.stagger, "chapter": sc.chapter}
        elif kind == "TitleScene":
            s = {"type": "title", "title": sc.title, "subtitle": sc.subtitle, "span": sc.span,
                 "duration": sc.duration, "chapter": sc.chapter}
        elif kind == "BarRaceScene":
            did = f"s{k}"
            cols = bar_race_columns(sc)
            datasets[did] = table(sc.df.index, cols, lambda c: sc.df[c].values)
            s = {"type": "barRace", "data": did, "pace": sc.pace._spec, "title": sc.title,
                 "subtitle": sc.subtitle, "source": sc.source,
                 "valueFormat": fmt_spec(story, k, "value_fmt", sc.value_fmt),
                 "tickFormat": fmt_spec(story, k, "tick_fmt", sc.tick_fmt),
                 "highlight": sc.highlight, "pin": sc.pin, "captions": sc.captions.items,
                 "nBars": sc.n_bars, "minFrac": sc.min_frac, "colors": sc.colors, "chapter": sc.chapter}
            if sc.counter is not None:
                attr, col, prefix, f = COUNTERS[story]
                ser = getattr(mod, attr)
                if col is not None:
                    ser = ser[col]
                cid = f"s{k}_counter"
                datasets[cid] = table(ser.index, ["value"], lambda c: ser.values)
                s["counter"] = {"data": cid, "column": "value", "prefix": prefix, "format": f}
            if sc.notes is not None:
                s["notes"] = NOTES[story]
        elif kind == "LineRaceScene":
            did = f"s{k}"
            df = sc.df
            datasets[did] = table(df.index, sc.series, lambda c: df[c].values)
            s = {"type": "lineRace", "data": did, "pace": sc.pace._spec, "series": list(sc.series),
                 "title": sc.title, "subtitle": sc.subtitle, "source": sc.source,
                 "valueFormat": fmt_spec(story, k, "value_fmt", sc.value_fmt),
                 "yTickFormat": fmt_spec(story, k, "y_tick_fmt", sc.y_tick_fmt),
                 "yRange": list(sc.y_range) if sc.y_range else None, "log": bool(sc.log),
                 "xRange": list(sc.x_range) if sc.x_range else None, "highlight": sc.highlight,
                 "markers": [{"x": x, "label": lab} for x, lab in sc.markers], "captions": sc.captions.items,
                 "display": sc.display, "colors": sc.colors, "lw": sc.lw, "xMode": sc.x_mode,
                 "minSpan": sc.min_span, "chapter": sc.chapter}
        elif kind == "DotGridScene":
            did = f"s{k}"
            datasets[did] = table(sc.s.index, ["value"], lambda c: sc.s.values)
            s = {"type": "dotGrid", "data": did, "column": "value", "pace": sc.pace._spec,
                 "title": sc.title, "subtitle": sc.subtitle, "source": sc.source,
                 "bigFormat": fmt_spec(story, k, "big_fmt", sc.big_fmt), "smallText": sc.small_text,
                 "captions": sc.captions.items, "badColor": None, "goodColor": None, "chapter": sc.chapter}
        elif kind == "GrowBarsScene":
            s = {"type": "growBars", "items": [{"name": n, "value": v} for n, v in sc.items],
                 "title": sc.title, "subtitle": sc.subtitle, "source": sc.source,
                 "valueFormat": fmt_spec(story, k, "value_fmt", sc.value_fmt), "duration": sc.duration,
                 "highlight": sc.highlight, "captions": sc.captions.items, "stagger": sc.stagger,
                 "chapter": sc.chapter}
        elif kind == "StatCardsScene":
            s = {"type": "statCards", "heading": sc.heading,
                 "cards": [{"big": b, "small": sm, "color": c} for b, sm, c in sc.cards],
                 "duration": sc.duration, "chapter": sc.chapter, "footer": sc.footer}
        elif kind == "OutroScene":
            s = {"type": "outro", "question": sc.question, "sources": sc.sources, "duration": sc.duration,
                 "chapter": sc.chapter}
        else:
            raise SystemExit(f"Unsupported scene {kind}")
        scenes.append(s)
    return clean({
        "version": 1,
        "id": video.slug,
        "fps": video.fps,
        "theme": {"name": "midnight", "brand": engine.T["brand"]},
        "credit": True,
        "meta": video.meta,
        "datasets": datasets,
        "scenes": scenes,
    })


def main():
    out_dir = os.path.join(ROOT, "stories")
    os.makedirs(out_dir, exist_ok=True)
    specs = []
    for story in STORIES:
        spec = export(story)
        with open(os.path.join(out_dir, f"{story}.json"), "w", encoding="utf-8") as f:
            json.dump(spec, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        size = os.path.getsize(os.path.join(out_dir, f"{story}.json"))
        print(f"  {story}: {len(spec['scenes'])} scenes, {size / 1024:.0f} KB")
        specs.append(spec)
    js = ("// Generated by tools/export_stories.py from reference/python. Do not edit.\n"
          "export const BUNDLED_STORIES = " + json.dumps(specs, ensure_ascii=False, separators=(",", ":"),
                                                          allow_nan=False) + ";\n")
    os.makedirs(os.path.join(ROOT, "src", "stories"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "stories", "bundled.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print(f"  src/stories/bundled.js: {len(js) / 1024:.0f} KB")
    write_hook_walks()


def write_hook_walks():
    """The hook scene's background walks, exactly as engine.HookScene.prepare draws them."""
    rng = np.random.default_rng(7)
    walks = [rng.normal(0.004, 0.02, 400).cumsum() for _ in range(7)]
    rows = ",\n".join("[" + ",".join(repr(float(v)) for v in w) + "]" for w in walks)
    js = ("// Background random walks for the hook scene, generated with\n"
          "// numpy.random.default_rng(7) exactly as engine.py does (tools/export_stories.py).\n"
          f"export const HOOK_WALKS = [\n{rows}];\n")
    with open(os.path.join(ROOT, "src", "core", "hookWalks.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print(f"  src/core/hookWalks.js: {len(js) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
