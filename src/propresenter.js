/**
 * ProPresenter 7 (.probundle) export with live text.
 *
 * Each slide is built from the theme's own template slide: its text boxes,
 * fonts and content bar are copied from the theme file and only the text is
 * replaced, so the result matches a hand-built deck and stays editable in
 * ProPresenter. The presentation wrapper (cues, groups, arrangement, notes)
 * follows porch_slides' exporter, which Pro 3 already imports.
 */

import JSZip from 'jszip';
import {
  decode, encode, get, getMessage, setField,
  stringField, messageField, varintField, doubleField, floatField,
} from './protobuf.js';
import { parseRuns } from './layout.js';
import { KIND_LABELS } from './slides.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().toUpperCase();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16).toUpperCase();
  });
}

const uuidField = (field, uuid) => messageField(field, [stringField(1, uuid)]);
const colorField = (field, [r, g, b, a = 1]) =>
  messageField(field, [floatField(1, r), floatField(2, g), floatField(3, b), floatField(4, a)]);

// --- RTF -----------------------------------------------------------------

function escapeRtf(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (ch === '\n') out += '\\\n'; // Cocoa RTF line break, as ProPresenter writes it
    else if (code > 127) {
      if (code > 0xffff) {
        // Surrogate pair, each half as a signed 16-bit \u
        const s = String.fromCodePoint(code);
        for (const unit of [s.charCodeAt(0), s.charCodeAt(1)]) out += `\\uc0\\u${unit > 32767 ? unit - 65536 : unit} `;
      } else {
        out += `\\uc0\\u${code > 32767 ? code - 65536 : code} `;
      }
    } else out += ch;
  }
  return out;
}

/**
 * Put new text into a template text box's RTF, keeping its fonts, colors and
 * paragraph settings. Dimmed runs ({...} markup) get an extra color: the text
 * color at `dimOpacity` over black.
 */
export function fillRtf(templateRtf, text, dimOpacity = 0.4) {
  const marker = '\\partightenfactor0';
  const at = templateRtf.indexOf(marker);
  let head = templateRtf.slice(0, at + marker.length);
  const rest = templateRtf.slice(at + marker.length);
  const lead = rest.match(/^\s*/)[0];
  const prefix = rest.slice(lead.length).match(/^(?:\\[A-Za-z]+-?\d* ?\n?)*/)[0];
  const baseCf = (prefix.match(/\\cf(\d+)/) || [])[1] || '0';

  const runs = parseRuns(text);
  let body = '';
  if (runs.some(r => r.dim)) {
    const colors = [...head.matchAll(/\\red(\d+)\\green(\d+)\\blue(\d+)/g)];
    const base = colors[+baseCf - 1] || [null, 255, 255, 255];
    const dim = [1, 2, 3].map(i => Math.round(+base[i] * dimOpacity));
    const dimIndex = colors.length + 1;
    head = head.replace(/(\{\\colortbl;[^}]*)\}/, `$1\\red${dim[0]}\\green${dim[1]}\\blue${dim[2]};}`);
    const pct = dim.map(c => Math.round((c / 255) * 100000));
    head = head.replace(/(\{\\\*\\expandedcolortbl;[^}]*)\}/, `$1\\cssrgb\\c${pct[0]}\\c${pct[1]}\\c${pct[2]};}`);
    for (const r of runs) body += r.dim ? `\\cf${dimIndex} ${escapeRtf(r.text)}\\cf${baseCf} ` : escapeRtf(r.text);
  } else {
    body = escapeRtf(runs.map(r => r.text).join(''));
  }
  return `${head}${lead}${prefix}${body}}`;
}

/** Plain-text slide notes as RTF. */
export function notesRtf(text) {
  return (
    '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n\\cocoatextscaling0\\cocoaplatform0' +
    '{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}\n{\\colortbl;\\red255\\green255\\blue255;}\n' +
    '{\\*\\expandedcolortbl;;}\n\\pard\\tx560\\pardirnatural\\partightenfactor0\n\n\\f0\\fs24 \\cf0 ' +
    escapeRtf(text) + '}'
  );
}

