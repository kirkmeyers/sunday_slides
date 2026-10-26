/**
 * Turn parsed request entries into slides, in sermon order.
 *
 * Slide shape:
 * {
 *   id, kind: 'scripture' | 'quote' | 'point' | 'text' | 'blank' | 'placeholder',
 *   layout: theme layout key ('scripture' | 'point'), or null for placeholders,
 *   group: id shared by slides made from one request entry,
 *   text: slide text (see layout.js for \n and {dim} markup),
 *   reference: reference line (scripture), or the author (quote),
 *   ref: { bookId, chapter, verse, translation, label, sourceTranslation } for
 *        scripture slides (translation is a Bolls code; label is the reference
 *        without translation; sourceTranslation is what the request file used),
 *   manuscript: the request file's text of that verse (scripture),
 *   verseText: the manuscript's text of that verse (scripture),
 *   parts: how many slides one verse was split across (scripture),
 *   source: the text before automatic line breaks, for re-layout,
 *   cues: production cues carried as ProPresenter notes,
 *   checks: things the operator should look at, shown as badges,
 *   edited: true once the operator changes the text by hand
 * }
 */

import { parseReference, formatReference, splitVerses, poeticLines, isPoeticBook, smartQuotes, translationName } from './bible.js';
import { wrapLines, maxLinesFor, balanceLines, avoidShortLastLine, splitToFit, textArea } from './layout.js';

let nextId = 1;
export function newId() {
  return `s${Date.now().toString(36)}${(nextId++).toString(36)}`;
}

export const KIND_LABELS = {
  scripture: 'Scripture',
  quote: 'Quote',
  point: 'Point',
  text: 'Text',
  blank: 'Blank',
  placeholder: 'Placeholder',
};

export function layoutForKind(kind) {
  if (kind === 'scripture' || kind === 'quote') return 'scripture';
  if (kind === 'placeholder') return null;
  return 'point';
}

