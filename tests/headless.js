// Runs the browser test suite (tests/index.html) in headless Chrome and exits non-zero on failure.
// No extra dependencies: a tiny static server plus the Chrome DevTools Protocol over Node's built-in WebSocket (Node 22+).
//
//   npm run test:headless
//   CHROME_BIN=/path/to/chrome npm run test:headless
//
// Environment:
//   CHROME_BIN    Chrome / Chromium executable (defaults to the usual install path for the platform)
//   TEST_TIMEOUT  Maximum run time in ms (default 300000)

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timeout = +(process.env.TEST_TIMEOUT || 300000);

const defaultChrome = {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: 'google-chrome',
}[process.platform];
const chromeBin = process.env.CHROME_BIN || defaultChrome;

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// Static file server rooted at the repo (tests import ../dist and ../node_modules)
const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;

// Pick a free port for Chrome's DevTools endpoint
const debugPort = await new Promise(resolve => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const p = /** @type {import('node:net').AddressInfo} */ (probe.address()).port;
    probe.close(() => resolve(p));
  });
});

const profile = await mkdtemp(path.join(tmpdir(), 'anime-tests-'));
const chrome = spawn(chromeBin, [
  '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900',
  // Keep timers and animation frames running at full rate (tests drive drags frame by frame)
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(process.env.CI ? ['--no-sandbox'] : []),
  'about:blank',
], { stdio: 'ignore' });

const wait = ms => new Promise(r => setTimeout(r, ms));
let finished = false;
/** @type {WebSocket} */
let ws;

const cleanup = async code => {
  if (finished) return;
  finished = true;
  // Close via DevTools first (also stops the real browser process on Windows), then kill as a fallback
  try { if (ws && ws.readyState === 1) await Promise.race([send('Browser.close'), wait(2000)]); } catch {}
  try { chrome.kill(); } catch {}
  server.close();
  await wait(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
};

const fail = async message => { console.error(message); await cleanup(1); };
chrome.on('error', err => fail(`Could not start Chrome (${chromeBin}): ${err.message}. Set CHROME_BIN.`));
setTimeout(() => fail(`Timed out after ${timeout} ms`), timeout).unref();

// Wait for the DevTools endpoint. (On Windows the launched process hands off to a child and exits,
// so poll the HTTP endpoint instead of watching the process.)
let wsUrl;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await wait(250);
  }
}
if (!wsUrl) await fail(`Chrome did not start (${chromeBin}). Set CHROME_BIN to a Chrome/Chromium executable.`);

// Connect to the browser, then attach to a page target
ws = new WebSocket(/** @type {string} */ (wsUrl));
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let msgId = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    pageErrors.push(d.exception?.description || d.text);
  }
};
const send = (method, params = {}, sessionId) => new Promise(resolve => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const version = (await send('Browser.getVersion')).result;
console.log(`  Running tests in ${version.product}`);

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/index.html` }, sessionId);

const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  return r.result?.result?.value;
};

// Poll until mocha reports the end of the run
const started = Date.now();
let results;
while (!results) {
  await wait(500);
  results = await evaluate('window.__mochaResults || null');
  if (!results && pageErrors.length && Date.now() - started > 20000) {
    const ran = await evaluate('document.querySelectorAll("#mocha .test").length');
    if (!ran) await fail(`The test page failed to start:\n${pageErrors.join('\n')}`);
  }
}

const secs = ((results.duration || 0) / 1000).toFixed(1);
console.log(`\n  ${results.passes} passing, ${results.failures.length} failing, ${results.pending} pending (${secs}s)\n`);
results.failures.forEach((f, i) => console.log(`  ${i + 1}) ${f.title}\n     ${f.error}\n`));
await cleanup(results.failures.length ? 1 : 0);
