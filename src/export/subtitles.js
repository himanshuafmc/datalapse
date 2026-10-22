// Subtitle files (SRT and WebVTT) from a story: every line of on-screen text
// with the time it is visible. Useful for accessibility, search and
// YouTube's automatic translation.

function stamp(t, sep) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
}

const join = (...parts) => parts.filter((p) => p && String(p).trim()).join(' · ');

/** [{ start, end, text }] in seconds from the start of the video. */
export function subtitleCues(video) {
  const { frames } = video.prepare('landscape');
  const cues = [];
  for (const f of frames) {
    const sc = f.scene;
    const t0 = f.start / video.fps;
    const s = sc.spec;
    const d = f.n / video.fps;
    const end = t0 + d;
    switch (s.type) {
      case 'hook': {
        const stagger = Number(s.stagger ?? 0.9);
        const lines = (s.lines ?? []).map((ln) => ln?.text).filter(Boolean);
        lines.forEach((text, k) => cues.push({ start: t0 + k * stagger, end, text }));
        break;
      }
      case 'title':
        cues.push({ start: t0 + 0.2, end, text: join(s.title, s.subtitle, s.span) });
        break;
      case 'statCards':
        cues.push({ start: t0 + 0.2, end: t0 + Math.min(d, 2.5), text: s.heading ?? '' });
        (s.cards ?? []).forEach((c, k) => {
          const [big, small] = Array.isArray(c) ? c : [c.big, c.small];
          cues.push({ start: t0 + 0.6 + k * 0.6, end, text: join(big, small) });
        });
        break;
      case 'quiz':
        cues.push({ start: t0 + 0.2, end, text: join(s.question, ...(s.options ?? []).map((o, k) => `${'ABCD'[k]}: ${o}`)) });
        break;
      case 'outro':
        cues.push({ start: t0 + 0.3, end, text: join(s.question, s.cta) });
        break;
      default: {
        if (s.title) cues.push({ start: t0 + 0.2, end: t0 + Math.min(d, 4), text: join(s.title, s.subtitle) });
        for (const c of sc.captions?.sched ?? []) {
          cues.push({ start: t0 + c.start, end: Math.min(end, t0 + c.end), text: join(c.kicker, c.text) });
        }
      }
    }
  }
  return cues.filter((c) => c.text && c.end > c.start).sort((a, b) => a.start - b.start);
}

export function toSRT(cues) {
  return cues.map((c, k) => `${k + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVTT(cues, kind = 'subtitles') {
  const head = kind === 'descriptions' ? 'WEBVTT - audio description\n' : 'WEBVTT\n';
  return `${head}\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}
