/**
 * Daily motivational quote (footer). Copy + favourite actions reveal on hover.
 * Favourites are stored locally under "quotes:favorites".
 */
import { h, render, iconButton, loadJson, toast } from '../lib/dom.js';
import { dailyIndex, nextIndex } from '../lib/daily.js';
import { getLocal, setLocal } from '../shared/storage.js';

const FAV_KEY = 'quotes:favorites';

const LANG_ATTR = { en: 'en', vi: 'vi', 'en+vi': 'en' };

export async function initQuote(root, getSettings) {
  const quotes = await loadJson('data/quotes.json');
  // Translations are index-aligned with quotes.json; loaded on demand.
  const cache = { en: quotes };
  const translated = async (lang) => (cache[lang] ??= await loadJson(`data/i18n/quotes.${lang}.json`).catch(() => quotes));
  const lang = () => (LANG_ATTR[getSettings().quoteLang] ? getSettings().quoteLang : 'en');
  /** The quote as displayed: { text, author, sub? } */
  async function shown() {
    const l = lang();
    if (l === 'en+vi') return { ...quotes[index], sub: (await translated('vi'))[index] };
    return (await translated(l))[index];
  }
  let index = await dailyIndex('quote', quotes.length);
  let favorites = await getLocal(FAV_KEY, []);

  const isFav = (q) => favorites.some((f) => f.text === q.text);

  async function draw(animate = false) {
    root.dataset.style = getSettings().quoteStyle ?? 'classic';
    const len = (await shown()).text.length;
    root.dataset.len = len > 170 ? 'long' : len > 100 ? 'medium' : 'short';
    root.lang = LANG_ATTR[lang()];
    const q = quotes[index];
    const d = await shown();
    const favBtn = iconButton('heart', isFav(q) ? 'Remove from favorites' : 'Add to favorites', toggleFav, isFav(q) ? 'active' : '');
    render(root,
      h('blockquote', { class: `quote ${animate ? 'fade-swap' : ''}` },
        h('p', { class: 'quote-text' },
          h('span', { class: 'quote-mark open', 'aria-hidden': 'true' }, '“'),
          d.text,
          h('span', { class: 'quote-mark close', 'aria-hidden': 'true' }, '”'),
        ),
        d.sub ? h('p', { class: 'quote-sub', lang: 'vi' }, d.sub.text) : null,
        h('footer', { class: 'quote-author' }, d.sub ? `${d.author} · ${d.sub.author}` : d.author),
      ),
      h('div', { class: 'quote-actions hover-actions' },
        iconButton('copy', 'Copy quote', copy),
        favBtn,
        iconButton('refresh', 'Another quote', refresh),
      ),
    );
  }

  async function refresh() {
    index = await nextIndex('quote', quotes.length, index);
    draw(true);
  }

  async function copy() {
    const d = await shown();
    await navigator.clipboard.writeText(`“${d.text}” — ${d.author}${d.sub ? `\n“${d.sub.text}” — ${d.sub.author}` : ''}`);
    toast('Quote copied');
  }

  async function toggleFav() {
    const q = quotes[index];
    favorites = isFav(q) ? favorites.filter((f) => f.text !== q.text) : [...favorites, q];
    await setLocal(FAV_KEY, favorites);
    toast(isFav(q) ? 'Saved to favorites' : 'Removed from favorites');
    draw();
  }

  draw();
  let lastLang = lang();
  return { update: () => { root.dataset.style = getSettings().quoteStyle ?? 'classic'; if (lang() !== lastLang) { lastLang = lang(); draw(true); } } };
}
