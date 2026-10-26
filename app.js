import JSZip from 'jszip';
import { parseRequestFile, extractCommunicatorLastName, serviceDateCode } from './src/requests.js';
import { buildSlides, layoutSlides, layoutForKind, newId, KIND_LABELS } from './src/slides.js';
import { parseTheme, resolveLayouts } from './src/theme.js';
import { setFontMap, measure, fontMetrics, clearMetricsCache, drawSlide, renderSlidePng } from './src/render.js';
import { fetchChapter, compareVerse, isNivTranslation } from './src/bible.js';
import { parseRuns, plainText } from './src/layout.js';
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

// ---------- Checking scripture against the ESV ----------
async function verifyScripture() {
  const targets = state.slides.filter(s => s.kind === 'scripture' && s.ref && s.verseText && !isNivTranslation(s.ref.translation));
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
        slide.checks = [...slide.checks, `Couldn't reach Bolls to check ${slide.reference} against the ${slide.ref.translation}.`];
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
      if (first) slide.checks = [...slide.checks, { danger: true, text: `Verse ${slide.ref.verse} doesn’t match the ${slide.ref.translation}. Compare in the editor.` }];
      next.push(slide);
    } else if (result.kind === 'spacing' && whole && !slide.edited) {
      changed += 1;
      next.push(...relayout([{ ...slide, source: verse.text, verseText: verse.text, checks: [...slide.checks, `Verse ${slide.ref.verse}: fixed spacing to match the ${slide.ref.translation}.`] }]));
    } else if (result.kind === 'partial' && whole && !slide.edited && result.rest) {
      changed += 1;
      const source = `${slide.source} {${result.rest}}`;
      next.push(...relayout([{ ...slide, source, checks: [...slide.checks, `Verse ${slide.ref.verse} is quoted in part; the rest of the verse is dimmed.`] }]));
    } else {
      if (result.kind !== 'same' && first) slide.checks = [...slide.checks, `Verse ${slide.ref.verse} differs slightly from the ${slide.ref.translation}. Compare in the editor.`];
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
  if (slide.kind === 'scripture') return `${slide.reference}${slide.ref ? ` · v${slide.ref.verse}` : ''}`;
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
    card.addEventListener('click', () => openEditor(i));
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
  drawSlide(canvas.getContext('2d'), slide, state.layouts, state.theme.assets, { dimOpacity: state.dimOpacity });
  const overlay = $('placeholder-overlay');
  overlay.hidden = slide.kind !== 'placeholder';
  overlay.textContent = slide.kind === 'placeholder' ? slide.text || 'Placeholder' : '';
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
  const refField = $('edit-reference-field');
  refField.hidden = !(slide.kind === 'scripture' || slide.kind === 'quote');
  $('edit-reference-label').textContent = slide.kind === 'quote' ? 'Author' : 'Reference';
  $('edit-reference').value = slide.reference || '';
  const textEl = $('edit-text');
  if (document.activeElement !== textEl) textEl.value = slide.text || '';
  textEl.disabled = slide.kind === 'blank';
  textEl.placeholder = slide.kind === 'placeholder' ? 'What goes here (shows as the cue label)' : '';
  $('btn-relayout').disabled = !slide.layout || slide.kind === 'blank';

  // ESV comparison for scripture that doesn't match
  const compare = $('esv-compare');
  const showEsv = slide.esv && slide.esv.kind !== 'same';
  compare.hidden = !showEsv;
  $('btn-use-esv').hidden = !showEsv;
  if (showEsv) {
    compare.innerHTML = `<strong>${escapeHtml(slide.ref.translation)} (Bolls) · verse ${slide.ref.verse}</strong>${escapeHtml(slide.esv.text)}
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
  if (has && view === 'grid') renderGrid();
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
    drawEditorCanvas();
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

function splitAtCursor() {
  const slide = activeSlide();
  const textEl = $('edit-text');
  const pos = textEl.selectionStart;
  const before = slide.text.slice(0, pos).trim();
  const after = slide.text.slice(pos).trim();
  if (!before || !after) {
    showToast('Put the cursor where the new slide should start.', 'warn');
    return;
  }
  const balance = (s, from, to) => {
    // Keep {dim} markup balanced across the split
    const open = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
    return open > 0 ? (to ? s + '}' : s) : from && /^[^{]*\}/.test(s) ? '{' + s : s;
  };
  slide.text = balance(before, false, true);
  slide.edited = true;
  const second = { ...slide, id: newId(), text: balance(after, true, false), cues: [], checks: [], edited: true };
  state.slides.splice(state.active + 1, 0, second);
  renderAll();
  showToast('Split into two slides.');
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

function deleteSlide() {
  const slide = activeSlide();
  if (!slide) return;
  const next = state.slides[state.active + 1] || state.slides[state.active - 1];
  if (slide.cues.length && next) next.cues = [...slide.cues, ...next.cues];
  state.slides.splice(state.active, 1);
  if (state.active >= state.slides.length) state.active = state.slides.length - 1;
  if (!state.slides.length) state.view = 'grid';
  renderAll();
  showToast(slide.cues.length && next ? 'Slide deleted; its cues moved to the neighboring slide.' : 'Slide deleted.');
}

function dimSelection() {
  const textEl = $('edit-text');
  const { selectionStart: s, selectionEnd: e, value } = textEl;
  if (s === e) return showToast('Select the words to dim first.', 'warn');
  const slide = activeSlide();
  const inner = value.slice(s, e).replace(/[{}]/g, '');
  slide.text = `${value.slice(0, s)}{${inner}}${value.slice(e)}`.replace(/\}\s*\{/g, ' ');
  slide.edited = true;
  textEl.value = slide.text;
  slideEdited();
}

function undimAll() {
  const slide = activeSlide();
  slide.text = slide.text.replace(/[{}]/g, '');
  slide.edited = true;
  $('edit-text').value = slide.text;
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
  showToast(`Now using the ${slide.ref.translation} text from Bolls.`);
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
          ${s.reference ? `<span class="proof-ref">${escapeHtml(s.reference)}</span>` : ''}
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
    if (state.view !== 'editor' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') openEditor(state.active - 1);
    if (e.key === 'ArrowRight') openEditor(state.active + 1);
    if (e.key === 'Escape') setView('grid');
  });

  $('edit-text').addEventListener('input', e => {
    const slide = activeSlide();
    slide.text = e.target.value;
    slide.edited = true;
    slide.overflow = false;
    if (slide.needsText && slide.text.trim()) slide.needsText = false;
    slideEdited();
  });
  $('edit-reference').addEventListener('input', e => {
    const slide = activeSlide();
    slide.reference = e.target.value;
    slideEdited();
  });
  $('edit-kind').addEventListener('change', e => {
    const slide = activeSlide();
    slide.kind = e.target.value;
    slide.layout = layoutForKind(slide.kind);
    slide.edited = true;
    renderAll();
  });
  $('btn-dim').addEventListener('click', dimSelection);
  $('btn-undim').addEventListener('click', undimAll);
  $('btn-relayout').addEventListener('click', autoLineBreaks);
  $('btn-use-esv').addEventListener('click', useEsvText);
  $('btn-split').addEventListener('click', splitAtCursor);
  $('btn-merge').addEventListener('click', mergeWithNext);
  $('btn-move-up').addEventListener('click', () => moveSlide(state.active, state.active - 1));
  $('btn-move-down').addEventListener('click', () => moveSlide(state.active, state.active + 2));
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
    if (state.view === 'editor') drawEditorCanvas();
  });
  $('dim-opacity').addEventListener('change', () => state.view === 'grid' && renderGrid());
  $('verify-esv').addEventListener('change', e => storageSet('verifyEsv', e.target.checked));

  $('theme-select').addEventListener('change', async e => {
    const theme = THEMES.find(t => t.id === e.target.value);
    await loadTheme(theme);
    state.slides = relayout(state.slides);
    renderAll();
  });

  window.addEventListener('hashchange', loadFromHash);
}

async function init() {
  state.bg = storageGet('bg', 'video');
  state.dimOpacity = storageGet('dimOpacity', 0.4);
  $('dim-opacity').value = state.dimOpacity;
  $('dim-value').textContent = `${Math.round(state.dimOpacity * 100)}%`;
  $('verify-esv').checked = storageGet('verifyEsv', true);
  $('theme-select').innerHTML = THEMES.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  await loadTheme(THEMES[0]);
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

