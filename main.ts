// Vice Frame — entry program for the make.fun bounty "Make GTA 6 Cover Art"
// (gta6-cover-art-01). Node 22, standard library only.
//
// The product is the static web app in app/ (open app/index.html in a
// desktop browser, or serve it with `node serve.ts`): it turns a photo and
// a caption into multi-panel, Vice City-graded poster cover art and exports
// it as a PNG at 1080 x 1080, 1080 x 1350 and 1920 x 1080. This program is
// the hand-in step: it stages app/ and screenshots/ into the output
// directory and writes the dossier the judge reads, using the vendored
// make.fun library in vendor/makefun-app.ts.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR stands in for the grader's /output when set.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Stage the app exactly as it ships, then the screenshots beside it.
mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'app'), join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The gate's own limits for this bounty, handed to the dossier builder so
// an entry the scorer would refuse (a fifth screenshot, one screenshot
// past 256 KiB, an app tree past 993 files / 48 MiB / 1000-byte paths)
// fails here first instead of at grading time.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
