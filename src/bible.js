/**
 * Scripture helpers: book names, references, splitting manuscript text into
 * verses, poetry line breaks, and the Bolls Bible API (book map and fetch
 * carried over from porch_slides).
 */

// Bible book abbreviations -> Bolls book id and full name
const BOOK_MAP = {
  // Old Testament
  "gen": { id: 1, name: "Genesis" }, "ge": { id: 1, name: "Genesis" }, "gn": { id: 1, name: "Genesis" },
  "ex": { id: 2, name: "Exodus" }, "exo": { id: 2, name: "Exodus" },
  "lev": { id: 3, name: "Leviticus" }, "le": { id: 3, name: "Leviticus" }, "lv": { id: 3, name: "Leviticus" },
  "num": { id: 4, name: "Numbers" }, "nu": { id: 4, name: "Numbers" }, "nm": { id: 4, name: "Numbers" },
  "deut": { id: 5, name: "Deuteronomy" }, "de": { id: 5, name: "Deuteronomy" }, "dt": { id: 5, name: "Deuteronomy" },
  "josh": { id: 6, name: "Joshua" }, "jos": { id: 6, name: "Joshua" },
  "judg": { id: 7, name: "Judges" }, "jdg": { id: 7, name: "Judges" }, "jg": { id: 7, name: "Judges" }, "jud": { id: 7, name: "Judges" },
  "ruth": { id: 8, name: "Ruth" }, "ru": { id: 8, name: "Ruth" },
  "1sam": { id: 9, name: "1 Samuel" }, "1sa": { id: 9, name: "1 Samuel" }, "1s": { id: 9, name: "1 Samuel" },
  "2sam": { id: 10, name: "2 Samuel" }, "2sa": { id: 10, name: "2 Samuel" }, "2s": { id: 10, name: "2 Samuel" },
  "1ki": { id: 11, name: "1 Kings" }, "1k": { id: 11, name: "1 Kings" },
  "2ki": { id: 12, name: "2 Kings" }, "2k": { id: 12, name: "2 Kings" },
  "1chr": { id: 13, name: "1 Chronicles" }, "1ch": { id: 13, name: "1 Chronicles" },
  "2chr": { id: 14, name: "2 Chronicles" }, "2ch": { id: 14, name: "2 Chronicles" },
  "ezra": { id: 15, name: "Ezra" }, "ezr": { id: 15, name: "Ezra" },
  "neh": { id: 16, name: "Nehemiah" }, "ne": { id: 16, name: "Nehemiah" },
  "esth": { id: 17, name: "Esther" }, "est": { id: 17, name: "Esther" },
  "job": { id: 18, name: "Job" }, "jb": { id: 18, name: "Job" },
  "ps": { id: 19, name: "Psalms" }, "psa": { id: 19, name: "Psalms" }, "pss": { id: 19, name: "Psalms" }, "psalm": { id: 19, name: "Psalms" }, "psalms": { id: 19, name: "Psalms" },
  "prov": { id: 20, name: "Proverbs" }, "pr": { id: 20, name: "Proverbs" }, "pro": { id: 20, name: "Proverbs" },
  "eccles": { id: 21, name: "Ecclesiastes" }, "ec": { id: 21, name: "Ecclesiastes" }, "ecc": { id: 21, name: "Ecclesiastes" },
  "song": { id: 22, name: "Song of Solomon" }, "ss": { id: 22, name: "Song of Solomon" },
  "isa": { id: 23, name: "Isaiah" }, "is": { id: 23, name: "Isaiah" },
  "jer": { id: 24, name: "Jeremiah" }, "je": { id: 24, name: "Jeremiah" }, "jr": { id: 24, name: "Jeremiah" },
  "lam": { id: 25, name: "Lamentations" }, "la": { id: 25, name: "Lamentations" },
  "ezek": { id: 26, name: "Ezekiel" }, "eze": { id: 26, name: "Ezekiel" },
  "dan": { id: 27, name: "Daniel" }, "da": { id: 27, name: "Daniel" }, "dn": { id: 27, name: "Daniel" },
  "hos": { id: 28, name: "Hosea" }, "ho": { id: 28, name: "Hosea" },
  "joel": { id: 29, name: "Joel" }, "jl": { id: 29, name: "Joel" },
  "amos": { id: 30, name: "Amos" }, "am": { id: 30, name: "Amos" },
  "obad": { id: 31, name: "Obadiah" }, "ob": { id: 31, name: "Obadiah" },
  "jon": { id: 32, name: "Jonah" }, "jnh": { id: 32, name: "Jonah" },
  "mic": { id: 33, name: "Micah" }, "mi": { id: 33, name: "Micah" },
  "nah": { id: 34, name: "Nahum" }, "na": { id: 34, name: "Nahum" },
  "hab": { id: 35, name: "Habakkuk" }, "ha": { id: 35, name: "Habakkuk" },
  "zeph": { id: 36, name: "Zephaniah" }, "zep": { id: 36, name: "Zephaniah" }, "zp": { id: 36, name: "Zephaniah" },
  "hag": { id: 37, name: "Haggai" }, "hg": { id: 37, name: "Haggai" },
  "zech": { id: 38, name: "Zechariah" }, "zec": { id: 38, name: "Zechariah" }, "zc": { id: 38, name: "Zechariah" },
  "mal": { id: 39, name: "Malachi" }, "ml": { id: 39, name: "Malachi" },

  // New Testament
  "matt": { id: 40, name: "Matthew" }, "mt": { id: 40, name: "Matthew" },
  "mark": { id: 41, name: "Mark" }, "mk": { id: 41, name: "Mark" }, "mr": { id: 41, name: "Mark" },
  "luke": { id: 42, name: "Luke" }, "lk": { id: 42, name: "Luke" }, "lu": { id: 42, name: "Luke" },
  "john": { id: 43, name: "John" }, "jn": { id: 43, name: "John" }, "jo": { id: 43, name: "John" },
  "acts": { id: 44, name: "Acts" }, "ac": { id: 44, name: "Acts" },
  "rom": { id: 45, name: "Romans" }, "ro": { id: 45, name: "Romans" }, "rm": { id: 45, name: "Romans" },
  "1cor": { id: 46, name: "1 Corinthians" }, "1co": { id: 46, name: "1 Corinthians" },
  "2cor": { id: 47, name: "2 Corinthians" }, "2co": { id: 47, name: "2 Corinthians" },
  "gal": { id: 48, name: "Galatians" }, "ga": { id: 48, name: "Galatians" },
  "eph": { id: 49, name: "Ephesians" }, "ep": { id: 49, name: "Ephesians" },
  "phil": { id: 50, name: "Philippians" }, "php": { id: 50, name: "Philippians" },
  "col": { id: 51, name: "Colossians" }, "co": { id: 51, name: "Colossians" },
  "1thess": { id: 52, name: "1 Thessalonians" }, "1th": { id: 52, name: "1 Thessalonians" },
  "2thess": { id: 53, name: "2 Thessalonians" }, "2th": { id: 53, name: "2 Thessalonians" },
  "1tim": { id: 54, name: "1 Timothy" }, "1ti": { id: 54, name: "1 Timothy" },
  "2tim": { id: 55, name: "2 Timothy" }, "2ti": { id: 55, name: "2 Timothy" },
  "titus": { id: 56, name: "Titus" }, "tit": { id: 56, name: "Titus" },
  "philem": { id: 57, name: "Philemon" }, "phm": { id: 57, name: "Philemon" },
  "heb": { id: 58, name: "Hebrews" },
  "jas": { id: 59, name: "James" }, "jmes": { id: 59, name: "James" },
  "1pet": { id: 60, name: "1 Peter" }, "1pe": { id: 60, name: "1 Peter" },
  "2pet": { id: 61, name: "2 Peter" }, "2pe": { id: 61, name: "2 Peter" },
  "1jn": { id: 62, name: "1 John" }, "1john": { id: 62, name: "1 John" },
  "2jn": { id: 63, name: "2 John" }, "2john": { id: 63, name: "2 John" },
  "3jn": { id: 64, name: "3 John" }, "3john": { id: 64, name: "3 John" },
  "jude": { id: 65, name: "Jude" },
  "rev": { id: 66, name: "Revelation" }, "re": { id: 66, name: "Revelation" }
};

