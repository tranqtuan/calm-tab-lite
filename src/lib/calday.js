/**
 * Day view of the calendar: one sheet of a glass "lịch bloc". A large solar date (red on Sundays
 * and days off), the weekday, any special day, then a two-box footer like the printed sheet: the
 * lunar date on one side, Can Chi and the year's animal on the other, and the day's good hours
 * (giờ hoàng đạo). Loaded on first use.
 */
import { h } from './dom.js';
import { lunarInfo, label, CHI_ANIMAL } from '../shared/lunar.js';
import { specialDays } from '../shared/days.js';
import { dayReading, headline, RATING_WORDS, TRUC_GUIDE } from '../shared/fengshui.js';
import { VN_DOW, sameDay } from './calview.js';

const lunarMonthName = (m) => (m === 1 ? 'Giêng' : m === 12 ? 'Chạp' : String(m));
const hours = (range) => `${range}h`;

export function dayPage(d, { today = new Date(), onMonth }) {
  const info = lunarInfo(d);
  const days = specialDays(d, info);
  const r = dayReading(d);
  const red = d.getDay() === 0 || days.some((x) => x.off);
  const full = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return h('div', { class: `bloc-page day ${red ? 'red' : ''} ${sameDay(d, today) ? 'is-today' : ''}` },
    h('button', { type: 'button', class: 'day-num', onclick: onMonth, title: 'Back to the month', 'aria-label': `${full}. Back to the month` }, d.getDate()),
    h('div', { class: 'day-wd' }, VN_DOW[d.getDay()], sameDay(d, today) ? h('span', { class: 'day-today' }, 'Today') : null),
    // Always present, so every sheet has the same height and pages turn without a jump.
    h('div', { class: 'day-chips' },
      days.map((x) => h('span', { class: `cal-holiday ${x.off ? 'off' : ''}` }, x.off ? `${x.name} · nghỉ lễ` : x.name)),
      h('span', { class: `day-chip ${r.hoangDao ? 'good' : ''}`, title: r.hoangDao ? `Ngày hoàng đạo (${r.thanName}): a favourable day` : `Ngày hắc đạo (${r.thanName}): keep plans simple` }, r.hoangDao ? 'Hoàng đạo' : 'Hắc đạo')),
    h('div', { class: 'day-foot' },
      h('div', { class: 'day-lunar' },
        h('span', { class: 'day-small' }, `Tháng ${lunarMonthName(info.month)}${info.leap ? ' nhuận' : ''} ÂL`),
        h('span', { class: 'day-lnum' }, info.day),
        h('span', { class: 'day-small' }, `Năm ${label(info.yearCC)}`)),
      h('div', { class: 'day-cc' },
        h('span', { class: 'day-small' }, 'Ngày'),
        h('b', {}, label(info.dayCC)),
        h('span', { class: 'day-small' }, `Tháng ${label(info.monthCC)}`),
        h('span', { class: 'day-small' }, `Con ${CHI_ANIMAL[info.yearCC.chi]}`))),
    h('div', { class: 'day-hours', 'aria-label': 'Giờ tốt (good hours)' },
      r.goodHours.map((g) => h('span', { class: 'day-chip', title: `Giờ ${g.name} · ${hours(g.range)}` }, g.name))),
  );
}

/** Big card: what the day is good for and what to avoid, beside the sheet. */
export function dayReadingPanel(d) {
  const r = dayReading(d);
  const guide = TRUC_GUIDE[r.truc];
  const list = (items, good) => h('ul', { class: `day-list ${good ? 'good' : 'avoid'}` }, items.map(([en, vi]) => h('li', {}, en, h('span', { class: 'muted small' }, ` · ${vi}`))));
  return h('div', { class: 'day-reading' },
    h('div', { class: 'cal-group-title' }, `${RATING_WORDS[r.rating]} day · Trực ${r.truc}`),
    h('p', { class: 'day-headline' }, headline(r)),
    guide ? h('div', { class: 'day-cols' },
      h('div', {}, h('div', { class: 'cal-group-title' }, 'Good for'), list(guide.good, true)),
      h('div', {}, h('div', { class: 'cal-group-title' }, 'Avoid'), list(guide.avoid, false))) : null,
    h('div', { class: 'cal-group-title' }, 'Good hours'),
    h('div', { class: 'day-hour-list' }, r.goodHours.map((g) => h('span', {}, h('b', {}, g.name), ` ${hours(g.range)}`))));
}
