/**
 * Ambient sound, controlled from here and played in the offscreen document, so it keeps
 * playing while tabs open and close. Every tab reads the live state from "sound:state"
 * (session storage): { playing, track, volume, duck, sleepAt, sleepMinutes }.
 */
import { getSettings } from '../shared/storage.js';
import { toOffscreen } from './offscreen.js';

export const SOUND_KEY = 'sound:state';
const OFF = { playing: false, track: null, volume: 0.5, duck: 1, sleepAt: null, sleepMinutes: 0 };

export async function getSound() {
  const { [SOUND_KEY]: s } = await chrome.storage.session.get(SOUND_KEY);
  return { ...OFF, ...s };
}

/** The offscreen player reports every change; share it with all tabs. */
export function onSoundState(state) {
  return chrome.storage.session.set({ [SOUND_KEY]: { ...OFF, ...state } });
}

/** Run a player command: play | pause | volume | track | duck | sleep. Returns the new state. */
export async function soundCommand(cmd) {
  if (cmd.cmd === 'play' && !Number.isFinite(cmd.volume)) {
    const [{ sound }, current] = await Promise.all([getSettings(), getSound()]);
    cmd = { ...cmd, track: cmd.track ?? current.track ?? sound.track, volume: current.playing ? current.volume : sound.volume };
  }
  // Pausing when nothing is playing must not create the document just to stay silent.
  if ((cmd.cmd === 'pause' || cmd.cmd === 'duck') && !(await getSound()).playing) return getSound();
  const state = await toOffscreen({ type: 'sound', ...cmd }).catch(() => null);
  if (state) await onSoundState(state);
  return state ?? getSound();
}