// Automatically populate BOOK_MAP with canonical names
Object.keys(BOOK_MAP).forEach(key => {
  const value = BOOK_MAP[key];
  const canonicalKey = value.name.toLowerCase().replace(/\s+/g, '');
  if (!BOOK_MAP[canonicalKey]) {
    BOOK_MAP[canonicalKey] = value;
  }
});


// Automatically populate BOOK_MAP with canonical names
Object.keys(BOOK_MAP).forEach(key => {
  const value = BOOK_MAP[key];
  const canonicalKey = value.name.toLowerCase().replace(/\s+/g, '');
  if (!BOOK_MAP[canonicalKey]) {
    BOOK_MAP[canonicalKey] = value;
  }
});

// Translations offered in the editor, as Bolls database codes -> how slides print them
// (same list as porch_slides)
export const TRANSLATIONS = {
  ESV: 'ESV',
  KJV: 'KJV',
  NIV2011: 'NIV',
  NIV: 'NIV 84',
  NASB: 'NASB',
  NASB_1995: 'NASB 1995',
  NLT: 'NLT',
  ASV: 'ASV',
  CSB17: 'CSB',
};

// What request files and manuscripts write -> Bolls code
const TRANSLATION_ALIASES = {
  esv: 'ESV',
  kjv: 'KJV',
  niv: 'NIV2011',
  niv2011: 'NIV2011',
  'niv 84': 'NIV',
  niv84: 'NIV',
  nasb: 'NASB',
  'nasb 1995': 'NASB_1995',
  nasb1995: 'NASB_1995',
  nasb_1995: 'NASB_1995',
  nlt: 'NLT',
  asv: 'ASV',
  csb: 'CSB17',
  csb17: 'CSB17',
};