// --- Slide elements --------------------------------------------------------

/** A URL message pointing at a file inside the bundle (as porch_slides writes it). */
function bundleUrl(field, relPath) {
  return messageField(field, [
    varintField(3, 1), // platform: macOS
    stringField(2, relPath),
    messageField(4, [varintField(1, 10), stringField(2, relPath)]), // root: show
  ]);
}

/** Point an element's image fill at the copy we put in the bundle. */
function relinkImageFill(el, fileName) {
  const fillF = get(el, 9);
  if (!fillF || !fileName) return el;
  let fill = decode(fillF.value);
  const mediaF = get(fill, 3);
  if (!mediaF) return el;
  let media = decode(mediaF.value);
  const rel = `Media/Assets/${fileName}`;
  media = setField(media, bundleUrl(2, rel));
  const props = getMessage(media, 5);
  const fileProps = props && getMessage(props, 2);
  if (fileProps) {
    const newProps = setField(props, messageField(2, setField(fileProps, bundleUrl(1, rel))));
    media = setField(media, messageField(5, newProps));
  }
  fill = setField(fill, messageField(3, media));
  return setField(el, messageField(9, fill));
}

/** Copy a template Slide.Element, replacing its text (if given) and relinking images. */
function buildElement(element, newRtf) {
  let se = decode(element.raw);
  let el = decode(get(se, 1).value);
  if (newRtf != null) {
    const text = setField(decode(get(el, 13).value), { field: 5, wire: 2, value: encoder.encode(newRtf) });
    el = setField(el, messageField(13, text));
  }
  if (element.image) el = relinkImageFill(el, element.image);
  se = setField(se, messageField(1, el));
  return encode(se);
}

/** Give every UUID inside a copied template fresh values, consistently. */
function freshUuids(bytes) {
  // Read bytes 1:1 as Latin-1 so binary fields survive; UUID strings are
  // fixed-length ASCII, so swapping them keeps every length prefix valid.
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const map = new Map();
  const replaced = s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g, u => {
    if (!map.has(u)) map.set(u, generateUUID());
    return map.get(u);
  });
  const out = new Uint8Array(replaced.length);
  for (let i = 0; i < replaced.length; i++) out[i] = replaced.charCodeAt(i);
  return out;
}

function buildBaseSlide(slide, layouts, size, dimOpacity) {
  const fields = [];
  const layout = slide.layout ? layouts[slide.layout] : null;
  if (layout) {
    for (const element of layout.slide.elements) {
      let rtf = null;
      if (element === layout.text) {
        const text = slide.kind === 'blank' || slide.needsText ? '' : slide.text;
        rtf = fillRtf(element.rtf, text, dimOpacity);
      } else if (element === layout.reference) {
        rtf = fillRtf(element.rtf, slide.kind === 'blank' ? '' : slide.reference || '', dimOpacity);
      }
      fields.push({ field: 1, wire: 2, value: freshUuids(buildElement(element, rtf)) });
    }
  }
  fields.push(messageField(6, [doubleField(1, size.w), doubleField(2, size.h)]));
  fields.push(uuidField(7, generateUUID()));
  return fields;
}

// --- Presentation ------------------------------------------------------------

const GROUP_COLORS = {
  scripture: [0.11, 0.42, 0.62],
  quote: [0.55, 0.36, 0.67],
  point: [0.85, 0.6, 0.15],
  text: [0.3, 0.6, 0.45],
  blank: [0.25, 0.25, 0.25],
  placeholder: [0.8, 0.25, 0.4],
};

export function slideLabel(slide) {
  const firstLine = (slide.text || '').replace(/[{}]/g, '').split('\n').join(' ');
  switch (slide.kind) {
    case 'scripture': return slide.ref ? `${slide.reference} v${slide.ref.verse}` : slide.reference;
    case 'quote': return `Quote – ${slide.reference || 'unknown'}`;
    case 'placeholder': return `PLACEHOLDER: ${slide.text}`;
    case 'blank': return '';
    default: return firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine;
  }
}

