// Vice Frame editor: wires the page to the render engine in ./cover.js.
// Photos live here as loaded Image objects; everything about the cover
// itself is the plain-data `spec`, which is also what undo/redo snapshots.
import { SIZES, GRADES, LAYOUTS, slotCount, defaultPanel, renderCover } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');

const photos = []; // { img, name }
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
let selected = 0;
let brush = 0;
let lastRects = [];

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ------------------------------------------------------------------ panels

/** Makes sure every layout slot has a panel, pointing at a real photo. */
function ensurePanels() {
  const count = slotCount(spec.layout);
  for (let i = 0; i < count; i++) {
    if (!spec.panels[i]) {
      spec.panels[i] = defaultPanel(photos.length ? i % photos.length : 0, i);
    }
    if (spec.panels[i].photo >= photos.length) spec.panels[i].photo = 0;
  }
}

/** Re-deals photos and focal points across the panels, round-robin. */
function distribute() {
  const count = slotCount(spec.layout);
  spec.panels = [];
  for (let i = 0; i < count; i++) {
    spec.panels.push(defaultPanel(photos.length ? i % photos.length : 0, i));
  }
}

// ------------------------------------------------------------------ history

const undoStack = [];
const redoStack = [];
let lastCommitted = '';

function snapshot() {
  return JSON.stringify({ ...spec, panels: spec.panels.map((p) => ({ ...p })) });
}

function pushHistory(fromSnapshot) {
  undoStack.push(fromSnapshot ?? lastCommitted);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  lastCommitted = snapshot();
  syncHistoryButtons();
}

function applySnapshot(text) {
  const data = JSON.parse(text);
  Object.assign(spec, data);
  spec.panels = data.panels.map((p) => ({ ...p }));
  lastCommitted = text;
  refreshAll();
  syncHistoryButtons();
}

function syncHistoryButtons() {
  document.getElementById('undo').disabled = undoStack.length === 0;
  document.getElementById('redo').disabled = redoStack.length === 0;
}

// ------------------------------------------------------------------ render

function render() {
  const { w, h } = SIZES[spec.size];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ensurePanels();
  lastRects = renderCover(canvas, spec, photos.map((p) => p.img));
  if (!document.body.classList.contains('shot-cover') && lastRects[selected]) {
    const ctx = canvas.getContext('2d');
    const r = lastRects[selected];
    ctx.save();
    ctx.strokeStyle = '#8ef6ff';
    ctx.lineWidth = Math.max(3, w * 0.0035);
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    ctx.restore();
  }
}

/** Pushes the whole spec back into every control (undo, shots, init). */
function refreshAll() {
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
  if (selected >= slotCount(spec.layout)) selected = 0;
  syncPanelBar();
  render();
}

// ------------------------------------------------------------------ photos