/** "NIV" -> "NIV2011", "csb" -> "CSB17"; unknown names come back uppercased. */
export function normalizeTranslation(raw) {
  const key = (raw || 'ESV').trim().toLowerCase();
  return TRANSLATION_ALIASES[key] || key.toUpperCase();
}

/** A translation code as-is ("NIV" is the NIV 84 code), anything else normalized. */
function toCode(t) {
  return TRANSLATIONS[t] ? t : normalizeTranslation(t);
}

/** How a translation code prints on a slide: "NIV2011" -> "NIV". */
export function translationName(code) {
  return TRANSLATIONS[code] || code;
}

// Job, Psalms, Proverbs, Song of Solomon, Lamentations
const POETIC_BOOK_IDS = new Set([18, 19, 20, 22, 25]);

export function lookupBook(raw) {
  const key = raw.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  return BOOK_MAP[key] || null;
}

export function isPoeticBook(bookId) {
  return POETIC_BOOK_IDS.has(Number(bookId));
}

/** Bolls no longer serves the NIV, so NIV text has to come from the manuscript or be typed in. */
export function isNivTranslation(t) {
  return /^NIV/i.test((t || '').trim());
}

// Translations loaded from a file on this machine (scripts/niv84.js, scripts/rvbible.js),
// keyed by code: { books: { [bookId]: { [chapter]: { [verse]: text } } } }
const localBibles = {};

/** Use (or with null, stop using) a translation file loaded on this machine. */
export function setLocalBible(code, data) {
  if (data) localBibles[code] = data;
  else delete localBibles[code];
  for (const key of Object.keys(chapterCache)) if (key.startsWith(`${code}_`)) delete chapterCache[key];
}

