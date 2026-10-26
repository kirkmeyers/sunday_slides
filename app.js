import JSZip from 'jszip';
import { parseRequestFile, extractCommunicatorLastName, serviceDateCode } from './src/requests.js';
import { buildSlides, layoutSlides, layoutForKind, newId, KIND_LABELS, passageSlides, referenceLabel } from './src/slides.js';
import { parseTheme, resolveLayouts } from './src/theme.js';
import { setFontMap, measure, fontMetrics, clearMetricsCache, drawSlide, renderSlidePng } from './src/render.js';
import { fetchChapter, compareVerse, canFetchTranslation, textSource, translationName, TRANSLATIONS } from './src/bible.js';
import { restoreLocalBibles, saveLocalBible, removeLocalBible, validateBible, verseCount } from './src/local-bibles.js';
import { parseRuns, plainText, wrapLines, textArea, applyCase, maxLinesFor, setDim, isAllDim, sliceText } from './src/layout.js';
import { createTextBox, bindEditable, textToHtml, selectionOffsets, setSelectionOffsets } from './src/inline-editor.js';
import { exportBundle } from './src/propresenter.js';
import {
  compressDeckPayload, decompressDeckPayload, decompressOutlinePayload, encodeOutlineLink,
} from './src/links.js';
import actsFall from './src/themes/acts-fall/index.js';
import sampleRequests from './reference/20261025_DAL_requests.txt?raw';

const THEMES = [actsFall];

// ---------- State ----------
const state = {
  theme: null, // theme config
  layouts: null, // resolved layouts
  size: { w: 3840, h: 2160 },
  header: {},
  flags: [],
  loadWarnings: [],
  slides: [],
  active: 0,
  view: 'grid',
  bg: 'video',
  dimOpacity: 0.4,
  verifying: false,
};

const $ = id => document.getElementById(id);

// ---------- Small helpers ----------
function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(`sunday_slides.${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(`sunday_slides.${key}`, JSON.stringify(value));
  } catch {
    // Private windows can block storage; settings just won't persist
  }
}

function showToast(message, kind = '', duration = 3600) {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = message;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const ICON_NOTE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const ICON_WARN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const SPINNER = '<svg class="btn-icon btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';

// ---------- Theme ----------
async function loadTheme(config) {
  const bytes = new Uint8Array(await (await fetch(config.themeUrl)).arrayBuffer());
  const parsed = parseTheme(bytes);
  state.theme = config;
  state.layouts = resolveLayouts(config, parsed);
  const anyLayout = Object.values(state.layouts)[0];
  state.size = anyLayout.slide.size;
  setFontMap(config.fonts);
  clearMetricsCache();
  // Wait for the slide fonts before anything is measured
  await Promise.all(Object.values(config.fonts).map(f => document.fonts.load(`${f.weight} 100px "${f.family}"`)));
  await document.fonts.ready;
}

function relayout(slides) {
  return layoutSlides(slides, state.layouts, measure, fontMetrics);
}

// ---------- Loading requests ----------
async function loadRequestText(text, sourceLabel) {
  const parsed = parseRequestFile(text);
  if (!parsed.entries.length) {
    showToast('No slide requests found in that file.', 'warn');
    return;
  }
  state.header = parsed.header;
  state.flags = parsed.flags;
  state.loadWarnings = parsed.warnings;
  state.slides = relayout(buildSlides(parsed));
  state.active = 0;
  if (parsed.header.communicator) $('communicator').value = parsed.header.communicator;
  $('review-banner').hidden = true;
  setView('grid');
  renderAll();
  const n = state.slides.length;
  showToast(`Loaded ${n} slide${n === 1 ? '' : 's'}${sourceLabel ? ` from ${sourceLabel}` : ''}.`);
  if ($('verify-esv').checked) verifyScripture();
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.txt$/i.test(file.name) && file.type && file.type !== 'text/plain') {
    showToast('That isn’t a request file. Load the _requests.txt from Sermon content.', 'warn');
    return;
  }
  if (state.slides.some(s => s.edited) && !confirm('Replace the current slides? Your edits will be lost.')) return;
  await loadRequestText(await file.text(), file.name);
}

/** Build from text pasted into the Paste requests box (same format as the file). */
async function buildFromPaste() {
  const text = $('paste-text').value;
  if (!text.trim()) {
    showToast('Paste the requests first.', 'warn');
    return;
  }
  if (state.slides.some(s => s.edited) && !confirm('Replace the current slides? Your edits will be lost.')) return;
  $('paste-modal').hidden = true;
  await loadRequestText(text, 'pasted text');
}

// ---------- Checking scripture against the ESV ----------
async function verifyScripture() {
  const targets = state.slides.filter(s => s.kind === 'scripture' && s.ref && s.verseText && canFetchTranslation(s.ref.translation));
  if (!targets.length || state.verifying) return;
  state.verifying = true;
  const status = $('verify-status');
  const chapters = [...new Set(targets.map(s => `${s.ref.translation}|${s.ref.bookId}|${s.ref.chapter}`))];
  let done = 0;
  let changed = 0;
  let mismatches = 0;
  const fetched = {};
  for (const key of chapters) {
    status.textContent = `Checking scripture against the ESV… ${done + 1} of ${chapters.length}`;
    const [translation, bookId, chapter] = key.split('|');
    fetched[key] = await fetchChapter(+bookId, +chapter, translation);
    done += 1;
  }

  // Compare once per verse; apply to every slide of that verse
  const seen = new Set();
  const next = [];
  for (const slide of state.slides) {
    if (!targets.includes(slide)) {
      next.push(slide);
      continue;
    }
    const key = `${slide.ref.translation}|${slide.ref.bookId}|${slide.ref.chapter}`;
    const verse = (fetched[key] || []).find(v => v.verse === slide.ref.verse);
    if (!verse) {
      if (fetched[key] === null && !seen.has(key)) {
        seen.add(key);
        slide.checks = [...slide.checks, { esv: true, text: `Couldn't reach Bolls to check ${slide.reference} against the ${translationName(slide.ref.translation)}.` }];
      }
      next.push(slide);
      continue;
    }
    const verseKey = `${key}|${slide.ref.verse}|${slide.group}`;
    const first = !seen.has(verseKey);
    seen.add(verseKey);
    const result = compareVerse(slide.verseText, verse.text);
    slide.esv = { kind: result.kind, text: verse.text };
    const whole = !slide.parts || slide.parts === 1;
    if (result.kind === 'differs') {
      mismatches += first ? 1 : 0;
      if (first) slide.checks = [...slide.checks, { esv: true, danger: true, text: `Verse ${slide.ref.verse} doesn’t match the ${translationName(slide.ref.translation)}. Compare in the editor.` }];
      next.push(slide);
    } else if (result.kind === 'spacing' && whole && !slide.edited) {
      changed += 1;
      next.push(...relayout([{ ...slide, source: verse.text, verseText: verse.text, checks: [...slide.checks, { esv: true, text: `Verse ${slide.ref.verse}: fixed spacing to match the ${translationName(slide.ref.translation)}.` }] }]));
    } else if (result.kind === 'partial' && whole && !slide.edited && result.rest) {
      changed += 1;
      const source = `${slide.source} {${result.rest}}`;
      next.push(...relayout([{ ...slide, source, checks: [...slide.checks, { esv: true, text: `Verse ${slide.ref.verse} is quoted in part; the rest of the verse is dimmed.` }] }]));
    } else {
      if (result.kind !== 'same' && first) slide.checks = [...slide.checks, { esv: true, text: `Verse ${slide.ref.verse} differs slightly from the ${translationName(slide.ref.translation)}. Compare in the editor.` }];
      next.push(slide);
    }
  }
  state.slides = next;
  state.verifying = false;
  const parts = [`Checked ${targets.length} scripture slide${targets.length === 1 ? '' : 's'}`];
  if (changed) parts.push(`${changed} adjusted`);
  if (mismatches) parts.push(`${mismatches} to compare`);
  status.textContent = parts.join(' · ') + '.';
  renderAll();
}

