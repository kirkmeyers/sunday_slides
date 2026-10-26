#!/usr/bin/env node
/**
 * Turn the NIV 1984 PDF into the JSON file Sunday Slides loads in Settings.
 *
 *   npm run niv84 -- reference/NIVBible_1984.pdf [reference/niv84.json]
 *
 * macOS only: the text comes out through PDFKit (scripts/pdf-runs.swift),
 * which reports each run's font. The PDF's typesetting carries the structure:
 * book titles are 24pt Times Bold, chapter numbers 24pt Arial Bold (Psalms
 * use a "PSALM n" heading instead), verse numbers 6.48pt. Running page
 * numbers and the few editorial notes are in other fonts and are skipped.
 *
 * The NIV is under copyright. The output stays on this machine (reference/
 * is gitignored) and is never part of the published site.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { smartQuotes } from '../src/bible.js';

const here = dirname(fileURLToPath(import.meta.url));

// The PDF's book titles, in canonical order (Bolls book ids 1-66)
const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1st Samuel', '2nd Samuel',
  '1st Kings', '2nd Kings', '1st Chronicles', '2nd Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1st Corinthians', '2nd Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1st Thessalonians', '2nd Thessalonians', '1st Timothy', '2nd Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1st Peter', '2nd Peter', '1st John', '2nd John', '3rd John', 'Jude', 'Revelation',
];

// Words that follow (or precede) an em dash far more often than a hyphen.
// The PDF prints every em dash as a hyphen, so "morning-the sixth day" has
// to be told apart from "seed-bearing".
const DASH_WORDS = new Set(`
  a an the this that these those his her its their our your my
  i you he she it we they him them us me who whom whose which what
  and but or nor for so yet if as because though although when while until unless
  to in on at by from with of not no all every everything everyone nothing
  even also both either neither then there here how why where
  only yes now just may can will must are were was have has had be do let make take
  after before about against over between upon through without except besides whether near
  still never indeed each men sons heads something like always twice dead
`.trim().split(/\s+/));

// Hyphenated words that start with a capital ("God-fearing", "Forty-two", "Ill-gotten")
const CAPITAL_COMPOUND = /^(God-\w+(ed|ing|ers?)|Sabbath-rest|(Ill|Self|Half|Well|All|Twenty|Thirty|Forty|Fifty|Sixty|Seventy|Eighty|Ninety)-\w+)$/;

/**
 * Is "a-b" an em dash rather than a hyphen? The PDF prints both the same way.
 * Names are capitalized on both sides ("Ben-Hadad"); compounds are lowercase
 * ("seed-bearing", "twenty-two"). A dash is likelier before a small function
 * word, between a word and a capitalized name, or after a capitalized word.
 */
function isDash(a, b) {
  const lower = b.toLowerCase();
  if (DASH_WORDS.has(lower) || b === 'I') return true;
  if (NUMBER_WORDS.has(lower) || TENS.has(lower)) return !TENS.has(a.toLowerCase()) && !NUMBER_WORDS.has(a.toLowerCase());
  const capA = /^[A-Z]/.test(a);
  const capB = /^[A-Z]/.test(b);
  if (!capA && capB) return true; // "musicians-Asaph"
  if (capA && !capB) return !CAPITAL_COMPOUND.test(`${a}-${b}`); // "Israel-against", but "God-fearing"
  return false;
}

/**
 * The PDF's runs in reading order. Pages are set in two columns, and the
 * PDF's own text order sometimes jumps (Malachi 3:16 comes after 4:4), so each
 * page is sorted by column, then top to bottom.
 */
const COLUMN_SPLIT = 200; // points from the left edge; columns start near 27 and 225

// "pasturelands—four", "wood—two"; but "twenty-two" and "two-tenths" stay hyphenated
const NUMBER_WORDS = new Set('one two three four five six seven eight nine ten eleven twelve'.split(' '));
const TENS = new Set('twenty thirty forty fifty sixty seventy eighty ninety'.split(' '));

