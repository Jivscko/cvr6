// The editor: wires every control to the state, keeps the live preview canvas
// sized to the chosen export aspect, and handles per-panel drag / wheel /
// keyboard framing. Every mutation ends in render(); there is no other path
// to the canvas, so preview and export can never disagree.

import { findPhoto } from './state.js';
import {
  LAYOUTS,
  panelCountOf,
  ensurePanelPool,
  panelRects,
  panelDrawRect,
  clamp,
  clampPanelFraming,
  resetPanelFraming,
  zoomPanelAt,
  hitTestPanel,
} from './panels.js';
import {
  SAMPLE_PHOTOS,
  loadPhotoFromFile,
  loadSamplePhoto,
  addPhotoToState,
  removePhotoFromState,
  fillAllPanels,
  spreadPhotosAcrossPanels,
  autoFillEmptyPanels,
} from './photos.js';
import { renderPoster } from './render.js';
import { findExportSize, exportPosterPNG, exportFileName } from './export.js';

const byId = (id) => document.getElementById(id);

export function initEditor(state) {
  const stage = byId('stage');
  const canvas = byId('preview-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  const stageHint = byId('stage-hint');
  const statusEl = byId('status');
  const photoInput = byId('photo-input');
  const libraryEl = byId('photo-library');
  const captionInput = byId('caption-input');
  const taglineInput = byId('tagline-input');
  const gradeInput = byId('grade-input');
  const gradeValue = byId('grade-value');
  const saturationInput = byId('saturation-input');
  const saturationValue = byId('saturation-value');
  const zoomInput = byId('zoom-input');
  const zoomValue = byId('zoom-value');
  const panelIndicator = byId('panel-indicator');
  const panelChips = byId('panel-chips');
  const exportButton = byId('export-button');
  const downloadLink = byId('download-link');

  let currentRects = [];
  let drag = null;
  let lastDownloadUrl = null;

  /* ---------------------------------------------------------------- preview */

  function render() {
    if (canvas.width === 0 || canvas.height === 0) return;
    currentRects = panelRects(state.layout, canvas.width, canvas.height);
    renderPoster(ctx, state, canvas.width, canvas.height, {
      selection: state.selectedPanel,
      badges: true,
    });
    stageHint.hidden = state.photos.length > 0;
  }

  /** Size the preview to the export aspect, at up to 2x for sharp screens. */
  function fitCanvas() {
    const size = findExportSize(state.exportSize);
    const aspect = size.w / size.h;
    const availW = Math.max(80, stage.clientWidth - 48);
    const availH = Math.max(80, stage.clientHeight - 48);
    const cssW = Math.min(availW, availH * aspect);
    const cssH = cssW / aspect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    render();
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  /* ---------------------------------------------------------------- controls */

  function syncControls() {
    for (const button of document.querySelectorAll('#layout-buttons .layout-button')) {
      const active = button.dataset.layout === state.layout;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of document.querySelectorAll('#size-buttons button')) {
      const active = button.dataset.size === state.exportSize;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const count = panelCountOf(state.layout);
    panelChips.textContent = '';
    for (let i = 0; i < count; i++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `panel-chip${i === state.selectedPanel ? ' is-active' : ''}`;
      chip.textContent = String(i + 1);
      chip.setAttribute('aria-label', `Select panel ${i + 1}`);
      chip.setAttribute('aria-pressed', String(i === state.selectedPanel));
      chip.addEventListener('click', () => selectPanel(i));
      panelChips.appendChild(chip);
    }
    panelIndicator.textContent = String(state.selectedPanel + 1);
    const panel = state.panels[state.selectedPanel] ?? state.panels[0];
    zoomInput.value = String(Math.round(panel.zoom * 100));
    zoomValue.textContent = `${Math.round(panel.zoom * 100)}%`;
    gradeInput.value = String(Math.round(state.grade * 100));
    gradeValue.textContent = `${Math.round(state.grade * 100)}%`;
    saturationInput.value = String(Math.round(state.saturation * 100));
    saturationValue.textContent = `${Math.round(state.saturation * 100)}%`;
    captionInput.value = state.caption;
    taglineInput.value = state.tagline;
  }

  function selectPanel(index) {
    state.selectedPanel = clamp(index, 0, panelCountOf(state.layout) - 1);
    syncControls();
    render();
  }

  function rebuildLibrary() {
    libraryEl.textContent = '';
    for (const photo of state.photos) {
      const item = document.createElement('div');
      item.className = 'photo-item';

      const thumb = document.createElement('img');
      thumb.src = photo.image.src;
      thumb.alt = photo.name;

      const name = document.createElement('span');
      name.className = 'photo-name';
      name.textContent = photo.name;
      name.title = photo.name;

      const actions = document.createElement('span');
      actions.className = 'photo-actions';
      for (const [action, label, title] of [
        ['panel', '→ panel', 'Use in the selected panel'],
        ['all', 'all panels', 'Use in every panel'],
        ['remove', '✕', 'Remove this photo'],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = action;
        button.dataset.id = String(photo.id);
        button.textContent = label;
        button.title = title;
        actions.appendChild(button);
      }

      item.append(thumb, name, actions);
      libraryEl.appendChild(item);
    }
  }

  /* ---------------------------------------------------------------- photos */

  async function addFiles(files) {
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        addPhotoToState(state, await loadPhotoFromFile(file));
        added++;
      } catch (error) {
        setStatus(error.message);
      }
    }
    if (added > 0) {
      rebuildLibrary();
      syncControls();
      render();
      setStatus(`Added ${added} photo${added === 1 ? '' : 's'} — drag panels to frame them`);
    }
  }

  async function loadSamples(names) {
    let added = 0;
    for (const name of names) {
      if (state.photos.some((photo) => photo.name === `${name}.jpg`)) continue;
      try {
        addPhotoToState(state, await loadSamplePhoto(name));
        added++;
      } catch (error) {
        setStatus(error.message);
      }
    }
    if (added > 0) {
      if (names.length > 1) spreadPhotosAcrossPanels(state);
      rebuildLibrary();
      syncControls();
      render();
      setStatus('Sample photos loaded — edit the caption or export');
    }
    return added;
  }

  photoInput.addEventListener('change', () => {
    const files = [...photoInput.files];
    photoInput.value = '';
    void addFiles(files);
  });

  byId('load-samples').addEventListener('click', async (evt) => {
    const button = evt.currentTarget;
    button.disabled = true;
    try {
      await loadSamples(SAMPLE_PHOTOS.map((sample) => sample.name));
    } finally {
      button.disabled = false;
    }
  });

  byId('spread-photos').addEventListener('click', () => {
    if (state.photos.length === 0) {
      setStatus('Load photos first');
      return;
    }
    spreadPhotosAcrossPanels(state);
    render();
    setStatus('Photos spread across the panels');
  });

  libraryEl.addEventListener('click', (evt) => {
    const button = evt.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'panel') {
      state.panels[state.selectedPanel].photoId = id;
      render();
      setStatus(`Photo set on panel ${state.selectedPanel + 1}`);
    } else if (button.dataset.action === 'all') {
      fillAllPanels(state, id);
      render();
      setStatus('Photo filled every panel');
    } else if (button.dataset.action === 'remove') {
      removePhotoFromState(state, id);
      rebuildLibrary();
      render();
      setStatus('Photo removed');
    }
  });

  /* ---------------------------------------------------------------- layout & caption */

  byId('layout-buttons').addEventListener('click', (evt) => {
    const button = evt.target.closest('.layout-button');
    if (!button || !LAYOUTS[button.dataset.layout]) return;
    state.layout = button.dataset.layout;
    ensurePanelPool(state);
    autoFillEmptyPanels(state);
    syncControls();
    render();
  });

  captionInput.addEventListener('input', () => {
    state.caption = captionInput.value;
    render();
  });

  taglineInput.addEventListener('input', () => {
    state.tagline = taglineInput.value;
    render();
  });

  gradeInput.addEventListener('input', () => {
    state.grade = Number(gradeInput.value) / 100;
    gradeValue.textContent = `${gradeInput.value}%`;
    render();
  });

  saturationInput.addEventListener('input', () => {
    state.saturation = Number(saturationInput.value) / 100;
    saturationValue.textContent = `${saturationInput.value}%`;
    render();
  });

  /* ---------------------------------------------------------------- panel framing */

  zoomInput.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    panel.zoom = Number(zoomInput.value) / 100;
    clampPanelFraming(panel);
    zoomValue.textContent = `${zoomInput.value}%`;
    render();
  });

  byId('reset-panel').addEventListener('click', () => {
    resetPanelFraming(state.panels[state.selectedPanel]);
    syncControls();
    render();
  });

  /** A pointer event's position in poster (canvas backing-store) pixels. */
  function posterPoint(evt) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((evt.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  canvas.addEventListener('pointerdown', (evt) => {
    if (evt.button !== 0) return;
    const { x, y } = posterPoint(evt);
    const index = hitTestPanel(currentRects, x, y);
    if (index === -1) return;
    selectPanel(index);
    const panel = state.panels[index];
    if (panel.photoId === null) return;
    drag = { index, startX: x, startY: y, offsetX: panel.offsetX, offsetY: panel.offsetY };
    canvas.setPointerCapture(evt.pointerId);
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (evt) => {
    if (!drag) return;
    const { x, y } = posterPoint(evt);
    const panel = state.panels[drag.index];
    const photo = findPhoto(state, panel.photoId);
    if (!photo) return;
    const rect = currentRects[drag.index];
    const draw = panelDrawRect(panel, photo, rect);
    const slackX = draw.w - rect.w;
    const slackY = draw.h - rect.h;
    panel.offsetX = clamp(drag.offsetX + (slackX > 0.5 ? (2 * (x - drag.startX)) / slackX : 0), -1, 1);
    panel.offsetY = clamp(drag.offsetY + (slackY > 0.5 ? (2 * (y - drag.startY)) / slackY : 0), -1, 1);
    render();
  });

  const endDrag = () => {
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    const { x, y } = posterPoint(evt);
    let index = hitTestPanel(currentRects, x, y);
    if (index === -1) index = state.selectedPanel;
    const panel = state.panels[index];
    const photo = findPhoto(state, panel.photoId);
    if (!photo) return;
    state.selectedPanel = index;
    zoomPanelAt(panel, photo, currentRects[index], Math.exp(-evt.deltaY * 0.0012), x, y);
    syncControls();
    render();
  }, { passive: false });

  canvas.addEventListener('dblclick', (evt) => {
    const { x, y } = posterPoint(evt);
    const index = hitTestPanel(currentRects, x, y);
    if (index === -1) return;
    resetPanelFraming(state.panels[index]);
    selectPanel(index);
  });

  window.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && drag) {
      endDrag();
      return;
    }
    if (evt.target instanceof HTMLInputElement || evt.target instanceof HTMLTextAreaElement) return;
    const panel = state.panels[state.selectedPanel];
    const photo = findPhoto(state, panel.photoId);
    if (!photo) return;
    const step = 0.06;
    let handled = true;
    switch (evt.key) {
      case 'ArrowLeft': panel.offsetX -= step; break;
      case 'ArrowRight': panel.offsetX += step; break;
      case 'ArrowUp': panel.offsetY -= step; break;
      case 'ArrowDown': panel.offsetY += step; break;
      case '+': case '=': panel.zoom *= 1.1; break;
      case '-': case '_': panel.zoom /= 1.1; break;
      default: handled = false;
    }
    if (handled) {
      evt.preventDefault();
      clampPanelFraming(panel);
      syncControls();
      render();
    }
  });

  /* ---------------------------------------------------------------- export */

  byId('size-buttons').addEventListener('click', (evt) => {
    const button = evt.target.closest('button[data-size]');
    if (!button) return;
    state.exportSize = button.dataset.size;
    syncControls();
    fitCanvas();
  });

  exportButton.addEventListener('click', async () => {
    const size = findExportSize(state.exportSize);
    exportButton.disabled = true;
    exportButton.textContent = 'Rendering…';
    setStatus(`Rendering ${size.w} × ${size.h}…`);
    try {
      const blob = await exportPosterPNG(state, size);
      if (lastDownloadUrl) URL.revokeObjectURL(lastDownloadUrl);
      lastDownloadUrl = URL.createObjectURL(blob);
      downloadLink.href = lastDownloadUrl;
      downloadLink.download = exportFileName(state, size);
      downloadLink.textContent = `Download ${size.w} × ${size.h}`;
      downloadLink.hidden = false;
      downloadLink.click();
      setStatus(`Exported ${size.w} × ${size.h} PNG (${Math.round(blob.size / 1024)} KB)`);
    } catch (error) {
      setStatus(`Export failed: ${error.message}`);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'Export PNG';
    }
  });

  /* ---------------------------------------------------------------- query params */

  /** Optional deep-link settings (?caption=…&tagline=…&layout=…&size=…&grade=…&sat=…&photo=boulevard|pier|both). */
  async function applyQueryParams(params) {
    if (params.has('caption')) state.caption = params.get('caption').slice(0, 28);
    if (params.has('tagline')) state.tagline = params.get('tagline').slice(0, 48);
    if (params.has('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
    if (params.has('size') && findExportSize(params.get('size')).id === params.get('size')) {
      state.exportSize = params.get('size');
    }
    if (params.has('grade')) state.grade = clamp(Number(params.get('grade')) || 0, 0, 100) / 100;
    if (params.has('sat')) state.saturation = clamp(Number(params.get('sat')) || 140, 100, 200) / 100;
    ensurePanelPool(state);
    const photoParam = params.get('photo');
    if (photoParam) {
      const names = photoParam === 'both'
        ? SAMPLE_PHOTOS.map((sample) => sample.name)
        : SAMPLE_PHOTOS.filter((sample) => sample.name === photoParam).map((sample) => sample.name);
      if (names.length > 0) await loadSamples(names);
    }
    syncControls();
    fitCanvas();
  }

  /* ---------------------------------------------------------------- boot */

  new ResizeObserver(fitCanvas).observe(stage);
  ensurePanelPool(state);
  syncControls();
  rebuildLibrary();
  fitCanvas();
  setStatus('Ready — load photos to begin');

  return { render, fitCanvas, syncControls, rebuildLibrary, setStatus, applyQueryParams, loadSamples };
}
