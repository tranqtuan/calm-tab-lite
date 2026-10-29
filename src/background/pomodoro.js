/**
 * Pomodoro timer state machine. Runs in the service worker and uses chrome.alarms,
 * so it keeps going after the New Tab is closed.
 *
 * State ("pomodoro:state" in storage.local):
 *   { phase: 'focus'|'short'|'long', status: 'idle'|'running'|'paused',
 *     endsAt, remainingMs, durationMs, cycle }   // cycle = focus sessions done in this set
 * Completed focus sessions per day: "pomo:YYYY-MM-DD" → number,
 * plus "pomolog:YYYY-MM-DD" → [{ end, minutes }] for the card's day timeline (local only).
 */
import { getSettings, getLocal, setLocal } from '../shared/storage.js';
import { dayKey } from '../shared/util.js';
import { setFocus, getFocus } from './focus.js';
import { playChime } from './chime.js';
import { applySession, sessionWantsFocus, getSession } from './session.js';

export const POMO_KEY = 'pomodoro:state';
export const POMO_ALARM = 'pomodoro-end';

const LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const IDLE = { phase: 'focus', status: 'idle', endsAt: null, remainingMs: null, durationMs: null, cycle: 0 };

export const getState = async () => ({ ...IDLE, ...(await getLocal(POMO_KEY, {})) });

async function durationFor(phase) {
  const { pomodoro } = await getSettings();
  return pomodoro[phase] * 60 * 1000;
}

/**
 * Keep Focus Mode in step with the timer: during a Focus session it follows the session (on for
 * focus phases, also while paused); otherwise "Focus Mode during sessions" decides.
 */
async function syncFocus(state) {
  const { pomodoro } = await getSettings();
  const focus = await getFocus();
  const inSession = await sessionWantsFocus(state);
  const source = inSession === null ? 'pomodoro' : 'session';
  const shouldFocus = inSession ?? (pomodoro.autoFocus && state.phase === 'focus' && state.status === 'running');
  const until = state.status === 'running' ? state.endsAt : null;
  const ours = focus.source === 'pomodoro' || focus.source === 'session';
  if (shouldFocus && (!focus.active || ours)) await setFocus(true, source, until);
  else if (!shouldFocus && focus.active && ours) await setFocus(false);
}

async function save(state) {
  await setLocal(POMO_KEY, state);
  await syncFocus(state);
  await applySession(state);
  return state;
}

/** Re-apply Focus Mode after a session part changes (e.g. blocking turned off for this session). */
export async function resyncFocus() {
  await syncFocus(await getState());
}

async function start(state) {
  const now = Date.now();
  const durationMs = state.status === 'paused' ? state.durationMs : await durationFor(state.phase);
  const remaining = state.status === 'paused' ? state.remainingMs : durationMs;
  const endsAt = now + remaining;
  await chrome.alarms.create(POMO_ALARM, { when: endsAt });
  return save({ ...state, status: 'running', endsAt, remainingMs: null, durationMs });
}

async function pause(state) {
  if (state.status !== 'running') return state;
  await chrome.alarms.clear(POMO_ALARM);
  return save({ ...state, status: 'paused', remainingMs: Math.max(0, state.endsAt - Date.now()), endsAt: null });
}

async function reset() {
  await chrome.alarms.clear(POMO_ALARM);
  return save({ ...IDLE });
}

/** Move to the next phase. `completed` = the timer ran out (vs. skipped). */
async function advance(state, completed) {
  await chrome.alarms.clear(POMO_ALARM);
  const settings = await getSettings();
  let { cycle } = state;
  let nextPhase;
  if (state.phase === 'focus') {
    if (completed) {
      const logKey = `pomolog:${dayKey()}`;
      const minutes = Math.round((state.durationMs ?? settings.pomodoro.focus * 60000) / 60000);
      await setLocal(logKey, [...(await getLocal(logKey, [])), { end: Date.now(), minutes }].slice(-48));
      const key = `pomo:${dayKey()}`;
      await setLocal(key, (await getLocal(key, 0)) + 1);
    }
    cycle += 1;
    nextPhase = cycle % settings.pomodoro.longEvery === 0 ? 'long' : 'short';
  } else {
    nextPhase = 'focus';
    if (state.phase === 'long') cycle = 0;
  }

  if (completed) {
    const body = nextPhase === 'focus' ? 'Break’s over — ready to focus?' : `Nice work. Time for a ${LABEL[nextPhase].toLowerCase()}.`;
    chrome.notifications.create(`pomo-${Date.now()}`, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${LABEL[state.phase]} complete`, message: body, priority: 1, silent: settings.pomodoro.chime,
    });
    if (settings.pomodoro.chime) playChime().catch(() => {});
  }

  const next = { ...IDLE, phase: nextPhase, cycle };
  // A Focus session runs the whole set by itself, and ends (back to idle) after the long break.
  const session = await getSession();
  if (session.active) return state.phase === 'long' && completed ? save(next) : start(next);
  return settings.pomodoro.autoStartNext && completed ? start(next) : save(next);
}

export async function handlePomodoro(action) {
  const state = await getState();
  switch (action) {
    case 'start': return state.status === 'running' ? state : start(state);
    case 'pause': return pause(state);
    case 'toggle': return state.status === 'running' ? pause(state) : start(state);
    case 'reset': return reset();
    case 'skip': return advance(state, false);
    default: return state;
  }
}

export async function onPomodoroAlarm() {
  const state = await getState();
  if (state.status === 'running') await advance(state, true);
}

/** On browser start: if a session ended while Chrome was closed, settle it. */
export async function reconcilePomodoro() {
  const state = await getState();
  if (state.status === 'running' && state.endsAt <= Date.now()) await advance(state, true);
  else if (state.status === 'running') chrome.alarms.create(POMO_ALARM, { when: state.endsAt });
}
