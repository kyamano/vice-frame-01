// Vice Frame render engine.
//
// Everything visual about a cover is drawn here, from a plain-data "spec"
// (layout, grade, words, per-panel crops) plus the loaded photo objects.
// The module never touches the DOM: the editor preview and the full-size
// PNG export run the exact same code path at different canvas sizes, so
// what you see on screen is byte-for-byte the composition you download.

/** The three post sizes the studio exports, keyed by their file-name tag. */
export const SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
};

/**
 * Colour grades. `filter` runs on the photo itself (CSS filter syntax on a
 * 2D context); `overlays` are gradient washes composited inside each panel
 * afterwards, which is where the sunset / neon money look actually lives.
 */
export const GRADES = {
  clean: {
    name: 'Clean',
    filter: 'saturate(1.12) contrast(1.04) brightness(1.01)',
    overlays: [],
  },
  sunset: {
    name: 'Vice Sunset',
    filter: 'saturate(1.5) contrast(1.12) brightness(1.04) hue-rotate(-6deg)',
    overlays: [
      {
        op: 'overlay', from: [0, 0], to: [0, 1],
        stops: [[0, 'rgba(56, 224, 208, 0.55)'], [0.45, 'rgba(255, 170, 80, 0.10)'], [1, 'rgba(255, 110, 60, 0.55)']],
      },
      {
        op: 'soft-light', from: [0, 0.35], to: [0, 1],
        stops: [[0, 'rgba(255, 41, 117, 0)'], [1, 'rgba(255, 41, 117, 0.85)']],
      },
    ],
  },
  neon: {
    name: 'Neon Nights',
    filter: 'saturate(1.85) contrast(1.22) brightness(1.03)',
    overlays: [
      {
        op: 'overlay', from: [0, 0], to: [1, 1],
        stops: [[0, 'rgba(255, 46, 166, 0.6)'], [0.5, 'rgba(120, 60, 255, 0.05)'], [1, 'rgba(0, 229, 255, 0.6)']],
      },
      {
        op: 'screen', from: [0, 0.55], to: [0, 1],
        stops: [[0, 'rgba(80, 0, 160, 0)'], [1, 'rgba(80, 0, 160, 0.30)']],
      },
    ],
  },
  gold: {
    name: 'Golden Hour',
    filter: 'sepia(0.38) saturate(1.35) contrast(1.1) brightness(1.06)',
    overlays: [
      {
        op: 'overlay', from: [0, 0], to: [0, 1],
        stops: [[0, 'rgba(255, 196, 86, 0.5)'], [1, 'rgba(168, 62, 12, 0.5)']],
      },
    ],
  },
  noir: {
    name: 'Noir',
    filter: 'grayscale(1) contrast(1.3) brightness(1.06)',
    overlays: [
      {
        op: 'overlay', from: [0, 0], to: [0, 1],
        stops: [[0, 'rgba(255, 205, 150, 0.22)'], [1, 'rgba(20, 16, 40, 0.30)']],
      },
    ],
  },
};

/** Focal points cycled across panels so one photo reads as many scenes. */
export const FOCALS = [
  [0.50, 0.38], [0.24, 0.32], [0.76, 0.30], [0.50, 0.62], [0.28, 0.58],
  [0.72, 0.55], [0.50, 0.50], [0.18, 0.45], [0.82, 0.48],
];

/**
 * Panel rectangles for a layout, in unit space (0..1 on each axis).
 * `tilt` panels also carry a rotation in radians and are drawn as
 * polaroid-style snapshots over a full-bleed backdrop.
 */