export function hasLocalBible(code) {
  return Boolean(localBibles[toCode(code)]);
}

/** Can the tool get this translation's text, from Bolls or a local file? */
export function canFetchTranslation(t) {
  return !isNivTranslation(t) || hasLocalBible(t);
}

/** Where a translation's text comes from, for the compare box. */
export function textSource(t) {
  return hasLocalBible(t) ? 'local file' : 'Bolls';
}

/**
 * The NIV 84 file lost its small caps, so many a LORD reads "Lord". The ESV
 * uses the same convention (LORD for the divine name), so take each Lord's
 * case from the ESV verse when both have the same number of them. "Sovereign
 * LORD" (the ESV's "Lord GOD") is already right and is left out of the count.
 */
export function restoreLord(text, esv) {
  const ours = [...text.matchAll(/\bLord\b|\bLORD\b/gi)].filter(m => !/Sovereign\s+$/.test(text.slice(0, m.index)));
  const theirs = [...(esv || '').matchAll(/\bLord\b|\bLORD\b/g)].filter(m => !/^\s+GOD\b/.test(esv.slice(m.index + 4)));
  if (!ours.length || ours.length !== theirs.length) return text;
  let out = text;
  ours.forEach((m, i) => (out = out.slice(0, m.index) + theirs[i][0] + out.slice(m.index + 4)));
  return out;
}

async function localChapter(code, bookId, chapter) {
  const verses = localBibles[code]?.books?.[bookId]?.[chapter];
  if (!verses) return null;
  let result = Object.entries(verses).map(([verse, text]) => ({ verse: Number(verse), text }));
  if (code === 'NIV' && bookId <= 39 && result.some(v => /\bLord\b/.test(v.text))) {
    const esv = await fetchChapter(bookId, chapter, 'ESV');
    if (esv) result = result.map(v => ({ ...v, text: restoreLord(v.text, esv.find(e => e.verse === v.verse)?.text) }));
  }
  return result;
}

/**
 * Parse a reference like "Acts 26:1-8", "Psalms 139:16", "Romans 8:18 (NIV)"
 * or "Acts 27:44-28:2". Returns null if it isn't a reference we understand.
 */
export function parseReference(raw, defaultTranslation = 'ESV') {
  const m = raw.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?)?\s*(?:\(([^)]+)\))?$/);
  if (!m) return null;
  const book = lookupBook(m[1]);
  if (!book) return null;
  const chapter = +m[2];
  const startVerse = m[3] ? +m[3] : null;
  const endChapter = m[4] ? +m[4] : chapter;
  const endVerse = m[5] ? +m[5] : startVerse;
  return {
    bookId: book.id,
    book: book.name,
    chapter,
    startVerse,
    endChapter,
    endVerse,
    translation: normalizeTranslation(m[6] || defaultTranslation),
  };
}

/** Book name as slides print it: a single psalm is "Psalm", several are "Psalms". */
function displayBook(ref) {
  if (ref.bookId === 19 && ref.chapter === ref.endChapter) return 'Psalm';
  return ref.book;
}

/** Format a parsed reference for the slide, e.g. "Acts 27:21-25". */
export function formatReference(ref) {
  const book = displayBook(ref);
  if (ref.startVerse == null) return `${book} ${ref.chapter}`;
  if (ref.endChapter !== ref.chapter) return `${book} ${ref.chapter}:${ref.startVerse}-${ref.endChapter}:${ref.endVerse}`;
  if (ref.endVerse !== ref.startVerse) return `${book} ${ref.chapter}:${ref.startVerse}-${ref.endVerse}`;
  return `${book} ${ref.chapter}:${ref.startVerse}`;
}

