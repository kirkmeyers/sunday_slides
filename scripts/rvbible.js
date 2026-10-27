#!/usr/bin/env node
/**
 * Turn ProPresenter .rvbible files into the same JSON shape as niv84.json,
 * one file per translation, for Settings → Load translation file.
 *
 *   npm run rvbible -- <file.rvbible>... [--out reference]
 *
 * An .rvbible is a zipped Digital Bible Library bundle: rvmetadata.xml names
 * the translation and release/USX_1/*.usx holds one book per file. Verse
 * markers are milestones, so text belongs to the last verse opened until the
 * next one (or its eid marker). Headings, Psalm titles, introductions and
 * notes are left out, like the NIV 84 file; small-caps "Lord" (nd, sc) is
 * printed LORD.
 *
 * These are licensed texts. The output stays on this machine (reference/*.json
 * is gitignored) and is never part of the published site.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { smartQuotes } from '../src/bible.js';

const here = dirname(fileURLToPath(import.meta.url));

// USX book codes in canonical order (Bolls book ids 1-66)
const BOOKS = `GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM
  EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH
  2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV`.trim().split(/\s+/);

// rvmetadata abbreviation -> Sunday Slides translation code (bible.js TRANSLATIONS) and name
const CODES = {
  ESV: { translation: 'ESV', name: 'ESV', file: 'esv.json' },
  NIV: { translation: 'NIV2011', name: 'NIV', file: 'niv2011.json' },
  CSB: { translation: 'CSB17', name: 'CSB', file: 'csb.json' },
  NASB: { translation: 'NASB_1995', name: 'NASB 1995', file: 'nasb1995.json' },
  NLT: { translation: 'NLT', name: 'NLT', file: 'nlt.json' },
  ASV: { translation: 'ASV', name: 'ASV', file: 'asv.json' },
  NKJV: { translation: 'NKJV', name: 'NKJV', file: 'nkjv.json' },
};

// Paragraph styles that aren't verse text: running heads, titles, intros,
// section headings, Psalm titles (d), chapter labels, acrostic letters, speakers
const SKIP_PARA = /^(ide|rem|h|toc\d*|mt\d*|imt\d*|im|ip|ie|iex|ili\d*|is\d*|s\d*|ms\d*|mr|r|d|cl|qa|sp)$/;
const SMALL_CAPS = new Set(['nd', 'sc']);

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function cleanVerse(raw) {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/([a-z][,;:.!?])(?=[A-Za-z])/g, '$1 '); // "holy mountain.Selah" where a note was cut out
  t = t.replace(/ +([,.;:!?’”)\]])/g, '$1'); // "Lord ," -> "Lord,"
  t = t.replace(/([‘“(\[]) +/g, '$1');
  t = t.replace(/ *— */g, '—');
  return smartQuotes(t);
}

/** One USX book -> { [chapter]: { [verse]: raw text } }, plus any merged verses ("20-21"). */
function parseBook(xml) {
  const chapters = {};
  const merged = [];
  const paras = []; // open para styles
  const chars = []; // open char styles
  let noteDepth = 0;
  let chapter = null;
  let verse = null;

  const add = text => {
    if (chapter == null || verse == null) return;
    chapters[chapter][verse] = (chapters[chapter][verse] || '') + text;
  };

  for (const [token] of xml.matchAll(/<[^>]+>|[^<]+/g)) {
    if (token[0] !== '<') {
      const para = paras.at(-1);
      if (noteDepth || (para && SKIP_PARA.test(para))) continue;
      const text = decode(token);
      add(chars.some(s => SMALL_CAPS.has(s)) ? text.toUpperCase() : text);
      continue;
    }
    const closing = token[1] === '/';
    const selfClosing = token.endsWith('/>');
    const name = token.match(/^<\/?([a-zA-Z]+)/)?.[1];

    if (name === 'note' || name === 'figure') {
      if (closing) noteDepth -= 1;
      else if (!selfClosing) noteDepth += 1;
    } else if (noteDepth) {
      continue;
    } else if (name === 'chapter' && !closing) {
      const n = attr(token, 'number');
      if (n) {
        chapter = n;
        chapters[chapter] ??= {};
        verse = null;
      }
    } else if (name === 'verse' && !closing) {
      const n = attr(token, 'number');
      if (n) {
        // A numbered verse inside a title (Habakkuk 3:1) is verse text after all
        if (paras.length && SKIP_PARA.test(paras.at(-1))) paras[paras.length - 1] = 'p';
        verse = n.match(/^\d+/)[0];
        if (n !== verse) merged.push(`${chapter}:${n}`);
      } else if (attr(token, 'eid')) {
        verse = null;
      }
    } else if (name === 'para') {
      if (closing) paras.pop();
      else if (!selfClosing) paras.push(attr(token, 'style') || '');
      add(' ');
    } else if (name === 'char') {
      if (closing) chars.pop();
      else if (!selfClosing) chars.push(attr(token, 'style') || '');
    } else if (name === 'cell' || name === 'row') {
      add(' ');
    }
  }
  return { chapters, merged };
}

async function convert(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const meta = await zip.file('rvmetadata.xml').async('string');
  const abbreviation = decode(meta.match(/<abbreviation>([^<]*)</)[1]).trim();
  const target = CODES[abbreviation];
  if (!target) throw new Error(`${basename(path)}: no translation code for "${abbreviation}"`);

  const data = { translation: target.translation, name: target.name, source: basename(path), books: {} };
  const problems = [];
  let verses = 0;
  for (const [i, code] of BOOKS.entries()) {
    const entry = zip.file(new RegExp(`(^|/)${code}\\.usx$`))[0];
    if (!entry) {
      problems.push(`${code}: book missing`);
      continue;
    }
    const { chapters, merged } = parseBook((await entry.async('string')).replace(/^﻿/, ''));
    merged.forEach(ref => problems.push(`${code} ${ref}: combined verses, kept under the first number`));
    const book = (data.books[i + 1] = {});
    for (const [chapter, vs] of Object.entries(chapters)) {
      book[chapter] = {};
      for (const [n, raw] of Object.entries(vs)) {
        const text = cleanVerse(raw);
        if (!text) continue;
        book[chapter][n] = text;
        verses += 1;
      }
    }
  }
  return { data, target, verses, problems };
}

async function main() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const outDir = outAt >= 0 ? args.splice(outAt, 2)[1] : join(here, '..', 'reference');
  if (!args.length) {
    console.error('Usage: npm run rvbible -- <file.rvbible>... [--out reference]');
    process.exit(1);
  }
  for (const path of args) {
    const { data, target, verses, problems } = await convert(path);
    const out = join(outDir, target.file);
    const chapters = Object.values(data.books).reduce((sum, b) => sum + Object.keys(b).length, 0);
    writeFileSync(out, JSON.stringify(data));
    console.log(`${data.name}: ${Object.keys(data.books).length} books, ${chapters} chapters, ${verses} verses -> ${out}`);
    for (const p of problems) console.log(`  ${p}`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
