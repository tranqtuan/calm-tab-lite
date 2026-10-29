/**
 * "I am" affirmation under the greeting. Rotates daily; click to refresh.
 * Pool = the user's own affirmations (shown as written) + the bundled set in the chosen
 * language (Settings → Typography & learning): en, vi, or "en+vi" bilingual.
 * Translations in data/i18n/ are index-aligned with data/affirmations.json.
 */
import { h, render, loadJson } from '../lib/dom.js';
import { dailyIndex, nextIndex } from '../lib/daily.js';

const LANG_ATTR = { en: 'en', vi: 'vi', 'en+vi': 'en' };

/**
 * Splits an affirmation so its key phrase can be emphasised by the design (span.aff-key):
 * the words right after "I am" / "I" / "Tôi (là)", up to the first comma or clause break,
 * trimmed at the first preposition when longer than five words. Returns plain text when none.
 */
export function keyed(text) {
  const m = text.match(/^(\s*(?:I am|I'm|I|Tôi là|Tôi)\s+)(.+?)(?=[,.;:!?]|\s(?:as|and|because|so|even|while|but|với|và|vì|nên|khi|cũng|như|nhưng|để|mà)\s|$)/i);
  if (!m) return [text];
  let words = m[2].split(/\s+/);
  // A long clause is trimmed at its first preposition ("trust myself | to figure it out").
  const limit = /^\s*Tôi/i.test(text) ? 7 : 5; // Vietnamese counts syllables, so allow a longer phrase
  if (words.length > limit) {
    const cut = words.findIndex((w, i) => i > 0 && /^(to|of|for|in|on|with|at|by|over|from|into|để|cho|với|trong|của)$/i.test(w));
    words = words.slice(0, cut > 0 ? cut : 4);
  }
  // Never end the emphasis on a connector ("…the", "…những", "…là").
  while (words.length > 1 && /^(the|a|an|my|to|of|and|là|những|các|của|mà)$/i.test(words[words.length - 1])) words.pop();
  const phrase = words.join(' ');
  const rest = text.slice(m[1].length + phrase.length);
  return [m[1], h('span', { class: 'aff-key' }, phrase), rest];
}

export async function initAffirmation(root, getSettings) {
  const english = await loadJson('data/affirmations.json');
  const cache = { en: english };
  const translations = async (lang) => (cache[lang] ??= await loadJson(`data/i18n/affirmations.${lang}.json`).catch(() => english));

  const lang = () => (LANG_ATTR[getSettings().affirmationLang] ? getSettings().affirmationLang : 'en');
  const custom = () => getSettings().customAffirmations ?? [];
  const size = () => custom().length + english.length;
  let index = await dailyIndex('affirmation', size());

  async function draw(animate) {
    const l = lang();
    const i = index % size();
    const own = custom();
    if (i < own.length) {
      root.lang = '';
      render(root, ...keyed(own[i]));
    } else {
      const k = i - own.length;
      const primary = l === 'en+vi' ? english : await translations(l);
      const secondary = l === 'en+vi' ? await translations('vi') : null;
      root.lang = LANG_ATTR[l];
      render(root, ...keyed(primary[k]), secondary ? h('span', { class: 'affirmation-sub', lang: 'vi' }, secondary[k]) : null);
    }
    // Length class, so long affirmations can step down a size instead of running to 3+ lines.
    const n = (root.firstChild ? [...root.childNodes].filter((c) => !c.classList?.contains('affirmation-sub')).map((c) => c.textContent).join('') : '').length;
    root.dataset.len = n > 90 ? 'long' : n > 60 ? 'medium' : 'short';
    if (animate) {
      root.classList.remove('fade-swap');
      void root.offsetWidth; // restart the CSS animation
      root.classList.add('fade-swap');
    }
  }

  root.title = 'Click for another affirmation';
  root.addEventListener('click', async () => {
    index = await nextIndex('affirmation', size(), index);
    draw(true);
  });

  await draw(false);
  return { update: () => draw(false) };
}
