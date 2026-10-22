// One story, many languages. A translation is a set of replacement strings
// keyed by their path in the story, plus names for entities:
//
//   "translations": { "hi": { "strings": { "scenes.2.title": "..." }, "names": { "China": "चीन" }, "countryNames": true } }
//
// Country names translate automatically (countryNames, default true) unless
// a name is given explicitly.

import { countryName } from '../data/countries.js';

export const LANGUAGES = [
  ['hi', 'Hindi', 'हिन्दी'], ['mr', 'Marathi', 'मराठी'], ['bn', 'Bengali', 'বাংলা'], ['ta', 'Tamil', 'தமிழ்'], ['te', 'Telugu', 'తెలుగు'],
  ['gu', 'Gujarati', 'ગુજરાતી'], ['kn', 'Kannada', 'ಕನ್ನಡ'], ['ml', 'Malayalam', 'മലയാളം'], ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'], ['ur', 'Urdu', 'اردو'],
  ['es', 'Spanish', 'Español'], ['fr', 'French', 'Français'], ['de', 'German', 'Deutsch'], ['pt', 'Portuguese', 'Português'], ['it', 'Italian', 'Italiano'],
  ['ru', 'Russian', 'Русский'], ['ar', 'Arabic', 'العربية'], ['ja', 'Japanese', '日本語'], ['zh', 'Chinese', '中文'], ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['tr', 'Turkish', 'Türkçe'], ['vi', 'Vietnamese', 'Tiếng Việt'],
];

/** Languages whose script is embedded in the app (others use the viewer's system fonts). */
export const EMBEDDED_SCRIPTS = new Set(['en', 'hi', 'mr', 'es', 'fr', 'de', 'pt', 'it', 'id', 'tr', 'vi']);

export function languageLabel(code) {
  const l = LANGUAGES.find((x) => x[0] === code);
  return l ? `${l[1]} (${l[2]})` : code;
}

const SCENE_TEXT = ['title', 'subtitle', 'source', 'span', 'heading', 'footer', 'question', 'cta', 'button', 'sources', 'smallText', 'chapter', 'xLabel', 'yLabel', 'explain'];
const META_TEXT = ['title', 'shorts_title', 'description', 'pinned_comment'];

/** Every piece of on-screen (and YouTube) text, with its path. */
export function translatableStrings(spec) {
  const out = [];
  const add = (path, text, where) => {
    if (typeof text === 'string' && text.trim()) out.push({ path, text, where });
  };
  for (const k of META_TEXT) add(`meta.${k}`, spec.meta?.[k], 'YouTube');
  (spec.scenes ?? []).forEach((s, i) => {
    const where = `Scene ${i + 1}`;
    for (const k of SCENE_TEXT) add(`scenes.${i}.${k}`, s[k], where);
    (s.lines ?? []).forEach((ln, j) => add(`scenes.${i}.lines.${j}.text`, ln?.text, where));
    (s.captions ?? []).forEach((c, j) => {
      add(`scenes.${i}.captions.${j}.kicker`, c?.kicker, where);
      add(`scenes.${i}.captions.${j}.text`, c?.text, where);
    });
    (s.cards ?? []).forEach((c, j) => {
      if (Array.isArray(c)) {
        add(`scenes.${i}.cards.${j}.0`, c[0], where);
        add(`scenes.${i}.cards.${j}.1`, c[1], where);
      } else {
        add(`scenes.${i}.cards.${j}.big`, c?.big, where);
        add(`scenes.${i}.cards.${j}.small`, c?.small, where);
      }
    });
    (s.markers ?? []).forEach((m, j) => add(Array.isArray(m) ? `scenes.${i}.markers.${j}.1` : `scenes.${i}.markers.${j}.label`, Array.isArray(m) ? m[1] : m?.label, where));
    (s.notes ?? []).forEach((n, j) => add(`scenes.${i}.notes.${j}.text`, n?.text, where));
    if (s.counter?.prefix) add(`scenes.${i}.counter.prefix`, s.counter.prefix, where);
    (s.options ?? []).forEach((o, j) => add(`scenes.${i}.options.${j}`, o, where));
  });
  return out;
}

