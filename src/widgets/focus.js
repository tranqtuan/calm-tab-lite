/**
 * Time & Focus widget: Focus Mode toggle, today's active time by category (donut +
 * labelled legend), top 5 sites, and a 7-day stacked trend. All data is local,
 * written by the service worker's tracker ("track:YYYY-MM-DD").
 */
import { card, h, render, sizeOf, placeholder } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, onLocalChanged } from '../shared/storage.js';
import { CATEGORIES, DEFAULT_CATEGORY_MAP } from '../shared/defaults.js';
import { categoryFor, dayKey, formatDuration, lastDays, siteLabel } from '../shared/util.js';
import { hasHistoryAccess, requestHistoryAccess, importHistory, getHistoryMeta, HIST_PREFIX } from '../lib/history.js';

const COLOR = {
  Work: 'var(--cat-work)', Learning: 'var(--cat-learning)', 'Social Media': 'var(--cat-social)',
  Entertainment: 'var(--cat-entertainment)', News: 'var(--cat-news)', Other: 'var(--cat-other)',
};
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const FOCUSED = ['Work', 'Learning'];

function byCategory(day, overrides) {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const [domain, sec] of Object.entries(day ?? {})) totals[categoryFor(domain, overrides, DEFAULT_CATEGORY_MAP)] += sec;
  return totals;
}

