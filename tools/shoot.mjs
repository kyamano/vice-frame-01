// Screenshot camera for the entry.
//
// Serves app/ on a throwaway localhost port, opens each scene listed in
// shots.json in headless Chromium, waits for the app to flag the frame
// as painted (window.__shotReady), and saves a JPEG per scene into
// screenshots/. Quality steps down until every file is under the
// gate's 256 KiB screenshot cap.
//
//   node tools/shoot.mjs
//
// playwright-core and a Chromium binary are located from the usual
// spots; override with PLAYWRIGHT_CORE_DIR / CHROME_PATH.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'app');
const sceneList = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf8'));
const BYTE_CAP = 262144;

async function findChromium() {
  try {
    return (await import('playwright-core')).chromium;
  } catch { /* not installed locally — try the shared checkout */ }
  const searchDirs = [
    process.env.PLAYWRIGHT_CORE_DIR,
    '/home/hatch/workspace/makefun/shot-tools',
  ].filter(Boolean);
  for (const dir of searchDirs) {
    try {
      return createRequire(join(dir, 'package.json'))('playwright-core').chromium;
    } catch { /* keep looking */ }
  }
  throw new Error('playwright-core not found; set PLAYWRIGHT_CORE_DIR');
}

const CHROME_BIN = process.env.CHROME_PATH
  ?? '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const filePath = join(appRoot, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!filePath.startsWith(appRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
  res.end(readFileSync(filePath));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const chromium = await findChromium();
const browser = await chromium.launch({
  executablePath: CHROME_BIN,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
});
mkdirSync(join(repoRoot, 'screenshots'), { recursive: true });

for (const scene of sceneList) {
  const page = await browser.newPage({ viewport: { width: scene.w, height: scene.h } });
  const problems = [];
  page.on('pageerror', (err) => problems.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  await page.goto(`http://127.0.0.1:${port}/index.html${scene.query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 20000 });
  let quality = 88;
  let jpeg = await page.screenshot({ type: 'jpeg', quality });
  while (jpeg.length > BYTE_CAP && quality > 40) {
    quality -= 8;
    jpeg = await page.screenshot({ type: 'jpeg', quality });
  }
  writeFileSync(join(repoRoot, 'screenshots', scene.name), jpeg);
  console.log(`${scene.name}: ${scene.w}x${scene.h}, ${jpeg.length} bytes at quality ${quality}`
    + (problems.length ? ` — PAGE ERRORS: ${problems.join(' | ')}` : ''));
  await page.close();
}

await browser.close();
server.close();