// ---------- Warnings ----------
function slideIssues(slide) {
  const issues = slide.checks.map(c => (typeof c === 'string' ? { text: c } : c));
  if (slide.needsText) issues.push({ danger: true, text: 'Verse text needed.' });
  if (slide.overflow) issues.push({ danger: true, text: 'Text is too tall for the box; split or shorten it.' });
  return issues;
}

function renderWarnings() {
  const list = $('warning-list');
  list.innerHTML = '';
  let count = 0;
  for (const f of [...state.flags, ...state.loadWarnings]) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="where">Request file</span>${escapeHtml(f)}`;
    list.appendChild(li);
    count += 1;
  }
  state.slides.forEach((slide, i) => {
    for (const issue of slideIssues(slide)) {
      const li = document.createElement('li');
      li.className = `clickable${issue.danger ? ' danger' : ''}`;
      li.innerHTML = `<span class="where">Slide ${i + 1} · ${escapeHtml(slide.reference || KIND_LABELS[slide.kind])}</span>${escapeHtml(issue.text)}`;
      li.addEventListener('click', () => openEditor(i));
      list.appendChild(li);
      count += 1;
    }
  });
  $('warnings-card').hidden = count === 0;
  $('warning-count').textContent = count;
}

// ---------- Deck info ----------
function renderDeckInfo() {
  const h = state.header;
  const info = $('deck-info');
  if (!h.title && !h.service) {
    info.hidden = true;
    return;
  }
  info.hidden = false;
  $('deck-title').textContent = h.title || 'Untitled service';
  const date = h.service ? new Date(`${h.service}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  $('deck-meta').innerHTML = [date, h.series && `Series: ${escapeHtml(h.series)}`, h.passage && `Passage: ${escapeHtml(h.passage)}`, h.translation && `Translation: ${escapeHtml(h.translation)}`]
    .filter(Boolean)
    .join('<br>');
}

// ---------- Grid ----------
let dragIndex = null;

function slideBadges(slide) {
  const issues = slideIssues(slide);
  let html = '';
  if (issues.length) {
    const danger = issues.some(i => i.danger);
    html += `<span class="badge${danger ? ' danger' : ''}" title="${escapeHtml(issues.map(i => i.text).join('\n'))}">${ICON_WARN}${issues.length}</span>`;
  }
  if (slide.cues.length) {
    html += `<span class="badge note" title="${escapeHtml(slide.cues.join('\n'))}">${ICON_NOTE}${slide.cues.length} cue${slide.cues.length === 1 ? '' : 's'}</span>`;
  }
  return html;
}

