// AI help, two ways:
//  - Inside a Claude viewer (claude.ai), the page can ask Claude directly
//    through the "sample" capability, on the viewer's own account and only
//    after they allow it.
//  - Everywhere else: copy a prompt into any AI, paste the reply back.

let samplePromise;

/** The sample function, or null when this page can't ask Claude. */
export function claudeSample() {
  if (samplePromise === undefined) {
    samplePromise = (async () => {
      try {
        if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
          return await window.claude.use('sample');
        }
      } catch {
        /* not available */
      }
      return null;
    })();
  }
  return samplePromise;
}

const MESSAGES = {
  not_granted: 'Asking Claude was not allowed. Use "Copy prompt" instead.',
  rate_limited: 'Claude is busy right now. Wait a minute and try again.',
  cancelled: 'Stopped.',
};

/**
 * Ask Claude for text. opts: { onText, signal, json }.
 * Throws an Error with a message for people.
 */
export async function askClaude(prompt, opts = {}) {
  const sample = await claudeSample();
  if (!sample) throw new Error('Claude is not available on this page. Use "Copy prompt" instead.');
  try {
    const { text } = await sample(prompt, { onText: opts.onText, signal: opts.signal, modelTier: opts.tier ?? 'default', cache: false });
    return text;
  } catch (e) {
    const err = new Error(MESSAGES[e?.code] ?? e?.message ?? 'Claude could not answer.');
    err.code = e?.code;
    throw err;
  }
}
