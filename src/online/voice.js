// Free AI voice-over: Kokoro-82M (Apache-2.0) running in the browser through
// kokoro-js. Turned on by the person; downloads the program (about 2 MB)
// and the model (about 90 MB) once, then speaks on this device. English
// voices only (American and British).

import { onlineOn, ONLINE_FEATURES } from './hosts.js';

export const KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

export const VOICES = [
  ['af_heart', 'Heart (American, female)'], ['af_bella', 'Bella (American, female)'], ['af_nicole', 'Nicole (American, female, soft)'],
  ['am_michael', 'Michael (American, male)'], ['am_fenrir', 'Fenrir (American, male)'], ['am_puck', 'Puck (American, male)'],
  ['bf_emma', 'Emma (British, female)'], ['bf_isabella', 'Isabella (British, female)'], ['bm_george', 'George (British, male)'], ['bm_fable', 'Fable (British, male)'],
];

let ttsPromise = null;

/** Load the speech program and model (once). onProgress(fraction, text). */
export function loadVoice(onProgress) {
  if (!onlineOn('voice')) return Promise.reject(new Error(`${ONLINE_FEATURES.voice.label} is off. Turn it on first.`));
  if (!ttsPromise) {
    ttsPromise = (async () => {
      let mod;
      try {
        mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ KOKORO_URL);
      } catch {
        throw new Error('Could not download the speech program. Check your connection. (On claude.ai the page cannot go online: use the downloaded or GitHub Pages version.)');
      }
      const files = new Map();
      const tts = await mod.KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p?.status === 'progress' && p.file) {
            files.set(p.file, [p.loaded ?? 0, p.total ?? 0]);
            let got = 0;
            let all = 0;
            for (const [l, t] of files.values()) {
              got += l;
              all += t;
            }
            onProgress?.(all ? got / all : 0, `Downloading the voice model: ${Math.round(got / 1e6)} of ${Math.round(all / 1e6)} MB`);
          }
        },
      });
      onProgress?.(1, 'Voice ready');
      return tts;
    })();
    ttsPromise.catch(() => {
      ttsPromise = null;
    });
  }
  return ttsPromise;
}

/** A 16-bit mono WAV file from samples. */
export function wavBlob(samples, rate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

/** Speak one line; resolves to a WAV Blob. */
export async function speak(text, { voice = 'af_heart', speed = 1 } = {}, onProgress) {
  const tts = await loadVoice(onProgress);
  const out = await tts.generate(String(text), { voice, speed });
  const samples = out.audio ?? out.data;
  const rate = out.sampling_rate ?? out.sampleRate ?? 24000;
  if (!samples?.length) throw new Error('The voice came back empty.');
  return wavBlob(samples, rate);
}
