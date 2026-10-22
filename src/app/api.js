// A small programmatic API on window.datalapse, used by the command-line
// renderer (cli/datalapse.mjs) and handy from the browser console.
// Everything runs on this device, exactly as the studio does it.

import { Video } from '../render/video.js';
import { validateSpec } from '../spec/validate.js';
import { exportVideo, exportStill } from '../export/encode.js';
import { exportGif } from '../export/gif.js';
import { subtitleCues, toSRT, toVTT } from '../export/subtitles.js';
import { describeCues } from '../export/describe.js';
import { planShorts } from '../export/shorts.js';
import { thumbnailIdeas, thumbnailBlob, titleIdeas } from '../export/thumbnail.js';
import { storyFingerprint } from '../export/stamp.js';
import { webPageHTML } from '../export/webpage.js';
import { loadFonts } from '../render/fonts.js';
import { VERSION } from '../core/buildinfo.js';

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function video(spec, lang) {
  await loadFonts();
  const v = new Video(spec, { lang: lang && lang !== 'en' ? lang : null });
  await v.ready();
  return v;
}

export function installApi() {
  window.datalapse = {
    version: VERSION,
    validate: (spec) => validateSpec(spec),
    fingerprint: (spec) => storyFingerprint(spec),
    languages: (spec) => ['en', ...Object.keys(spec.translations ?? {})],
    /** { base64, ext, codec, frames, seconds } */
    async render(spec, { fmt = 'landscape', lang = null, container = 'auto', onProgress } = {}) {
      const v = await video(spec, lang);
      const r = await exportVideo(v, { fmt, container, onProgress });
      return { base64: await toBase64(r.blob), ext: r.ext, codec: r.codec, frames: r.frames, seconds: r.seconds };
    },
    async gif(spec, { fmt = 'landscape', lang = null, scene = 0, from = 0, to = 8, width = 480, rate = 20 } = {}) {
      const v = await video(spec, lang);
      const { frames } = v.prepare(fmt);
      const f = frames[scene] ?? frames[0];
      const range = [f.start + Math.round(from * v.fps), Math.min(f.start + f.n, f.start + Math.round(to * v.fps))];
      const r = await exportGif(v, { fmt, width, rate, range });
      return { base64: await toBase64(r.blob) };
    },
    async still(spec, { fmt = 'landscape', lang = null, at = 0.6 } = {}) {
      const v = await video(spec, lang);
      const g = Math.floor(v.totalFrames(fmt) * at);
      return { base64: await toBase64(await exportStill(v, fmt, g)) };
    },
    async thumbnails(spec, { lang = null } = {}) {
      const v = await video(spec, lang);
      const out = [];
      for (const idea of thumbnailIdeas(v.spec)) {
        const { blob, contrast } = await thumbnailBlob(v, idea);
        out.push({ base64: await toBase64(blob), text: idea.text, contrast });
      }
      return out;
    },
    titles: (spec) => titleIdeas(spec),
    async text(spec, { lang = null } = {}) {
      const v = await video(spec, lang);
      return { srt: toSRT(subtitleCues(v)), vtt: toVTT(subtitleCues(v)), description: toVTT(describeCues(v), 'descriptions'), youtube: v.youtubeText() };
    },
    shorts: (spec, opts) => planShorts(spec, opts).map((s) => ({ title: s.title, seconds: s.seconds, spec: s.spec })),
    webPage: (spec, opts) => webPageHTML(spec, opts),
  };
}
