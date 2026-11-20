// Photo loading and assignment. Files never leave the device: uploads become
// object URLs (revoked when the photo is removed), samples are plain relative
// <img> loads from app/samples/. No fetch, no network, no persistence.

import { createPanel, ensurePanelPool, panelCountOf } from './panels.js';

let nextPhotoId = 1;

/** The bundled demo photos, in the order "Load sample photos" adds them. */
export const SAMPLE_PHOTOS = [
  { name: 'boulevard', label: 'Boulevard' },
  { name: 'pier', label: 'Pier' },
];

function photoFromImage(name, image, url) {
  return { id: nextPhotoId++, name, image, url };
}

/** Load one user file into an image element (object URL, revoked on remove). */
export function loadPhotoFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(photoFromImage(file.name, image, url));
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    image.src = url;
  });
}

/** Load a bundled sample photo by its base name (boulevard / pier). */
export function loadSamplePhoto(name) {
  return new Promise((resolve, reject) => {
    if (!SAMPLE_PHOTOS.some((sample) => sample.name === name)) {
      reject(new Error(`Unknown sample ${name}`));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(photoFromImage(`${name}.jpg`, image, null));
    image.onerror = () => reject(new Error(`Could not load sample ${name}`));
    image.src = `./samples/${name}.jpg`;
  });
}

/** Add a photo and give it to every still-empty active panel. */
export function addPhotoToState(state, photo) {
  state.photos.push(photo);
  ensurePanelPool(state);
  const count = panelCountOf(state.layout);
  for (let i = 0; i < count; i++) {
    if (state.panels[i].photoId === null) state.panels[i].photoId = photo.id;
  }
}

/** Remove a photo, release its object URL, and reassign panels that used it. */
export function removePhotoFromState(state, photoId) {
  const index = state.photos.findIndex((photo) => photo.id === photoId);
  if (index === -1) return;
  const [photo] = state.photos.splice(index, 1);
  if (photo.url) URL.revokeObjectURL(photo.url);
  for (const panel of state.panels) {
    if (panel.photoId === photoId) panel.photoId = state.photos[0]?.id ?? null;
  }
}

/** Give one photo to every active panel. */
export function fillAllPanels(state, photoId) {
  ensurePanelPool(state);
  for (let i = 0; i < panelCountOf(state.layout); i++) state.panels[i].photoId = photoId;
}

/** Deal the loaded photos round-robin across the active panels. */
export function spreadPhotosAcrossPanels(state) {
  if (state.photos.length === 0) return;
  ensurePanelPool(state);
  const count = panelCountOf(state.layout);
  for (let i = 0; i < count; i++) {
    state.panels[i].photoId = state.photos[i % state.photos.length].id;
  }
}

/** Give a freshly added photo to any panel that has none (used after layout changes). */
export function autoFillEmptyPanels(state) {
  if (state.photos.length === 0) return;
  ensurePanelPool(state);
  const count = panelCountOf(state.layout);
  for (let i = 0; i < count; i++) {
    if (state.panels[i].photoId === null) {
      state.panels[i] = createPanel(state.photos[i % state.photos.length].id);
    }
  }
}