/** Donut with a 2px surface gap between segments; native tooltips on hover. */
function donut(totals, total) {
  const R = 40, C = 2 * Math.PI * R, GAP = 2;
  const el = svg('svg', { class: 'donut', viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Time by category today' });
  el.append(svg('circle', { cx: 50, cy: 50, r: R, stroke: 'var(--hairline)' }));
  let offset = 0;
  const parts = CATEGORIES.filter((c) => totals[c] > 0);
  for (const c of parts) {
    const len = (totals[c] / total) * C;
    const seg = svg('circle', {
      cx: 50, cy: 50, r: R, stroke: COLOR[c],
      'stroke-dasharray': `${Math.max(0.5, len - (parts.length > 1 ? GAP : 0))} ${C}`,
      'stroke-dashoffset': String(-offset),
    });
    const title = svg('title', {});
    title.textContent = `${c}: ${formatDuration(totals[c])} (${Math.round((totals[c] / total) * 100)}%)`;
    seg.append(title);
    el.append(seg);
    offset += len;
  }
  return el;
}

export default {
  id: 'focus',
  create(ctx) {
    const { el, body, tools, setGlance } = card('focus', 'Time & focus', 'chart');
    let view = 'today';
    let focus = { active: false };
    let days = {};
    let overrides = {};
    let estimated = new Set(); // day keys whose numbers come from Chrome history
    let importing = null; // progress 0..1 while reading history
    let histAccess = false;

    const seg = h('div', { class: 'segmented' });
    tools.append(seg);

    const setFocusMode = async (active, minutes) => {
      const inSession = !active && focus.source === 'session'; // off during a Focus session = off for that session
      const next = await chrome.runtime.sendMessage({ type: 'focus:set', active, minutes }).catch(() => null);
      if (next) { focus = next; draw(); }
      ctx.toast(active ? `Focus Mode on${minutes ? ` for ${minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}` : ''} — distracting sites are paused` : inSession ? 'Blocking off for this Focus session' : 'Focus Mode off');
    };
    const focusRow = h('div', { class: 'focus-head' });
    let focusTimer = null;
    const content = h('div', {});
    body.append(focusRow, content);

    function drawSeg() {
      render(seg, [['today', 'Today'], ['week', 'Week']].map(([id, label]) =>
        h('button', { type: 'button', class: id === view ? 'active' : '', onclick: () => { view = id; draw(); } }, label)));
    }

    const minsLeft = () => Math.max(1, Math.ceil((focus.until - Date.now()) / 60000));
    function drawFocus() {
      clearTimeout(focusTimer);
      if (focus.active && focus.until && focus.until <= Date.now()) focus = { active: false };
      const blocked = ctx.settings.focus.blocked;
      if (focus.active) {
        render(focusRow,
          h('button', { class: `focus-pill on ${focus.source === 'session' ? 'in-session' : ''}`, type: 'button', 'aria-pressed': 'true', title: focus.source === 'session' ? 'Turn blocking off for this Focus session' : 'Turn Focus Mode off', onclick: () => setFocusMode(false) },
            h('span', { class: 'focus-dot' }), 'Focus Mode',
            h('span', { class: 'focus-pill-sub' }, focus.source === 'session' ? 'In session' : focus.until ? `${minsLeft()} min left` : focus.source === 'pomodoro' ? 'with Pomodoro' : 'on')),
          h('button', { class: 'link-btn focus-stop', type: 'button', onclick: () => setFocusMode(false) }, 'Stop'));
        // Keep the countdown honest and switch off on time.
        if (focus.until) focusTimer = setTimeout(drawFocus, Math.min(60000, focus.until - Date.now() + 50));
        return;
      }
      render(focusRow,
        h('button', { class: 'focus-pill', type: 'button', 'aria-pressed': 'false', title: blocked.length ? `Pauses ${blocked.join(' & ')}` : 'Choose distracting categories in Settings', onclick: () => setFocusMode(true) },
          icon('target', 14), 'Focus Mode'),
        h('div', { class: 'focus-durations', role: 'group', 'aria-label': 'Focus for' },
          [25, 60].map((m) => h('button', { class: 'chip', type: 'button', title: `Focus for ${m >= 60 ? '1 hour' : `${m} minutes`}`, onclick: () => setFocusMode(true, m) }, m >= 60 ? '1h' : `${m}m`))));
    }

    /** "Focused 2h 10m · 46% of active time" with progress toward the daily goal. */
    function focusHeadline(totals, total, est) {
      const focused = FOCUSED.reduce((a, c) => a + totals[c], 0);
      const goal = (ctx.settings.focus.goalHours ?? 4) * 3600;
      const pct = Math.round((focused / Math.max(total, 1)) * 100);
      const reached = focused >= goal;
      return h('div', { class: 'focus-headline' },
        h('div', { class: 'focus-total' }, `${est ? '≈ ' : ''}${formatDuration(focused)}`, h('span', { class: 'focus-total-of' }, ` of ${formatDuration(goal)}`)),
        h('div', { class: 'focus-total-label' }, `focused · ${pct}% of ${formatDuration(total)} active${est ? ' · estimated' : ''}`),
        h('div', { class: `focus-goal ${reached ? 'done' : ''}`, role: 'progressbar', 'aria-label': 'Daily focus goal', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, Math.round((focused / goal) * 100))) },
          h('span', { style: { width: `${Math.min(100, (focused / goal) * 100)}%` } })));
    }

    function drawToday(target = content) {
      const day = days[dayKey()] ?? {};
      const totals = byCategory(day, overrides);
      const total = Object.values(totals).reduce((a, b) => a + b, 0);
      if (total < 60) { render(target, emptyState()); return; }
      const est = estimated.has(dayKey());
      const top = Object.entries(day).sort((a, b) => b[1] - a[1]).slice(0, 5);
      render(target,
        focusHeadline(totals, total, est),
        h('div', { class: 'donut-wrap', style: { marginTop: '0.75rem' } },
          donut(totals, total),
          h('ul', { class: 'legend' }, CATEGORIES.filter((c) => totals[c] >= 30).map((c) =>
            h('li', {}, h('span', { class: 'swatch', style: { background: COLOR[c] } }), h('span', {}, c), h('span', { class: 'value' }, formatDuration(totals[c]))))),
        ),
        h('ul', { class: 'top-sites' }, top.map(([domain, sec]) => {
          const c = categoryFor(domain, overrides, DEFAULT_CATEGORY_MAP);
          return h('li', { title: `${siteLabel(domain)} · ${c}` },
            h('span', { class: 'swatch', style: { background: COLOR[c], width: '0.5rem', height: '0.5rem', borderRadius: '2px', flexShrink: 0 } }),
            h('span', { class: 'site' }, siteLabel(domain)), h('span', { class: 'value' }, formatDuration(sec)));
        })),
        insight(totals, total, day),
        nudgeStats(),
      );
    }

    function emptyState() {
      const canEstimate = chrome.permissions && !histAccess && importing == null;
      if (importing != null) return historyButton();
      return placeholder('Your time appears here as you browse. It never leaves this device.',
        canEstimate ? 'Estimate from Chrome history' : null, canEstimate ? askHistory : null, 'chart');
    }

    function drawWeek(target = content, withHistory = true) {
      const keys = lastDays(7);
      const perDay = keys.map((k) => byCategory(days[k], overrides));
      const sums = perDay.map((t) => Object.values(t).reduce((a, b) => a + b, 0));
      if (sums.every((x) => x < 60)) { render(target, emptyState()); return; }
      const max = Math.max(...sums, 1);
      const weekTotal = sums.reduce((a, b) => a + b, 0);
      const avg = weekTotal / Math.max(1, sums.filter((s) => s > 0).length);
      const today = dayKey();
      render(target,
        h('div', { class: 'focus-total' }, keys.some((k) => estimated.has(k)) ? `≈ ${formatDuration(weekTotal)}` : formatDuration(weekTotal)),
        h('div', { class: 'focus-total-label' }, `last 7 days · ${formatDuration(avg)} daily average`),
        h('div', { class: 'week-chart', role: 'img', 'aria-label': 'Active time over the last 7 days' },
          keys.map((k, i) => {
            const date = new Date(`${k}T12:00:00`);
            const label = date.toLocaleDateString(undefined, { weekday: 'narrow' });
            const heightPct = (sums[i] / max) * 100;
            const est = estimated.has(k);
            return h('div', { class: `week-bar ${est ? 'est' : ''}`, title: `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${est ? '≈ ' : ''}${formatDuration(sums[i])}${est ? ' (estimated from Chrome history)' : ''}` },
              h('div', { class: 'week-stack', style: { height: `${heightPct}%`, minHeight: sums[i] ? '2px' : '0' } },
                CATEGORIES.filter((c) => perDay[i][c] > 0).map((c) =>
                  h('span', { style: { flexGrow: String(perDay[i][c]), background: COLOR[c] }, title: `${c}: ${formatDuration(perDay[i][c])}` }))),
              h('span', { class: `week-label ${k === today ? 'today' : ''}` }, label));
          })),
        h('ul', { class: 'legend', style: { marginTop: '0.75rem' } },
          CATEGORIES.map((c) => {
            const sec = perDay.reduce((a, t) => a + t[c], 0);
            return sec >= 60 ? h('li', {}, h('span', { class: 'swatch', style: { background: COLOR[c] } }), h('span', {}, c), h('span', { class: 'value' }, formatDuration(sec))) : null;
          })),
        keys.some((k) => estimated.has(k)) ? h('p', { class: 'focus-note' }, 'Faded bars (≈) are estimated from Chrome history.') : null,
        weeklySummary(keys),
        withHistory ? historyButton() : null,
      );
    }

    /** "Estimate from Chrome history" — asks for the optional permission from this click. */
    function historyButton() {
      if (!chrome.permissions) return null;
      if (importing != null) return h('div', { class: 'focus-note' }, `Reading Chrome history… ${Math.round(importing * 100)}%`);
      if (histAccess) return null; // estimates refresh automatically once allowed
      return h('button', { class: 'link-btn focus-hist', type: 'button', onclick: askHistory }, 'Estimate past days from Chrome history');
    }
    function askHistory() {
      requestHistoryAccess().then((ok) => {
        if (!ok) return ctx.toast('Chrome history access was not allowed');
        histAccess = true;
        runImport();
      }).catch(() => ctx.toast('Chrome history is not available here'));
    }

    /** Weekly summary: how often "back to work" was chosen this week. */
    function weeklySummary(keys) {
      const box = h('div', { class: 'focus-insight' });
      chrome.storage.local.get(keys.map((k) => `nudge:saves:${k}`)).then((r) => {
        const saves = Object.values(r).reduce((a, b) => a + b, 0);
        if (!saves) return;
        render(box, h('span', { class: 'card-title' }, 'This week'), h('p', {}, `You chose “back to work” ${saves} time${saves > 1 ? 's' : ''} this week. Nice escapes!`));
      });
      return box;
    }

    /** Saves today + streak of days under the distraction goal (from distraction nudges). */
    function nudgeStats() {
      const box = h('div', { class: 'nudge-stats' });
      chrome.storage.local.get(['nudge:stats', `nudge:saves:${dayKey()}`]).then((r) => {
        const saves = r[`nudge:saves:${dayKey()}`] ?? 0;
        const streak = r['nudge:stats']?.streak ?? 0;
        if (!saves && !streak) return;
        render(box,
          saves ? h('span', { class: 'stat-pill' }, `🛟 ${saves} save${saves > 1 ? 's' : ''} today`) : null,
          streak ? h('span', { class: 'stat-pill' }, `🔥 ${streak}-day streak`) : null);
      });
      return box;
    }

    /** One practical, rule-based reflection per day. */
    function insight(totals, total, day) {
      const box = h('div', { class: 'focus-insight' });
      const DISTRACT = ['Social Media', 'Entertainment'];
      const distracted = DISTRACT.reduce((a, c) => a + totals[c], 0);
      const best = CATEGORIES.filter((c) => c !== 'Other').sort((a, b) => totals[b] - totals[a])[0];
      const share = Math.round((distracted / Math.max(total, 1)) * 100);
      const tip = share >= 30
        ? `About ${share}% went to ${DISTRACT.filter((c) => totals[c] > 0).join(' and ') || 'distractions'}. Try a 25-minute Pomodoro before you next open them.`
        : share >= 15 ? 'A balanced day so far. Batch quick social checks into one break.' : 'Great focus so far — keep your best work for the next hour.';
      const rule = `Most of your time went to ${best} (${formatDuration(totals[best])}). ${tip}`;
      render(box, h('span', { class: 'card-title' }, 'Insight'), h('p', {}, rule));
      return box;
    }

    async function runImport() {
      importing = 0;
      draw();
      try {
        const r = await importHistory(30, (p) => { importing = p; draw(); });
        ctx.toast(`Estimated ${r.days} days from ${r.visits.toLocaleString()} history visits`);
      } catch (err) {
        ctx.toast('Couldn’t read Chrome history');
        console.info('[Calm Tab] history import failed:', err?.message ?? err);
      } finally {
        importing = null;
        load();
      }
    }

    function draw() {
      drawSeg();
      drawFocus();
      const totals = byCategory(days[dayKey()] ?? {}, overrides);
      const total = Object.values(totals).reduce((a, b) => a + b, 0);
      const focused = FOCUSED.reduce((a, c) => a + totals[c], 0);
      // Mini: "Focused 2h 10m · 46%" and the Focus Mode state.
      setGlance(total < 60 ? h('span', { class: 'muted' }, 'No time tracked yet') : h('b', {}, `Focused ${formatDuration(focused)}`),
        total < 60 ? null : h('span', { class: 'muted' }, `${Math.round((focused / total) * 100)}%`),
        h('span', { class: focus.active ? 'glance-on' : 'muted' }, focus.active ? (focus.until ? `· Focus ${minsLeft()}m` : '· Focus on') : '· Focus off'));
      if (sizeOf(el) === 'big') {
        // Big card: today and the week side by side; one empty state and one history link for both.
        const anyData = lastDays(7).some((k) => Object.values(byCategory(days[k], overrides)).reduce((a, b) => a + b, 0) >= 60);
        if (!anyData) { render(content, emptyState()); return; }
        const a = h('div', {}), b = h('div', {});
        drawToday(a); drawWeek(b, false);
        render(content, h('div', { class: 'focus-big' }, a, b), historyButton());
        return;
      }
      view === 'today' ? drawToday() : drawWeek();
    }

    const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

    async function load() {
      const dayKeys = lastDays(7);
      const keys = dayKeys.flatMap((d) => [`track:${d}`, `${HIST_PREFIX}${d}`]);
      const [stored, f, o] = await Promise.all([chrome.storage.local.get(keys), getLocal('focus:state', { active: false }), getLocal('categories:overrides', {})]);
      // Per day, use whichever is larger: precise live tracking or the history estimate
      // (live tracking only covers time since Calm Tab was installed).
      days = {};
      estimated = new Set();
      for (const d of dayKeys) {
        const tracked = stored[`track:${d}`], hist = stored[`${HIST_PREFIX}${d}`];
        if (hist && sum(hist) > sum(tracked)) { days[d] = hist; estimated.add(d); }
        else if (tracked) days[d] = tracked;
      }
      focus = f.active && f.until && f.until < Date.now() ? { active: false } : f;
      overrides = o;
      draw();
    }

    // Draw from storage at once; the worker's flush (it may be waking up) only adds the last minute.
    load();
    chrome.runtime.sendMessage({ type: 'tracker:flush' }).catch(() => {}).finally(load);
    // Once history access is allowed, refresh the estimates at most every 6 hours.
    hasHistoryAccess().then(async (ok) => {
      histAccess = ok && !!chrome.history;
      if (!histAccess) return draw();
      const meta = await getHistoryMeta();
      if (!meta || Date.now() - meta.at > 6 * 60 * 60 * 1000) runImport(); else draw();
    }).catch(() => {});
    onLocalChanged(['track:*', 'focus:state', 'categories:overrides'], () => { if (!document.hidden && importing == null) load(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

    return { el, update: draw, resize: draw };
  },
};