/** Strip the outer quote marks a manuscript puts around a quote. */
function stripOuterQuotes(text) {
  return text.trim().replace(/^[“"‘']+/, '').replace(/[”"’']+$/, '').trim();
}

/** "“Quote…” – Charles Swindoll" -> { text, author } */
export function splitQuote(value) {
  const m = value.match(/^(.*\S)\s+[–—-]\s+([^–—]+)$/);
  if (!m) return { text: stripOuterQuotes(value), author: '' };
  return { text: stripOuterQuotes(m[1]), author: m[2].trim() };
}

function makeSlide(kind, fields) {
  return {
    id: newId(),
    kind,
    layout: layoutForKind(kind),
    group: fields.group || newId(),
    text: '',
    reference: '',
    ref: null,
    source: fields.text || '',
    cues: [],
    checks: [],
    edited: false,
    ...fields,
  };
}

/** "Romans 8:18" + NIV2011 -> "Romans 8:18 (NIV)". The ESV, Sunday's default, isn't named. */
export function scriptureReference(label, translation) {
  return translation && translation !== 'ESV' ? `${label} (${translationName(translation)})` : label;
}

/**
 * A slide's reference as labels show it (ProPresenter slide and group labels,
 * grid, proof sheet): a non-ESV translation is named there, never on the slide.
 */
export function referenceLabel(slide) {
  return slide.kind === 'scripture' && slide.ref ? scriptureReference(slide.reference, slide.ref.translation) : slide.reference;
}

/**
 * Rebuild a passage's slides in another translation, one slide per verse
 * (before automatic line breaks). `verses` is [{ n, text }]; a verse with no
 * text becomes a "text needed" slide. Cues stay on the first slide.
 */
export function passageSlides(first, verses, translation, cues) {
  const reference = first.ref.label;
  return verses.map((v, i) => makeSlide('scripture', {
    group: first.group,
    text: v.text,
    verseText: v.text,
    manuscript: v.manuscript,
    reference,
    ref: { ...first.ref, verse: v.n, translation },
    cues: i === 0 ? cues : [],
    checks: i === 0 ? first.checks.filter(c => !(typeof c === 'object' && c.esv)) : [],
    needsText: !v.text,
  }));
}

/**
 * Build slides from a parsed request file. Line breaks and long-verse splits
 * need font measurement, so they happen afterwards in `layoutSlides`.
 */
export function buildSlides(parsed) {
  const translation = parsed.header.translation || 'ESV';
  const slides = [];
  let pendingCues = [];

  const add = slide => {
    slide.cues.push(...pendingCues);
    pendingCues = [];
    slides.push(slide);
  };

  parsed.entries.forEach((entry, index) => {
    const group = `e${index}`;
    if (entry.type === 'cue') {
      pendingCues.push(entry.value);
      return;
    }
    if (entry.type === 'point' || entry.type === 'text') {
      add(makeSlide(entry.type, { group, text: smartQuotes(entry.value), checks: [...entry.checks] }));
      return;
    }
    if (entry.type === 'quote') {
      const q = splitQuote(smartQuotes(entry.value));
      const checks = [...entry.checks];
      if (!q.author) checks.push('No author found after " – ".');
      add(makeSlide('quote', { group, text: q.text, reference: q.author, checks }));
      return;
    }
    if (entry.type === 'scripture') {
      const ref = parseReference(entry.value, translation);
      if (!ref) {
        add(makeSlide('scripture', {
          group,
          text: entry.lines.join(' '),
          reference: entry.value,
          checks: [`Couldn't read the reference "${entry.value}".`, ...entry.checks],
        }));
        return;
      }
      const split = entry.lines.length
        ? splitVerses(entry.lines.join(' '), ref)
        : { verses: [], startVerse: ref.startVerse, warnings: ['No verse text in the request file; fetch it from Bolls.'] };
      const shownRef = { ...ref, startVerse: split.startVerse };
      const label = formatReference(shownRef);
      const reference = label; // the translation goes in the label, not on the slide
      const verses = split.verses.length ? split.verses : [{ n: ref.startVerse, text: '' }];
      verses.forEach((v, i) => {
        add(makeSlide('scripture', {
          group,
          text: v.text,
          verseText: v.text, // the manuscript's verse, for checking against the ESV
          reference,
          ref: { bookId: ref.bookId, chapter: ref.chapter, verse: v.n, translation: ref.translation, label, sourceTranslation: ref.translation },
          manuscript: v.text,
          // Entry-level notes only on the entry's first slide
          checks: i === 0 ? [...entry.checks, ...split.warnings] : [],
          needsText: !v.text,
        }));
      });
    }
  });

  // Cues after the last slide ride on the last slide
  if (pendingCues.length && slides.length) slides[slides.length - 1].cues.push(...pendingCues);
  return slides;
}

/**
 * Apply automatic line breaks and split verses too long for one slide.
 * Slides the operator edited by hand are left as they are.
 *
 * @param slides     slide list (not modified)
 * @param layouts    resolved theme layouts
 * @param measure    (str, style) -> width in px
 * @param metricsFor (style) -> { ascent, descent } in px
 */
export function layoutSlides(slides, layouts, measure, metricsFor) {
  const out = [];
  for (const slide of slides) {
    if (slide.edited || !slide.layout || slide.kind === 'blank') {
      out.push(slide);
      continue;
    }
    const el = layouts[slide.layout].text;
    const width = textArea(el).w;
    const style = el.style;
    const source = slide.source || slide.text;

    if (slide.kind === 'point' || slide.kind === 'text') {
      out.push({ ...slide, text: balanceLines(source, width, measure, style) });
      continue;
    }

    const poetic = slide.kind === 'scripture' && slide.ref && isPoeticBook(slide.ref.bookId);
    let text = poetic ? poeticLines(source) : source;
    const maxLines = maxLinesFor(el, metricsFor(style));
    const chunks = poetic ? [text] : splitToFit(text, width, maxLines, measure, style);
    chunks.forEach((chunk, i) => {
      let t = poetic ? chunk : avoidShortLastLine(chunk, width, measure, style);
      const tooTall = wrapLines(t, width, measure, style).length > maxLines;
      out.push({
        ...slide,
        id: i === 0 ? slide.id : newId(),
        source: chunks.length > 1 ? chunk : source,
        text: t,
        cues: i === 0 ? slide.cues : [],
        checks: i === 0 ? slide.checks : [],
        parts: chunks.length,
        overflow: tooTall,
      });
    });
  }
  return out;
}
