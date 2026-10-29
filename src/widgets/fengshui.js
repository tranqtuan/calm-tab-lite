/**
 * Phong thủy widget, designed to be read at a glance.
 *  Today: score ring + plain-language headline, Best for / Avoid (from the day's Trực),
 *         a 24-hour timeline of good hours with a "now" marker, personal compatibility,
 *         and a short glossary.
 *  Month: heat map of day ratings; click a day for its summary.
 *  You:   element badge, compass of lucky directions, real colour swatches.
 * Birth details live only in chrome.storage.local.
 */
import { card, h, render, sizeOf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, onLocalChanged } from '../shared/storage.js';
import { profile, dayReading, RATING_WORDS, TRUC_GUIDE, headline, GLOSSARY, COLOR_HEX, COLOR_EN, ELEMENT_COLOR, CHI } from '../shared/fengshui.js';
import { fullLunarLabel, CHI_ANIMAL } from '../shared/lunar.js';

export const PROFILE_KEY = 'fengshui:profile';
const VIEW_KEY = 'fengshui:view';
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

/** Ring showing the 1–5 rating, coloured on the diverging scale. */
function scoreRing(rating) {
  const R = 30, C = 2 * Math.PI * R;
  return h('div', { class: 'fs-ring', 'aria-label': `${rating} out of 5 — ${RATING_WORDS[rating]}` },
    svg('svg', { viewBox: '0 0 72 72', 'aria-hidden': 'true' },
      svg('circle', { cx: 36, cy: 36, r: R, fill: 'none', stroke: 'var(--hairline)', 'stroke-width': 5 }),
      svg('circle', { cx: 36, cy: 36, r: R, fill: 'none', stroke: `var(--fs-${rating})`, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': `${(rating / 5) * C} ${C}`, transform: 'rotate(-90 36 36)' })),
    h('div', { class: 'fs-ring-label' }, h('b', {}, String(rating)), h('span', {}, '/5')));
}

/** 24-hour strip: 12 two-hour blocks, good ones filled, a marker at the current time. */
function hourTimeline(goodHours, isToday) {
  const good = new Set(goodHours.map((g) => g.chi));
  const now = new Date();
  const nowPct = ((now.getHours() * 60 + now.getMinutes() + 60) % 1440) / 1440 * 100; // strip starts at 23:00 (giờ Tý)
  const blocks = Array.from({ length: 12 }, (_, chi) =>
    h('span', { class: `fs-block ${good.has(chi) ? 'good' : ''}`, title: `Giờ ${CHI[chi]} · ${String((chi * 2 + 23) % 24).padStart(2, '0')}:00–${String((chi * 2 + 1) % 24).padStart(2, '0')}:00 ${good.has(chi) ? '· good' : ''}` },
      h('span', { class: 'fs-block-name' }, CHI[chi])));
  return h('div', { class: 'fs-timeline' },
    h('div', { class: 'fs-blocks' }, blocks, isToday ? h('span', { class: 'fs-now', style: { left: `${nowPct}%` }, title: 'Now' }) : null),
    h('div', { class: 'fs-ticks' }, ['23h', '5h', '11h', '17h', '23h'].map((t) => h('span', {}, t))));
}

function nextGoodHour(goodHours) {
  const hour = new Date().getHours();
  const chiNow = Math.floor(((hour + 1) % 24) / 2);
  if (goodHours.some((g) => g.chi === chiNow)) return 'Now is a good hour';
  const next = [...goodHours].sort((a, b) => ((a.chi - chiNow + 12) % 12) - ((b.chi - chiNow + 12) % 12))[0];
  return next ? `Next good hour: ${next.name} (${next.range}h)` : '';
}

function guideList(kind, items) {
  return h('div', { class: `fs-guide ${kind}` },
    h('div', { class: 'fs-guide-title' }, icon(kind === 'good' ? 'check' : 'x', 13), kind === 'good' ? 'Best for' : 'Avoid'),
    h('ul', {}, items.slice(0, 3).map(([en, vi]) => h('li', {}, en, h('span', { class: 'muted' }, ` · ${vi}`)))));
}

/** 8-point compass with the four lucky directions highlighted. */
function compass(lucky) {
  const POS = { Bắc: [50, 12], 'Đông Bắc': [77, 23], Đông: [88, 50], 'Đông Nam': [77, 77], Nam: [50, 88], 'Tây Nam': [23, 77], Tây: [12, 50], 'Tây Bắc': [23, 23] };
  const EN = { Bắc: 'N', 'Đông Bắc': 'NE', Đông: 'E', 'Đông Nam': 'SE', Nam: 'S', 'Tây Nam': 'SW', Tây: 'W', 'Tây Bắc': 'NW' };
  const best = lucky[0].dir;
  const goodDirs = new Set(lucky.map((l) => l.dir));
  const el = svg('svg', { viewBox: '0 0 100 100', class: 'fs-compass', role: 'img', 'aria-label': `Lucky directions: ${lucky.map((l) => l.en).join(', ')}` },
    svg('circle', { cx: 50, cy: 50, r: 46, fill: 'none', stroke: 'var(--hairline)' }),
    svg('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: 'var(--hairline)', 'stroke-dasharray': '2 3' }));
  for (const [dir, [x, y]] of Object.entries(POS)) {
    const on = goodDirs.has(dir);
    if (on) el.append(svg('line', { x1: 50, y1: 50, x2: x, y2: y, stroke: dir === best ? 'var(--fs-5)' : 'var(--fs-4)', 'stroke-width': dir === best ? 3 : 2, 'stroke-linecap': 'round' }));
    el.append(svg('circle', { cx: x, cy: y, r: on ? 7.5 : 6, fill: on ? (dir === best ? 'var(--fs-5)' : 'var(--fs-4)') : 'var(--hover)' }));
    const t = svg('text', { x, y: y + 2.6, 'text-anchor': 'middle', class: `fs-compass-label ${on ? 'on' : ''}` });
    t.textContent = EN[dir];
    el.append(t);
  }
  el.append(svg('circle', { cx: 50, cy: 50, r: 3, fill: 'var(--text-3)' }));
  return el;
}

const swatches = (names, cls = '') => h('span', { class: `fs-swatches ${cls}` },
  names.map((n) => h('span', { class: 'fs-swatch-chip', title: `${n} · ${COLOR_EN[n] ?? ''}` }, h('i', { style: { background: COLOR_HEX[n] ?? '#888' } }), COLOR_EN[n] ?? n)));

export default {
  id: 'fengshui',
  create(ctx) {
    const { el, body, tools, setGlance } = card('fengshui', 'Phong thủy', 'compass');
    const tabs = h('div', { class: 'segmented mini' });
    tools.append(tabs);
    let view = 'today';
    let prof = null;
    let pickedDay = null;

    function drawTabs() {
      render(tabs, [['today', 'Today'], ['month', 'Month'], ['profile', 'You']].map(([id, text]) =>
        h('button', { type: 'button', class: id === view ? 'active' : '', onclick: () => { view = id; pickedDay = null; chrome.storage.local.set({ [VIEW_KEY]: id }); draw(); } }, text)));
    }

    const setupLink = (text) => h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.openSettings('fengshui') }, text);

    function daySummary(date, compact = false, lean = false) {
      const r = dayReading(date, prof);
      const guide = TRUC_GUIDE[r.truc];
      const isToday = date.toDateString() === new Date().toDateString();
      const hero = h('div', { class: 'fs-hero' },
        scoreRing(r.rating),
        h('div', { class: 'fs-hero-text' },
          h('div', { class: 'fs-word', style: { color: `var(--fs-text-${r.rating})` } }, RATING_WORDS[r.rating]),
          h('div', { class: 'fs-headline' }, headline(r)),
          h('div', { class: 'fs-date muted' }, `${isToday ? '' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · '}Ngày ${r.dayLabel} · ${fullLunarLabel(r.info).replace(/ năm .*/, '')}`)));
      if (lean) {
        const [en, vi] = guide.good[0] ?? [];
        return h('div', { class: 'fs-today fade-swap' }, hero,
          h('ul', { class: 'fs-lean' },
            en ? h('li', {}, h('span', { class: 'fs-lean-k good' }, icon('check', 13), 'Best for'), h('span', {}, en, h('span', { class: 'muted' }, ` · ${vi}`))) : null,
            isToday ? h('li', {}, h('span', { class: 'fs-lean-k' }, icon('timer', 13), 'Hours'), h('span', {}, nextGoodHour(r.goodHours))) : null),
          h('button', { class: 'link-btn fs-more', type: 'button', onclick: () => ctx.setSize?.('fengshui', 'big') }, 'Full reading'));
      }
      return h('div', { class: 'fs-today fade-swap' },
        hero,
        h('div', { class: 'fs-tags' },
          h('span', { class: `fs-tag ${r.hoangDao ? 'good' : 'bad'}`, title: r.hoangDao ? 'A favourable “golden path” day' : 'A less favourable “dark path” day' }, r.hoangDao ? '☀ Hoàng đạo' : '☾ Hắc đạo', h('span', { class: 'muted' }, ` · ${r.thanName}`)),
          h('span', { class: 'fs-tag', title: 'The day’s activity type in the 12-day Trực cycle' }, `Trực ${r.truc}`),
          r.relation && r.relation.kind !== 'neutral'
            ? h('span', { class: `fs-tag ${r.relation.score > 0 ? 'good' : 'bad'}`, title: `How today’s sign relates to your ${prof.animal} year` }, `${r.relation.score > 0 ? '♥' : '!'} ${r.relation.label} · ${prof.animal}`)
            : null),
        compact ? null : h('div', { class: 'fs-guides' }, guideList('good', guide.good), guideList('avoid', guide.avoid)),
        h('div', { class: 'fs-section-title' }, 'Good hours · giờ hoàng đạo',
          isToday ? h('span', { class: 'fs-next' }, nextGoodHour(r.goodHours)) : null),
        hourTimeline(r.goodHours, isToday),
        compact ? null : h('details', { class: 'fs-why' },
          h('summary', {}, 'Why this rating?'),
          h('ul', { class: 'fs-reasons' }, r.reasons.map((x) => h('li', { class: x.good ? 'good' : 'bad' }, x.text)))),
      );
    }

    function today() {
      const big = sizeOf(el) === 'big';
      if (!big) return daySummary(new Date(), false, true);
      return h('div', {},
        daySummary(new Date()),
        h('details', { class: 'fs-glossary' },
          h('summary', {}, 'What do these mean?'),
          h('dl', {}, GLOSSARY.map(([term, text]) => [h('dt', {}, term), h('dd', {}, text)]))));
    }

    function month() {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const offset = (first.getDay() + 6) % 7;
      const dows = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
      const cells = Array.from({ length: offset }, () => h('span'));
      let good = 0;
      for (let d = 1; d <= days; d++) {
        const date = new Date(now.getFullYear(), now.getMonth(), d);
        const r = dayReading(date, prof);
        if (r.rating >= 4) good++;
        cells.push(h('button', {
          type: 'button',
          class: `fs-cell r${r.rating} ${d === now.getDate() ? 'today' : ''} ${pickedDay === d ? 'picked' : ''}`,
          title: `${d}: ${RATING_WORDS[r.rating]} · ${r.hoangDao ? 'Hoàng đạo' : 'Hắc đạo'} · Trực ${r.truc}`,
          onclick: () => { pickedDay = pickedDay === d ? null : d; draw(); },
        }, d));
      }
      const picked = pickedDay ? new Date(now.getFullYear(), now.getMonth(), pickedDay) : null;
      return h('div', { class: 'fs-month fade-swap' },
        h('div', { class: 'fs-month-head' },
          h('span', { class: 'cal-month' }, now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
          h('span', { class: 'muted small' }, `${good} good days`)),
        h('div', { class: 'fs-heat' }, dows.map((d) => h('span', { class: 'dow' }, d)), cells),
        h('div', { class: 'fs-legend' }, h('span', {}, 'Avoid'), [1, 2, 3, 4, 5].map((n) => h('span', { class: `fs-swatch r${n}`, title: RATING_WORDS[n] })), h('span', {}, 'Excellent')),
        picked ? h('div', { class: 'fs-picked' }, daySummary(picked, true)) : h('p', { class: 'muted small fs-tip' }, 'Tap a day to see its reading.'),
      );
    }

    function you() {
      if (!prof) {
        return h('div', { class: 'fs-empty' },
          icon('compass', 28),
          h('div', {}, 'See your element, lucky directions and colours'),
          h('button', { class: 'pill-btn primary', type: 'button', onclick: () => ctx.openSettings('fengshui') }, 'Add my birthday'));
      }
      const p = prof;
      return h('div', { class: 'fs-profile fade-swap' },
        h('div', { class: 'fs-identity' },
          h('span', { class: 'fs-element', style: { '--el': ELEMENT_COLOR[p.element] } }, p.element),
          h('div', {},
            h('div', { class: 'fs-animal' }, `Tuổi ${p.yearLabel}`),
            h('div', { class: 'muted small' }, `${p.animalEn} (${p.animal}) · ${p.elementEn} element · ${p.napAm.name}`),
            p.hourChi ? h('div', { class: 'muted small' }, `Born in giờ ${p.hourChi} (${CHI_ANIMAL[CHI.indexOf(p.hourChi)]})`) : null)),
        h('div', { class: 'fs-section-title' }, `Lucky directions · cung ${p.cung} (${p.group})`),
        h('div', { class: 'fs-dir-wrap' },
          compass(p.lucky),
          h('ul', { class: 'fs-dirs' }, p.lucky.map((l, i) => h('li', { class: i === 0 ? 'best' : '' },
            h('b', {}, l.en), h('span', {}, ` ${l.dir}`), h('div', { class: 'muted small' }, `${l.name} · ${l.meaning}`))))),
        h('div', { class: 'fs-section-title' }, 'Colours'),
        h('div', { class: 'fs-colors' },
          h('div', {}, h('span', { class: 'fs-color-label' }, 'Your element'), swatches(p.colors.own)),
          h('div', {}, h('span', { class: 'fs-color-label' }, 'Supporting'), swatches(p.colors.support)),
          h('div', {}, h('span', { class: 'fs-color-label' }, 'Avoid'), swatches(p.colors.avoid, 'avoid'))),
      );
    }

    function draw() {
      drawTabs();
      const r = dayReading(new Date(), prof);
      setGlance(h('b', { style: { color: `var(--fs-text-${r.rating})` } }, `${r.rating}/5`), h('span', {}, RATING_WORDS[r.rating]),
        h('span', { class: 'muted' }, r.hoangDao ? 'Hoàng đạo' : 'Hắc đạo'));
      // Big card: today and the month heat map side by side.
      const main = sizeOf(el) === 'big' && view !== 'profile'
        ? h('div', { class: 'fs-big' }, today(), month())
        : view === 'today' ? today() : view === 'month' ? month() : you();
      // One birthday prompt for the whole card (the You tab has its own full-size one).
      const cta = prof || view === 'profile' ? null
        : h('div', { class: 'fs-cta' }, icon('info', 14), h('span', {}, 'Add your birthday for a personal reading. '), setupLink('Set up'));
      render(body, main, cta, h('p', { class: 'fs-note' }, 'Traditional Vietnamese almanac guidance, for reflection.'));
    }

    async function load() {
      const [stored, v] = await Promise.all([getLocal(PROFILE_KEY), getLocal(VIEW_KEY, 'today')]);
      try { prof = stored?.birthDate ? profile(stored) : null; } catch { prof = null; }
      view = v;
      draw();
    }

    load();
    onLocalChanged(PROFILE_KEY, load);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
    setInterval(() => { if (!document.hidden && view === 'today' && !body.querySelector('details[open]')) draw(); }, 5 * 60 * 1000); // keep the "now" marker moving
    return { el, resize: () => draw() };
  },
};
