// The poster renderer: draws the whole cover into any 2D context at any size.
// The editor preview and the PNG export call the same function, so what you see
// is exactly what you get. Everything is sized from the canvas dimensions, so
// a 540px preview and a 1920px export are the same poster at two scales.

import { findPhoto } from './state.js';
import { activePanels, panelDrawRect, panelRects } from './panels.js';

const FONT_CAPTION = 'Anton';
const FONT_DISPLAY = '"Archivo Black"';

/** The Vice City palette, in one place. */
const SKY_STOPS = [
  [0, '#1b0f3b'],
  [0.4, '#5b1f6e'],
  [0.72, '#d43d8f'],
  [1, '#ff8a3d'],
];
const EMPTY_PANEL_BG = '#221436';
const SEAM_COLOR = 'rgba(255, 255, 255, 0.92)';
const SELECTION_COLOR = '#6ee7ff';

/**
 * Draw the finished cover.
 * options: { selection: panel index or -1, badges: bool } — preview-only chrome;
 * the exporter passes selection -1 / badges false for a clean cover.
 */
export function renderPoster(ctx, state, width, height, options = {}) {
  const { selection = -1, badges = false } = options;
  const rects = panelRects(state.layout, width, height);
  const panels = activePanels(state);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  drawSunsetBackground(ctx, width, height);
  panels.forEach((panel, i) => drawPanel(ctx, state, panel, rects[i], width, height));
  drawPanelSeams(ctx, rects, width, height);
  drawCaptionZone(ctx, state, width, height);
  if (badges) panels.forEach((panel, i) => drawPanelBadge(ctx, i, rects[i], width, height));
  if (selection >= 0 && selection < rects.length) drawSelectionOutline(ctx, rects[selection], width, height);

  ctx.restore();
}

/* ---------------------------------------------------------------- background */

function drawSunsetBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  for (const [stop, color] of SKY_STOPS) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/* ---------------------------------------------------------------- panels */

function drawPanel(ctx, state, panel, rect, width, height) {
  const photo = panel.photoId === null ? null : findPhoto(state, panel.photoId);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  if (photo) {
    const draw = panelDrawRect(panel, photo, rect);
    ctx.filter = `saturate(${state.saturation}) contrast(1.05) brightness(1.02)`;
    ctx.drawImage(photo.image, draw.x, draw.y, draw.w, draw.h);
    ctx.filter = 'none';
    drawViceGrade(ctx, state, rect);
  } else {
    drawEmptyPanel(ctx, rect, width, height);
  }

  ctx.restore();
}

