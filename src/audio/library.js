// Audio files people add (music, narration clips) live here, not in the
// story JSON: they are large. The story refers to them by id. Files are
// kept in this browser (IndexedDB) so a story still has its sound after a
// reload; on another device you add them again.

const DB = 'datalapse-audio';
const STORE = 'clips';
const mem = new Map();
let ctx = null;

function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function dbPut(id, rec) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* storage unavailable: the clip lasts for this visit only */
  }
}

async function dbGet(id) {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return null;
  }
}

async function digest(buf) {
  try {
    const h = await crypto.subtle.digest('SHA-1', buf);
    return [...new Uint8Array(h)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Decode bytes to an AudioBuffer (copies, since decoding detaches the buffer). */
export async function decode(bytes) {
  return audioContext().decodeAudioData(bytes.slice(0));
}

/** Add a file or Blob; returns { id, name, duration }. */
export async function addAudio(blob, name) {
  if (blob.size > 60e6) throw new Error('That audio file is over 60 MB. Use a shorter or more compressed file (MP3 or M4A).');
  const bytes = await blob.arrayBuffer();
  let buffer;
  try {
    buffer = await decode(bytes);
  } catch {
    throw new Error('This browser could not read that audio file. Try MP3, M4A, WAV or OGG.');
  }
  const id = await digest(bytes);
  const rec = { name: name ?? blob.name ?? 'audio', type: blob.type, bytes };
  mem.set(id, { ...rec, buffer });
  dbPut(id, rec);
  return { id, name: rec.name, duration: buffer.duration };
}

/** The decoded AudioBuffer for an id, from memory or this browser's storage. */
export async function getBuffer(id) {
  if (!id) return null;
  const m = mem.get(id);
  if (m?.buffer) return m.buffer;
  const rec = m ?? (await dbGet(id));
  if (!rec) return null;
  const buffer = await decode(rec.bytes);
  mem.set(id, { ...rec, buffer });
  return buffer;
}

export function hasLoaded(id) {
  return !!mem.get(id)?.buffer;
}

export { audioContext };
