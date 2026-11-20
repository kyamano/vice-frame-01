// Vice Frame — cover renderer.
//
// A cover is fully described by a plain object (the "spec"): which
// layout, which grade, the title words, and one crop record per panel.
// This module turns a spec plus a list of loaded images into pixels on
// whatever canvas it is handed. It never touches the DOM beyond
// creating scratch canvases, so the editor preview and the full-size
// PNG export share one code path and always agree.

/** Export sizes, keyed by the tag used in file names and the UI. */
export const SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
};

/**
 * Colour grades. `filter` is a CSS filter string applied while the
 * photo is drawn; `washes` are gradient layers composited over the
 * graded photo inside each panel — the washes carry most of the
 * sunset / neon character.
 */
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    filter: 'saturate(1.5) contrast(1.12) brightness(1.04) hue-rotate(-6deg)',
    washes: [
      {
        mode: 'overlay', x0: 0, y0: 0, x1: 0, y1: 1,
        stops: [[0, 'rgba(56, 224, 208, 0.55)'], [0.45, 'rgba(255, 170, 80, 0.10)'], [1, 'rgba(255, 110, 60, 0.55)']],
      },
      {
        mode: 'soft-light', x0: 0, y0: 0.35, x1: 0, y1: 1,
        stops: [[0, 'rgba(255, 41, 117, 0)'], [1, 'rgba(255, 41, 117, 0.85)']],
      },
    ],
  },
  neon: {
    label: 'Neon Nights',
    filter: 'saturate(1.85) contrast(1.22) brightness(1.03)',
    washes: [
      {
        mode: 'overlay', x0: 0, y0: 0, x1: 1, y1: 1,
        stops: [[0, 'rgba(255, 46, 166, 0.6)'], [0.5, 'rgba(120, 60, 255, 0.05)'], [1, 'rgba(0, 229, 255, 0.6)']],
      },
      {
        mode: 'screen', x0: 0, y0: 0.55, x1: 0, y1: 1,
        stops: [[0, 'rgba(80, 0, 160, 0)'], [1, 'rgba(80, 0, 160, 0.30)']],
      },
    ],
  },
  gold: {
    label: 'Golden Hour',
    filter: 'sepia(0.38) saturate(1.35) contrast(1.1) brightness(1.06)',
    washes: [
      {
        mode: 'overlay', x0: 0, y0: 0, x1: 0, y1: 1,
        stops: [[0, 'rgba(255, 196, 86, 0.5)'], [1, 'rgba(168, 62, 12, 0.5)']],
      },
    ],
  },
  noir: {
    label: 'Noir',
    filter: 'grayscale(1) contrast(1.3) brightness(1.06)',
    washes: [
      {
        mode: 'overlay', x0: 0, y0: 0, x1: 0, y1: 1,
        stops: [[0, 'rgba(255, 205, 150, 0.22)'], [1, 'rgba(20, 16, 40, 0.30)']],
      },
    ],
  },
  clean: {
    label: 'Clean',
    filter: 'saturate(1.12) contrast(1.04) brightness(1.01)',
    washes: [],
  },
};

/** Grade ids in the order the editor lists them. */
export const GRADE_ORDER = ['sunset', 'neon', 'gold', 'noir', 'clean'];

/**
 * Focal points dealt across the panels when one photo fills a whole
 * cover, so each panel crops a different "scene" out of it.
 */
const FOCAL_CYCLE = [
  [0.50, 0.38], [0.24, 0.32], [0.76, 0.30], [0.50, 0.62], [0.28, 0.58],
  [0.72, 0.55], [0.50, 0.50], [0.18, 0.45], [0.82, 0.48],
];

/**
 * Layout table: each entry returns panel rectangles in unit space for
 * a canvas of the given aspect (w/h). Rectangles may carry `rot`
 * (radians) — only the tilt layout uses it, for its polaroid frames.
 */
const LAYOUT_DEFS = {
  hero: {
    label: 'Hero & Three',
    rects(aspect) {
      if (aspect >= 1.25) {
        return [
          { x: 0, y: 0, w: 0.615, h: 1 },
          { x: 0.615, y: 0, w: 0.385, h: 0.333 },
          { x: 0.615, y: 0.333, w: 0.385, h: 0.334 },
          { x: 0.615, y: 0.667, w: 0.385, h: 0.333 },
        ];
      }
      return [
        { x: 0, y: 0, w: 1, h: 0.635 },
        { x: 0, y: 0.635, w: 0.333, h: 0.365 },
        { x: 0.333, y: 0.635, w: 0.334, h: 0.365 },
        { x: 0.667, y: 0.635, w: 0.333, h: 0.365 },
      ];
    },
  },
  quad: {
    label: 'Quad Grid',
    rects() {
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    },
  },
  mosaic: {
    label: 'Mosaic Six',
    rects() {
      return [
        { x: 0, y: 0, w: 0.667, h: 0.667 }, { x: 0.667, y: 0, w: 0.333, h: 0.333 },
        { x: 0.667, y: 0.333, w: 0.333, h: 0.334 }, { x: 0, y: 0.667, w: 0.333, h: 0.333 },
        { x: 0.333, y: 0.667, w: 0.334, h: 0.333 }, { x: 0.667, y: 0.667, w: 0.333, h: 0.333 },
      ];
    },
  },
  nine: {
    label: 'Nine Panel',
    rects() {
      const cells = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          cells.push({ x: col / 3, y: row / 3, w: 1 / 3, h: 1 / 3 });
        }
      }
      return cells;
    },
  },
  tilt: {
    label: 'Tilted Snapshots',
    rects() {
      return [
        { x: 0.055, y: 0.075, w: 0.52, h: 0.50, rot: -0.065 },
        { x: 0.435, y: 0.285, w: 0.51, h: 0.485, rot: 0.05 },
        { x: 0.135, y: 0.545, w: 0.47, h: 0.40, rot: -0.028 },
      ];
    },
  },
  full: {
    label: 'Full Bleed',
    rects() {
      return [{ x: 0, y: 0, w: 1, h: 1 }];
    },
  },
};

