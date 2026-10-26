/**
 * Type-on-the-slide editing. Each of the slide's text boxes gets an editable
 * box laid exactly over the full-resolution slide, styled from the theme (font,
 * size, line spacing, alignment, caps), so editing looks like ProPresenter.
 *
 * The slide model stays plain text with \n for line breaks and {braces} for
 * dimmed words; these helpers convert between that and the editable HTML.
 */

import { parseRuns, linePitch, TEXT_INSET } from './layout.js';
import { cssFont, fontMetrics } from './render.js';

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Slide text -> editable HTML (dimmed runs in <span class="dim">, \n as <br>). */
export function textToHtml(text) {
  const html = parseRuns(text || '')
    .map(r => {
      const inner = escapeHtml(r.text).replace(/\n/g, '<br>');
      return r.dim ? `<span class="dim">${inner}</span>` : inner;
    })
    .join('');
  // A trailing <br> needs a second one to show the empty last line
  return /<br>(<\/span>)?$/.test(html) ? html + '<br>' : html;
}

/** Walk editable content in order, calling visit(char, dim) for each character. */
function walk(node, visit, dim = false) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      for (const ch of child.nodeValue) visit(ch === ' ' ? ' ' : ch, dim, child);
    } else if (child.nodeName === 'BR') {
      visit('\n', dim, child);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      // Browsers wrap new lines in <div>s when they get the chance
      const block = child.nodeName === 'DIV' || child.nodeName === 'P';
      if (block && child.previousSibling) visit('\n', dim, child);
      walk(child, visit, dim || child.classList.contains('dim'));
    }
  }
}

/** Editable content -> slide text with \n and {dim} markup. */
export function htmlToText(root) {
  let out = '';
  let prevDim = false;
  walk(root, (ch, dim) => {
    if (dim && !prevDim) out += '{';
    if (!dim && prevDim) out += '}';
    out += ch;
    prevDim = dim;
  });
  if (prevDim) out += '}';
  return out.replace(/\n+$/, '').replace(/\{\}/g, '');
}

/** Plain-text offset of a DOM position inside root (line breaks count as one character). */
export function textOffset(root, node, offset) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  const frag = document.createElement('div');
  frag.appendChild(range.cloneContents());
  let n = 0;
  walk(frag, () => (n += 1));
  return n;
}

/** Current selection inside root as plain-text offsets, or null. */
export function selectionOffsets(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  return { start: textOffset(root, r.startContainer, r.startOffset), end: textOffset(root, r.endContainer, r.endOffset) };
}

/** Put the selection back at plain-text offsets after re-rendering. */
export function setSelectionOffsets(root, start, end = start) {
  const points = [];
  let n = 0;
  walk(root, (ch, dim, node) => {
    points.push({ n, node, ch });
    n += 1;
  });
  const locate = target => {
    for (const p of points) {
      if (p.n === target) {
        if (p.node.nodeType === Node.TEXT_NODE) {
          // Offset within this text node
          const before = points.filter(q => q.node === p.node && q.n < target).length;
          return [p.node, before];
        }
        const parent = p.node.parentNode;
        return [parent, Array.prototype.indexOf.call(parent.childNodes, p.node)];
      }
    }
    return [root, root.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...locate(start));
  range.setEnd(...locate(end));
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Build an editable box over a theme text element. Returns { box, editor }.
 * `box` is positioned in full-slide pixels; `editor` is the contenteditable.
 */
export function createTextBox(element, { placeholder = '' } = {}) {
  const { bounds, style, valign } = element;
  const metrics = fontMetrics(style);
  const box = document.createElement('div');
  box.className = 'slide-textbox';
  Object.assign(box.style, {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.w}px`,
    height: `${bounds.h}px`,
    padding: `0 ${TEXT_INSET}px`,
    justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
  });
  const editor = document.createElement('div');
  editor.className = 'slide-editable';
  editor.contentEditable = 'true';
  editor.spellcheck = true;
  editor.dataset.placeholder = placeholder;
  const [r, g, b] = style.color;
  Object.assign(editor.style, {
    font: cssFont(style),
    lineHeight: `${linePitch(style, metrics)}px`,
    letterSpacing: `${style.letterSpacing || 0}px`,
    textAlign: style.align === 'justify' ? 'left' : style.align,
    textTransform: style.caps ? 'uppercase' : 'none',
    color: `rgb(${r}, ${g}, ${b})`,
  });
  box.appendChild(editor);
  // Clicking the empty part of the box puts the cursor in the text
  box.addEventListener('mousedown', e => {
    if (e.target !== box) return;
    e.preventDefault();
    editor.focus();
    setSelectionOffsets(editor, htmlToText(editor).replace(/[{}]/g, '').length);
  });
  return { box, editor };
}

/**
 * Wire up typing behavior: Enter makes a line break (not a new paragraph),
 * Option+Enter splits the slide (as in ProPresenter) when `onSplit` is given,
 * pasted text arrives as plain text, Escape leaves the box.
 */
export function bindEditable(editor, { onSplit } = {}, onChange) {
  editor.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      if (onSplit) onSplit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    } else if (e.key === 'Escape') {
      editor.blur(); // the editor then goes back to the grid
    }
  });
  editor.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'));
  });
  editor.addEventListener('input', () => onChange(htmlToText(editor)));
}
