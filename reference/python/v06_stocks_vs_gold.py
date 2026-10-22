"""Video 6 - $100 in 1871: US stocks vs gold vs inflation (monthly, log scale)."""
from engine import *  # noqa: F401,F403

m = load("stocks_gold_cpi_monthly.csv", parse_dates=["date"]).set_index("date")
cols = {"sp500_total_return": "Stocks", "gold_usd_oz": "Gold", "us_cpi": "Prices"}
v = m[list(cols)].rename(columns=cols)
v = v / v.iloc[0] * 100
v.index = v.index.year + (v.index.month - 1) / 12.0
end = v.index[-1]
last_label = m.index[-1].strftime("%b %Y")
final = v.iloc[-1]
years = end - v.index[0]
cagr = (final / 100) ** (1 / years) - 1
real = final / final["Prices"] * 100
real_cagr = (real / 100) ** (1 / years) - 1

tr = m["sp500_total_return"]
crash = tr["1930":"1933"].min() / tr["1929"].max() - 1
gfc = tr["2008":"2009"].min() / tr["2007"].max() - 1
gold = m["gold_usd_oz"]
gold_x = gold["2009-12-01"] / gold["2000-01-01"]
never_lost_20y = int(((tr.shift(-240) / tr) < 1).sum()) == 0

CLR = {"Stocks": "#2EC4B6", "Gold": "#FFC300", "Prices": "#FF4D5E"}
DISPLAY = {"Stocks": "Stocks", "Gold": "Gold", "Prices": "Prices"}


def short_money(x):
    return fmt_money(x).replace(".0M", "M")


captions = [
    dict(year=1871, dur=6.0, kicker="January 1871", chapter="Three ways to keep $100",
         text="Put $100 into US stocks (dividends reinvested), $100 into gold, "
              "and watch what $100 of shopping costs over time."),
    dict(year=1895, dur=4.5, kicker="1880s–1920s",
         text="Gold doesn't move. It can't: the US fixes its price at $20.67 an ounce."),
    dict(year=1929.7, dur=5.0, kicker="1929 · The Great Crash", chapter="Crash, war and the gold standard",
         text=f"Stocks lose {abs(crash) * 100:.0f}% by 1932, even with dividends. Gold holds steady."),
    dict(year=1934, dur=4.5, kicker="1934",
         text="The US raises the official gold price from $20.67 to $35. Gold jumps 69% overnight."),
    dict(year=1950, dur=4.5, kicker="1950s",
         text="Post-war boom. Stocks leave both gold and prices far behind."),
    dict(year=1971.6, dur=5.0, kicker="1971", chapter="Gold breaks free",
         text="Nixon ends the dollar's link to gold. Gold is finally free to find its own price."),
    dict(year=1980, dur=4.5, kicker="1980",
         text=f"Gold spikes to ${gold['1980-01-01']:,.0f}, then falls for almost 20 years."),
    dict(year=2000.5, dur=4.5, kicker="2000–2009", chapter="Bubbles and crashes",
         text=f"Dot-com bust, then 2008: stocks fall {abs(gfc) * 100:.0f}% peak to trough. Gold rises {gold_x:.1f}x."),
    dict(year=2015, dur=4.5, kicker="The long game",
         text="Over every 20-year stretch since 1871, stocks with dividends reinvested never lost money in dollar terms."
         if never_lost_20y else "Long stretches of stock losses are rare, but they happen."),
    dict(year=end, dur=6.5, kicker=last_label,
         text=f"$100 became {short_money(final['Stocks'])} in stocks, {short_money(final['Gold'])} in gold. "
              f"Prices rose {final['Prices'] / 100:.0f}-fold."),
]

pace = (Pace(1871, lead=1.0).hold(5.5)
        .to(1900, 11).hold(1.0)
        .to(1929.7, 9).to(1932.5, 3).hold(1.5)
        .to(1934.1, 2).hold(2.0)
        .to(1971.6, 17).hold(2.0)
        .to(1980, 5).hold(2.0)
        .to(2000.5, 7)
        .to(2009.2, 5).hold(1.5)
        .to(end, 13).hold(6.0))

