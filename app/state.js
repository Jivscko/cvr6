// Editor state: one plain object the whole app reads and mutates, plus its
// defaults. Keeping it a single mutable object (no store, no events) makes the
// render loop trivial: any control mutates state, then calls render().

export const DEFAULT_CAPTION = 'VICE NIGHTS';
export const DEFAULT_TAGLINE = 'NEON CITY · SUNSET STRIP';

/** The largest number of panels any layout uses; the panel pool is kept this long. */
export const MAX_PANELS = 4;

/**
 * @typedef {Object} Photo
 * @property {number} id            unique id, assigned when the photo loads
 * @property {string} name          file name (uploads) or `<sample>.jpg`
 * @property {HTMLImageElement} image  decoded image, ready to draw
 * @property {string|null} url      object URL for uploads (revoked on remove), null for samples
 */

/**
 * @typedef {Object} EditorState
 * @property {'grid'|'strips'|'hero'} layout
 * @property {string} caption
 * @property {string} tagline
 * @property {number} grade         sunset overlay strength, 0..1
 * @property {number} saturation    CSS saturate() factor, 1..2
 * @property {Photo[]} photos
 * @property {import('./panels.js').Panel[]} panels  pool of MAX_PANELS framings
 * @property {number} selectedPanel
 * @property {'square'|'portrait'|'wide'} exportSize
 */

/** A fresh editor state with the default caption, grade and framing. */
export function createEditorState() {
  return {
    layout: 'grid',
    caption: DEFAULT_CAPTION,
    tagline: DEFAULT_TAGLINE,
    grade: 0.75,
    saturation: 1.4,
    photos: [],
    panels: [],
    selectedPanel: 0,
    exportSize: 'square',
  };
}

/** The loaded photo with this id, or null when it was removed. */
export function findPhoto(state, photoId) {
  return state.photos.find((photo) => photo.id === photoId) ?? null;
}
