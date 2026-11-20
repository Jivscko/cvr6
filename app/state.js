// Editor state: one plain object the whole app reads and mutates, plus its defaults.

export const DEFAULT_CAPTION = 'VICE NIGHTS';
export const DEFAULT_TAGLINE = 'NEON CITY · SUNSET STRIP';

/** The largest number of panels any layout uses; the panel pool is kept this long. */
export const MAX_PANELS = 4;

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

/** A photo the user loaded: { id, name, image (HTMLImageElement), url (object URL or null) }. */
export function findPhoto(state, photoId) {
  return state.photos.find((photo) => photo.id === photoId) ?? null;
}