function cardCaption(slide) {
  if (slide.kind === 'scripture') return `${referenceLabel(slide)}${slide.ref ? ` · v${slide.ref.verse}` : ''}`;
  if (slide.kind === 'quote') return slide.reference;
  if (slide.kind === 'blank') return '';
  return plainText(slide.text).replace(/\n/g, ' ');
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  state.slides.forEach((slide, i) => {
    const card = document.createElement('div');
    card.className = `slide-card${i === state.active ? ' active' : ''}`;
    card.draggable = true;
    card.innerHTML = `
      <div class="thumb bg-${state.bg}"><canvas width="640" height="360"></canvas>${slide.kind === 'placeholder' ? `<div class="placeholder-label">${escapeHtml(slide.text || 'Placeholder')}</div>` : ''}</div>
      <div class="slide-meta">
        <span class="slide-num">${i + 1}</span>
        <span class="kind-tag ${slide.kind}">${KIND_LABELS[slide.kind]}</span>
        <span class="slide-ref">${escapeHtml(cardCaption(slide))}</span>
        ${slideBadges(slide)}
      </div>`;
    card.addEventListener('click', () => selectSlide(i));
    card.addEventListener('dblclick', () => openEditor(i));
    card.addEventListener('dragstart', e => {
      dragIndex = i;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-slide', String(i));
    });
    card.addEventListener('dragend', () => {
      dragIndex = null;
      card.classList.remove('dragging');
      grid.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    });
    card.addEventListener('dragover', e => {
      if (dragIndex === null) return;
      e.preventDefault();
      const after = e.offsetX > card.offsetWidth / 2;
      card.classList.toggle('drop-after', after);
      card.classList.toggle('drop-before', !after);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', e => {
      if (dragIndex === null) return;
      e.preventDefault();
      e.stopPropagation();
      const after = e.offsetX > card.offsetWidth / 2;
      moveSlide(dragIndex, after ? i + 1 : i);
    });
    grid.appendChild(card);
    const canvas = card.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / state.size.w, 0, 0, canvas.height / state.size.h, 0, 0);
    drawSlide(ctx, slide, state.layouts, state.theme.assets, { dimOpacity: state.dimOpacity });
  });
}

/** Select a slide in the grid without opening it. */
function selectSlide(index) {
  state.active = Math.max(0, Math.min(index, state.slides.length - 1));
  const cards = $('grid').querySelectorAll('.slide-card');
  cards.forEach((c, i) => c.classList.toggle('active', i === state.active));
  cards[state.active]?.scrollIntoView({ block: 'nearest' });
}

/** Number of columns the grid is showing right now, for Up/Down. */
function gridColumns() {
  return getComputedStyle($('grid')).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
}

// ---------- Editor ----------
function activeSlide() {
  return state.slides[state.active];
}

function drawEditorCanvas() {
  const slide = activeSlide();
  if (!slide) return;
  const canvas = $('editor-canvas');
  if (canvas.width !== state.size.w) {
    canvas.width = state.size.w;
    canvas.height = state.size.h;
  }
  // The text itself is drawn by the editable boxes on top
  drawSlide(canvas.getContext('2d'), slide, state.layouts, state.theme.assets, { dimOpacity: state.dimOpacity, skipText: true });
}

// Scale the full-size editing layer to the preview frame
function fitSlideLayer() {
  const frame = $('canvas-frame');
  const layer = $('slide-layer');
  layer.style.width = `${state.size.w}px`;
  layer.style.height = `${state.size.h}px`;
  layer.style.transform = `scale(${frame.clientWidth / state.size.w})`;
}

/** Recompute "too tall" for a slide after its text changes by hand. */
function updateOverflow(slide) {
  const layout = slide.layout && state.layouts[slide.layout];
  if (!layout || slide.kind === 'blank') {
    slide.overflow = false;
    return;
  }
  const el = layout.text;
  const lines = wrapLines(applyCase(slide.text || '', el.style), textArea(el).w, measure, el.style).length;
  slide.overflow = lines > maxLinesFor(el, fontMetrics(el.style));
}

let activeEditable = null; // the main text editable, for dimming and splitting
let lastCaret = null; // { start, end } in the main text, kept while focus moves to buttons

/** Build the editable text boxes for the active slide. */
function renderSlideLayer() {
  const slide = activeSlide();
  const layer = $('slide-layer');
  layer.innerHTML = '';
  layer.style.setProperty('--dim', state.dimOpacity);
  activeEditable = null;
  lastCaret = null;
  fitSlideLayer();
  if (!slide) return;

  if (slide.kind === 'placeholder') {
    const { box, editor } = createTextBox(
      { bounds: { x: 400, y: 700, w: state.size.w - 800, h: 760 }, valign: 'middle', style: { font: 'Lato-Light', size: 110, lineMultiple: 1, leading: 0, letterSpacing: 0, align: 'center', color: [246, 195, 195] } },
      { placeholder: 'What goes here' },
    );
    box.classList.add('placeholder-box');
    editor.innerHTML = textToHtml(slide.text);
    bindEditable(editor, {}, text => {
      slide.text = text.replace(/[{}]/g, '');
      slide.edited = true;
      slideEdited();
    });
    layer.appendChild(box);
    activeEditable = editor;
    return;
  }
  if (!slide.layout || slide.kind === 'blank') return;

  const layout = state.layouts[slide.layout];
  const main = createTextBox(layout.text, { placeholder: slide.kind === 'scripture' ? 'Verse text' : 'Slide text' });
  main.editor.innerHTML = textToHtml(slide.needsText ? '' : slide.text);
  bindEditable(main.editor, { onSplit: splitAtCursor }, text => {
    slide.text = text;
    slide.edited = true;
    if (slide.needsText && plainText(text).trim()) slide.needsText = false;
    updateOverflow(slide);
    slideEdited();
  });
  layer.appendChild(main.box);
  activeEditable = main.editor;

  if (layout.reference && (slide.kind === 'scripture' || slide.kind === 'quote')) {
    const ref = createTextBox(layout.reference, { placeholder: slide.kind === 'quote' ? 'Author' : 'Reference' });
    ref.editor.innerHTML = textToHtml(slide.reference || '');
    bindEditable(ref.editor, {}, text => {
      slide.reference = text.replace(/[{}]/g, '').replace(/\n/g, ' ');
      slideEdited();
    });
    layer.appendChild(ref.box);
  }
}

function renderEditorBadges() {
  const slide = activeSlide();
  $('editor-badges').innerHTML = slideIssues(slide)
    .map(i => `<div class="check${i.danger ? ' danger' : ''}">${escapeHtml(i.text)}</div>`)
    .join('');
}

