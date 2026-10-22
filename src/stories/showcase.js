// A short story that shows every newer scene type, built from the data of
// the bundled examples (no extra data shipped).

import { BUNDLED_STORIES } from './bundled.js';

const ds = (story, id) => BUNDLED_STORIES.find((s) => s.id === story)?.datasets?.[id];

const pace = (start, end, dur, hold = 3) => ({ start, lead: 1, steps: [{ hold: 1 }, { to: end, dur }, { hold }] });

const CO2 = { type: 'piecewise', cases: [{ if: { gte: 1000 }, format: { type: 'fixed', digits: 1, divide: 1000, suffix: ' Gt' } }], else: { type: 'fixed', digits: 0, thousands: true, suffix: ' Mt' } };

export const SHOWCASE = {
  version: 1,
  id: 'showcase_new_scenes',
  fps: 30,
  theme: { name: 'midnight', brand: '' },
  credit: true,
  flags: true,
  meta: {
    title: 'Seven Ways to Watch the World Change | Datalapse scene showcase',
    shorts_title: 'Seven ways to watch the world change',
    description: 'A tour of Datalapse scene types: map race, bubble chart, stacked areas, bump chart, head to head, waffle and quiz. Data from the bundled examples.',
    sources: 'Our World in Data, Gapminder, World Bank, Ember',
    tags: ['data visualization', 'map', 'bubble chart'],
    hashtags: ['#dataviz'],
  },
  datasets: {
    co2: ds('v05_co2_emitters', 's2'),
    gdp: ds('v01_india_gdp_race', 's2'),
    life: ds('v03_life_expectancy', 's2'),
    pop: ds('v02_population_race', 's2'),
    mix: ds('v04_solar_explosion', 's3'),
    net: ds('v07_internet_race', 's2'),
  },
  scenes: [
    { type: 'hook', duration: 4.5, lines: [{ text: 'Seven ways to watch', size: 'small' }, { text: 'the world change.', size: 'big', color: '#FFB703' }] },
    {
      type: 'mapRace', data: 'co2', title: 'Who Burned the Most Fossil Fuel?', subtitle: 'Annual CO2 from fossil fuels and industry',
      source: 'Source: Our World in Data / Global Carbon Budget. Only the largest emitters are coloured.', valueFormat: CO2, highlight: 'India',
      pace: pace(1900, 2024, 16), captions: [{ year: 2006, kicker: '2006', text: 'China passes the USA as the largest emitter.', dur: 4 }],
    },
    {
      type: 'bubble', xData: 'gdp', yData: 'life', sizeData: 'pop', xLog: true, xLabel: 'Economy size (GDP, US$)', yLabel: 'Life expectancy (years)',
      xFormat: { type: 'tickMoney' }, yFormat: { type: 'fixed', digits: 0 }, sizeFormat: { type: 'count', suffix: ' people' }, highlight: 'India', labels: 6,
      title: 'Richer and Longer-Lived', subtitle: 'Bubble size: population', source: 'Sources: World Bank, Gapminder.', pace: pace(1960, 2023, 16), transition: 'crossfade',
    },
    {
      type: 'stackedArea', data: 'mix', percent: true, series: ['Coal', 'Gas', 'Nuclear', 'Hydro', 'Wind', 'Solar'], highlight: 'Solar',
      title: "The World's Electricity Mix", subtitle: 'Share of electricity by source', source: 'Source: Our World in Data (Ember, Energy Institute).',
      pace: pace(2000, 2025, 12), captions: [{ year: 2024, kicker: '2024', text: 'Wind and solar together make more than one-eighth of the world’s power.', dur: 4 }],
    },
    {
      type: 'bump', data: 'net', nBars: 8, highlight: 'India', title: 'Most Internet Users: The Ranking', subtitle: 'Place by number of people online',
      source: 'Source: Gapminder, based on ITU.', pace: pace(1995, 2024, 14), transition: 'slide',
    },
    {
      type: 'versus', data: 'pop', left: 'India', right: 'China', title: 'India vs China', subtitle: 'Population, 1950 to 2100 (projected after 2023)',
      source: 'Source: Gapminder, based on UN World Population Prospects.', valueFormat: { type: 'count' }, pace: pace(1950, 2100, 14),
      spotlight: [], camera: [],
    },
    { type: 'waffle', data: 'mix', year: 2024, series: ['Coal', 'Gas', 'Hydro', 'Nuclear', 'Wind', 'Solar'], title: 'Out of Every 100 Units of Power (2024)', subtitle: 'From these six sources', source: 'Source: Our World in Data (Ember).', duration: 7 },
    { type: 'quiz', question: 'Which country had the most internet users in 2024?', options: ['USA', 'India', 'China', 'Indonesia'], answer: 2, explain: 'China, with more than a billion people online. India is second.', think: 4, duration: 9 },
    { type: 'outro', question: 'Which scene should your story start with?', sources: 'Our World in Data, Gapminder, World Bank, Ember', duration: 6 },
  ],
};
