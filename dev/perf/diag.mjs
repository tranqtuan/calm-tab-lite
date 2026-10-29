// Diagnostic waterfall: every request (Network domain) + every chrome.storage call on a reloaded new tab.
// usage: node diag.mjs <extDir> <outJson> [--cold]  (--cold: disable the HTTP/module cache for the reload)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [extDir, outFile] = process.argv.slice(2);
const COLD = process.argv.includes('--cold');
// Chrome for Testing (or Chromium): branded Chrome ignores --load-extension. Override with CHROME=/path/to/binary.
const CHROME = process.env.CHROME ?? path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = fs.readFileSync(new URL('./bench.mjs', import.meta.url), 'utf8');
const PROBE = eval(src.match(/const STORAGE_PROBE = (`[\s\S]*?`);/)[1]);
const COLLECT = eval(src.match(/const COLLECT = (`[\s\S]*?`);/)[1]);

const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ctdiag-'));
const port = 9800 + Math.floor(Math.random() * 100);
const proc = spawn(CHROME, [`--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, `--load-extension=${extDir}`, `--disable-extensions-except=${extDir}`, '--no-first-run', '--no-default-browser-check', '--headless=new', '--window-size=1440,900', '--password-store=basic', '--use-mock-keychain', 'about:blank'], { stdio: 'ignore' });
let wsUrl; for (let i = 0; i < 150 && !wsUrl; i++) { await sleep(100); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const cb = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { cb.get(d.id)?.(d); cb.delete(d.id); } else events.push(d); };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; cb.set(i, (d) => res(d.result ?? d)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

await sleep(1500);
const { targetId } = await send('Target.createTarget', { url: 'chrome://newtab/' });
await sleep(6000); // first open warms the profile (install work, caches)
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Network.enable', {}, sessionId);
if (COLD) await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
await send('Page.enable', {}, sessionId);
await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE }, sessionId);
events.length = 0;
await send('Page.reload', { ignoreCache: COLD }, sessionId);
await sleep(5000);
const r = await send('Runtime.evaluate', { expression: COLLECT, returnByValue: true }, sessionId);
const reqs = new Map();
let t0;
for (const e of events) {
  const p = e.params;
  if (e.method === 'Network.requestWillBeSent') { t0 ??= p.timestamp; reqs.set(p.requestId, { url: p.request.url.replace(/^chrome-extension:\/\/[a-z]+\//, ''), type: p.type, start: p.timestamp, initiator: p.initiator?.url?.replace(/^chrome-extension:\/\/[a-z]+\//, '') ?? p.initiator?.type }); }
  if (e.method === 'Network.loadingFinished' && reqs.has(p.requestId)) Object.assign(reqs.get(p.requestId), { end: p.timestamp, bytes: p.encodedDataLength });
  if (e.method === 'Network.responseReceived' && reqs.has(p.requestId)) reqs.get(p.requestId).cached = p.response.fromDiskCache || p.response.fromServiceWorker || p.response.fromPrefetchCache;
}
const list = [...reqs.values()].map((x) => ({ ...x, s: Math.round((x.start - t0) * 1000), e: x.end ? Math.round((x.end - t0) * 1000) : null })).sort((a, b) => a.s - b.s);
fs.writeFileSync(outFile, JSON.stringify({ requests: list, page: r.result.value }, null, 1));
await send('Browser.close');
setTimeout(() => process.exit(0), 1500);
console.log('wrote', outFile, list.length, 'requests');
