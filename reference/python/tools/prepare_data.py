"""
Rebuild the small CSV files in ../data from the original open datasets.

You do NOT need to run this to make the videos - the prepared CSVs are
already bundled in the data/ folder. Run it only when you want fresher data:

    python tools/prepare_data.py --download

Sources (all free / open licence):
  World Bank GDP (current US$) ........ github.com/datasets/gdp
  Gapminder Fast Track (pop, life exp., child mortality)  github.com/open-numbers/ddf--gapminder--fasttrack
  Gapminder Systema Globalis (internet users)             github.com/open-numbers/ddf--gapminder--systema_globalis
  Our World in Data energy + CO2 ...... github.com/owid/energy-data, github.com/owid/co2-data
  Shiller S&P 500 data ................ github.com/datasets/s-and-p-500
  Gold prices ......................... github.com/datasets/gold-prices
  US CPI-U ............................ github.com/datasets/cpi-us
"""
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "data")

GM = "https://raw.githubusercontent.com/open-numbers/ddf--gapminder--fasttrack/master"
SG = "https://raw.githubusercontent.com/open-numbers/ddf--gapminder--systema_globalis/master/countries-etc-datapoints"
URLS = {
    "gdp_wb.csv": "https://raw.githubusercontent.com/datasets/gdp/main/data/gdp.csv",
    "sp500.csv": "https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv",
    "gold_monthly.csv": "https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv",
    "cpi_us.csv": "https://raw.githubusercontent.com/datasets/cpi-us/main/data/cpiai.csv",
    "owid_co2.csv": "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
    "owid_energy.csv": "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv",
    "gm_pop.csv": f"{GM}/countries_etc_datapoints/ddf--datapoints--pop--by--country--time.csv",
    "gm_lex.csv": f"{GM}/countries_etc_datapoints/ddf--datapoints--lex--by--country--time.csv",
    "gm_u5mr.csv": f"{GM}/countries_etc_datapoints/ddf--datapoints--child_mortality_0_5_year_olds_dying_per_1000_born--by--country--time.csv",
    "gm_countries.csv": f"{GM}/ddf--entities--geo--country.csv",
    "sg_internet.csv": f"{SG}/ddf--datapoints--internet_users--by--geo--time.csv",
    "fx_daily.csv": "https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv",
    "gt_annual.csv": "https://raw.githubusercontent.com/datasets/global-temp/main/data/annual.csv",
}

NAME_FIX = {
    "Congo, Dem. Rep.": "DR Congo", "Congo, Rep.": "Congo", "Hong Kong, China": "Hong Kong",
    "Czech Republic": "Czechia", "Slovak Republic": "Slovakia", "Lao": "Laos",
    "Kyrgyz Republic": "Kyrgyzstan", "Micronesia, Fed. Sts.": "Micronesia",
    "St. Lucia": "Saint Lucia", "United Arab Emirates": "UAE",
}


def download():
    os.makedirs(RAW, exist_ok=True)
    for fn, url in URLS.items():
        print("downloading", fn)
        urllib.request.urlretrieve(url, os.path.join(RAW, fn))


def raw(fn, **kw):
    return pd.read_csv(os.path.join(RAW, fn), **kw)


def country_table():
    c = raw("gm_countries.csv")
    c = c[c["is--country"].astype(str).str.upper() == "TRUE"].copy()
    c["short"] = c["name"].replace(NAME_FIX)
    return c


def save(df, fn):
    os.makedirs(OUT, exist_ok=True)
    df.to_csv(os.path.join(OUT, fn), float_format="%.6g")
    print(f"  wrote data/{fn}  {df.shape}")


def gapminder_wide(fn, col, c, y0, y1):
    d = raw(fn)
    d = d[(d.time >= y0) & (d.time <= y1)]
    w = d.pivot(index="time", columns="country", values=col)
    names = c.set_index("country")["short"]
    w = w[[k for k in w.columns if k in names.index]]
    w.columns = [names[k] for k in w.columns]
    w.index.name = "year"
    return w


