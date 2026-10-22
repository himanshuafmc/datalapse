// The only places Datalapse may connect to, and only after the person turns
// the feature on. Everything else in the app works without a network.
//
// The standalone build copies these hosts into its Content-Security-Policy
// (tools/build.mjs), so the browser itself blocks any other connection.

import { store as kv } from '../app/dom.js';

export const ONLINE_FEATURES = {
  data: {
    label: 'Public data catalogue',
    why: 'Downloads the public dataset you pick. Nothing about you or your stories is sent.',
    hosts: [
      ['api.worldbank.org', 'World Bank open data'],
      ['ourworldindata.org', 'Our World in Data charts'],
      ['raw.githubusercontent.com', 'Gapminder data, published on GitHub'],
    ],
  },
  voice: {
    label: 'Free AI voice (Kokoro, English)',
    why: 'Downloads a speech program and voice model (about 90 MB, once; your browser keeps it). The text is turned into speech on your device; it is not sent anywhere.',
    hosts: [
      ['cdn.jsdelivr.net', 'the kokoro-js speech program'],
      ['huggingface.co', 'the Kokoro-82M voice model'],
      ['*.hf.co', 'Hugging Face file servers for the model'],
    ],
  },
};

/** Every host, for the Content-Security-Policy. */
export const ONLINE_HOSTS = Object.values(ONLINE_FEATURES).flatMap((f) => f.hosts.map(([h]) => h));

const KEY = 'dl.online.v1';

export function onlineOn(feature) {
  return !!kv(KEY)?.[feature];
}

export function setOnline(feature, on) {
  kv(KEY, { ...(kv(KEY) ?? {}), [feature]: !!on });
}

function hostAllowed(host, feature) {
  return ONLINE_FEATURES[feature].hosts.some(([h]) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h));
}

/** fetch() that refuses unless the feature is on and the host is on its list. */
export async function onlineFetch(url, feature, init) {
  const u = new URL(url);
  if (!onlineOn(feature)) throw new Error(`${ONLINE_FEATURES[feature].label} is off. Turn it on first.`);
  if (u.protocol !== 'https:' || !hostAllowed(u.hostname, feature)) throw new Error(`Datalapse does not connect to ${u.hostname}.`);
  let res;
  try {
    res = await fetch(u, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error(`Could not reach ${u.hostname}. Check your internet connection. (On claude.ai the page cannot go online: use the downloaded or GitHub Pages version.)`);
  }
  if (!res.ok) throw new Error(`${u.hostname} answered ${res.status}. Try again later or pick another dataset.`);
  return res;
}
