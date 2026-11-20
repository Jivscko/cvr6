// PNG export: render the poster at full resolution offscreen, encode with
// canvas.toBlob, and hand the browser a download link. Nothing leaves the device.

import { renderPoster } from './render.js';

export const EXPORT_SIZES = [
  { id: 'square', label: 'Square', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait', w: 1080, h: 1350 },
  { id: 'wide', label: 'Wide', w: 1920, h: 1080 },
];

export function findExportSize(id) {
  return EXPORT_SIZES.find((size) => size.id === id) ?? EXPORT_SIZES[0];
}

/** Render the cover at the size's full resolution and encode it as a PNG blob. */
export async function exportPosterPNG(state, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  renderPoster(ctx, state, size.w, size.h, { selection: -1, badges: false });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
  return blob;
}

export function exportFileName(state, size) {
  const slug = (state.caption.trim() || 'cover')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'cover';
  return `cover-snap-${slug}-${size.w}x${size.h}.png`;
}