/** Curly quotes and apostrophes, as typeset Bibles print them. */
export function smartQuotes(text) {
  return text
    .replace(/(\w)'(\w)/g, '$1’$2') // Paul's
    .replace(/(^|[\s(—\[“])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/(^|[\s(—\[‘])"/g, '$1“')
    .replace(/"/g, '”');
}

/** Tidy manuscript or API verse text: footnote markers, stray spaces, HTML, quotes. */
export function cleanVerseText(text) {
  return smartQuotes(text)
    .replace(/<[^>]+>/g, '')
    .replace(/\[[a-z]{1,2}\]/g, '') // footnote markers copied from Bible websites: "Paul[a]"
    .replace(/\s+([,;:!?.’”)\]])/g, '$1')
    .replace(/([‘“(])\s+/g, '$1')
    .replace(/\s*—\s*/g, '—') // ESV prints em dashes closed up
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split an entry's manuscript text into verses using the inline verse numbers.
 * The listener keeps the numbers inline ("... with me. 14 And when ...") and the
 * first verse often has none, so we walk the expected numbers in order.
 *
 * Returns { verses: [{ n, text }], startVerse, warnings[] }. `startVerse` can be
 * earlier than the reference says when the text clearly begins a verse sooner
 * (e.g. "Acts 25:2-3" whose text starts with verse 1).
 */
export function splitVerses(rawText, ref) {
  const warnings = [];
  let text = cleanVerseText(rawText);
  if (ref.startVerse == null || ref.endChapter !== ref.chapter) {
    // Whole chapters or cross-chapter ranges: keep as one block
    return { verses: [{ n: ref.startVerse, text }], startVerse: ref.startVerse, warnings };
  }

  const markerAt = (n, from) => {
    const re = new RegExp(`(^|[\\s“”‘’"(—])${n}\\s+(?=\\S)`, 'g');
    re.lastIndex = from;
    const m = re.exec(text);
    return m ? { index: m.index + m[1].length, end: m.index + m[0].length } : null;
  };

  let start = ref.startVerse;
  const lead = text.match(/^(\d{1,3})\s+/);
  if (lead && +lead[1] >= start - 1 && +lead[1] <= ref.endVerse) {
    start = +lead[1];
    text = text.slice(lead[0].length);
  } else {
    // No leading number. If the reference's own first verse number shows up
    // later, the text in front of it is the verse before.
    const own = markerAt(start, 0);
    if (own && own.index > 0 && start > 1) {
      warnings.push(`Text starts a verse earlier than ${ref.chapter}:${ref.startVerse}; reference changed to start at ${ref.chapter}:${start - 1}.`);
      start -= 1;
    }
  }

  const verses = [];
  let n = start;
  let pos = 0;
  let bodyStart = 0;
  while (n < ref.endVerse) {
    const next = markerAt(n + 1, pos);
    if (!next) {
      warnings.push(`Couldn't find verse ${n + 1} in the text; it stays with verse ${n}.`);
      break;
    }
    verses.push({ n, text: text.slice(bodyStart, next.index).trim() });
    n += 1;
    pos = next.end;
    bodyStart = next.end;
  }
  verses.push({ n, text: text.slice(bodyStart).trim() });
  return { verses: verses.filter(v => v.text), startVerse: start, warnings };
}

/**
 * Break a poetic verse into its lines the way printed Bibles set them:
 * at semicolons, colons and exclamations, then long lines at the comma
 * nearest their middle.
 */
export function poeticLines(text) {
  const words = s => s.split(/\s+/).filter(Boolean).length;
  const strong = text.split(/(?<=[;:!?][’”"]?)\s+/);
  const out = [];
  const splitLong = line => {
    if (words(line) <= 9) return out.push(line);
    const commas = [...line.matchAll(/,[’”"]?\s+/g)];
    const mid = line.length / 2;
    let best = null;
    for (const c of commas) {
      const left = line.slice(0, c.index + c[0].trimEnd().length);
      const right = line.slice(c.index + c[0].length);
      if (words(left) < 3 || words(right) < 3) continue;
      if (!best || Math.abs(c.index - mid) < Math.abs(best.index - mid)) best = { index: c.index, left, right };
    }
    if (!best) return out.push(line);
    splitLong(best.left);
    splitLong(best.right);
  };
  strong.forEach(splitLong);
  return out.join('\n');
}

// --- Bolls Bible API -----------------------------------------------------

const chapterCache = {};

function isUsableChapterData(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  if (data.some(v => v.text && v.text.includes('has prohibited me from using'))) return false;
  if (data.length >= 2 && data.every(v => (v.text || '').trim() === (data[0].text || '').trim())) return false;
  return true;
}

/**
 * Fetch a chapter from Bolls, with retry on 429. Returns [{ verse, text }] or
 * null. A translation loaded from a local file comes from that instead. Bolls
 * no longer serves the NIV, so NIV requests without a local file return null
 * and the caller falls back to the manuscript text ("text needed").
 */
export async function fetchChapter(bookId, chapter, translation = 'ESV') {
  let code = toCode(translation);
  if (localBibles[code]) {
    const key = `${code}_${bookId}_${chapter}`;
    chapterCache[key] ??= await localChapter(code, bookId, chapter);
    return chapterCache[key];
  }
  if (isNivTranslation(code)) return null;
  if (code === 'NASB_1995') code = 'NASB';
  const cacheKey = `${code}_${bookId}_${chapter}`;
  if (chapterCache[cacheKey]) return chapterCache[cacheKey];

  const url = `https://bolls.life/get-text/${code}/${bookId}/${chapter}/`;
  const backoff = [1000, 2000, 4000];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 && attempt < backoff.length) {
        await new Promise(r => setTimeout(r, backoff[attempt]));
        continue;
      }
      if (!res.ok) throw new Error(`Bolls returned ${res.status}`);
      const data = await res.json();
      if (!isUsableChapterData(data)) return null;
      const cleaned = data.map(v => ({ verse: v.verse, text: cleanVerseText(stripStudyMarkers(v.text || '', code)) }));
      chapterCache[cacheKey] = cleaned;
      return cleaned;
    } catch (err) {
      console.error(`Bolls fetch failed for ${cacheKey}:`, err);
      return null;
    }
  }
  return null;
}

/**
 * Remove study markers some Bolls translations carry (from porch_slides):
 * Strong's numbers in the KJV (<S>2532</S>) and footnote letters in the CSB.
 */
export function stripStudyMarkers(text, code) {
  if (code === 'KJV') return text.replace(/<S[\s\S]*?<\/S>/gi, '');
  if (code === 'CSB17') {
    return text
      .replace(/<sup[\s\S]*?<\/sup>/gi, '')
      .replace(/\[[\u24D0-\u24E9\u24B6-\u24CF]\]/gu, '')
      .replace(/[\u24D0-\u24E9\u24B6-\u24CF]/gu, '');
  }
  return text;
}

/** Fold text for comparison: case, punctuation, quote styles and spacing. */
function fold(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Compare a manuscript verse with the published text.
 *   'same'     - matches (ignoring punctuation and spacing)
 *   'spacing'  - only spaces differ (e.g. "inthe"); safe to take the published text
 *   'partial'  - the manuscript quotes the start of the verse; `rest` is what it left off
 *   'differs'  - anything else
 */
export function compareVerse(manuscript, published) {
  const a = fold(manuscript);
  const b = fold(published);
  if (a === b) return { kind: 'same' };
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return { kind: 'spacing' };
  if (a.length >= 12 && b.startsWith(a + ' ')) {
    // Find where the quoted part ends in the published text, by word count
    const quotedWords = a.split(' ').length;
    const pubWords = published.split(/\s+/);
    let seen = 0;
    let cut = 0;
    for (let i = 0; i < pubWords.length && seen < quotedWords; i++) {
      seen += fold(pubWords[i]).split(' ').filter(Boolean).length;
      cut = i + 1;
    }
    return { kind: 'partial', rest: pubWords.slice(cut).join(' ') };
  }
  return { kind: 'differs' };
}