function layoutRects(layout, aspect) {
  const wide = aspect >= 1.25;
  switch (layout) {
    case 'hero':
      return wide
        ? [
            { x: 0, y: 0, w: 0.615, h: 1 },
            { x: 0.615, y: 0, w: 0.385, h: 0.333 },
            { x: 0.615, y: 0.333, w: 0.385, h: 0.334 },
            { x: 0.615, y: 0.667, w: 0.385, h: 0.333 },
          ]
        : [
            { x: 0, y: 0, w: 1, h: 0.635 },
            { x: 0, y: 0.635, w: 0.333, h: 0.365 },
            { x: 0.333, y: 0.635, w: 0.334, h: 0.365 },
            { x: 0.667, y: 0.635, w: 0.333, h: 0.365 },
          ];
    case 'quad':
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    case 'mosaic':
      return [
        { x: 0, y: 0, w: 0.667, h: 0.667 }, { x: 0.667, y: 0, w: 0.333, h: 0.333 },
        { x: 0.667, y: 0.333, w: 0.333, h: 0.334 }, { x: 0, y: 0.667, w: 0.333, h: 0.333 },
        { x: 0.333, y: 0.667, w: 0.334, h: 0.333 }, { x: 0.667, y: 0.667, w: 0.333, h: 0.333 },
      ];
    case 'nine': {
      const cells = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) cells.push({ x: c / 3, y: r / 3, w: 1 / 3, h: 1 / 3 });
      }
      return cells;
    }
    case 'tilt':
      return [
        { x: 0.055, y: 0.075, w: 0.52, h: 0.50, rot: -0.065 },
        { x: 0.435, y: 0.285, w: 0.51, h: 0.485, rot: 0.05 },
        { x: 0.135, y: 0.545, w: 0.47, h: 0.40, rot: -0.028 },
      ];
    case 'full':
    default:
      return [{ x: 0, y: 0, w: 1, h: 1 }];
  }
}

export const LAYOUTS = [
  { id: 'hero', name: 'Hero & Three' },
  { id: 'quad', name: 'Quad Grid' },
  { id: 'mosaic', name: 'Mosaic Six' },
  { id: 'nine', name: 'Nine Panel' },
  { id: 'tilt', name: 'Tilted Snapshots' },
  { id: 'full', name: 'Full Bleed' },
];

/** How many photo slots a layout has (the tilt backdrop reuses slot 0). */
export function slotCount(layout) {
  return layoutRects(layout, 1).length;
}

/** A fresh per-panel crop: photo index plus zoom and focal point. */
export function defaultPanel(photoIndex, slot) {
  const [fx, fy] = FOCALS[slot % FOCALS.length];
  return { photo: photoIndex, zoom: 1.22, fx, fy };
}

// ---------------------------------------------------------------- photos

/**
 * Draws `img` into `rect`, cover-fitted around the panel's focal point.
 * The focal point is the spot of the photo pinned to the panel's centre;
 * the result is clamped so the photo always covers the whole panel.
 */
function drawPhoto(ctx, img, rect, panel) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(rect.w / iw, rect.h / ih) * (panel.zoom || 1);
  const dw = iw * scale;
  const dh = ih * scale;
  let dx = rect.x + rect.w / 2 - (panel.fx ?? 0.5) * dw;
  let dy = rect.y + rect.h / 2 - (panel.fy ?? 0.5) * dh;
  dx = Math.min(rect.x, Math.max(rect.x + rect.w - dw, dx));
  dy = Math.min(rect.y, Math.max(rect.y + rect.h - dh, dy));
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Runs a grade's filter + washes over the current clip region. */
function applyGrade(ctx, rect, grade, img, panel) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.filter = grade.filter;
  drawPhoto(ctx, img, rect, panel);
  ctx.filter = 'none';
  for (const wash of grade.overlays) {
    const grad = ctx.createLinearGradient(
      rect.x + wash.from[0] * rect.w, rect.y + wash.from[1] * rect.h,
      rect.x + wash.to[0] * rect.w, rect.y + wash.to[1] * rect.h,
    );
    for (const [at, colour] of wash.stops) grad.addColorStop(at, colour);
    ctx.globalCompositeOperation = wash.op;
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- texture

let noisePattern = null;
function getNoise(ctx) {
  if (noisePattern) return noisePattern;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 140;
  const tctx = tile.getContext('2d');
  const data = tctx.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 96);
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  tctx.putImageData(data, 0, 0);
  noisePattern = ctx.createPattern(tile, 'repeat');
  return noisePattern;
}

