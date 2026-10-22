// Build src/data/countries.js: ISO codes, the many names datasets use for
// each country, continent, and names in other languages (for translated
// videos). Sources (MIT): i18n-iso-countries, countries-list.
//   node tools/build_countries.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const iso = require('i18n-iso-countries');
const { countries: CL } = require('countries-list');

const LANGS = ['hi', 'bn', 'mr', 'ta', 'ml', 'ur', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'ja', 'zh', 'id', 'tr', 'vi'];
const en = require('i18n-iso-countries/langs/en.json').countries;
const langNames = Object.fromEntries(LANGS.map((l) => [l, require(`i18n-iso-countries/langs/${l}.json`).countries]));

// Names used by the World Bank, Our World in Data, Gapminder, the UN and the IMF.
const EXTRA = {
  US: ['United States', 'U.S.', 'America'], GB: ['United Kingdom', 'UK', 'Britain', 'U.K.'], KR: ['South Korea', 'Korea, Rep.', 'Korea (Rep.)', 'Korea'],
  KP: ['North Korea', "Korea, Dem. People's Rep.", 'Korea, DPR'], RU: ['Russia', 'Russian Federation'], IR: ['Iran', 'Iran, Islamic Rep.'],
  EG: ['Egypt', 'Egypt, Arab Rep.'], VE: ['Venezuela', 'Venezuela, RB'], YE: ['Yemen', 'Yemen, Rep.'], SY: ['Syria', 'Syrian Arab Republic'],
  LA: ['Laos', 'Lao PDR', 'Lao'], VN: ['Vietnam', 'Viet Nam'], CZ: ['Czechia', 'Czech Republic'], SK: ['Slovakia', 'Slovak Republic'],
  KG: ['Kyrgyzstan', 'Kyrgyz Republic'], TR: ['Turkey', 'Turkiye', 'Türkiye'], CD: ['DR Congo', 'Congo, Dem. Rep.', 'Democratic Republic of Congo', 'Congo (Kinshasa)'],
  CG: ['Congo', 'Congo, Rep.', 'Republic of the Congo', 'Congo (Brazzaville)'], CI: ["Cote d'Ivoire", 'Ivory Coast'], GM: ['Gambia', 'Gambia, The'],
  BS: ['Bahamas', 'Bahamas, The'], HK: ['Hong Kong', 'Hong Kong SAR, China', 'Hong Kong, China'], MO: ['Macao', 'Macau', 'Macao SAR, China'],
  TW: ['Taiwan', 'Taiwan, China', 'Chinese Taipei'], PS: ['Palestine', 'West Bank and Gaza', 'Palestinian Territories'], TL: ['East Timor', 'Timor-Leste'],
  FM: ['Micronesia', 'Micronesia (country)', 'Micronesia, Fed. Sts.'], MK: ['North Macedonia', 'Macedonia', 'Macedonia, FYR'], SZ: ['Eswatini', 'Swaziland'],
  CV: ['Cape Verde', 'Cabo Verde'], MM: ['Myanmar', 'Burma'], BN: ['Brunei', 'Brunei Darussalam'], BO: ['Bolivia'], TZ: ['Tanzania'], MD: ['Moldova'],
  LC: ['St. Lucia', 'Saint Lucia'], VC: ['St. Vincent and the Grenadines', 'Saint Vincent and the Grenadines'], KN: ['St. Kitts and Nevis', 'Saint Kitts and Nevis'],
  VA: ['Vatican', 'Holy See'], ST: ['Sao Tome and Principe'], CW: ['Curacao'], XK: ['Kosovo'], SA: ['Saudi Arabia'], AE: ['UAE', 'United Arab Emirates'],
  DE: ['Germany', 'West Germany'], NL: ['Netherlands', 'Holland'], CN: ['China', "China, People's Republic of"], IN: ['India', 'Bharat'],
};

