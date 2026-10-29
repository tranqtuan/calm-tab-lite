/**
 * Estimate past browsing time from Chrome's own history (optional "history" permission).
 *
 * Chrome history records *when* pages were visited, not how long they stayed in front,
 * so each visit is credited with the time until the next visit, capped at CAP_MS (gaps
 * longer than that are treated as idle). Results are stored per day as
 * "hist:YYYY-MM-DD" → { domain: seconds }, local only, and shown as estimates (≈)
 * next to Calm Tab's precise live tracking ("track:…").
 */
import { dayKey, domainOf } from '../shared/util.js';

export const HIST_PREFIX = 'hist:';
const META_KEY = 'hist:meta';
const CAP_MS = 10 * 60 * 1000;
const LAST_VISIT_MS = 60 * 1000;

export const historyAvailable = () => !!chrome.permissions;
export const hasHistoryAccess = () => chrome.permissions.contains({ permissions: ['history'] });

/** Must be called directly from a click so Chrome shows its permission prompt. */
export const requestHistoryAccess = () => chrome.permissions.request({ permissions: ['history'] });

export async function getHistoryMeta() {
  const { [META_KEY]: meta = null } = await chrome.storage.local.get(META_KEY);
  return meta;
}

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await fn(queue.shift()); }));
}

/**
 * Rebuild estimates for the last `days` days. `onProgress(0..1)` is called while reading.
 * Returns { days: number of days with data, visits }.
 */
export async function importHistory(days = 30, onProgress) {
  if (!chrome.history) throw new Error('history API unavailable');
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const startTime = start.getTime();

  const items = await chrome.history.search({ text: '', startTime, maxResults: 100000 });
  const visits = [];
  let done = 0;
  await pool(items, 8, async (item) => {
    const domain = domainOf(item.url);
    if (domain) {
      for (const v of await chrome.history.getVisits({ url: item.url })) {
        if (v.visitTime >= startTime) visits.push({ t: v.visitTime, d: domain });
      }
    }
    if (++done % 25 === 0) onProgress?.(done / items.length);
  });
  onProgress?.(1);

  visits.sort((a, b) => a.t - b.t);
  const perDay = {};
  for (let i = 0; i < visits.length; i++) {
    const { t, d } = visits[i];
    const gap = i + 1 < visits.length ? visits[i + 1].t - t : LAST_VISIT_MS;
    const ms = Math.min(gap, CAP_MS);
    if (ms <= 0) continue;
    const key = dayKey(new Date(t));
    (perDay[key] ??= {})[d] = Math.round(((perDay[key][d] ?? 0) + ms / 1000) * 10) / 10;
  }

  // Replace old estimates in one go.
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith(HIST_PREFIX) && k !== META_KEY);
  if (stale.length) await chrome.storage.local.remove(stale);
  const write = Object.fromEntries(Object.entries(perDay).map(([day, v]) => [`${HIST_PREFIX}${day}`, v]));
  write[META_KEY] = { at: Date.now(), days, visits: visits.length };
  await chrome.storage.local.set(write);
  return { days: Object.keys(perDay).length, visits: visits.length };
}

/** Delete all estimates and give the history permission back. */
export async function forgetHistory() {
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(HIST_PREFIX)));
  await chrome.permissions.remove({ permissions: ['history'] }).catch(() => {});
}