function renderEditor() {
  const slide = activeSlide();
  if (!slide) return;
  $('editor-position').textContent = `Slide ${state.active + 1} of ${state.slides.length}`;
  $('edit-kind').value = slide.kind;
  const scripture = slide.kind === 'scripture' && slide.ref;
  $('translation-field').hidden = !scripture;
  if (scripture) {
    const source = slide.ref.sourceTranslation;
    $('edit-translation').innerHTML = Object.entries(TRANSLATIONS)
      .map(([code, name]) => `<option value="${code}">${name}${code === source ? ' (manuscript)' : ''}${!canFetchTranslation(code) && code !== source ? ' (type it in)' : ''}</option>`)
      .join('');
    $('edit-translation').value = slide.ref.translation;
  }
  $('btn-use-esv').textContent = scripture ? `Use ${translationName(slide.ref.translation)} text` : 'Use ESV text';
  $('btn-relayout').disabled = !slide.layout || slide.kind === 'blank';
  $('btn-dim').disabled = !slide.layout || slide.kind === 'blank';

  // ESV comparison for scripture that doesn't match
  const compare = $('esv-compare');
  const showEsv = slide.esv && slide.esv.kind !== 'same';
  compare.hidden = !showEsv;
  $('btn-use-esv').hidden = !showEsv;
  if (showEsv) {
    compare.innerHTML = `<strong>${escapeHtml(translationName(slide.ref.translation))} (${textSource(slide.ref.translation)}) · verse ${slide.ref.verse}</strong>${escapeHtml(slide.esv.text)}
      <strong style="margin-top:8px">Manuscript</strong>${escapeHtml(slide.verseText)}`;
  }

  // Cues
  const cueList = $('cue-list');
  cueList.innerHTML = '';
  if (!slide.cues.length) {
    cueList.innerHTML = '<li class="empty">No cues on this slide.</li>';
  }
  slide.cues.forEach((cue, ci) => {
    const li = document.createElement('li');
    li.innerHTML = `<div>${escapeHtml(cue)}</div>
      <div class="cue-actions">
        <button class="btn btn-small" data-act="text">Make text slide</button>
        <button class="btn btn-small" data-act="placeholder">Make placeholder</button>
        <button class="btn btn-small btn-danger" data-act="remove">Remove</button>
      </div>`;
    li.querySelectorAll('button').forEach(b => b.addEventListener('click', () => cueAction(ci, b.dataset.act)));
    cueList.appendChild(li);
  });

  renderEditorBadges();
  drawEditorCanvas();
  renderSlideLayer();
}

function openEditor(index) {
  state.active = Math.max(0, Math.min(index, state.slides.length - 1));
  setView('editor');
  renderEditor();
}

function setView(view) {
  state.view = view;
  const has = state.slides.length > 0;
  $('view-grid').classList.toggle('active', view === 'grid');
  $('view-editor').classList.toggle('active', view === 'editor');
  $('empty-state').hidden = has;
  $('grid').hidden = !has || view !== 'grid';
  $('editor').hidden = !has || view !== 'editor';
  if (has && view === 'grid') {
    renderGrid();
    $('grid').querySelectorAll('.slide-card')[state.active]?.scrollIntoView({ block: 'nearest' });
  }
}

function renderAll() {
  const has = state.slides.length > 0;
  for (const id of ['btn-export-pro', 'btn-export-zip', 'btn-export-png', 'btn-share', 'btn-proof', 'btn-add-slide']) $(id).disabled = !has;
  const counts = state.slides.reduce((acc, s) => ((acc[s.kind] = (acc[s.kind] || 0) + 1), acc), {});
  $('slide-count').textContent = has
    ? `${state.slides.length} slides · ${['scripture', 'point', 'quote', 'text', 'blank', 'placeholder'].filter(k => counts[k]).map(k => `${counts[k]} ${KIND_LABELS[k].toLowerCase()}`).join(', ')}`
    : '';
  if (state.active >= state.slides.length) state.active = Math.max(0, state.slides.length - 1);
  renderDeckInfo();
  renderWarnings();
  setView(state.view);
  if (state.view === 'editor' && has) renderEditor();
}

// Re-render after an edit without rebuilding the whole grid every keystroke
let editTimer = null;
function slideEdited() {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    renderEditorBadges();
    renderWarnings();
  }, 60);
}

// ---------- Slide operations ----------
function insertSlide(index, slide) {
  state.slides.splice(index, 0, slide);
  state.active = index;
  renderAll();
}

function moveSlide(from, to) {
  if (to > from) to -= 1;
  if (from === to || to < 0 || to >= state.slides.length) {
    renderAll();
    return;
  }
  const [s] = state.slides.splice(from, 1);
  state.slides.splice(to, 0, s);
  state.active = to;
  renderAll();
}

function blankSlide() {
  return { id: newId(), kind: 'blank', layout: 'point', group: newId(), text: '', reference: '', ref: null, source: '', cues: [], checks: [], edited: true };
}

