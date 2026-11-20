// Vice Frame — editor wiring.
//
// The page owns the photos (loaded Image objects) and the spec (the
// plain-data cover description from cover.js). Every control edits the
// spec; every edit re-renders through the same renderCover the exports
// use. Undo/redo snapshot the spec as JSON.
import { SIZES, GRADES, GRADE_ORDER, LAYOUTS, slotCount, freshPanel, renderCover } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusLine = document.getElementById('status');

const photos = []; // [{ img, name }]
const spec = {
  layout: 'hero',
  grade: 'sunset',
  title: 'Sunset Heist',
  subtitle: 'A Vice Frame Story',
  size: '1080x1080',
  stars: true,
  badge: false,
  grain: true,
  vignette: true,
  panels: [],
};
let selectedPanel = 0;
let brushPhoto = 0;
let paintedRects = [];

/** Promise wrapper around an Image load. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// -------------------------------------------------------------- panel set

/** Guarantees a crop record for every slot of the current layout. */
function ensurePanels() {
  const count = slotCount(spec.layout);
  for (let i = 0; i < count; i++) {
    if (!spec.panels[i]) {
      spec.panels[i] = freshPanel(photos.length ? i % photos.length : 0, i);
    }
    if (spec.panels[i].photo >= photos.length) spec.panels[i].photo = 0;
  }
}

/** Re-deals photos and focal points across all panels from scratch. */
function distribute() {
  const count = slotCount(spec.layout);
  spec.panels = [];
  for (let i = 0; i < count; i++) {
    spec.panels.push(freshPanel(photos.length ? i % photos.length : 0, i));
  }
}

// ---------------------------------------------------------------- history

const past = [];
const future = [];
let committed = '';

function takeSnapshot() {
  return JSON.stringify({ ...spec, panels: spec.panels.map((p) => ({ ...p })) });
}

function commitHistory(previousSnapshot) {
  past.push(previousSnapshot ?? committed);
  if (past.length > 60) past.shift();
  future.length = 0;
  committed = takeSnapshot();
  syncHistoryButtons();
}

function restoreSnapshot(text) {
  const data = JSON.parse(text);
  Object.assign(spec, data);
  spec.panels = data.panels.map((p) => ({ ...p }));
  committed = text;
  refreshControls();
  syncHistoryButtons();
}

function syncHistoryButtons() {
  document.getElementById('undo').disabled = past.length === 0;
  document.getElementById('redo').disabled = future.length === 0;
}

// ----------------------------------------------------------------- render

function render() {
  const { w, h } = SIZES[spec.size];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ensurePanels();
  paintedRects = renderCover(canvas, spec, photos.map((p) => p.img));
  // Editor-only affordance: dash-outline the selected panel. Cover
  // shots (body.shot-cover) and exports never see this.
  if (!document.body.classList.contains('shot-cover') && paintedRects[selectedPanel]) {
    const ctx = canvas.getContext('2d');
    const r = paintedRects[selectedPanel];
    ctx.save();
    ctx.strokeStyle = '#8ef6ff';
    ctx.lineWidth = Math.max(3, w * 0.0035);
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    ctx.restore();
  }
}

/** Writes the spec back into every control, then re-renders. */
function refreshControls() {
  document.getElementById('title').value = spec.title;
  document.getElementById('subtitle').value = spec.subtitle;
  document.getElementById('opt-stars').checked = spec.stars;
  document.getElementById('opt-badge').checked = spec.badge;
  document.getElementById('opt-grain').checked = spec.grain;
  document.getElementById('opt-vignette').checked = spec.vignette;
  for (const b of document.querySelectorAll('#sizes button')) {
    b.classList.toggle('on', b.dataset.size === spec.size);
  }
  for (const b of document.querySelectorAll('#layouts .swatch')) {
    b.classList.toggle('on', b.dataset.layout === spec.layout);
  }
  for (const b of document.querySelectorAll('#grades .swatch')) {
    b.classList.toggle('on', b.dataset.grade === spec.grade);
  }
  if (selectedPanel >= slotCount(spec.layout)) selectedPanel = 0;
  syncPanelBar();
  render();
}

// ----------------------------------------------------------------- photos

function renderThumbs() {
  const box = document.getElementById('thumbs');
  box.textContent = '';
  photos.forEach((photo, i) => {
    const fig = document.createElement('figure');
    if (i === brushPhoto) fig.className = 'brush';
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    const cap = document.createElement('figcaption');
    cap.textContent = photo.name;
    fig.append(img, cap);
    fig.title = `Send "${photo.name}" to panel ${selectedPanel + 1}`;
    fig.addEventListener('click', () => {
      brushPhoto = i;
      ensurePanels();
      if (spec.panels[selectedPanel].photo !== i) {
        spec.panels[selectedPanel].photo = i;
        commitHistory();
      }
      renderThumbs();
      syncPanelBar();
      render();
    });
    box.append(fig);
  });
}

