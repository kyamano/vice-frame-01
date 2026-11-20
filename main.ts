// Vice Frame — entry point for the make.fun gta6-cover-art-01 bounty (Node 22, standard
// library only). The app itself is the static site under app/ (open app/index.html in a
// browser, no build step, no network); this program hands it in: it stages app/ and
// screenshots/ into the output directory and writes the dossier the judge reads, using
// the kit's vendored library so the bytes match the scorer's own rebuild.
//
// Run it the way the grader does, with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, passed to the dossier builder so an over-limit entry fails here
// first instead of at the gate: at most 4 screenshots of 256 KiB each, at most 993
// entries and 48 MiB under app/, no app/ path over 1000 bytes, dossier text capped.
const GATE_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, GATE_LIMITS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// Verify the staged entry against the gate's caps before it is handed in, so an
// over-limit screenshot or a swollen app/ fails loudly here instead of at the scorer.
function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walkFiles(path);
    else yield path;
  }
}
const appFiles = [...walkFiles(join(outputDir, 'app'))];
const appBytes = appFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const shotNames = readdirSync(join(outputDir, 'screenshots')).filter((name) => /\.(png|jpe?g)$/i.test(name));
const dossierBytes = Buffer.byteLength(dossier);
const problems = [];
if (appFiles.length > GATE_LIMITS.app_max_files) {
  problems.push(`app/ holds ${appFiles.length} files, over the ${GATE_LIMITS.app_max_files} cap`);
}
if (appBytes > GATE_LIMITS.app_max_bytes) {
  problems.push(`app/ totals ${appBytes} bytes, over the ${GATE_LIMITS.app_max_bytes} cap`);
}
if (shotNames.length < 3 || shotNames.length > GATE_LIMITS.screenshots.max) {
  problems.push(`screenshots/ holds ${shotNames.length} images, the gate wants 3 or 4`);
}
for (const name of shotNames) {
  const size = statSync(join(outputDir, 'screenshots', name)).size;
  if (size > GATE_LIMITS.screenshots.max_bytes) {
    problems.push(`screenshots/${name} is ${size} bytes, over the ${GATE_LIMITS.screenshots.max_bytes} cap`);
  }
}
if (dossierBytes > 1572864) {
  problems.push(`dossier.json is ${dossierBytes} bytes, over the 1.5 MiB cap`);
}
if (problems.length) {
  throw new Error(`vice-frame: the staged entry breaks the gate's caps:\n- ${problems.join('\n- ')}`);
}
console.log(
  `vice-frame: staged ${appFiles.length} app files (${appBytes} bytes) and ${shotNames.length} screenshots in ${outputDir}; ` +
  `dossier.json is ${dossierBytes} bytes — within the gate's caps`,
);