function groupName(slide) {
  if (slide.kind === 'scripture') return slide.reference;
  return KIND_LABELS[slide.kind] || 'Slide';
}

/** Build the .pro (rv.data.Presentation) bytes. */
export function buildPresentation(name, slides, layouts, size, { dimOpacity = 0.4 } = {}) {
  const items = slides.map(slide => ({ slide, cueUuid: generateUUID() }));

  // One cue group per run of slides from the same request entry
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.slide.group) last.cues.push(item.cueUuid);
    else groups.push({ key: item.slide.group, uuid: generateUUID(), name: groupName(item.slide), kind: item.slide.kind, cues: [item.cueUuid] });
  }

  const p = [];
  p.push(messageField(1, [varintField(1, 1), varintField(3, 1)])); // application info: macOS, ProPresenter
  p.push(uuidField(2, generateUUID()));
  p.push(stringField(3, name));

  const arrangementUuid = generateUUID();
  p.push(uuidField(10, arrangementUuid));
  p.push(messageField(11, [uuidField(1, arrangementUuid), stringField(2, 'Default'), ...groups.map(g => uuidField(3, g.uuid))]));

  for (const g of groups) {
    const group = [uuidField(1, g.uuid), stringField(2, g.name), colorField(3, GROUP_COLORS[g.kind] || GROUP_COLORS.blank)];
    p.push(messageField(12, [messageField(1, group), ...g.cues.map(c => uuidField(2, c))]));
  }

  for (const { slide, cueUuid } of items) {
    const label = slideLabel(slide);
    const presSlide = [messageField(1, buildBaseSlide(slide, layouts, size, dimOpacity))];
    const notes = (slide.cues || []).join('\n');
    if (notes) presSlide.push(messageField(2, [{ field: 1, wire: 2, value: encoder.encode(notesRtf(notes)) }]));

    const action = [
      uuidField(1, generateUUID()),
      ...(label ? [messageField(3, [stringField(2, label)])] : []),
      varintField(6, 1), // enabled
      varintField(9, 11), // type: presentation slide
      messageField(23, [messageField(2, presSlide)]),
    ];
    const cue = [
      uuidField(1, cueUuid),
      ...(label ? [stringField(2, label)] : []),
      varintField(5, 1), // completion action: last
      messageField(10, action),
      varintField(12, 1), // enabled
    ];
    p.push(messageField(13, cue));
  }
  return encode(p);
}

/**
 * Package a .probundle: the .pro plus the theme images it uses.
 * @param assets  { fileName: url } for the theme's image fills
 */
export async function exportBundle({ name, slides, layouts, size, assets, dimOpacity }) {
  const zip = new JSZip();
  zip.file(`${name}.pro`, buildPresentation(name, slides, layouts, size, { dimOpacity }));
  const used = new Set();
  for (const s of slides) {
    const layout = s.layout && layouts[s.layout];
    if (!layout) continue;
    for (const el of layout.slide.elements) if (el.image) used.add(el.image);
  }
  for (const file of used) {
    if (!assets[file]) continue;
    const blob = await (await fetch(assets[file])).blob();
    zip.folder('Media/Assets').file(file, blob);
    zip.folder('Media').file(file, blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/** Read back slide text from a .pro, for tests and sanity checks. */
export function readPresentationText(bytes) {
  const out = [];
  for (const f of decode(bytes)) {
    if (f.field !== 13) continue;
    const s = decoder.decode(f.value);
    out.push([...s.matchAll(/\{\\rtf1[\s\S]*?\\partightenfactor0\s*((?:\\[A-Za-z]+-?\d* ?\n?)*)([^}]*)\}/g)].map(m => m[2]));
  }
  return out;
}

