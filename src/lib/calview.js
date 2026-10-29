/**
 * The calendar card's views, shared by the full version and Lite: a glass "lịch bloc" (the
 * Vietnamese tear-off wall calendar) with Day · Week · Month · Year views.
 *  - Every day shows the solar date over its lunar date. Colour carries meaning, and only a little
 *    of it: Saturday blue, Sunday and days off red, special days a gold dot, Mùng 1 and Rằm a gold
 *    lunar number, today the accent.
 *  - The binding (rings, arrows, title) stays put; the page under it changes. In the Day view the
 *    page tears off like paper (arrows, drag or swipe, scroll wheel, ← / →). With "reduce motion"
 *    every change is a short crossfade.
 *  - Keys while the card has focus: ← / → move one day, week, month or year; T jumps to today;
 *    Esc goes back to the month.
 *  - Day and Year load on first use (calday.js, calyear.js), so the new tab never waits for them.
 */
import { h, render } from './dom.js';
import { lunarInfo, fullLunarLabel, label } from '../shared/lunar.js';
import { specialDays } from '../shared/days.js';

export const VN_DOW = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const VN_DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
const VIEW_KEY = 'calendar:view';
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Run `fn` once the animation ends — or after `ms` anyway (a hidden tab pauses animations). */
function settled(anim, ms, fn) {
  let done = false;
  const once = () => { if (!done) { done = true; fn(); } };
  anim.finished.then(once, once);
  setTimeout(once, ms + 80);
}

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sameDay = (a, b) => a.toDateString() === b.toDateString();
const weekStart = (d) => { const s = startOfDay(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s; };

/** ISO week number (weeks start on Monday). */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

function sameUnit(a, b, view) {
  if (view === 'day') return sameDay(a, b);
  if (view === 'week') return sameDay(weekStart(a), weekStart(b));
  if (view === 'month') return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  return a.getFullYear() === b.getFullYear();
}

function addUnit(d, view, n) {
  if (view === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  if (view === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
  if (view === 'month') return new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(d.getFullYear() + n, d.getMonth(), 1);
}

/** Everything a day cell needs: its classes, the lunar label and a full tooltip. */
export function dayMeta(d, today = new Date()) {
  const info = lunarInfo(d);
  const days = specialDays(d, info);
  const dow = d.getDay();
  const off = days.some((x) => x.off);
  const classes = [
    sameDay(d, today) ? 'today' : '',
    dow === 6 ? 'sat' : dow === 0 ? 'sun' : '',
    off ? 'off' : days.length ? 'special' : '',
    info.day === 1 || info.day === 15 ? 'lmark' : ''];
  // Mùng 1 shows the lunar month ("1/9"), like printed Vietnamese calendars.
  const ld = info.day === 1 ? `1/${info.month}${info.leap ? 'n' : ''}` : String(info.day);
  const title = [d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), `${fullLunarLabel(info)} (âm lịch)`, ...days.map((x) => x.name + (x.off ? ' · nghỉ lễ' : ''))].join('\n');
  return { info, days, off, red: off || dow === 0, classes: classes.filter(Boolean), ld, title };
}

// ---------- Month ----------
function monthPage(cursor, { today, onDay, note }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = weekStart(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i === 35 && d.getMonth() !== cursor.getMonth()) break; // drop an empty 6th row
    const m = dayMeta(d, today);
    const other = d.getMonth() !== cursor.getMonth();
    cells.push(h('button', { type: 'button', class: ['day', other ? 'other' : '', ...m.classes].filter(Boolean).join(' '), title: m.title, 'aria-label': m.title.replace(/\n/g, ', '), onclick: () => onDay(d) },
      h('span', { class: 'sd' }, d.getDate()), h('span', { class: 'ld' }, m.ld)));
  }
  return h('div', { class: 'bloc-page month' },
    h('div', { class: 'cal-grid lunar' }, [1, 2, 3, 4, 5, 6, 0].map((i) => h('span', { class: `dow ${i === 6 ? 'sat' : i === 0 ? 'sun' : ''}` }, VN_DOW_SHORT[i])), cells),
    footer(note ?? todayNote(today), legend()));
}

function legend() {
  return h('div', { class: 'cal-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'lg-off' }), 'Day off'),
    h('span', {}, h('i', { class: 'lg-special' }), 'Special'));
}

const footer = (...content) => h('div', { class: 'bloc-foot' }, ...content);

/** "20/9 ÂL · Bính Tý" (the full lunar date on hover), led by today's special day if there is one. */
export function todayNote(today = new Date()) {
  const info = lunarInfo(today);
  const days = specialDays(today, info);
  const text = `${info.day}/${info.month}${info.leap ? 'n' : ''} ÂL · ${label(info.dayCC)}`;
  const long = `${fullLunarLabel(info)} · Ngày ${label(info.dayCC)}`;
  // Today's special day leads the note (in its colour); the lunar date follows.
  return [h('span', { class: 'cal-today-note', title: [long, ...days.map((x) => x.name)].join(' · ') },
    days.length ? h('b', { class: days[0].off ? 'off' : 'special' }, `${days[0].name} · `) : null, text)];
}

// ---------- Week ----------
function eventsOn(events, d) {
  return (events ?? []).filter((e) => (e.allDay ? sameDay(new Date(`${e.start.slice(0, 10)}T00:00:00`), d) : sameDay(new Date(e.start), d)))
    .sort((a, b) => (a.allDay === b.allDay ? new Date(a.start) - new Date(b.start) : a.allDay ? -1 : 1));
}
const eventTime = (e) => (e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));

function weekPage(cursor, { today, onDay, events, big }) {
  const start = weekStart(cursor);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const row = (d) => {
    const m = dayMeta(d, today);
    const evs = eventsOn(events, d);
    const notes = [...m.days.map((x) => h('span', { class: `wk-tag ${x.off ? 'off' : 'special'}` }, x.name)),
      ...evs.map((e) => h('span', { class: 'wk-event', title: e.title }, h('b', {}, eventTime(e)), ' ', e.title))];
    return h('button', { type: 'button', class: ['wk-day', ...m.classes].join(' '), title: m.title, 'aria-label': m.title.replace(/\n/g, ', '), onclick: () => onDay(d) },
      h('span', { class: 'wk-dow' }, VN_DOW_SHORT[d.getDay()]),
      h('span', { class: 'wk-date' }, h('span', { class: 'sd' }, d.getDate()), h('span', { class: 'ld' }, m.ld)),
      h('span', { class: 'wk-notes' }, notes.length ? notes : h('span', { class: 'wk-empty' }, '·')));
  };
  return h('div', { class: `bloc-page week ${big ? 'cols' : ''}` }, h('div', { class: 'wk-list' }, days.map(row)), footer(todayNote(today)));
}

/** The next special days and lunar milestones (Mùng 1, Rằm) in the coming weeks. */
export function upcoming(limit = 5, from = new Date()) {
  const out = [];
  const d = new Date(from);
  for (let i = 1; i <= 60 && out.length < limit; i++) {
    d.setDate(d.getDate() + 1);
    const info = lunarInfo(d);
    const days = specialDays(d, info);
    const names = days.length ? days.map((x) => x.name) : info.leap ? [] : info.day === 1 ? [`Mùng 1 tháng ${info.month}`] : info.day === 15 ? [`Rằm tháng ${info.month}`] : [];
    for (const name of names) {
      if (out.length < limit && !out.some((x) => x.name === name)) out.push({ name, off: days.some((x) => x.name === name && x.off), date: new Date(d), lunar: `${info.day}/${info.month}` });
    }
  }
  return h('div', { class: 'cal-upcoming' },
    h('div', { class: 'cal-group-title' }, 'Coming up'),
    h('ul', {}, out.map((x) => h('li', { class: x.off ? 'off' : '' },
      h('span', { class: 'cal-up-date' }, x.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })),
      h('span', { class: 'cal-up-name' }, x.name),
      h('span', { class: 'muted small' }, x.lunar)))));
}

