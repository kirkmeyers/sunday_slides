import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRequestFile, extractCommunicatorLastName, serviceDateCode } from '../src/requests.js';
import { parseReference, formatReference, splitVerses, poeticLines, compareVerse, cleanVerseText } from '../src/bible.js';
import { buildSlides, splitQuote } from '../src/slides.js';
import { parseTheme, resolveLayouts } from '../src/theme.js';
import { buildPresentation, fillRtf } from '../src/propresenter.js';
import { decode } from '../src/protobuf.js';

const sample = name => readFileSync(new URL(`../reference/${name}`, import.meta.url), 'utf8');

test('parses the header, flags and entries of a request file', () => {
  const p = parseRequestFile(sample('20261018_DAL_requests.txt'));
  assert.equal(p.header.communicator, 'Timothy Ateek');
  assert.equal(p.header.service, '2026-10-18');
  assert.equal(p.flags.length, 1);
  assert.equal(p.entries[0].type, 'point');
  assert.equal(p.entries[1].type, 'scripture');
  assert.ok(p.entries[1].lines[0].startsWith('So Agrippa said'));
  assert.deepEqual(p.warnings, []);
});

test('file name helpers', () => {
  assert.equal(extractCommunicatorLastName('Timothy Ateek'), 'Ateek');
  assert.equal(extractCommunicatorLastName('John Doe Jr.'), 'Doe');
  assert.equal(serviceDateCode('2026-10-25'), '20261025');
});

test('references print the way Sunday slides do', () => {
  assert.equal(formatReference(parseReference('Psalms 139:16')), 'Psalm 139:16');
  assert.equal(formatReference(parseReference('Acts 27:21-25')), 'Acts 27:21-25');
  assert.equal(parseReference('Romans 8:18 (NIV)').translation, 'NIV2011');
  assert.equal(parseReference('Romans 8:18 (NASB 1995)').translation, 'NASB_1995');
});

test('splits manuscript text at inline verse numbers', () => {
  const ref = parseReference('Acts 27:18-20');
  const r = splitVerses('Since we were violently storm-tossed, they began the next day to jettison the cargo. 19 And on the third day they threw the ship\'s tackle overboard with their own hands. 20 When neither sun nor stars appeared for many days, and no small tempest lay on us, all hope of our being saved was at last abandoned.', ref);
  assert.deepEqual(r.verses.map(v => v.n), [18, 19, 20]);
  assert.equal(r.verses[1].text, 'And on the third day they threw the ship’s tackle overboard with their own hands.');
});

test('moves the reference back when the text starts a verse early', () => {
  const r = splitVerses('Now three days after Festus had arrived. 2 And the chief priests laid out their case, 3 asking as a favor against Paul[a] that he summon him.', parseReference('Acts 25:2-3'));
  assert.equal(r.startVerse, 1);
  assert.equal(r.verses.length, 3);
  assert.ok(!r.verses[2].text.includes('[a]'));
  assert.equal(r.warnings.length, 1);
});

test('sets poetry in printed lines', () => {
  assert.equal(
    poeticLines('Your eyes saw my unformed substance; in your book were written, every one of them, the days that were formed for me, when as yet there was none of them.'),
    'Your eyes saw my unformed substance;\nin your book were written, every one of them,\nthe days that were formed for me,\nwhen as yet there was none of them.',
  );
});

test('compares manuscript verses with the published text', () => {
  assert.equal(compareVerse('There we found brothersand were invited', 'There we found brothers and were invited').kind, 'spacing');
  const partial = compareVerse(
    'To this day I have had the help that comes from God, and so I stand here testifying both to small and great,',
    cleanVerseText(' To this day I have had the help that comes from God, and so I stand here testifying both to small and great, saying nothing but what the prophets and Moses said would come to pass:'),
  );
  assert.equal(partial.kind, 'partial');
  assert.equal(partial.rest, 'saying nothing but what the prophets and Moses said would come to pass:');
});

test('builds slides in sermon order with cues as notes on the next slide', () => {
  const slides = buildSlides(parseRequestFile(sample('20261025_DAL_requests.txt')));
  assert.equal(slides[0].reference, 'Romans 13:1');
  assert.equal(slides[1].kind, 'point');
  assert.deepEqual(slides[1].cues, ['www.watermark.org/vote', 'Pray', 'Show Truman Show poster']);
  const acts2721 = slides.filter(s => s.reference === 'Acts 27:21-25');
  assert.equal(acts2721.length, 5);
  assert.ok(acts2721.every(s => !/^\d/.test(s.text)));
  assert.deepEqual(slides[slides.length - 1].cues, ['Load Pads']);
  const quote = slides.find(s => s.kind === 'quote');
  assert.equal(quote.reference, 'Charles Swindoll');
  assert.ok(quote.text.startsWith('You have, like no other'));
});

