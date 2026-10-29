// Cold/warm new-tab benchmark for an unpacked MV3 extension, over raw CDP (no dependencies).
// usage: node bench.mjs <extDir> <outJson> [runs=5] [--headed]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [extDir, outFile, runsArg] = process.argv.slice(2);
const RUNS = Number(runsArg ?? 5);
const HEADED = process.argv.includes('--headed');
// Chrome for Testing (or Chromium): branded Chrome ignores --load-extension. Override with CHROME=/path/to/binary.
const CHROME = process.env.CHROME ?? path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Records chrome.storage calls (area, method, keys, start, duration), layout shifts and LCP from the first line of the page.
const STORAGE_PROBE = `(() => {
  window.__st = [];
  const wrap = (area) => { const o = globalThis.chrome?.storage?.[area]; if (!o) return; for (const m of ['get', 'set']) { const f = o[m].bind(o);
    o[m] = (...a) => { const t = performance.now(); const p = f(...a); const k = a[0]; const rec = { area, m, keys: typeof k === 'string' ? k : Array.isArray(k) ? k.length + ' keys' : k && typeof k === 'object' ? Object.keys(k).slice(0, 3).join(',') : String(k), t: +t.toFixed(1) };
      window.__st.push(rec); Promise.resolve(p).then(() => { rec.d = +(performance.now() - t).toFixed(1); }, () => {}); return p; }; } };
  wrap('sync'); wrap('local');
  window.__ls = []; new PerformanceObserver((l) => window.__ls.push(...l.getEntries().map((e) => ({ v: e.value, t: e.startTime, input: e.hadRecentInput, src: e.sources?.map((s) => (s.node?.className || s.node?.nodeName) + ' ' + [s.previousRect, s.currentRect].map((r) => [r.x, r.y, r.width, r.height].map(Math.round).join(',')).join('→')).join(' | ') })))).observe({ type: 'layout-shift', buffered: true });
  window.__lcp = []; new PerformanceObserver((l) => window.__lcp.push(...l.getEntries().map((e) => ({ t: e.startTime, el: e.element?.className || e.element?.tagName || e.url })))).observe({ type: 'largest-contentful-paint', buffered: true });
  window.__lt = []; try { new PerformanceObserver((l) => window.__lt.push(...l.getEntries().map((e) => [+e.startTime.toFixed(0), +e.duration.toFixed(0)]))).observe({ type: 'longtask', buffered: true }); } catch {}
})();`;

const COLLECT = `(() => {
  const n = performance.getEntriesByType('navigation')[0] ?? {};
  const mk = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('ct:')).map((m) => [m.name.slice(3), +m.startTime.toFixed(1)]));
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, +p.startTime.toFixed(1)]));
  const res = performance.getEntriesByType('resource').map((r) => ({ n: r.name.replace(/^chrome-extension:\\/\\/[a-z]+\\//, ''), type: r.initiatorType, s: +r.startTime.toFixed(1), e: +r.responseEnd.toFixed(1), size: r.decodedBodySize }));
  return { nav: { resp: +(n.responseEnd ?? 0).toFixed(1), domInteractive: +(n.domInteractive ?? 0).toFixed(1), dcl: +(n.domContentLoadedEventEnd ?? 0).toFixed(1), load: +(n.loadEventEnd ?? 0).toFixed(1) },
    marks: mk, paint, cls: +(window.__ls ?? []).filter((x) => !x.input).reduce((a, x) => a + x.v, 0).toFixed(4), shifts: (window.__ls ?? []).filter((x) => !x.input).map((x) => [+x.t.toFixed(0), +x.v.toFixed(4), x.src]),
    lcp: (window.__lcp ?? []).map((x) => [+x.t.toFixed(0), x.el]), storage: window.__st ?? [], res, longTasks: window.__lt ?? null };
})()`;

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.cb = new Map(); this.handlers = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.cb.has(d.id)) { const { res, rej } = this.cb.get(d.id); this.cb.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
      else this.handlers.forEach((h) => h(d));
    };
  }
  send(method, params = {}, sessionId) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params, sessionId })); return new Promise((res, rej) => this.cb.set(id, { res, rej })); }
  on(fn) { this.handlers.push(fn); return () => { this.handlers = this.handlers.filter((h) => h !== fn); }; }
}

