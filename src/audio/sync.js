// Beat sync and narration fitting: small changes to the pace so captions
// (and the overtakes they describe) land on the beat, scene cuts fall on a
// beat, and the race pauses long enough for each narration clip.

import { Pace } from '../core/pace.js';

const DATA = new Set(['barRace', 'lineRace', 'dotGrid']);

function sceneDuration(s) {
  if (s.pace) return new Pace(s.pace).duration;
  return Number(s.duration ?? 3);
}

/** Seconds into the scene when the data reaches `year`. */
function captionTime(pace, year, fps) {
  const ys = new Pace(pace).frames(fps);
  for (let i = 0; i < ys.length; i++) if (ys[i] >= year - 1e-6) return i / fps;
  return ys.length / fps;
}

function nearest(beats, t) {
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const a = beats[Math.max(0, lo - 1)];
  const b = beats[lo];
  return Math.abs(a - t) < Math.abs(b - t) ? a : b;
}

/** Index of the "to" step during which the data reaches `year`. */
function stepReaching(pace, year) {
  let at = pace.start;
  for (let k = 0; k < pace.steps.length; k++) {
    const st = pace.steps[k];
    if ('to' in st) {
      if ((at < year && st.to >= year) || (at > year && st.to <= year)) return k;
      at = st.to;
    }
  }
  return -1;
}

/**
 * Nudge a story so captions and cuts land on beats (times in video
 * seconds). Mutates the spec; returns how many things moved.
 */
export function snapToBeats(spec, beats, { fps = 30, captions = true, cuts = true } = {}) {
  if (!beats?.length || beats.length < 2) return 0;
  const period = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  let moved = 0;
  let sceneStart = 0;
  for (const s of spec.scenes) {
    if (DATA.has(s.type) && s.pace?.steps && captions) {
      const caps = (s.captions ?? []).filter((c) => c.year != null).map((c) => Number(c.year)).sort((a, b) => a - b);
      for (const year of caps) {
        const t = sceneStart + captionTime(s.pace, year, fps);
        const target = nearest(beats, t);
        const delta = target - t;
        if (Math.abs(delta) < 0.03 || Math.abs(delta) > period / 2 + 1e-6) continue;
        const k = stepReaching(s.pace, year);
        if (k < 0) continue;
        const st = s.pace.steps[k];
        const dur = Math.max(0.3, st.dur + delta);
        if (dur !== st.dur) {
          st.dur = Math.round(dur * 1000) / 1000;
          moved++;
        }
      }
    }
    if (cuts) {
      const end = sceneStart + sceneDuration(s);
      const target = nearest(beats, end);
      const delta = target - end;
      if (Math.abs(delta) >= 0.03 && Math.abs(delta) <= period / 2 + 1e-6) {
        if (s.pace?.steps?.length) {
          const last = s.pace.steps[s.pace.steps.length - 1];
          if ('hold' in last && last.hold + delta >= 0.5) last.hold = Math.round((last.hold + delta) * 1000) / 1000;
          else s.pace.steps.push({ hold: Math.round(Math.max(0.05, delta + (delta < 0 ? period : 0)) * 1000) / 1000 });
          moved++;
        } else if (Number(s.duration ?? 3) + delta >= 1) {
          s.duration = Math.round((Number(s.duration ?? 3) + delta) * 1000) / 1000;
          moved++;
        }
      }
    }
    sceneStart += sceneDuration(s);
  }
  return moved;
}

/**
 * Make room for narration: each caption with a clip stays up for the clip
 * plus a little, and (optionally) the race holds while it plays.
 * clips: [{ scene, caption, duration }]. Mutates the spec.
 */
export function fitToNarration(spec, clips, { pauseRace = true, fps = 30 } = {}) {
  let changed = 0;
  for (const c of clips) {
    const s = spec.scenes[c.scene];
    if (!s) continue;
    const need = c.duration + 0.6;
    if (c.caption != null && s.captions?.[c.caption]) {
      const cap = s.captions[c.caption];
      if ((cap.dur ?? 5) < need) {
        cap.dur = Math.round(need * 10) / 10;
        changed++;
      }
      if (pauseRace && s.pace?.steps && cap.year != null) {
        const k = stepReaching(s.pace, Number(cap.year));
        const next = s.pace.steps[k + 1];
        const reached = k >= 0 && s.pace.steps[k].to === Number(cap.year);
        if (k >= 0 && reached) {
          if (next && 'hold' in next) {
            if (next.hold < c.duration) {
              next.hold = Math.round(c.duration * 10) / 10;
              changed++;
            }
          } else {
            s.pace.steps.splice(k + 1, 0, { hold: Math.round(c.duration * 10) / 10 });
            changed++;
          }
        } else if (k >= 0) {
          // Split the step at the caption year, then hold there.
          const st = s.pace.steps[k];
          let from = s.pace.start;
          for (let j = 0; j < k; j++) if ('to' in s.pace.steps[j]) from = s.pace.steps[j].to;
          const f = (Number(cap.year) - from) / (st.to - from);
          s.pace.steps.splice(k, 1, { to: Number(cap.year), dur: Math.max(0.3, st.dur * f) }, { hold: Math.round(c.duration * 10) / 10 }, { to: st.to, dur: Math.max(0.3, st.dur * (1 - f)) });
          changed++;
        }
      }
    } else if (!s.pace) {
      const at = (c.at ?? 0) + need;
      if (Number(s.duration ?? 3) < at) {
        s.duration = Math.round(at * 10) / 10;
        changed++;
      }
    }
  }
  void fps;
  return changed;
}