/** The Vice City grade: sunset gradient overlay, warm glow, soft vignette. */
function drawViceGrade(ctx, state, rect) {
  const g = state.grade;
  if (g <= 0.001) return;

  const overlay = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  overlay.addColorStop(0, `rgba(255, 150, 60, ${0.5 * g})`);
  overlay.addColorStop(0.45, `rgba(255, 60, 150, ${0.42 * g})`);
  overlay.addColorStop(1, `rgba(96, 24, 168, ${0.55 * g})`);
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = overlay;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const glow = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.55);
  glow.addColorStop(0, `rgba(255, 140, 70, ${0.2 * g})`);
  glow.addColorStop(1, 'rgba(255, 140, 70, 0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const vignette = ctx.createRadialGradient(cx, cy, Math.min(rect.w, rect.h) * 0.35, cx, cy, Math.max(rect.w, rect.h) * 0.78);
  vignette.addColorStop(0, 'rgba(18, 4, 38, 0)');
  vignette.addColorStop(1, `rgba(18, 4, 38, ${0.38 * g})`);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = vignette;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function drawEmptyPanel(ctx, rect, width, height) {
  ctx.fillStyle = EMPTY_PANEL_BG;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const fontSize = Math.max(12, Math.min(34, Math.min(rect.w, rect.h) * 0.055));
  ctx.font = `${fontSize}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillText('ADD PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.002);
  ctx.setLineDash([fontSize * 0.5, fontSize * 0.4]);
  const inset = fontSize * 0.9;
  ctx.strokeRect(rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);
  ctx.setLineDash([]);
}

/** Crisp white seams around every panel, collage style. */
function drawPanelSeams(ctx, rects, width, height) {
  ctx.strokeStyle = SEAM_COLOR;
  ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.0035));
  for (const rect of rects) {
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
}

/* ---------------------------------------------------------------- caption zone */

function drawCaptionZone(ctx, state, width, height) {
  const zoneH = height * (width >= height ? 0.3 : 0.26);
  const pad = Math.min(width, height) * 0.022;

  const scrim = ctx.createLinearGradient(0, height - zoneH * 1.3, 0, height);
  scrim.addColorStop(0, 'rgba(12, 4, 30, 0)');
  scrim.addColorStop(0.55, 'rgba(28, 8, 48, 0.6)');
  scrim.addColorStop(1, 'rgba(12, 4, 30, 0.95)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height - zoneH * 1.3, width, zoneH * 1.3);

  const sunRadius = zoneH * 0.42;
  ctx.globalAlpha = 0.28 + state.grade * 0.3;
  ctx.drawImage(getSunSprite(sunRadius), width / 2 - sunRadius, height - zoneH * 0.68 - sunRadius);
  ctx.globalAlpha = 1;

  const tagline = state.tagline.trim().toUpperCase();
  if (tagline) {
    const tagSize = Math.max(11, zoneH * 0.075);
    ctx.font = `${tagSize}px ${FONT_DISPLAY}`;
    setLetterSpacing(ctx, tagSize * 0.32);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255, 217, 236, 0.92)';
    const tagY = height - zoneH * 0.56;
    ctx.fillText(tagline, width / 2, tagY);
    const tagHalf = ctx.measureText(tagline).width / 2;
    drawTaglineRules(ctx, width / 2, tagY - tagSize * 0.32, tagHalf, tagSize, width);
    setLetterSpacing(ctx, 0);
  }

  const caption = (state.caption.trim() || 'VICE NIGHTS').toUpperCase();
  const maxCaptionW = width * 0.92;
  let captionSize = zoneH * 0.52;
  ctx.font = `${captionSize}px ${FONT_CAPTION}`;
  const measured = ctx.measureText(caption).width;
  if (measured > maxCaptionW) captionSize *= maxCaptionW / measured;
  ctx.font = `${captionSize}px ${FONT_CAPTION}`;
  setLetterSpacing(ctx, captionSize * 0.02);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = height - zoneH * 0.13;
  const fill = ctx.createLinearGradient(0, baseline - captionSize * 0.74, 0, baseline);
  fill.addColorStop(0, '#ffffff');
  fill.addColorStop(0.55, '#ffe3f1');
  fill.addColorStop(1, '#ff9ad5');
  ctx.shadowColor = 'rgba(255, 46, 136, 0.6)';
  ctx.shadowBlur = captionSize * 0.16;
  ctx.shadowOffsetY = captionSize * 0.03;
  ctx.fillStyle = fill;
  ctx.fillText(caption, width / 2, baseline);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  setLetterSpacing(ctx, 0);

  const markSize = Math.max(10, height * 0.015);
  ctx.font = `${markSize}px ${FONT_DISPLAY}`;
  setLetterSpacing(ctx, markSize * 0.22);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('COVER SNAP', width - pad, height - pad * 0.7);
  setLetterSpacing(ctx, 0);
  ctx.textAlign = 'left';
}

function drawTaglineRules(ctx, centerX, y, tagHalf, tagSize, width) {
  const ruleLen = Math.min(width * 0.08, tagSize * 5);
  const gap = tagSize * 0.8;
  for (const side of [-1, 1]) {
    const from = centerX + side * (tagHalf + gap);
    const to = from + side * ruleLen;
    const gradient = ctx.createLinearGradient(from, 0, to, 0);
    gradient.addColorStop(0, 'rgba(255, 138, 61, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 46, 136, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(from, to), y - 1, ruleLen, 2);
  }
}

/* ---------------------------------------------------------------- sun sprite */

const sunSpriteCache = new Map();
const SUN_SPRITE_CACHE_MAX = 10;

/** A synthwave sun: warm gradient disc with horizontal slice gaps, drawn once per radius. */
function getSunSprite(radius) {
  const key = Math.round(radius);
  const cached = sunSpriteCache.get(key);
  if (cached) return cached;
  const size = key * 2 + 4;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  const center = size / 2;
  const gradient = ctx.createLinearGradient(0, center - key, 0, center + key);
  gradient.addColorStop(0, '#ffd166');
  gradient.addColorStop(0.55, '#ff7ab8');
  gradient.addColorStop(1, '#ff2e88');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, key, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) {
    const y = center + key * (0.02 + i * 0.16);
    const thickness = key * (0.025 + i * 0.024);
    ctx.fillRect(0, y, size, thickness);
  }
  if (sunSpriteCache.size >= SUN_SPRITE_CACHE_MAX) sunSpriteCache.clear();
  sunSpriteCache.set(key, sprite);
  return sprite;
}

/* ---------------------------------------------------------------- preview-only */

function drawPanelBadge(ctx, index, rect, width, height) {
  const fontSize = Math.max(12, Math.min(26, Math.min(rect.w, rect.h) * 0.07));
  const pad = Math.min(width, height) * 0.015;
  const chipW = fontSize * 1.5;
  const chipH = fontSize * 1.35;
  const x = rect.x + pad;
  const y = rect.y + pad;
  ctx.fillStyle = 'rgba(10, 6, 20, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, chipW, chipH, fontSize * 0.3);
  ctx.fill();
  ctx.font = `${fontSize * 0.78}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(index + 1), x + chipW / 2, y + chipH / 2 + fontSize * 0.04);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawSelectionOutline(ctx, rect, width, height) {
  const lineWidth = Math.max(2.5, Math.min(width, height) * 0.004);
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([lineWidth * 4, lineWidth * 2.6]);
  ctx.shadowColor = 'rgba(110, 231, 255, 0.8)';
  ctx.shadowBlur = lineWidth * 4;
  ctx.strokeRect(rect.x + lineWidth / 2, rect.y + lineWidth / 2, rect.w - lineWidth, rect.h - lineWidth);
  ctx.restore();
}

/* ---------------------------------------------------------------- helpers */

/** Letter spacing where the canvas supports it (Chromium does; others degrade gracefully). */
function setLetterSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}