/** Every entity name shown on screen (columns of datasets used by scenes, bar names). */
export function entityNames(spec) {
  const names = new Set();
  for (const s of spec.scenes ?? []) {
    const ds = spec.datasets?.[s.data ?? s.xData];
    if (ds) for (const c of s.series?.length ? s.series : ds.columns) names.add(c);
    for (const it of s.items ?? []) names.add(Array.isArray(it) ? it[0] : it?.name);
    if (s.left) names.add(s.left);
    if (s.right) names.add(s.right);
  }
  names.delete(undefined);
  return [...names];
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let k = 0; k < keys.length - 1; k++) {
    if (o == null || typeof o !== 'object') return false;
    o = o[keys[k]];
  }
  if (o == null || typeof o !== 'object') return false;
  const last = keys[keys.length - 1];
  if (!(last in o)) return false;
  o[last] = value;
  return true;
}

/** A copy of the story in `lang` (strings replaced; names resolved by Video). */
export function applyTranslation(spec, lang) {
  if (!lang || lang === 'en') return spec;
  const tr = spec.translations?.[lang];
  const out = JSON.parse(JSON.stringify({ ...spec, datasets: undefined }));
  out.datasets = spec.datasets;
  if (tr?.strings) for (const [path, text] of Object.entries(tr.strings)) if (text) setPath(out, path, text);
  if (lang === 'hi' || lang === 'mr') {
    for (const s of out.scenes ?? []) {
      for (const k of ['valueFormat', 'tickFormat', 'yTickFormat', 'bigFormat', 'labelFormat']) {
        const f = s[k];
        if (f && (f.type === 'indian' || f.type === 'tickIndian') && !f.lang) s[k] = { ...f, lang };
      }
    }
  }
  out.language = lang;
  return out;
}

/** How an entity name is shown in `lang`. */
export function nameIn(spec, lang, name) {
  if (!lang || lang === 'en') return name;
  const tr = spec.translations?.[lang];
  if (tr?.names?.[name]) return tr.names[name];
  if (tr?.countryNames === false) return name;
  return countryName(name, lang) ?? name;
}

/** Share of strings translated, 0..1. */
export function translationProgress(spec, lang) {
  const all = translatableStrings(spec);
  if (!all.length) return 1;
  const tr = spec.translations?.[lang]?.strings ?? {};
  return all.filter((s) => tr[s.path]).length / all.length;
}

/** A prompt asking an AI to translate every string, returning JSON. */
export function translationPrompt(spec, lang) {
  const items = Object.fromEntries(translatableStrings(spec).map((s) => [s.path, s.text]));
  const names = entityNames(spec).filter((n) => !countryName(n, lang));
  return [
    `Translate this data-documentary video script into ${languageLabel(lang)}.`,
    'Keep it short and natural for on-screen text (titles under 50 characters, captions under 110). Keep numbers, years, currency signs and units exactly as they are.',
    'Reply with ONLY a JSON object: { "strings": { <same keys>: <translation> }, "names": { <name>: <translation> } }. No commentary.',
    '',
    'STRINGS:',
    JSON.stringify(items, null, 1),
    '',
    names.length ? `NAMES (translate only if they are normally translated; otherwise repeat them):\n${JSON.stringify(names)}` : 'NAMES: []',
  ].join('\n');
}

/** Words the scenes print themselves, per language. */
const FIXED = {
  hi: { data: 'डेटा: ', cta: 'कमेंट में बताइए', button: 'सब्सक्राइब करें', credit: 'Datalapse से बनाया गया', quiz: 'प्रश्न' },
  mr: { data: 'डेटा: ', cta: 'कमेंटमध्ये सांगा', button: 'सबस्क्राइब करा', credit: 'Datalapse ने बनवले', quiz: 'प्रश्न' },
  bn: { data: 'তথ্য: ', cta: 'কমেন্টে জানান', button: 'সাবস্ক্রাইব করুন' },
  ta: { data: 'தரவு: ', cta: 'கமெண்டில் சொல்லுங்கள்', button: 'சப்ஸ்கிரைப்' },
  es: { data: 'Datos: ', cta: 'Cuéntanos en los comentarios', button: 'SUSCRÍBETE', credit: 'Hecho con Datalapse' },
  fr: { data: 'Données : ', cta: 'Dites-le-nous en commentaire', button: "S'ABONNER", credit: 'Fait avec Datalapse' },
  de: { data: 'Daten: ', cta: 'Schreib es in die Kommentare', button: 'ABONNIEREN', credit: 'Erstellt mit Datalapse' },
  pt: { data: 'Dados: ', cta: 'Conte nos comentários', button: 'INSCREVA-SE', credit: 'Feito com Datalapse' },
};

export function fixedText(lang, key, fallback) {
  return (lang && FIXED[lang]?.[key]) ?? fallback;
}
