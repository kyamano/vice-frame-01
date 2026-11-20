// Vice Frame rendering engine: draws a complete GTA-style poster cover onto a canvas.
//
// A cover is a grid of photo panels split by white keylines, each panel colour-graded
// per-pixel, finished with a halftone band, a vignette, poster lettering (stars, a big
// gradient title, a letterspaced subtitle) and a round badge. The same drawCover() call
// paints the editor preview and every exported PNG, so what you see is what you share.

export const LAYOUTS = [
  { id: 'hero', name: 'Hero & Three' },
  { id: 'quad', name: 'Quad Grid' },
  { id: 'mosaic', name: 'Mosaic Six' },
  { id: 'nine', name: 'Nine Panel' },
  { id: 'tilted', name: 'Tilted Snapshots' },
  { id: 'full', name: 'Full Bleed' },
];

export const GRADES = [
  { id: 'sunset', name: 'Vice Sunset' },
  { id: 'neon', name: 'Neon Nights' },
  { id: 'golden', name: 'Golden Hour' },
  { id: 'noir', name: 'Noir' },
  { id: 'clean', name: 'Clean' },
];

const TITLE_FONT = '"Noto Sans Display", "Arial Narrow", "Liberation Sans Narrow", Impact, "Franklin Gothic Medium", sans-serif';

/** Panel rectangles for a layout, as fractions of the canvas size turned into pixels. */
export function panelRects(layoutId, w, h) {
  const f = {
    hero: [
      [0, 0, 0.615, 1], [0.615, 0, 0.385, 0.333], [0.615, 0.333, 0.385, 0.334], [0.615, 0.667, 0.385, 0.333],
    ],
    quad: [
      [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5],
    ],
    mosaic: [
      [0, 0, 0.5, 0.55], [0.5, 0, 0.5, 0.3], [0.5, 0.3, 0.25, 0.25],
      [0.75, 0.3, 0.25, 0.25], [0, 0.55, 0.34, 0.45], [0.34, 0.55, 0.66, 0.45],
    ],
    nine: [],
    tilted: [
      [0, 0, 1, 1],
      [0.07, 0.1, 0.42, 0.42, -0.12],
      [0.55, 0.06, 0.38, 0.38, 0.09],
      [0.3, 0.58, 0.44, 0.32, -0.05],
    ],
    full: [[0, 0, 1, 1]],
  };
  if (layoutId === 'nine') {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) f.nine.push([col / 3, row / 3, 1 / 3, 1 / 3]);
    }
  }
  const list = f[layoutId] ?? f.hero;
  return list.map(([fx, fy, fw, fh, tilt]) => ({
    x: Math.round(fx * w), y: Math.round(fy * h),
    w: Math.round(fw * w), h: Math.round(fh * h),
    tilt: tilt ?? 0,
  }));
}

/** Where a photo lands inside a panel: cover-fit, scaled by the slot zoom, shifted by the slot offsets (-1..1). */
export function coverTransform(img, rect, slot) {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * (slot?.zoom ?? 1);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  return {
    dw, dh,
    dx: rect.x + (rect.w - dw) / 2 + (slot?.x ?? 0) * (dw - rect.w) / 2,
    dy: rect.y + (rect.h - dh) / 2 + (slot?.y ?? 0) * (dh - rect.h) / 2,
  };
}

// Per-grade pixel recipes: saturation, contrast, a warm/cool multiply, then split toning
// that pushes shadows and highlights toward two colours.
const GRADE_RECIPES = {
  clean: { sat: 1.06, con: 1.05, mul: [1.0, 1.0, 1.0], shadow: [0, 0, 0, 0], high: [0, 0, 0, 0] },
  sunset: { sat: 1.28, con: 1.08, mul: [1.1, 0.96, 0.82], shadow: [58, 20, 92, 0.38], high: [255, 170, 110, 0.16] },
  neon: { sat: 1.65, con: 1.18, mul: [1.02, 0.98, 1.06], shadow: [0, 64, 78, 0.42], high: [255, 70, 190, 0.2] },
  golden: { sat: 1.16, con: 1.06, mul: [1.13, 1.03, 0.74], shadow: [64, 32, 10, 0.25], high: [255, 214, 120, 0.22] },
  noir: { sat: 0.12, con: 1.3, mul: [0.98, 1.0, 1.05], shadow: [10, 10, 16, 0.3], high: [230, 235, 255, 0.1] },
};

