// Interactive web page: one self-contained .html file that plays the story
// in any browser, with a scrubber, chapters, formats and languages. Viewers
// can pause on any year. It works offline, from GitHub Pages, or inside an
// <iframe> on a blog.
//
// The page reuses this app's own code (the script that is running now), so
// it needs no separate player build and always matches the studio.

import { VERSION } from '../core/buildinfo.js';

// Captured while this script is first evaluated (document.currentScript is
// only set then).
const BUNDLE = (() => {
  try {
    const s = typeof document !== 'undefined' ? document.currentScript : null;
    return s && !s.src && s.textContent.length > 1000 ? s.textContent : null;
  } catch {
    return null;
  }
})();

export const canMakeWebPage = () => !!BUNDLE;

const CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data: blob:',
  'font-src data:', 'media-src blob:', "connect-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * The page's HTML. options: { formats: ['landscape', ...], lang, title, description }
 */
export function webPageHTML(spec, options = {}) {
  if (!BUNDLE) throw new Error('This copy of Datalapse cannot build web pages. Use the downloadable version (index.html).');
  const title = options.title ?? spec.meta?.title ?? 'Data story';
  const description = options.description ?? (spec.meta?.description ?? '').split('\n')[0];
  const config = { formats: options.formats ?? ['landscape'], lang: options.lang ?? null };
  const story = JSON.stringify(spec).replace(/</g, '\\u003c');
  const cfg = JSON.stringify(config).replace(/</g, '\\u003c');
  const code = BUNDLE.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="${esc(options.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="color-scheme" content="dark light">
<meta name="generator" content="Datalapse ${esc(VERSION)}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
</head>
<body>
<script type="application/json" id="dl-story">${story}</script>
<script type="application/json" id="dl-config">${cfg}</script>
<script>${code}</script>
</body>
</html>
`;
}

/** Snippet for putting the page on a blog or site. */
export function embedSnippet(file, fmt = 'landscape') {
  const ratio = { landscape: '56.25%', vertical: '177.78%', square: '100%', portrait: '125%' }[fmt] ?? '56.25%';
  return `<div style="position:relative;width:100%;max-width:${fmt === 'landscape' ? 960 : 420}px;padding-top:calc(${ratio} + 56px)">
  <iframe src="${file}" title="Data story" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy"></iframe>
</div>`;
}
