// "Ask your AI" prompt: paste it into any chatbot together with a topic or a
// table, get back a Story Spec JSON, paste that into the studio.

export const SPEC_CHEATSHEET = `STORY SPEC (JSON, version 1)
{
  "version": 1, "id": "snake_case_id", "fps": 30,
  "theme": { "name": "midnight" | "ink" | "paper", "brand": "CHANNEL NAME or empty" },
  "colors": { "India": "#FF9933" },                 // optional entity colours
  "meta": { "title": "...", "description": "...", "sources": "...", "hashtags": ["#dataviz"], "tags": ["..."] },
  "datasets": {
    "gdp": { "index": [1960, 1961, ...],             // years (or fractional years for months)
             "columns": ["India", "China", ...],
             "values": [[...one number or null per index entry...], [...], ...] }   // one list per column
  },
  "scenes": [ ...in order... ]
}

SCENE TYPES
hook      { "lines": [{ "text": "...", "size": "big"|"small", "color": "#hex" (optional) }], "duration": 5 }
title     { "title": "...", "subtitle": "...", "span": "1960 – 2023", "duration": 3.2 }
barRace   { "data": "gdp", "pace": PACE, "title": "...", "subtitle": "...", "source": "Source: ...",
            "valueFormat": FORMAT, "tickFormat": FORMAT, "highlight": "India", "pin": "India",
            "nBars": 10, "captions": [CAPTION], "notes": [{ "after": 2023.5, "text": "Projection" }],
            "counter": { "data": "world", "column": "World", "prefix": "World: ", "format": FORMAT } }
lineRace  { "data": "life", "pace": PACE, "series": ["India", "Japan"], "title": "...", "valueFormat": FORMAT,
            "yTickFormat": FORMAT, "log": false, "yRange": [0, 90], "highlight": "India",
            "markers": [{ "x": 1947, "label": "Independence" }], "captions": [CAPTION] }
dotGrid   { "data": "mort", "column": "India", "pace": PACE, "title": "...", "smallText": "children out of 100 died before age 5",
            "bigFormat": { "type": "fixed", "digits": 0, "suffix": " in 100" }, "captions": [CAPTION] }
growBars  { "items": [{ "name": "India", "value": 72 }], "title": "...", "valueFormat": FORMAT, "highlight": "India",
            "duration": 9, "captions": [{ "at": 2.0, "kicker": "...", "text": "..." }] }
statCards { "heading": "...", "cards": [{ "big": "5th", "small": "largest economy", "color": "#FFB703" }], "footer": "...", "duration": 8 }
mapRace   { "data": "co2", "pace": PACE, "title": "...", "valueFormat": FORMAT, "highlight": "India", "top": 5, "captions": [CAPTION] }
            // columns must be countries
bubble    { "xData": "gdp_per_person", "yData": "life", "sizeData": "pop", "xLog": true, "xLabel": "...", "yLabel": "...",
            "xFormat": FORMAT, "yFormat": FORMAT, "highlight": "India", "pace": PACE, "captions": [CAPTION] }
            // the three datasets share column names; each column is a bubble
stackedArea { "data": "mix", "series": ["Coal", "Gas", "Solar"], "percent": true, "pace": PACE, "captions": [CAPTION] }
bump      { "data": "gdp", "nBars": 8, "highlight": "India", "pace": PACE, "captions": [CAPTION] }   // ranks over time
versus    { "data": "pop", "left": "India", "right": "China", "valueFormat": FORMAT, "pace": PACE, "captions": [CAPTION] }
waffle    { "items": [{ "name": "Coal", "value": 36 }, { "name": "Solar", "value": 7 }], "title": "...", "duration": 7 }
quiz      { "question": "...?", "options": ["A", "B", "C", "D"], "answer": 2, "explain": "...", "think": 4, "duration": 9 }
outro     { "question": "What should we chart next?", "sources": "World Bank", "cta": "Tell us in the comments", "duration": 6.5 }

ANY SCENE may add "transition": "crossfade" | "slide" | "zoom", and "camera": [{ "at": 6, "zoom": 1.6, "x": 0.35, "y": 0.55, "dur": 1.2 }].
barRace and lineRace may add "spotlight": [{ "entity": "India", "from": 1991, "to": 1996 }] (dims the others).

PACE (how data time moves while the video plays; seconds add up to the scene length)
{ "start": 1960, "lead": 1.0, "steps": [ { "hold": 3 }, { "to": 1991, "dur": 12 }, { "hold": 2 }, { "to": 2023, "dur": 14 }, { "hold": 4 } ] }
Slow down (longer "dur") or "hold" around the moments the captions talk about.

CAPTION   { "year": 1991, "kicker": "1991", "text": "One short sentence, max ~110 characters.", "dur": 5 }

FORMAT    { "type": "money" }  → $3.70T     { "type": "tickMoney" } → $3.7T (axis)
          { "type": "count" }  → 1.43 B     { "type": "tickCount" } → 1.4B (axis)
          { "type": "indian" } → ₹4.20 lakh cr   { "type": "tickIndian" }
          { "type": "fixed", "digits": 1, "thousands": true, "prefix": "", "suffix": " yrs", "divide": 1000 }
          { "type": "piecewise", "cases": [{ "if": { "lt": 1 }, "text": "<1" }], "else": FORMAT }`;

