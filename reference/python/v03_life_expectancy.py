"""Video 3 - How the world stopped dying young: life expectancy & child mortality, 1800-2023."""
from engine import *  # noqa: F401,F403

lex = load_wide("life_expectancy.csv").loc[1800:2023]
u5 = load_wide("child_mortality.csv").loc[1800:2023]
S = ["India", "China", "Japan", "UK", "USA", "Nigeria", "Brazil"]
lex = lex[S]
L = lex.round(1)

india_u5 = u5["India"] / 10  # per 100 children
japan_lead = next(y for y in range(1950, 2024) if L.loc[y].idxmax() == "Japan")
covid_drop = L.loc[2019, "India"] - L.loc[2021, "India"]

captions = [
    dict(year=1800, dur=5.0, kicker="1800", chapter="Life expectancy, 1800–2023",
         text=f"Life expectancy at birth: {L.loc[1800, 'India']:.0f} years in India, about "
              f"{L.loc[1800, 'UK']:.0f} in the UK. Most of the gap is children who never grew up."),
    dict(year=1870, dur=4.5, kicker="1800s",
         text="The UK and USA pull ahead first, thanks to clean water, sewers and vaccination."),
    dict(year=1918, dur=5.5, kicker="1918 · Flu pandemic", chapter="1918: the flu pandemic",
         text=f"One of the deadliest years in India's history: life expectancy crashes to {L.loc[1918, 'India']:.0f} years."),
    dict(year=1945, dur=4.5, kicker="1945",
         text=f"War: Japan's life expectancy falls to {L.loc[1945, 'Japan']:.0f}. "
              f"By {japan_lead} it has overtaken the UK and USA."),
    dict(year=1960, dur=5.0, kicker="1959–61 · China", chapter="Famine, then the long climb",
         text=f"China's Great Famine: life expectancy plunges to {L.loc[1960, 'China']:.0f}, then rebounds fast."),
    dict(year=1980, dur=4.5, kicker="The long climb",
         text="Antibiotics, vaccines, oral rehydration and better food lift every line."),
    dict(year=1998, dur=4.5, kicker="Nigeria",
         text=f"Nigeria's line barely moves for two decades: {L.loc[1980, 'Nigeria']:.0f} years in 1980, "
              f"{L.loc[2000, 'Nigeria']:.0f} in 2000."),
    dict(year=2020, dur=4.5, kicker="2020–21 · COVID-19",
         text=f"The pandemic erases years of progress: India loses {covid_drop:.1f} years between 2019 and 2021."),
    dict(year=2023, dur=5.0, kicker="2023",
         text=f"India: {L.loc[1800, 'India']:.0f} to {L.loc[2023, 'India']:.0f} years. "
              "Almost three times as long as in 1800."),
]

pace = (Pace(1800, lead=1.0).hold(4.0)
        .to(1900, 12)
        .to(1918, 4).hold(4.0)
        .to(1945, 6).hold(2.0)
        .to(1960, 4).hold(3.0)
        .to(1998, 9).hold(1.5)
        .to(2019, 7)
        .to(2021, 2).hold(2.5)
        .to(2023, 2).hold(4.0))

lines = LineRaceScene(
    lex, pace, S,
    title="Life Expectancy at Birth",
    subtitle="Average years a newborn could expect to live",
    source="Source: Gapminder Life Expectancy v15 (UN, IHME and historical estimates).",
    value_fmt=lambda v: f"{v:.0f}",
    y_range=(0, 90), x_range=(1800, 2023), highlight="India",
    markers=[(1918, "Flu pandemic"), (1947, "Independence"), (2020, "COVID-19")],
    captions=captions, y_tick_fmt=lambda v: f"{v:.0f}",
)

