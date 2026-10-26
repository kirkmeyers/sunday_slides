import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTheme, resolveLayouts } from '../src/theme.js';

const bytes = new Uint8Array(readFileSync(new URL('../src/themes/acts-fall/Theme.bin', import.meta.url)));
const config = {
  name: 'Acts Fall',
  layouts: {
    scripture: { slide: 'Scripture or Quote', text: 'Bible Text', reference: 'Reference' },
    point: { slide: 'Point' },
  },
};

test('reads the Acts Fall template slides', () => {
  const theme = parseTheme(bytes);
  assert.ok(theme.slides['Scripture or Quote']);
  assert.ok(theme.slides['Point']);
  assert.deepEqual(theme.slides['Point'].size, { w: 3840, h: 2160 });
});

test('resolves text boxes, fonts and the content bar', () => {
  const layouts = resolveLayouts(config, parseTheme(bytes));
  const s = layouts.scripture;
  assert.equal(s.text.style.font, 'Lato-Light');
  assert.equal(s.text.style.size, 75);
  assert.equal(s.text.style.lineMultiple, 1.1);
  assert.equal(s.text.valign, 'middle');
  assert.equal(Math.round(s.text.bounds.x * 10), 15065);
  assert.equal(s.reference.style.font, 'Oswald-SemiBold');
  assert.equal(s.reference.style.align, 'right');
  assert.equal(s.reference.style.letterSpacing, 5);
  assert.deepEqual(s.reference.style.color, [234, 231, 225]);
  assert.ok(s.slide.elements.some(e => e.image === '003_ActsFall_ContentBar.png'));
  const p = layouts.point;
  assert.equal(p.text.style.size, 110);
  assert.equal(p.text.style.align, 'center');
  assert.equal(p.text.style.lineMultiple, 0.9);
  assert.equal(p.text.style.leading, 6);
});
