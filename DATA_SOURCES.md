# Data sources

The example stories use public datasets, prepared by `reference/python/tools/prepare_data.py` into the CSVs in `reference/python/data`. When you publish a video made from them, keep the on-screen source line and credit the source in your description.

Licence terms below are as published by each source at the time of writing. They can change, and this is not legal advice: check the source's own terms before commercial use.

| Story | Source | Licence |
|---|---|---|
| India's GDP climb (`v01`) | World Bank, World Development Indicators: GDP (current US$), NY.GDP.MKTP.CD, via [datasets/gdp](https://github.com/datasets/gdp) | CC BY 4.0 (World Bank open data) |
| World population (`v02`) | Gapminder Population v8, based on UN World Population Prospects, via [open-numbers/ddf--gapminder--fasttrack](https://github.com/open-numbers/ddf--gapminder--fasttrack) | CC BY 4.0 (Gapminder) |
| Life expectancy (`v03`) | Gapminder Life Expectancy v15 and Child Mortality v12, same repository | CC BY 4.0 (Gapminder) |
| Solar power (`v04`) | Our World in Data energy dataset ([owid/energy-data](https://github.com/owid/energy-data)), based on Ember and the Energy Institute Statistical Review of World Energy | CC BY 4.0 for OWID's work; the Energy Institute's data carries its own terms, see the OWID repository |
| CO₂ emitters (`v05`) | Our World in Data CO₂ dataset ([owid/co2-data](https://github.com/owid/co2-data)), based on the Global Carbon Budget | CC BY 4.0 |
| Stocks vs gold (`v06`) | Robert Shiller's S&P 500 data via [datasets/s-and-p-500](https://github.com/datasets/s-and-p-500), extended with FRED prices; gold prices via [datasets/gold-prices](https://github.com/datasets/gold-prices) (Timothy Green's historical table, World Bank Pink Sheet); US CPI-U from the BLS via [datasets/cpi-us](https://github.com/datasets/cpi-us). Dividends after mid-2023 estimated at a 1.3% yield. | Shiller's data is published freely for research; no explicit licence. World Bank: CC BY 4.0. BLS: US government work, public domain. **Check before commercial use.** |
| Internet users (`v07`) | Gapminder Systema Globalis, internet users (% of population, from ITU) × Gapminder population ([open-numbers/ddf--gapminder--systema_globalis](https://github.com/open-numbers/ddf--gapminder--systema_globalis)) | CC BY 4.0 (Gapminder); ITU's original data has its own terms |

The "Try sample data" button in the CSV importer uses the CO₂ dataset from story `v05`. The scene showcase (`src/stories/showcase.js`) reuses the data of the stories above.

## Built-in reference data

| What | Used for | Source | Licence |
|---|---|---|---|
| Population by country, 1950–2050 | Data doctor: "per person" | Gapminder population v8 (UN World Population Prospects projections) | CC BY 4.0 |
| US consumer prices, annual | Data doctor: "adjust for inflation" | BLS CPI-U from 1913 (public domain); Robert Shiller's series before 1913 | BLS: public domain; Shiller: published freely for research |
| Country outlines | Map race | Natural Earth 1:110m via [world-atlas](https://github.com/topojson/world-atlas) | Natural Earth: public domain; world-atlas: ISC |
| Flags | Flags on bars and labels | [flag-icons](https://github.com/lipis/flag-icons) | MIT |
| Country names in 18 languages | Translated videos | [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries), [countries-list](https://github.com/annexare/Countries) | MIT |

## Public data catalogue (optional, online)

When a person turns it on, the CSV importer can download indicators directly from these sources. Datalapse does not host or redistribute the data; each download comes from the source, and the source line is filled in for you.

| Source | Licence of the data |
|---|---|
| [World Bank open data](https://data.worldbank.org) (`api.worldbank.org`) | CC BY 4.0 for most indicators; some come from third parties with their own terms (shown on each indicator's page) |
| [Our World in Data](https://ourworldindata.org) grapher downloads | CC BY 4.0 for OWID's work; underlying data may carry the original producer's terms (listed on each chart) |
| [Gapminder](https://www.gapminder.org/data/) Systema Globalis, via [open-numbers](https://github.com/open-numbers/ddf--gapminder--systema_globalis) on GitHub | CC BY 4.0 |

## AI voice (optional, online)

[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache 2.0), run in the browser with [kokoro-js](https://github.com/hexgrad/kokoro) (Apache 2.0), downloaded from jsDelivr and Hugging Face only when a person turns the voice on. Voices are synthetic; the YouTube text says so.

## Fonts and code

Poppins (Indian Type Foundry, SIL Open Font License 1.1, including its Devanagari glyphs) and Roboto (Google, Apache License 2.0) are embedded as subsets. Licence texts for the fonts and the bundled libraries (mp4-muxer, webm-muxer, gifenc, flag-icons, world-atlas) are in [licenses/](licenses/).