// ---------- The bloc ----------
/**
 * Mounts the calendar into a card.
 * opts: { el, body, tools, isBig(), events(), side(view, cursor) → node|null, extra(view) → node|null, note() → node|null }
 * Returns { draw() } — call it whenever data or the card size changes.
 */
export function mountCalendar(opts) {
  const { el, body, tools } = opts;
  let view = 'month';
  let cursor = startOfDay(new Date());
  let modules = {};
  const load = (name) => (modules[name] ??= import(name === 'day' ? './calday.js' : './calyear.js'));

  const seg = h('div', { class: 'segmented mini cal-views', role: 'radiogroup', 'aria-label': 'Calendar view' });
  const live = h('div', { class: 'cal-live', 'aria-live': 'polite' });
  const prev = h('button', { type: 'button', class: 'bloc-arrow', onclick: () => nav(-1) }, '‹');
  const next = h('button', { type: 'button', class: 'bloc-arrow', onclick: () => nav(1) }, '›');
  const todayBtn = h('button', { type: 'button', class: 'bloc-today', onclick: () => goToday() }, 'Today');
  // The view switch sits under the card title, like the other cards' tabs; Today sits at the right when you're away.
  tools.append(seg, todayBtn);
  tools.classList.add('cal-tools');
  const kicker = h('span', { class: 'bloc-kicker' });
  const main = h('span', { class: 'bloc-title-main' });
  const titleBtn = h('button', { type: 'button', class: 'bloc-title', onclick: () => titleClick() }, kicker, main);
  const head = h('div', { class: 'bloc-head' }, h('span', { class: 'bloc-ring', 'aria-hidden': 'true' }), h('span', { class: 'bloc-ring', 'aria-hidden': 'true' }), prev, titleBtn, next);
  const pages = h('div', { class: 'bloc-pages' });
  const sheet = h('div', { class: 'bloc-sheet' }, head, h('div', { class: 'bloc-perf', 'aria-hidden': 'true' }), pages);
  const bloc = h('div', { class: 'bloc' }, sheet);
  // Persistent slots, so the bloc itself is never re-parented (that would cut its animations).
  const sideSlot = h('div', { class: 'cal-side' });
  const wrap = h('div', {}, bloc, sideSlot);
  const extraSlot = h('div', { class: 'cal-extra' });

  function drawSeg() {
    render(seg, VIEWS.map(([v, text]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === view), class: v === view ? 'active' : '', onclick: () => setView(v) }, text)));
  }

  function drawHead() {
    const today = new Date();
    const lunarYear = (d) => `Năm ${label(lunarInfo(d).yearCC)}`;
    const unit = { day: 'day', week: 'week', month: 'month', year: 'year' }[view];
    prev.setAttribute('aria-label', `Previous ${unit}`); prev.title = `Previous ${unit}`;
    next.setAttribute('aria-label', `Next ${unit}`); next.title = `Next ${unit}`;
    if (view === 'year') {
      kicker.textContent = lunarYear(new Date(cursor.getFullYear(), 6, 1));
      main.textContent = String(cursor.getFullYear());
    } else if (view === 'week') {
      const s = weekStart(cursor); const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      kicker.textContent = `Tuần ${isoWeek(s)} · ${lunarYear(s)}`;
      const fmt = (d, withMonth) => d.toLocaleDateString(undefined, withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
      main.textContent = s.getMonth() === e.getMonth() ? `${fmt(s)} – ${fmt(e, true)}` : `${fmt(s, true)} – ${fmt(e, true)}`;
    } else {
      kicker.textContent = lunarYear(view === 'day' ? cursor : new Date(cursor.getFullYear(), cursor.getMonth(), 15));
      main.textContent = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    titleBtn.disabled = view === 'year';
    titleBtn.title = view === 'month' ? 'Pick a month' : view === 'year' ? '' : 'Back to the month';
    todayBtn.hidden = sameUnit(cursor, today, view);
    // A Sunday or a day off turns the Day view's binding red, like the printed sheet.
    sheet.classList.toggle('is-red', view === 'day' && dayMeta(cursor, today).red);
    bloc.dataset.view = view;
  }

  async function buildPage() {
    const today = new Date();
    const big = opts.isBig();
    const onDay = (d) => go('day', startOfDay(d));
    if (view === 'month') return monthPage(cursor, { today, onDay, note: opts.note?.() });
    if (view === 'week') return weekPage(cursor, { today, onDay, events: opts.events?.(), big });
    if (view === 'day') return (await load('day')).dayPage(cursor, { today, onMonth: () => setView('month') });
    return (await load('year')).yearPage(cursor.getFullYear(), { today, big, onMonth: (d) => go('month', d) });
  }

  let token = 0;
  /** Render the current view. kind: 'none' (first paint, resize), 'fade', 'slide' (±dir), 'tear' (±dir). */
  async function show(kind = 'none', dir = 1) {
    const my = ++token;
    drawSeg(); drawHead();
    const page = await buildPage();
    if (my !== token) return;
    // Big card: a panel beside the bloc (the day's reading, or the widget's own side panel).
    // Week and Year use the whole width instead.
    const side = !opts.isBig() || view === 'year' || view === 'week' ? null : view === 'day' ? (await load('day')).dayReadingPanel(cursor) : opts.side?.(view, cursor) ?? null;
    if (my !== token) return;
    if (!body.contains(wrap)) render(body, wrap, extraSlot, live);
    wrap.className = side ? 'cal-big' : 'cal-wrap';
    render(sideSlot, side); sideSlot.hidden = !side;
    render(extraSlot, opts.extra?.(view)); extraSlot.hidden = !extraSlot.firstChild;
    const old = pages.lastElementChild;
    if (kind === 'none' || !old) { pages.replaceChildren(page); return; }
    pages.querySelectorAll('.leaving').forEach((n) => n.remove()); // a fast second turn
    const before = pages.offsetHeight;
    animateSwap(old, page, kind, dir);
    const after = page.offsetHeight;
    if (before !== after && !reduceMotion()) pages.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 280, easing: EASE });
  }

  function animateSwap(old, page, kind, dir) {
    if (reduceMotion() || kind === 'fade') {
      pages.append(page);
      old.classList.add('leaving');
      page.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      settled(old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' }), 200, () => old.remove());
      return;
    }
    if (kind === 'tear' && dir > 0) {
      // Forward: the sheet lifts from the binding, curls and falls away, revealing the next day.
      pages.prepend(page);
      old.classList.add('leaving');
      const from = old.style.transform || 'none';
      old.style.transform = '';
      settled(old.animate([
        { transform: from, opacity: 1 },
        { transform: 'perspective(700px) rotateX(16deg) rotateZ(-3deg) translateY(4%)', opacity: 1, offset: 0.35 },
        { transform: 'perspective(700px) rotateX(58deg) rotateZ(-11deg) translate(-10%, 85%)', opacity: 0 },
      ], { duration: 420, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' }), 420, () => old.remove());
      page.animate([{ filter: 'brightness(0.92)' }, { filter: 'none' }], { duration: 420, easing: EASE });
      return;
    }
    if (kind === 'tear') {
      // Back: the previous sheet is laid back on top.
      pages.append(page);
      old.classList.add('leaving');
      page.classList.add('lifting');
      const done = () => { old.remove(); page.classList.remove('lifting'); };
      settled(page.animate([
        { transform: 'perspective(700px) rotateX(50deg) rotateZ(-9deg) translate(-8%, -26%)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ], { duration: 400, easing: EASE }), 400, done);
      return;
    }
    // Month, week and year pages slide a little in the direction of travel.
    pages.append(page);
    old.classList.add('leaving');
    page.animate([{ opacity: 0, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
    settled(old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 14}px)` }], { duration: 200, easing: 'ease-out' }), 200, () => old.remove());
  }

  function announce() {
    const fmt = { day: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, week: { day: 'numeric', month: 'long', year: 'numeric' }, month: { month: 'long', year: 'numeric' }, year: { year: 'numeric' } }[view];
    const info = lunarInfo(cursor);
    live.textContent = `${view === 'week' ? 'Week of ' : ''}${(view === 'week' ? weekStart(cursor) : cursor).toLocaleDateString(undefined, fmt)}${view === 'day' ? `, ${fullLunarLabel(info)} âm lịch` : ''}`;
  }

  function nav(dir) {
    cursor = addUnit(cursor, view, dir);
    show(view === 'day' ? 'tear' : 'slide', dir);
    announce();
  }

  function goToday() {
    const today = startOfDay(new Date());
    const dir = today > cursor ? 1 : -1;
    cursor = today;
    show(view === 'day' ? 'tear' : 'slide', dir);
    announce();
  }

  /** Switch view at a given date (clicking a day, a month in the year). */
  function go(v, date) {
    cursor = date;
    view = v;
    show('fade');
    announce();
    try { chrome.storage?.session?.set({ [VIEW_KEY]: v }); } catch { /* optional */ }
  }

  /** The view switch: lands on today when today is inside what you were looking at. */
  function setView(v) {
    if (v === view) return;
    const today = startOfDay(new Date());
    go(v, sameUnit(today, cursor, view) ? today : view === 'week' ? weekStart(cursor) : cursor);
  }

  function titleClick() {
    if (view === 'month') setView('year');
    else if (view !== 'year') setView('month');
  }

  // Keys work while focus is anywhere in the card (not while typing).
  el.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (el.dataset.size === 'mini') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nav(e.key === 'ArrowRight' ? 1 : -1); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); goToday(); }
    else if (e.key === 'Escape' && view !== 'month') { e.preventDefault(); e.stopPropagation(); setView('month'); }
  });

  // Day view: drag or swipe the sheet (left tears it off, right lays the previous one back) and
  // the scroll wheel turns pages, one per gesture.
  let drag = null;
  let suppressClick = false;
  pages.addEventListener('pointerdown', (e) => {
    if (view !== 'day' || e.button !== 0 || reduceMotion()) return;
    const page = pages.lastElementChild;
    if (!page || page.classList.contains('leaving')) return;
    drag = { x: e.clientX, id: e.pointerId, page, dx: 0, moved: false };
  });
  pages.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(drag.dx) < 6) return;
    if (!drag.moved) { drag.moved = true; pages.setPointerCapture(e.pointerId); drag.page.classList.add('lifting'); }
    const dx = Math.max(-140, Math.min(140, drag.dx));
    // Forward drags peel the sheet from its lower corner; backward drags just lean it.
    drag.page.style.transform = dx < 0
      ? `perspective(700px) rotateX(${(-dx / 140) * 14}deg) rotateZ(${dx / 28}deg) translate(${dx * 0.35}px, ${-dx * 0.06}px)`
      : `rotateZ(${dx / 60}deg) translateX(${dx * 0.25}px)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, moved, page } = drag;
    drag = null;
    if (!moved) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (dx < -50) { nav(1); return; }
    page.classList.remove('lifting');
    if (dx > 50) { page.style.transform = ''; nav(-1); return; }
    const from = page.style.transform;
    page.style.transform = '';
    page.classList.add('lifting');
    const settle = () => page.classList.remove('lifting');
    settled(page.animate([{ transform: from }, { transform: 'none' }], { duration: 240, easing: EASE }), 240, settle);
  };
  pages.addEventListener('pointerup', endDrag);
  pages.addEventListener('pointercancel', endDrag);
  pages.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  let wheelSum = 0, wheelLock = 0;
  pages.addEventListener('wheel', (e) => {
    if (view !== 'day') return;
    e.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelSum += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheelSum) < 40) return;
    nav(wheelSum > 0 ? 1 : -1);
    wheelSum = 0; wheelLock = Date.now() + 480;
  }, { passive: false });

  // Every new tab opens on today; the last view is remembered for this browser session.
  try {
    chrome.storage?.session?.get(VIEW_KEY).then((r) => {
      const v = r?.[VIEW_KEY];
      if (v && v !== view && VIEWS.some(([id]) => id === v)) { view = v; show('none'); }
    }, () => {});
  } catch { /* optional */ }

  return {
    draw: () => show('none'),
    /** When the tab comes back (maybe after midnight): redraw so "today" stays right. */
    refresh: () => show('none'),
  };
}
