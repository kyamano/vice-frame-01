// Takes the entry's screenshots: serves app/ locally, opens every scene in
// shots.json in headless Chromium, waits for the app to paint it
// (window.__shotReady), and writes JPEGs into screenshots/, stepping the
// quality down until each file fits the gate's 256 KiB cap.
//
//   node tools/shoot.mjs
//
// Needs playwright-core and a Chromium build. Both are looked up in the
// usual spots; override with PLAYWRIGHT_CORE_DIR and CHROME_PATH.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repoDir, 'app');
const shots = JSON.parse(readFileSync(join(repoDir, 'shots.json'), 'utf8'));

async function loadChromium() {
  try {
    return (await import('playwright-core')).chromium;
  } catch { /* fall through to the shared install */ }
  const candidates = [
    process.env.PLAYWRIGHT_CORE_DIR,
    '/home/hatch/workspace/makefun/shot-tools',
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      const req = createRequire(join(dir, 'package.json'));
      return req('playwright-core').chromium;
    } catch { /* try the next one */ }
  }
  throw new Error('playwright-core not found (set PLAYWRIGHT_CORE_DIR)');
}

const CHROME = process.env.CHROME_PATH
  ?? '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const MAX_BYTES = 262144;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const path = join(appDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(appDir) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
});
mkdirSync(join(repoDir, 'screenshots'), { recursive: true });

for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(`http://127.0.0.1:${port}/index.html${shot.query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 20000 });
  let quality = 88;
  let buffer = await page.screenshot({ type: 'jpeg', quality });
  while (buffer.length > MAX_BYTES && quality > 40) {
    quality -= 8;
    buffer = await page.screenshot({ type: 'jpeg', quality });
  }
  writeFileSync(join(repoDir, 'screenshots', shot.name), buffer);
  console.log(`${shot.name}: ${shot.w}x${shot.h}, ${buffer.length} bytes at quality ${quality}`
    + (errors.length ? ` — PAGE ERRORS: ${errors.join(' | ')}` : ''));
  await page.close();
}

await browser.close();
server.close();
