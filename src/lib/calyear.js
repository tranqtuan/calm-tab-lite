/**
 * Year view of the calendar: twelve small months, with the same marks as the month grid
 * (Sunday and days off red, Mùng 1 and Rằm gold, today the accent). The regular card draws each
 * day as a dot (hover for the date); the big card has room for the numbers. Tapping a month opens it.
 * Loaded on first use.
 */
import { h } from './dom.js';
import { dayMeta } from './calview.js';

export function yearPage(year, { today = new Date(), big = false, onMonth }) {
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = new Date(year, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const len = new Date(year, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(h('span', { class: 'yd blank' }));
    for (let day = 1; day <= len; day++) {
      const d = new Date(year, m, day);
      const meta = dayMeta(d, today);
      cells.push(h('span', { class: ['yd', ...meta.classes].join(' '), title: meta.title }, day));
    }
    const name = first.toLocaleDateString(undefined, { month: 'long' });
    const current = today.getFullYear() === year && today.getMonth() === m;
    return h('button', { type: 'button', class: `yr-month ${current ? 'current' : ''}`, title: `Open ${name} ${year}`, 'aria-label': `${name} ${year}`, onclick: () => onMonth(first) },
      h('span', { class: 'yr-name' }, first.toLocaleDateString(undefined, { month: 'short' })),
      h('span', { class: `yr-grid ${big ? 'nums' : 'dots'}`, 'aria-hidden': 'true' }, cells));
  });
  return h('div', { class: 'bloc-page year' }, h('div', { class: 'yr' }, months));
}