let halftonePattern = null;
function getHalftone(ctx, W) {
  if (halftonePattern) return halftonePattern;
  const step = Math.max(9, Math.round(W / 90));
  const tile = document.createElement('canvas');
  tile.width = tile.height = step;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.beginPath();
  tctx.arc(step / 2, step / 2, step * 0.21, 0, Math.PI * 2);
  tctx.fill();
  halftonePattern = ctx.createPattern(tile, 'repeat');
  return halftonePattern;
}

// ---------------------------------------------------------------- title

const TITLE_FONT = '"Arial Black", "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif';

/** Draws the stars row, gradient title and neon subtitle over the foot. */
function drawTitleBlock(ctx, W, H, spec) {
  const title = (spec.title || '').trim().toUpperCase();
  const subtitle = (spec.subtitle || '').trim().toUpperCase();
  if (!title && !subtitle && !spec.stars) return;

  // Scrim: a dusk gradient so the lettering sits on the art, not in a box.
  const scrimTop = H * 0.60;
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, H);
  scrim.addColorStop(0, 'rgba(12, 4, 26, 0)');
  scrim.addColorStop(0.55, 'rgba(12, 4, 26, 0.42)');
  scrim.addColorStop(1, 'rgba(12, 4, 26, 0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = getHalftone(ctx, W);
  ctx.fillRect(0, H * 0.70, W, H * 0.30);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let cursor = H * 0.985;

  if (subtitle) {
    let size = Math.min(W, H) * 0.034;
    ctx.font = `italic 700 ${size}px ${TITLE_FONT}`;
    try { ctx.letterSpacing = `${size * 0.34}px`; } catch { /* older engines */ }
    while (ctx.measureText(subtitle).width > W * 0.86 && size > 10) {
      size -= 1.5;
      ctx.font = `italic 700 ${size}px ${TITLE_FONT}`;
      try { ctx.letterSpacing = `${size * 0.34}px`; } catch { /* older engines */ }
    }
    ctx.save();
    ctx.shadowColor = 'rgba(255, 46, 166, 0.95)';
    ctx.shadowBlur = size * 0.7;
    ctx.fillStyle = '#8ef6ff';
    ctx.fillText(subtitle, W / 2, cursor);
    ctx.restore();
    cursor -= size * 1.45;
    try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
  }

  if (title) {
    let size = W * 0.135;
    const setFont = () => { ctx.font = `900 ${size}px ${TITLE_FONT}`; };
    setFont();
    // Condensed squeeze, the poster-lettering trick: measure squeezed.
    while (ctx.measureText(title).width * 0.85 > W * 0.92 && size > 14) {
      size -= 2;
      setFont();
    }
    ctx.save();
    ctx.translate(W / 2, cursor);
    ctx.scale(0.85, 1);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.14;
    ctx.shadowOffsetY = size * 0.05;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#180a2c';
    ctx.lineWidth = size * 0.17;
    ctx.strokeText(title, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const fill = ctx.createLinearGradient(0, -size, 0, size * 0.25);
    fill.addColorStop(0, '#fff3b0');
    fill.addColorStop(0.45, '#ffb347');
    fill.addColorStop(0.78, '#ff5e8a');
    fill.addColorStop(1, '#c44dff');
    ctx.fillStyle = fill;
    ctx.fillText(title, 0, 0);
    ctx.restore();
    cursor -= size * 1.08;
  }

  if (spec.stars) {
    const size = Math.min(W, H) * 0.036;
    ctx.save();
    ctx.font = `${size}px ${TITLE_FONT}`;
    ctx.shadowColor = 'rgba(255, 180, 40, 0.8)';
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = '#ffc93c';
    ctx.fillText('★ ★ ★ ★ ★', W / 2, cursor);
    ctx.restore();
  }
}

/** The corner ribbon badge, a small rotated pill at the top right. */
function drawBadge(ctx, W, H) {
  const label = '★ VICE FRAME ★';
  const size = Math.min(W, H) * 0.026;
  ctx.save();
  ctx.font = `900 ${size}px ${TITLE_FONT}`;
  const tw = ctx.measureText(label).width;
  const padX = size * 0.9;
  const bw = tw + padX * 2;
  const bh = size * 2.0;
  ctx.translate(W - bw * 0.62, H * 0.052);
  ctx.rotate(-0.055);
  const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  grad.addColorStop(0, '#ff2ea6');
  grad.addColorStop(1, '#7b2eff');
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = size * 0.5;
  ctx.shadowOffsetY = size * 0.18;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, size * 0.06);
  ctx.restore();
}

