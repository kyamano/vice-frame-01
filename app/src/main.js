// Vice Frame editor: wires the page to the rendering engine in ./cover.js.
//
// The editor keeps one state object — layout, grade, lettering and a slot per panel
// (which photo fills it, its pan offsets and zoom) — and repaints the preview canvas
// on every change. Photos are read from the person's own machine and never leave it.
// A `?shot=` query hands control to ./shots.js, which builds one fixed scene instead.
import { LAYOUTS, GRADES, panelRects, coverTransform, drawCover, renderCoverPNG } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const strip = document.getElementById('photo-strip');

const PRESET_X = [0, -0.2, 0.25, 0.1, -0.1, 0.2, -0.25, 0.15, 0];
const PRESET_Y = [0, 0.1, -0.15, 0.2, -0.05, 0.1, 0.15, -0.2, 0.05];
const PRESET_Z = [1.05, 1.3, 1.45, 1.25, 1.55, 1.35, 1.6, 1.4, 1.2];

const state = {
  layout: 'hero',
  grade: 'sunset',
  title: 'Vice Frame',
  subtitle: 'Sunset Heist',
  stars: 5,
  badge: '100% Vice',
  photos: [],
  slots: [],
};
let selected = 0;
const shotMode = new URLSearchParams(location.search).has('shot');

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function panelCount() {
  return panelRects(state.layout, canvas.width, canvas.height).length;
}

/** Grows the slot list to the layout's panel count, giving new slots a composed preset. */
function ensureSlots() {
  const count = panelCount();
  while (state.slots.length < count) {
    const i = state.slots.length;
    state.slots.push({
      photo: state.photos.length ? i % state.photos.length : -1,
      x: PRESET_X[i % PRESET_X.length],
      y: PRESET_Y[i % PRESET_Y.length],
      zoom: PRESET_Z[i % PRESET_Z.length],
    });
  }
  if (selected >= count) selected = 0;
}

function redraw() {
  ensureSlots();
  drawCover(canvas, state);
  if (!shotMode) drawSelection();
}

/** Outlines the selected panel on the preview (never on an export or a shot). */
function drawSelection() {
  const rect = panelRects(state.layout, canvas.width, canvas.height)[selected];
  if (!rect) return;
  const ctx = canvas.getContext('2d');
  ctx.save();
  if (rect.tilt) {
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate(rect.tilt);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 9]);
    ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 7;
    ctx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([14, 9]);
    ctx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
  }
  ctx.restore();
}

// --- photos ---------------------------------------------------------------

async function loadSamples(order) {
  for (const name of order) {
    const img = await loadImage(`samples/${name}.jpg`);
    state.photos.push({ img, name, url: `samples/${name}.jpg` });
  }
  renderStrip();
}

async function addPhotoFiles(files) {
  const added = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      state.photos.push({ img, name: file.name, url });
      added.push(state.photos.length - 1);
    } catch { /* an unreadable file is skipped, the rest still load */ }
  }
  if (added.length) {
    ensureSlots();
    state.slots[selected].photo = added[0];
    status.textContent = `${added.length} photo${added.length > 1 ? 's' : ''} added — drag inside a panel to position it.`;
  }
  renderStrip();
  redraw();
}

function renderStrip() {
  strip.replaceChildren();
  state.photos.forEach((photo, i) => {
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.name;
    img.title = `${photo.name} — click to put it in the selected panel`;
    if (state.slots.some((s) => s.photo === i)) img.classList.add('used');
    if (state.slots[selected]?.photo === i) img.classList.add('in-selected');
    img.addEventListener('click', () => {
      state.slots[selected].photo = i;
      renderStrip();
      redraw();
    });
    strip.appendChild(img);
  });
}

// --- controls ---------------------------------------------------------------

function buildSegButtons(containerId, items, get, set) {
  const box = document.getElementById(containerId);
  box.replaceChildren();
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.name;
    b.dataset.id = item.id;
    if (get() === item.id) b.classList.add('active');
    b.addEventListener('click', () => {
      set(item.id);
      box.querySelectorAll('button').forEach((el) => el.classList.toggle('active', el.dataset.id === item.id));
      redraw();
    });
    box.appendChild(b);
  }
}

function syncPanelControls() {
  const slot = state.slots[selected];
  if (!slot) return;
  document.getElementById('panel-label').textContent = `Panel ${selected + 1} of ${panelCount()}`;
  document.getElementById('zoom').value = slot.zoom;
  document.getElementById('pos-x').value = slot.x;
  document.getElementById('pos-y').value = slot.y;
}

function syncLetteringControls() {
  document.getElementById('title').value = state.title;
  document.getElementById('subtitle').value = state.subtitle;
  document.getElementById('stars').value = state.stars;
  document.getElementById('badge').value = state.badge;
}

