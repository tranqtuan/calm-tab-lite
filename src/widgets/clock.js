/**
 * Clock, date and greeting (center stage). Rendered synchronously on load so the
 * first paint already shows the time — no layout shift.
 *
 * Watch faces (Settings → General → Clock face, or click the clock to cycle):
 *   classic · bold · serif · flip · analog · words · neon · stack
 * Colours: default (follows the theme) or a solid / gradient ink.
 * The same Face renderer draws the big clock and the small previews in Settings.
 */
import { lunarInfo, dayName } from '../shared/lunar.js';

const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');
const greetingEl = document.getElementById('greeting');

export const FACES = [
  ['classic', 'Classic'], ['bold', 'Bold'], ['serif', 'Serif'], ['flip', 'Flip'],
  ['analog', 'Analog'], ['words', 'Words'], ['neon', 'Neon'], ['stack', 'Stack'],
];
export const CLOCK_COLORS = [
  ['default', 'Default'], ['jade', 'Jade'], ['sunset', 'Sunset'], ['ocean', 'Ocean'],
  ['aurora', 'Aurora'], ['peach', 'Peach'], ['lime', 'Lime'], ['mono', 'Mono'],
];
const FACE_IDS = FACES.map(([id]) => id);

let settings = { timeFormat: '12h', showSeconds: false, name: '', clock: { face: 'classic', color: 'default' } };
let timer;
let face;