// ---------------------------------------------------------------- render

/**
 * Renders a whole cover onto `canvas` at the canvas's own pixel size.
 * `images` is the photo list the spec's panel indexes point into; a slot
 * with no photo yet paints as a deep-violet placeholder. Returns the
 * panel rectangles in canvas pixels (the editor uses them for clicks).
 */
export function renderCover(canvas, spec, images) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const grade = GRADES[spec.grade] ?? GRADES.sunset;
  const units = layoutRects(spec.layout, W / H);
  const gap = Math.max(5, W * 0.0075);
  const keyline = Math.max(2.5, W * 0.0032);

  ctx.fillStyle = '#150826';
  ctx.fillRect(0, 0, W, H);

  const rects = units.map((u) => ({
    x: u.x * W, y: u.y * H, w: u.w * W, h: u.h * H, rot: u.rot ?? 0,
  }));

  if (spec.layout === 'tilt') {
    // Backdrop: slot 0's photo, full-bleed, graded and darkened.
    const back = images[spec.panels[0]?.photo ?? 0];
    if (back) {
      ctx.save();
      ctx.filter = grade.filter;
      drawPhoto(ctx, back, { x: 0, y: 0, w: W, h: H }, { zoom: 1.05, fx: 0.5, fy: 0.42 });
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(16, 5, 34, 0.52)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    rects.forEach((rect, i) => {
      const panel = spec.panels[i] ?? defaultPanel(0, i);
      const img = images[panel.photo];
      const frame = Math.max(8, W * 0.011);
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(rect.rot);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = W * 0.028;
      ctx.shadowOffsetY = W * 0.012;
      ctx.fillStyle = '#f7f3ea';
      ctx.fillRect(-rect.w / 2 - frame, -rect.h / 2 - frame, rect.w + frame * 2, rect.h + frame * 2.9);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const inner = { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
      if (img) applyGrade(ctx, inner, grade, img, panel);
      else { ctx.fillStyle = '#2a1650'; ctx.fillRect(inner.x, inner.y, inner.w, inner.h); }
      ctx.restore();
    });
  } else {
    rects.forEach((rect, i) => {
      const panel = spec.panels[i] ?? defaultPanel(0, i);
      const img = images[panel.photo];
      const cell = {
        x: rect.x + gap / 2, y: rect.y + gap / 2,
        w: rect.w - gap, h: rect.h - gap,
      };
      // The white keyline: a slightly larger white card under the photo.
      ctx.fillStyle = '#f7f3ea';
      ctx.fillRect(cell.x - keyline, cell.y - keyline, cell.w + keyline * 2, cell.h + keyline * 2);
      if (img) {
        applyGrade(ctx, cell, grade, img, panel);
      } else {
        ctx.fillStyle = '#2a1650';
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      }
    });
  }

  drawTitleBlock(ctx, W, H, spec);
  if (spec.badge) drawBadge(ctx, W, H);

  if (spec.grain) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = getNoise(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (spec.vignette) {
    const rad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
    rad.addColorStop(0, 'rgba(8, 2, 18, 0)');
    rad.addColorStop(1, 'rgba(8, 2, 18, 0.40)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
  }
  return rects;
}