dots_pace = Pace(1900, lead=0.5).hold(3.5).to(1950, 8).hold(2.5).to(2000, 7).to(2023, 5).hold(5.0)
dots = DotGridScene(
    india_u5, dots_pace,
    title="100 Children Born in India",
    subtitle="Red: did not survive to their 5th birthday",
    big_fmt=lambda v: f"{v:.0f} in 100",
    small_text="children did not live to see their fifth birthday",
    source="Source: Gapminder Child Mortality v12 (UN IGME and historical estimates).",
    chapter="100 children",
    captions=[
        dict(year=1900, dur=5.5, kicker="1900",
             text=f"More than half of all children in India die before age 5 ({india_u5[1900]:.0f} in 100)."),
        dict(year=1950, dur=5.0, kicker="1950",
             text=f"Still {india_u5[1950]:.0f} in 100. The biggest gains are about to come."),
        dict(year=2023, dur=6.0, kicker="Today",
             text=f"About {india_u5[2023]:.0f} in 100. In Japan it is {u5.loc[2023, 'Japan'] / 10:.1f}. "
                  "The next jump is still possible."),
    ],
)

video = Video(
    "v03_life_expectancy",
    [
        HookScene([("In 1900, more than half of all", None, "small"),
                   ("children in India died", T["red"], "big"),
                   ("before their fifth birthday.", None, "small"),
                   (f"Today it's about {india_u5[2023]:.0f} in 100.", T["green"], "small")], duration=6.0),
        TitleScene("How the World Stopped Dying Young", "Life expectancy and child survival", "1800 – 2023"),
        lines,
        dots,
        StatCardsScene("Two centuries of progress", [
            (f"{L.loc[1800, 'India']:.0f} to {L.loc[2023, 'India']:.0f}", "India's life expectancy, 1800 vs 2023",
             COLORS["India"]),
            (f"{india_u5[1900]:.0f} to {india_u5[2023]:.0f}", "Indian children in 100 who died before age 5, 1900 vs 2023",
             T["red"]),
            (f"{L.loc[2023, 'Japan']:.0f}", "Japan's life expectancy, the highest here", COLORS["Japan"]),
        ], footer="Life expectancy at birth is pulled down mostly by deaths in childhood.", duration=8.0),
        OutroScene("Which health statistic should we chart next?",
                   "Gapminder Life Expectancy v15 and Child Mortality v12"),
    ],
    meta=dict(
        title="How the World Stopped Dying Young | Life Expectancy 1800–2023",
        shorts_title="Half of India's children once died before age 5",
        description=(
            f"In 1800, a newborn in India could expect to live about {L.loc[1800, 'India']:.0f} years. "
            f"Today it's {L.loc[2023, 'India']:.0f}. This animation tracks life expectancy in India, China, "
            "Japan, the UK, the USA, Nigeria and Brazil from 1800 to 2023, through the 1918 flu, war, "
            "China's Great Famine and COVID-19, then shows what happened to 100 children born in India."),
        sources="Gapminder",
        sources_long="Gapminder Life Expectancy v15 and Child Mortality v12, "
                     "via github.com/open-numbers/ddf--gapminder--fasttrack",
        hashtags=["#LifeExpectancy", "#PublicHealth", "#India", "#History", "#DataVisualization"],
        tags=["life expectancy", "child mortality", "India life expectancy", "1918 flu India",
              "public health history", "Japan life expectancy", "Great Chinese Famine", "COVID-19",
              "data visualization", "line chart race", "The Chart Runner"],
        pinned_comment="What do you think did the most to raise life expectancy: vaccines, clean water, or food?",
    ),
)


def thumb():
    bars = [(f"{y}: {india_u5[y]:.0f} in 100", india_u5[y]) for y in (1900, 1950, 1980, 2000, 2023)]
    cols = {lab: (T["green"] if lab.startswith("2023") else T["red"]) for lab, _ in bars}
    make_thumbnail(os.path.join(OUT, "v03_life_expectancy_thumbnail.png"),
                   [("HALF", T["red"], 150), ("of children", T["text"], 70), ("never turned 5", T["text"], 70)],
                   bars=bars, highlight=bars[-1][0], badge="India, 1900–2023", bar_colors=cols)


if __name__ == "__main__":
    cli(video, thumb)
