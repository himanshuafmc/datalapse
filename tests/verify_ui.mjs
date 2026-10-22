// End-to-end check of the built studio in headless Chromium:
//   node tools/build.mjs && node tests/verify_ui.mjs [outDir]
// Loads dist/index.html over localhost (WebCodecs needs a secure context),
// takes screenshots at desktop and phone sizes in light and dark, creates a
// story from the sample CSV, and exports it to a real video file.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/** A 40-second 120 bpm click track with a bass note on every beat, as WAV. */
function clickTrackWav(seconds = 40, bpm = 120, rate = 22050) {
  const n = seconds * rate;
  const data = new Int16Array(n);
  const period = (60 / bpm) * rate;
  for (let i = 0; i < n; i++) {
    const t = (i % period) / rate;
    const env = Math.exp(-t * 18);
    const v = env * (0.6 * Math.sin(2 * Math.PI * 60 * t) + 0.3 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 60)) + 0.05 * Math.sin(2 * Math.PI * 220 * (i / rate));
    data[i] = Math.max(-1, Math.min(1, v)) * 32000;
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  Buffer.from(data.buffer).copy(buf, 44);
  return buf;
}
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? join(ROOT, 'tests', 'screenshots');
mkdirSync(OUT, { recursive: true });
const html = readFileSync(join(ROOT, 'dist', 'index.html'));
const extra = new Map(); // path -> file contents (exported web pages)
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(extra.get(req.url.split('#')[0]) ?? html);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  for (const [label, viewport, scheme] of [
    ['desktop-dark', { width: 1366, height: 768 }, 'dark'],
    ['desktop-light', { width: 1366, height: 768 }, 'light'],
    ['phone-light', { width: 390, height: 844 }, 'light'],
    ['phone-dark', { width: 390, height: 844 }, 'dark'],
  ]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url);
    await page.waitForSelector('body.ready', { timeout: 30000 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${label}: no horizontal scroll`, !overflow);
    const status = await page.textContent('#status');
    check(`${label}: story builds`, /scenes/.test(status), status.trim());
    const fonts = await page.evaluate(() => document.fonts.check('700 20px Poppins') && document.fonts.check('500 20px Roboto'));
    check(`${label}: video fonts loaded`, fonts);
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: label.startsWith('phone') });
    check(`${label}: no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // Full flow on desktop: play, switch format, CSV wizard, export.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('body.ready');
  const t0 = await page.textContent('#tc');
  await page.click('#btn-play');
  await page.waitForTimeout(1200);
  await page.click('#btn-play');
  const t1 = await page.textContent('#tc');
  check('playback advances the timecode', t0 !== t1, `${t0} -> ${t1}`);

  // Frame draw speed (preview at full HD)
  const ms = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    return new Promise((resolve) => {
      const v = window.__crs?.video;
      if (!v) return resolve(null);
      const ctx = c.getContext('2d');
      const n = 60;
      const start = performance.now();
      const total = v.totalFrames('landscape');
      for (let k = 0; k < n; k++) v.drawFrame(ctx, 'landscape', Math.floor((k / n) * total));
      resolve((performance.now() - start) / n);
    });
  });
  check('a full-HD frame draws fast enough for 30 fps', ms != null && ms < 33, ms != null ? `${ms.toFixed(1)} ms per frame` : 'no debug handle');

  await page.click('[data-fmt="vertical"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'desktop-vertical.png') });
  for (const f of ['square', 'portrait']) {
    await page.click(`[data-fmt="${f}"]`);
    await page.waitForTimeout(400);
    const dims = await page.$eval('#canvas', (c) => c.width / c.height);
    check(`${f} preview has the right shape`, Math.abs(dims - (f === 'square' ? 1 : 0.8)) < 0.02, dims.toFixed(3));
    await page.screenshot({ path: join(OUT, `desktop-${f}.png`) });
  }
  await page.click('[data-fmt="landscape"]');

  // Every example story builds and draws without errors.
  const options = await page.$$eval('#story-select option', (o) => o.map((x) => x.value).filter((v) => v.startsWith('ex:')));
  for (const v of options) {
    await page.selectOption('#story-select', v);
    await page.waitForTimeout(500);
    const s = await page.textContent('#status');
    check(`example ${v.slice(3)} builds`, /scenes/.test(s), s.trim());
  }
  await page.selectOption('#story-select', options[0]);
  await page.waitForTimeout(400);

  // Inspector: edit the title of the selected scene and see it in the scene list.
  await page.click('[data-tab="scene"]');
  const titleInput = page.locator('#panel-scene input[type="text"]').first();
  await titleInput.fill('Edited title from the test');
  await page.waitForTimeout(400);
  const listText = await page.textContent('#scene-list');
  check('inspector edits reach the scene list', listText.includes('Edited title from the test'));
  await page.keyboard.press('Escape');
  await page.click('#btn-undo');
  await page.waitForTimeout(300);
  check('undo restores the title', !(await page.textContent('#scene-list')).includes('Edited title from the test'));

  // Command box
  await page.fill('#cmd', 'make India saffron');
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(300);
  check('command box understands a colour change', await page.evaluate(() => window.__crs.video && JSON.stringify(window.__crs.video.spec.colors ?? {}).includes('#FF9933')));
  await page.fill('#cmd', 'show 12 bars');
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(400);
  check('command box changes the bar count', await page.evaluate(() => window.__crs.video.spec.scenes.some((s) => s.nBars === 12)));
  await page.click('#btn-undo');
  await page.click('#btn-undo');
  await page.waitForTimeout(300);

  // Drama finder in the bar race scene
  await page.click('[data-tab="scene"]');
  await page.click('#panel-scene >> text=Find dramatic moments');
  const moments = await page.$$eval('#panel-scene .moment', (m) => m.length);
  check('drama finder lists moments', moments >= 3, `${moments} moments`);
  await page.screenshot({ path: join(OUT, 'moments.png') });
  const badges = await page.$$eval('#panel-scene .pill.fc:not([hidden])', (b) => b.map((x) => x.textContent));
  check('captions show fact-check badges', badges.length >= 5, badges.slice(0, 4).join(', '));

  for (const tab of ['story', 'data', 'json']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `tab-${tab}.png`) });
  }
  const jsonProblems = await page.$$eval('#panel-json .problems li', (l) => l.length);
  check('JSON panel validates the example', jsonProblems === 0);
  await page.click('[data-tab="scene"]');

  // CSV wizard with the sample data
  await page.click('#btn-csv');
  await page.click('text=Try sample data');
  await page.waitForSelector('#wiz-title');
  await page.screenshot({ path: join(OUT, 'wizard.png'), fullPage: false });
  await page.fill('#wiz-secs', '10');
  await page.dispatchEvent('#wiz-secs', 'input');
  await page.click('text=Create story');
  await page.waitForTimeout(800);
  const st2 = await page.textContent('#status');
  check('CSV wizard creates a working story', /scenes/.test(st2), st2.trim());
  await page.screenshot({ path: join(OUT, 'from-csv.png') });

  // Paste a small long-format CSV
  await page.click('#btn-csv');
  await page.click('text=Or paste from a spreadsheet');
  await page.fill('#wiz-paste', 'Date,Brand,Sales\n2023-01,Alpha,"1,200"\n2023-01,Beta,900\n2023-02,Alpha,1300\n2023-02,Beta,1500\n2023-03,Alpha,1250\n2023-03,Beta,1700\n2023-04,Alpha,1600\n2023-04,Beta,1650\n');
  await page.waitForSelector('.wiz-detect .ok');
  const detect = await page.textContent('.wiz-detect .ok');
  check('long monthly CSV is understood', /2 series, 4 time points/.test(detect), detect);
  await page.click('#wizard .dlg-close');

  // Public data catalogue: turn it on, pick a dataset (the network is mocked
  // here, but the page's Content-Security-Policy still has to allow the host).
  const gmFixture = readFileSync(join(ROOT, 'tests', 'fixtures', 'online', 'gapminder_internet_users.csv'), 'utf8');
  await page.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: gmFixture }));
  await page.route('https://api.worldbank.org/**', (r) => r.fulfill({
    status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: JSON.stringify([{ page: 1, pages: 1 }, ['IND', 'CHN', 'USA', 'IDN', 'WLD'].flatMap((c, k) => [2000, 2010, 2020].map((y) => ({ countryiso3code: c, date: String(y), value: (5 - k) * 1e8 + (y - 2000) * 1e6 * (k + 1) })))]),
  }));
  await page.click('#btn-csv');
  await page.click('text=Browse public data (online)');
  check('online data starts off', await page.isVisible('.catalogue .consent'));
  await page.click('.catalogue button:text-is("Turn on")');
  await page.fill('#cat-q', 'murders');
  await page.click('.cat-item >> nth=0');
  await page.waitForSelector('#wiz-title', { timeout: 20000 });
  const catTitle = await page.inputValue('#wiz-title');
  check('Gapminder data loads into the wizard', /Murders/.test(catTitle), catTitle);
  await page.screenshot({ path: join(OUT, 'catalogue.png') });
  await page.click('#wizard .dlg-close');
  await page.click('#btn-csv');
  await page.click('text=Browse public data (online)');
  await page.fill('#cat-q', 'population');
  await page.click('.cat-item:has-text("World Bank") >> nth=0');
  await page.waitForSelector('.wiz-detect .ok', { timeout: 20000 });
  const wbDetect = await page.textContent('.wiz-detect .ok');
  check('World Bank data loads, regions left out', /4 series, 3 time points/.test(wbDetect), wbDetect);
  await page.click('#wizard .dlg-close');
  await page.evaluate(() => localStorage.removeItem('dl.online.v1'));

  // Hindi: add the language, check country names translate in the preview
  await page.click('[data-tab="story"]');
  await page.selectOption('#st-addlang', 'hi');
  await page.click('text=Add language');
  await page.waitForTimeout(300);
  await page.click('#panel-story >> text=Preview');
  await page.waitForTimeout(700);
  const langOn = await page.$eval('#lang-select', (el) => !el.hidden && el.value === 'hi');
  check('Hindi preview switches on', langOn);
  const hindiLabel = await page.evaluate(() => window.__crs.video.env.label('India'));
  check('country names translate', hindiLabel === 'भारत', hindiLabel);
  await page.screenshot({ path: join(OUT, 'hindi-preview.png') });
  await page.selectOption('#lang-select', '');
  await page.waitForTimeout(400);

  // Music: add a click track, check the tempo, snap to the beat
  const wavPath = join(OUT, 'click120.wav');
  writeFileSync(wavPath, clickTrackWav());
  await page.click('[data-tab="audio"]');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#panel-audio >> text=Add music')]);
  await chooser.setFiles(wavPath);
  await page.waitForFunction(() => window.__crs.video?.spec.audio?.music?.bpm, null, { timeout: 30000 }).catch(() => {});
  const bpm = await page.evaluate(() => window.__crs.video?.spec.audio?.music?.bpm);
  check('music tempo is detected', bpm && Math.abs(bpm - 120) < 3, `${bpm} bpm`);
  await page.click('#panel-audio >> text=Snap captions and cuts to the beat');
  check('AI voice is off until turned on', await page.isVisible('#panel-audio .voice-box .consent'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'tab-audio.png') });

  // Publish: subtitles, then a real export (VP9 WebM here: no H.264 encoder in this Chromium)
  await page.click('#btn-export');
  await page.click('#export >> text=Subtitles & text');
  const [srt] = await Promise.all([page.waitForEvent('download'), page.click('#export >> text=Subtitles (.srt) >> nth=0')]);
  const srtPath = join(OUT, srt.suggestedFilename());
  await srt.saveAs(srtPath);
  const srtText = readFileSync(srtPath, 'utf8');
  check('subtitles file has timed cues', /00:00:0\d,\d{3} --> /.test(srtText), `${srtText.split('\n\n').length} cues`);
  await page.click('#export >> [data-id="video"]');
  await page.waitForFunction(() => !/Checking/.test(document.querySelector('#export .pub-panel .hint')?.textContent ?? 'Checking'));
  const support = await page.textContent('#export .pub-panel .hint');
  check('export reports codec support', support.length > 10, support.trim());
  await page.screenshot({ path: join(OUT, 'export.png') });
  const started = Date.now();
  await page.click('#export .pub-panel button:text-is("Render")');
  await page.waitForSelector('#export .outputs li', { timeout: 600000 });
  const doneLine = await page.textContent('#export .outputs li');
  check('export finishes', /WEBM|MP4/.test(doneLine), `${doneLine.trim()} (${((Date.now() - started) / 1000).toFixed(0)} s wall)`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export .outputs button:text-is("Save")')]);
  const file = join(OUT, download.suggestedFilename());
  await download.saveAs(file);
  check('video file is saved', true, file);
  writeFileSync(join(OUT, 'last_video_path.txt'), file);

  // Auto-Shorts: moments are proposed and one renders.
  await page.click('#export >> [data-id="shorts"]');
  const shortCards = await page.$$eval('#export .short-card', (c) => c.length);
  check('Auto-Shorts proposes clips', shortCards >= 1, `${shortCards} Shorts`);
  await page.screenshot({ path: join(OUT, 'publish-shorts.png') });
  const boxes = await page.$$('#export .short-card input[type="checkbox"]');
  for (const b of boxes.slice(1)) await b.uncheck();
  await page.click('#export button:text-is("Render selected Shorts")');
  await page.waitForSelector('#export .outputs li', { timeout: 600000 });
  check('a Short renders', /WEBM|MP4/.test(await page.textContent('#export .outputs li')));

  // Thumbnails: three drawn, each with a contrast check that passes.
  await page.click('#export >> [data-id="thumbs"]');
  await page.waitForTimeout(800);
  const contrasts = await page.$$eval('#export .thumb-card .pill', (b) => b.map((x) => x.textContent));
  check('three thumbnails with passing contrast', contrasts.length === 3 && contrasts.every((t) => /passes/.test(t)), contrasts.join(' | '));
  const titlesN = await page.$$eval('#export .title-list li', (l) => l.length);
  check('title ideas listed', titlesN >= 3, `${titlesN} titles`);
  await page.screenshot({ path: join(OUT, 'publish-thumbs.png') });
  const [thumb] = await Promise.all([page.waitForEvent('download'), page.click('#export .thumb-card button:text-is("Save PNG") >> nth=0')]);
  const thumbPath = join(OUT, thumb.suggestedFilename());
  await thumb.saveAs(thumbPath);
  const png = readFileSync(thumbPath);
  check('thumbnail is a 1280x720 PNG', png.readUInt32BE(16) === 1280 && png.readUInt32BE(20) === 720, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);

  // GIF: a one-second clip.
  await page.click('#export >> [data-id="gif"]');
  await page.fill('#gif-to', '1');
  await page.selectOption('#gif-width', '360');
  await page.dispatchEvent('#gif-to', 'input');
  await page.click('#export button:text-is("Make GIF")');
  await page.waitForSelector('#export .gif-out img', { timeout: 120000 });
  const [gif] = await Promise.all([page.waitForEvent('download'), page.click('#export button:text-is("Save GIF")')]);
  const gifPath = join(OUT, gif.suggestedFilename());
  await gif.saveAs(gifPath);
  const gifBytes = readFileSync(gifPath);
  check('GIF is saved', gifBytes.subarray(0, 6).toString() === 'GIF89a' && gifBytes.readUInt16LE(6) === 360, `${gifBytes.length} bytes`);

  // Web page: save it, open it, play it.
  await page.click('#export >> [data-id="web"]');
  const fp = await page.textContent('#export .fingerprint');
  check('fingerprint shown', /^dl1-[0-9a-f]{12}$/.test(fp.trim()), fp);
  await page.screenshot({ path: join(OUT, 'publish-web.png') });
  const [webDl] = await Promise.all([page.waitForEvent('download'), page.click('#export button:text-is("Save web page (.html)")')]);
  const webPath = join(OUT, webDl.suggestedFilename());
  await webDl.saveAs(webPath);
  extra.set('/story.html', readFileSync(webPath));
  await page.waitForFunction(() => document.querySelector('#export textarea[aria-label="Share link"]')?.value.length > 20);
  const link = await page.$eval('#export textarea[aria-label="Share link"]', (t) => t.value);
  await page.click('#export .dlg-close');
  const viewer = await ctx.newPage();
  const vErrors = [];
  viewer.on('pageerror', (e) => vErrors.push(e.message));
  await viewer.goto(`${url}story.html`);
  await viewer.waitForSelector('.v-stage canvas');
  await viewer.waitForTimeout(500);
  await viewer.click('.v-big');
  await viewer.waitForTimeout(1200);
  const vt = await viewer.textContent('.v-time');
  check('web page plays the story', /^0:0[1-9]/.test(vt.trim()), vt);
  await viewer.screenshot({ path: join(OUT, 'web-page.png') });
  check('web page has no errors', vErrors.length === 0, vErrors.join(' | '));
  await viewer.close();

  // Share link: opens the same story (same fingerprint) in a fresh studio.
  check('share link points at this page', link.startsWith(url), link.slice(0, 40));
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.goto(link);
  await p2.waitForSelector('body.ready');
  await p2.waitForTimeout(600);
  const fp2 = await p2.evaluate(() => window.__crs.video?.fingerprint);
  check('share link opens the same story', fp2 === fp.trim(), `${fp2} vs ${fp.trim()}`);
  await ctx2.close();

  check('no page errors during the flow', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} checks failed` : `\nAll ${results.length} UI checks passed`);
process.exit(failed.length ? 1 : 0);
