// Build the studio into single self-contained HTML files.
//   node tools/build.mjs
// dist/index.html     full page with a strict Content-Security-Policy (no
//                     network access at all), for GitHub Pages or opening locally
// dist/artifact.html  the same app as a page fragment, for hosts that supply
//                     their own document shell

import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
const repoUrl = repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : '';

const js = await build({
  entryPoints: [join(ROOT, 'src/app/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['chrome100', 'firefox100', 'safari16'],
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  define: {
    'process.env.NODE_ENV': '"production"',
    __DL_VERSION__: JSON.stringify(pkg.version),
    __DL_HOMEPAGE__: JSON.stringify(pkg.homepage ?? ''),
    __DL_REPO__: JSON.stringify(repoUrl),
  },
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = (await transform(readFileSync(join(ROOT, 'src/app/styles.css'), 'utf8'), { loader: 'css', minify: true, target: ['chrome100', 'safari16'] })).code;
const template = readFileSync(join(ROOT, 'src/app/index.html'), 'utf8');
const repoLink = repoUrl ? `<a href="${repoUrl}" target="_blank" rel="noopener">Source on GitHub</a>` : '';

const fragment = template
  .replace('/*__CSS__*/', () => css)
  .replace('/*__REPO__*/', () => repoLink)
  .replace('/*__JS__*/', () => code);

// Network: only the opt-in online features' hosts (src/online/hosts.js).
// The app itself never connects anywhere until a person turns one on.
const { ONLINE_FEATURES } = await import('../src/online/hosts.js');
const hosts = Object.values(ONLINE_FEATURES).flatMap((f) => f.hosts.map(([h]) => `https://${h}`));
const csp = [
  "default-src 'none'", `script-src 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net/npm/`, "style-src 'unsafe-inline'", 'img-src data: blob:',
  'font-src data:', 'media-src blob: data:', 'worker-src blob:', `connect-src ${hosts.join(' ')} data: blob:`, "base-uri 'none'", "form-action 'none'",
].join('; ');
const split = fragment.indexOf('<div id="app">');
const head = fragment.slice(0, split).replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
const bodyPart = fragment.slice(split);
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="color-scheme" content="light dark">
${head.trim()}
</head>
<body>
${bodyPart.trim()}
</body>
</html>
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/index.html'), full);
writeFileSync(join(ROOT, 'dist/artifact.html'), fragment);
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/index.html ${kb(full)}  dist/artifact.html ${kb(fragment)}  (script ${kb(code)}, styles ${kb(css)})`);