function cueAction(cueIndex, act) {
  const slide = activeSlide();
  const [cue] = slide.cues.splice(cueIndex, 1);
  if (act === 'remove') {
    renderAll();
    return;
  }
  // The cue happens before this slide, so its new slide goes in front of it
  const kind = act === 'text' ? 'text' : 'placeholder';
  const text = kind === 'text' ? cue.replace(/^https?:\/\//, '').replace(/^www\./, '') : cue;
  const created = { id: newId(), kind, layout: layoutForKind(kind), group: newId(), text, reference: '', ref: null, source: text, cues: [], checks: [], edited: false };
  insertSlide(state.active, kind === 'text' ? relayout([created])[0] : created);
  showToast(kind === 'text' ? 'Cue turned into a text slide.' : 'Cue turned into a placeholder slide.');
}

/** Split the slide at the cursor and carry on typing at the start of the new slide (Option+Enter). */
function splitAtCursor() {
  const slide = activeSlide();
  const caret = activeEditable && selectionOffsets(activeEditable);
  const pos = (caret || lastCaret)?.start;
  const length = plainText(slide.text).length;
  if (pos == null || pos <= 0 || pos >= length) {
    showToast('Click in the slide text where the new slide should start.', 'warn');
    return;
  }
  const trim = t => t.replace(/^\s+|\s+$/g, '');
  const original = slide.text;
  slide.text = trim(sliceText(original, 0, pos));
  slide.edited = true;
  updateOverflow(slide);
  const second = { ...slide, id: newId(), text: trim(sliceText(original, pos, length)), cues: [], checks: [], edited: true };
  updateOverflow(second);
  state.slides.splice(state.active + 1, 0, second);
  state.active += 1;
  renderAll();
  if (activeEditable) {
    activeEditable.focus();
    setSelectionOffsets(activeEditable, 0);
  }
}

function mergeWithNext() {
  const a = activeSlide();
  const b = state.slides[state.active + 1];
  if (!b) return showToast('There’s no next slide to merge with.', 'warn');
  if (a.layout !== b.layout || a.kind === 'blank' || b.kind === 'blank') return showToast('Only slides of the same type can be merged.', 'warn');
  a.text = `${a.text.replace(/\s+$/, '')} ${b.text.replace(/^\s+/, '')}`.replace(/\n/g, ' ');
  a.cues = [...a.cues, ...b.cues];
  a.checks = [...a.checks, ...b.checks];
  a.edited = true;
  a.overflow = false;
  state.slides.splice(state.active + 1, 1);
  renderAll();
  showToast('Merged. Use Auto line breaks or Enter to place line breaks.');
}

let lastDelete = null; // { slide, index, neighbor, neighborCues } for ⌘Z

function deleteSlide() {
  const slide = activeSlide();
  if (!slide) return;
  const index = state.active;
  const next = state.slides[index + 1] || state.slides[index - 1];
  lastDelete = { slide, index, neighbor: next, neighborCues: next ? [...next.cues] : [] };
  if (slide.cues.length && next) next.cues = [...slide.cues, ...next.cues];
  state.slides.splice(index, 1);
  if (state.active >= state.slides.length) state.active = state.slides.length - 1;
  if (!state.slides.length) state.view = 'grid';
  renderAll();
  showToast(`${slide.cues.length && next ? 'Slide deleted; its cues moved to the neighboring slide.' : 'Slide deleted.'} Press ⌘Z to undo.`);
}

function undoDelete() {
  if (!lastDelete) return;
  const { slide, index, neighbor, neighborCues } = lastDelete;
  lastDelete = null;
  if (neighbor) neighbor.cues = neighborCues;
  state.slides.splice(index, 0, slide);
  state.active = index;
  renderAll();
  showToast('Slide restored.');
}

/** Dim the selected words on the slide, or undim them if they're all dimmed already. */
function toggleDim() {
  const slide = activeSlide();
  const editor = activeEditable;
  if (!editor || slide.kind === 'placeholder') return;
  const sel = selectionOffsets(editor) || lastCaret;
  if (!sel || sel.start === sel.end) {
    showToast('Select words in the slide text first.', 'warn');
    return;
  }
  const dim = !isAllDim(slide.text, sel.start, sel.end);
  slide.text = setDim(slide.text, sel.start, sel.end, dim);
  slide.edited = true;
  editor.innerHTML = textToHtml(slide.text);
  editor.focus();
  setSelectionOffsets(editor, sel.start, sel.end);
  lastCaret = sel;
  slideEdited();
}

function autoLineBreaks() {
  const slide = activeSlide();
  const source = slide.edited ? slide.text.replace(/\n/g, ' ') : slide.source || slide.text;
  const laid = relayout([{ ...slide, source, edited: false }]);
  state.slides.splice(state.active, 1, ...laid);
  renderAll();
  if (laid.length > 1) showToast(`Too long for one slide; split into ${laid.length}.`);
}

function useEsvText() {
  const slide = activeSlide();
  if (!slide.esv) return;
  const laid = relayout([{ ...slide, source: slide.esv.text, verseText: slide.esv.text, esv: { ...slide.esv, kind: 'same' }, edited: false, checks: slide.checks.filter(c => !(typeof c === 'object' && c.danger)) }]);
  state.slides.splice(state.active, 1, ...laid);
  renderAll();
  showToast(`Now using the ${translationName(slide.ref.translation)} text from ${textSource(slide.ref.translation)}.`);
}

/**
 * Switch the active slide's passage to another translation, like porch_slides'
 * per-slide translation picker. Text comes from the manuscript when switching
 * back to the request file's translation, otherwise from Bolls or a translation
 * file loaded in Settings (the NIV 84). Bolls doesn't serve the NIV, so other
 * NIV verses become "text needed" slides to type into.
 */
async function changeTranslation(code) {
  const slide = activeSlide();
  if (!slide?.ref || code === slide.ref.translation) return;
  const start = state.slides.findIndex(s => s.group === slide.group);
  let end = start;
  while (end + 1 < state.slides.length && state.slides[end + 1].group === slide.group) end += 1;
  const group = state.slides.slice(start, end + 1);
  if (group.some(s => s.edited) && !confirm('Switching translations replaces this passage’s text, including your edits. Continue?')) {
    $('edit-translation').value = slide.ref.translation;
    return;
  }

  // One entry per verse, in order, with the manuscript's text for that verse
  const verses = [];
  for (const s of group) {
    if (!verses.some(v => v.n === s.ref.verse)) verses.push({ n: s.ref.verse, manuscript: s.manuscript ?? s.verseText ?? '' });
  }
  let missing = 0;
  if (code === slide.ref.sourceTranslation) {
    verses.forEach(v => (v.text = v.manuscript));
  } else if (!canFetchTranslation(code)) {
    verses.forEach(v => (v.text = ''));
    missing = verses.length;
  } else {
    $('translation-field').classList.add('busy');
    const chapter = await fetchChapter(slide.ref.bookId, slide.ref.chapter, code);
    $('translation-field').classList.remove('busy');
    if (!chapter) {
      showToast(`Couldn’t get the ${translationName(code)} from ${textSource(code)}. Check the connection and try again.`, 'warn', 6000);
      $('edit-translation').value = slide.ref.translation;
      return;
    }
    for (const v of verses) {
      v.text = chapter.find(c => c.verse === v.n)?.text || '';
      if (!v.text) missing += 1;
    }
  }

  const cues = group.flatMap(s => s.cues);
  const rebuilt = relayout(passageSlides(group[0], verses, code, cues));
  if (missing) {
    rebuilt[0].checks = [...rebuilt[0].checks, { esv: true, danger: true, text: !canFetchTranslation(code)
      ? `Bolls doesn’t carry the ${translationName(code)}; type or paste the verse text on each slide, or load the NIV 84 file in Settings.`
      : `${missing} verse${missing === 1 ? '' : 's'} weren’t found in the ${translationName(code)}.` }];
  }
  const offset = state.active - start;
  state.slides.splice(start, group.length, ...rebuilt);
  state.active = start + Math.min(offset, rebuilt.length - 1);
  renderAll();
  showToast(`${slide.ref.label} is now in the ${translationName(code)}.`);
}

// ---------- File names ----------
function fileBase() {
  const last = extractCommunicatorLastName($('communicator').value);
  return `${serviceDateCode(state.header.service)} - Sunday${last ? ` - ${last}` : ''}`;
}

function slugify(s, words = 5) {
  return plainText(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9:\-\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, words)
    .join('_')
    .replace(/:/g, '_');
}

function slideFileInfo(slide, index) {
  const n = String(index + 1).padStart(3, '0');
  if (slide.kind === 'scripture') return `${n} ${slugify(slide.reference, 4)}${slide.ref ? ` v${slide.ref.verse}` : ''}`;
  if (slide.kind === 'quote') return `${n} quote_${slugify(slide.reference, 3) || 'unknown'}`;
  return `${n} ${slugify(slide.text) || slide.kind}`;
}

function pngName(slide, index) {
  return `${fileBase()} - ${slideFileInfo(slide, index)}.png`;
}

function confirmUnresolved() {
  const problems = state.slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.needsText || s.overflow);
  if (!problems.length) return true;
  const list = problems.slice(0, 8).map(({ s, i }) => `Slide ${i + 1}: ${s.reference || KIND_LABELS[s.kind]} (${s.needsText ? 'needs verse text' : 'too tall'})`).join('\n');
  return confirm(`${problems.length} slide${problems.length === 1 ? '' : 's'} still need attention:\n\n${list}\n\nExport anyway?`);
}

