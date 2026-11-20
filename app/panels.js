// Panel geometry: the three poster layouts, cover-fit framing math, and hit
// testing. A panel's framing is { photoId, zoom, offsetX, offsetY }: zoom
// multiplies the cover-fit scale (1 = exactly fills), offsets are fractions of
// the overflow (-1..1), so a framing survives layout and export-size changes.

import { MAX_PANELS } from './state.js';

export const LAYOUTS = {
  grid: { label: '2 × 2 grid', panelCount: 4 },
  strips: { label: '3 vertical strips', panelCount: 3 },
  hero: { label: '1 big + 2 small', panelCount: 3 },
};

/** Zoom bounds shared by the slider, the wheel and the keyboard. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/**
 * @typedef {Object} Panel
 * @property {number|null} photoId
 * @property {number} zoom     multiplier on the cover-fit scale, MIN_ZOOM..MAX_ZOOM
 * @property {number} offsetX  horizontal pan as a fraction of the overflow, -1..1
 * @property {number} offsetY  vertical pan as a fraction of the overflow, -1..1
 */

/** How many panels the layout draws (unknown layouts fall back to the grid). */
export function panelCountOf(layout) {
  return LAYOUTS[layout]?.panelCount ?? LAYOUTS.grid.panelCount;
}

/** A panel with default framing, optionally holding a photo. */
export function createPanel(photoId = null) {
  return { photoId, zoom: 1, offsetX: 0, offsetY: 0 };
}

/** Keep the panel pool at MAX_PANELS so switching layouts never loses framing. */
export function ensurePanelPool(state) {
  while (state.panels.length < MAX_PANELS) state.panels.push(createPanel());
  if (state.selectedPanel >= panelCountOf(state.layout)) state.selectedPanel = 0;
}

/** The active panels of the current layout, in drawing order. */
export function activePanels(state) {
  return state.panels.slice(0, panelCountOf(state.layout));
}

/** Panel rectangles in poster pixels for a layout, with a neon seam gap between them. */
export function panelRects(layout, width, height) {
  const gap = Math.max(2, Math.round(Math.min(width, height) * 0.014));
  if (layout === 'strips') {
    const stripW = (width - gap * 2) / 3;
    return [0, 1, 2].map((i) => ({ x: i * (stripW + gap), y: 0, w: stripW, h: height }));
  }
  if (layout === 'hero') {
    const bigW = Math.round((width - gap) * 0.62);
    const smallW = width - gap - bigW;
    const smallH = (height - gap) / 2;
    return [
      { x: 0, y: 0, w: bigW, h: height },
      { x: bigW + gap, y: 0, w: smallW, h: smallH },
      { x: bigW + gap, y: smallH + gap, w: smallW, h: smallH },
    ];
  }
  const cellW = (width - gap) / 2;
  const cellH = (height - gap) / 2;
  return [
    { x: 0, y: 0, w: cellW, h: cellH },
    { x: cellW + gap, y: 0, w: cellW, h: cellH },
    { x: 0, y: cellH + gap, w: cellW, h: cellH },
    { x: cellW + gap, y: cellH + gap, w: cellW, h: cellH },
  ];
}

/** The scale at which a photo exactly covers a rectangle (no letterboxing). */
export function coverScale(photoW, photoH, rectW, rectH) {
  if (photoW <= 0 || photoH <= 0) return 1;
  return Math.max(rectW / photoW, rectH / photoH);
}

/** Where a panel's photo lands in poster pixels, given its framing. */
export function panelDrawRect(panel, photo, rect) {
  const scale = coverScale(photo.image.width, photo.image.height, rect.w, rect.h) * panel.zoom;
  const drawW = photo.image.width * scale;
  const drawH = photo.image.height * scale;
  const slackX = drawW - rect.w;
  const slackY = drawH - rect.h;
  const centerX = rect.x + rect.w / 2 + (panel.offsetX * slackX) / 2;
  const centerY = rect.y + rect.h / 2 + (panel.offsetY * slackY) / 2;
  return { x: centerX - drawW / 2, y: centerY - drawH / 2, w: drawW, h: drawH };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Snap a framing back into its legal bounds (zoom 1..4, offsets -1..1). */
export function clampPanelFraming(panel) {
  panel.zoom = clamp(panel.zoom, MIN_ZOOM, MAX_ZOOM);
  panel.offsetX = clamp(panel.offsetX, -1, 1);
  panel.offsetY = clamp(panel.offsetY, -1, 1);
}

/** Back to cover-fit, centered: the framing a fresh panel starts with. */
export function resetPanelFraming(panel) {
  panel.zoom = 1;
  panel.offsetX = 0;
  panel.offsetY = 0;
}

/** Zoom a panel by a factor while keeping the photo point under (px, py) fixed. */
export function zoomPanelAt(panel, photo, rect, factor, px, py) {
  const before = panelDrawRect(panel, photo, rect);
  const u = (px - before.x) / before.w;
  const v = (py - before.y) / before.h;
  panel.zoom = clamp(panel.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const centered = panelDrawRect({ ...panel, offsetX: 0, offsetY: 0 }, photo, rect);
  const slackX = centered.w - rect.w;
  const slackY = centered.h - rect.h;
  const wantedCenterX = px - u * centered.w + centered.w / 2;
  const wantedCenterY = py - v * centered.h + centered.h / 2;
  panel.offsetX = slackX > 0.5 ? clamp((wantedCenterX - (rect.x + rect.w / 2)) / (slackX / 2), -1, 1) : 0;
  panel.offsetY = slackY > 0.5 ? clamp((wantedCenterY - (rect.y + rect.h / 2)) / (slackY / 2), -1, 1) : 0;
}

/** Which panel contains a poster-space point, or -1. */
export function hitTestPanel(rects, x, y) {
  return rects.findIndex((rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
}