export const SPEC_RULES = `RULES
- Output ONLY the JSON, no commentary, no markdown fences. Valid JSON: no comments, no trailing commas.
- Use real, verifiable data and name the source in every chart scene's "source" and in meta.sources. If you are not sure of a number, leave it null rather than guessing.
- Every list in "values" must have exactly one entry per "index" entry (null for missing).
- A typical story: hook → title → one or two chart scenes → statCards → outro. Aim for 60–180 seconds. Vary chart types only when the data calls for it (a map for countries, bubbles for two measures, a stacked area for parts of a whole).
- Captions explain WHY something happened, in plain words. 3–7 captions per chart scene.
- Keep titles under 50 characters and hook lines under 40.`;

/**
 * Build the prompt. `topic` is free text; `table` (optional) is a dataset to
 * build the story around, summarised so the AI doesn't need to repeat it.
 */
export function buildPrompt({ topic = '', table = null } = {}) {
  const parts = [
    'You are writing a data-documentary video script for Datalapse (open source, runs in the browser).',
    'Return one Story Spec as JSON, following this format exactly:',
    '',
    SPEC_CHEATSHEET,
    '',
    SPEC_RULES,
    '',
  ];
  if (table) {
    const span = `${table.index[0]} to ${table.index[table.index.length - 1]}`;
    parts.push(
      `MY DATA: I already have a dataset named "main" (${table.columns.length} columns, ${table.index.length} time points, ${span}).`,
      `Columns: ${table.columns.slice(0, 60).join(', ')}${table.columns.length > 60 ? ', …' : ''}.`,
      'Do NOT include "datasets" in your answer; the studio will attach "main". Refer to it as "data": "main".',
      '',
    );
  }
  parts.push(`TOPIC: ${topic || '(describe your topic here, e.g. "How India became the 5th largest economy, 1960–2023")'}`);
  return parts.join('\n');
}

/** Pull the JSON object out of an AI reply (tolerates code fences and chatter). */
export function extractJSON(reply) {
  let s = String(reply).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const firstBrace = s.indexOf('{');
  const firstBracket = s.indexOf('[');
  const isArray = firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace);
  const a = isArray ? firstBracket : firstBrace;
  const b = isArray ? s.lastIndexOf(']') : s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON found. Paste the whole reply from your AI.');
  s = s.slice(a, b + 1);
  try {
    return JSON.parse(s);
  } catch {
    // Common AI mistakes: comments and trailing commas.
    const cleaned = s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  }
}