function applyGrade(imageData, gradeId) {
  const recipe = GRADE_RECIPES[gradeId] ?? GRADE_RECIPES.clean;
  const { sat, con, mul, shadow, high } = recipe;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    r = (r - 128) * con + 128;
    g = (g - 128) * con + 128;
    b = (b - 128) * con + 128;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;
    r *= mul[0]; g *= mul[1]; b *= mul[2];
    const lum2 = Math.min(255, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b)) / 255;
    const shF = (1 - lum2) * (1 - lum2) * shadow[3];
    const hiF = lum2 * lum2 * high[3];
    d[i] = r + (shadow[0] - r) * shF + (high[0] - r) * hiF;
    d[i + 1] = g + (shadow[1] - g) * shF + (high[1] - g) * hiF;
    d[i + 2] = b + (shadow[2] - b) * shF + (high[2] - b) * hiF;
  }
  return imageData;
}

const panelCanvas = document.createElement('canvas');

/** Renders one panel (photo graded, or a placeholder) into an offscreen canvas of the panel's size. */
function renderPanel(rect, slot, photo, gradeId) {
  panelCanvas.width = Math.max(1, Math.round(rect.w));
  panelCanvas.height = Math.max(1, Math.round(rect.h));
  const g = panelCanvas.getContext('2d', { willReadFrequently: true });
  const pw = panelCanvas.width, ph = panelCanvas.height;
  if (photo) {
    const t = coverTransform(photo, { x: 0, y: 0, w: pw, h: ph }, slot);
    g.drawImage(photo, t.dx, t.dy, t.dw, t.dh);
  } else {
    const grad = g.createLinearGradient(0, 0, pw, ph);
    grad.addColorStop(0, '#3a2358');
    grad.addColorStop(1, '#12081f');
    g.fillStyle = grad;
    g.fillRect(0, 0, pw, ph);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.font = `700 ${Math.max(11, ph * 0.07)}px ${TITLE_FONT}`;
    g.textAlign = 'center';
    g.fillText('ADD A PHOTO', pw / 2, ph / 2);
  }
  if (photo) g.putImageData(applyGrade(g.getImageData(0, 0, pw, ph), gradeId), 0, 0);
  return panelCanvas;
}

/** Draws every panel of the layout, split by white keylines; tilted panels get snapshot frames. */
function drawPanels(ctx, state, w, h) {
  const rects = panelRects(state.layout, w, h);
  const key = Math.max(5, Math.round(w * 0.007));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  rects.forEach((rect, i) => {
    const slot = state.slots[i] ?? { photo: -1, x: 0, y: 0, zoom: 1 };
    const entry = slot.photo >= 0 ? state.photos[slot.photo] : null;
    const panel = renderPanel(rect, slot, entry ? entry.img : null, state.grade);
    if (rect.tilt) {
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const frame = Math.max(8, rect.w * 0.045);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rect.tilt);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = rect.w * 0.06;
      ctx.shadowOffsetY = rect.w * 0.03;
      ctx.fillStyle = '#fdfdf8';
      ctx.fillRect(-rect.w / 2 - frame, -rect.h / 2 - frame, rect.w + frame * 2, rect.h + frame * 3.4);
      ctx.shadowColor = 'transparent';
      ctx.drawImage(panel, -rect.w / 2, -rect.h / 2);
      ctx.restore();
    } else {
      const inset = i === 0 && (state.layout === 'full' || state.layout === 'tilted') ? 0 : key / 2;
      ctx.drawImage(panel, rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);
    }
  });
  return rects;
}

