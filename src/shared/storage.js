/**
 * Thin wrapper around chrome.storage.
 *  - Settings live in chrome.storage.sync (small, follows the user's Chrome profile).
 *  - Everything else (caches, time tracking, favourites) lives in chrome.storage.local.
 * Works in both the New Tab page and the service worker.
 */
import { DEFAULT_SETTINGS, DEFAULT_FEEDS } from './defaults.js';

const SETTINGS_KEY = 'settings';

/** Recursively fill missing keys from `defaults`. Arrays are taken as-is. */
export function mergeDeep(defaults, value) {
  if (value === undefined || value === null) return structuredClone(defaults);
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) return value;
  const out = {};
  for (const key of Object.keys(defaults)) out[key] = mergeDeep(defaults[key], value[key]);
  for (const key of Object.keys(value)) if (!(key in out)) out[key] = value[key];
  return out;
}

export async function getSettings() {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.sync.get(SETTINGS_KEY);
  return migrate(stored, mergeDeep(DEFAULT_SETTINGS, stored));
}

/** One-time upgrades for settings saved by older versions (persisted on the next save). */
/** Glance-first density: what you check every time stays open, what you dig into starts as a mini row. */
const DENSITY_DEFAULTS = { sites: 'mini', calendar: 'mini', news: 'mini', producthunt: 'mini', icebreaker: 'mini', fengshui: 'mini', vocab: 'mini', fact: 'mini', focus: 'mini' };

function migrate(stored, s) {
  // Once: give new installs and layouts nobody has resized the glance-first sizes.
  if ((stored?.densityVersion ?? 0) < 1) {
    if (!stored?.sizes || !Object.keys(stored.sizes).length) s.sizes = { ...DENSITY_DEFAULTS };
    s.densityVersion = 1;
  }
  if (stored && (stored.feedsVersion ?? 1) < 2) {
    const have = new Set(s.feeds.map((f) => f.id));
    s.feeds = [...s.feeds, ...DEFAULT_FEEDS.filter((f) => f.tab === 'ai' && !have.has(f.id))];
    s.feedsVersion = 2;
  }
  // World clocks became part of the Weather & clocks card.
  if (stored && [...(s.layout?.left ?? []), ...(s.layout?.right ?? [])].includes('worldclock')) {
    s.layout = { left: s.layout.left.filter((id) => id !== 'worldclock'), right: s.layout.right.filter((id) => id !== 'worldclock') };
    if (s.widgets?.worldclock !== false) s.widgets = { ...s.widgets, weather: true };
  }
  return s;
}

/**
 * Shallow-merges `patch` into the top level of settings (nested objects are replaced).
 * Saves are serialised so rapid successive edits never overwrite each other.
 */
let saveQueue = Promise.resolve();
export function saveSettings(patch) {
  const run = saveQueue.then(async () => {
    const current = await getSettings();
    const next = { ...current, ...patch };
    try {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
    } catch (err) {
      console.warn('[Calm Tab] Could not save settings to sync storage', err);
    }
    return next;
  });
  saveQueue = run.catch(() => {});
  return run;
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SETTINGS_KEY]) {
      const stored = changes[SETTINGS_KEY].newValue;
      callback(migrate(stored, mergeDeep(DEFAULT_SETTINGS, stored)));
    }
  });
}

export async function getLocal(key, fallback = null) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}

export function setLocal(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

/** Subscribe to changes of specific local keys. */
export function onLocalChanged(keys, callback) {
  const wanted = new Set([].concat(keys));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(changes)) {
      if (wanted.has(key) || [...wanted].some((w) => w.endsWith('*') && key.startsWith(w.slice(0, -1)))) {
        callback(key, changes[key].newValue);
      }
    }
  });
}
