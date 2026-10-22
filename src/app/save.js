// Saving files. On claude.ai the page runs in a sandboxed frame and must ask
// the viewer through the "downloads" capability; everywhere else a normal
// browser download works.

let downloadsCap;

async function capability() {
  if (downloadsCap !== undefined) return downloadsCap;
  downloadsCap = null;
  try {
    if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
      downloadsCap = await window.claude.use('downloads');
    }
  } catch {
    downloadsCap = null;
  }
  return downloadsCap;
}

function framed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Save a Blob or string as a file. Resolves to 'saved', 'declined' or throws
 * with a message the UI can show.
 */
export async function saveFile(data, filename) {
  const cap = await capability();
  if (cap) {
    try {
      await cap.save({ filename, data });
      return 'saved';
    } catch (e) {
      if (e?.code === 'declined') return 'declined';
      if (e?.code === 'rate_limited') throw new Error('A save is already waiting for your answer.');
      if (e?.code === 'too_large') throw new Error('The file is too large to save here. Try the vertical format or a shorter story.');
      if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e?.code)) {
        throw new Error(e?.message || 'The file could not be saved.');
      }
      // fall through to a plain download
    }
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  if (framed() && !cap) {
    // Some sandboxes ignore downloads silently; tell the user where to go.
    return 'maybe';
  }
  return 'saved';
}

/** Copy text; falls back to selecting a textarea's content. */
export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      fallbackEl.focus();
      fallbackEl.select?.();
    }
    return false;
  }
}
