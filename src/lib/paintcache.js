/**
 * Paint cache for the centre stack (affirmation + quote).
 * The clock paints before the data files load; if the affirmation and quote arrived later the
 * whole centred stack would shift (layout shift). So the page keeps a small structural copy of
 * what it showed (tags, a few attributes, text: never HTML) and rebuilds it in the first
 * frame. On a new day the old text isn't shown; its height is reserved instead.
 */
const KEY = 'calm:center';
const ATTRS = ['class', 'lang', 'aria-hidden', 'data-len', 'data-style', 'title'];
const SKIP = (el) => el.classList?.contains('hover-actions') || el.tagName === 'BUTTON';
const today = () => new Date().toDateString();

function save(el) {
  if (el.nodeType === Node.TEXT_NODE) return el.data;
  if (el.nodeType !== Node.ELEMENT_NODE || SKIP(el)) return null;
  const a = {};
  for (const n of ATTRS) if (el.hasAttribute(n)) a[n] = n === 'class' ? el.getAttribute(n).replace(/\bfade-swap\b/g, '').trim() : el.getAttribute(n);
  return { t: el.tagName.toLowerCase(), a, c: [...el.childNodes].map(save).filter((x) => x != null) };
}

function build(node) {
  if (typeof node === 'string') return document.createTextNode(node);
  const el = document.createElement(node.t);
  for (const [k, v] of Object.entries(node.a ?? {})) if (ATTRS.includes(k) && v !== '') el.setAttribute(k, v);
  el.append(...(node.c ?? []).map(build));
  return el;
}

/**
 * Rebuild today's affirmation and quote (or reserve their heights) before the first paint.
 * Returns false when there is no snapshot at all (the very first tab), so the caller can keep
 * the stack out of sight until its text is in.
 */
export function restoreCenter(els) {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  if (!snap) return false;
  for (const [id, el] of Object.entries(els)) {
    const s = snap[id];
    if (!s || !el) continue;
    if (snap.day === today() && s.node) {
      for (const n of ['lang', 'data-len', 'data-style']) if (s.node.a?.[n] != null) el.setAttribute(n, s.node.a[n]);
      el.replaceChildren(...s.node.c.map(build));
    } else if (s.h) {
      el.style.minHeight = `${s.h}px`; // released once the real content is in
      el.dataset.reserved = '1';
    }
  }
  return true;
}

/** Keep the snapshot current whenever the centre content changes. */
export function watchCenter(els) {
  let timer;
  const write = () => {
    const out = { day: today() };
    for (const [id, el] of Object.entries(els)) {
      if (!el || el.hidden) continue;
      if (el.dataset.reserved) { el.style.minHeight = ''; delete el.dataset.reserved; }
      out[id] = { node: save(el), h: Math.round(el.getBoundingClientRect().height) };
    }
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* optional */ }
  };
  const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(write, 400); });
  for (const el of Object.values(els)) if (el) mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-len', 'data-style', 'lang'] });
  write();
}
