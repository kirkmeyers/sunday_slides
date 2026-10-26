/**
 * Text layout shared by the preview, PNG export and the slide builder.
 *
 * Slide text is plain text with two bits of markup:
 *   \n        a hard line break (exported to ProPresenter as a line break)
 *   {words}   de-emphasized (dimmed) words, e.g. the unread part of a verse
 *
 * Measuring is injected (`measure(str, style) -> px`) so the same code runs in
 * the browser (canvas) and in tests.
 */

/** Split text into runs: [{ text, dim }]. Unbalanced braces are treated as text. */
export function parseRuns(text) {
  const runs = [];
  let dim = false;
  let buf = '';
  for (const ch of text) {
    if (ch === '{' && !dim) {
      if (buf) runs.push({ text: buf, dim });
      buf = '';
      dim = true;
    } else if (ch === '}' && dim) {
      if (buf) runs.push({ text: buf, dim });
      buf = '';
      dim = false;
    } else {
      buf += ch;
    }
  }
  if (buf) runs.push({ text: buf, dim });
  return runs;
}

/** Text without markup. */
export function plainText(text) {
  return parseRuns(text).map(r => r.text).join('');
}

/** Break runs into words, keeping each word's dim flag and the hard breaks. */
function tokenize(text) {
  const tokens = []; // { word, dim } | { br: true }
  for (const run of parseRuns(text)) {
    const parts = run.text.split(/(\n| +)/);
    for (const p of parts) {
      if (p === '\n') tokens.push({ br: true });
      else if (p && !/^ +$/.test(p)) tokens.push({ word: p, dim: run.dim });
    }
  }
  return tokens;
}

/**
 * Wrap text to a width. Returns lines: [{ pieces: [{ text, dim }], width }].
 * Pieces are words joined with spaces, split only where the dim state changes.
 */
export function wrapLines(text, maxWidth, measure, style) {
  const lines = [];
  let cur = [];
  const space = measure(' ', style);
  const lineWidth = words => words.reduce((w, t, i) => w + measure(t.word, style) + (i ? space : 0), 0);

  const flush = () => {
    const pieces = [];
    for (const t of cur) {
      const last = pieces[pieces.length - 1];
      if (last && last.dim === t.dim) last.text += ' ' + t.word;
      else pieces.push({ text: (pieces.length ? ' ' : '') + t.word, dim: t.dim });
    }
    lines.push({ pieces, width: lineWidth(cur), words: cur.length });
    cur = [];
  };

  for (const t of tokenize(text)) {
    if (t.br) {
      flush();
      continue;
    }
    if (cur.length && lineWidth([...cur, t]) > maxWidth) flush();
    cur.push(t);
  }
  if (cur.length || lines.length === 0) flush();
  return lines;
}

/**
 * Line pitch in px. ProPresenter (Core Text) scales the font's natural line
 * height by the paragraph's line-height multiple and adds any extra leading.
 */
export function linePitch(style, fontMetrics) {
  return (fontMetrics.ascent + fontMetrics.descent) * style.lineMultiple + style.leading;
}

/**
 * Distance from a line's top to its baseline. Core Text splits the space a
 * line-height multiple adds (or removes) evenly above and below the glyphs;
 * extra leading goes below. Measured against ProPresenter's own exports.
 */
export function baselineOffset(style, fontMetrics) {
  const natural = fontMetrics.ascent + fontMetrics.descent;
  return fontMetrics.ascent + (natural * style.lineMultiple - natural) / 2;
}

// ProPresenter text boxes keep 5pt of padding inside their left and right edges
// (Cocoa's line fragment padding), so text wraps and aligns in a narrower area.
export const TEXT_INSET = 5;

export function textArea(element) {
  const { x, w } = element.bounds;
  return { x: x + TEXT_INSET, w: w - TEXT_INSET * 2 };
}

/** Apply the text box's capitalization (e.g. references set in all caps). */
export function applyCase(text, style) {
  return style.caps ? text.toUpperCase() : text;
}

export function maxLinesFor(element, fontMetrics) {
  return Math.max(1, Math.floor((element.bounds.h + 0.5) / linePitch(element.style, fontMetrics)));
}

/**
 * Balance a short text (a sermon point) over the fewest lines it needs, so
 * the lines come out close to equal length instead of one long line and a
 * stub. Leaves text that already has hard breaks alone.
 */