/** A fading halftone dot band across the top, alternating cyan and magenta like cheap poster ink. */
function drawHalftone(ctx, w, h) {
  const bandH = h * 0.17;
  const step = Math.max(11, w * 0.017);
  ctx.save();
  let row = 0;
  for (let y = step * 0.55; y < bandH; y += step, row++) {
    const fade = 1 - y / bandH;
    for (let x = step * 0.55 + (row % 2) * step * 0.5; x < w; x += step) {
      ctx.beginPath();
      ctx.fillStyle = row % 2 ? `rgba(64, 224, 255, ${0.32 * fade})` : `rgba(255, 64, 170, ${0.32 * fade})`;
      ctx.arc(x, y, Math.max(0.5, step * 0.3 * fade), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// A translucent colour wash laid over the graded panels, per grade: a cool tint from
// the top and the grade's signature colour rising from the bottom, poster-ink style.
const GRADE_WASH = {
  sunset: { top: 'rgba(56, 160, 255, 0.10)', bottom: 'rgba(255, 46, 120, 0.20)' },
  neon: { top: 'rgba(0, 229, 255, 0.08)', bottom: 'rgba(255, 0, 128, 0.16)' },
  golden: { top: 'rgba(255, 190, 80, 0.06)', bottom: 'rgba(255, 150, 40, 0.16)' },
};

/** The poster's finishing layers: the grade's colour wash, a bottom scrim for the lettering, a halftone band, a vignette. */
function drawOverlays(ctx, state, w, h) {
  const wash = GRADE_WASH[state.grade];
  if (wash) {
    const washGrad = ctx.createLinearGradient(0, 0, 0, h);
    washGrad.addColorStop(0, wash.top);
    washGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
    washGrad.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    washGrad.addColorStop(1, wash.bottom);
    ctx.fillStyle = washGrad;
    ctx.fillRect(0, 0, w, h);
  }
  const scrim = ctx.createLinearGradient(0, h * 0.5, 0, h);
  scrim.addColorStop(0, 'rgba(10, 2, 24, 0)');
  scrim.addColorStop(0.62, 'rgba(10, 2, 24, 0.34)');
  scrim.addColorStop(1, 'rgba(10, 2, 24, 0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);
  if (state.grade !== 'noir') drawHalftone(ctx, w, h);
  const vig = ctx.createRadialGradient(w / 2, h * 0.44, Math.min(w, h) * 0.42, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  vig.addColorStop(0, 'rgba(5, 0, 12, 0)');
  vig.addColorStop(1, 'rgba(5, 0, 12, 0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/** The largest title size, at or below `startSize`, at which `text` fits `maxW` wide. */
function fitTitleSize(ctx, text, maxW, startSize) {
  let size = startSize;
  setTitleFont(ctx, size);
  while (ctx.measureText(text).width > maxW && size > 14) {
    size -= 3;
    setTitleFont(ctx, size);
  }
  return size;
}

/** One gradient-filled, thick-outlined title line. */
function drawTitleLine(ctx, line, cx, baseline, size) {
  setTitleFont(ctx, size);
  const grad = ctx.createLinearGradient(0, baseline - size, 0, baseline);
  grad.addColorStop(0, '#ffe95e');
  grad.addColorStop(0.45, '#ff9a3d');
  grad.addColorStop(0.78, '#ff4e7a');
  grad.addColorStop(1, '#b967ff');
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.06;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.17;
  ctx.strokeStyle = '#160a24';
  ctx.strokeText(line, cx, baseline);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = grad;
  ctx.fillText(line, cx, baseline);
  ctx.restore();
}

function setTitleFont(ctx, size) {
  try { ctx.fontStretch = 'condensed'; } catch { /* older engines keep the default stretch */ }
  ctx.font = `900 ${size}px ${TITLE_FONT}`;
}

/** Stars, the big gradient title and the letterspaced subtitle, stacked at the foot of the cover. */
function drawLettering(ctx, state, w, h) {
  const cx = w / 2;
  const title = (state.title ?? '').trim().toUpperCase();
  const subtitle = (state.subtitle ?? '').trim().toUpperCase();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (subtitle) {
    const size = h * 0.03;
    try { ctx.letterSpacing = `${size * 0.55}px`; } catch { /* letterSpacing is a progressive enhancement */ }
    ctx.font = `700 ${size}px ${TITLE_FONT}`;
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = 'rgba(10, 2, 20, 0.85)';
    ctx.strokeText(subtitle, cx, h * 0.972);
    ctx.fillStyle = '#a5ecff';
    ctx.fillText(subtitle, cx, h * 0.972);
    try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
  }

  if (title) {
    const startSize = h * 0.148;
    let size = fitTitleSize(ctx, title, w * 0.94, startSize);
    let lines = [title];
    // A long title shrunk to fit one line turns spindly; stack it in two lines instead,
    // split at the word boundary that lets both lines stay largest.
    if (size < startSize * 0.62 && title.includes(' ')) {
      const words = title.split(/\s+/);
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
        const pairSize = Math.min(
          fitTitleSize(ctx, pair[0], w * 0.94, startSize),
          fitTitleSize(ctx, pair[1], w * 0.94, startSize),
        );
        if (!best || pairSize > best.size) best = { size: pairSize, lines: pair };
      }
      if (best && best.size > size) {
        size = best.size;
        lines = best.lines;
      }
    }
    const baseline = h * 0.918;
    const lineHeight = size * 1.04;
    lines.forEach((line, i) => {
      drawTitleLine(ctx, line, cx, baseline - (lines.length - 1 - i) * lineHeight, size);
    });
    const blockTop = baseline - (lines.length - 1) * lineHeight - size;

    const stars = Math.max(0, Math.min(5, state.stars ?? 0));
    if (stars > 0) {
      const starSize = h * 0.034;
      ctx.font = `${starSize}px sans-serif`;
      ctx.fillStyle = '#ffd94d';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = starSize * 0.25;
      const total = stars * starSize * 1.28;
      for (let i = 0; i < stars; i++) {
        ctx.fillText('★', cx - total / 2 + starSize * 0.64 + i * starSize * 1.28, blockTop - size * 0.14);
      }
      ctx.shadowBlur = 0;
    }
  }
}

/** A round gold-ringed badge in the top-right corner, its text split over two lines. */
function drawBadge(ctx, state, w, h) {
  const text = (state.badge ?? '').trim().toUpperCase();
  if (!text) return;
  const radius = Math.min(w, h) * 0.078;
  const cx = w - radius - w * 0.035;
  const cy = radius + h * 0.035;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = radius * 0.25;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#1b0b2e';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = radius * 0.13;
  ctx.strokeStyle = '#ffd94d';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
  ctx.lineWidth = radius * 0.045;
  ctx.strokeStyle = 'rgba(255, 217, 77, 0.6)';
  ctx.stroke();
  const words = text.split(/\s+/);
  const lines = words.length > 1 ? [words[0], words.slice(1).join(' ')] : [text];
  ctx.fillStyle = '#ffd94d';
  ctx.textAlign = 'center';
  ctx.font = `${radius * 0.34}px sans-serif`;
  ctx.fillText('★', 0, -radius * 0.38);
  lines.forEach((line, i) => {
    let size = radius * 0.4;
    ctx.font = `900 ${size}px ${TITLE_FONT}`;
    while (ctx.measureText(line).width > radius * 1.5 && size > 6) {
      size -= 1;
      ctx.font = `900 ${size}px ${TITLE_FONT}`;
    }
    ctx.fillText(line, 0, radius * 0.16 + i * radius * 0.42);
  });
  ctx.restore();
}

/** Paints the whole cover described by `state` onto `canvas` at the canvas's own size. */
export function drawCover(canvas, state) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0616';
  ctx.fillRect(0, 0, w, h);
  drawPanels(ctx, state, w, h);
  drawOverlays(ctx, state, w, h);
  drawLettering(ctx, state, w, h);
  drawBadge(ctx, state, w, h);
  return canvas;
}

/** Renders the cover at an exact export size on an offscreen canvas and returns it as a PNG blob. */
export function renderCoverPNG(state, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawCover(canvas, state);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG render failed'))), 'image/png');
  });
}