function greetingFor(hour) {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** Time parts for the current settings. */
function parts(now, opts) {
  const h24 = now.getHours();
  const hours = opts.timeFormat === '24h' ? String(h24).padStart(2, '0') : String(h24 % 12 || 12);
  return {
    h24, hours,
    minutes: String(now.getMinutes()).padStart(2, '0'),
    seconds: String(now.getSeconds()).padStart(2, '0'),
    period: opts.timeFormat === '12h' ? (h24 < 12 ? 'AM' : 'PM') : '',
  };
}

// ---------- Words ----------
const NUM = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const PAST = { 5: 'five past', 10: 'ten past', 15: 'quarter past', 20: 'twenty past', 25: 'twenty-five past', 30: 'half past', 35: 'twenty-five to', 40: 'twenty to', 45: 'quarter to', 50: 'ten to', 55: 'five to' };
export function timeInWords(now) {
  const m = now.getMinutes();
  const rounded = Math.round(m / 5) * 5;
  const exact = m === rounded % 60;
  let h = now.getHours();
  if (rounded >= 35) h += 1;
  const hourWord = h % 24 === 0 ? 'midnight' : h % 24 === 12 ? 'noon' : NUM[h % 12];
  const phrase = rounded === 0 || rounded === 60 ? '' : PAST[rounded];
  const suffix = !phrase && hourWord !== 'midnight' && hourWord !== 'noon' ? ' o’clock' : '';
  return { lead: exact ? 'It’s' : 'It’s about', phrase, hour: hourWord + suffix };
}

// ---------- Flip tile ----------
function flipTile(small = false) {
  const tile = el('span', `flip${small ? ' small' : ''}`);
  const half = (cls) => { const h = el('span', `flip-half ${cls}`); h.append(el('span', 'flip-digit')); return h; };
  const top = half('top'), bottom = half('bottom'), flapTop = half('flap top'), flapBottom = half('flap bottom');
  tile.append(top, bottom, flapTop, flapBottom);
  const put = (h, v) => { h.firstChild.textContent = v; };
  let value = null;
  flapBottom.addEventListener('animationend', () => { put(bottom, value); tile.classList.remove('go'); });
  return {
    el: tile,
    set(v, animate) {
      if (v === value) return;
      const old = value;
      value = v;
      if (!animate || old == null || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        [top, bottom, flapTop, flapBottom].forEach((h) => put(h, v));
        tile.classList.remove('go');
        return;
      }
      // Static top shows the new digit, static bottom keeps the old one until the flap lands.
      put(top, v); put(bottom, old); put(flapTop, old); put(flapBottom, v);
      tile.classList.remove('go'); void tile.offsetWidth; tile.classList.add('go');
    },
  };
}

/** Renders one face into `root`; `set(now)` updates it in place. */
class Face {
  constructor(root) { this.root = root; this.key = ''; }

  build(opts) {
    const { face: kind, color } = opts.clock;
    const key = `${kind}|${color}|${opts.timeFormat}|${opts.showSeconds}`;
    if (key === this.key) return false;
    this.key = key;
    this.kind = FACE_IDS.includes(kind) ? kind : 'classic';
    this.opts = opts;
    const r = this.root;
    r.className = `clock face-${this.kind}`;
    r.dataset.color = color || 'default';
    r.replaceChildren();
    this.last = '';

    if (this.kind === 'analog') {
      const dial = el('div', 'analog');
      const s = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
      for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0;
        const a = (i / 60) * Math.PI * 2;
        const r1 = major ? 39 : 42, r2 = 45;
        s.append(svg('line', { class: major ? 'tick major' : 'tick', x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a), x2: 50 + r2 * Math.sin(a), y2: 50 - r2 * Math.cos(a) }));
      }
      this.hHand = svg('line', { class: 'hand hour', x1: 50, y1: 53, x2: 50, y2: 27 });
      this.mHand = svg('line', { class: 'hand minute', x1: 50, y1: 54, x2: 50, y2: 13 });
      this.sHand = svg('line', { class: 'hand second', x1: 50, y1: 59, x2: 50, y2: 10 });
      s.append(this.hHand, this.mHand, this.sHand, svg('circle', { class: 'cap', cx: 50, cy: 50, r: 2.4 }), svg('circle', { class: 'cap-dot', cx: 50, cy: 50, r: 1 }));
      dial.append(s);
      r.append(dial);
      this.sHand.style.display = opts.showSeconds ? '' : 'none';
    } else if (this.kind === 'flip') {
      this.tiles = [flipTile(), flipTile(), flipTile(), flipTile()];
      const group = (a, b) => { const g = el('span', 'flip-group'); g.append(a.el, b.el); return g; };
      r.append(group(this.tiles[0], this.tiles[1]), el('span', 'flip-colon', ':'), group(this.tiles[2], this.tiles[3]));
      if (opts.showSeconds) {
        this.secTiles = [flipTile(true), flipTile(true)];
        r.append(group(this.secTiles[0], this.secTiles[1]));
      } else this.secTiles = null;
      if (opts.timeFormat === '12h') { this.periodEl = el('span', 'clock-period'); r.append(this.periodEl); } else this.periodEl = null;
    } else if (this.kind === 'words') {
      this.lead = el('span', 'w-lead');
      this.phrase = el('span', 'w-phrase ink');
      this.hourEl = el('span', 'w-hour ink');
      r.append(this.lead, this.phrase, this.hourEl);
    } else if (this.kind === 'stack') {
      this.hEl = el('span', 'stack-h ink');
      this.mEl = el('span', 'stack-m ink');
      this.side = el('span', 'stack-side');
      r.append(this.hEl, this.mEl, this.side);
    } else {
      this.timeEl = el('span', 'ink');
      r.append(this.timeEl);
      this.secEl = opts.showSeconds ? el('span', 'clock-seconds') : null;
      this.periodEl = opts.timeFormat === '12h' ? el('span', 'clock-period') : null;
      if (this.secEl) r.append(this.secEl);
      if (this.periodEl) r.append(this.periodEl);
    }
    return true;
  }

  set(now, animate = true) {
    const p = parts(now, this.opts);
    const stamp = `${p.hours}:${p.minutes}${this.opts.showSeconds ? p.seconds : ''}`;
    if (stamp === this.last && this.kind !== 'analog') return;
    this.last = stamp;
    const label = `${p.hours}:${p.minutes}${p.period ? ' ' + p.period : ''}`;
    this.root.setAttribute('aria-label', this.kind === 'words' ? `${label}` : label);

    switch (this.kind) {
      case 'analog': {
        const s = now.getSeconds() + now.getMilliseconds() / 1000;
        const m = now.getMinutes() + s / 60;
        const h = (now.getHours() % 12) + m / 60;
        this.hHand.style.transform = `rotate(${h * 30}deg)`;
        this.mHand.style.transform = `rotate(${m * 6}deg)`;
        // The second hand sweeps with a CSS animation, synced to the real second here.
        this.sHand.style.animationDelay = `-${s.toFixed(3)}s`;
        break;
      }
      case 'flip': {
        const hh = p.hours.padStart(2, ' ');
        [hh[0], hh[1], p.minutes[0], p.minutes[1]].forEach((d, i) => this.tiles[i].set(d.trim(), animate));
        this.tiles[0].el.classList.toggle('blank', hh[0] === ' ');
        this.secTiles?.forEach((t, i) => t.set(p.seconds[i], animate));
        if (this.periodEl) this.periodEl.textContent = p.period;
        break;
      }
      case 'words': {
        const w = timeInWords(now);
        this.lead.textContent = w.lead;
        this.phrase.textContent = w.phrase;
        this.phrase.hidden = !w.phrase;
        this.hourEl.textContent = w.hour;
        break;
      }
      case 'stack':
        this.hEl.textContent = p.hours.padStart(2, '0');
        this.mEl.textContent = p.minutes;
        this.side.textContent = [p.period, this.opts.showSeconds ? p.seconds : ''].filter(Boolean).join(' · ');
        break;
      default:
        this.timeEl.textContent = `${p.hours}:${p.minutes}`;
        if (this.secEl) this.secEl.textContent = p.seconds;
        if (this.periodEl) this.periodEl.textContent = p.period;
    }
  }
}

