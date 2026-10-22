// Share links: the whole story (data included) compressed into the part of
// a link after "#". Nothing is uploaded anywhere: the link itself carries
// the story, and the page that opens it rebuilds the video on the viewer's
// device. (Browsers never send the "#..." part to a server.)

const PREFIX = 's=';

function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export const canShare = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** The story as a compact code (deflate + base64url). */
export async function encodeStory(spec) {
  const json = JSON.stringify(spec);
  const bytes = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return toB64url(bytes);
}

export async function decodeStory(code) {
  const bytes = await pipe(fromB64url(code.trim()), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The story code from a link, a "#s=..." fragment, or a bare code; else null. */
export function shareCodeFrom(text) {
  const t = String(text ?? '').trim();
  const at = t.indexOf(`#${PREFIX}`);
  if (at >= 0) return t.slice(at + 1 + PREFIX.length).split(/[&\s]/)[0];
  if (t.startsWith(PREFIX)) return t.slice(PREFIX.length);
  return null;
}

/**
 * Where share links point: this page when it is a normal web page, else
 * the project's public site (package.json "homepage"), else nowhere.
 */
export function shareBase(homepage = '') {
  try {
    const top = window.top === window;
    if (top && /^https?:$/.test(location.protocol) && !/claude\.ai$|claudeusercontent\.com$/.test(location.hostname)) {
      return `${location.origin}${location.pathname}`;
    }
  } catch {
    /* cross-origin frame */
  }
  return homepage || '';
}

export function shareLink(base, code) {
  return `${base}#${PREFIX}${code}`;
}