function setProgress(pct) {
  $('export-progress').hidden = pct == null;
  $('export-progress-bar').style.width = `${pct || 0}%`;
}

async function withBusy(button, label, work) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `${SPINNER} ${label}`;
  try {
    await work();
  } catch (err) {
    console.error(err);
    showToast(`Export failed: ${err.message || err}`, 'warn', 6000);
  } finally {
    button.innerHTML = original;
    button.disabled = false;
    setProgress(null);
  }
}

// ---------- Exports ----------
async function exportProPresenter() {
  if (!confirmUnresolved()) return;
  await withBusy($('btn-export-pro'), 'Building bundle…', async () => {
    const name = fileBase();
    const blob = await exportBundle({
      name,
      slides: state.slides,
      layouts: state.layouts,
      size: state.size,
      assets: state.theme.assets,
      dimOpacity: state.dimOpacity,
    });
    downloadBlob(blob, `${name}.probundle`);
    showToast(`Saved ${name}.probundle (${state.slides.length} slides).`);
  });
}

async function exportZip() {
  if (!confirmUnresolved()) return;
  await withBusy($('btn-export-zip'), 'Rendering…', async () => {
    const zip = new JSZip();
    const visible = state.slides.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'blank' && s.kind !== 'placeholder');
    for (let k = 0; k < visible.length; k++) {
      const { s, i } = visible[k];
      setProgress(((k + 1) / visible.length) * 95);
      zip.file(pngName(s, i), await renderSlidePng(s, state.layouts, state.theme.assets, state.size, { dimOpacity: state.dimOpacity }));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${fileBase()}.zip`);
    showToast(`Saved ${visible.length} PNGs.`);
  });
}

async function exportCurrentPng() {
  const slide = activeSlide();
  if (!slide) return;
  await withBusy($('btn-export-png'), 'Rendering…', async () => {
    downloadBlob(await renderSlidePng(slide, state.layouts, state.theme.assets, state.size, { dimOpacity: state.dimOpacity }), pngName(slide, state.active));
  });
}

// ---------- Review link ----------
async function shareReviewLink() {
  if (!state.slides.length) return;
  try {
    const payload = {
      v: 1,
      theme: state.theme.id,
      header: state.header,
      flags: state.flags,
      communicator: $('communicator').value.trim(),
      slides: state.slides,
    };
    const hash = await compressDeckPayload(payload);
    const url = `${window.location.origin}${window.location.pathname}#review=${hash}`;
    history.replaceState(null, '', `#review=${hash}`);
    if (await copyToClipboard(url)) showToast('Review link copied. Anyone with the link can see and edit this draft.');
    else showToast('Couldn’t copy automatically; the review link is now in the address bar.', 'warn', 6000);
  } catch (err) {
    console.error(err);
    showToast('Couldn’t make a review link.', 'warn');
  }
}

async function loadFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith('#outline=')) {
    try {
      const text = await decompressOutlinePayload(hash.slice('#outline='.length));
      await loadRequestText(text, 'the link');
    } catch (err) {
      console.error(err);
      showToast('Couldn’t read the requests in that link.', 'warn');
    }
  } else if (hash.startsWith('#review=')) {
    try {
      const payload = await decompressDeckPayload(hash.slice('#review='.length));
      const theme = THEMES.find(t => t.id === payload.theme);
      if (theme && theme !== state.theme) {
        await loadTheme(theme);
        $('theme-select').value = theme.id;
      }
      state.header = payload.header || {};
      state.flags = payload.flags || [];
      state.loadWarnings = [];
      state.slides = payload.slides || [];
      state.active = 0;
      $('communicator').value = payload.communicator || '';
      $('review-banner').hidden = false;
      state.view = 'grid';
      renderAll();
      showToast(`Loaded a shared draft: ${state.slides.length} slides.`);
    } catch (err) {
      console.error(err);
      showToast('Couldn’t read that review link.', 'warn');
    }
  }
}

