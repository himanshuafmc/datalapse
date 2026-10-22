"""Video 1 - India's climb to the world's top 5 economies (GDP race, 1960-2023)."""
from engine import *  # noqa: F401,F403

gdp = load_wide("gdp_usd.csv").loc[1960:]
last = int(gdp.index.max())


def rank(country, year):
    row = gdp.loc[year].dropna().sort_values(ascending=False)
    return list(row.index).index(country) + 1


r1960, r1991, rlast = rank("India", 1960), rank("India", 1991), rank("India", last)
worst_year = min(range(1960, last + 1), key=lambda y: -rank("India", y))
first_top5 = next(y for y in range(1960, last + 1) if rank("India", y) <= 5)
jp_us_1995 = gdp.loc[1995, "Japan"] / gdp.loc[1995, "USA"]
chn_3 = next(y for y in range(1990, last + 1) if rank("China", y) <= 3)
chn_2 = next(y for y in range(1990, last + 1) if rank("China", y) <= 2)
india_last = gdp.loc[last, "India"]

captions = [
    dict(year=1960, dur=4.5, kicker="1960", chapter="1960: where India started",
         text=f"India starts at #{r1960} with {fmt_money(gdp.loc[1960, 'India'])}, smaller than the UK, France and China."),
    dict(year=1963, dur=4.5, kicker="Watch the top spot",
         text="One country holds #1 for all 64 years. Everything else keeps moving."),
    dict(year=1966, dur=4.5, kicker="1966",
         text="Drought and a 36% rupee devaluation shrink India's economy in dollar terms."),
    dict(year=1980, dur=4.5, kicker="The 1980s", chapter="Japan's boom",
         text="Japan's boom: by 1995 its economy is "
              f"{jp_us_1995 * 100:.0f}% the size of America's."),
    dict(year=1991, dur=5.5, kicker="1991 · Crisis", chapter="1991: crisis and reform",
         text=f"Balance-of-payments crisis. India slides to #{r1991}, then opens up its economy."),
    dict(year=1994, dur=4.5, kicker="Quick guess",
         text=f"Where will India rank by {last}? Drop your guess in the comments before the end."),
    dict(year=2000, dur=4.5, kicker="2000s", chapter="China takes off",
         text="China joins the WTO in 2001, and its bar starts to take off."),
    dict(year=chn_3, dur=4.0, kicker=str(chn_3), text="China passes Germany for #3."),
    dict(year=chn_2, dur=4.5, kicker=str(chn_2), text="China overtakes Japan. #2 and still climbing."),
    dict(year=2015, dur=4.5, kicker="2015", chapter="India breaks into the top 5",
         text=f"India climbs to #{rank('India', 2015)}, passing Brazil, Italy and Russia."),
    dict(year=first_top5, dur=5.0, kicker=str(first_top5),
         text="India overtakes the UK, the country that ruled it until 1947, to become #5."),
    dict(year=last, dur=6.5, kicker=str(last),
         text=f"{fmt_money(india_last)}. From #{r1991} to #{rlast} in {last - 1991} years. "
              "Next in line: Japan and Germany."),
]

pace = (Pace(1960, lead=1.0).hold(4.5)
        .to(1966, 8).hold(2.5)
        .to(1980, 12)
        .to(1991, 12).hold(4.0)
        .to(chn_2, 24).hold(2.0)
        .to(2015, 10).hold(2.0)
        .to(first_top5, 10).hold(2.5)
        .to(last, 5).hold(6.0))

race = BarRaceScene(
    gdp, pace,
    title="The World's Largest Economies",
    subtitle="GDP in current US dollars",
    source="Source: World Bank (current US$). The Soviet Union has no World Bank data, so it is not shown.",
    value_fmt=fmt_money, tick_fmt=tick_fmt_money,
    highlight="India", pin="India", captions=captions, chapter=None,
)

video = Video(
    "v01_india_gdp_race",
    [
        HookScene([("In 1991, India was the world's", None, "small"),
                   (f"#{r1991} economy.", COLORS["India"], "big"),
                   (f"By {first_top5}, it was #{rank('India', first_top5)}.", None, "small"),
                   ("Here's how it happened.", T["accent"], "small")], duration=5.5),
        TitleScene("The Race to Be the World's Biggest Economy", "The 10 largest economies, and where India ranks",
                   f"1960 – {last}", chapter=None),
        race,
        StatCardsScene("India's journey in three numbers", [
            (f"#{r1960}", f"in 1960 ({fmt_money(gdp.loc[1960, 'India'])})", COLORS["India"]),
            (f"#{r1991}", "in 1991, the year of the crisis", T["red"]),
            (f"#{rlast}", f"in {last} ({fmt_money(india_last)})", T["green"]),
        ], footer="Measured at market exchange rates. Adjusted for purchasing power (PPP), India already ranks #3.",
            duration=8.0),
        OutroScene("Which country's rise should we chart next?",
                   "World Bank World Development Indicators, GDP (current US$)"),
    ],
    meta=dict(
        title=f"India's Climb to the World's Top 5 Economies | GDP Race 1960–{last}",
        shorts_title=f"India: #{r1991} to #{rlast} in {last - 1991} years",
        description=(
            f"In 1991 India was the world's #{r1991} economy. By {first_top5} it had overtaken the UK to become #5.\n"
            f"This animated bar-chart race shows the world's largest economies from 1960 to {last} "
            "(GDP in current US dollars). Watch the 1966 devaluation, the 1991 crisis, Japan's boom, "
            "China's rise, and India's climb into the top five."),
        sources="World Bank",
        sources_long="World Bank, World Development Indicators: GDP (current US$), NY.GDP.MKTP.CD, "
                     "via github.com/datasets/gdp",
        hashtags=["#India", "#GDP", "#Economy", "#DataVisualization", "#BarChartRace"],
        tags=["India GDP", "India economy", "GDP ranking", "largest economies", "bar chart race",
              "India vs China", "India overtakes UK", "1991 reforms", "world economy 1960 to 2023",
              "data visualization", "The Chart Runner"],
        pinned_comment=f"India went from #{r1991} to #{rlast}. When do you think it passes Japan and Germany?",
    ),
)


def thumb():
    top = gdp.loc[last].dropna().sort_values(ascending=False).head(6)
    make_thumbnail(os.path.join(OUT, "v01_india_gdp_race_thumbnail.png"),
                   [("INDIA", COLORS["India"], 130), (f"#{r1991} to #{rlast}", T["text"], 104),
                    (f"in {last - 1991} years", T["muted"], 56)],
                   bars=list(top.items()), highlight="India", badge=f"1960–{last}")


if __name__ == "__main__":
    cli(video, thumb)