function bindControls() {
  buildSegButtons('layout-grid', LAYOUTS, () => state.layout, (id) => { state.layout = id; ensureSlots(); syncPanelControls(); });
  buildSegButtons('grade-row', GRADES, () => state.grade, (id) => { state.grade = id; });
  document.getElementById('photo-files').addEventListener('change', (e) => {
    addPhotoFiles([...e.target.files]);
    e.target.value = '';
  });
  for (const [id, key] of [['title', 'title'], ['subtitle', 'subtitle'], ['badge', 'badge']]) {
    document.getElementById(id).addEventListener('input', (e) => { state[key] = e.target.value; redraw(); });
  }
  document.getElementById('stars').addEventListener('input', (e) => { state.stars = Number(e.target.value); redraw(); });
  document.getElementById('zoom').addEventListener('input', (e) => { state.slots[selected].zoom = Number(e.target.value); redraw(); });
  document.getElementById('pos-x').addEventListener('input', (e) => { state.slots[selected].x = Number(e.target.value); redraw(); });
  document.getElementById('pos-y').addEventListener('input', (e) => { state.slots[selected].y = Number(e.target.value); redraw(); });
  document.getElementById('reset-panel').addEventListener('click', () => {
    const i = selected;
    state.slots[selected] = {
      photo: state.slots[selected].photo,
      x: PRESET_X[i % PRESET_X.length], y: PRESET_Y[i % PRESET_Y.length], zoom: PRESET_Z[i % PRESET_Z.length],
    };
    syncPanelControls();
    redraw();
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.addEventListener('click', () => {
      const [w, h] = b.dataset.size.split('x').map(Number);
      canvas.width = w;
      canvas.height = h;
      document.querySelectorAll('[data-size]').forEach((el) => el.classList.toggle('active', el === b));
      redraw();
    });
  });
  document.querySelectorAll('[data-export]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [w, h] = b.dataset.export.split('x').map(Number);
      status.textContent = `Rendering ${w} × ${h}…`;
      const blob = await renderCoverPNG(state, w, h);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-frame-${w}x${h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      status.textContent = `Saved vice-frame-${w}x${h}.png`;
    });
  });
}

// --- canvas interaction -----------------------------------------------------

function canvasPoint(e) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - box.left) * (canvas.width / box.width),
    y: (e.clientY - box.top) * (canvas.height / box.height),
  };
}

function panelAt(point) {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
  }
  return -1;
}

function bindCanvas() {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const point = canvasPoint(e);
    const i = panelAt(point);
    if (i < 0) return;
    selected = i;
    drag = { lastX: point.x, lastY: point.y };
    canvas.setPointerCapture(e.pointerId);
    syncPanelControls();
    renderStrip();
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const point = canvasPoint(e);
    const slot = state.slots[selected];
    const rect = panelRects(state.layout, canvas.width, canvas.height)[selected];
    const photo = slot.photo >= 0 ? state.photos[slot.photo] : null;
    if (photo && rect) {
      const t = coverTransform(photo.img, rect, slot);
      const rangeX = t.dw - rect.w;
      const rangeY = t.dh - rect.h;
      if (rangeX > 1) slot.x = Math.max(-1, Math.min(1, slot.x + (point.x - drag.lastX) * 2 / rangeX));
      if (rangeY > 1) slot.y = Math.max(-1, Math.min(1, slot.y + (point.y - drag.lastY) * 2 / rangeY));
      syncPanelControls();
    }
    drag.lastX = point.x;
    drag.lastY = point.y;
    redraw();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    const i = panelAt(canvasPoint(e));
    if (i < 0) return;
    e.preventDefault();
    selected = i;
    const slot = state.slots[selected];
    slot.zoom = Math.max(1, Math.min(3.5, slot.zoom * Math.exp(-e.deltaY * 0.0012)));
    syncPanelControls();
    redraw();
  }, { passive: false });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addPhotoFiles([...e.dataTransfer.files]);
  });
}

// --- shot scenes --------------------------------------------------------------

async function setupShot(query) {
  const lead = query.get('photo') ?? 'pier';
  await loadSamples(lead === 'boulevard' ? ['boulevard', 'pier'] : ['pier', 'boulevard']);
  if (query.get('layout')) state.layout = query.get('layout');
  if (query.get('grade')) state.grade = query.get('grade');
  if (query.get('title')) state.title = query.get('title');
  if (query.get('subtitle')) state.subtitle = query.get('subtitle');
  if (query.get('badge')) state.badge = query.get('badge');
  if (query.get('stars')) state.stars = Number(query.get('stars'));
  const size = query.get('size');
  if (size) {
    const [w, h] = size.split('x').map(Number);
    if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; }
  }
  state.slots = [];
  ensureSlots();
  state.slots.forEach((slot, i) => { slot.photo = state.photos.length ? i % state.photos.length : -1; });
  syncLetteringControls();
  syncPanelControls();
  redraw();
}

// --- start --------------------------------------------------------------------

bindControls();
bindCanvas();
redraw();

if (shotMode) {
  runShot(new URLSearchParams(location.search), { setup: setupShot });
} else {
  loadSamples(['pier', 'boulevard']).then(() => {
    ensureSlots();
    state.slots.forEach((slot, i) => { if (slot.photo < 0) slot.photo = i % state.photos.length; });
    renderStrip();
    syncPanelControls();
    redraw();
  });
}

// A handle for the maker's own checks: render any export size and read the PNG back.
window.__viceFrame = {
  state,
  exportPNG: (w, h) => renderCoverPNG(state, w, h),
};
