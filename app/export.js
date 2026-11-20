// PNG export: render the poster at full resolution offscreen, encode with
// canvas.toBlob, and hand the browser a download link. The export calls the
// same renderPoster as the preview (selection/badges off), so the PNG is the
// cover exactly as framed. Nothing leaves the device.

import { renderPoster } from './render.js';

export const EXPORT_SIZES = [
  { id: 'square', label: 'Square', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait', w: 1080, h: 1350 },
  { id: 'wide', label: 'Wide', w: 1920, h: 1080 },
];

/** The size with this id, or the default (square) for unknown ids. */
export function findExportSize(id) {
  return EXPORT_SIZES.find((size) => size.id === id) ?? EXPORT_SIZES[0];
}

/** Render the cover at the size's full resolution and encode it as a PNG blob. */
export async function exportPosterPNG(state, size) {
  if (!Number.isInteger(size.w) || !Number.isInteger(size.h) || size.w <= 0 || size.h <= 0) {
    throw new Error(`Invalid export size ${size.w} × ${size.h}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  renderPoster(ctx, state, size.w, size.h, { selection: -1, badges: false });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
  // Free the offscreen backing store promptly instead of waiting for GC.
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

/** A tidy download name: cover-snap-<caption-slug>-<w>x<h>.png. */
export function exportFileName(state, size) {
  const slug = (state.caption.trim() || 'cover')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'cover';
  return `cover-snap-${slug}-${size.w}x${size.h}.png`;
}
