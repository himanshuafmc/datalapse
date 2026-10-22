"""Video 4 - The solar explosion: who makes the most electricity from sunlight, 2000-2025."""
from engine import *  # noqa: F401,F403

solar = load_wide("solar_twh.csv").loc[2000:]
mix = load_wide("world_electricity.csv").loc[2000:]
last = int(solar.index.max())


def fmt_twh(v):
    if v < 0.1:
        return "<0.1 TWh"
    return f"{v:,.0f} TWh" if v >= 10 else f"{v:.1f} TWh"


def tick_twh(v):
    return f"{v:,.0f}" if v >= 10 or v == 0 else f"{v:.1f}".rstrip("0").rstrip(".")


def rank(c, y):
    return list(solar.loc[y].sort_values(ascending=False).index).index(c) + 1


def first_year(c, k):
    return next(y for y in solar.index if rank(c, y) <= k)


leaders = []
for y in solar.index:
    top = solar.loc[y].idxmax()
    if not leaders or leaders[-1][1] != top:
        leaders.append((y, top))
de1, cn1, in5, in3 = first_year("Germany", 1), first_year("China", 1), first_year("India", 5), first_year("India", 3)
world_solar = mix["solar_electricity"]
growth = world_solar[last] / world_solar[2000]
china_share = solar.loc[last, "China"] / world_solar[last]
r = solar.loc[last].sort_values(ascending=False)
beats_next = int((r.iloc[1:].cumsum() < r.iloc[0]).sum())
ws_nuc = next(y for y in mix.index if mix.loc[y, "solar_share_elec"] + mix.loc[y, "wind_share_elec"]
              > mix.loc[y, "nuclear_share_elec"])
sol_wind = next((y for y in mix.index if mix.loc[y, "solar_share_elec"] > mix.loc[y, "wind_share_elec"]), None)

captions = [
    dict(year=2000, dur=4.5, kicker="2000", chapter="The early leaders",
         text=f"Solar is a rounding error. The whole world makes just {world_solar[2000]:.0f} TWh a year."),
    dict(year=2002.5, dur=4.0, kicker="Japan", text="Japan's rooftop subsidies make it the early leader."),
    dict(year=de1, dur=4.5, kicker=str(de1),
         text="Germany's feed-in tariff pays households for solar power. It takes #1 for nine years."),
    dict(year=2010, dur=4.5, kicker="2010",
         text="India launches its National Solar Mission. Italy and Spain are booming too."),
    dict(year=cn1, dur=5.0, kicker=str(cn1), chapter="China takes over",
         text="China takes #1. What happens next is hard to believe."),
    dict(year=in5, dur=4.5, kicker=str(in5), chapter="India's climb",
         text=f"India breaks into the top 5 with giant solar parks in Rajasthan and Karnataka."),
    dict(year=in3, dur=4.5, kicker=str(in3), text="India passes Japan to become #3 in the world."),
    dict(year=last, dur=6.5, kicker=str(last),
         text=f"China: {fmt_twh(solar.loc[last, 'China'])}, more than the next {beats_next} countries combined."),
]

pace = (Pace(2000, lead=1.0).hold(4.0)
        .to(2003, 5).to(de1, 6).hold(1.5)
        .to(2010, 8).hold(1.0)
        .to(cn1, 10).hold(2.0)
        .to(in5, 8).hold(1.5)
        .to(in3, 8).hold(1.5)
        .to(last, 9).hold(6.0))

race = BarRaceScene(
    solar, pace,
    title="Who Makes the Most Solar Power?",
    subtitle="Electricity generated from solar, terawatt-hours per year",
    source=f"Source: Our World in Data, based on Ember and Energy Institute. {last} figures are preliminary.",
    value_fmt=fmt_twh, tick_fmt=tick_twh, highlight="India", captions=captions, min_frac=0.01,
    counter=lambda y: f"World: {np.interp(y, world_solar.index, world_solar.values):,.0f} TWh",
)

SRC_COLORS = {"Coal": "#9AA5B8", "Gas": "#FF8C61", "Hydro": "#3D8BFF", "Nuclear": "#B388FF",
              "Wind": "#5EEAD4", "Solar": "#FFC300"}
shares = mix[["coal_share_elec", "gas_share_elec", "hydro_share_elec", "nuclear_share_elec",
              "wind_share_elec", "solar_share_elec"]].copy()
