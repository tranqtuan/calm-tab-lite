/**
 * Focus Mode: while active, navigating to a site in a "distracting" category
 * redirects the tab to blocked.html — a calm interstitial that either blocks
 * or gently warns (with "continue for 5 minutes"), depending on Settings.
 *
 * Uses only the "tabs" permission (no content scripts, no host access to pages).
 * State ("focus:state"): { active, source: 'manual'|'pomodoro', until }
 */
import { getSettings, getLocal, setLocal } from '../shared/storage.js';
import { categoryFor, domainOf } from '../shared/util.js';
import { DEFAULT_CATEGORY_MAP } from '../shared/defaults.js';

export const FOCUS_KEY = 'focus:state';
const BYPASS_KEY = 'focus:bypass'; // { domain: untilTimestamp } (session storage)
const BYPASS_MS = 5 * 60 * 1000;

export async function getFocus() {
  const state = await getLocal(FOCUS_KEY, { active: false, source: null, until: null });
  // Expire timed focus (e.g. a Pomodoro that ended while the worker was asleep).
  if (state.active && state.until && state.until < Date.now()) return { active: false, source: null, until: null };
  return state;
}

export async function setFocus(active, source = 'manual', until = null) {
  const state = active ? { active: true, source, until } : { active: false, source: null, until: null };
  await setLocal(FOCUS_KEY, state);
  if (active) await sweepOpenTabs();
  return state;
}

async function isDistracting(url) {
  const domain = domainOf(url);
  if (!domain) return null;
  const [{ focus }, overrides] = await Promise.all([getSettings(), getLocal('categories:overrides', {})]);
  const category = categoryFor(domain, overrides, DEFAULT_CATEGORY_MAP);
  if (!focus.blocked.includes(category)) return null;
  const { [BYPASS_KEY]: bypass = {} } = await chrome.storage.session.get(BYPASS_KEY);
  if (bypass[domain] > Date.now()) return null;
  return { domain, category, mode: focus.mode };
}

async function intercept(tabId, url) {
  const focus = await getFocus();
  if (!focus.active) return;
  const hit = await isDistracting(url);
  if (!hit) return;
  const page = new URL(chrome.runtime.getURL('blocked.html'));
  page.search = new URLSearchParams({ url, domain: hit.domain, category: hit.category, mode: hit.mode });
  chrome.tabs.update(tabId, { url: page.href }).catch(() => {});
}

/** When focus starts, redirect the active tab if it's already on a distracting site. */
async function sweepOpenTabs() {
  const tabs = await chrome.tabs.query({ active: true });
  for (const t of tabs) if (t.url) intercept(t.id, t.url);
}

/** "Continue anyway" from the warning page: allow this domain for 5 minutes. */
export async function allowTemporarily(domain) {
  const { [BYPASS_KEY]: bypass = {} } = await chrome.storage.session.get(BYPASS_KEY);
  bypass[domain] = Date.now() + BYPASS_MS;
  await chrome.storage.session.set({ [BYPASS_KEY]: bypass });
}

export function initFocus() {
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.url) intercept(tabId, info.url);
  });
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url) intercept(tabId, tab.url);
  });
}