// ---------- Proof sheet ----------
function proofTextHtml(text) {
  return parseRuns(text || '')
    .map(r => (r.dim ? `<span class="dim">${escapeHtml(r.text)}</span>` : escapeHtml(r.text)))
    .join('');
}

function openProofSheet() {
  const h = state.header;
  $('proof-meta').textContent = [h.title, $('communicator').value.trim(), h.service, state.theme.name, `${state.slides.length} slides`].filter(Boolean).join(' · ');
  $('proof-content').innerHTML = state.slides
    .map((s, i) => {
      const issues = slideIssues(s);
      return `<div class="proof-item">
        <div class="proof-head">
          <span class="slide-num">${i + 1}</span>
          <span class="kind-tag ${s.kind}">${KIND_LABELS[s.kind]}</span>
          ${s.reference ? `<span class="proof-ref">${escapeHtml(referenceLabel(s))}</span>` : ''}
          ${issues.length ? `<span class="badge${issues.some(x => x.danger) ? ' danger' : ''}">${ICON_WARN}${escapeHtml(issues.map(x => x.text).join(' '))}</span>` : ''}
        </div>
        <div class="proof-text">${s.kind === 'blank' ? '<em>(blank)</em>' : proofTextHtml(s.text)}</div>
        ${s.cues.length ? `<div class="proof-notes">Cues: ${escapeHtml(s.cues.join(' · '))}</div>` : ''}
      </div>`;
    })
    .join('');
  $('proof-modal').hidden = false;
}

