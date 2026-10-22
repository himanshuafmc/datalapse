"""Video 5 - Who filled the sky? The biggest CO2 emitters, 1850-2024 (plus totals and per person)."""
from engine import *  # noqa: F401,F403

co2 = load_wide("co2_annual_mt.csv").loc[1850:]
world = load_wide("co2_world.csv")
last = int(co2.index.max())
summ = load(f"co2_summary_{last}.csv", index_col=0)


def fmt_mt(v):
    return f"{v / 1000:.1f} Gt" if v >= 1000 else f"{v:,.0f} Mt"


def tick_mt(v):
    return "0" if v == 0 else (f"{v / 1000:g} Gt" if v >= 1000 else f"{v:,.0f} Mt")


def rank(c, y):
    return list(co2.loc[y].sort_values(ascending=False).index).index(c) + 1


uk_1850 = co2.loc[1850, "UK"] / world.loc[1850, "co2"]
uk_last = co2.loc[last, "UK"] / world.loc[last, "co2"]
us_uk = next(y for y in co2.index if co2.loc[y, "USA"] > co2.loc[y, "UK"])
cn_us = next(y for y in co2.index if co2.loc[y, "China"] > co2.loc[y, "USA"])
us_1950 = co2.loc[1950, "USA"] / world.loc[1950, "co2"]
india3 = next(y for y in range(1950, last + 1) if rank("India", y) <= 3)
india10 = next(y for y in range(1850, last + 1) if rank("India", y) <= 10)
others3 = co2.loc[last].sort_values(ascending=False).iloc[1:4]
china_vs = co2.loc[last, "China"] > others3.sum()

captions = [
    dict(year=1850, dur=5.0, kicker="1850", chapter="Britain's head start",
         text=f"Coal-powered Britain produces {uk_1850 * 100:.0f}% of the world's fossil CO2."),
    dict(year=us_uk, dur=4.5, kicker=str(us_uk), chapter="The American century",
         text=f"The USA overtakes the UK and will hold #1 for more than a century, until {cn_us}."),
    dict(year=india10, dur=4.0, kicker=str(india10), text="India enters the top 10 for the first time."),
    dict(year=1950, dur=5.0, kicker="1950",
         text=f"Post-war boom: the USA alone emits {us_1950 * 100:.0f}% of all the world's CO2."),
    dict(year=1975, dur=4.5, kicker="1970s",
         text="Soviet heavy industry (here split into Russia, Ukraine and others) and Japan climb fast."),
    dict(year=2000, dur=4.5, kicker="2000s", chapter="China's coal boom",
         text="China becomes the world's factory, powered mostly by coal."),
    dict(year=cn_us, dur=4.5, kicker=str(cn_us), text="China overtakes the USA as the world's biggest emitter."),
    dict(year=india3, dur=4.5, kicker=str(india3), text="India passes Russia to become the #3 emitter."),
    dict(year=last, dur=6.0, kicker=str(last),
         text=(f"China now emits more than the USA, India and Russia combined. " if china_vs else "")
              + f"The UK? Just {uk_last * 100:.1f}%."),
]

pace = (Pace(1850, lead=1.0).hold(4.5)
        .to(us_uk, 9).hold(1.5)
        .to(1950, 18).hold(2.5)
        .to(1975, 8)
        .to(cn_us, 15).hold(1.5)
        .to(india3, 4).hold(1.5)
        .to(last, 7).hold(5.5))

race = BarRaceScene(
    co2, pace,
    title="The World's Biggest CO2 Emitters",
    subtitle="Annual CO2 from fossil fuels and industry",
    source="Source: Our World in Data / Global Carbon Budget. Land-use change not included.",
    value_fmt=fmt_mt, tick_fmt=tick_mt, highlight="India", captions=captions,
    counter=lambda y: f"World: {np.interp(y, world.index, world['co2'].values) / 1000:.1f} Gt",
)

