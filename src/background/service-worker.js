/**
 * Calm Tab background service worker.
 * Owns everything that must run without the New Tab open: RSS refresh,
 * Pomodoro alarms + notifications, Focus Mode, ambient sound (played in the offscreen
 * document), Focus sessions, Notes reminders, Awwwards Sites of the day, and active-time tracking.
 * All listeners are registered synchronously at top level (MV3 requirement).
 */
import { initRss, refreshNews, RSS_ALARM } from './rss.js';
import { handlePomodoro, onPomodoroAlarm, reconcilePomodoro, POMO_ALARM, getState as getPomodoroState } from './pomodoro.js';
import { initFocus, setFocus, getFocus, allowTemporarily } from './focus.js';
import { initTracker, onTrackerAlarm, refresh as refreshTracker, TRACK_ALARM } from './tracker.js';
import { refreshProductHunt, initProductHunt, PH_ALARM } from './producthunt.js';
import { nudgeAction, onNudgeNotificationButton } from './nudges.js';
import { soundCommand, onSoundState, getSound } from './sound.js';
import { startSession, endSession, setSessionPart, onSoundUsed, getSession } from './session.js';
import { refreshSites, initSites, SITES_ALARM } from './sites.js';
import { syncReminders, onReminderAlarm, reminderAction, isReminderNotification, onReminderButton } from './reminders.js';
import { REMINDER_PREFIX } from '../shared/notes.js';

performance.mark('sw:modules'); // all imports evaluated
initRss();
initFocus();
initTracker();
initProductHunt();
initSites();

performance.mark('sw:ready'); // listeners registered

// No feed fetching here: right after install the first new tab is loading, and the News card
// asks for headlines itself (after its first paint) when it has none.
chrome.runtime.onInstalled.addListener(() => {
  refreshTracker();
  syncReminders();
});

chrome.runtime.onStartup.addListener(() => {
  reconcilePomodoro();
  refreshTracker();
  syncReminders();
});

/**
 * Feed alarms that were due while Chrome was closed all fire the moment it starts, exactly
 * when the first new tab is loading. Give the browser 30 s before fetching and parsing feeds.
 */
// Session storage is cleared when Chrome quits, so the first worker start of a session (Chrome
// launch, or install/reload) records the time; later wake-ups in the same session keep it.
const launched = chrome.storage.session.get('launchedAt').then(({ launchedAt }) => {
  if (launchedAt) return launchedAt;
  const now = Date.now();
  chrome.storage.session.set({ launchedAt: now });
  return now;
});
async function afterLaunch(name, run) {
  if (Date.now() - (await launched) < 20000) {
    const a = await chrome.alarms.get(name);
    chrome.alarms.create(name, { delayInMinutes: 0.5, ...(a?.periodInMinutes ? { periodInMinutes: a.periodInMinutes } : {}) });
    return;
  }
  run();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RSS_ALARM) afterLaunch(RSS_ALARM, () => refreshNews());
  else if (alarm.name === POMO_ALARM) onPomodoroAlarm();
  else if (alarm.name === TRACK_ALARM) onTrackerAlarm();
  else if (alarm.name === PH_ALARM) afterLaunch(PH_ALARM, () => refreshProductHunt());
  else if (alarm.name === SITES_ALARM) afterLaunch(SITES_ALARM, () => refreshSites());
  else if (alarm.name.startsWith(REMINDER_PREFIX)) onReminderAlarm(alarm.name);
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id.startsWith('nudge-')) { chrome.notifications.clear(id); onNudgeNotificationButton(index); }
  else if (isReminderNotification(id)) onReminderButton(id, index);
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.tabs.create({}); // opens a new Calm Tab
});

/** Messages from the New Tab page, blocked.html and the nudge overlay. Returns a promise of the reply. */
async function handle(msg, sender) {
  switch (msg?.type) {
    case 'rss:refresh': return refreshNews(!!msg.force);
    case 'pomodoro': return handlePomodoro(msg.action);
    case 'focus:set': {
      // Turning Focus Mode off during a Focus session turns blocking off for that session only.
      if (!msg.active && (await getFocus()).source === 'session') { await setSessionPart('block', false); return getFocus(); }
      // Optional timer: 1–480 minutes; Focus Mode turns itself off afterwards.
      const minutes = Number.isFinite(msg.minutes) ? Math.min(480, Math.max(1, Math.round(msg.minutes))) : null;
      return setFocus(!!msg.active, 'manual', msg.active && minutes ? Date.now() + minutes * 60000 : null);
    }
    case 'focus:get': return getFocus();
    case 'focus:allow': return allowTemporarily(msg.domain);
    case 'tracker:flush': return refreshTracker();
    case 'sound': {
      const cmd = { cmd: String(msg.cmd), track: msg.track, volume: msg.volume, value: msg.value, minutes: msg.minutes };
      if (cmd.cmd === 'play') {
        // Full level, unless this is a Focus session's break (then the break's softer level).
        const [session, pomo] = await Promise.all([getSession(), getPomodoroState()]);
        cmd.duck = session.active && pomo.phase !== 'focus' && pomo.status === 'running' ? 0.4 : 1;
      }
      await onSoundUsed(cmd); // during a Focus session, the ♪ panel steers the session's sound
      return soundCommand(cmd);
    }
    case 'sound:get': return getSound();
    case 'sound:state': return onSoundState(msg.state); // from the offscreen player
    case 'session:start': return startSession({ block: msg.block, sound: msg.sound, track: msg.track });
    case 'session:stop': return endSession();
    case 'session:set': return setSessionPart(msg.part, msg.value);
    case 'session:get': return getSession();
    case 'ph:refresh': return refreshProductHunt(!!msg.force);
    case 'sites:refresh': return refreshSites(!!msg.force);
    case 'reminders:sync': return syncReminders();
    case 'reminder:action': return reminderAction(String(msg.id), msg.action);
    case 'nudge:action': return nudgeAction(msg, sender);
    default: return undefined;
  }
}

/**
 * Messages from our own pages (new tab, blocked page, offscreen) may use every command.
 * The nudge content script runs inside web pages, so its messages are treated as
 * untrusted: it may only send 'nudge:action', and the handler re-validates the fields.
 */
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL('/')).origin;
const CONTENT_SCRIPT_TYPES = new Set(['nudge:action']);
function allowed(msg, sender) {
  if (sender.id !== chrome.runtime.id || typeof msg?.type !== 'string') return false;
  const fromExtensionPage = !!sender.url && new URL(sender.url).origin === EXTENSION_ORIGIN;
  return fromExtensionPage || CONTENT_SCRIPT_TYPES.has(msg.type);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false; // meant for the offscreen document
  if (!allowed(msg, sender)) return false;
  handle(msg, sender).then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true; // keep the channel open for the async reply
});
