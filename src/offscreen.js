/**
 * Offscreen document: the one place Calm Tab plays sound, so it keeps playing while you open
 * and close tabs. The service worker creates it and sends commands; it reports the player's
 * state back, and the worker shares that with every tab ("sound:state").
 *  - chime: a soft two-note bell (Pomodoro).
 *  - sound: the ambient soundscapes (play, pause, volume, track, dim for breaks, sleep timer).
 */
import { AmbientPlayer, TRACKS } from './lib/ambient.js';

const player = new AmbientPlayer();
let reportTimer = null;
const report = () => {
  // Coalesce bursts (dragging the volume) into one update.
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'sound:state', state: player.snapshot() }).catch(() => {}), 60);
};
player.onChange(report);

async function sound(msg) {
  const track = TRACKS[msg.track] ? msg.track : player.track ?? 'rain';
  switch (msg.cmd) {
    case 'play':
      if (Number.isFinite(msg.volume)) player.volume = Math.min(1, Math.max(0, msg.volume));
      if (Number.isFinite(msg.duck)) player.setDuck(msg.duck, 0.01);
      await player.play(track);
      break;
    case 'pause': player.pause(Number.isFinite(msg.seconds) ? msg.seconds : 0.6); break;
    case 'volume': player.setVolume(Math.min(1, Math.max(0, Number(msg.value) || 0))); break;
    case 'track': await player.setTrack(track); break;
    case 'duck': player.setDuck(Math.min(1, Math.max(0, Number(msg.level))), Number(msg.seconds) || 1.2); break;
    case 'sleep': player.setSleep(Math.max(0, Number(msg.minutes) || 0)); break;
    default: break;
  }
  return player.snapshot();
}

/** Soft two-note bell chime. */
function chime() {
  const ctx = new AudioContext();
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  const now = ctx.currentTime + 0.05;
  // A gentle major-sixth bell: E5 then C#6, each with a quiet octave partial.
  [[659.25, 0], [1108.73, 0.28]].forEach(([freq, offset]) => {
    [[1, 0.35], [2, 0.08], [3.01, 0.03]].forEach(([mult, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, now + offset);
      g.gain.linearRampToValueAtTime(amp, now + offset + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 2.6);
      o.connect(g).connect(out);
      o.start(now + offset);
      o.stop(now + offset + 2.7);
    });
  });
  setTimeout(() => ctx.close(), 3500);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.type === 'chime') { chime(); return false; }
  if (msg.type === 'sound') { sound(msg).then(sendResponse, () => sendResponse(player.snapshot())); return true; }
  return false;
});