function addPhoto(img, name) {
  photos.push({ img, name });
  brushPhoto = photos.length - 1;
  ensurePanels();
  renderThumbs();
  syncPanelBar();
  render();
  return photos.length - 1;
}

const sampleCache = new Map();
async function loadSample(name) {
  if (sampleCache.has(name)) return sampleCache.get(name);
  const img = await loadImage(`samples/${name}.jpg`);
  const index = addPhoto(img, name === 'pier' ? 'Pier (sample)' : 'Boulevard (sample)');
  sampleCache.set(name, index);
  return index;
}

async function addFiles(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      addPhoto(img, file.name.replace(/\.[^.]+$/, ''));
    } catch {
      statusLine.textContent = `Could not read ${file.name}`;
    }
  }
  if (photos.length) {
    statusLine.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'} loaded`;
  }
}

// --------------------------------------------------------------- panel bar

function syncPanelBar() {
  ensurePanels();
  const panel = spec.panels[selectedPanel];
  document.getElementById('panel-name').textContent = `Panel ${selectedPanel + 1}`;
  const select = document.getElementById('panel-photo');
  select.textContent = '';
  photos.forEach((photo, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = photo.name;
    select.append(opt);
  });
  if (panel) {
    select.value = String(panel.photo);
    document.getElementById('panel-zoom').value = String(panel.zoom);
  }
}

// ------------------------------------------------------------------ export

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportSize(sizeKey) {
  const { w, h } = SIZES[sizeKey];
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  renderCover(offscreen, spec, photos.map((p) => p.img));
  return new Promise((resolve) => {
    offscreen.toBlob((blob) => {
      saveBlob(blob, `vice-frame-${sizeKey}.png`);
      resolve();
    }, 'image/png');
  });
}

// -------------------------------------------------------------------- init

function buildSwatches() {
  const layoutBox = document.getElementById('layouts');
  for (const layout of LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.layout = layout.id;
    const bars = document.createElement('span');
    bars.className = 'bars';
    const n = Math.min(slotCount(layout.id), 6);
    for (let i = 0; i < n; i++) bars.append(document.createElement('i'));
    b.append(bars, document.createTextNode(layout.label));
    b.addEventListener('click', () => {
      if (spec.layout === layout.id) return;
      spec.layout = layout.id;
      if (selectedPanel >= slotCount(layout.id)) selectedPanel = 0;
      ensurePanels();
      commitHistory();
      refreshControls();
    });
    layoutBox.append(b);
  }
  const gradeBox = document.getElementById('grades');
  for (const id of GRADE_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.grade = id;
    b.textContent = GRADES[id].label;
    b.addEventListener('click', () => {
      if (spec.grade === id) return;
      spec.grade = id;
      commitHistory();
      refreshControls();
    });
    gradeBox.append(b);
  }
}

