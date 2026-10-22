#!/usr/bin/env node
// Datalapse on the command line: render story files to videos, Shorts,
// GIFs, thumbnails and subtitles without opening the studio. It drives the
// same page in a headless browser, so the pixels are the studio's.
//
//   node cli/datalapse.mjs render story.json --format landscape,vertical --out out/
//   node cli/datalapse.mjs check story.json
//
// Needs: npm install, then a browser for Playwright (`npx playwright install
// chromium`), or Google Chrome installed (used first: it can make MP4).

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORMATS = ['landscape', 'vertical', 'square', 'portrait'];
const SUFFIX = { landscape: '', vertical: '_short', square: '_square', portrait: '_4x5' };

const HELP = `Datalapse command line

  datalapse render <story.json>... [options]   render videos (and more) from story files
  datalapse check <story.json>...              validate stories and print their fingerprints

Options for render:
  --format <list>     landscape, vertical, square, portrait, or all   (default: landscape)
  --lang <list>       en, hi, ... or all (every language in the story) (default: en)
  --out <dir>         where files go                                 (default: ./out)
  --container <c>     auto, mp4 or webm                              (default: auto)
  --text              also write subtitles (.srt, .vtt), audio description and YouTube text
  --thumbs            also write three 1280x720 thumbnails
  --gif <s:a-b>       also write a GIF of scene s from a to b seconds, e.g. 3:0-8
  --shorts <n>        also render n auto-Shorts (9:16)
  --page              also write the interactive web page (.html)
  --browser <b>       chrome or chromium                             (default: chrome, then chromium)

Audio files live in the browser that added them, so command-line renders are silent.`;

function parseArgs(argv) {
  const args = { files: [], format: 'landscape', lang: 'en', out: 'out', container: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) args.files.push(a);
    else if (['--text', '--thumbs', '--page', '--help'].includes(a)) args[a.slice(2)] = true;
    else args[a.slice(2)] = argv[++i];
  }
  return args;
}

function ensureBuild() {
  const page = join(ROOT, 'dist', 'index.html');
  if (!existsSync(page)) {
    console.log('Building the studio first…');
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'build.mjs')], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  return readFileSync(page);
}

async function launch(which) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright is missing. Run: npm install');
    process.exit(1);
  }
  const tries = which === 'chromium' ? [{}] : which === 'chrome' ? [{ channel: 'chrome' }] : [{ channel: 'chrome' }, {}];
  for (const opts of tries) {
    try {
      return { browser: await chromium.launch(opts), name: opts.channel ?? 'chromium' };
    } catch {
      /* try the next */
    }
  }
  console.error('No browser found. Install Google Chrome, or run: npx playwright install chromium');
  process.exit(1);
}

