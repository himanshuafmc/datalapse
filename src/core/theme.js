// Colours and themes. "midnight" is the look of the original Python engine.

export const THEMES = {
  midnight: {
    label: 'Midnight',
    bg_top: '#0A0F1F', bg_bot: '#151D36', glow: [0.03, 0.04, 0.08],
    text: '#F4F6FB', muted: '#8D97AE', grid: '#27314D', accent: '#FFB703',
    panel: '#1A2342', red: '#FF4D5E', green: '#2EC4B6', subscribe: '#FF0033',
  },
  ink: {
    label: 'Pure black',
    bg_top: '#000000', bg_bot: '#0B0B0F', glow: [0.02, 0.02, 0.03],
    text: '#FFFFFF', muted: '#9AA0AE', grid: '#24262E', accent: '#FFD166',
    panel: '#16181F', red: '#FF5A6B', green: '#3DDBC6', subscribe: '#FF0033',
  },
  paper: {
    label: 'Daylight',
    bg_top: '#FBFAF7', bg_bot: '#EEF0F5', glow: [-0.02, -0.01, 0.0],
    text: '#141A2E', muted: '#5E6780', grid: '#D9DDE7', accent: '#C2410C',
    panel: '#FFFFFF', red: '#D62839', green: '#0F8B7E', subscribe: '#E00030',
  },
};

// New stories carry no channel name until the creator sets one.
export const DEFAULT_BRAND = '';

export function makeTheme(name = 'midnight', overrides = {}) {
  const base = THEMES[name] ?? THEMES.midnight;
  return { ...base, ...overrides, brand: overrides.brand ?? DEFAULT_BRAND };
}

export const COLORS = {
  India: '#FF9933', China: '#EF3B3B', USA: '#3D8BFF', Japan: '#FF5DA2',
  Germany: '#FFD23F', UK: '#9B6BFF', France: '#39C6F4', Italy: '#2DC76D',
  Brazil: '#11D3A0', Russia: '#B8C4D6', Canada: '#FF7A7A', Spain: '#F4A261',
  Mexico: '#A77BFF', 'South Korea': '#00B4D8', Australia: '#F15BB5',
  Netherlands: '#FF8C42', Indonesia: '#E76F51', Pakistan: '#3FB950',
  Nigeria: '#9BE38B', Bangladesh: '#2A9D8F', Ethiopia: '#C3E86B',
  'DR Congo': '#5ED3F3', Iran: '#C08497', 'Saudi Arabia': '#52B788',
  Turkey: '#E07A5F', Poland: '#E5989B', Belgium: '#E9C46A', Ukraine: '#4EA8DE',
  Sweden: '#90E0EF', Switzerland: '#FF477E', Egypt: '#DDB892', Tanzania: '#43AA8B',
  Vietnam: '#F94144', Philippines: '#7B9ACC', Thailand: '#F8961E',
  Argentina: '#90BE6D', 'South Africa': '#F9C74F', Denmark: '#FF99C8',
  Portugal: '#80B918', Austria: '#CDB4DB', Czechia: '#A2D2FF', Kazakhstan: '#B5E48C',
  Chile: '#F28482', Taiwan: '#84A59D', Venezuela: '#F07167', Norway: '#6D9DC5',
  Malaysia: '#FFAFCC', UAE: '#06D6A0', 'Hong Kong': '#EE9B00', Greece: '#48CAE4',
  Israel: '#B8B8FF', Romania: '#FFC6FF', Morocco: '#E76F51', Kenya: '#95D5B2',
  Myanmar: '#DDA15E', Uganda: '#E9FF70', Sudan: '#FFB4A2', Iraq: '#B5838D',
  Afghanistan: '#A3B18A', Algeria: '#CCD5AE', Colombia: '#F6BD60',
  'World average': '#8D97AE', World: '#8D97AE',
};

const FALLBACK = ['#8ECAE6', '#FFB4A2', '#B5E48C', '#CDB4DB', '#FFD6A5', '#A0C4FF',
  '#FDFFB6', '#BDB2FF', '#9BF6FF', '#FFC6FF', '#CAFFBF', '#E4C1F9'];

// Darker variants for the light theme, so pale fallback colours stay readable.
const FALLBACK_LIGHT = ['#2F80ED', '#E4572E', '#3BA55C', '#8E5CC4', '#D98E04', '#1F9BB5',
  '#A0812B', '#5B5BD6', '#0E9F9A', '#C2459A', '#4C9A2A', '#9B51E0'];

/** Python's sum(map(ord, name)): sum of Unicode code points. */
function ordSum(name) {
  let s = 0;
  for (const ch of name) s += ch.codePointAt(0);
  return s;
}

/** Distinct colours for categories that have no colour of their own (in order). */
export const CATEGORY = ['#4E9BFF', '#FFB000', '#2EC4B6', '#FF6B6B', '#B48CFF', '#9BE38B', '#FF9F43', '#F15BB5'];

export function colorOf(name, overrides = {}, theme = null) {
  if (overrides && overrides[name]) return overrides[name];
  if (COLORS[name]) return COLORS[name];
  const light = theme && theme === THEMES.paper;
  const pal = light ? FALLBACK_LIGHT : FALLBACK;
  return pal[ordSum(String(name)) % pal.length];
}

/** Parse "#RRGGBB" to [r, g, b] in 0..1. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
