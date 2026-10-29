/**
 * Awwwards "Sites of the day", read from Awwwards' own public feed (only the 3 latest picks are kept) by the
 * service worker a few times a day. Nothing is sent: it's a plain GET without cookies.
 * The feed's host is an optional permission, asked for in the card the first time.
 * Cache: "sites:cache" → { at, items: [{ id, title, link, desc, date, image }] } (newest first)
 *  image: Awwwards' original screenshot; the page uses their smaller preview sizes (see thumbOf).
 */
import { getLocal, setLocal } from '../shared/storage.js';
import { safeUrl } from '../shared/util.js';

export const SITES_KEY = 'sites:cache';
export const SITES_ALARM = 'sites-refresh';
export const SITES_FEED = 'https://feeds.feedburner.com/awwwards-sites-of-the-day';
export const SITES_COUNT = 3;
export const SITES_ORIGINS = ['https://feeds.feedburner.com/*'];
const TTL = 3 * 60 * 60 * 1000; // a new pick lands once a day; checking every 3 h catches it early

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
const text = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ')
  .trim();
const field = (block, name) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '';

/** Only Awwwards' own https images are kept. */
function awwwardsImage(url) {
  const safe = safeUrl(url);
  try { return safe && /(^|\.)awwwards\.com$/.test(new URL(safe).hostname) && safe.startsWith('https://') ? safe : null; } catch { return null; }
}

export function parseSites(xml) {
  const items = [];
  for (const [block] of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const link = safeUrl(text(field(block, 'link')) || text(field(block, 'guid')));
    const title = text(field(block, 'title'));
    if (!link || !title || !link.startsWith('https://www.awwwards.com/')) continue;
    const raw = field(block, 'description').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const image = awwwardsImage(raw.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]);
    const date = Date.parse(text(field(block, 'pubDate'))) || null;
    items.push({ id: link.replace(/\/+$/, '').split('/').pop(), title, link, desc: text(raw).slice(0, 280), date, image });
  }
  return items.sort((a, b) => (b.date ?? 0) - (a.date ?? 0)).slice(0, SITES_COUNT);
}

const hasAccess = () => chrome.permissions.contains({ origins: SITES_ORIGINS }).catch(() => false);

/** Fetch the feed if the cache is older than TTL (or `force`). Returns the cache. */
export async function refreshSites(force = false) {
  const cache = await getLocal(SITES_KEY);
  if (!(await hasAccess())) {
    const next = { ...(cache ?? { items: [] }), needsPermission: true };
    if (!cache?.needsPermission) await setLocal(SITES_KEY, next);
    return next;
  }
  if (!force && cache?.at && !cache.needsPermission && Date.now() - cache.at < TTL) return cache;
  try {
    const res = await fetch(SITES_FEED, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseSites(await res.text());
    if (!items.length) throw new Error('The feed had no sites');
    const next = { at: Date.now(), items };
    await setLocal(SITES_KEY, next);
    return next;
  } catch (err) {
    // Offline or the feed is down: keep the last picks, note the error.
    const next = { ...(cache ?? { items: [] }), needsPermission: false, error: String(err.message ?? err), tried: Date.now() };
    await setLocal(SITES_KEY, next);
    return next;
  }
}

export function initSites() {
  chrome.alarms.get(SITES_ALARM).then((a) => { if (!a) chrome.alarms.create(SITES_ALARM, { delayInMinutes: 5, periodInMinutes: 180 }); });
}
