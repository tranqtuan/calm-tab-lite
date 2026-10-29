/**
 * News: Vietnam / Tech / AI tabs. Reads the cache written by the service worker and asks
 * it to refresh when stale. Titles are rendered as text only.
 *
 * AI tab: topic chips (with hidden topics and muted keywords from Settings), stories
 * grouped across outlets ("Covered by 3 sources"), a "Read later" list, and an unread dot
 * for important new stories. Reading AI News counts as Learning in Time & focus.
 */
import { card, h, render, iconButton, placeholder, toast, sizeOf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal, onLocalChanged } from '../shared/storage.js';
import { timeAgo } from '../shared/util.js';
import { AI_TOPICS } from '../shared/defaults.js';

const KEY = 'news:cache';
const TAB_KEY = 'news:tab';
const LATER_KEY = 'ainews:later'; // [{ title, link, source, time, read }]
const SEEN_KEY = 'ainews:lastSeen';
const OPENED_KEY = 'ainews:opened'; // { url: timestamp } — lets the tracker count reading as Learning
const STALE = 30 * 60 * 1000;
const COLLAPSED = 5;
const EXPANDED = 15;
const TABS = [['vn', 'Vietnam'], ['tech', 'Tech'], ['ai', 'AI']];

/**
 * Image box with reserved space (no layout shift): lazy-loaded, fades in when ready.
 * If the image fails, the soft placeholder tile simply stays.
 */
export function thumb(src, cls) {
  const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
  img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
  return h('span', { class: `img-box ${cls}` }, img);
}

/**
 * Fallback thumbnail: the site's icon from Chrome's own favicon cache (the "favicon"
 * permission — no network request), on a soft tile; the source's initial if Chrome has none.
 */
