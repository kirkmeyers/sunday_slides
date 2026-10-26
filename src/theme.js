/**
 * Read a ProPresenter 7 theme file and pull out what we need to draw and
 * export slides: each template slide's elements with their bounds, text
 * formatting (from the element's RTF) and image fills.
 *
 * Theme file layout (field numbers, schema-less):
 *   Theme.3            template slide { 1: Slide, 2: name }
 *   Slide.1            Slide.Element { 1: Graphics.Element, ... }
 *   Slide.6            size { 1: width, 2: height }
 *   Graphics.Element   1 uuid, 2 name, 3 bounds, 5 opacity, 9 fill, 13 text
 *   Text               5 RTF bytes, 6 vertical alignment (0 top, 1 middle, 2 bottom)
 */

import { decode, get, getAll, getMessage, asString, asDouble, asInt } from './protobuf.js';

/** Parse the bounds message { 1: origin {1 x, 2 y}, 2: size {1 w, 2 h} }. */
function readBounds(el) {
  const b = getMessage(el, 3);
  if (!b) return { x: 0, y: 0, w: 0, h: 0 };
  const o = getMessage(b, 1) || [];
  const s = getMessage(b, 2) || [];
  return {
    x: asDouble(get(o, 1)),
    y: asDouble(get(o, 2)),
    w: asDouble(get(s, 1)),
    h: asDouble(get(s, 2)),
  };
}

/** Find the image file name in a media fill, if any. */
function readImageFill(el) {
  const fill = getMessage(el, 9);
  const media = fill && getMessage(fill, 3);
  const url = media && getMessage(media, 2);
  if (!url) return null;
  const path = asString(get(url, 1)) || asString(get(url, 2)) || '';
  const name = decodeURIComponent(path.split('/').pop() || '');
  return name || null;
}

/**
 * Pull formatting out of a Cocoa RTF string. ProPresenter stores text styling
 * in RTF; the values here are in points, which equal pixels on the slide canvas.
 */
export function readRtfStyle(rtf) {
  const font = (rtf.match(/\\fcharset0 ([^;]+);/) || [])[1] || null;
  const fs = rtf.match(/\\fs(\d+)/);
  const sl = rtf.match(/\\sl(-?\d+)\\slmult1/);
  const leading = rtf.match(/\\slleading(\d+)/);
  const expnd = rtf.match(/\\expndtw(-?\d+)/);
  let align = 'left';
  if (/\\qc(?![a-z])/.test(rtf)) align = 'center';
  else if (/\\qr(?![a-z])/.test(rtf)) align = 'right';
  else if (/\\qj(?![a-z])/.test(rtf)) align = 'justify';

  // Color table: index 0 is "auto"; \cfN picks entry N
  const colors = [null];
  const tbl = rtf.match(/\{\\colortbl;([^}]*)\}/);
  if (tbl) {
    for (const entry of tbl[1].split(';')) {
      const m = entry.match(/\\red(\d+)\\green(\d+)\\blue(\d+)/);
      if (m) colors.push([+m[1], +m[2], +m[3]]);
    }
  }
  const body = rtf.split('\\partightenfactor0').pop();
  const cf = body.match(/\\cf(\d+)/);
  const rgb = (cf && colors[+cf[1]]) || [255, 255, 255];

  return {
    font,
    size: fs ? +fs[1] / 2 : 72,
    lineMultiple: sl ? +sl[1] / 240 : 1,
    leading: leading ? +leading[1] / 20 : 0,
    letterSpacing: expnd ? +expnd[1] / 20 : 0,
    align,
    color: rgb,
  };
}

function readElement(slideElementBytes) {
  const se = decode(slideElementBytes);
  const el = getMessage(se, 1);
  if (!el) return null;
  const textMsg = getMessage(el, 13);
  const rtf = textMsg ? asString(get(textMsg, 5)) : null;
  const hasText = !!rtf && /\\fcharset0 /.test(rtf);
  const image = readImageFill(el);
  return {
    name: asString(get(el, 2)) || '',
    bounds: readBounds(el),
    opacity: get(el, 5) ? asDouble(get(el, 5)) : 1,
    rtf: hasText ? rtf : null,
    style: hasText ? readRtfStyle(rtf) : null,
    valign: textMsg ? ['top', 'middle', 'bottom'][asInt(get(textMsg, 6))] || 'top' : 'top',
    image,
    raw: slideElementBytes, // Slide.Element bytes, reused for export
  };
}

/** Parse a theme file into { slides: { [name]: { size, elements[] } } }. */
export function parseTheme(bytes) {
  const top = decode(bytes);
  const slides = {};
  for (const t of getAll(top, 3)) {
    const tf = decode(t.value);
    const name = asString(get(tf, 2)) || '';
    const slide = getMessage(tf, 1);
    if (!slide) continue;
    const sizeMsg = getMessage(slide, 6) || [];
    slides[name] = {
      name,
      size: { w: asDouble(get(sizeMsg, 1)) || 3840, h: asDouble(get(sizeMsg, 2)) || 2160 },
      elements: getAll(slide, 1).map(f => readElement(f.value)).filter(Boolean),
    };
  }
  return { slides };
}

/**
 * Resolve a theme config's layouts against the parsed theme file.
 * A layout picks a template slide and names which elements carry the slide's
 * main text and (optionally) its reference line.
 */
export function resolveLayouts(themeConfig, parsed) {
  const layouts = {};
  for (const [key, spec] of Object.entries(themeConfig.layouts)) {
    const slide = parsed.slides[spec.slide];
    if (!slide) throw new Error(`Theme "${themeConfig.name}" has no slide named "${spec.slide}"`);
    const textEls = slide.elements.filter(e => e.rtf);
    const pick = name => (name ? slide.elements.find(e => e.name === name) : textEls[0]) || null;
    const text = pick(spec.text);
    const reference = spec.reference ? pick(spec.reference) : null;
    if (!text) throw new Error(`Theme layout "${key}" has no text element`);
    layouts[key] = { key, slide, text, reference };
  }
  return layouts;
}
