# vice-frame-01

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/kyamano/vice-frame-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/kyamano/vice-frame-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

**Vice Frame** — a poster cover studio that runs entirely in a desktop browser from static files: no build step, no network requests, no uploads. Drop in a photo, and it becomes multi-panel cover art in the GTA-poster tradition — white-keylined panels, a Vice City sunset or neon grade, and big gradient poster lettering — exported as a PNG in the sizes posts actually use.

## What it does

- **Six layouts** — Hero & Three (the classic cover composition), Quad Grid, Mosaic Six, Nine Panel, Tilted Snapshots (polaroid-style frames over a graded backdrop), and Full Bleed.
- **Any photo, many scenes** — load several photos by file picker or drag & drop, deal them across the panels, or run one photo through every panel: each panel crops a different focal point of it, like the scenes on a real cover. Click a panel to select it, drag inside it to reposition the crop, scroll or use the slider to zoom.
- **Five grades** — Vice Sunset, Neon Nights, Golden Hour, Noir, and Clean: per-panel CSS-filter colour work plus composited gradient washes in teal, tangerine and magenta, with optional film grain and vignette.
- **Poster lettering** — an editable title in condensed, outlined, sunset-gradient capitals with a neon script-style subtitle, a stars row, an optional corner badge, and a halftone title block over a dusk scrim.
- **Fast to a PNG** — the bundled samples are on the canvas the moment the page opens; exports render off-screen at full size: **1080 × 1080**, **1080 × 1350** and **1920 × 1080**, one click each or all three at once.
- **Undo / redo** for every change (Ctrl+Z / Ctrl+Y), so experimenting is free.

Everything is original: the art, lettering and code are this project's own, drawn with system fonts and the Canvas 2D API. No Rockstar Games logo, artwork or fonts are used. The two sample photos under `app/samples/` were made by make.fun for the bounty and are free to use.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Any static file server pointed at `app/` works just as well.

## Hand-in (make.fun)

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` stages `app/` and `screenshots/` into the output directory and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-app.ts`). Screenshots are reproducible with `node tools/shoot.mjs` (headless Chromium + the scenes in `shots.json`).

## License

MIT — see `LICENSE`.
