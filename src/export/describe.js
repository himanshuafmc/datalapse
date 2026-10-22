// Audio description track (WebVTT "descriptions"): what is on screen, in
// words, for viewers who can't see the chart. Screen readers and some
// players read these cues aloud; they also make a good alt text script.

import { subtitleCues } from './subtitles.js';

const KIND = {
  barRace: 'Bar chart race', lineRace: 'Line chart', mapRace: 'World map', bubble: 'Bubble chart', stackedArea: 'Stacked area chart',
  bump: 'Ranking chart', versus: 'Head-to-head comparison', dotGrid: 'Grid of 100 dots', waffle: 'Grid of 100 squares',
  growBars: 'Bar chart', statCards: 'Key numbers', hook: 'Opening', title: 'Title', outro: 'Closing card', quiz: 'Quiz',
};

const stop = (x) => (/[.?!]$/.test(x) ? x : `${x}.`);

/** [{ start, end, text }] describing each scene, then its moments. */
export function describeCues(video, { every = 12 } = {}) {
  const { frames } = video.prepare('landscape');
  const fps = video.fps;
  const subs = subtitleCues(video);
  const cues = [];
  for (const f of frames) {
    const sc = f.scene;
    const s = sc.spec;
    const t0 = f.start / fps;
    const d = f.n / fps;
    const name = String(s.title || s.heading || s.question || '').replace(/[.:]+$/, '').trim();
    const kind = KIND[s.type] ?? 'Scene';
    const sub = s.subtitle ? ` ${String(s.subtitle).replace(/[.]+$/, '')}.` : '';
    if (typeof sc.describe !== 'function') {
      // Text scenes: their words are the description.
      const words = subs.filter((c) => c.start >= t0 - 1e-6 && c.start < t0 + d).map((c) => c.text).join(' ');
      cues.push({ start: t0 + 0.1, end: t0 + Math.min(d, 6), text: `${kind}. ${words || name}`.trim() });
      continue;
    }
    if (!sc.ys) {
      // A still chart: one description.
      let text = null;
      try {
        text = sc.describe(0);
      } catch {
        /* fall back to the name */
      }
      cues.push({ start: t0 + 0.1, end: t0 + d, text: `${stop(`${kind}${name ? `: ${name}` : ''}`)}${sub}${text ? ` ${text}` : ''}` });
      continue;
    }
    // Data scenes: what the chart is, then the state at captions and every few seconds.
    const times = new Set([Math.min(d - 0.1, 1.2)]);
    for (const c of sc.captions?.sched ?? []) times.add(c.start);
    for (let t = every; t < d - 2; t += every) times.add(t);
    times.add(Math.max(0, d - 1.5));
    const sorted = [...times].filter((t) => t >= 0 && t < d).sort((a, b) => a - b);
    const kept = sorted.filter((t, k) => k === 0 || t - sorted[k - 1] >= 3);
    cues.push({ start: t0 + 0.1, end: t0 + Math.min(d, kept[0] ?? 2), text: `${stop(`${kind}${name ? `: ${name}` : ''}`)}${sub}` });
    kept.forEach((t, k) => {
      const i = Math.min(f.n - 1, Math.round(t * fps));
      let text;
      try {
        text = sc.describe(i);
      } catch {
        text = null;
      }
      if (!text) return;
      const end = Math.min(t0 + d, t0 + (kept[k + 1] ?? d));
      cues.push({ start: t0 + t + 0.05, end, text });
    });
  }
  // No overlaps: each cue ends before the next begins.
  cues.sort((a, b) => a.start - b.start);
  for (let k = 0; k + 1 < cues.length; k++) cues[k].end = Math.min(cues[k].end, cues[k + 1].start - 0.05);
  return cues.filter((c) => c.text && c.end > c.start);
}
