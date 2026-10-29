/**
 * Reminders from the Notes card: one chrome.alarms alarm per reminder, so they fire with no tab
 * open. A due reminder shows a notification with Snooze and Done; it stays "due" on the card
 * until one of them is chosen. Repeating reminders move to their next time when done.
 */
import { getLocal, setLocal } from '../shared/storage.js';
import { REMINDERS_KEY, REMINDER_PREFIX, SNOOZE_MINUTES, nextOccurrence } from '../shared/notes.js';

const NOTE_PREFIX = 'rem-';
const getReminders = () => getLocal(REMINDERS_KEY, []);

/** Make the alarms match the stored reminders (after every change, and when Chrome starts). */
export async function syncReminders() {
  const list = await getReminders();
  const wanted = new Map(list.filter((r) => !r.fired && r.at).map((r) => [REMINDER_PREFIX + r.id, r.at]));
  for (const a of await chrome.alarms.getAll()) {
    if (a.name.startsWith(REMINDER_PREFIX) && (!wanted.has(a.name) || Math.abs(a.scheduledTime - wanted.get(a.name)) > 1000)) await chrome.alarms.clear(a.name);
  }
  const existing = new Set((await chrome.alarms.getAll()).map((a) => a.name));
  for (const [name, at] of wanted) {
    // A reminder missed while Chrome was closed fires right away (alarms can't be in the past).
    if (!existing.has(name)) await chrome.alarms.create(name, { when: Math.max(at, Date.now() + 500) });
  }
}

export async function onReminderAlarm(name) {
  const id = name.slice(REMINDER_PREFIX.length);
  const list = await getReminders();
  const rem = list.find((r) => r.id === id);
  if (!rem || rem.fired) return;
  await setLocal(REMINDERS_KEY, list.map((r) => (r.id === id ? { ...r, fired: true } : r)));
  chrome.notifications.create(NOTE_PREFIX + id, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: rem.text, message: 'Reminder from Calm Tab', priority: 2, requireInteraction: true,
    buttons: [{ title: `Snooze ${SNOOZE_MINUTES} min` }, { title: 'Done' }],
  });
}

/** Snooze or done, from the notification or the card. */
export async function reminderAction(id, action) {
  const list = await getReminders();
  const rem = list.find((r) => r.id === id);
  if (!rem) return list;
  let next;
  if (action === 'snooze') next = list.map((r) => (r.id === id ? { ...r, at: Date.now() + SNOOZE_MINUTES * 60000, fired: false } : r));
  else if (action === 'done') {
    const again = nextOccurrence(rem);
    next = again ? list.map((r) => (r.id === id ? { ...r, at: again, fired: false } : r)) : list.filter((r) => r.id !== id);
  } else return list;
  chrome.notifications.clear(NOTE_PREFIX + id);
  await setLocal(REMINDERS_KEY, next);
  await syncReminders();
  return next;
}

export function isReminderNotification(id) { return id.startsWith(NOTE_PREFIX); }
export function onReminderButton(notificationId, index) {
  return reminderAction(notificationId.slice(NOTE_PREFIX.length), index === 0 ? 'snooze' : 'done');
}
