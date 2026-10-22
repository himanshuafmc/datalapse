"""Video 7 (bonus) - The internet race: which countries have the most people online, 1993-2024."""
from engine import *  # noqa: F401,F403

LAST = 2024
users = load_wide("internet_users.csv").loc[1990:LAST].interpolate(limit_area="inside")
pct = load_wide("internet_users_pct.csv").loc[1990:LAST].interpolate(limit_area="inside").copy()
pop = load_wide("population.csv").loc[1990:LAST]
world_users = users.sum(axis=1)
pct["World"] = world_users / pop.sum(axis=1) * 100


def rank(c, y):
    return list(users.loc[y].sort_values(ascending=False).index).index(c) + 1


us_share_1995 = users.loc[1995, "USA"] / world_users[1995]
cn_us = next(y for y in users.index if users.loc[y, "China"] > users.loc[y, "USA"])
in_us = next(y for y in users.index if users.loc[y, "India"] > users.loc[y, "USA"])
india_offline = pop.loc[LAST, "India"] - users.loc[LAST, "India"]

captions = [
    dict(year=1995, dur=5.0, kicker="1995", chapter="The early web",
         text=f"The web goes mainstream. {us_share_1995 * 100:.0f}% of everyone online lives in the USA."),
    dict(year=2000, dur=4.5, kicker="2000",
         text=f"The dot-com boom: {world_users[2000] / 1e6:,.0f} million people online worldwide. "
              f"India has about {users.loc[2000, 'India'] / 1e6:.0f} million."),
    dict(year=cn_us, dur=4.5, kicker=str(cn_us), chapter="China and India take over",
         text="China passes the USA to have the most internet users on Earth."),
    dict(year=2016, dur=5.0, kicker="2016",
         text="Cheap 4G data and low-cost smartphones arrive in India. Watch what happens."),
    dict(year=in_us, dur=4.5, kicker=str(in_us), text="India overtakes the USA for #2."),
    dict(year=LAST, dur=6.0, kicker=str(LAST),
         text=f"{users.loc[LAST, 'India'] / 1e6:,.0f} million Indians online, and about "
              f"{india_offline / 1e6:,.0f} million still to come."),
]

pace = (Pace(1993, lead=1.0).hold(2.0)
        .to(1995, 4).hold(2.5)
        .to(2000, 8).hold(2.0)
        .to(cn_us, 10).hold(1.5)
        .to(2016, 10).hold(2.5)
        .to(in_us, 8).hold(1.5)
        .to(LAST, 8).hold(5.5))

race = BarRaceScene(
    users, pace,
    title="Which Country Has the Most Internet Users?",
    subtitle="People using the internet",
    source="Source: Gapminder, based on ITU (share online x population). Gaps filled by interpolation.",
    value_fmt=fmt_count, tick_fmt=tick_fmt_count, highlight="India", captions=captions,
    counter=lambda y: f"World: {np.interp(y, world_users.index, world_users.values) / 1e9:.2f} B online",
)

series = ["USA", "China", "World", "India", "Nigeria"]
share_scene = LineRaceScene(
    pct[series].loc[1995:], Pace(1995, lead=0.8).hold(2.5).to(2015, 9).to(LAST, 8).hold(6.0), series,
    title="What Share of People Are Online?",
    subtitle="Internet users as % of population",
    source="Source: Gapminder / ITU. World = sum of all countries.",
    value_fmt=lambda v: f"{v:.0f}%", y_range=(0, 100), x_range=(1995, LAST), highlight="India",
    y_tick_fmt=lambda v: f"{v:.0f}%", chapter="Share of people online",
    captions=[dict(year=1995, dur=4.5, kicker="Share online", text="Now look at it as a share of each population."),
              dict(year=LAST, dur=6.0, kicker=str(LAST),
                   text=f"India is at {pct.loc[LAST, 'India']:.0f}%, below the world average of "
                        f"{pct.loc[LAST, 'World']:.0f}%. The race isn't over.")],
)

video = Video(
    "v07_internet_race",
    [
        HookScene([("In 2000, about", None, "small"),
                   (f"{users.loc[2000, 'India'] / 1e6:.0f} million Indians", COLORS["India"], "big"),
                   ("used the internet.", None, "small"),
                   (f"In {LAST}: {users.loc[LAST, 'India'] / 1e6:,.0f} million.", T["accent"], "small")],
                  duration=5.5),
        TitleScene("The Internet Race", "The countries with the most people online", f"1993 – {LAST}"),
        race,
        share_scene,
        StatCardsScene("India online in three numbers", [
            (f"#{rank('India', LAST)}", "India's rank in internet users", COLORS["India"]),
            (fmt_count(users.loc[LAST, "India"]).replace(" ", ""), f"Indians online in {LAST}", T["green"]),
            (fmt_count(india_offline).replace(" ", ""), "Indians still offline", T["red"]),
        ], footer="Internet user counts come from surveys and estimates, so treat them as approximate.",
            duration=8.0),
        OutroScene("What tech race should we chart next?", "Gapminder Systema Globalis (ITU internet users)"),
    ],
    meta=dict(
        title=f"The Internet Race: Most Internet Users by Country (1993–{LAST})",
        shorts_title=f"India: {users.loc[2000, 'India'] / 1e6:.0f}M to {users.loc[LAST, 'India'] / 1e6:,.0f}M internet users",
        description=(
            "Which countries have the most people online? This bar-chart race follows internet users from the "
            f"early web, when most users were American, to China taking #1 in {cn_us} and India's smartphone "
            f"boom that pushed it to #2 in {in_us}. Then we look at the share of each population online."),
        sources="Gapminder, ITU",
        sources_long="Gapminder Systema Globalis, internet users (% of population, from ITU) x Gapminder "
                     "population (github.com/open-numbers/ddf--gapminder--systema_globalis)",
        hashtags=["#Internet", "#India", "#DigitalIndia", "#Technology", "#DataVisualization"],
        tags=["internet users by country", "internet growth", "India internet users", "Jio", "digital India",
              "China internet", "bar chart race", "smartphone boom", "technology history", "The Chart Runner"],
        pinned_comment="When did you first get online? Tell us the year.",
    ),
)


def thumb():
    make_thumbnail(os.path.join(OUT, "v07_internet_race_thumbnail.png"),
                   [("THE", T["text"], 90), ("INTERNET", COLORS["India"], 120), ("RACE", T["text"], 120)],
                   bars=list(users.loc[LAST].nlargest(5).items()), highlight="India", badge=f"1993–{LAST}")


if __name__ == "__main__":
    cli(video, thumb)
