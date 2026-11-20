// Cover Snap boot: wait for the vendored display fonts, start the editor,
// apply any deep-link settings, then mark the app ready. A font that fails to
// load (or hangs) degrades to the system fallback instead of killing the app.

import { createEditorState } from './state.js';
import { initEditor } from './editor.js';

/** Never let a stuck font load block boot: fall back after 4 seconds. */
const FONT_LOAD_TIMEOUT_MS = 4000;

async function loadDisplayFonts() {
  const loading = (async () => {
    await Promise.all([
      document.fonts.load('64px Anton'),
      document.fonts.load('64px "Archivo Black"'),
    ]);
    await document.fonts.ready;
  })();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('font load timed out')), FONT_LOAD_TIMEOUT_MS);
  });
  try {
    await Promise.race([loading, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
  const message = error instanceof Error ? error.message : String(error);
  if (status) status.textContent = `Failed to start: ${message}`;
  console.error(error);
});