function siteTile(it) {
  const tile = h('span', { class: 'img-box news-thumb site-tile', 'aria-hidden': 'true' },
    h('span', { class: 'site-initial' }, (it.source || '?').trim().charAt(0).toUpperCase()));
  try {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', it.link);
    url.searchParams.set('size', '32');
    const img = h('img', { src: url.href, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
    img.addEventListener('load', () => { img.classList.add('loaded'); tile.classList.add('has-icon'); }, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    tile.append(img);
  } catch { /* initial only */ }
  return tile;
}

export default {
  id: 'news',
  create(ctx) {
    const { el, body, actions, setGlance, setFresh } = card('news', 'News', 'news');
    let cache = null;
    let tab = 'vn';
    let expanded = false;
    let loading = false;
    let topic = 'all'; // AI tab filter: 'all' | topic | 'saved'
    let later = [];
    let lastSeen = 0;

    const tabs = h('div', { class: 'segmented news-tabs', role: 'tablist' });
    const chips = h('div', { class: 'news-chips' });
    const list = h('div', {});
    const notice = h('div', {}); // e.g. "3 AI sources need access · Allow"
    body.append(tabs, notice, chips, list);

    const refreshBtn = iconButton('refresh', 'Refresh news', () => refresh(true));
    // Refresh lives in the card menu (right-click); feeds also refresh every 30 minutes.

    const isImportant = (it) => (it.also?.length ?? 0) > 0 || it.tags?.includes('New Models');
    const unreadAI = () => (cache?.ai ?? []).some((it) => it.time > lastSeen && isImportant(it));

    function drawTabs() {
      render(tabs, TABS.map(([id, label]) =>
        h('button', {
          type: 'button', role: 'tab', class: id === tab ? 'active' : '', 'aria-selected': String(id === tab),
          onclick: () => { tab = id; expanded = false; setLocal(TAB_KEY, id); if (id === 'ai') markSeen(); draw(); },
        }, label, id === 'ai' && tab !== 'ai' && unreadAI() ? h('span', { class: 'unread-dot', 'aria-label': 'New stories' }) : null)));
    }

    function markSeen() {
      lastSeen = Date.now();
      setLocal(SEEN_KEY, lastSeen);
    }

    /** AI-tab filtering: hidden topics, muted keywords, chip selection. */
    function aiItems() {
      const { hiddenTopics = [], muted = [] } = ctx.settings.aiNews ?? {};
      const mutedRe = muted.length ? new RegExp(muted.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : null;
      let items = (cache?.ai ?? []).filter((it) => !(it.tags ?? []).some((t) => hiddenTopics.includes(t)) && !(mutedRe && mutedRe.test(`${it.title} ${it.summary ?? ''}`)));
      if (topic === 'saved') return later;
      if (topic !== 'all') items = items.filter((it) => it.tags?.includes(topic));
      return items;
    }

    function drawChips() {
      if (tab !== 'ai') return render(chips);
      const { hiddenTopics = [] } = ctx.settings.aiNews ?? {};
      const unreadLater = later.filter((l) => !l.read).length;
      render(chips,
        [['all', 'All'], ...AI_TOPICS.filter((t) => !hiddenTopics.includes(t)).map((t) => [t, t])].map(([id, label]) =>
          h('button', { type: 'button', class: `chip ${topic === id ? 'on' : ''}`, onclick: () => { topic = id; expanded = false; draw(); } }, label)),
        h('button', { type: 'button', class: `chip ${topic === 'saved' ? 'on' : ''}`, onclick: () => { topic = topic === 'saved' ? 'all' : 'saved'; draw(); } },
          icon('bookmark', 11), 'Saved', unreadLater ? h('span', { class: 'chip-count' }, String(unreadLater)) : null));
    }

    function openedFromAI(link) {
      getLocal(OPENED_KEY, {}).then((m) => {
        const now = Date.now();
        for (const [k, v] of Object.entries(m)) if (now - v > 12 * 3600 * 1000) delete m[k];
        m[link] = now;
        setLocal(OPENED_KEY, m);
      });
      if (later.some((l) => l.link === link && !l.read)) {
        later = later.map((l) => (l.link === link ? { ...l, read: true } : l));
        setLocal(LATER_KEY, later);
      }
    }

    async function toggleLater(it) {
      const saved = later.some((l) => l.link === it.link);
      later = saved ? later.filter((l) => l.link !== it.link) : [{ title: it.title, link: it.link, source: it.source, time: it.time, image: it.image, tags: it.tags, summary: it.summary, read: false }, ...later].slice(0, 100);
      await setLocal(LATER_KEY, later);
      toast(saved ? 'Removed from Read later' : 'Saved to Read later');
      draw();
    }

    function storyActions(it) {
      const saved = later.some((l) => l.link === it.link);
      return h('div', { class: 'news-actions' },
        tab === 'ai' || topic === 'saved'
          ? h('button', { class: `icon-btn small ${saved ? 'active' : ''}`, type: 'button', title: saved ? 'Remove from Read later' : 'Read later', 'aria-label': 'Read later', onclick: () => toggleLater(it) }, icon('bookmark', 14))
          : null);
    }

    function storyRow(it, i) {
      const hero = i === 0 && it.image && topic !== 'saved';
      const tags = tab === 'ai' && it.tags?.length ? h('span', { class: 'news-tag' }, it.tags[0]) : null;
      const also = it.also?.length
        ? h('details', { class: 'news-also' },
            h('summary', {}, `Covered by ${it.also.length + 1} sources`),
            h('ul', {}, [{ source: it.source, link: it.link }, ...it.also].map((a) =>
              h('li', {}, h('a', { href: a.link, target: '_blank', rel: 'noopener noreferrer', onclick: () => tab === 'ai' && openedFromAI(a.link) }, a.source)))))
        : null;
      return h('li', { class: `news-item ${hero ? 'hero' : ''} has-image ${it.read ? 'read' : ''}` },
        h('a', { href: it.link, target: '_blank', rel: 'noopener noreferrer', onclick: () => tab === 'ai' && openedFromAI(it.link) },
          it.image ? thumb(it.image, hero ? 'news-hero' : 'news-thumb') : siteTile(it),
          h('div', { class: 'news-text' },
            h('span', { class: 'news-title' }, it.title),
            h('div', { class: 'news-meta' }, tags, `${it.source}${it.time ? ' · ' + timeAgo(it.time) : ''}`),
          ),
        ),
        also,
        storyActions(it));
    }

    /** Chrome withholds site access added by an update: request it from this click. */
    function allowFeeds(feeds) {
      return chrome.permissions.request({ origins: [...new Set(feeds.map((f) => `${new URL(f.url).origin}/*`))] })
        .then(async (ok) => {
          if (!ok) return ctx.toast('Chrome didn’t allow access — your browser may be managed by a policy');
          // Refetch right here so the newly allowed sources show even if the worker is behind.
          loading = true; refreshBtn.classList.add('spin');
          try { const { refreshNews } = await import('../background/rss.js'); const fresh = await refreshNews(true); if (fresh?.at) cache = fresh; }
          finally { loading = false; refreshBtn.classList.remove('spin'); draw(); }
          ctx.toast('Sources allowed');
        })
        .catch(() => ctx.toast('Site access is blocked on this browser'));
    }

    function draw() {
      if (cache?.at) setFresh(cache.at, 60 * 60 * 1000);
      drawTabs();
      drawChips();
      const items = tab === 'ai' ? aiItems() : cache?.[tab] ?? [];
      const blocked = ctx.settings.feeds.filter((f) => f.enabled && f.tab === tab && cache?.errors?.[f.id] === 'no site access');
      // Some sources blocked but others loaded: a slim notice instead of silently missing them.
      render(notice);
      if (items.length && blocked.length) {
        render(notice, h('div', { class: 'feed-access' },
          h('span', {}, `${blocked.length} ${tab === 'ai' ? 'AI ' : ''}source${blocked.length > 1 ? 's' : ''} need${blocked.length > 1 ? '' : 's'} access`),
          h('button', { class: 'link-btn', type: 'button', title: blocked.map((f) => f.name).join(', '), onclick: () => allowFeeds(blocked) }, 'Allow')));
      }
      if (!items.length && blocked.length && topic !== 'saved') {
        // Chrome withheld site access (Site access setting or policy): request it from this click.
        const allow = () => allowFeeds(blocked);
        setGlance(h('span', { class: 'muted' }, 'News sites need access. Expand to allow'));
        render(list, placeholder('Calm Tab needs access to these news sites', 'Allow access', allow));
        return;
      }
      if (!items.length) {
        setGlance(h('span', { class: 'muted' }, loading ? 'Loading…' : topic === 'saved' ? 'Nothing saved yet' : 'No headlines right now'));
        render(list, loading
          ? h('div', { class: 'skeleton', style: { height: '9rem' } })
          : topic === 'saved' ? placeholder('Nothing saved yet — tap the bookmark on any AI story.') : placeholder('No headlines right now', 'Retry', () => refresh(true)));
        return;
      }
      const big = sizeOf(el) === 'big';
      const shown = items.slice(0, big || expanded ? EXPANDED : COLLAPSED);
      const top = items[0];
      setGlance(h('span', { class: 'muted' }, TABS.find(([id]) => id === tab)?.[1] ?? ''), h('span', {}, top.title));
      render(list,
        h('ul', { class: 'news-list fade-swap' }, shown.map(storyRow)),
        !big && items.length > COLLAPSED
          ? h('button', { class: 'chip-btn news-more', type: 'button', onclick: () => { expanded = !expanded; draw(); } }, expanded ? 'Show less' : 'Show more')
          : null,
      );
    }

    async function refresh(force = false) {
      loading = true;
      refreshBtn.classList.add('spin');
      if (!cache) draw();
      try {
        const fresh = await chrome.runtime.sendMessage({ type: 'rss:refresh', force });
        if (fresh?.at) cache = fresh;
      } catch {
        /* worker unavailable: handled below */
      }
      try {
        // If the background worker didn't answer with the current format (it can be stuck on an
        // older version after an update), fetch the feeds right here — extension pages have the
        // same site access — so AI News never stays empty.
        if (!cache?.ai || cache.v !== 4) {
          const { refreshNews } = await import('../background/rss.js');
          const fresh = await refreshNews(true);
          if (fresh?.at) cache = fresh;
        }
      } catch (err) {
        console.info('[Calm Tab] news fallback failed:', err?.message ?? err);
      } finally {
        loading = false;
        refreshBtn.classList.remove('spin');
        draw();
      }
    }

    Promise.all([getLocal(KEY), getLocal(TAB_KEY, 'vn'), getLocal(LATER_KEY, []), getLocal(SEEN_KEY, 0)]).then(([c, t, l, seen]) => {
      cache = c;
      tab = t;
      later = l;
      lastSeen = seen;
      if (tab === 'ai') markSeen();
      draw();
      // Fetch after the page has settled: cached headlines are already on screen.
      if (!c || c.v !== 4 || Date.now() - c.at > STALE) (window.requestIdleCallback ?? setTimeout)(() => refresh(c?.v !== 4), { timeout: 1500 });
    });
    onLocalChanged(KEY, (_k, value) => { cache = value; draw(); });

    // Keep "time ago" labels fresh.
    setInterval(() => { if (!document.hidden && cache) draw(); }, 60 * 1000);

    return { el, update: () => draw(), resize: () => draw(), refresh: () => refresh(true) };
  },
};
