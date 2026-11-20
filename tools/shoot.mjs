// Takes the entry's screenshots: serves app/ with the repo's serve.ts, opens each scene
// listed in shots.json in headless Chromium (Playwright), waits for the app to paint it
// (window.__shotReady), and saves a JPEG of the window into screenshots/. The JPEG
// quality steps down until every file is within the gate's 256 KiB cap.
//
//   node tools/shoot.mjs            take every shot in shots.json
//   node tools/shoot.mjs 1-cover    re-take only the shots whose name contains the text

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8137;
const MAX_BYTES = 262144;

/** Playwright if the repo can resolve it, else the machine's shared playwright-core. */
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch { /* fall through to the shared install */ }
  try {
    return (await import('playwright-core')).chromium;
  } catch { /* fall through to the shared install */ }
  const shared = createRequire('/home/hatch/workspace/makefun/shot-tools/package.json');
  return shared('playwright-core').chromium;
}

function headlessShellPath() {
  const base = join(homedir(), '.cache', 'ms-playwright');
  const candidate = join(base, 'chromium_headless_shell-1255', 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  return existsSync(candidate) ? candidate : undefined;
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not come up at ${url}`);
}

const only = process.argv[2];
const shots = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf8'))
  .filter((s) => !only || s.name.includes(only));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repoRoot, stdio: 'ignore' });
try {
  await waitForServer(`http://localhost:${PORT}/`);
  const chromium = await loadChromium();
  const executablePath = headlessShellPath();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
    await page.goto(`http://localhost:${PORT}/${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 20000 });
    let quality = 88;
    let buffer = await page.screenshot({ type: 'jpeg', quality });
    while (buffer.length > MAX_BYTES && quality > 46) {
      quality -= 7;
      buffer = await page.screenshot({ type: 'jpeg', quality });
    }
    if (buffer.length > MAX_BYTES) throw new Error(`${shot.name}: ${buffer.length} bytes at quality ${quality}, over the ${MAX_BYTES} cap`);
    writeFileSync(join(repoRoot, 'screenshots', shot.name), buffer);
    console.log(`${shot.name}: ${buffer.length} bytes at JPEG quality ${quality} (viewport ${shot.w}x${shot.h})`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