function readRuns(pdf) {
  const out = execFileSync('swift', [join(here, 'pdf-runs.swift'), pdf], { maxBuffer: 1 << 28, encoding: 'utf8' });
  const runs = out.trim().split('\n').map((line, i) => ({ ...JSON.parse(line), i }));
  const column = r => (r.x >= COLUMN_SPLIT ? 1 : 0);
  return runs.sort((a, b) => a.p - b.p || column(a) - column(b) || b.y - a.y || a.x - b.x || a.i - b.i);
}

function classify(run) {
  const { f, z, s } = run;
  if (f === 'TimesNewRomanPS-BoldMT' && z === 24) return 'book';
  if (f === 'Arial-BoldMT' && z === 24) return 'chapter';
  if (f === 'TimesNewRomanPS-BoldMT' && z === 12 && /^PSALM \d+\s*$/.test(s)) return 'psalm';
  if ((z === 6.48 || z === 7.92) && /^\d+$/.test(s.trim())) return 'verse';
  if (z === 10.08 && (f === 'ArialMT' || f === 'Arial-ItalicMT')) return 'text';
  if (f === 'TimesNewRomanPSMT' && z === 12 && !/^\d+\s*$/.test(s)) return 'times'; // Psalm 150, or an added note
  return 'skip'; // page numbers, the front matter, editorial notes
}

// Chapters per book, to check the result
const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];

// Verses the NIV leaves out (they're in its footnotes), so their gaps are expected
const OMITTED = new Set([
  '40 17 21', '40 18 11', '40 23 14', '41 7 16', '41 9 44', '41 9 46', '41 11 26', '41 15 28',
  '42 17 36', '42 23 17', '43 5 4', '44 8 37', '44 15 34', '44 24 7', '44 28 29', '45 16 24',
]);

/**
 * Walk the runs and collect raw verse text: books[bookId][chapter][verse].
 * Runs don't always come in reading order (a book title can land mid-chapter,
 * a verse number after the verses that follow it), so text is filed under the
 * verse number it follows, and books start at their chapter 1 marker.
 */
function collect(runs) {
  const books = {};
  const problems = [];
  let book = 0;
  let chapter = 0;
  let verse = 0;
  let lastLine = '';
  const where = () => `${BOOKS[book - 1]} ${chapter}`;
  for (const run of runs) {
    const kind = classify(run);
    if (kind === 'chapter' || kind === 'psalm') {
      const n = Number(run.s.replace(/\D/g, ''));
      if (n === 1) {
        book += 1;
        books[book] = {};
        books[book][1] = {};
      } else if (!book) {
        continue;
      } else if (n !== chapter) {
        if (books[book][n]) problems.push(`Page ${run.p}: ${BOOKS[book - 1]} chapter ${n} appears twice.`);
        books[book][n] = {};
      } // else this chapter's later verse numbers came first; see below
      chapter = n;
      verse = 1; // the chapter number stands in for verse 1
    } else if (!book) {
      continue; // front matter
    } else if (kind === 'verse') {
      const n = Number(run.s.trim());
      if (n === verse) continue; // Psalms print verse 1 after the heading
      const verses = books[book][chapter];
      const last = vs => Math.max(0, ...Object.keys(vs || {}).map(Number));
      if (verses[n] !== undefined) {
        // A repeated verse number means the next chapter's numbers arrived before its chapter marker
        chapter += 1;
        books[book][chapter] ??= {};
        if (books[book][chapter][n] !== undefined) problems.push(`Page ${run.p}: ${where()}:${n} appears twice.`);
      } else if (n > last(verses) + 1 && last(books[book][chapter - 1]) === n - 1) {
        // Skipping ahead here but continuing the previous chapter exactly: the
        // previous chapter's end was laid out after this chapter's start (Psalm 149-150)
        chapter -= 1;
      }
      verse = n;
    } else if (kind === 'text' || (kind === 'times' && book === 19)) {
      // Times text outside the Psalms is the 2011 wording the PDF's maker added under a note (1 Peter 2:7)
      const verses = books[book][chapter];
      let text = verses[verse] || '';
      // A page's last line has no line break of its own ("gain-and" + "appoint")
      if (text && !/\s$/.test(text) && `${run.p} ${run.y}` !== lastLine) text += '\n';
      verses[verse] = text + run.s;
      lastLine = `${run.p} ${run.y}`;
    }
  }
  if (book !== BOOKS.length) problems.push(`Found ${book} books, expected ${BOOKS.length}.`);
  // Every chapter should run 1..last with no gaps, apart from the NIV's omissions
  for (const [b, chapters] of Object.entries(books)) {
    const last = CHAPTERS[b - 1];
    const count = Object.keys(chapters).length;
    if (count !== last) problems.push(`${BOOKS[b - 1]} has ${count} chapters, expected ${last}.`);
    for (let c = 1; c <= last; c++) {
      if (!chapters[c]) { problems.push(`${BOOKS[b - 1]} ${c} is missing.`); continue; }
      const vs = Object.keys(chapters[c]).map(Number);
      for (let v = 1; v <= Math.max(...vs); v++) {
        if (!chapters[c][v]?.trim() && !OMITTED.has(`${b} ${c} ${v}`)) problems.push(`${BOOKS[b - 1]} ${c}:${v} has no text.`);
      }
    }
  }
  return { books, problems };
}

