/**
 * Daily rotation for bundled content (quotes, affirmations, facts, vocabulary).
 * Each feature gets a deterministic item per day; pressing refresh picks a random
 * one that then sticks for the rest of the day.
 */
import { dayNumber } from '../shared/util.js';
import { getLocal, setLocal } from '../shared/storage.js';

// Different offsets so all widgets don't advance in lock-step through similar lists.
const SALT = { quote: 0, affirmation: 37, fact: 101, vocab: 0 };

export async function dailyIndex(key, length) {
  const today = dayNumber();
  const stored = await getLocal(`daily:${key}`);
  if (stored && stored.day === today && stored.index < length) return stored.index;
  return (today + (SALT[key] ?? 0)) % length;
}

export async function nextIndex(key, length, current) {
  let index = current;
  if (length > 1) while (index === current) index = Math.floor(Math.random() * length);
  await setLocal(`daily:${key}`, { day: dayNumber(), index });
  return index;
}