shares.columns = ["Coal", "Gas", "Hydro", "Nuclear", "Wind", "Solar"]

mix_captions = [
    dict(year=2000, dur=4.5, kicker="The big picture", chapter="The world's power mix",
         text="How the whole world makes its electricity. Coal is still king."),
    dict(year=ws_nuc, dur=4.5, kicker=str(ws_nuc),
         text="Wind and solar together now make more power than every nuclear plant on Earth."),
    dict(year=last, dur=6.0, kicker=str(last),
         text=(f"Solar ({shares.loc[last, 'Solar']:.1f}%) overtakes wind and is closing in on nuclear. "
               if sol_wind == last else
               f"Solar reaches {shares.loc[last, 'Solar']:.1f}% of all electricity. ")
              + f"Coal has slipped to {shares.loc[last, 'Coal']:.0f}%."),
]
mix_scene = LineRaceScene(
    shares, Pace(2000, lead=0.8).hold(3.5).to(ws_nuc, 12).hold(2.0).to(last, 8).hold(6.0),
    list(shares.columns),
    title="The World's Electricity Mix",
    subtitle="Share of global electricity generation, %",
    source="Source: Our World in Data (Ember, Energy Institute). Oil and other sources not shown.",
    value_fmt=lambda v: f"{v:.1f}%", y_range=(0, 45), x_range=(2000, last), highlight="Solar",
    captions=mix_captions, y_tick_fmt=lambda v: f"{v:.0f}%", colors=SRC_COLORS, x_mode="fixed",
)

video = Video(
    "v04_solar_explosion",
    [
        HookScene([("In 2000, all the solar panels on Earth", None, "small"),
                   (f"made {world_solar[2000]:.0f} TWh of power.", SRC_COLORS["Solar"], "big"),
                   (f"In {last}: {growth:,.0f} times more.", None, "small"),
                   (f"And {china_share * 100:.0f}% of it came from one country.", T["accent"], "small")],
                  duration=6.0),
        TitleScene("The Solar Explosion", "The countries that make the most electricity from sunlight",
                   f"2000 – {last}"),
        race,
        mix_scene,
        StatCardsScene("25 years of solar in three numbers", [
            (f"{growth:,.0f}x", f"growth in world solar power, 2000 to {last}", SRC_COLORS["Solar"]),
            (f"{china_share * 100:.0f}%", f"of the world's solar power came from China in {last}", COLORS["China"]),
            (f"#{rank('India', last)}", f"India's rank in solar power ({fmt_twh(solar.loc[last, 'India'])})",
             COLORS["India"]),
        ], footer="1 TWh is roughly what close to a million Indian homes use in a year.", duration=8.0),
        OutroScene("Should we chart India's full energy mix next?",
                   "Our World in Data energy dataset (Ember, Energy Institute Statistical Review)"),
    ],
    meta=dict(
        title=f"The Solar Explosion: Who Makes the Most Solar Power? (2000–{last})",
        shorts_title=f"Solar power grew {growth:,.0f}x in {last - 2000} years",
        description=(
            f"In 2000 the world made about {world_solar[2000]:.0f} TWh of solar electricity. In {last} it made "
            f"{world_solar[last]:,.0f} TWh. This bar-chart race shows the countries leading the solar boom, "
            "from Japan and Germany's early lead to China's takeover and India's climb to #3, followed by how "
            "the whole world's electricity mix has changed."),
        sources="Our World in Data",
        sources_long="Our World in Data energy dataset (github.com/owid/energy-data), based on Ember "
                     "and the Energy Institute Statistical Review of World Energy",
        hashtags=["#Solar", "#RenewableEnergy", "#India", "#China", "#DataVisualization"],
        tags=["solar power", "solar energy by country", "renewable energy", "India solar", "China solar",
              "solar vs wind", "electricity mix", "bar chart race", "energy transition", "The Chart Runner"],
        pinned_comment="Does your home or office have rooftop solar yet?",
    ),
)


def thumb():
    top = solar.loc[last].nlargest(5)
    make_thumbnail(os.path.join(OUT, "v04_solar_explosion_thumbnail.png"),
                   [("SOLAR", SRC_COLORS["Solar"], 140), (f"{growth:,.0f}x", T["text"], 120),
                    (f"in {last - 2000} years", T["muted"], 56)],
                   bars=list(top.items()), highlight="India", badge=f"2000–{last}")


if __name__ == "__main__":
    cli(video, thumb)
