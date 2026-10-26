/**
 * Draw slides on a canvas at full resolution (3840×2160) with a transparent
 * background, following the theme's template slide: its image elements (the
 * content bar) and its text boxes, filled with the slide's text.
 */

import { wrapLines, linePitch, baselineOffset, textArea, applyCase } from './layout.js';

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

let fontMap = {};
export function setFontMap(map) {
  fontMap = map;
}

export function cssFont(style) {
  const f = fontMap[style.font] || { family: 'Lato', weight: 400 };
  return `${f.weight} ${style.size}px "${f.family}"`;
}

function applyFont(ctx, style) {
  ctx.font = cssFont(style);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${style.letterSpacing || 0}px`;
}

/** Width of a string in px at this style, including letter spacing. */
export function measure(str, style) {
  applyFont(measureCtx, style);
  let w = measureCtx.measureText(str).width;
  if (!('letterSpacing' in measureCtx)) w += (style.letterSpacing || 0) * str.length;
  return w;
}

const metricsCache = {};
/** Font ascent/descent in px (the font's own line metrics, as Core Text uses). */
export function fontMetrics(style) {
  const key = cssFont(style);
  if (!metricsCache[key]) {
    applyFont(measureCtx, style);
    const m = measureCtx.measureText('Hg');
    metricsCache[key] = { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
  }
  return metricsCache[key];
}

export function clearMetricsCache() {
  for (const k of Object.keys(metricsCache)) delete metricsCache[k];
}

const imageCache = {};
export function loadImage(url) {
  if (!imageCache[url]) {
    imageCache[url] = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
  return imageCache[url];
}

function rgba([r, g, b], a = 1) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Draw wrapped text into an element's box, honoring alignment and dimmed runs. */
function drawText(ctx, element, text, dimOpacity) {
  const { bounds, style } = element;
  if (!text) return;
  applyFont(ctx, style);
  const area = textArea(element);
  const lines = wrapLines(applyCase(text, style), area.w, measure, style);
  const metrics = fontMetrics(style);
  const pitch = linePitch(style, metrics);
  const blockHeight = lines.length * pitch;
  let top = bounds.y;
  if (element.valign === 'middle') top = bounds.y + (bounds.h - blockHeight) / 2;
  else if (element.valign === 'bottom') top = bounds.y + bounds.h - blockHeight;
  const toBaseline = baselineOffset(style, metrics);

  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const baseline = top + i * pitch + toBaseline;
    let x = area.x;
    if (style.align === 'center') x = area.x + (area.w - line.width) / 2;
    else if (style.align === 'right') x = area.x + area.w - line.width;
    for (const piece of line.pieces) {
      ctx.fillStyle = rgba(style.color, piece.dim ? dimOpacity : 1);
      ctx.fillText(piece.text, x, baseline);
      x += measure(piece.text, style);
    }
  });
}

/**
 * Render one slide.
 * @param ctx      2D context of a canvas sized to the theme slide (3840×2160)
 * @param slide    slide object (see slides.js)
 * @param layouts  resolved theme layouts
 * @param assets   theme image fills by file name -> URL
 * @param options  { dimOpacity, skipText } (skipText: the editor types over the slide)
 */
export async function drawSlide(ctx, slide, layouts, assets, options = {}) {
  const dimOpacity = options.dimOpacity ?? 0.4;
  // Clear in device pixels; callers may have scaled the context for thumbnails
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  if (!slide.layout || slide.kind === 'blank') return;
  const layout = layouts[slide.layout];
  for (const el of layout.slide.elements) {
    if (el === layout.text) {
      if (!options.skipText) drawText(ctx, el, slide.needsText ? '' : slide.text, dimOpacity);
    } else if (el === layout.reference) {
      if (!options.skipText) drawText(ctx, el, slide.reference, dimOpacity);
    } else if (el.image && assets[el.image]) {
      const img = await loadImage(assets[el.image]);
      ctx.globalAlpha = el.opacity;
      ctx.drawImage(img, el.bounds.x, el.bounds.y, el.bounds.w, el.bounds.h);
      ctx.globalAlpha = 1;
    }
  }
}

/** Render to a PNG blob on a fresh full-size canvas. */
export async function renderSlidePng(slide, layouts, assets, size, options) {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  await drawSlide(canvas.getContext('2d'), slide, layouts, assets, options);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
