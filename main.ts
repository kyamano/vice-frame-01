// Vice Frame — hand-in program for the make.fun bounty
// "Make GTA 6 Cover Art" (gta6-cover-art-01). Node 22, no dependencies.
//
// The actual product is the browser app under app/: a static poster
// studio that grades a photo into a multi-panel, Vice City-flavoured
// cover and downloads it as a PNG (1080x1080, 1080x1350 or 1920x1080).
// This file is only the packaging step. It copies app/ and screenshots/
// into the output directory and asks the vendored library in
// vendor/makefun-app.ts to write the dossier the scorer reads.
//
// Grader-style invocation:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// MAKEFUN_OUTPUT_DIR replaces the grader's /output in local runs.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight: catch a broken hand-in here, with a message that says
// what is wrong, instead of surfacing as a library refusal halfway
// through staging. The bounds mirror the gate's screenshot rules.
const SCREENSHOT_CAP = 262144;
if (!existsSync(join(root, 'app', 'index.html'))) {
  throw new Error('app/index.html is missing: the app tree is incomplete');
}
const shotsDir = join(root, 'screenshots');
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
  : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`screenshots/ must hold 3 or 4 images, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const { size } = statSync(join(shotsDir, name));
  if (size > SCREENSHOT_CAP) {
    throw new Error(`screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_CAP}-byte cap`);
  }
}

// Copy the app tree across untouched, then the screenshot set beside it.
mkdirSync(outputDir, { recursive: true });
cpSync(join(root, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Caps taken from this bounty's gate. Only text_max_bytes changes the
// dossier bytes; the rest exist so an entry the scorer would refuse
// (too many screenshots, one screenshot over 256 KiB, an app tree over
// 993 entries / 48 MiB / 1000-byte paths) already fails here.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// One-line run summary, so a hand-in log shows what was staged.
function treeStats(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = treeStats(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}
const appStats = treeStats(join(outputDir, 'app'));
console.log(
  `vice-frame: staged ${appStats.files} app files (${appStats.bytes} bytes), `
  + `${shotNames.length} screenshots, dossier ${Buffer.byteLength(dossier)} bytes -> ${outputDir}`,
);
