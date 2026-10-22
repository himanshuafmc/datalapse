# Story Spec

A story is one JSON file. It holds the data, the scenes in order, the look, the languages and the soundtrack settings. The studio edits it for you; you can also write it by hand, keep it in Git, or have an AI write it (the studio's **Ask your AI** button builds the prompt).

`src/spec/validate.js` is the authority: it checks every rule below and explains problems in plain words. The same file renders the same video everywhere; its **fingerprint** (`dl1-` plus 12 hex digits of the SHA-256 of the story, keys sorted) is printed in the YouTube text so anyone can check they have the exact story.

## Top level

```json
{
  "version": 1,
  "id": "india_gdp_race",
  "fps": 30,
  "theme": { "name": "midnight", "brand": "MY CHANNEL", "overrides": { "accent": "#FFB703" }, "logo": "data:image/png;base64,..." },
  "credit": true,
  "colors": { "India": "#FF9933" },
  "palette": "colorblind",
  "flags": true,
  "images": { "Apple": "data:image/png;base64,..." },
  "stamp": false,
  "meta": { "title": "...", "shorts_title": "...", "description": "...", "sources": "...", "sources_long": "...",
            "hashtags": ["#dataviz"], "tags": ["bar chart race"], "pinned_comment": "...", "thumbnail": "3 words" },
  "datasets": { "gdp": { "index": [1960, 1961], "columns": ["India", "China"], "values": [[37.0, 39.2], [59.7, 50.1]] } },
  "translations": { "hi": { "strings": { "scenes.2.title": "..." }, "names": { "Apple": "एप्पल" }, "countryNames": true } },
  "audio": { "music": { "id": "...", "volume": 0.7 }, "narration": { "clips": [] } },
  "scenes": [ { "type": "title", "title": "..." } ]
}
```

| Field | Meaning |
|---|---|
| `fps` | 24, 25, 30 or 60. Default 30. |
| `theme.name` | `midnight` (the original look), `ink` (pure black), `paper` (daylight). |
| `theme.brand` | Channel name in the corner of chart scenes and on the outro. `""` or left out hides it. |
| `theme.logo` | Channel logo (an image as a `data:` URL), shown beside the channel name. |
| `theme.overrides` | Replace any theme colour: `bg_top`, `bg_bot`, `text`, `muted`, `grid`, `accent`, `panel`, `red`, `green`, `subscribe`. |
| `credit` | `true` adds a small "Made with Datalapse" line to the outro. |
| `colors` | Colour per entity name, for every scene. Unknown names get a stable colour from their name. |
| `palette` | `"colorblind"`: entities get the Okabe-Ito and Tol colours, readable with common colour-vision differences. |
| `flags` | `true` puts flags beside country names (also per scene). Other names use `images`. |
| `images` | Pictures (logos) per entity, as `data:` URLs. |
| `stamp` | `true` prints the story fingerprint small on the closing card. |
| `meta` | YouTube title, description, tags; `thumbnail` is the preferred thumbnail text. |
| `translations` | Other languages: replacement strings by path, names, and `countryNames` (country names translate automatically unless `false`). |
| `audio` | Music (`id`, `name`, `volume`, `offset`, `fadeIn`, `fadeOut`, `loop`, `bpm`, `beats`) and narration (`clips: [{ "id", "scene", "caption" or "at" }]`, `duck`, `pauseRace`). The audio itself stays in the browser that added it; the story keeps only ids. |

## Datasets

Column-major tables: `values[j][k]` is column `j` at `index[k]`. `null` means no data (the bar is hidden; lines break; the map shows "no data"). `index` is usually years; months are fractional years (`2020.25` is April 2020, i.e. `year + (month - 1) / 12`).

## Pace

Chart scenes move through time with a pace: video seconds mapped to data time.

```json
{ "start": 1960, "lead": 1.0, "steps": [ { "hold": 4.5 }, { "to": 1991, "dur": 12 }, { "hold": 2 }, { "to": 2023, "dur": 14 }, { "hold": 4 } ] }
```

`lead` holds the first year before anything moves (default 0.8 s). `hold` pauses; `to` travels to a year over `dur` seconds. Motion is eased and smoothed, so steps blend. The scene lasts as long as its pace.

## Captions

Lower-third captions on chart scenes appear when the data reaches `year`:

```json
{ "year": 1991, "kicker": "1991", "text": "Balance-of-payments crisis. India opens up.", "dur": 5, "chapter": "1991 reforms" }
```

`growBars` and `waffle` captions use `at` (seconds into the scene) instead of `year`. A `chapter` adds a YouTube chapter mark at that moment.

## Number formats

| Spec | Example |
|---|---|
| `{ "type": "money" }` | `$3.70T`, `$812B`, `$37.0B` (3 significant figures) |
| `{ "type": "tickMoney" }` | `$3.7T` (axis labels) |
| `{ "type": "count" }` | `1.43 B`, `68.2 M` |
| `{ "type": "tickCount" }` | `1.4B` |
| `{ "type": "indian" }` | `₹4.20 lakh cr`, `₹12.3 lakh` (Hindi and Marathi videos use the Hindi words) |
| `{ "type": "tickIndian" }` | `₹4 lakh cr` |
| `{ "type": "dollarsFull" }` | `$1.2 million` |
| `{ "type": "fixed", "digits": 1, "thousands": true, "prefix": "", "suffix": " yrs", "divide": 1000, "strip": false }` | `72.4 yrs` |
| `{ "type": "general", "precision": 6 }` | Python's `:g` |
| `{ "type": "piecewise", "cases": [ { "if": { "lt": 1 }, "text": "<1" }, { "if": { "gte": 1000 }, "format": {...} } ], "else": {...} }` | conditions: `lt`, `lte`, `gt`, `gte`, `eq`, `absGte` |

Any format also takes `prefix`, `suffix`, `replace` (a list of `[from, to]` pairs) and `numerals: "deva"` (Devanagari digits). Numbers round exactly as Python does (ties to even), so labels match the original engine.

## Settings every scene takes

| Field | Meaning |
|---|---|
| `chapter` | YouTube chapter title at the start of the scene. |
| `duration` | Seconds, for scenes without a pace. |
| `transition` | How the scene enters: `"crossfade"`, `"slide"`, `"zoom"` or `"cut"` (standard soft cut), or `{ "type": "crossfade", "dur": 0.8 }`. |
| `camera` | Camera moves: `[{ "at": 6, "zoom": 1.6, "x": 0.35, "y": 0.55, "dur": 1.2 }]`. `at` is seconds into the scene, `x`/`y` the point to move towards (fractions of the frame from the bottom left), `zoom` 1 to 4. Titles, captions and the channel name stay still; the chart moves. Add `{ "at": 12, "zoom": 1 }` to pull back. |
| `flags` | Flags and pictures for this scene only. |
| `yearLabel` | `"year"` (2023) or `"month"` (Mar 2023) for the date on screen. |

## Scenes

### `hook`
Opening lines over drifting lines. `lines: [{ "text", "size": "big"|"small", "color" }]`, `duration` (5.5), `stagger` (0.9 s between lines).

### `title`
`title`, `subtitle`, `span` (e.g. `"1960 – 2023"`), `duration` (3.2).

### `barRace`
`data`, `pace`, `title`, `subtitle`, `source`, `valueFormat`, `tickFormat`, `highlight` (drawn brighter with its rank), `pin` (always on screen in a reserved slot with its true rank), `nBars` (default 10; 8 in 1:1, 9 in 4:5), `minFrac` (bars shorter than this share of the axis are hidden; default 0.003), `colors`, `captions`, `notes` (`[{ "after": 2023.5, "text": "UN projection" }]`), `counter` (`{ "data", "column", "prefix", "format" }`, a running total under the year), `spotlight` (`[{ "entity": "India", "from": 1991, "to": 1996 }]` dims the other bars between those years).

### `lineRace`
`data`, `pace`, `series` (columns to draw; default all), `title`, `subtitle`, `source`, `valueFormat`, `yTickFormat`, `labelFormat`, `highlight`, `log`, `yRange` (`[low, high]`, otherwise it grows with the data), `xRange`, `xMode` (`"fixed"` or `"grow"`), `minSpan`, `markers` (`[{ "x": 1947, "label": "Independence" }]`), `display` (rename series on screen), `lw` (line width in points), `captions`, `spotlight`.

### `mapRace`
A world map coloured by value as the years pass, with the leaders listed. `data` (columns are countries; names or ISO codes), `pace`, `title`, `subtitle`, `source`, `valueFormat`, `scale` (`"auto"`, `"linear"`, `"log"`; auto uses log when values span more than three powers of ten), `top` (leaders listed, default 5; 3 in 1:1), `highlight` (outlined and labelled), `lowColor`/`highColor` (otherwise a colour-blind-safe viridis ramp, or blues on the daylight theme), `captions`. Outlines: Natural Earth 1:110m.

### `bubble`
Moving bubbles, Rosling style. `xData`, `yData` and optional `sizeData` (datasets sharing column names; each column is a bubble), `pace`, `xLabel`, `yLabel`, `xLog`, `yLog`, `xFormat`, `yFormat`, `sizeFormat`, `xRange`/`yRange`, `series` (limit the bubbles), `highlight` (leaves a trail), `labels` (how many of the biggest bubbles get names, default 6), `colorBy` (`"continent"` or `"entity"`), `trail`, `captions`.

### `stackedArea`
Layers stacked through time. `data`, `pace`, `series` (bottom first; default all), `percent` (shares of 100%), `highlight`, `valueFormat`, `yTickFormat`, `colors`, `captions`.

### `bump`
Who held which place, year by year. `data`, `pace`, `nBars` (places shown, default 8), `highlight`, `valueFormat` (optional: values next to the names), `colors`, `captions`.

### `versus`
Head to head. `data`, `left`, `right` (two columns), `pace`, `valueFormat`, `title`, `subtitle`, `source`, `colors`, `flags`, `captions`. Shows both numbers, who leads and by how much, and both lines underneath.

### `dotGrid`
A 10 × 10 grid of dots, "N out of 100". `data`, `column`, `pace`, `scale` (divide values first), `title`, `subtitle`, `source`, `smallText`, `bigFormat`, `badColor`, `goodColor`, `captions`.

### `waffle`
100 squares split between up to 8 categories. Either `items: [{ "name", "value", "color" }]`, or `data` with `year` (and optional `series`) to take the values from a dataset. `title`, `subtitle`, `source`, `valueFormat` (optional values in the key), `duration` (8), `stagger` (0.02 s between squares), `captions` (with `at`).

### `growBars`
A few bars growing one after another. `items: [{ "name", "value" }]`, `title`, `subtitle`, `source`, `valueFormat`, `highlight`, `duration` (9), `stagger` (0.25), `captions` (with `at`).

### `statCards`
Up to four big numbers. `heading`, `cards: [{ "big", "small", "color" }]`, `footer`, `duration` (8).

### `quiz`
A question with 2 to 4 answers, a countdown, then the reveal. `question`, `options` (list of text), `answer` (number of the right option, from 0), `explain` (shown after the reveal), `think` (seconds of countdown, 4), `duration` (9).

### `outro`
`question`, `cta` ("Tell us in the comments"), `button` ("SUBSCRIBE"), `sources`, `duration` (6.5).

## Translations

Every on-screen and YouTube string has a path (`meta.title`, `scenes.2.title`, `scenes.2.captions.0.text`, `scenes.7.options.1`...). A translation replaces strings by path; anything missing stays in the original language. `names` translates entity names; country names translate automatically into 18 languages. Hindi and Marathi switch Indian number words (`lakh`, `crore`) to Devanagari.

## Adding a scene type

See [AGENTS.md](../AGENTS.md): one file in `src/scenes/` (a class with `static type`, `label`, `defaults`, optional `static paced = true` and `static validate()`), registered in `src/scenes/registry.js`, and a field list in `src/app/inspector.js`. Scenes can add `describe(i)` to speak for themselves in the audio description track.