const AGGREGATES = [
  'World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica', 'European Union', 'European Union (27)', 'EU', 'EU-27', 'EU27',
  'Euro area', 'Arab World', 'Sub-Saharan Africa', 'East Asia & Pacific', 'Europe & Central Asia', 'Latin America & Caribbean', 'Middle East & North Africa',
  'South Asia', 'High income', 'Low income', 'Lower middle income', 'Upper middle income', 'Middle income', 'Low & middle income',
  'High-income countries', 'Low-income countries', 'Lower-middle-income countries', 'Upper-middle-income countries', 'OECD members', 'OECD',
  'Non-OECD', 'OPEC', 'G7', 'G20', 'Least developed countries', 'Least developed countries: UN classification', 'Fragile and conflict affected situations',
  'Heavily indebted poor countries (HIPC)', 'IDA total', 'IBRD only', 'IDA only', 'IDA blend', 'Small states', 'Other small states', 'Pacific island small states',
  'Caribbean small states', 'Post-demographic dividend', 'Pre-demographic dividend', 'Early-demographic dividend', 'Late-demographic dividend',
  'International transport', 'Kuwaiti Oil Fires', 'Asia (excl. China and India)', 'Europe (excl. EU-27)', 'North America (excl. USA)', 'Africa (GCP)',
  'Asia (GCP)', 'Europe (GCP)', 'Oceania (GCP)', 'Middle East (GCP)', 'Central America (GCP)', 'International aviation', 'International shipping', 'Others',
];

// Short names for video labels where the library's name is long.
const SHORT = {
  hi: { US: 'अमेरिका', AE: 'यूएई', CD: 'कांगो (डीआर)', GB: 'ब्रिटेन', KR: 'दक्षिण कोरिया' },
  fr: { US: 'États-Unis', CD: 'RD Congo', AE: 'Émirats arabes unis' }, it: { US: 'Stati Uniti', CD: 'RD del Congo' },
  bn: { GB: 'যুক্তরাজ্য', KR: 'দক্ষিণ কোরিয়া', KP: 'উত্তর কোরিয়া', CD: 'ডিআর কঙ্গো' }, ur: { US: 'امریکہ', IR: 'ایران', CD: 'کانگو' },
  es: { KR: 'Corea del Sur', KP: 'Corea del Norte', CD: 'RD del Congo' }, ml: { US: 'അമേരിക്ക' }, vi: { AE: 'UAE', US: 'Mỹ' },
  de: { US: 'USA', GB: 'Großbritannien', RU: 'Russland' },
};

const rows = [];
for (const a2 of Object.keys(en).sort()) {
  const names = [en[a2]].flat();
  const cl = CL[a2];
  const extra = EXTRA[a2] ?? [];
  const primary = extra[0] ?? (cl?.name || names[0]);
  const all = [...new Set([primary, ...names, ...extra, cl?.name, cl?.native].filter(Boolean))];
  const local = {};
  for (const l of LANGS) {
    const v = langNames[l][a2];
    if (SHORT[l]?.[a2]) local[l] = SHORT[l][a2];
    else if (v) local[l] = Array.isArray(v) ? v.reduce((a, b) => (b.length < a.length ? b : a)) : v;
  }
  rows.push([a2, iso.alpha2ToAlpha3(a2) ?? '', iso.alpha2ToNumeric(a2) ?? '', cl?.continent ?? '', all, local]);
}
// Kosovo is not in ISO 3166 but is in most datasets.
if (!rows.some((r) => r[0] === 'XK')) rows.push(['XK', 'XKX', '', 'EU', ['Kosovo'], { hi: 'कोसोवो', es: 'Kosovo', fr: 'Kosovo' }]);

const out = `// Generated by tools/build_countries.mjs from i18n-iso-countries and countries-list (MIT).
// [alpha2, alpha3, numeric, continent, names (first = display), { lang: name }]
export const COUNTRY_ROWS = ${JSON.stringify(rows)};
export const AGGREGATE_NAMES = ${JSON.stringify(AGGREGATES)};
export const CONTINENT_NAMES = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' };
export const LANGS = ${JSON.stringify(LANGS)};
`;
writeFileSync(join(ROOT, 'src/data/countryData.js'), out);
console.log(`src/data/countryData.js: ${rows.length} countries, ${(out.length / 1024).toFixed(0)} KB`);
void readFileSync;
