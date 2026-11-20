# Vice Frame — GTA-Style Cover Art Maker

[![Competition](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/c/gta6-cover-art-01)
[![Rank](https://make.fun/badge/gta6-cover-art-01/kyamano/vice-frame-01/rank.svg)](https://make.fun/c/gta6-cover-art-01)
[![Reward](https://make.fun/badge/gta6-cover-art-01/kyamano/vice-frame-01/reward.svg)](https://make.fun/c/gta6-cover-art-01)

Vice Frame turns your own photos and a caption into cover art in the style of GTA 6's
posters: a multi-panel collage split by white keylines, a Vice City sunset or neon
colour grade, and bold poster lettering — exported as a PNG in the sizes posts want.

An entry for make.fun's [Make GTA 6 Cover Art](https://make.fun/c/gta6-cover-art-01)
bounty. Everything is original: no Rockstar logos, artwork or fonts; the lettering is
drawn with system fonts, and your photos are read on your own machine and never uploaded.

## Use it

Open `app/index.html` in a desktop browser (or serve `app/` with any static server —
`node serve.ts` works) — no build step, no network.

1. **Add photos** — pick files or drop them anywhere on the page. The two bundled
   samples are already loaded so you can start composing at once.
2. **Compose** — click a panel to select it, drag inside it to position its photo,
   scroll to zoom, or use the Pan / Zoom sliders. Six layouts: Hero & Three, Quad Grid,
   Mosaic Six, Nine Panel, Tilted Snapshots and Full Bleed. One photo can fill every
   panel, or each panel can hold a different one.
3. **Grade** — Vice Sunset, Neon Nights, Golden Hour, Noir or Clean, applied per pixel
   with split-toned shadows and highlights, a halftone band and a vignette.
4. **Letter it** — title, subtitle, a star row and a round badge, all editable.
5. **Export** — one click renders the cover offscreen at full size and downloads a PNG:
   1080 × 1080, 1080 × 1350 or 1920 × 1080.

## Layout of this repository

- `app/` — the app itself: plain static files (`index.html`, `style.css`, ES modules
  under `src/`), no dependencies. `src/cover.js` is the rendering engine (layouts,
  grades, lettering, export), `src/main.js` the editor, `src/shots.js` the fixed
  scenes used for the screenshots.
- `screenshots/` — the cover and editor shots shown on the bounty page, taken by
  `tools/shoot.mjs` from the scenes in `shots.json`.
- `main.ts` — the hand-in program: stages `app/` and `screenshots/` into the output
  directory and writes `dossier.json` with the kit's vendored library.
  Run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.
- `serve.ts` — a tiny static server for trying the app locally on
  <http://localhost:8080>.

## License

MIT — see `LICENSE`.
