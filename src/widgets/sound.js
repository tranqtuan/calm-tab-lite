/**
 * Ambient sound popover (toolbar ♪ button), laid out like a Control Center module:
 *  - Six soundscapes as a 3×2 grid of tiles (icon + name). Tapping a tile plays it (a cross-fade
 *    when something is already playing); the selected tile shows "Playing" with a live equaliser,
 *    or "Paused".
 *  - A large play/pause button, volume with low/high icons, and a sleep timer that fades out.
 * Sound plays in the offscreen document (so it keeps going while tabs open and close); this
 * panel is a remote control: it sends commands to the service worker and draws the shared
 * state ("sound:state"). During a Focus session its controls steer the session's sound.
 * Sound only starts on an explicit click. The ♪ button itself is kept in sync by newtab.js.
 * Keys: arrow keys move between tiles, Enter picks one, Space plays or pauses.
 */
import { h, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { SOUNDS, SOUND_IDS } from '../shared/sounds.js';

const SLEEP = [[0, 'Off'], [15, '15m'], [30, '30m'], [60, '1h']];
const send = (cmd, extra = {}) => chrome.runtime.sendMessage({ type: 'sound', cmd, ...extra }).catch(() => null);

let state = { playing: false, track: null, volume: 0.5, duck: 1, sleepAt: null, sleepMinutes: 0 };
let session = { active: false };
let redraw = null;
let watching = false;
let volTimer = null;

/** Three bars that bounce while playing (static with reduce motion, via CSS). */
const equaliser = (cls = '') => h('span', { class: `eq ${cls}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
const minutesLeft = () => (state.sleepAt ? Math.max(1, Math.ceil((state.sleepAt - Date.now()) / 60000)) : 0);

function stateText(track) {
  const name = SOUNDS[track]?.label ?? 'Ambient sound';
  if (state.playing) return `${name} playing`;
  return state.track ? `${name} paused` : 'Ambient sound off';
}

/** Follow the shared state (every tab sees the same player). */
function watch() {
  if (watching) return;
  watching = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes['sound:state']) { state = { ...state, ...changes['sound:state'].newValue }; redraw?.(); }
    if (area === 'local' && changes['session:state']) { session = changes['session:state'].newValue ?? { active: false }; redraw?.(); }
  });
}

/**
 * Fill the native popover (#sound-popover). Opening, closing, light dismiss, Esc,
 * aria-expanded and positioning are handled by the browser (popover + commandfor +
 * CSS anchor positioning), so this module only renders the controls.
 */
export async function renderSoundPanel(popover, _anchor, ctx) {
  watch();
  const [{ 'sound:state': s }, { 'session:state': ss }] = await Promise.all([chrome.storage.session.get('sound:state'), chrome.storage.local.get('session:state')]);
  state = { ...state, ...s };
  if (!state.playing) state.volume = ctx.settings.sound.volume;
  session = ss ?? { active: false };
  const selected = () => state.track ?? (SOUNDS[ctx.settings.sound.track] ? ctx.settings.sound.track : 'rain');
  const live = h('div', { class: 'sound-live', 'aria-live': 'polite' });
  let lastAnnounced = stateText(selected());

  // Optimistic: draw the intended state at once; the player's report confirms it a moment later.
  const toggle = () => {
    const track = selected();
    if (state.playing) { state.playing = false; send('pause'); } else { state = { ...state, playing: true, track }; send('play', { track, volume: state.volume }); }
    draw();
  };
  const choose = (id) => {
    ctx.save({ sound: { ...ctx.settings.sound, track: id } });
    state = { ...state, playing: true, track: id };
    send('play', { track: id, volume: state.volume }); // a tile is an explicit click: play it (cross-fades if something is on)
    draw();
  };

  const draw = () => {
    const track = selected();
    const playing = state.playing;
    const left = minutesLeft();
    const inSession = session.active && session.sound;
    const status = playing ? (inSession ? 'Playing · in session' : left ? `Playing · stops in ${left} min` : 'Playing') : state.track ? 'Paused' : 'Off';
    const focused = popover.contains(document.activeElement) ? document.activeElement.dataset.track : null;
    render(popover,
      h('div', { class: 'sound-head' },
        h('div', { class: 'card-title' }, icon('music', 14), h('span', {}, 'Ambient sound')),
        h('span', { class: `sound-status ${playing ? 'on' : ''}` }, playing ? equaliser('mini') : null, status)),
      h('div', { class: 'sound-tracks', role: 'radiogroup', 'aria-label': 'Soundscape' },
        SOUND_IDS.map((id) => {
          const t = SOUNDS[id];
          const sel = id === track;
          return h('button', {
            type: 'button', role: 'radio', 'aria-checked': String(sel), tabindex: sel ? '0' : '-1',
            class: `sound-track ${sel ? 'active' : ''} ${sel && playing ? 'is-playing' : ''}`,
            dataset: { track: id }, title: t.label,
            onclick: () => choose(id),
          },
          h('span', { class: 'sound-icon' }, icon(t.icon, 20)),
          h('span', { class: 'sound-name' }, t.label),
          h('span', { class: 'sound-state' }, sel ? (playing ? [equaliser('mini'), 'Playing'] : state.track ? 'Paused' : '') : ''));
        })),
      h('div', { class: 'sound-row' },
        h('button', {
          class: `sound-play ${playing ? 'on' : ''}`, type: 'button', 'aria-label': playing ? `Pause ${SOUNDS[track].label}` : `Play ${SOUNDS[track].label}`,
          onclick: toggle,
        }, icon(playing ? 'pause' : 'play', 20)),
        h('div', { class: 'sound-volume' },
          icon('speaker', 16),
          h('input', {
            type: 'range', min: '0', max: '1', step: '0.01', value: String(state.volume), 'aria-label': 'Volume',
            oninput: (e) => { state.volume = Number(e.target.value); clearTimeout(volTimer); volTimer = setTimeout(() => send('volume', { value: state.volume }), 40); },
            onchange: (e) => ctx.save({ sound: { ...ctx.settings.sound, volume: Number(e.target.value) } }),
          }),
          icon('volume', 16))),
      // The sleep timer is for listening on its own; a Focus session ends the sound itself.
      inSession ? h('div', { class: 'sound-sleep muted small' }, icon('timer', 14), 'Stops with your Focus session') : h('div', { class: 'sound-sleep' },
        h('span', { class: 'sound-sleep-label' }, icon('moon', 14), 'Sleep timer'),
        h('div', { class: 'segmented mini', role: 'radiogroup', 'aria-label': 'Sleep timer' },
          SLEEP.map(([m, text]) => {
            const on = m === 0 ? !state.sleepAt : !!state.sleepAt && state.sleepMinutes === m;
            return h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: on ? 'active' : '', title: m ? `Fade out after ${text}` : 'No sleep timer', onclick: () => { state = { ...state, sleepMinutes: m, sleepAt: m ? Date.now() + m * 60000 : null }; send('sleep', { minutes: m }); draw(); } }, text);
          }))),
      live,
    );
    if (focused) popover.querySelector(`[data-track="${focused}"]`)?.focus();
    const text = stateText(track);
    if (text !== lastAnnounced) { lastAnnounced = text; live.textContent = text; }
  };

  // Arrow keys move between tiles (3 per row); Space plays or pauses from anywhere in the panel.
  popover.onkeydown = (e) => {
    const tile = e.target.closest?.('.sound-track');
    if (e.key === ' ' && !e.target.closest('.segmented, .sound-play')) { e.preventDefault(); toggle(); return; }
    if (!tile) return;
    const i = SOUND_IDS.indexOf(tile.dataset.track);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (step == null) return;
    e.preventDefault();
    const next = SOUND_IDS[(i + step + SOUND_IDS.length) % SOUND_IDS.length];
    popover.querySelectorAll('.sound-track').forEach((b) => b.setAttribute('tabindex', b.dataset.track === next ? '0' : '-1'));
    popover.querySelector(`[data-track="${next}"]`)?.focus();
  };

  redraw = () => { if (popover.matches(':popover-open')) draw(); };
  // While the panel is open, keep "stops in N min" current.
  clearInterval(renderSoundPanel.tick);
  renderSoundPanel.tick = setInterval(() => { if (state.sleepAt) redraw(); }, 30000);

  draw();
  // Focus the selected tile so the keyboard works straight away.
  requestAnimationFrame(() => popover.querySelector('.sound-track[tabindex="0"]')?.focus({ preventScroll: true }));
}