async function launch(profile) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const args = [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--load-extension=${extDir}`, `--disable-extensions-except=${extDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--window-size=1440,900', '--disable-features=Translate,MediaRouter', '--password-store=basic', '--use-mock-keychain',
    ...(HEADED ? ['--window-position=40,40'] : ['--headless=new']), 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'ignore'] });
  let wsUrl;
  for (let i = 0; i < 150 && !wsUrl; i++) { await sleep(100); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {} }
  if (!wsUrl) { proc.kill(); throw new Error('chrome did not start'); }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);
  return { proc, cdp, close: async () => { try { await cdp.send('Browser.close'); } catch {} await new Promise((r) => { proc.once('exit', r); setTimeout(() => { proc.kill('SIGKILL'); r(); }, 5000); }); } };
}

async function findSW(cdp) {
  for (let i = 0; i < 100; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    if (sw) return sw;
    await sleep(100);
  }
  return null;
}

async function swMarks(cdp) {
  const sw = await findSW(cdp);
  if (!sw) return { error: 'no sw' };
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    const { result } = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({ marks: Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, +m.startTime.toFixed(1)])), origin: performance.timeOrigin })`, returnByValue: true }, sessionId);
    await cdp.send('Target.detachFromTarget', { sessionId });
    return JSON.parse(result.value);
  } catch (e) { return { error: e.message }; }
}

/** Open chrome://newtab paused, install the probes, resume, wait for ct:idle (or 8 s), collect. */
const PROBE = process.env.PROBE === '1';
async function openTab(cdp) {
  let targetId, sessionId;
  if (PROBE) { // diagnostic: pause the new tab to install the storage probe (adds latency; not for timing)
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'page', exclude: false }] });
    let off;
    const attached = new Promise((resolve) => { off = cdp.on((m) => { if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'page' && m.params.waitingForDebugger) resolve(m.params); }); });
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'chrome://newtab/' }));
    ({ sessionId } = await attached); off();
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: STORAGE_PROBE }, sessionId);
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  } else { // timing: open the tab untouched, attach afterwards (all entries are buffered)
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'chrome://newtab/' }));
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  }
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    try {
      const { result } = await cdp.send('Runtime.evaluate', { expression: `location.protocol + '|' + !!performance.getEntriesByName('ct:idle').length`, returnByValue: true }, sessionId);
      if (result.value === 'chrome-extension:|true') break;
    } catch {}
  }
  await sleep(1500); // let late layout shifts and the photo land
  if (!PROBE) await cdp.send('Runtime.evaluate', { expression: STORAGE_PROBE }, sessionId); // just the buffered observers
  await sleep(50);
  const { result } = await cdp.send('Runtime.evaluate', { expression: COLLECT, returnByValue: true }, sessionId);
  if (PROBE) await cdp.send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
  return { targetId, data: result.value };
}

const out = { ext: extDir, runs: RUNS, headed: HEADED, scenarios: { install: [], firstTab: [], warm: [] } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbench-'));
const only = process.env.ONLY;

// A) right after installing / reloading: brand-new profile, the extension installs, first new tab.
if (!only || only === 'install') for (let i = 0; i < RUNS; i++) {
  const b = await launch(path.join(tmp, `install-${i}`));
  await findSW(b.cdp);
  const tab = await openTab(b.cdp);
  tab.data.sw = await swMarks(b.cdp);
  out.scenarios.install.push(tab.data);
  await b.close();
  process.stderr.write(`install ${i + 1}/${RUNS}\n`);
}
// B) first tab after Chrome starts (extension installed and used before), then C) warm repeat tabs.
const base = path.join(tmp, 'base');
{ const b = await launch(base); await findSW(b.cdp); await openTab(b.cdp); await sleep(10000); await b.close(); }
if (!only || only === 'start') for (let i = 0; i < RUNS; i++) {
  const b = await launch(base);
  const tab = await openTab(b.cdp);
  tab.data.sw = await swMarks(b.cdp);
  out.scenarios.firstTab.push(tab.data);
  await b.cdp.send('Target.closeTarget', { targetId: tab.targetId });
  await sleep(1000);
  const w = await openTab(b.cdp);
  out.scenarios.warm.push(w.data);
  await b.close();
  process.stderr.write(`firstTab+warm ${i + 1}/${RUNS}\n`);
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', outFile);