const save = (path, base64) => writeFileSync(path, Buffer.from(base64, 'base64'));
const slug = (s) => String(s || 'story').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, ' ').trim().replace(/[\s-]+/g, '_').slice(0, 60) || 'story';

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!cmd || args.help || !['render', 'check'].includes(cmd) || !args.files.length) {
    console.log(HELP);
    process.exit(cmd ? 1 : 0);
  }
  const html = ensureBuild();
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const { browser, name } = await launch(args.browser);
  let failed = 0;
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
    await page.goto(url);
    await page.waitForFunction(() => window.datalapse && document.body.classList.contains('ready'), null, { timeout: 60000 });
    const outDir = resolve(args.out);
    if (cmd === 'render') mkdirSync(outDir, { recursive: true });
    for (const file of args.files) {
      let spec;
      try {
        spec = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        console.error(`${file}: not a readable JSON story (${e.message})`);
        failed++;
        continue;
      }
      const errs = await page.evaluate((s) => window.datalapse.validate(s), spec);
      const fp = await page.evaluate((s) => window.datalapse.fingerprint(s), spec);
      console.log(`${basename(file)}  ${fp}${errs.length ? `  ${errs.length} problem(s)` : '  valid'}`);
      for (const e of errs.slice(0, 10)) console.log(`  - ${e}`);
      if (errs.length) {
        failed++;
        continue;
      }
      if (cmd === 'check') continue;
      if (spec.audio) console.log('  note: audio is not available on the command line; videos are silent.');
      const base = slug(spec.meta?.title ?? spec.id ?? basename(file, '.json'));
      const formats = args.format === 'all' ? FORMATS : args.format.split(',').map((f) => f.trim()).filter((f) => FORMATS.includes(f));
      const allLangs = await page.evaluate((s) => window.datalapse.languages(s), spec);
      const langs = args.lang === 'all' ? allLangs : args.lang.split(',').map((l) => l.trim()).filter((l) => allLangs.includes(l));
      for (const lang of langs) {
        const sfx = lang === 'en' ? '' : `_${lang}`;
        for (const fmt of formats) {
          const t0 = Date.now();
          const r = await page.evaluate(([s, o]) => window.datalapse.render(s, o), [spec, { fmt, lang, container: args.container }]);
          const out = join(outDir, `${base}${SUFFIX[fmt]}${sfx}.${r.ext}`);
          save(out, r.base64);
          console.log(`  ${basename(out)}  ${(Buffer.byteLength(r.base64, 'base64') / 1e6).toFixed(1)} MB  ${r.codec}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        }
        if (args.text) {
          const t = await page.evaluate(([s, l]) => window.datalapse.text(s, { lang: l }), [spec, lang]);
          writeFileSync(join(outDir, `${base}${sfx}.srt`), t.srt);
          writeFileSync(join(outDir, `${base}${sfx}.vtt`), t.vtt);
          writeFileSync(join(outDir, `${base}${sfx}_audio_description.vtt`), t.description);
          writeFileSync(join(outDir, `${base}${sfx}_youtube.txt`), t.youtube);
          console.log(`  subtitles, audio description and YouTube text${sfx ? ` (${lang})` : ''}`);
        }
        if (args.thumbs) {
          const th = await page.evaluate(([s, l]) => window.datalapse.thumbnails(s, { lang: l }), [spec, lang]);
          th.forEach((x, k) => save(join(outDir, `${base}${sfx}_thumbnail_${k + 1}.png`), x.base64));
          console.log(`  ${th.length} thumbnails (contrast ${th.map((x) => x.contrast.toFixed(1)).join(', ')})`);
        }
        if (args.page) {
          const htmlPage = await page.evaluate(([s, l, f]) => window.datalapse.webPage(s, { lang: l === 'en' ? null : l, formats: f }), [spec, lang, formats]);
          writeFileSync(join(outDir, `${base}${sfx}.html`), htmlPage);
          console.log(`  ${base}${sfx}.html (interactive web page)`);
        }
      }
      if (args.gif) {
        const m = String(args.gif).match(/^(\d+):([\d.]+)-([\d.]+)$/);
        if (!m) console.log('  --gif must look like 3:0-8 (scene 3, seconds 0 to 8)');
        else {
          const g = await page.evaluate(([s, o]) => window.datalapse.gif(s, o), [spec, { scene: Number(m[1]) - 1, from: Number(m[2]), to: Number(m[3]) }]);
          save(join(outDir, `${base}.gif`), g.base64);
          console.log(`  ${base}.gif`);
        }
      }
      if (args.shorts) {
        const shorts = await page.evaluate(([s, n]) => window.datalapse.shorts(s, { count: n }), [spec, Number(args.shorts) || 3]);
        for (const [k, sh] of shorts.entries()) {
          const r = await page.evaluate(([s, o]) => window.datalapse.render(s, o), [sh.spec, { fmt: 'vertical', container: args.container }]);
          const out = join(outDir, `${base}_short${k + 1}.${r.ext}`);
          save(out, r.base64);
          console.log(`  ${basename(out)}  "${sh.title}"`);
        }
      }
    }
    console.log(cmd === 'render' ? `Done (${name}). Files are in ${outDir}` : 'Done.');
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
