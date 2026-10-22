"""Video 2 - The population race, 1800-2100 (UN projections after 2023)."""
from engine import *  # noqa: F401,F403

pop = load_wide("population.csv").loc[1800:2100]
world = pop.sum(axis=1)
LAST_DATA = 2023  # after this, Gapminder uses UN World Population Prospects projections


def rank(country, year):
    row = pop.loc[year].sort_values(ascending=False)
    return list(row.index).index(country) + 1


share_1800 = (pop.loc[1800, "China"] + pop.loc[1800, "India"]) / world[1800]
usa3 = next(y for y in range(1800, 2101) if rank("USA", y) <= 3)
india1 = next(y for y in range(1900, 2101) if pop.loc[y, "India"] > pop.loc[y, "China"])
nga_usa = next(y for y in range(2000, 2101) if pop.loc[y, "Nigeria"] > pop.loc[y, "USA"])
pak_usa = next(y for y in range(2000, 2101) if pop.loc[y, "Pakistan"] > pop.loc[y, "USA"])
chn_peak = int(pop["China"].idxmax())
ind_peak = int(pop["India"].idxmax())
chn_below_1b = next(y for y in range(chn_peak, 2101) if pop.loc[y, "China"] < 1e9)
top_1850_europe = [c for c in pop.loc[1850].nlargest(10).index
                   if c in ("France", "Germany", "UK", "Italy", "Russia", "Spain", "Poland")]

captions = [
    dict(year=1800, dur=5.0, kicker="1800", chapter="1800: two giants",
         text=f"About 1 billion people on Earth, and {share_1800 * 100:.0f}% of them live in just two countries: "
              "China and India (today's borders)."),
    dict(year=1840, dur=4.5, kicker="1850",
         text=f"Europe's industrial age: {len(top_1850_europe)} European countries make the top 10."),
    dict(year=usa3 - 2, dur=4.5, kicker=str(usa3),
         text="Waves of immigration push the USA up to #3. It still holds that spot today."),
    dict(year=1950, dur=5.0, kicker="1950", chapter="The great acceleration",
         text=f"{world[1950] / 1e9:.1f} billion people. Vaccines, antibiotics and better food "
              "are about to change everything."),
    dict(year=1980, dur=4.5, kicker="1980",
         text="China introduces its one-child policy. Watch the gap with India start to close."),
    dict(year=2000, dur=4.5, kicker="2000s",
         text="Pakistan and Nigeria are climbing fast. Keep an eye on them."),
    dict(year=india1, dur=5.5, kicker=f"{india1}–{india1 + 1}", chapter="India becomes #1",
         text="India overtakes China to become the most populous country on Earth."),
    dict(year=LAST_DATA + 1, dur=4.0, kicker="From here on", chapter="The future (UN projections)",
         text="UN projections. The future isn't fixed, but the trend is strong."),
    dict(year=pak_usa - 1, dur=4.5, kicker=str(pak_usa),
         text=f"Pakistan passes the USA. Nigeria follows in {nga_usa}."),
    dict(year=ind_peak, dur=4.5, kicker=str(ind_peak),
         text=f"India peaks at about {pop.loc[ind_peak, 'India'] / 1e9:.2f} billion, then starts to shrink."),
    dict(year=chn_below_1b, dur=4.5, kicker=str(chn_below_1b),
         text=f"China falls below 1 billion, from a peak of {pop['China'].max() / 1e9:.2f} billion in {chn_peak}."),
    dict(year=2100, dur=6.0, kicker="2100",
         text="Three of today's fastest-growing nations, Pakistan, Nigeria and DR Congo, sit in the top 5."),
]

pace = (Pace(1800, lead=1.0).hold(4.5)
        .to(1850, 9)
        .to(1900, 9)
        .to(1950, 10).hold(2.0)
        .to(1980, 9).hold(1.0)
        .to(2000, 7)
        .to(india1, 8).hold(3.5)
        .to(LAST_DATA + 1, 3).hold(2.0)
        .to(2050, 12)
        .to(2075, 11)
        .to(2100, 11).hold(5.0))

race = BarRaceScene(
    pop, pace,
    title="The Most Populous Countries",
    subtitle="Population, today's borders",
    source="Source: Gapminder, based on UN World Population Prospects. Projections after 2023.",
    value_fmt=fmt_count, tick_fmt=tick_fmt_count, highlight="India",
    captions=captions,
    counter=lambda y: f"World: {np.interp(y, world.index, world.values) / 1e9:.2f} B",
    notes=lambda y: "UN projection" if y > LAST_DATA + 0.5 else None,
)

video = Video(
    "v02_population_race",
    [
        HookScene([("In 1800, more than half of all humans", None, "small"),
                   ("lived in just two countries.", COLORS["India"], "big"),
                   ("By 2100, the list looks very different.", T["accent"], "small")], duration=5.5),
        TitleScene("The Population Race", "The 10 most populous countries, past and projected", "1800 – 2100"),
        race,
        StatCardsScene("300 years in three numbers", [
            (f"{share_1800 * 100:.0f}%", "of all people lived in China or India in 1800", COLORS["China"]),
            (f"{india1}", "India overtakes China for #1", COLORS["India"]),
            (fmt_count(pop.loc[2100, "Nigeria"]).replace(" ", ""),
             "Nigeria in 2100, more than the USA", COLORS["Nigeria"]),
        ], footer="Countries are shown within today's borders, projected back in time.", duration=8.0),
        OutroScene("Which country's future should we chart next?",
                   "Gapminder Population v8 (UN World Population Prospects)"),
    ],
    meta=dict(
        title="The Population Race 1800–2100 | India Overtakes China, Nigeria Rises",
        shorts_title="300 years of the population race in 2 minutes",
        description=(
            f"In 1800, {share_1800 * 100:.0f}% of the world's 1 billion people lived in China and India. "
            "This bar-chart race shows the 10 most populous countries from 1800 to 2100, using Gapminder "
            "data and UN projections for the future. Watch the USA climb to #3, India overtake China, "
            "and Pakistan, Nigeria and DR Congo surge up the table."),
        sources="Gapminder, UN",
        sources_long="Gapminder Population v8 (based on UN World Population Prospects), "
                     "via github.com/open-numbers/ddf--gapminder--fasttrack",
        hashtags=["#Population", "#India", "#China", "#Nigeria", "#DataVisualization"],
        tags=["population race", "most populous countries", "India vs China population",
              "world population 2100", "Nigeria population", "Pakistan population", "bar chart race",
              "UN population projections", "demographics", "The Chart Runner"],
        pinned_comment="Which surprised you more: Pakistan passing the USA, or China falling below 1 billion?",
    ),
)


def thumb():
    top = pop.loc[2100].nlargest(6)
    make_thumbnail(os.path.join(OUT, "v02_population_race_thumbnail.png"),
                   [("WHO WILL BE", T["text"], 88), ("BIGGEST", T["text"], 118), ("IN 2100?", COLORS["India"], 118)],
                   bars=list(top.items()), highlight="Nigeria", badge="1800–2100")


if __name__ == "__main__":
    cli(video, thumb)
