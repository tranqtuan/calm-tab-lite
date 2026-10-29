/**
 * Notes card data, shared by the page and the service worker. Everything stays in
 * chrome.storage.local on this device.
 *  "notes:today"     → { day: 'YYYY-MM-DD', items: [{ id, text, done, carried? }] }
 *  "notes:pad"       → { text, at }
 *  "notes:reminders" → [{ id, text, at, repeat: 'none'|'daily'|'weekly', fired }]
 */
import { dayKey } from './util.js';

export const TODAY_KEY = 'notes:today';
export const PAD_KEY = 'notes:pad';
export const REMINDERS_KEY = 'notes:reminders';
export const REMINDER_PREFIX = 'rem:';
export const SNOOZE_MINUTES = 10;

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** A new day: unfinished items come along (marked "from yesterday"), finished ones are cleared. */
export function rollOver(today, now = new Date()) {
  const day = dayKey(now);
  if (!today) return { day, items: [] };
  if (today.day === day) return today;
  return { day, items: today.items.filter((i) => !i.done).map((i) => ({ ...i, carried: true })) };
}

/** The next time a repeating reminder is due after `after`. */
export function nextOccurrence(rem, after = Date.now()) {
  if (rem.repeat !== 'daily' && rem.repeat !== 'weekly') return null;
  const step = rem.repeat === 'daily' ? 1 : 7;
  const d = new Date(rem.at);
  while (d.getTime() <= after) d.setDate(d.getDate() + step); // setDate keeps the wall-clock time across DST
  return d.getTime();
}

/** "15:00" · "Tomorrow 09:00" · "Fri 17:00" · "3 Nov 09:00" */
export function whenLabel(at, now = new Date(), hour12 = false) {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return time;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}
