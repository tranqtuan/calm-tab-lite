/** Product Hunt: today's top launches (thumbnail, name, tagline, votes). */
import { card, h, render, iconButton, placeholder } from '../lib/dom.js';
import { sizeOf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, onLocalChanged } from '../shared/storage.js';
import { thumb } from './news.js';

const KEY = 'ph:cache';
const PH_ORIGINS = ['https://www.producthunt.com/*', 'https://api.producthunt.com/*'];
const STALE = 60 * 60 * 1000;
const COLLAPSED = 5;

/**
 * Without an API token Product Hunt exposes no images (its pages block automated
 * access), so each product gets a stable colored letter tile derived from its name.
 */
function monogram(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  const tile = h('span', { class: 'img-box ph-thumb ph-mono', 'aria-hidden': 'true' }, name.trim().charAt(0).toUpperCase());
  tile.style.background = `linear-gradient(135deg, hsl(${hue} 62% 58%), hsl(${(hue + 40) % 360} 58% 42%))`;
  return tile;
}

export default {
  id: 'producthunt',
  create(ctx) {
    const { el, body, actions, setGlance, setFresh } = card('producthunt', 'Product Hunt · Today', 'rocket');
    let cache = null;
    let expanded = false;

    const refreshBtn = iconButton('refresh', 'Refresh', () => refresh(true));
    // Refresh lives in the card menu (right-click); the list also refreshes hourly.

    /** Must run directly in the click handler so Chrome shows its permission prompt. */
    function requestAccess() {
      chrome.permissions.request({ origins: PH_ORIGINS }).then((granted) => {
        if (granted) refresh(true);
        else render(body, placeholder('Chrome didn’t allow access. Your browser may be managed by a policy.', 'Try again', requestAccess));
      }).catch(() => render(body, placeholder('Access to producthunt.com is blocked on this browser', null)));
    }

    function draw() {
      if (cache?.at) setFresh(cache.at, 2 * 60 * 60 * 1000);
      if (cache?.needsPermission) {
        setGlance(h('span', { class: 'muted' }, 'Needs access to producthunt.com. Expand to allow'));
        render(body, placeholder('Calm Tab needs access to producthunt.com', 'Allow access', requestAccess));
        return;
      }
      const items = cache?.items ?? [];
      if (!items.length) {
        setGlance(h('span', { class: 'muted' }, cache ? 'Product Hunt unavailable' : 'Loading…'));
        render(body, cache ? placeholder('Product Hunt unavailable', 'Retry', () => refresh(true)) : h('div', { class: 'skeleton', style: { height: '8rem' } }));
        return;
      }
      const big = sizeOf(el) === 'big';
      const shown = items.slice(0, big || expanded ? 10 : COLLAPSED);
      setGlance(h('b', {}, '#1'), h('span', {}, items[0].name), items[0].votes != null ? h('span', { class: 'muted' }, `▲ ${items[0].votes}`) : null);
      render(body,
        h('ol', { class: 'ph-list fade-swap' }, shown.map((p, i) =>
          h('li', {},
            h('a', { class: 'ph-item', href: p.url, target: '_blank', rel: 'noopener noreferrer' },
              h('span', { class: 'ph-pos' }, String(i + 1)),
              p.thumb ? thumb(p.thumb, 'ph-thumb') : monogram(p.name),
              h('span', { class: 'ph-text' },
                h('span', { class: 'ph-name' }, p.name),
                p.tagline ? h('span', { class: 'ph-tagline' }, p.tagline) : null),
              p.votes != null ? h('span', { class: 'ph-votes', title: `${p.votes} upvotes` }, icon('up', 12), String(p.votes)) : null,
            )))),
        h('div', { class: 'ph-foot' },
          !big && items.length > COLLAPSED ? h('button', { class: 'chip-btn', type: 'button', onclick: () => { expanded = !expanded; draw(); } }, expanded ? 'Show less' : 'Show more') : h('span'),
          cache.mode === 'feed'
            ? h('button', { class: 'link-btn small', type: 'button', title: cache.error ?? 'Product Hunt only shares logos and votes through its API (free developer token)', onclick: () => ctx.openSettings('news') }, cache.error ? 'Token problem' : 'Add logos & votes')
            : null,
        ),
      );
    }

    async function refresh(force = false) {
      refreshBtn.classList.add('spin');
      try {
        const fresh = await chrome.runtime.sendMessage({ type: 'ph:refresh', force });
        if (fresh) cache = fresh;
      } catch { /* keep cache */ }
      refreshBtn.classList.remove('spin');
      draw();
    }

    getLocal(KEY).then((c) => {
      cache = c;
      draw();
      if (!c || c.needsPermission || Date.now() - c.at > STALE) refresh();
    });
    onLocalChanged(KEY, (_k, v) => { cache = v; draw(); });
    return { el, resize: () => draw(), refresh: () => refresh(true) };
  },
};
