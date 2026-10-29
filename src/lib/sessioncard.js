/**
 * The Focus session parts of the Pomodoro card (shared by the full version and Lite):
 *  - choicePanel: the first Start asks what comes along (block sites, play a sound); remembered.
 *  - sessionPanel: while a session runs, one glass group with the Focus Mode line and a compact
 *    sound row, then one set of round controls (Stop · Pause/Resume · Skip).
 * The card itself (timer ring, phase, task, dots) stays in pomodoro.js.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { SOUNDS, SOUND_IDS } from '../shared/sounds.js';

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
export const sessionStart = (opts) => send({ type: 'session:start', ...opts });
export const sessionStop = () => send({ type: 'session:stop' });
export const sessionSet = (part, value) => send({ type: 'session:set', part, value });
const sound = (cmd, extra = {}) => send({ type: 'sound', cmd, ...extra });

function switchEl(checked, label, onchange) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  input.checked = !!checked;
  input.addEventListener('change', () => onchange(input.checked));
  return h('span', { class: 'switch' }, input);
}

/** A quiet sound picker: the name with a small chevron (a native select underneath). */
function trackSelect(value, onchange, label = 'Sound') {
  const el = h('select', { class: 'sess-select', 'aria-label': label, onchange: () => onchange(el.value) },
    SOUND_IDS.map((id) => h('option', { value: id, selected: id === value }, SOUNDS[id].label)));
  return h('span', { class: 'sess-pick' }, el, icon('down', 12));
}

/** First Start: what comes along with the timer. */
export function choicePanel({ settings, onStart, onTimerOnly }) {
  const pick = { block: settings.session?.block !== false, sound: settings.session?.sound !== false, track: SOUNDS[settings.sound.track] ? settings.sound.track : 'rain' };
  const select = trackSelect(pick.track, (v) => { pick.track = v; }, 'Sound for this session');
  return h('div', { class: 'sess-choice' },
    h('div', { class: 'sess-sub' }, 'Start a focus session with'),
    h('div', { class: 'sess-group' },
      h('label', { class: 'sess-row' },
        h('span', { class: 'sess-ic on' }, icon('shield', 14)),
        h('span', { class: 'sess-text' }, 'Block distracting sites'),
        switchEl(pick.block, 'Block distracting sites', (v) => { pick.block = v; })),
      h('div', { class: 'sess-row' },
        h('span', { class: 'sess-ic on' }, icon('music', 14)),
        h('span', { class: 'sess-text' }, 'Play'), select,
        switchEl(pick.sound, 'Play ambient sound', (v) => { pick.sound = v; }))),
    h('button', { class: 'sess-go', type: 'button', onclick: () => onStart(pick) }, icon('play', 14), 'Start session'),
    h('button', { class: 'link-btn sess-plain', type: 'button', onclick: onTimerOnly }, 'Just the timer'));
}

/**
 * While a session runs. phase: 'focus' | 'break'; paused: boolean.
 * snd: the shared sound state; focusOn: whether Focus Mode is blocking right now.
 */
export function sessionPanel({ session, snd, work, paused, focusOn, confirming, onToggle, onSkip, onStop, onConfirmStop, onCancelStop }) {
  const track = session.track && SOUNDS[session.track] ? session.track : 'rain';
  const playing = !!snd.playing && session.sound;
  const dimmed = playing && snd.duck < 1;

  // Focus Mode line.
  let blockRow;
  if (!work) {
    blockRow = h('div', { class: 'sess-row' },
      h('span', { class: 'sess-ic break' }, icon('coffee', 14)),
      h('span', { class: 'sess-text' }, session.block ? 'Blocking paused' : 'Break', h('span', { class: 'sess-note' }, session.block ? 'Back on after the break' : 'Enjoy it')));
  } else {
    blockRow = h('div', { class: 'sess-row' },
      h('span', { class: `sess-ic ${session.block ? 'on' : ''}` }, icon('shield', 14)),
      h('span', { class: 'sess-text' },
        session.block ? (paused ? 'Still blocking sites' : 'Blocking sites') : 'Blocking off',
        h('span', { class: 'sess-note' }, session.block ? (focusOn ? 'Ends with this session' : 'Starting…') : 'For this session')),
      switchEl(session.block, 'Block distracting sites in this session', (v) => sessionSet('block', v)));
  }

  // Sound row: icon, name, volume, play/pause, and a menu to switch sound.
  const vol = h('input', {
    type: 'range', min: '0', max: '1', step: '0.01', value: String(snd.volume ?? 0.5), class: 'sess-vol', 'aria-label': 'Volume',
    oninput: (e) => { clearTimeout(vol.t); vol.t = setTimeout(() => sound('volume', { value: Number(e.target.value) }), 40); },
  });
  const soundRow = h('div', { class: 'sess-row' },
    h('span', { class: `sess-ic ${playing ? 'on' : ''}` }, icon(SOUNDS[track].icon, 14)),
    h('span', { class: 'sess-text' }, trackSelect(track, (v) => sound(session.sound ? 'play' : 'track', { track: v }), 'Session sound'),
      dimmed ? h('span', { class: 'sess-note' }, `Softer · ${Math.round(snd.duck * 100)}%`) : !session.sound ? h('span', { class: 'sess-note' }, 'Off for this session') : null),
    session.sound ? vol : null,
    h('button', { class: 'sess-mini', type: 'button', 'aria-label': playing ? 'Pause sound' : 'Play sound', title: playing ? 'Pause sound' : 'Play sound',
      onclick: () => (playing ? sound('pause') : sound('play', { track })) }, icon(playing ? 'pause' : 'play', 11)));

  const controls = confirming
    ? h('div', { class: 'sess-confirm', role: 'group', 'aria-label': 'End this session?' },
      h('span', {}, 'End this session?'),
      h('button', { class: 'chip-btn', type: 'button', onclick: onCancelStop }, 'Keep going'),
      h('button', { class: 'sess-end', type: 'button', onclick: onConfirmStop }, 'End session'))
    : h('div', { class: 'sess-controls' },
      h('button', { class: 'sess-btn', type: 'button', 'aria-label': 'Stop session', title: 'Stop session', onclick: onStop }, icon('stop', 14)),
      h('button', { class: 'sess-btn main', type: 'button', 'aria-label': paused ? 'Resume' : 'Pause', title: paused ? 'Resume' : 'Pause', onclick: onToggle }, icon(paused ? 'play' : 'pause', 17)),
      h('button', { class: 'sess-btn', type: 'button', 'aria-label': work ? 'Skip to break' : 'Skip break', title: work ? 'Skip to break' : 'Skip break', onclick: onSkip }, icon('skip', 14)));

  return h('div', { class: 'sess' }, h('div', { class: 'sess-group' }, blockRow, soundRow), controls);
}