def main():
    if "--download" in sys.argv:
        download()
    c = country_table()
    cc_ = c.dropna(subset=["iso3166_1_alpha3"])
    iso2name = dict(zip(cc_.iso3166_1_alpha3, cc_.short))

    # 1. GDP, current US$ (World Bank), countries only
    g = raw("gdp_wb.csv")
    g = g[g["Country Code"].isin(iso2name)]
    g["name"] = g["Country Code"].map(iso2name)
    gdp = g.pivot(index="Year", columns="name", values="Value")
    gdp.index.name = "year"
    save(gdp, "gdp_usd.csv")

    # 2-3. Gapminder population / life expectancy / child mortality
    save(gapminder_wide("gm_pop.csv", "pop", c, 1800, 2100), "population.csv")
    save(gapminder_wide("gm_lex.csv", "lex", c, 1800, 2023), "life_expectancy.csv")
    save(gapminder_wide("gm_u5mr.csv", "child_mortality_0_5_year_olds_dying_per_1000_born", c, 1800, 2023),
         "child_mortality.csv")

    # 4. Solar / wind electricity (OWID, from Ember + Energy Institute)
    e = raw("owid_energy.csv")
    world = e[e.country == "World"].set_index("year")
    ec = e[e.iso_code.isin(iso2name)].copy()
    ec["name"] = ec.iso_code.map(iso2name)
    for col, fn in [("solar_electricity", "solar_twh.csv"), ("wind_electricity", "wind_twh.csv")]:
        w = ec[ec.year >= 2000].pivot(index="year", columns="name", values=col)
        save(w, fn)
    share = world.loc[2000:, ["solar_share_elec", "wind_share_elec", "coal_share_elec",
                              "nuclear_share_elec", "hydro_share_elec", "gas_share_elec",
                              "solar_electricity", "wind_electricity"]]
    save(share, "world_electricity.csv")

    # 5. CO2 (OWID / Global Carbon Budget), million tonnes
    co = raw("owid_co2.csv")
    cc = co[co.iso_code.isin(iso2name)].copy()
    cc["name"] = cc.iso_code.map(iso2name)
    save(cc[cc.year >= 1850].pivot(index="year", columns="name", values="co2"), "co2_annual_mt.csv")
    last = int(cc.dropna(subset=["co2"]).year.max())
    summ = cc[cc.year == last].set_index("name")[["co2", "co2_per_capita", "cumulative_co2",
                                                   "share_global_cumulative_co2", "population"]]
    summ.index.name = "country"
    summ.attrs["year"] = last
    save(summ.sort_values("cumulative_co2", ascending=False), f"co2_summary_{last}.csv")
    wco = co[co.country == "World"].set_index("year").loc[1850:, ["co2", "cumulative_co2", "co2_per_capita"]]
    save(wco, "co2_world.csv")

    # 6. $100 invested: S&P 500 total return vs gold vs US prices (monthly)
    s = raw("sp500.csv", parse_dates=["Date"]).set_index("Date")
    price = s["SP500"]
    div = s["Dividend"].replace(0, np.nan)
    last_div = div.last_valid_index()
    # Shiller's dividend series stops in mid-2023; after that we assume a 1.3 % yield
    # (close to the S&P 500's actual trailing yield in 2023-2026).
    est = div.isna() & (div.index > last_div)
    div[est] = price[est] * 0.013
    tr = [1.0]
    for i in range(1, len(price)):
        tr.append(tr[-1] * (price.iloc[i] + div.iloc[i] / 12) / price.iloc[i - 1])
    tr = pd.Series(tr, index=price.index)

    cpi_s = s["Consumer Price Index"].replace(0, np.nan)
    cpi_u = raw("cpi_us.csv", parse_dates=["Date"]).set_index("Date")["Index"]
    # splice: Shiller CPI before 1913, official CPI-U from 1913 on (rescaled to match)
    k = cpi_s.loc["1913-01-01"] / cpi_u.loc["1913-01-01"]
    cpi = pd.concat([cpi_s[cpi_s.index < "1913-01-01"], cpi_u * k])

    gold = raw("gold_monthly.csv")
    gold["Date"] = pd.to_datetime(gold["Date"] + "-01")
    gold = gold.set_index("Date")["Price"]
    # The source quotes 22-carat "standard" gold before 1920 (~$18.9); the official US
    # fine-gold price was fixed at $20.67/oz from 1834 until 1933, so use that instead.
    gold[gold.index < "1920-01-01"] = 20.67

    idx = pd.date_range("1871-01-01", price.index.max(), freq="MS")
    m = pd.DataFrame({"sp500_total_return": tr.reindex(idx),
                      "gold_usd_oz": gold.reindex(idx).ffill(),
                      "us_cpi": cpi.reindex(idx).ffill(),
                      "dividend_estimated": est.reindex(idx).fillna(False).astype(int)})
    m.index.name = "date"
    m = m.dropna(subset=["sp500_total_return"])
    save(m, "stocks_gold_cpi_monthly.csv")

    # 7. Internet users (share of population x population)
    i = raw("sg_internet.csv")
    p = raw("gm_pop.csv").rename(columns={"country": "geo"})
    iu = i.merge(p, on=["geo", "time"])
    iu["users"] = iu["internet_users"] / 100 * iu["pop"]
    names = c.set_index("country")["short"]
    iu = iu[iu.geo.isin(names.index)]
    iu["name"] = iu.geo.map(names)
    w = iu[iu.time >= 1990].pivot(index="time", columns="name", values="users")
    w.index.name = "year"
    save(w, "internet_users.csv")
    pct = iu[iu.time >= 1990].pivot(index="time", columns="name", values="internet_users")
    pct.index.name = "year"
    save(pct, "internet_users_pct.csv")

    # 8. Rupees per US dollar, monthly, Aug 1947 - today
    #    1947-1972: official parities (rupee was tied to sterling): 3.3085 until the Sept 1949 sterling
    #    devaluation, 4.7619 until the 6 June 1966 devaluation, then 7.50. During 1972 (sterling floated)
    #    the rate is interpolated to the first Federal Reserve quote. From 1973: Federal Reserve noon rates.
    fx = raw("fx_daily.csv")
    fx = fx[fx.Country == "India"].dropna().copy()
    fx["Date"] = pd.to_datetime(fx["Date"])
    fed = fx.set_index("Date")["Exchange rate"]
    monthly = fed.resample("MS").mean()
    early = pd.Series(index=pd.date_range("1947-08-01", "1972-12-01", freq="MS"), dtype=float)
    early[early.index < "1949-10-01"] = 3.3085
    early[(early.index >= "1949-10-01") & (early.index < "1966-07-01")] = 4.7619
    early[(early.index >= "1966-07-01") & (early.index < "1972-01-01")] = 7.50
    early[early.index >= "1972-01-01"] = np.nan
    early["1972-12-01"] = np.nan
    s = pd.concat([early, monthly]).sort_index()
    s = s[~s.index.duplicated(keep="last")].interpolate()
    last_day = fed.index.max()
    s[last_day] = fed.iloc[-1]          # finish on the latest daily quote
    out = pd.DataFrame({"inr_per_usd": s.round(4)})
    out.index.name = "date"
    save(out, "usd_inr_monthly.csv")
    # 9. Global temperature (HadCRUT5 'GCAG' series in datasets/global-temp), re-based to 1850-1900
    gt = raw("gt_annual.csv")
    g = gt[gt.Source == "GCAG"].set_index("Year")["Mean"].sort_index()
    last_full = pd.Timestamp.today().year - 1
    g = g[g.index <= last_full]
    tdf = pd.DataFrame({"anomaly_vs_1850_1900": (g - g.loc[1850:1900].mean()).round(3)})
    tdf.index.name = "year"
    save(tdf, "global_temp_annual.csv")
    rec = fed.idxmax()
    with open(os.path.join(OUT, "usd_inr_notes.txt"), "w") as f:
        f.write(f"record_high_date={rec.date()}\nrecord_high={fed.max()}\nlast_date={last_day.date()}\n"
                f"last={fed.iloc[-1]}\n")


if __name__ == "__main__":
    main()
