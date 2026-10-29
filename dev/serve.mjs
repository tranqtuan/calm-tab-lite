/**
 * DEV ONLY — static server for previewing the New Tab page outside Chrome's extension runtime.
 *   node dev/serve.mjs  →  http://localhost:5178/
 * Serves the project root (localhost only), injects the chrome.* shim into HTML pages,
 * and proxies RSS requests so feeds can be previewed without extension host permissions.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 5178;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://x');
  // Feed proxy (the extension itself fetches feeds from its service worker with host permissions).
  if (reqUrl.pathname === '/proxy') {
    try {
      const upstream = await fetch(reqUrl.searchParams.get('url'), { headers: { 'user-agent': 'Mozilla/5.0 CalmTab-dev' } });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) { res.writeHead(502).end(String(e)); }
    return;
  }
  let path = decodeURIComponent(reqUrl.pathname);
  if (path === '/') path = '/newtab.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    if (extname(file) === '.html') {
      body = body.toString().replace('<head>', '<head>\n  <script src="/dev/chrome-shim.js"></script>\n  <script type="module" src="/dev/sw-in-page.js"></script>');
    }
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    // Enforce the manifest's CSP on pages so policy violations show up here too
    // (minus frame-ancestors, so the preview pane can still embed the page).
    if (extname(file) === '.html') {
      const csp = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).content_security_policy?.extension_pages;
      if (csp) headers['content-security-policy'] = csp.replace(/;\s*frame-ancestors [^;]+/, '');
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Calm Tab preview → http://localhost:${PORT}/`));
