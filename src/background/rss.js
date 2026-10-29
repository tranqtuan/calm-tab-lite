/**
 * RSS/Atom fetching in the service worker (avoids CORS in the page).
 * Refreshes every 30 minutes via chrome.alarms and caches results in
 * chrome.storage.local under "news:cache" → { at, vn: [...], tech: [...], errors: {...} }.
 * Service workers have no DOMParser, so feeds are parsed with a small tolerant parser.
 */
import { getSettings, getLocal, setLocal } from '../shared/storage.js';
import { safeUrl } from '../shared/util.js';

export const NEWS_KEY = 'news:cache';
export const RSS_ALARM = 'rss-refresh';
const TTL = 30 * 60 * 1000;
const PER_TAB = 40;
export const NEWS_VERSION = 4; // bump when the cached item shape changes (v2: images, v3: article images, v4: AI tab)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

function decode(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '') // strip any markup inside titles
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
  return pick?.match(/href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&') ?? '';
}

/** Only https image URLs are kept (mixed content and tracking pixels are dropped). */
function httpsImage(url) {
  const safe = safeUrl(url?.trim().replace(/&amp;/g, '&'));
  return safe?.startsWith('https://') && !/pixel|1x1|spacer|feedburner/i.test(safe) ? safe : null;
}

/** Item image from media:content, media:thumbnail, an image enclosure, or the first <img> in the HTML. */
function itemImage(block) {
  const attr = (re) => block.match(re)?.[1];
  const media = attr(/<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
  const mediaIsImage = media && !/\.(mp4|mp3|webm|m4a)(\?|$)/i.test(media);
  const candidates = [
    mediaIsImage ? media : null,
    attr(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i),
    attr(/<enclosure\b(?=[^>]*\btype=["']image\/)[^>]*\burl=["']([^"']+)["']/i),
    attr(/<enclosure\b[^>]*\burl=["']([^"']+\.(?:jpe?g|png|webp|gif)(?:\?[^"']*)?)["']/i),
  ];
  // Descriptions may hold raw HTML (inside CDATA) or entity-escaped HTML.
  const html = block.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  candidates.push(html.match(/<img\b[^>]*\b(?:data-src|src)=["']([^"']+)["']/i)?.[1]);
  for (const c of candidates) {
    const url = c && httpsImage(c);
    if (url) return url;
  }
  return null;
}

/** Plain text of the first paragraph of an item's description/content (used for taglines). */
export function firstParagraph(block) {
  const raw = block.match(/<(description|content|summary)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? '';
  const html = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? html;
  return decode(p).slice(0, 160);
}

export function parseFeed(xml, feed) {
  const items = [];
  for (const [block] of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const title = tag(block, 'title');
    const link = safeUrl(tag(block, 'link') || atomLink(block) || tag(block, 'guid'));
    const dateText = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const time = Date.parse(dateText) || 0;
    if (!title || !link) continue;
    const item = { title, link, time, source: feed.name, image: itemImage(block) };
    if (feed.tab === 'ai') item.summary = firstParagraph(block).slice(0, 280);
    items.push(item);
    if (items.length >= 400) break; // some lab feeds carry their whole archive
  }
  return items;
}

// ---------- AI News: keyword filter, topic tags, cross-outlet grouping ----------
// "AI" must be upper-case: in Vietnamese "ai" also means "who".
const AI_CASE = /(?:^|[^\p{L}])(AI|A\.I\.|LLMs?|GPT[-\s]?\d*|AGI)(?:[^\p{L}]|$)/u;
const AI_WORDS = /artificial intelligence|machine learning|deep learning|neural net|language model|chatgpt|openai|anthropic|claude|gemini|copilot|llama|mistral|deepseek|grok|chatbot|generative|diffusion model|transformer|agentic|trí tuệ nhân tạo|học máy|học sâu|mô hình ngôn ngữ|trợ lý ảo/i;
export const isAI = (text) => AI_CASE.test(text) || AI_WORDS.test(text);

const TOPIC_RULES = [
  ['Policy & Safety', /\b(regulat\w*|law(s|suit)?|policy|safety|copyright|ban(s|ned)?|AI Act|government|senate|congress|court|privacy|deepfake|misinformation|ethic\w*)\b|luật|quy định|an toàn/i],
  ['Business', /\b(funding|raises?|raised|valuation|acqui\w+|deal|revenue|IPO|invest\w*|billion|startup|layoffs?|earnings|partnership)\b|tỷ USD|gọi vốn|đầu tư/i],
  ['Research', /\b(paper|research\w*|study|scientists?|arxiv|dataset|benchmark\w*|breakthrough)\b|nghiên cứu/i],
  ['New Models', /\b(GPT-?\d[\w.]*|Gemini \d|Claude (Opus|Sonnet|Haiku|Fable)|Llama \d|new model|open[- ]weights?|frontier model|model release|releases? .{0,20}model)\b|mô hình mới/i],
  ['Tools & Products', /\b(app|tool|feature|update|rolls? out|launch\w*|available|API|plugin|assistant|agents?|browser|copilot|integration)\b|ra mắt|tính năng|ứng dụng/i],
];

export function tagsFor(item, feed) {
  const text = `${item.title} ${item.summary ?? ''}`;
  const tags = [];
  if (feed?.vn) tags.push('Vietnam AI');
  if (feed?.research) tags.push('Research');
  for (const [tag, re] of TOPIC_RULES) {
    if (tags.length >= 2) break;
    if (!tags.includes(tag) && re.test(text)) tags.push(tag);
  }
  return tags;
}

const STOP = new Set('the a an and or of to in on for with at by from is are be as its it this that new how why what you your will can about after over into says say just more than now up out not their they we our has have was'.split(' '));
const tokens = (title) => new Set(title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** Merge stories that several outlets cover into one item with `also: [{source, link}]`. */
export function groupStories(items) {
  const out = [];
  for (const it of items) {
    const tk = tokens(it.title);
    const match = out.find((g) => {
      if (Math.abs(g.time - it.time) > 36 * 3600 * 1000) return false;
      let shared = 0;
      for (const w of tk) if (g._tk.has(w)) shared++;
      return shared >= 3 && shared / Math.min(tk.size, g._tk.size) >= 0.5;
    });
    if (match && match.source !== it.source) {
      match.also ??= [];
      if (!match.also.some((a) => a.source === it.source)) match.also.push({ source: it.source, link: it.link });
      if (!match.image && it.image) match.image = it.image;
      for (const t of it.tags ?? []) if (!match.tags.includes(t) && match.tags.length < 3) match.tags.push(t);
    } else if (!match) {
      out.push({ ...it, _tk: tk });
    }
  }
  return out.map(({ _tk, ...rest }) => rest);
}


async function fetchText(url) {
  // Skip feeds Chrome hasn't granted access to (avoids CORS errors); the error is surfaced per feed.
  const origin = `${new URL(url).origin}/*`;
  if (!(await chrome.permissions.contains({ origins: [origin] }))) throw new Error('no site access');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** `texts` shares one download per URL across feeds (e.g. Genk feeds both Tech and AI). */
async function fetchFeed(feed, texts) {
  if (!texts.has(feed.url)) texts.set(feed.url, fetchText(feed.url));
  let items = parseFeed(await texts.get(feed.url), feed).sort((a, b) => b.time - a.time);
  // Mixed feeds: keep only stories whose headline is about AI (summaries mention AI too loosely).
  if (feed.filter === 'ai') items = items.filter((it) => isAI(it.title));
  if (feed.tab === 'ai') items = items.map((it) => ({ ...it, tags: tagsFor(it, feed) }));
  return items.slice(0, 25);
}

// ---------- Article share images (og:image) for items whose feed has none ----------
const OG_KEY = 'news:og'; // { [link]: { u: imageUrl|null, at } }
const OG_TTL = 3 * 24 * 60 * 60 * 1000;
const OG_PER_TAB = 15; // only the stories the card can actually show

/** Read og:image / twitter:image from the article's <head>. */
async function articleImage(link) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(link, { signal: controller.signal, credentials: 'omit', headers: { accept: 'text/html' } });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '')) return null;
    const html = await res.text();
    const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || 300000);
    const metas = {};
    for (const [tagText] of head.matchAll(/<meta\b[^>]*>/gi)) {
      const key = tagText.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
      const content = tagText.match(/\bcontent=["']([^"']+)["']/i)?.[1];
      if (key && content && !(key in metas)) metas[key] = content;
    }
    const raw = metas['og:image:secure_url'] ?? metas['og:image'] ?? metas['twitter:image'] ?? metas['twitter:image:src'];
    if (!raw || /logo|favicon|default[-_]?image|placeholder/i.test(raw)) return null;
    return httpsImage(new URL(raw.replace(/&amp;/g, '&'), link).href);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` over items with at most `n` in flight. */
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/**
 * Give image-less stories their article's share image. Only sites Calm Tab already
 * has access to are contacted, plus every site if the user opted in (Settings → News).
 * Returns true if anything changed.
 */
async function addArticleImages(next, allSites) {
  const cache = await getLocal(OG_KEY, {});
  const broad = allSites && (await chrome.permissions.contains({ origins: ['https://*/*'] }));
  let changed = false;
  const todo = [];
  for (const tab of ['vn', 'tech', 'ai']) {
    for (const it of next[tab].slice(0, OG_PER_TAB)) {
      if (it.image || !it.link.startsWith('https://')) continue;
      const hit = cache[it.link];
      if (hit && Date.now() - hit.at < OG_TTL) { if (hit.u) { it.image = hit.u; changed = true; } }
      else todo.push(it);
    }
  }
  await pool(todo, 4, async (it) => {
    const origin = `${new URL(it.link).origin}/*`;
    if (!broad && !(await chrome.permissions.contains({ origins: [origin] }))) return;
    const u = await articleImage(it.link);
    cache[it.link] = { u, at: Date.now() };
    if (u) { it.image = u; changed = true; }
  });
  for (const [link, v] of Object.entries(cache)) if (Date.now() - v.at > OG_TTL) delete cache[link];
  await setLocal(OG_KEY, cache);
  return changed;
}

let inFlight = null;

/** Fetch all enabled feeds (in parallel) unless the cache is fresh. */
export function refreshNews(force = false) {
  // A forced refresh (e.g. right after new site access was granted) must not reuse an older in-flight run.
  if (force && inFlight) return inFlight.then(() => refreshNews(true));
  inFlight ??= (async () => {
    try {
      const cache = await getLocal(NEWS_KEY);
      if (!force && cache?.v === NEWS_VERSION && Date.now() - cache.at < TTL) return cache;
      const { feeds, newsImagesAllSites } = await getSettings();
      const enabled = feeds.filter((f) => f.enabled);
      const texts = new Map();
      const results = await Promise.allSettled(enabled.map((f) => fetchFeed(f, texts)));
      const next = { v: NEWS_VERSION, at: Date.now(), vn: [], tech: [], ai: [], errors: {} };
      results.forEach((r, i) => {
        const feed = enabled[i];
        if (r.status === 'fulfilled') next[feed.tab]?.push(...r.value);
        else {
          next.errors[feed.id] = String(r.reason?.message ?? r.reason);
          // Keep this feed's previous items rather than losing them on a transient failure.
          next[feed.tab]?.push(...(cache?.[feed.tab] ?? []).filter((it) => it.source === feed.name));
        }
      });
      for (const tab of ['vn', 'tech', 'ai']) {
        const seen = new Set();
        next[tab] = next[tab]
          .filter((it) => !seen.has(it.link) && seen.add(it.link))
          .sort((a, b) => b.time - a.time);
        if (tab === 'ai') {
          // Balance the mix: at most 8 stories per outlet, then merge duplicates across outlets.
          const perSource = {};
          next[tab] = groupStories(next[tab].filter((it) => (perSource[it.source] = (perSource[it.source] ?? 0) + 1) <= 8));
        }
        next[tab] = next[tab].slice(0, tab === 'ai' ? 60 : PER_TAB);
      }
      // Headlines first (fast), then fill missing pictures from the articles and save again.
      await setLocal(NEWS_KEY, next);
      if (await addArticleImages(next, newsImagesAllSites)) await setLocal(NEWS_KEY, next);
      return next;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function initRss() {
  chrome.alarms.get(RSS_ALARM).then((a) => {
    if (!a) chrome.alarms.create(RSS_ALARM, { periodInMinutes: 30, delayInMinutes: 0.1 });
  });
}
