/**
 * Science & technology fun fact of the day, with a picture.
 * Each fact is matched to an English Wikipedia article (data/i18n/facts.wiki.json,
 * index-aligned with data/facts.json); its lead image comes from Wikipedia's public
 * summary API (CORS-enabled, no key) and is cached locally for 30 days.
 * Offline or without a match, a soft illustrated tile for the category is shown.
 */
import { card, h, render, iconButton, loadJson, sizeOf, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { dailyIndex, nextIndex } from '../lib/daily.js';
import { getLocal, setLocal } from '../shared/storage.js';

const LABELS = { space: 'Space', biology: 'Biology', physics: 'Physics', chemistry: 'Chemistry', earth: 'Earth', technology: 'Technology' };
const TILE = {
  space: ['moon', 220, 260], biology: ['heart', 140, 170], physics: ['target', 260, 300],
  chemistry: ['bulb', 30, 60], earth: ['globe', 175, 120], technology: ['chart', 200, 240],
};
const IMG_KEY = 'fact:images:v2'; // { [title]: { src, page, at } }
const TTL = 30 * 24 * 60 * 60 * 1000;
const FAV_KEY = 'fact:fav'; // [fact text]

// ---------- Mini headline ----------
const SCALE = new Set(['thousand', 'million', 'billion', 'trillion', 'Earth']);
const UNIT = /^(%|percent|km|cm|mm|m|kg|g|grams?|kilograms?|tonnes?|tons?|degrees?|times|years?|days?|hours?|minutes?|seconds?|meters?|metres?|kilometers?|kilometres?|miles?|liters?|litres?|light-years?|stars|species|bones|people)$/i;
const clean = (w) => w.replace(/[,.;:)]+$/, '');
/** The first measured number in a fact ("243 Earth days", "−89.2 degrees", "98–99 percent"), with its position. */
function keyNumber(text) {
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (/[A-Za-z\d-]$/.test(before) || /^[A-Za-z]/.test(after)) continue; // names like "Voyager 1", "3M", "8000X"
    let num = m[0].replace(/[,.]$/, '');
    if (/minus $/i.test(before)) num = `−${num}`;
    if (before.endsWith('$')) num = `$${num}`;
    const range = before.match(/(\d[\d,.]*) (?:to|and) $/);
    if (range) num = `${range[1]}–${num}`;
    if (after.startsWith('%')) return { text: `${num}%`, at: m.index };
    const words = after.trim().split(/\s+/);
    const parts = [num];
    let i = 0;
    while (i < words.length && SCALE.has(clean(words[i]))) { parts.push(clean(words[i])); if (clean(words[i]) !== words[i]) { i = words.length; break; } i++; }
    if (/^(US )?dollars?/.test(words.slice(i, i + 2).join(' '))) return { text: `$${parts.join(' ')}`, at: m.index };
    if (i < words.length && UNIT.test(clean(words[i]))) parts.push(clean(words[i]));
    if (parts.length > 1 && parts.at(-1) !== 'Earth') return { text: parts.join(' '), at: m.index };
  }
  return null;
}
/** Mini headline: "Venus · 243 Earth days" — only when the subject is named before the number. */
function factHeadline(text, title) {
  const subject = title?.replace(/\s*\(.*\)$/, '');
  const n = subject ? keyNumber(text) : null;
  if (!n) return null;
  const at = text.toLowerCase().indexOf(subject.toLowerCase().split(/[\s']/)[0].replace(/s$/, ''));
  return at >= 0 && at < n.at ? `${subject} · ${n.text}` : null;
}

async function wikiImage(title) {
  const cache = await getLocal(IMG_KEY, {});
  const hit = cache[title];
  if (hit && Date.now() - hit.at < TTL) return hit;
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`wiki ${res.status}`);
    const j = await res.json();
    let src = j.thumbnail?.source ?? null;
    // Ask for a sharper thumbnail when the original is big enough. Wikimedia only serves
    // standard thumbnail steps (e.g. 330, 500, 960 px); other widths return HTTP 400.
    if (src && (j.originalimage?.width ?? 0) >= 500) src = src.replace(/\/\d+px-/, '/500px-');
    if (src) src = src.split('?')[0];
    const entry = { src: src?.startsWith('https://') ? src : null, page: j.content_urls?.desktop?.page ?? null, at: Date.now() };
    cache[title] = entry;
    await setLocal(IMG_KEY, cache);
    return entry;
  } catch {
    return hit ?? null; // offline: keep any older picture
  }
}

function categoryTile(category) {
  const [name, h1, h2] = TILE[category] ?? ['bulb', 210, 250];
  const tile = h('div', { class: 'fact-media fact-tile', 'aria-hidden': 'true' }, icon(name, 30));
  tile.style.background = `linear-gradient(135deg, hsl(${h1} 45% 42%), hsl(${h2} 50% 26%))`;
  return tile;
}

export default {
  id: 'fact',
  create() {
    const { el, body, actions, title, setGlance } = card('fact', 'Did you know', 'bulb');
    let facts = [];
    let titles = [];
    let index = 0;
    let token = 0;
    let pendingPicture = false; // a collapsed card fetches its picture only when opened
    let favs = [];
    getLocal(FAV_KEY, []).then((f) => { favs = f; if (facts.length) drawFoot(); });
    const foot = h('div', { class: 'fact-foot' });
    function drawFoot() {
      const f = facts[index];
      const on = favs.includes(f.text);
      render(foot,
        iconButton('heart', on ? 'Remove from favourites' : 'Save to favourites', () => {
          favs = on ? favs.filter((x) => x !== f.text) : [f.text, ...favs].slice(0, 200);
          setLocal(FAV_KEY, favs); toast(on ? 'Removed from favourites' : 'Saved to favourites'); drawFoot();
        }, `small ${on ? 'active' : ''}`),
        iconButton('copy', 'Copy', async () => { await navigator.clipboard.writeText(f.text); toast('Copied'); }, 'small'),
        favs.length ? h('span', { class: 'muted small' }, `${favs.length} saved`) : null);
    }

    async function draw(animate) {
      const mine = ++token;
      const f = facts[index];
      title.lastChild.textContent = LABELS[f.category] ? `Did you know · ${LABELS[f.category]}` : 'Did you know';
      // Reserve the picture's space immediately (no layout shift), then fill it in.
      const media = h('div', { class: 'fact-media-slot' }, categoryTile(f.category));
      const more = h('div', {});
      render(body, h('div', { class: animate ? 'fade-swap' : '' }, media, h('p', { class: 'fact-text' }, f.text), more, foot));
      drawFoot();
      // Mini: "Venus · 243 Earth days" when the fact has a clear subject and number; else the fact itself.
      const head = factHeadline(f.text, titles[index]);
      setGlance(head ? h('b', { title: f.text }, head) : h('span', {}, f.text));
      if (sizeOf(el) === 'mini') { pendingPicture = true; return; }
      pendingPicture = false;
      const wiki = titles[index] ? await wikiImage(titles[index]) : null;
      if (mine !== token) return;
      if (wiki?.page && sizeOf(el) === 'big') {
        render(more, h('a', { class: 'link-btn fact-more', href: wiki.page, target: '_blank', rel: 'noopener noreferrer' }, `Read more about ${titles[index]} on Wikipedia →`));
      }
      if (!wiki?.src) return;
      const img = h('img', { src: wiki.src, alt: titles[index], decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
      img.addEventListener('load', () => {
        if (mine !== token) return;
        const pic = h('a', { class: 'fact-media fact-photo', href: wiki.page, target: '_blank', rel: 'noopener noreferrer', title: `${titles[index]} · Wikipedia` },
          img, h('span', { class: 'fact-credit' }, 'Wikipedia'));
        media.replaceChildren(pic);
        requestAnimationFrame(() => img.classList.add('loaded'));
      }, { once: true });
    }

    actions.append(iconButton('refresh', 'Another fact', async () => {
      index = await nextIndex('fact', facts.length, index);
      draw(true);
    }));

    Promise.all([loadJson('data/facts.json'), loadJson('data/i18n/facts.wiki.json').catch(() => [])]).then(async ([data, wiki]) => {
      facts = data;
      titles = wiki.length === data.length ? wiki : [];
      index = await dailyIndex('fact', facts.length);
      draw(false);
    });

    return { el, resize: () => facts.length && draw(false), expand: () => { if (pendingPicture && facts.length) draw(false); } };
  },
};