cum = (summ["cumulative_co2"] / 1000).sort_values(ascending=False).head(8)
cum_scene = GrowBarsScene(
    list(cum.items()),
    title="But who has emitted the most in total?",
    subtitle=f"Cumulative CO2 since 1750, billion tonnes (to {last})",
    source="Source: Our World in Data / Global Carbon Budget.",
    value_fmt=lambda v: f"{v:,.0f} Gt", duration=11.0, highlight="India", chapter="The total bill",
    captions=[dict(at=4.0, dur=6.5, kicker="The twist",
                   text=f"India has emitted less in total than the UK, a country with 1/{summ.loc['India', 'population'] / summ.loc['UK', 'population']:.0f} of its population.")],
)

pc = summ.loc[["USA", "Russia", "China", "Japan", "Germany", "UK", "India"], "co2_per_capita"].copy()
pc.loc["World average"] = world.loc[last, "co2_per_capita"]
pc = pc.sort_values(ascending=False)
pc_scene = GrowBarsScene(
    list(pc.items()),
    title="And per person?",
    subtitle=f"CO2 per person per year, tonnes ({last})",
    source="Source: Our World in Data / Global Carbon Budget.",
    value_fmt=lambda v: f"{v:.1f} t", duration=10.0, highlight="India", chapter="Per person",
    captions=[dict(at=3.5, dur=6.0, kicker="Per person",
                   text=f"The average American emits {pc['USA'] / pc['India']:.1f} times as much CO2 as the average Indian.")],
)

video = Video(
    "v05_co2_emitters",
    [
        HookScene([("In 1850, one small island made", None, "small"),
                   (f"{uk_1850 * 100:.0f}% of the world's CO2.", COLORS["UK"], "big"),
                   (f"Today it's under {np.ceil(uk_last * 100):.0f}%.", None, "small"),
                   ("So who filled the sky?", T["accent"], "small")], duration=5.5),
        TitleScene("Who Filled the Sky?", "175 years of the world's biggest carbon emitters", f"1850 – {last}"),
        race,
        cum_scene,
        pc_scene,
        StatCardsScene("The carbon story in three numbers", [
            (f"{uk_1850 * 100:.0f}%", "of world CO2 came from the UK in 1850", COLORS["UK"]),
            (f"{summ.loc['USA', 'share_global_cumulative_co2']:.0f}%", "of all CO2 ever emitted came from the USA",
             COLORS["USA"]),
            (f"{pc['India']:.1f} t", f"CO2 per Indian per year, vs {pc['USA']:.1f} t per American", COLORS["India"]),
        ], footer="Fossil fuels and industry only. Deforestation and land use are not included.", duration=8.0),
        OutroScene("Which climate chart should we make next?",
                   "Our World in Data CO2 dataset (Global Carbon Budget)"),
    ],
    meta=dict(
        title=f"Who Filled the Sky? Biggest CO2 Emitters 1850–{last}",
        shorts_title=f"In 1850 the UK made {uk_1850 * 100:.0f}% of the world's CO2",
        description=(
            f"In 1850, Britain produced {uk_1850 * 100:.0f}% of the world's fossil CO2. This animated race shows "
            f"the top emitters from 1850 to {last}: the UK, then the USA for over a century, then China. "
            "Then we look at the total emitted since 1750 and at emissions per person, where the picture "
            "looks very different, especially for India."),
        sources="Our World in Data, Global Carbon Budget",
        sources_long="Our World in Data CO2 and greenhouse gas emissions dataset (github.com/owid/co2-data), "
                     "based on the Global Carbon Budget",
        hashtags=["#ClimateChange", "#CO2", "#India", "#China", "#DataVisualization"],
        tags=["CO2 emissions by country", "carbon emissions history", "biggest polluters", "climate change",
              "India CO2 per capita", "China emissions", "USA emissions", "cumulative emissions",
              "bar chart race", "The Chart Runner"],
        pinned_comment="Who should cut first: the biggest emitters today, or the biggest emitters in history?",
    ),
)


def thumb():
    make_thumbnail(os.path.join(OUT, "v05_co2_emitters_thumbnail.png"),
                   [("WHO FILLED", T["text"], 100), ("THE SKY?", T["text"], 100),
                    (f"1850–{last}", T["accent"], 60)],
                   bars=list(co2.loc[last].nlargest(5).items()), highlight="India", badge="CO2 race")


if __name__ == "__main__":
    cli(video, thumb)
