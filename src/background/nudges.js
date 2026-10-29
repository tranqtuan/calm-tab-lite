/**
 * Distraction nudges (service worker side).
 *
 * The tracker calls `checkNudge()` whenever it re-evaluates the active tab. We look at
 * continuous time on the current distracting site and today's total in its category,
 * pick a level (1 gentle toast · 2 cheeky card · 3 dramatic overlay), choose a message
 * from the bundled lines, and show it in the page via a
 * Shadow-DOM content script — or a system notification when the page can't be scripted.
 *
 * Buttons: back to work (counts a Save) · 5 more minutes (snooze; sassier next time) ·
 * this is for learning (allow this page for the session) · start a Pomodoro.
 */
import { getSettings, getLocal, setLocal } from '../shared/storage.js';
import { categoryFor, dayKey, formatDuration } from '../shared/util.js';
import { DEFAULT_CATEGORY_MAP } from '../shared/defaults.js';
import { handlePomodoro, getState as pomodoroState } from './pomodoro.js';
import { getFocus } from './focus.js';

const STATE_KEY = 'nudge:state'; // session storage: { domain, start, lastLevel, lastAt, snoozeUntil, snoozeCount, allow: [] }
const PERSONALITIES = ['grandma', 'narrator', 'robot', 'coach', 'future'];
const EMOJI = { grandma: '👵', narrator: '🎙️', robot: '🤖', coach: '📣', future: '🔮' };
const bundled = new Map();

async function messages(personality) {
  if (!bundled.has(personality)) {
    bundled.set(personality, fetch(chrome.runtime.getURL(`data/nudges/${personality}.json`)).then((r) => r.json()).catch(() => ({ en: {}, vi: {} })));
  }
  return bundled.get(personality);
}

const session = async () => (await chrome.storage.session.get(STATE_KEY))[STATE_KEY] ?? {};
const saveSession = (s) => chrome.storage.session.set({ [STATE_KEY]: s });

function inQuietHours(q, now = new Date()) {
  if (!q?.enabled) return false;
  const day = now.getDay();
  if (q.weekends && (day === 0 || day === 6)) return true;
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = q.start.split(':').map(Number), [eh, em] = q.end.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e; // window may wrap past midnight
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

/** Pick a bundled message not yet shown today. */
async function pickMessage(settings, level, vars) {
  const n = settings.nudges;
  const personality = n.personality === 'random' ? PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)] : n.personality;
  const lang = n.lang === 'mix' ? (Math.random() < 0.5 ? 'en' : 'vi') : n.lang;
  const shownKey = `nudge:shown:${dayKey()}`;
  const shown = new Set(await getLocal(shownKey, []));
  const pool = (await messages(personality))[lang]?.[level] ?? [];
  const fresh = pool.filter((t) => !shown.has(t));
  const from = fresh.length ? fresh : pool;
  const pick = from[Math.floor(Math.random() * from.length)] ?? '{site}: {minutes} minutes. Back to {goal}?';
  shown.add(pick);
  await setLocal(shownKey, [...shown].slice(-400));
  return { text: fill(pick, vars), personality, emoji: EMOJI[personality], lang };
}

async function categoryTotal(category, overrides) {
  const key = `track:${dayKey()}`;
  const { [key]: day = {} } = await chrome.storage.local.get(key);
  return Object.entries(day).reduce((a, [d, sec]) => a + (categoryFor(d, overrides, DEFAULT_CATEGORY_MAP) === category ? sec : 0), 0);
}