lines = LineRaceScene(
    v, pace, ["Stocks", "Gold", "Prices"],
    title="What $100 From 1871 Became",
    subtitle="US stocks (S&P 500, dividends reinvested) vs gold vs consumer prices, log scale",
    source="Sources: Robert Shiller and FRED (S&P 500), Timothy Green and World Bank (gold), US BLS (CPI). "
           "Dividends after mid-2023 estimated at a 1.3% yield. Before taxes and fees.",
    value_fmt=short_money, log=True, x_range=(1871, end), highlight="Stocks",
    markers=[(1929.7, "1929 crash"), (1934.1, "Gold $35"), (1971.6, "Gold floats"), (2008.7, "2008")],
    captions=captions, y_tick_fmt=tick_fmt_money, colors=CLR, display=DISPLAY, lw=3.2,
)

video = Video(
    "v06_stocks_vs_gold",
    [
        HookScene([("$100 in 1871.", None, "big"),
                   (f"One choice turned it into {fmt_dollars_full(final['Stocks'])}.", CLR["Stocks"], "small"),
                   (f"The other: {fmt_dollars_full(final['Gold'])}.", CLR["Gold"], "small")], duration=5.5),
        TitleScene("Stocks vs Gold: 155 Years", "What $100 invested in 1871 became", f"1871 – {m.index[-1].year}"),
        lines,
        StatCardsScene("Average yearly growth since 1871", [
            (f"{cagr['Stocks'] * 100:.1f}%", f"Stocks per year ({real_cagr['Stocks'] * 100:.1f}% after inflation)",
             CLR["Stocks"]),
            (f"{cagr['Gold'] * 100:.1f}%", f"Gold per year ({real_cagr['Gold'] * 100:.1f}% after inflation)",
             CLR["Gold"]),
            (f"{cagr['Prices'] * 100:.1f}%", "Average US inflation per year", CLR["Prices"]),
        ], footer="In US dollars, before taxes and fees. Past returns don't guarantee future returns. "
                  "Not investment advice.", duration=9.0),
        OutroScene("Should we do Sensex vs gold in rupees next?",
                   "Shiller & FRED (S&P 500), Timothy Green & World Bank (gold), US BLS (CPI)"),
    ],
    meta=dict(
        title=f"$100 in 1871: Stocks vs Gold vs Inflation (155 Years)",
        shorts_title=f"$100 in 1871 became {short_money(final['Stocks'])} in stocks",
        description=(
            f"What happened to $100 invested in January 1871? In US stocks with dividends reinvested it grew to "
            f"about {fmt_dollars_full(final['Stocks'])}. In gold it became {fmt_dollars_full(final['Gold'])}. "
            f"Meanwhile prices rose about {final['Prices'] / 100:.0f}-fold. This animation walks through the 1929 "
            "crash, the gold standard, Nixon's 1971 decision, the 1980 gold spike and the 2008 crisis.\n\n"
            "Educational only. Not investment advice."),
        sources="Shiller, gold price data, US BLS",
        sources_long="Robert Shiller's S&P 500 data, extended with FRED prices after mid-2023 "
                     "(github.com/datasets/s-and-p-500); gold prices from Timothy Green's historical table "
                     "and the World Bank Pink Sheet (github.com/datasets/gold-prices); US CPI-U from the BLS "
                     "(github.com/datasets/cpi-us). "
                     "Dividends after mid-2023 estimated at a 1.3% yield.",
        hashtags=["#Investing", "#Gold", "#StockMarket", "#Inflation", "#DataVisualization"],
        tags=["stocks vs gold", "S&P 500 history", "gold price history", "inflation", "compound interest",
              "long term investing", "1929 crash", "gold standard", "Nixon shock", "The Chart Runner"],
        pinned_comment="Would you rather hold stocks or gold for the next 20 years? Why?",
    ),
)


def thumb():
    make_thumbnail(os.path.join(OUT, "v06_stocks_vs_gold_thumbnail.png"),
                   [("$100 in 1871", T["text"], 92), ("STOCKS", CLR["Stocks"], 110), ("vs GOLD", CLR["Gold"], 110)],
                   bars=None, badge="155 years",
                   right=[(short_money(final["Stocks"]), CLR["Stocks"], 96), ("vs", T["muted"], 48),
                          (short_money(final["Gold"]), CLR["Gold"], 96)])


if __name__ == "__main__":
    cli(video, thumb)
