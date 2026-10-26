import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanVerse } from '../scripts/niv84.js';
import { fetchChapter, setLocalBible, canFetchTranslation, restoreLord } from '../src/bible.js';

test('NIV 84 cleanup tells em dashes from hyphens', () => {
  assert.equal(cleanVerse('there was morning-the sixth day.'), 'there was morning—the sixth day.');
  assert.equal(cleanVerse('plants and trees bearing seed-\nbearing fruit'), 'plants and trees bearing seed-bearing fruit');
  assert.equal(cleanVerse('creatures that move on the ground-\neverything that has'), 'creatures that move on the ground—everything that has');
  assert.equal(cleanVerse('a people yet unborn- for he has done it.'), 'a people yet unborn—for he has done it.');
  assert.equal(cleanVerse('disobey the message--which is also'), 'disobey the message—which is also');
  assert.equal(cleanVerse('his sons-in-law and twenty-two cities'), 'his sons-in-law and twenty-two cities');
  assert.equal(cleanVerse('the musicians-Asaph, Heman'), 'the musicians—Asaph, Heman');
  assert.equal(cleanVerse('Ben-Hadad king of Aram'), 'Ben-Hadad king of Aram');
});

test('NIV 84 cleanup fixes spacing, quotes and the LORD clues', () => {
  assert.equal(cleanVerse('O Lord , how many are my foes!'), 'O LORD, how many are my foes!');
  assert.equal(cleanVerse('This is what the Sovereign\nLord says'), 'This is what the Sovereign LORD says');
  assert.equal(cleanVerse('"Let there be light," and\nthere was light.'), '“Let there be light,” and there was light.');
});

test('LORD takes its case from the ESV verse', () => {
  assert.equal(restoreLord('The Lord is my shepherd', 'The LORD is my shepherd; I shall not want.'), 'The LORD is my shepherd');
  assert.equal(restoreLord('the Lord said to my Lord', 'The LORD says to my Lord'), 'the LORD said to my Lord');
  // Different counts: leave it alone rather than guess
  assert.equal(restoreLord('the Lord', 'the LORD and the LORD'), 'the Lord');
});

test('a translation loaded from a file is fetched locally', async () => {
  assert.equal(canFetchTranslation('NIV'), false);
  setLocalBible('NIV', { translation: 'NIV', books: { 43: { 11: { 35: 'Jesus wept.' } } } });
  assert.equal(canFetchTranslation('NIV 84'), true);
  assert.equal(canFetchTranslation('NIV2011'), false); // the 2011 text still has to be typed in
  assert.deepEqual(await fetchChapter(43, 11, 'NIV'), [{ verse: 35, text: 'Jesus wept.' }]);
  setLocalBible('NIV', null);
  assert.equal(await fetchChapter(43, 11, 'NIV'), null);
});