/** Deliver to the page (Shadow-DOM overlay) or fall back to a system notification. */
async function deliver(tab, payload) {
  try {
    if (!(await chrome.permissions.contains({ origins: [`${new URL(tab.url).origin}/*`] }))) throw new Error('no access');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/nudge.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'nudge:show', payload });
  } catch {
    chrome.notifications.create(`nudge-${Date.now()}`, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${payload.emoji} ${payload.site}`, message: payload.text, priority: payload.level >= 2 ? 2 : 0,
      buttons: [{ title: 'Back to work' }, { title: '5 more minutes' }],
    });
    await setLocal('nudge:lastNotified', { tabId: tab.id, url: tab.url, at: Date.now() });
  }
}

/**
 * Called by the tracker with the active tab (or null) on every refresh.
 * Keeps per-site continuous time and fires a nudge when a new level is reached.
 */
export async function checkNudge(tab, domain) {
  const settings = await getSettings();
  const n = settings.nudges;
  const state = await session();
  const now = Date.now();

  if (!domain || domain.endsWith('#ai')) { if (state.domain) await saveSession({ ...state, domain: null }); return; }
  if (state.domain !== domain) {
    // New site: continuous time restarts; snoozes and levels are per site.
    await saveSession({ ...state, domain, start: now, lastLevel: 0, snoozeUntil: 0, snoozeCount: state.domain === domain ? state.snoozeCount : 0 });
    return;
  }
  if (!n?.enabled || inQuietHours(n.quietHours)) return;

  const overrides = await getLocal('categories:overrides', {});
  const category = categoryFor(domain, overrides, DEFAULT_CATEGORY_MAP);
  if (!n.categories.includes(category)) return;
  if ((state.allow ?? []).includes(tab.url.split('#')[0])) return; // "this is for learning"

  const total = await categoryTotal(category, overrides);
  // Hard limit (off by default): after X minutes/day in a category, block with a final message.
  if (n.hardLimit?.enabled && total >= n.hardLimit.minutes * 60) {
    const page = new URL(chrome.runtime.getURL('blocked.html'));
    page.search = new URLSearchParams({ url: tab.url, domain, category, mode: 'block', reason: 'limit' });
    chrome.tabs.update(tab.id, { url: page.href }).catch(() => {});
    return;
  }
  if (now < (state.snoozeUntil ?? 0)) return;

  const minutes = (now - state.start) / 60000;
  const [t1, t2, t3] = n.thresholds;
  let level = minutes >= t3 ? 3 : minutes >= t2 ? 2 : minutes >= t1 ? 1 : 0;
  if (level && total >= t3 * 2 * 60) level = Math.min(3, level + 1); // a long day in this category escalates
  const pomo = await pomodoroState();
  const focus = await getFocus();
  if ((pomo.status === 'running' && pomo.phase === 'focus') || focus.active) level = Math.max(level, 2); // focusing: start at level 2
  // Repeated snoozes make the next message sassier.
  if (level && state.snoozeCount) level = Math.min(3, level + Math.min(1, state.snoozeCount - 1));
  if (!level || level <= (state.lastLevel ?? 0)) return;

  const vars = {
    name: settings.name?.trim() || 'friend',
    site: domain,
    minutes: String(Math.max(1, Math.round(minutes))),
    todayTotal: formatDuration(total),
    goal: settings.profile?.goals?.[0] || (settings.nudges.lang === 'vi' ? 'mục tiêu của bạn' : 'your goals'),
    snoozeCount: String(state.snoozeCount ?? 0),
  };
  const msg = await pickMessage(settings, level, vars);
  await saveSession({ ...state, lastLevel: level, lastAt: now });
  await deliver(tab, { ...msg, level, site: domain, sound: !!n.sound, pomodoroRunning: pomo.status === 'running' });
}

/** Button actions from the overlay (or notification). */
const NUDGE_ACTIONS = new Set(['back', 'snooze', 'learning', 'pomodoro']);

export async function nudgeAction({ action, url }, sender) {
  if (!NUDGE_ACTIONS.has(action)) return { ok: false };
  // Trust the tab Chrome reports over a URL the page-side script claims.
  url = sender?.tab?.url ?? (typeof url === 'string' ? url : '');
  if (!/^https?:/.test(url)) url = '';
  const tabId = sender?.tab?.id;
  const state = await session();
  if (action === 'back') {
    const key = `nudge:saves:${dayKey()}`;
    await setLocal(key, (await getLocal(key, 0)) + 1);
    await saveSession({ ...state, lastLevel: 0, snoozeCount: 0, domain: null });
    if (tabId != null) chrome.tabs.update(tabId, { url: chrome.runtime.getURL('newtab.html') }).catch(() => {});
  } else if (action === 'snooze') {
    await saveSession({ ...state, snoozeUntil: Date.now() + 5 * 60 * 1000, snoozeCount: (state.snoozeCount ?? 0) + 1, lastLevel: 0, start: state.start });
  } else if (action === 'learning') {
    await saveSession({ ...state, allow: [...new Set([...(state.allow ?? []), (url ?? '').split('#')[0]])].slice(-50) });
  } else if (action === 'pomodoro') {
    await handlePomodoro('start');
    await saveSession({ ...state, lastLevel: 0, snoozeCount: 0 });
  }
  return { ok: true };
}

/** Notification fallback buttons: 0 = back to work, 1 = snooze. */
export async function onNudgeNotificationButton(index) {
  const last = await getLocal('nudge:lastNotified');
  await nudgeAction({ action: index === 0 ? 'back' : 'snooze', url: last?.url }, { tab: last ? { id: last.tabId } : null });
}

/**
 * Daily rollover: did yesterday stay under the distraction goal? Updates the streak.
 * Called on the tracker's minute alarm; cheap when the day hasn't changed.
 */
export async function updateStreak() {
  const settings = await getSettings();
  const stats = await getLocal('nudge:stats', { streak: 0, lastDay: null });
  const today = dayKey();
  if (stats.lastDay === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yKey = `track:${dayKey(y)}`;
  const { [yKey]: day } = await chrome.storage.local.get(yKey);
  const overrides = await getLocal('categories:overrides', {});
  if (day) {
    const distracting = Object.entries(day).reduce((a, [d, sec]) => a + (settings.nudges.categories.includes(categoryFor(d, overrides, DEFAULT_CATEGORY_MAP)) ? sec : 0), 0);
    stats.streak = distracting <= settings.nudges.dailyGoal * 60 ? (stats.streak ?? 0) + 1 : 0;
  }
  stats.lastDay = today;
  await setLocal('nudge:stats', stats);
}
