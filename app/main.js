// Cover Snap boot: wait for the vendored display fonts, start the editor,
// apply any deep-link settings, then mark the app ready. A font that fails to
// load degrades to the system fallback instead of killing the app.

import { createEditorState } from './state.js';
import { initEditor } from './editor.js';

async function loadDisplayFonts() {
  await Promise.all([
    document.fonts.load('64px Anton'),
    document.fonts.load('64px "Archivo Black"'),
  ]);
  await document.fonts.ready;
}

async function boot() {
  try {
    await loadDisplayFonts();
  } catch (error) {
    console.warn('Display fonts unavailable, using fallbacks:', error);
  }
  const state = createEditorState();
  const editor = initEditor(state);
  await editor.applyQueryParams(new URLSearchParams(location.search));
  editor.render();
  window.__coverSnapReady = true;
}

boot().catch((error) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `Failed to start: ${error.message}`;
  console.error(error);
});
