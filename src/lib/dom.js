/** Tiny DOM helpers. Untrusted text is always set via textContent, never innerHTML. */
import { icon } from './icons.js';

/**
 * h('div', { class: 'x', onclick: fn }, 'text', childNode)
 * Attributes starting with "on" become event listeners; `dataset` and `style` objects are supported.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'class') el.className = value;
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replace all children of `el`. */
export function render(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

/** Round, borderless icon button with an accessible label + tooltip. */
export function iconButton(name, label, onclick, extraClass = '') {
  return h('button', { class: `icon-btn ${extraClass}`, type: 'button', 'aria-label': label, title: label, onclick }, icon(name, 16));
}

/**
 * Standard glass card shell used by every widget.
 * Returns { el, body, actions, title } so widgets can fill them in.
 */
export function card(id, titleText, iconName) {
  const actions = h('div', { class: 'card-actions' });
  const title = h('span', { class: 'card-title' }, iconName ? icon(iconName, 14) : null, h('span', {}, titleText));
  // One-line summary, shown only while the card is collapsed to its mini size.
  const glance = h('span', { class: 'card-glance' }, h('span', { class: 'muted' }, 'Loading…'));
  const head = h('header', { class: 'card-head' }, title, glance, actions);
  // Always-visible view switches (tabs) live on their own line under the header, so the
  // header itself only ever holds the title and the hover controls.
  const tools = h('div', { class: 'card-tools' });
  const body = h('div', { class: 'card-body' });
  // Quiet freshness note, shown only when the data is stale (e.g. offline): "Updated 2 h ago".
  const fresh = h('div', { class: 'card-fresh', hidden: true });
  const el = h('article', { class: 'card entering', dataset: { widget: id, size: 'regular' } }, head, tools, body, fresh);
  // Fade up once on first paint, then never again (moving a card must not replay it).
  el.addEventListener('animationend', (e) => { if (e.target === el) el.classList.remove('entering'); });
  /** Widgets call this whenever their data changes; cheap, so no need to check the size first. */
  const setGlance = (...parts) => render(glance, ...parts);
  /** Network cards report when their data was fetched; the title tooltip always says it. */
  const setFresh = (at, staleAfterMs) => { el._fresh = { at, staleAfterMs, title, fresh }; paintFresh(el._fresh); };
  return { el, head, tools, body, actions, title, setGlance, setFresh };
}

/** "just now" · "5 min ago" · "2 h ago" · "3 days ago" */
export function ago(at, now = Date.now()) {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  return hr < 24 ? `${hr} h ago` : `${Math.round(hr / 24)} day${hr >= 48 ? 's' : ''} ago`;
}
function paintFresh(f) {
  if (!f?.at) return;
  f.title.title = `Updated ${ago(f.at)}`;
  const stale = Date.now() - f.at > f.staleAfterMs;
  f.fresh.hidden = !stale;
  if (stale) f.fresh.textContent = `${navigator.onLine ? '' : 'Offline · '}Updated ${ago(f.at)}`;
}
// Keep every "updated" note current.
setInterval(() => { for (const el of document.querySelectorAll('.card')) paintFresh(el._fresh); }, 60 * 1000);
addEventListener('online', () => { for (const el of document.querySelectorAll('.card')) paintFresh(el._fresh); });
addEventListener('offline', () => { for (const el of document.querySelectorAll('.card')) paintFresh(el._fresh); });

/** Current size of a card element: 'mini' | 'regular' | 'big'. */
export const sizeOf = (el) => el?.dataset.size ?? 'regular';

/**
 * The one empty-state pattern used by every card: an icon, one sentence, one action.
 * (Also used for "unavailable", "needs access" and "nothing yet" states.)
 */
export function placeholder(text, actionLabel, onAction, iconName = 'info') {
  return h('div', { class: 'placeholder empty-state' },
    h('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon(iconName, 16)),
    h('span', { class: 'empty-text' }, text),
    actionLabel ? h('button', { class: 'pill-btn small', type: 'button', onclick: onAction }, actionLabel) : null,
  );
}

let toastTimer;
/** Small transient message at the bottom of the screen. */
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** Load a bundled JSON file once and cache the promise. */
const jsonCache = new Map();
export function loadJson(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetch(chrome.runtime.getURL(path)).then((r) => r.json()));
  }
  return jsonCache.get(path);
}
