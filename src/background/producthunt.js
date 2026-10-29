/**
 * Product Hunt "top products today", fetched hourly by the service worker.
 *  - With a developer token (Settings → News): API v2 GraphQL, today's featured
 *    launches ranked by votes (Product Hunt's day runs on US Pacific time).
 *  - Without one: the public Atom feed (newest launches, no vote counts or images).
 * Cache: "ph:cache" → { at, mode: 'api'|'feed', items: [{ name, tagline, url, votes, thumb }] }
 */
import { getLocal, setLocal } from '../shared/storage.js';
import { safeUrl } from '../shared/util.js';
import { firstParagraph } from './rss.js';

export const PH_KEY = 'ph:cache';
export const PH_TOKEN_KEY = 'producthunt:token';
export const PH_ALARM = 'producthunt-refresh';
const TTL = 60 * 60 * 1000;
/** Sites this widget reads. Chrome can withhold them (Site access setting or browser policy). */
export const PH_ORIGINS = ['https://www.producthunt.com/*', 'https://api.producthunt.com/*'];

/** ISO timestamp of midnight today in America/Los_Angeles. */
function pacificMidnight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'longOffset',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T00:00:00${offset}`;
}

async function fromApi(token) {
  const query = `query Today($after: DateTime!) {
    posts(first: 10, order: VOTES, featured: true, postedAfter: $after) {
      edges { node { name tagline votesCount url thumbnail { url } } }
    }
  }`;
  const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { after: pacificMidnight() } }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Invalid Product Hunt token' : `HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.data.posts.edges.map(({ node: n }) => ({
    name: n.name, tagline: n.tagline, url: safeUrl(n.url), votes: n.votesCount,
    thumb: n.thumbnail?.url?.startsWith('https://') ? n.thumbnail.url : null,
  })).filter((p) => p.url);
}

async function fromFeed() {
  const res = await fetch('https://www.producthunt.com/feed', { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const [block] of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const name = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const url = safeUrl(block.match(/<link\b[^>]*href="([^"]+)"/i)?.[1]);
    const published = Date.parse(block.match(/<published>([^<]+)<\/published>/i)?.[1] ?? '') || 0;
    if (name && url) items.push({ name: name.replace(/&amp;/g, '&'), tagline: firstParagraph(block), url, votes: null, thumb: null, published });
  }
  return items.sort((a, b) => b.published - a.published).slice(0, 10);
}

let inFlight = null;
export function refreshProductHunt(force = false) {
  // A forced refresh (e.g. right after access was granted) must not reuse an older in-flight result.
  if (force && inFlight) return inFlight.then(() => refreshProductHunt(true));
  inFlight ??= (async () => {
    try {
      const cache = await getLocal(PH_KEY);
      if (!force && cache && !cache.needsPermission && Date.now() - cache.at < TTL) return cache;
      // Without host access Chrome would block the request as CORS; ask the page to request it instead.
      if (!(await chrome.permissions.contains({ origins: PH_ORIGINS }))) {
        const blocked = { at: 0, mode: 'feed', items: cache?.items ?? [], needsPermission: true };
        await setLocal(PH_KEY, blocked);
        return blocked;
      }
      const token = await getLocal(PH_TOKEN_KEY);
      let next;
      if (token) {
        try {
          next = { at: Date.now(), mode: 'api', items: await fromApi(token) };
        } catch (err) {
          // Bad/expired token or API outage: still show something, and say why.
          next = { at: Date.now(), mode: 'feed', error: String(err.message ?? err), items: await fromFeed() };
        }
      } else {
        next = { at: Date.now(), mode: 'feed', items: await fromFeed() };
      }
      await setLocal(PH_KEY, next);
      return next;
    } catch (err) {
      const cache = await getLocal(PH_KEY);
      return { at: 0, mode: 'feed', items: cache?.items ?? [], error: String(err.message ?? err) };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function initProductHunt() {
  chrome.alarms.get(PH_ALARM).then((a) => {
    if (!a) chrome.alarms.create(PH_ALARM, { periodInMinutes: 60, delayInMinutes: 0.2 });
  });
}