/** Layout ids with labels, in the order the editor lists them. */
export const LAYOUTS = Object.entries(LAYOUT_DEFS).map(([id, def]) => ({ id, label: def.label }));

/** Unit-space panel rectangles for a layout at a canvas aspect. */
export function panelRects(layoutId, aspect) {
  return (LAYOUT_DEFS[layoutId] ?? LAYOUT_DEFS.full).rects(aspect);
}

/** Number of photo slots a layout has (tilt's backdrop reuses slot 0). */
export function slotCount(layoutId) {
  return panelRects(layoutId, 1).length;
}

/** Default crop record for one panel: photo index, zoom, focal point. */
export function freshPanel(photoIndex, slot) {
  const [fx, fy] = FOCAL_CYCLE[slot % FOCAL_CYCLE.length];
  return { photo: photoIndex, zoom: 1.22, fx, fy };
}

// ------------------------------------------------------------- photo fit

/**
 * Draws an image into a pixel rectangle, cover-style: scaled until it
 * fills the rect, positioned so the panel's focal point (a fraction of
 * the photo) lands on the rect's centre, then clamped so no edge of
 * the rect is ever left uncovered.
 */
function paintPhoto(ctx, img, rect, panel) {
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
  // Panels routinely upscale a modest phone photo to a full-size
  // export; the browser's default smoothing quality is the softest
  // one, so ask for the high-quality resample explicitly.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Paints one panel: the graded photo, clipped to the panel's rect. */
function paintPanel(ctx, rect, grade, img, panel) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.filter = grade.filter;
  paintPhoto(ctx, img, rect, panel);
  ctx.filter = 'none';
  for (const wash of grade.washes) {
    const grad = ctx.createLinearGradient(
      rect.x + wash.x0 * rect.w, rect.y + wash.y0 * rect.h,
      rect.x + wash.x1 * rect.w, rect.y + wash.y1 * rect.h,
    );
    for (const [at, colour] of wash.stops) grad.addColorStop(at, colour);
    ctx.globalCompositeOperation = wash.mode;
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

// --------------------------------------------------------------- texture

let grainTile = null;
function grainPattern(ctx) {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 140;
  const t = tile.getContext('2d');
  const data = t.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 96);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  t.putImageData(data, 0, 0);
  grainTile = ctx.createPattern(tile, 'repeat');
  return grainTile;
}

let dotsTile = null;
let dotsStep = 0;
function halftonePattern(ctx, W) {
  // The dot pitch is derived from the canvas width, so the cached tile
  // is only valid for the step it was built with: a preview at 1080
  // wide and an export at 1920 must not share one tile.
  const step = Math.max(9, Math.round(W / 90));
  if (dotsTile && dotsStep === step) return dotsTile;
  const tile = document.createElement('canvas');
  tile.width = tile.height = step;
  const t = tile.getContext('2d');
  t.fillStyle = '#ffffff';
  t.beginPath();
  t.arc(step / 2, step / 2, step * 0.21, 0, Math.PI * 2);
  t.fill();
  dotsTile = ctx.createPattern(tile, 'repeat');
  dotsStep = step;
  return dotsTile;
}

// ----------------------------------------------------------------- words

const DISPLAY_FONT = '"Arial Black", "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif';

/**
 * The lettering stack at the foot of the cover: a dusk scrim with a
 * halftone band, the five stars, the big gradient title (condensed by
 * a horizontal squeeze, outlined, sunset-filled) and the neon-glow
 * subtitle. Drawn bottom-up from a baseline cursor.
 */
function paintWords(ctx, W, H, spec) {
  const title = (spec.title || '').trim().toUpperCase();
  const subtitle = (spec.subtitle || '').trim().toUpperCase();
  if (!title && !subtitle && !spec.stars) return;

  const scrimTop = H * 0.60;
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, H);
  scrim.addColorStop(0, 'rgba(12, 4, 26, 0)');
  scrim.addColorStop(0.55, 'rgba(12, 4, 26, 0.42)');
  scrim.addColorStop(1, 'rgba(12, 4, 26, 0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = halftonePattern(ctx, W);
  ctx.fillRect(0, H * 0.70, W, H * 0.30);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let baseline = H * 0.985;

  if (subtitle) {
    let size = Math.min(W, H) * 0.034;
    const setSub = () => {
      ctx.font = `italic 700 ${size}px ${DISPLAY_FONT}`;
      try { ctx.letterSpacing = `${size * 0.34}px`; } catch { /* not everywhere */ }
    };
    setSub();
    while (ctx.measureText(subtitle).width > W * 0.86 && size > 10) {
      size -= 1.5;
      setSub();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(255, 46, 166, 0.95)';
    ctx.shadowBlur = size * 0.7;
    ctx.fillStyle = '#8ef6ff';
    ctx.fillText(subtitle, W / 2, baseline);
    ctx.restore();
    try { ctx.letterSpacing = '0px'; } catch { /* not everywhere */ }
    baseline -= size * 1.45;
  }

  if (title) {
    let size = W * 0.135;
    const setTitle = () => { ctx.font = `900 ${size}px ${DISPLAY_FONT}`; };
    setTitle();
    // Poster lettering is condensed: fit the squeezed width, not raw.
    while (ctx.measureText(title).width * 0.85 > W * 0.92 && size > 14) {
      size -= 2;
      setTitle();
    }
    ctx.save();
    ctx.translate(W / 2, baseline);
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
    baseline -= size * 1.08;
  }

  if (spec.stars) {
    const size = Math.min(W, H) * 0.036;
    ctx.save();
    ctx.font = `${size}px ${DISPLAY_FONT}`;
    ctx.shadowColor = 'rgba(255, 180, 40, 0.8)';
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = '#ffc93c';
    ctx.fillText('★ ★ ★ ★ ★', W / 2, baseline);
    ctx.restore();
  }
}

/** The small rotated pill badge in the top-right corner. */
function paintBadge(ctx, W, H) {
  const label = '★ VICE FRAME ★';
  const size = Math.min(W, H) * 0.026;
  ctx.save();
  ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
  const width = ctx.measureText(label).width + size * 1.8;
  const height = size * 2.0;
  ctx.translate(W - width * 0.62, H * 0.052);
  ctx.rotate(-0.055);
  const grad = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  grad.addColorStop(0, '#ff2ea6');
  grad.addColorStop(1, '#7b2eff');
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = size * 0.5;
  ctx.shadowOffsetY = size * 0.18;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, height / 2);
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
 * Renders a cover onto `canvas` at the canvas's own pixel size.
 * `images` is the array the spec's panel photo indexes refer to; a
 * panel whose photo is missing paints as a deep-violet placeholder.
 * Returns the panel rectangles in canvas pixels (editor hit-testing).
 */
export function renderCover(canvas, spec, images) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const grade = GRADES[spec.grade] ?? GRADES.sunset;
  const gap = Math.max(5, W * 0.0075);
  const keyline = Math.max(2.5, W * 0.0032);

  ctx.fillStyle = '#150826';
  ctx.fillRect(0, 0, W, H);

  const rects = panelRects(spec.layout, W / H).map((u) => ({
    x: u.x * W, y: u.y * H, w: u.w * W, h: u.h * H, rot: u.rot ?? 0,
  }));

  if (spec.layout === 'tilt') {
    // Backdrop: the first panel's photo full-bleed, graded, darkened —
    // the polaroid frames sit on top of it.
    const backdrop = images[spec.panels[0]?.photo ?? 0];
    if (backdrop) {
      ctx.save();
      ctx.filter = grade.filter;
      paintPhoto(ctx, backdrop, { x: 0, y: 0, w: W, h: H }, { photo: 0, zoom: 1.05, fx: 0.5, fy: 0.42 });
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(16, 5, 34, 0.52)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    rects.forEach((rect, i) => {
      const panel = spec.panels[i] ?? freshPanel(0, i);
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
      if (img) paintPanel(ctx, inner, grade, img, panel);
      else {
        ctx.fillStyle = '#2a1650';
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      }
      ctx.restore();
    });
  } else {
    rects.forEach((rect, i) => {
      const panel = spec.panels[i] ?? freshPanel(0, i);
      const img = images[panel.photo];
      const cell = {
        x: rect.x + gap / 2, y: rect.y + gap / 2,
        w: rect.w - gap, h: rect.h - gap,
      };
      // White keyline first: a slightly larger card behind the photo.
      ctx.fillStyle = '#f7f3ea';
      ctx.fillRect(cell.x - keyline, cell.y - keyline, cell.w + keyline * 2, cell.h + keyline * 2);
      if (img) {
        paintPanel(ctx, cell, grade, img, panel);
      } else {
        ctx.fillStyle = '#2a1650';
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      }
    });
  }

  paintWords(ctx, W, H, spec);
  if (spec.badge) paintBadge(ctx, W, H);

  if (spec.grain) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (spec.vignette) {
    const rad = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.42,
      W / 2, H / 2, Math.max(W, H) * 0.78,
    );
    rad.addColorStop(0, 'rgba(8, 2, 18, 0)');
    rad.addColorStop(1, 'rgba(8, 2, 18, 0.40)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
  }
  return rects;
}