export function balanceLines(text, maxWidth, measure, style) {
  if (text.includes('\n') || /[{}]/.test(text)) return text;
  const lineCount = wrapLines(text, maxWidth, measure, style).length;
  const words = text.split(/\s+/).filter(Boolean);
  if (lineCount < 2 || lineCount > 4 || words.length > 40) return text;

  const space = measure(' ', style);
  const widths = words.map(w => measure(w, style));
  const span = (a, b) => widths.slice(a, b).reduce((s, w) => s + w, 0) + space * (b - a - 1);

  // Try every way to break into `lineCount` lines; prefer even lines and
  // breaks at phrase boundaries ("…for your life / in his power…")
  let best = null;
  const search = (start, breaks) => {
    if (breaks.length === lineCount - 1) {
      const lines = [...breaks, words.length].map((end, i) => [i ? breaks[i - 1] : 0, end]);
      const lineWidths = lines.map(([a, b]) => span(a, b));
      if (lineWidths.some(w => w > maxWidth)) return;
      let score = Math.max(...lineWidths);
      for (const b of breaks) {
        if (TRAILING_WEAK.has(words[b - 1].toLowerCase())) score += maxWidth * 0.25;
        if (LEADING_PHRASE.has(words[b].toLowerCase())) score -= maxWidth * 0.12;
      }
      if (!best || score < best.score) best = { score, breaks: [...breaks] };
      return;
    }
    for (let b = start + 1; b < words.length; b++) search(b, [...breaks, b]);
  };
  search(0, []);
  if (!best) return text;
  const ends = [...best.breaks, words.length];
  return ends.map((end, i) => words.slice(i ? ends[i - 1] : 0, end).join(' ')).join('\n');
}

// Words a line shouldn't end on, and words that start a phrase
const TRAILING_WEAK = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'and', 'or', 'but', 'his', 'her', 'my', 'your', 'our', 'their', 'its', 'is', 'are', 'will', 'be']);
const LEADING_PHRASE = new Set(['in', 'and', 'but', 'at', 'with', 'by', 'because', 'that', 'so', 'when', 'who', 'which', 'through']);

/**
 * Keep a paragraph from ending on a single word by moving a word or two down
 * with a hard break, the way the operators do by hand: "…in him all things /
 * hold together." Words like "a" or "on" go down with the word after them, so
 * the break never leaves them at a line end ("…even death / on a cross.").
 */
export function avoidShortLastLine(text, maxWidth, measure, style) {
  if (text.includes('\n')) return text;
  const lines = wrapLines(text, maxWidth, measure, style);
  if (lines.length < 2) return text;
  const last = lines[lines.length - 1];
  const prev = lines[lines.length - 2];
  if (last.words !== 1 || prev.words < 4) return text;
  const words = text.split(' ');
  let move = 2;
  while (move < 4 && TRAILING_WEAK.has(words[words.length - move - 1].toLowerCase().replace(/[^a-z]/g, ''))) move += 1;
  const breakAt = words.length - move;
  return words.slice(0, breakAt).join(' ') + '\n' + words.slice(breakAt).join(' ');
}

/**
 * Split text that is too tall for the box into chunks that fit, breaking
 * between sentences when possible, then between clauses, then between words.
 */
export function splitToFit(text, maxWidth, maxLines, measure, style) {
  const fits = t => wrapLines(t, maxWidth, measure, style).length <= maxLines;
  if (fits(text)) return [text];
  const flat = text.replace(/\n/g, ' ');
  for (const pattern of [/(?<=[.?!][’”"]?)\s+/, /(?<=[;:,—][’”"]?)\s*/, /\s+/]) {
    const pieces = flat.split(pattern).filter(Boolean);
    if (pieces.length < 2) continue;
    const chunks = [];
    let cur = '';
    let ok = true;
    for (const p of pieces) {
      const joiner = cur && !cur.endsWith('—') ? ' ' : '';
      const candidate = cur ? cur + joiner + p : p;
      if (fits(candidate)) {
        cur = candidate;
      } else {
        if (!cur || !fits(p)) {
          ok = false;
          break;
        }
        chunks.push(cur);
        cur = p;
      }
    }
    if (ok) {
      if (cur) chunks.push(cur);
      return chunks;
    }
  }
  return [text];
}