/** A small, static rendering of a face (used by the Settings gallery). */
export function facePreview(kind, color, opts) {
  const root = document.createElement('div');
  const f = new Face(root);
  f.build({ ...opts, clock: { face: kind, color } });
  f.set(new Date(), false);
  root.classList.add('clock-preview');
  return root;
}

function tick() {
  const now = new Date();
  face.set(now);
  // Lock-screen style label above the clock; adds the lunar date when the calendar is in Âm lịch mode.
  const solar = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  let lunar = '';
  if (settings.calendar?.lunar) {
    const info = lunarInfo(now);
    const month = info.month === 1 ? 'Giêng' : info.month === 12 ? 'Chạp' : String(info.month);
    lunar = `${dayName(info.day)} tháng ${month}${info.leap ? ' nhuận' : ''}`;
  }
  const text = lunar ? `${solar} · ${lunar}` : solar;
  if (dateEl.textContent !== text) dateEl.textContent = text;
  const name = settings.name?.trim();
  greetingEl.textContent = name ? `${greetingFor(now.getHours())}, ${name}` : greetingFor(now.getHours());
}

/** Schedule the next tick exactly on the next second (or minute) boundary. */
function schedule() {
  clearTimeout(timer);
  const now = Date.now();
  const delay = settings.showSeconds ? 1000 - (now % 1000) : 60000 - (now % 60000);
  timer = setTimeout(() => { tick(); schedule(); }, delay + 5);
}

let cycleHandler = null;
function cycle() {
  const i = FACE_IDS.indexOf(face.kind);
  cycleHandler?.(FACE_IDS[(i + 1) % FACE_IDS.length]);
}

/** `onCycle(faceId)` is called when the user clicks the clock to try the next face. */
export function initClock(initial, { onCycle } = {}) {
  face = new Face(clockEl);
  cycleHandler = onCycle;
  clockEl.tabIndex = 0;
  clockEl.setAttribute('role', 'button');
  clockEl.title = 'Click to try another clock face';
  clockEl.addEventListener('click', cycle);
  clockEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } });
  update(initial);
  // Re-sync when the tab becomes visible again (timers are throttled in background tabs).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); schedule(); } });
}

export function update(next) {
  settings = next;
  greetingEl.hidden = next.widgets?.greeting === false;
  const opts = { timeFormat: next.timeFormat, showSeconds: next.showSeconds, clock: { face: 'classic', color: 'default', ...next.clock } };
  if (face.build(opts)) {
    clockEl.classList.remove('face-in'); void clockEl.offsetWidth; clockEl.classList.add('face-in');
    face.set(new Date(), false);
  }
  tick();
  schedule();
}
