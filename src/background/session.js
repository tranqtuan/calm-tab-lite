/**
 * Focus session: the Pomodoro timer, Focus Mode and ambient sound started together and kept in
 * step. Each still works on its own; a session only links them.
 *
 * State ("session:state" in storage.local):
 *   { active, block, sound, track, breakSound: 'dim'|'pause', startedAt }
 *   block / sound: whether this session blocks sites and plays sound. Changing either from its
 *   own control (the Focus Mode pill, the ♪ panel) updates the session instead of fighting it.
 *
 * Phases (driven by pomodoro.js after every timer change):
 *   focus running → sound on (full), sites blocked
 *   break running → sound dimmed to 40% (or paused), blocking lifted
 *   paused        → timer and sound paused, blocking stays on during a focus phase
 *   stop / done   → everything fades out together (sound over 3 s); "done" also chimes
 */
import { getSettings, getLocal, setLocal } from '../shared/storage.js';
import { soundCommand, getSound } from './sound.js';
import { handlePomodoro, getState, resyncFocus } from './pomodoro.js';
import { playChime } from './chime.js';

export const SESSION_KEY = 'session:state';
const IDLE = { active: false, block: false, sound: false, track: null, breakSound: 'dim', startedAt: null };
const BREAK_LEVEL = 0.4;

export const getSession = async () => ({ ...IDLE, ...(await getLocal(SESSION_KEY, {})) });
const saveSession = (s) => setLocal(SESSION_KEY, s);

/** Start a session with the chosen parts. The click that sends this is the user's explicit start. */
export async function startSession({ block = true, sound = true, track } = {}) {
  const settings = await getSettings();
  await saveSession({
    active: true, block: !!block, sound: !!sound, track: track ?? settings.sound.track,
    breakSound: settings.session?.breakSound === 'pause' ? 'pause' : 'dim', startedAt: Date.now(),
  });
  const pomo = await getState();
  return pomo.status === 'running' ? applySession(pomo) : handlePomodoro('start');
}

/** End the session: stop the timer, fade the sound out over 3 s, lift blocking. */
export async function endSession({ complete = false } = {}) {
  const s = await getSession();
  if (!s.active) return;
  await saveSession({ ...IDLE });
  if (s.sound) await soundCommand({ cmd: 'pause', seconds: 3 });
  const pomo = await getState();
  if (pomo.status !== 'idle' || pomo.phase !== 'focus') await handlePomodoro('reset'); // also lifts blocking
  if (complete) {
    const { pomodoro } = await getSettings();
    if (pomodoro.chime) playChime().catch(() => {});
  }
}

/** Turn one part on or off for this session only (from the session card or its own control). */
export async function setSessionPart(part, on) {
  const s = await getSession();
  if (!s.active || !['block', 'sound'].includes(part)) return s;
  const next = { ...s, [part]: !!on };
  await saveSession(next);
  if (part === 'sound' && !on) await soundCommand({ cmd: 'pause' });
  if (part === 'block') await resyncFocus();
  await applySession(await getState(), next);
  return next;
}

/**
 * The ♪ panel was used during a session: follow it. Playing makes sound part of the session
 * (with that track); pausing it keeps the timer running and leaves sound out until turned back on.
 */
export async function onSoundUsed(cmd) {
  const s = await getSession();
  if (!s.active) return;
  if (cmd.cmd === 'play') await saveSession({ ...s, sound: true, track: cmd.track ?? s.track });
  else if (cmd.cmd === 'pause') await saveSession({ ...s, sound: false });
  else if (cmd.cmd === 'track') await saveSession({ ...s, track: cmd.track ?? s.track });
}

/** Should Focus Mode block sites right now? (null = no session, use the normal Pomodoro rule) */
export async function sessionWantsFocus(pomo) {
  const s = await getSession();
  if (!s.active) return null;
  return s.block && pomo.phase === 'focus' && pomo.status !== 'idle';
}

/** Bring sound in line with the timer. Called after every timer change. */
export async function applySession(pomo, s = null) {
  s ??= await getSession();
  if (!s.active) return pomo;
  if (pomo.status === 'idle') { await endSession(); return pomo; } // reset from the Pomodoro card
  if (!s.sound) return pomo;
  const work = pomo.phase === 'focus';
  if (pomo.status === 'paused' || (!work && s.breakSound === 'pause')) {
    await soundCommand({ cmd: 'pause' });
    return pomo;
  }
  const level = work ? 1 : BREAK_LEVEL;
  const now = await getSound();
  if (now.playing && now.track === s.track) await soundCommand({ cmd: 'duck', level, seconds: 1.5 });
  else await soundCommand({ cmd: 'play', track: s.track, duck: level });
  return pomo;
}