/** Repair one verse: line breaks, em dashes, stray spaces, quotes. */
export function cleanVerse(raw) {
  let t = raw.replace(/\r/g, '').replace(/--/g, '\u2014');
  // "unborn- for he" is an em dash; a hyphen at a line end joins up and is
  // judged with the rest ("ground-\neverything" -> "ground—everything",
  // "seed-\nbearing" -> "seed-bearing")
  t = t.replace(/(\w)- +(?=\S)/g, '$1—');
  t = t.replace(/-\n/g, '-');
  t = t.replace(/-in-law/g, '\u0000in\u0000law'); // "sons-in-law" isn't "sons—in"
  t = t.replace(/([A-Za-z]+)-(?=([A-Za-z]+))/g, (m, a, b) => (isDash(a, b) ? `${a}\u2014` : m)); // overlapping: "silver-and-a"
  t = t.replace(/\u0000/g, '-');
  // Small caps were lost: "LORD" mostly comes out "Lord". A space left before
  // punctuation ("O Lord ,") marks the small caps, and the NIV always writes
  // "Sovereign LORD". The app restores the rest against the ESV.
  t = t.replace(/\bLord(?= +[,.;:!?])/g, 'LORD').replace(/\bSovereign\s+Lord\b/g, 'Sovereign LORD');
  t = t.replace(/\s*\n\s*/g, ' ');
  t = t.replace(/ +([,.;:!?)])/g, '$1'); // "Lord ," -> "Lord,"
  t = t.replace(/— +/g, '—').replace(/ +—/g, '—');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return smartQuotes(t);
}

function main() {
  const [pdf, out = join(here, '..', 'reference', 'niv84.json')] = process.argv.slice(2);
  if (!pdf) {
    console.error('Usage: npm run niv84 -- <NIVBible_1984.pdf> [output.json]');
    process.exit(1);
  }
  const { books, problems } = collect(readRuns(pdf));
  let verses = 0;
  const data = { translation: 'NIV', name: 'NIV 84', source: 'NIVBible_1984.pdf', books: {} };
  for (const [book, chapters] of Object.entries(books)) {
    data.books[book] = {};
    for (const [chapter, vs] of Object.entries(chapters)) {
      data.books[book][chapter] = {};
      for (const [n, raw] of Object.entries(vs)) {
        const text = cleanVerse(raw);
        if (!text) continue;
        data.books[book][chapter][n] = text;
        verses += 1;
      }
    }
  }
  const chapters = Object.values(data.books).reduce((sum, b) => sum + Object.keys(b).length, 0);
  writeFileSync(out, JSON.stringify(data));
  console.log(`${Object.keys(data.books).length} books, ${chapters} chapters, ${verses} verses -> ${out}`);
  if (problems.length) {
    console.log(`\n${problems.length} things to look at:`);
    for (const p of problems) console.log(`  ${p}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
