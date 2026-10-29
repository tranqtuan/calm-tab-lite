/**
 * Sites of the day: Awwwards' three latest picks (from their public feed, read by the service
 * worker a few times a day and kept on this device, so the card shows instantly and offline).
 * One large preview with its title and description; the three picks underneath switch it.
 * The heart saves a site (kept after it leaves the latest three); "Saved" lists them.
 * Keys: ←/→ move between the picks while the card has focus.
 */
import { card, h, render, sizeOf, placeholder } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal, onLocalChanged } from '../shared/storage.js';
import { refreshSites } from '../background/sites.js';

const KEY = 'sites:cache';
const SAVED_KEY = 'sites:saved';
const ORIGINS = ['https://feeds.feedburner.com/*'];
const STALE = 3 * 60 * 60 * 1000;
const MAX_SAVED = 60;

/** Awwwards serves smaller previews of every screenshot (the original is ~2 MB). */
function thumbOf(url, size) {
  const m = url?.match(/^https:\/\/(?:www|assets)\.awwwards\.com\/awards\/(submissions\/.+)$/);
  return m ? `https://assets.awwwards.com/awards/media/cache/thumb_${size}/${m[1]}` : url;
}

/** A preview image that keeps its box (no layout shift) and falls back to the original. */
function shot(item, size, cls) {
  const box = h('span', { class: `img-box ${cls}` });
  if (!item.image) return box;
  const img = h('img', { src: thumbOf(item.image, size), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
  img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
  img.addEventListener('error', () => { if (img.src !== item.image) img.src = item.image; else img.remove(); });
  box.append(img);
  return box;
}

/** "Today" · "Yesterday" · "Mon" (Awwwards dates the pick at midnight UTC) */
function dayLabel(at, now = new Date()) {
  if (!at) return '';
  const d = new Date(at);
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - local) / 86400000);
  const date = local.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (days <= 0) return `Today · ${date}`;
  if (days === 1) return `Yesterday · ${date}`;
  return `${local.toLocaleDateString(undefined, { weekday: 'short' })} · ${date}`;
}