// ---------- Wiring ----------
function bindEvents() {
  $('btn-load-requests').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', e => {
    handleFile(e.target.files[0]);
    e.target.value = '';
  });
  $('btn-paste-requests').addEventListener('click', () => {
    $('paste-modal').hidden = false;
    $('paste-text').focus();
  });
  $('btn-build-paste').addEventListener('click', buildFromPaste);
  $('paste-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      buildFromPaste();
    }
  });
  $('btn-load-sample').addEventListener('click', () => {
    if (state.slides.some(s => s.edited) && !confirm('Replace the current slides with the sample?')) return;
    loadRequestText(sampleRequests, 'the Acts 27-28 sample');
  });

  // Drag and drop a request file anywhere
  let dragDepth = 0;
  const isFileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => {
    if (!isFileDrag(e)) return;
    dragDepth += 1;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragleave', e => {
    if (!isFileDrag(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-overlay').hidden = true;
  });
  window.addEventListener('dragover', e => {
    if (isFileDrag(e)) e.preventDefault();
  });
  window.addEventListener('drop', e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    handleFile(e.dataTransfer.files[0]);
  });

  $('view-grid').addEventListener('click', () => setView('grid'));
  $('view-editor').addEventListener('click', () => state.slides.length && openEditor(state.active));
  $('btn-prev').addEventListener('click', () => openEditor(state.active - 1));
  $('btn-next').addEventListener('click', () => openEditor(state.active + 1));
  document.addEventListener('keydown', e => {
    if (!state.slides.length || document.querySelector('.modal:not([hidden])')) return;
    const active = document.activeElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable;

    // Cmd/Ctrl+Z (outside a text box) brings back the last deleted slide
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing && lastDelete) {
      e.preventDefault();
      undoDelete();
      return;
    }

    if (state.view === 'grid') {
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSlide();
        return;
      }
      // Arrow keys move the selection around the grid; Enter opens it
      const cols = gridColumns();
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
      if (e.key in moves) {
        e.preventDefault();
        const next = state.active + moves[e.key];
        if (next >= 0 && next < state.slides.length) selectSlide(next);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openEditor(state.active);
      }
      return;
    }

    // Editor: Cmd/Ctrl+D dims or undims the selected words while typing on the slide
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && active?.isContentEditable) {
      e.preventDefault();
      toggleDim();
      return;
    }
    // Esc goes back to the grid from anywhere in the editor, even mid-typing
    if (e.key === 'Escape') {
      active.blur?.();
      setView('grid');
      return;
    }
    if (typing) return;
    if (e.key === 'ArrowLeft') openEditor(state.active - 1);
    if (e.key === 'ArrowRight') openEditor(state.active + 1);
  });

  // Remember where the cursor was in the slide text, for Split and Dim
  document.addEventListener('selectionchange', () => {
    if (!activeEditable) return;
    const offsets = selectionOffsets(activeEditable);
    if (offsets) lastCaret = offsets;
  });
  // Keep the text selection when clicking these buttons
  for (const id of ['btn-dim', 'btn-split']) $(id).addEventListener('mousedown', e => e.preventDefault());
  new ResizeObserver(fitSlideLayer).observe($('canvas-frame'));

  $('edit-kind').addEventListener('change', e => {
    const slide = activeSlide();
    slide.kind = e.target.value;
    slide.layout = layoutForKind(slide.kind);
    slide.edited = true;
    renderAll();
  });
  $('btn-dim').addEventListener('click', toggleDim);
  $('btn-relayout').addEventListener('click', autoLineBreaks);
  $('btn-use-esv').addEventListener('click', useEsvText);
  $('edit-translation').addEventListener('change', e => changeTranslation(e.target.value));
  $('btn-split').addEventListener('click', splitAtCursor);
  $('btn-merge').addEventListener('click', mergeWithNext);
  $('btn-insert-blank').addEventListener('click', () => insertSlide(state.active + 1, blankSlide()));
  $('btn-add-slide').addEventListener('click', () => insertSlide(state.slides.length ? state.active + 1 : 0, blankSlide()));
  $('btn-delete').addEventListener('click', deleteSlide);
  const addCue = () => {
    const input = $('new-cue');
    const v = input.value.trim();
    if (!v) return;
    activeSlide().cues.push(v);
    input.value = '';
    renderAll();
  };
  $('btn-add-cue').addEventListener('click', addCue);
  $('new-cue').addEventListener('keydown', e => e.key === 'Enter' && addCue());

  $('btn-export-pro').addEventListener('click', exportProPresenter);
  $('btn-export-zip').addEventListener('click', exportZip);
  $('btn-export-png').addEventListener('click', exportCurrentPng);
  $('btn-share').addEventListener('click', shareReviewLink);
  $('btn-copy-review').addEventListener('click', shareReviewLink);
  $('btn-dismiss-review').addEventListener('click', () => ($('review-banner').hidden = true));
  $('btn-proof').addEventListener('click', openProofSheet);
  $('btn-print').addEventListener('click', () => window.print());
  $('btn-help').addEventListener('click', () => ($('help-modal').hidden = false));
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-close]')) m.hidden = true;
    });
    m.addEventListener('keydown', e => {
      if (e.key === 'Escape') m.hidden = true;
    });
  });

  const bgModes = ['video', 'black', 'checker'];
  const bgLabels = { video: 'Background: video', black: 'Background: black', checker: 'Background: transparent' };
  const applyBg = () => {
    $('canvas-frame').className = `canvas-frame bg-${state.bg}`;
    $('btn-bg').textContent = bgLabels[state.bg];
    document.querySelectorAll('.thumb').forEach(t => (t.className = `thumb bg-${state.bg}`));
  };
  $('btn-bg').addEventListener('click', () => {
    state.bg = bgModes[(bgModes.indexOf(state.bg) + 1) % bgModes.length];
    storageSet('bg', state.bg);
    applyBg();
  });
  applyBg();

  $('dim-opacity').addEventListener('input', e => {
    state.dimOpacity = +e.target.value;
    $('dim-value').textContent = `${Math.round(state.dimOpacity * 100)}%`;
    storageSet('dimOpacity', state.dimOpacity);
    $('slide-layer').style.setProperty('--dim', state.dimOpacity);
  });
  $('dim-opacity').addEventListener('change', () => state.view === 'grid' && renderGrid());
  $('btn-load-niv84').addEventListener('click', () => $('niv84-input').click());
  $('niv84-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await loadNiv84File(file);
  });
  $('btn-remove-niv84').addEventListener('click', async () => {
    if (!confirm('Remove the NIV 84 text from this browser?')) return;
    await removeLocalBible('NIV');
    renderLocalBibles([]);
    renderAll();
    showToast('NIV 84 removed from this computer.');
  });
  $('verify-esv').addEventListener('change', e => storageSet('verifyEsv', e.target.checked));

  $('theme-select').addEventListener('change', async e => {
    const theme = THEMES.find(t => t.id === e.target.value);
    await loadTheme(theme);
    state.slides = relayout(state.slides);
    renderAll();
  });

  window.addEventListener('hashchange', loadFromHash);
}

// ---------- NIV 84 file (Settings) ----------
function renderLocalBibles(list) {
  const niv = list.find(b => b.code === 'NIV');
  $('niv84-status').textContent = niv
    ? `Loaded on this computer: ${niv.verses.toLocaleString()} verses.`
    : 'Not on this computer. Make the file with npm run niv84, then load it here once.';
  $('btn-remove-niv84').hidden = !niv;
  $('btn-load-niv84').textContent = niv ? 'Replace NIV 84 file' : 'Load NIV 84 file';
}

async function loadNiv84File(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showToast('That file isn’t readable JSON.', 'warn');
    return;
  }
  const problem = validateBible(data) || (data.translation !== 'NIV' ? 'That isn’t the NIV 84 file.' : '');
  if (problem) {
    showToast(problem, 'warn', 6000);
    return;
  }
  try {
    await saveLocalBible(data);
  } catch (err) {
    console.error(err);
    showToast('Couldn’t store the file in this browser.', 'warn');
    return;
  }
  renderLocalBibles([{ code: 'NIV', name: data.name, verses: verseCount(data) }]);
  renderAll();
  showToast('NIV 84 is ready on this computer.');
}

async function init() {
  state.bg = storageGet('bg', 'video');
  state.dimOpacity = storageGet('dimOpacity', 0.4);
  $('dim-opacity').value = state.dimOpacity;
  $('dim-value').textContent = `${Math.round(state.dimOpacity * 100)}%`;
  $('verify-esv').checked = storageGet('verifyEsv', true);
  $('theme-select').innerHTML = THEMES.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  await loadTheme(THEMES[0]);
  renderLocalBibles(await restoreLocalBibles());
  bindEvents();
  renderAll();
  await loadFromHash();
}

// For the listener and for debugging: build a #outline= link from request text
window.encodeOutlineLink = encodeOutlineLink;

init().catch(err => {
  console.error(err);
  showToast(`Sunday Slides couldn’t start: ${err.message || err}`, 'warn', 10000);
});

