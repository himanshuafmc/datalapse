// A port of Python's textwrap.wrap(text, width) with default options.
// The engine wraps titles and captions by character count, so matching
// Python's line breaks keeps every story laid out exactly as the Python
// renderer drew it.

const WS = ' \t\n\x0b\x0c\r';
const ws = `[${WS.replace(/[\\\]]/g, '\\$&')}]`;
const nws = `[^${WS.replace(/[\\\]]/g, '\\$&')}]`;
const wordPunct = `[\\p{L}\\p{N}_!"'&.,?]`;
const letter = `[\\p{L}\\p{Nl}\\p{No}_]`;

// Python's TextWrapper.wordsep_re, translated to a JavaScript Unicode regex.
const WORDSEP = new RegExp(
  '(' +
    `${ws}+` +
    `|(?<=${wordPunct})-{2,}(?=[\\p{L}\\p{N}_])` +
    `|${nws}+?(?:` +
      `-(?:(?<=${letter}{2}-)|(?<=${letter}-${letter}-))(?=${letter}-?${letter})` +
      `|(?=${ws}|$)` +
      `|(?<=${wordPunct})(?=-{2,}[\\p{L}\\p{N}_])` +
    ')' +
  ')',
  'gu',
);

function len(s) {
  return [...s].length;
}

function splitChunks(text) {
  // re.split with a capture group keeps the separators; drop empty pieces.
  // Matching runs over the whole string so the look-behinds see real context.
  const out = [];
  let last = 0;
  WORDSEP.lastIndex = 0;
  for (const m of text.matchAll(WORDSEP)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.filter((c) => c);
}

function handleLongWord(chunks, curLine, curLen, width) {
  const spaceLeft = width < 1 ? 1 : width - curLen;
  if (spaceLeft <= 0) return; // Python 3.13+: nothing fits, start a new line
  const chunk = chunks[chunks.length - 1];
  const chars = [...chunk];
  let end = spaceLeft;
  if (chars.length > spaceLeft) {
    const head = chars.slice(0, spaceLeft).join('');
    const hyphen = head.lastIndexOf('-');
    if (hyphen > 0 && [...head.slice(0, hyphen)].some((c) => c !== '-')) {
      end = [...head.slice(0, hyphen)].length + 1;
    }
  }
  curLine.push(chars.slice(0, end).join(''));
  chunks[chunks.length - 1] = chars.slice(end).join('');
}

/** Python str.expandtabs(8): tabs advance to the next multiple of 8 columns. */
function expandTabs(s, size = 8) {
  let out = '';
  let col = 0;
  for (const ch of s) {
    if (ch === '\t') {
      const n = size - (col % size);
      out += ' '.repeat(n);
      col += n;
    } else if (ch === '\n' || ch === '\r') {
      out += ch;
      col = 0;
    } else {
      out += ch;
      col += 1;
    }
  }
  return out;
}

export function wrap(text, width) {
  if (text == null) return [];
  // expandtabs + replace_whitespace
  let t = expandTabs(String(text));
  t = t.replace(/[\t\n\x0b\x0c\r]/g, ' ');
  const chunks = splitChunks(t).reverse();
  const lines = [];
  width = Math.trunc(width);
  if (width <= 0) throw new Error(`invalid width ${width} (must be > 0)`);
  while (chunks.length) {
    const curLine = [];
    let curLen = 0;
    if (chunks[chunks.length - 1].trim() === '' && lines.length) chunks.pop();
    while (chunks.length) {
      const l = len(chunks[chunks.length - 1]);
      if (curLen + l <= width) {
        curLine.push(chunks.pop());
        curLen += l;
      } else break;
    }
    if (chunks.length && len(chunks[chunks.length - 1]) > width) {
      handleLongWord(chunks, curLine, curLen, width);
      curLen = curLine.reduce((a, c) => a + len(c), 0);
    }
    if (curLine.length && curLine[curLine.length - 1].trim() === '') {
      curLen -= len(curLine[curLine.length - 1]);
      curLine.pop();
    }
    if (curLine.length) lines.push(curLine.join(''));
  }
  return lines;
}