function renderThumbs() {
  const box = document.getElementById('thumbs');
  box.textContent = '';
  photos.forEach((photo, i) => {
    const fig = document.createElement('figure');
    if (i === brush) fig.className = 'brush';
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    const cap = document.createElement('figcaption');
    cap.textContent = photo.name;
    fig.append(img, cap);
    fig.title = `Send “${photo.name}” to panel ${selected + 1}`;
    fig.addEventListener('click', () => {
      brush = i;
      ensurePanels();
      if (spec.panels[selected].photo !== i) {
        spec.panels[selected].photo = i;
        pushHistory();
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
  brush = photos.length - 1;
  ensurePanels();
  renderThumbs();
  syncPanelBar();
  render();
  return photos.length - 1;
}

const loadedSamples = new Map();
async function loadSample(name) {
  if (loadedSamples.has(name)) return loadedSamples.get(name);
  const img = await loadImage(`samples/${name}.jpg`);
  const index = addPhoto(img, name === 'pier' ? 'Pier (sample)' : 'Boulevard (sample)');
  loadedSamples.set(name, index);
  return index;
}

async function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      addPhoto(img, file.name.replace(/\.[^.]+$/, ''));
    } catch {
      status.textContent = `Could not read ${file.name}`;
    }
  }
  if (photos.length) status.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'} loaded`;
}

// --------------------------------------------------------------- panel bar

function syncPanelBar() {
  ensurePanels();
  const panel = spec.panels[selected];
  document.getElementById('panel-name').textContent = `Panel ${selected + 1}`;
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

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportSize(sizeKey) {
  const { w, h } = SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off, spec, photos.map((p) => p.img));
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      download(blob, `vice-frame-${sizeKey}.png`);
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
    b.append(bars, document.createTextNode(layout.name));
    b.addEventListener('click', () => {
      if (spec.layout === layout.id) return;
      spec.layout = layout.id;
      if (selected >= slotCount(layout.id)) selected = 0;
      ensurePanels();
      pushHistory();
      refreshAll();
    });
    layoutBox.append(b);
  }
  const gradeBox = document.getElementById('grades');
  for (const [id, grade] of Object.entries(GRADES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.grade = id;
    b.textContent = grade.name;
    b.addEventListener('click', () => {
      if (spec.grade === id) return;
      spec.grade = id;
      pushHistory();
      refreshAll();
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
  titleInput.addEventListener('change', () => pushHistory());
  subtitleInput.addEventListener('change', () => pushHistory());

  const toggles = [
    ['opt-stars', 'stars'], ['opt-badge', 'badge'],
    ['opt-grain', 'grain'], ['opt-vignette', 'vignette'],
  ];
  for (const [id, key] of toggles) {
    document.getElementById(id).addEventListener('change', (e) => {
      spec[key] = e.target.checked;
      pushHistory();
      render();
    });
  }

  for (const b of document.querySelectorAll('#sizes button')) {
    b.addEventListener('click', () => {
      if (spec.size === b.dataset.size) return;
      spec.size = b.dataset.size;
      pushHistory();
      refreshAll();
    });
  }

  document.getElementById('panel-photo').addEventListener('change', (e) => {
    ensurePanels();
    spec.panels[selected].photo = Number(e.target.value);
    brush = Number(e.target.value);
    pushHistory();
    renderThumbs();
    render();
  });
  const zoom = document.getElementById('panel-zoom');
  zoom.addEventListener('input', () => {
    ensurePanels();
    spec.panels[selected].zoom = Number(zoom.value);
    render();
  });
  zoom.addEventListener('change', () => pushHistory());
  document.getElementById('panel-center').addEventListener('click', () => {
    ensurePanels();
    const panel = spec.panels[selected];
    panel.fx = 0.5;
    panel.fy = 0.45;
    panel.zoom = 1.22;
    pushHistory();
    syncPanelBar();
    render();
  });

  document.getElementById('shuffle').addEventListener('click', () => {
    ensurePanels();
    spec.panels.forEach((panel, i) => {
      const fresh = defaultPanel(panel.photo, (i * 3 + Math.floor(Math.random() * 5)) % 9);
      panel.fx = fresh.fx;
      panel.fy = fresh.fy;
      panel.zoom = 1.15 + Math.random() * 0.35;
    });
    pushHistory();
    syncPanelBar();
    render();
  });

  document.getElementById('export').addEventListener('click', async () => {
    await exportSize(spec.size);
    status.textContent = `Saved vice-frame-${spec.size}.png`;
  });
  document.getElementById('export-all').addEventListener('click', async () => {
    for (const key of Object.keys(SIZES)) await exportSize(key);
    status.textContent = 'Saved all three sizes';
  });

  document.getElementById('undo').addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(lastCommitted);
    applySnapshot(undoStack.pop());
  });
  document.getElementById('redo').addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(lastCommitted);
    applySnapshot(redoStack.pop());
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

  // Drag to pan the selected panel's photo; scroll to zoom it.
  let drag = null;
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };
  const hitPanel = (pos) => {
    for (let i = lastRects.length - 1; i >= 0; i--) {
      const r = lastRects[i];
      if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) return i;
    }
    return -1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const pos = toCanvas(e);
    const hit = hitPanel(pos);
    if (hit === -1) return;
    if (hit !== selected) {
      selected = hit;
      syncPanelBar();
      render();
    }
    const panel = spec.panels[selected];
    drag = {
      x: pos.x, y: pos.y, fx: panel.fx, fy: panel.fy,
      before: lastCommitted, moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pos = toCanvas(e);
    const rect = lastRects[selected];
    const img = photos[spec.panels[selected].photo]?.img;
    if (!rect || !img) return;
    const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * spec.panels[selected].zoom;
    const panel = spec.panels[selected];
    panel.fx = Math.min(1, Math.max(0, drag.fx - (pos.x - drag.x) / (img.naturalWidth * scale)));
    panel.fy = Math.min(1, Math.max(0, drag.fy - (pos.y - drag.y) / (img.naturalHeight * scale)));
    drag.moved = true;
    render();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag?.moved) pushHistory(drag.before);
    drag = null;
  });
  let wheelTimer = null;
  let wheelBefore = null;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const hit = hitPanel(toCanvas(e));
    if (hit === -1) return;
    if (hit !== selected) {
      selected = hit;
      syncPanelBar();
    }
    if (!wheelTimer) wheelBefore = lastCommitted;
    const panel = spec.panels[selected];
    panel.zoom = Math.min(3, Math.max(1, panel.zoom * (e.deltaY < 0 ? 1.07 : 0.93)));
    syncPanelBar();
    render();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      pushHistory(wheelBefore);
      wheelTimer = null;
    }, 400);
  }, { passive: false });
}

// --------------------------------------------------------------------- run

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
buildSwatches();
wireControls();
lastCommitted = snapshot();
syncHistoryButtons();

if (shot) {
  runShot(shot, query, {
    spec,
    loadSample,
    distribute,
    finish() {
      if (selected >= slotCount(spec.layout)) selected = 0;
      refreshAll();
    },
  });
} else {
  refreshAll();
  loadSample('pier');
}
