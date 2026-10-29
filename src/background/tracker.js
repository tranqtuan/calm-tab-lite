/**
 * Active-time tracking per website, entirely local.
 *
 * Only time in the focused window's active tab counts, and only while the user is
 * active (chrome.idle). The service worker may be suspended at any moment, so the
 * "current site" lives in chrome.storage.session and time is flushed in small
 * increments: on every tab/window/idle event and on a 1-minute alarm. A flush never
 * credits more than MAX_GAP seconds, so sleep/suspend gaps are never counted.
 *
 * Daily totals: "track:YYYY-MM-DD" → { "github.com": seconds, ... } (kept 60 days).
 */
import { dayKey, domainOf } from '../shared/util.js';
import { checkNudge, updateStreak } from './nudges.js';

export const TRACK_ALARM = 'tracker-tick';
const CURRENT_KEY = 'tracker:current'; // session storage: { domain, since }
const MAX_GAP = 90; // seconds
const KEEP_DAYS = 60;
const IDLE_SECONDS = 60;

// Serialise all read-modify-write work so concurrent events can't double count.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn).catch((e) => console.warn('[Calm Tab] tracker', e)));

async function flush(now = Date.now()) {
  const { [CURRENT_KEY]: cur } = await chrome.storage.session.get(CURRENT_KEY);
  if (!cur?.domain) return;
  const elapsed = (now - cur.since) / 1000;
  if (elapsed > 0 && elapsed <= MAX_GAP) {
    const key = `track:${dayKey(new Date(now))}`;
    const { [key]: day = {} } = await chrome.storage.local.get(key);
    day[cur.domain] = Math.round(((day[cur.domain] ?? 0) + elapsed) * 10) / 10;
    await chrome.storage.local.set({ [key]: day });
  }
  await chrome.storage.session.set({ [CURRENT_KEY]: { ...cur, since: now } });
}

let lastTab = null; // the active tab found by the latest activeDomain() call (for nudges)

/** Work out what (if anything) the user is looking at right now. */
async function activeDomain() {
  lastTab = null;
  const state = await chrome.idle.queryState(IDLE_SECONDS);
  if (state !== 'active') return null;
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (!win?.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  const domain = tab?.url ? domainOf(tab.url) : null;
  if (!domain) return null;
  lastTab = tab;
  // Articles opened from the AI News tab are tracked as "domain#ai" → category Learning.
  const { 'ainews:opened': opened = {} } = await chrome.storage.local.get('ainews:opened');
  const at = opened[tab.url.split('#')[0]] ?? opened[tab.url];
  return at && Date.now() - at < 12 * 3600 * 1000 ? `${domain}#ai` : domain;
}

/** Flush time to the previous site, then start timing the current one. */
export function refresh() {
  return serial(async () => {
    const now = Date.now();
    await flush(now);
    const domain = await activeDomain();
    await chrome.storage.session.set({ [CURRENT_KEY]: { domain, since: now } });
    // Distraction nudges look at the same signal; never let them break tracking.
    checkNudge(lastTab, domain).catch((e) => console.warn('[Calm Tab] nudge', e));
  });
}

async function prune() {
  const all = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const old = Object.keys(all).filter((k) => (k.startsWith('track:') || k.startsWith('pomo:')) && k.slice(k.indexOf(':') + 1) < dayKey(cutoff));
  if (old.length) await chrome.storage.local.remove(old);
}

export function initTracker() {
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener((_id, info, tab) => { if (info.url && tab.active) refresh(); });
  chrome.tabs.onRemoved.addListener(refresh);
  chrome.windows.onFocusChanged.addListener(refresh);
  chrome.idle.onStateChanged.addListener(refresh);
  chrome.alarms.get(TRACK_ALARM).then((a) => { if (!a) chrome.alarms.create(TRACK_ALARM, { periodInMinutes: 1 }); });
}

export function onTrackerAlarm() {
  refresh();
  updateStreak().catch(() => {});
  if (Math.random() < 0.02) prune(); // occasionally
}
