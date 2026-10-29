/**
 * Calendar widget: a glass "lịch bloc" with Day · Week · Month · Year views. Every day shows the
 * solar and the Vietnamese lunar date, with weekends, days off and special days of both
 * calendars (see lib/calview.js). Fully offline.
 */
import { card, h, sizeOf } from '../lib/dom.js';
import { lunarInfo } from '../shared/lunar.js';
import { mountCalendar, upcoming } from '../lib/calview.js';

/** Mini card: "Wed, 28 Oct · 8/9 ÂL". */
function glanceParts() {
  const now = new Date();
  const info = lunarInfo(now);
  return [h('b', {}, now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })), h('span', { class: 'muted' }, `${info.day}/${info.month} ÂL`)];
}

export default {
  id: 'calendar',
  create(ctx) {
    const { el, body, tools, setGlance } = card('calendar', 'Calendar', 'calendar');
    const cal = mountCalendar({
      el, body, tools,
      isBig: () => sizeOf(el) === 'big',
      // Big card: the coming special days beside the month or week.
      side: () => h('div', {}, upcoming()),
    });

    function draw() {
      setGlance(...glanceParts());
      cal.draw();
    }

    draw();
    // Redraw when the tab comes back, so "today" stays right after midnight.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { setGlance(...glanceParts()); cal.refresh(); } });

    let sig = JSON.stringify(ctx.settings.calendar);
    return {
      el,
      resize: () => draw(),
      update(s) {
        const next = JSON.stringify(s.calendar);
        if (next !== sig) { sig = next; draw(); }
      },
    };
  },
};