export default {
  id: 'sites',
  create(ctx) {
    const { el, body, tools, setGlance, setFresh } = card('sites', 'Sites of the day', 'award');
    let cache = null;
    let saved = [];
    let index = 0;
    let view = 'latest';

    const isSaved = (it) => saved.some((s) => s.link === it.link);
    const toggleSave = (it) => {
      saved = isSaved(it) ? saved.filter((s) => s.link !== it.link) : [{ ...it, savedAt: Date.now() }, ...saved].slice(0, MAX_SAVED);
      setLocal(SAVED_KEY, saved);
      draw();
    };

    /** Must run directly in the click so Chrome shows its prompt. */
    function requestAccess() {
      chrome.permissions.request({ origins: ORIGINS }).then((granted) => {
        if (granted) { render(body, h('div', { class: 'skeleton site-skel' })); refresh(true); }
        else render(body, placeholder('Sites of the day needs access to Awwwards’ feed', 'Try again', requestAccess, 'award'));
      }).catch(() => render(body, placeholder('Chrome blocked access to the Awwwards feed on this browser', null)));
    }

    function paintTools() {
      if (!saved.length) { render(tools); if (view === 'saved') view = 'latest'; return; }
      render(tools, h('div', { class: 'segmented mini', role: 'tablist', 'aria-label': 'Sites' },
        [['latest', 'Latest'], ['saved', `Saved ${saved.length}`]].map(([id, label]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(id === view), class: id === view ? 'active' : '',
          onclick: () => { view = id; draw(); },
        }, label))));
    }

    function heart(it, cls = '') {
      const on = isSaved(it);
      return h('button', { class: `site-heart ${on ? 'on' : ''} ${cls}`, type: 'button', 'aria-pressed': String(on), 'aria-label': on ? `Remove ${it.title} from saved` : `Save ${it.title}`, title: on ? 'Saved' : 'Save',
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); toggleSave(it); } }, icon('heart', 15));
    }

    function latestView(items) {
      const big = sizeOf(el) === 'big';
      const it = items[Math.min(index, items.length - 1)];
      const hero = h('a', { class: 'site-hero', href: it.link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${it.title} on Awwwards` },
        shot(it, '880_660', 'site-shot'),
        it.date ? h('span', { class: 'site-date' }, dayLabel(it.date)) : null);
      const picks = items.length > 1 ? h('div', { class: 'site-picks', role: 'tablist', 'aria-label': 'Latest sites of the day' },
        items.map((p, i) => h('button', {
          type: 'button', role: 'tab', class: `site-pick ${i === index ? 'active' : ''}`, 'aria-selected': String(i === index),
          'aria-label': `${p.title}, ${dayLabel(p.date)}`, title: p.title, tabindex: i === index ? '0' : '-1',
          onclick: () => { index = i; draw(); },
        }, shot(p, '440_330', 'site-pick-shot'), big ? h('span', { class: 'site-pick-text' }, h('b', {}, p.title), h('span', {}, dayLabel(p.date))) : null))) : null;
      return h('div', { class: 'site' },
        h('div', { class: 'site-hero-wrap' }, hero, heart(it, 'over')),
        h('div', { class: 'site-title' }, it.title),
        it.desc ? h('p', { class: 'site-desc' }, it.desc) : null,
        h('div', { class: 'site-foot' }, picks ?? h('span'),
          h('a', { class: 'pill-btn small site-visit', href: it.link, target: '_blank', rel: 'noopener noreferrer' }, 'View on Awwwards', icon('external', 12))));
    }

    function savedView() {
      return h('ul', { class: 'site-saved' }, saved.map((it) => h('li', {},
        h('a', { href: it.link, target: '_blank', rel: 'noopener noreferrer', class: 'site-saved-item' },
          shot(it, '440_330', 'site-saved-shot'),
          h('span', { class: 'site-saved-text' }, h('b', {}, it.title), h('span', {}, dayLabel(it.date)))),
        heart(it))));
    }

    function draw() {
      paintTools();
      if (cache?.at) setFresh(cache.at, 2 * 24 * 60 * 60 * 1000);
      const items = cache?.items ?? [];
      if (cache?.needsPermission && !items.length) {
        setGlance(h('span', { class: 'muted' }, 'Awwwards’ picks, daily. Expand to turn on'));
        render(body, h('div', { class: 'site-intro' },
          h('p', {}, 'See the latest three Awwwards Sites of the day. Calm Tab reads their public feed a few times a day; nothing is sent.'),
          h('button', { class: 'pill-btn primary small', type: 'button', onclick: requestAccess }, 'Show sites')));
        return;
      }
      if (view === 'saved' && saved.length) { render(body, savedView()); glanceFor(items); return; }
      if (!items.length) {
        setGlance(h('span', { class: 'muted' }, cache ? 'Sites unavailable' : 'Loading…'));
        render(body, cache ? placeholder(navigator.onLine ? 'Awwwards’ feed didn’t load' : 'You’re offline', 'Retry', () => refresh(true), 'globe') : h('div', { class: 'skeleton site-skel' }));
        return;
      }
      index = Math.min(index, items.length - 1);
      glanceFor(items);
      render(body, latestView(items));
    }

    function glanceFor(items) {
      const it = items[0];
      if (!it) return;
      setGlance(shot(it, '440_330', 'site-glance-shot'), h('b', {}, it.title), h('span', { class: 'muted' }, '· Awwwards'));
    }

    /**
     * The service worker normally reads the feed. If it doesn't answer (for example an older
     * worker still running after an update, until the extension restarts), read it from this
     * page instead: extension pages have the same host access. The card never waits forever.
     */
    async function refresh(force = false) {
      let fresh = null;
      try { fresh = await chrome.runtime.sendMessage({ type: 'sites:refresh', force }); } catch { /* fall back below */ }
      if (!fresh?.items) {
        try { fresh = await refreshSites(force); } catch { fresh = null; }
      }
      cache = fresh?.items ? fresh : (cache ?? { items: [], error: 'unavailable' });
      draw();
    }

    el.addEventListener('keydown', (e) => {
      if (!e.target.closest('.site-picks') || view !== 'latest') return;
      const n = cache?.items?.length ?? 0;
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step || !n) return;
      e.preventDefault();
      index = (index + step + n) % n;
      draw();
      el.querySelector('.site-pick.active')?.focus();
    });

    Promise.all([getLocal(KEY), getLocal(SAVED_KEY, [])]).then(([c, s]) => {
      cache = c; saved = s;
      draw();
      // Fetch after the first paint, only when stale (the service worker also refreshes on its own).
      if (!c || (!c.needsPermission && Date.now() - (c.at ?? 0) > STALE)) setTimeout(() => refresh(), 1500);
    });
    onLocalChanged([KEY, SAVED_KEY], (k, v) => { if (k === KEY) cache = v; else saved = v ?? []; draw(); });
    return { el, resize: () => draw(), expand: () => draw(), refresh: () => refresh(true) };
  },
};