test('splits quotes from their author', () => {
  assert.deepEqual(splitQuote('“Be still.” – Someone Wise'), { text: 'Be still.', author: 'Someone Wise' });
});

test('fills a theme text box, keeping its formatting', () => {
  const template = '{\\rtf1\\ansi{\\fonttbl\\f0\\fnil\\fcharset0 Lato-Light;}\n{\\colortbl;\\red255\\green255\\blue255;\\red234\\green231\\blue225;}\n{\\*\\expandedcolortbl;;\\cssrgb\\c93333\\c92549\\c90588;}\n\\pard\\pardirnatural\\partightenfactor0\n\n\\f0\\fs150 \\cf2 Old text}';
  const rtf = fillRtf(template, 'One “two”\nthree {four}', 0.5);
  assert.ok(rtf.includes('\\f0\\fs150 \\cf2 One \\uc0\\u8220 two\\uc0\\u8221 \\\nthree '));
  assert.ok(rtf.includes('\\red117\\green116\\blue113;'));
  assert.ok(rtf.includes('\\cf3 four\\cf2 '));
  assert.ok(!rtf.includes('Old text'));
});

test('exports a presentation built on the theme slides', () => {
  const theme = parseTheme(new Uint8Array(readFileSync(new URL('../src/themes/acts-fall/Theme.bin', import.meta.url))));
  const layouts = resolveLayouts({ name: 't', layouts: { scripture: { slide: 'Scripture or Quote', text: 'Bible Text', reference: 'Reference' }, point: { slide: 'Point' } } }, theme);
  const slides = buildSlides(parseRequestFile(sample('20261025_DAL_requests.txt')));
  const bytes = buildPresentation('20261025 - Sunday - Ateek', slides, layouts, { w: 3840, h: 2160 });
  const top = decode(bytes);
  assert.equal(top.filter(f => f.field === 13).length, slides.length);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('Acts 27:21-25'));
  assert.ok(text.includes('Media/Assets/003_ActsFall_ContentBar.png'));
  assert.ok(!text.includes('/Users/avtech'));
  // Each slide's elements get their own UUIDs
  const uuids = text.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g);
  assert.ok(!uuids.includes('48FF4333-8E0B-44B3-BC43-D4897E62CB8A'), 'theme element UUID was copied as-is');
});

test('moves a word down only when a verse would end on a single word', async () => {
  const { avoidShortLastLine } = await import('../src/layout.js');
  const m = s => s.length * 10;
  assert.equal(avoidShortLastLine('aaaa bbbb cccc dddd eeee ffff gggg on a cross.', 390, m, {}), 'aaaa bbbb cccc dddd eeee ffff gggg\non a cross.');
  assert.equal(avoidShortLastLine('aaaa bbbb cccc dddd eeee ffff gggg shall go.', 360, m, {}), 'aaaa bbbb cccc dddd eeee ffff gggg shall go.');
});

test('dims and undims by plain-text offsets', async () => {
  const { setDim, isAllDim, sliceText } = await import('../src/layout.js');
  const t = setDim('set sail from Crete and incurred', 14, 19, true);
  assert.equal(t, 'set sail from {Crete} and incurred');
  assert.equal(isAllDim(t, 14, 20), true); // selection includes the trailing space
  assert.equal(setDim(t, 14, 20, false), 'set sail from Crete and incurred');
  assert.equal(setDim('loss.\nTest', 5, 6, true), 'loss.\nTest'); // a lone line break can't be dimmed
  assert.equal(sliceText('one {two three} four', 4, 13), '{two three}');
});

test('a translation named in the request file carries to the slide', async () => {
  const { scriptureReference } = await import('../src/slides.js');
  const slides = buildSlides(parseRequestFile('# translation: ESV\nScripture: Romans 8:18 (NIV)\n> 18 I consider that our present sufferings\nScripture: John 3:16\n> For God so loved the world'));
  assert.equal(slides[0].reference, 'Romans 8:18 (NIV)');
  assert.equal(slides[0].ref.translation, 'NIV2011');
  assert.equal(slides[1].reference, 'John 3:16');
  assert.equal(scriptureReference('John 3:16', 'CSB17'), 'John 3:16 (CSB)');
  const niv = buildSlides(parseRequestFile('# translation: NIV\nScripture: John 3:16\n> For God so loved'));
  assert.equal(niv[0].reference, 'John 3:16 (NIV)');
});

test('strips Strong’s numbers and footnote letters from Bolls text', async () => {
  const { stripStudyMarkers, cleanVerseText } = await import('../src/bible.js');
  assert.equal(cleanVerseText(stripStudyMarkers('And<S>2532</S> now<S>3569</S> I exhort<S>3867</S> you', 'KJV')), 'And now I exhort you');
  assert.equal(cleanVerseText(stripStudyMarkers('For God<sup>a</sup> so loved ⓑ the world', 'CSB17')), 'For God so loved the world');
});