function wireControls() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    addFiles([...fileInput.files]);
    fileInput.value = '';
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
    addFiles([...e.dataTransfer.files]);
  });
  for (const btn of document.querySelectorAll('[data-sample]')) {
    btn.addEventListener('click', () => loadSample(btn.dataset.sample));
  }

  const titleInput = document.getElementById('title');
  const subtitleInput = document.getElementById('subtitle');
  titleInput.addEventListener('input', () => { spec.title = titleInput.value; render(); });
  subtitleInput.addEventListener('input', () => { spec.subtitle = subtitleInput.value; render(); });
  titleInput.addEventListener('change', () => commitHistory());
  subtitleInput.addEventListener('change', () => commitHistory());

  const toggleMap = [
    ['opt-stars', 'stars'], ['opt-badge', 'badge'],
    ['opt-grain', 'grain'], ['opt-vignette', 'vignette'],
  ];
  for (const [id, key] of toggleMap) {
    document.getElementById(id).addEventListener('change', (e) => {
      spec[key] = e.target.checked;
      commitHistory();
      render();
    });
  }

  for (const b of document.querySelectorAll('#sizes button')) {
    b.addEventListener('click', () => {
      if (spec.size === b.dataset.size) return;
      spec.size = b.dataset.size;
      commitHistory();
      refreshControls();
    });
  }

  document.getElementById('panel-photo').addEventListener('change', (e) => {
    ensurePanels();
    spec.panels[selectedPanel].photo = Number(e.target.value);
    brushPhoto = Number(e.target.value);
    commitHistory();
    renderThumbs();
    render();
  });
  const zoomSlider = document.getElementById('panel-zoom');
  zoomSlider.addEventListener('input', () => {
    ensurePanels();
    spec.panels[selectedPanel].zoom = Number(zoomSlider.value);
    render();
  });
  zoomSlider.addEventListener('change', () => commitHistory());
  document.getElementById('panel-center').addEventListener('click', () => {
    ensurePanels();
    const panel = spec.panels[selectedPanel];
    panel.fx = 0.5;
    panel.fy = 0.45;
    panel.zoom = 1.22;
    commitHistory();
    syncPanelBar();
    render();
  });

  document.getElementById('shuffle').addEventListener('click', () => {
    ensurePanels();
    spec.panels.forEach((panel, i) => {
      const fresh = freshPanel(panel.photo, (i * 3 + Math.floor(Math.random() * 5)) % 9);
      panel.fx = fresh.fx;
      panel.fy = fresh.fy;
      panel.zoom = 1.15 + Math.random() * 0.35;
    });
    commitHistory();
    syncPanelBar();
    render();
  });

  document.getElementById('export').addEventListener('click', async () => {
    await exportSize(spec.size);
    statusLine.textContent = `Saved vice-frame-${spec.size}.png`;
  });
  document.getElementById('export-all').addEventListener('click', async () => {
    for (const key of Object.keys(SIZES)) await exportSize(key);
    statusLine.textContent = 'Saved all three sizes';
  });

  document.getElementById('undo').addEventListener('click', () => {
    if (!past.length) return;
    future.push(committed);
    restoreSnapshot(past.pop());
  });
  document.getElementById('redo').addEventListener('click', () => {
    if (!future.length) return;
    past.push(committed);
    restoreSnapshot(future.pop());
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      document.getElementById(e.shiftKey ? 'redo' : 'undo').click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      document.getElementById('redo').click();
    }
  });

  // Pointer work on the canvas: click selects a panel, drag pans its
  // photo, wheel zooms it. Drags and wheel bursts commit one history
  // entry each, taken from the snapshot before the gesture started.
  let drag = null;
  const toCanvasPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };
  const panelAt = (point) => {
    for (let i = paintedRects.length - 1; i >= 0; i--) {
      const r = paintedRects[i];
      if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
    }
    return -1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const hit = panelAt(toCanvasPoint(e));
    if (hit === -1) return;
    if (hit !== selectedPanel) {
      selectedPanel = hit;
      syncPanelBar();
      render();
    }
    const point = toCanvasPoint(e);
    const panel = spec.panels[selectedPanel];
    drag = { x: point.x, y: point.y, fx: panel.fx, fy: panel.fy, before: committed, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const point = toCanvasPoint(e);
    const rect = paintedRects[selectedPanel];
    const img = photos[spec.panels[selectedPanel].photo]?.img;
    if (!rect || !img) return;
    const panel = spec.panels[selectedPanel];
    const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * panel.zoom;
    panel.fx = Math.min(1, Math.max(0, drag.fx - (point.x - drag.x) / (img.naturalWidth * scale)));
    panel.fy = Math.min(1, Math.max(0, drag.fy - (point.y - drag.y) / (img.naturalHeight * scale)));
    drag.moved = true;
    render();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag?.moved) commitHistory(drag.before);
    drag = null;
  });
  let wheelTimer = null;
  let wheelBefore = null;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const hit = panelAt(toCanvasPoint(e));
    if (hit === -1) return;
    if (hit !== selectedPanel) {
      selectedPanel = hit;
      syncPanelBar();
    }
    if (!wheelTimer) wheelBefore = committed;
    const panel = spec.panels[selectedPanel];
    panel.zoom = Math.min(3, Math.max(1, panel.zoom * (e.deltaY < 0 ? 1.07 : 0.93)));
    syncPanelBar();
    render();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      commitHistory(wheelBefore);
      wheelTimer = null;
    }, 400);
  }, { passive: false });
}

// --------------------------------------------------------------------- run

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
buildSwatches();
wireControls();
committed = takeSnapshot();
syncHistoryButtons();

if (shot) {
  runShot(shot, query, {
    spec,
    loadSample,
    distribute,
    finish() {
      if (selectedPanel >= slotCount(spec.layout)) selectedPanel = 0;
      refreshControls();
    },
  });
} else {
  refreshControls();
  loadSample('pier');
}
