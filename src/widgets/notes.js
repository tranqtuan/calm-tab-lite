/**
 * Notes: Today · Notes · Reminders, all on this device (chrome.storage.local).
 *  - Today: the day's checklist. Enter adds, click checks off, drag (or Alt+↑/↓) reorders.
 *    Unfinished items come along to the next day, marked "from yesterday". The target button
 *    sends an item to the Pomodoro card's task list.
 *  - Notes: a free scratchpad that saves as you type. "- " makes a bullet, "[ ] " a checkbox,
 *    links are clickable when you're not editing.
 *  - Reminders: a Chrome notification at that time (alarms in the service worker), even with no
 *    tab open, with Snooze and Done. Once, daily or weekly.
 * Big card: Today and Reminders beside the notes pad.
 */
import { card, h, render, sizeOf, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal, onLocalChanged } from '../shared/storage.js';
import { TODAY_KEY, PAD_KEY, REMINDERS_KEY, newId, rollOver, whenLabel } from '../shared/notes.js';
import { safeUrl } from '../shared/util.js';

const TABS = [['today', 'Today'], ['notes', 'Notes'], ['reminders', 'Reminders']];
const TAB_KEY = 'calm:notes-tab';
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|vn|co|me|so|ai)\/[^\s<>"')\]]*/gi;
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

/** Text with its links made clickable (only http/https). */
function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const href = safeUrl(/^https?:/i.test(m[0]) ? m[0] : `https://${m[0]}`);
    if (!href) continue;
    out.push(text.slice(last, m.index), h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, m[0].replace(/^https?:\/\//, '')));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** The next whole hour as "HH:MM" (the reminder time field's starting value). */
function nextHour() {
  const d = new Date(Date.now() + 60 * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

export default {
  id: 'notes',
  create(ctx) {
    const { el, body, tools, setGlance } = card('notes', 'Notes', 'checklist');
    let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'today'; } catch { return 'today'; } })();
    if (!TABS.some(([id]) => id === tab)) tab = 'today';
    let today = { day: '', items: [] };
    let pad = { text: '', at: 0 };
    let reminders = [];
    let editingPad = false;
    let dragId = null;
    let saved = null; // "Saved" note shown after the pad autosaves
    const hour12 = () => ctx.settings.timeFormat !== '24h';

    const saveToday = () => setLocal(TODAY_KEY, today);
    const saveReminders = async () => { await setLocal(REMINDERS_KEY, reminders); send({ type: 'reminders:sync' }); };
    let padTimer;
    const savePad = (text) => {
      pad = { text, at: Date.now() };
      clearTimeout(padTimer);
      padTimer = setTimeout(() => { setLocal(PAD_KEY, pad); saved = Date.now(); paintTools(); }, 400);
    };

    // ---------- Tabs ----------
    function paintTools() {
      if (sizeOf(el) === 'big') { render(tools); return; }
      const seg = h('div', { class: 'segmented mini', role: 'tablist', 'aria-label': 'Notes' },
        TABS.map(([id, label]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(id === tab), class: id === tab ? 'active' : '',
          onclick: () => { tab = id; try { localStorage.setItem(TAB_KEY, id); } catch { /* optional */ } draw(); },
        }, label)));
      const note = tab === 'today' && today.items.length ? `${doneCount()} of ${today.items.length} done`
        : tab === 'notes' && saved && Date.now() - saved < 4000 ? 'Saved' : '';
      render(tools, seg, h('span', { class: 'nt-meta', 'aria-live': 'polite' }, note));
      if (note === 'Saved') setTimeout(paintTools, 4100);
    }
    const doneCount = () => today.items.filter((i) => i.done).length;

    // ---------- Today ----------
    function todayView() {
      const items = today.items;
      const progress = items.length ? h('div', { class: 'nt-progress', role: 'progressbar', 'aria-label': 'Done today', 'aria-valuemin': '0', 'aria-valuemax': String(items.length), 'aria-valuenow': String(doneCount()) },
        h('span', { style: { width: `${(doneCount() / items.length) * 100}%` } })) : null;
      const list = h('ul', { class: 'nt-list', 'aria-label': 'Today' }, items.map((it) => todayItem(it)));
      const add = h('input', {
        class: 'nt-add', type: 'text', maxlength: '200', placeholder: 'Add a task', 'aria-label': 'Add a task for today',
        onkeydown: (e) => {
          if (e.key === 'Enter' && add.value.trim()) {
            today = { ...today, items: [...today.items, { id: newId(), text: add.value.trim(), done: false }] };
            saveToday(); draw(); el.querySelector('.nt-add')?.focus();
          } else if (e.key === 'Escape') add.blur();
        },
      });
      return h('div', { class: 'nt-today' }, progress, list, h('label', { class: 'nt-add-row' }, icon('plus', 14), add));
    }

    function todayItem(it) {
      const toggle = () => { today = { ...today, items: today.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) }; saveToday(); draw(it.id); };
      const remove = () => { today = { ...today, items: today.items.filter((x) => x.id !== it.id) }; saveToday(); draw(); };
      const move = (dir) => {
        const list = [...today.items];
        const i = list.findIndex((x) => x.id === it.id);
        const j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        today = { ...today, items: list }; saveToday(); draw(it.id);
      };
      const text = h('span', { class: 'nt-text', title: 'Double-click to edit' }, it.text);
      text.addEventListener('dblclick', () => edit());
      function edit() {
        const input = h('input', { class: 'nt-edit', type: 'text', value: it.text, maxlength: '200', 'aria-label': 'Edit task' });
        let finished = false;
        const finish = (keep) => {
          if (finished) return; finished = true;
          const v = input.value.trim();
          if (keep && v && v !== it.text) { today = { ...today, items: today.items.map((x) => (x.id === it.id ? { ...x, text: v } : x)) }; saveToday(); }
          draw(it.id);
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); });
        input.addEventListener('blur', () => finish(true));
        text.replaceWith(input);
        input.focus(); input.select();
      }
      const li = h('li', {
        class: `nt-item ${it.done ? 'done' : ''}`, dataset: { id: it.id }, draggable: 'true', tabindex: '-1',
        ondragstart: (e) => { dragId = it.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.text); },
        ondragend: () => { dragId = null; li.classList.remove('dragging'); el.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after')); },
        ondragover: (e) => {
          if (!dragId || dragId === it.id) return;
          e.preventDefault();
          const r = li.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          li.classList.toggle('drop-after', after); li.classList.toggle('drop-before', !after);
        },
        ondragleave: () => li.classList.remove('drop-before', 'drop-after'),
        ondrop: (e) => {
          e.preventDefault();
          if (!dragId || dragId === it.id) return;
          const after = li.classList.contains('drop-after');
          const moving = today.items.find((x) => x.id === dragId);
          const rest = today.items.filter((x) => x.id !== dragId);
          const at = rest.findIndex((x) => x.id === it.id) + (after ? 1 : 0);
          rest.splice(at, 0, moving);
          today = { ...today, items: rest }; saveToday(); draw();
        },
      },
      h('button', { class: 'nt-check', type: 'button', role: 'checkbox', 'aria-checked': String(!!it.done), 'aria-label': it.text, onclick: toggle,
        onkeydown: (e) => {
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(e.key === 'ArrowUp' ? -1 : 1); }
          else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
          else if (e.key === 'F2') { e.preventDefault(); edit(); }
        } }, icon('check', 11)),
      text,
      it.carried && !it.done ? h('span', { class: 'nt-tag' }, 'from yesterday') : null,
      h('span', { class: 'nt-actions' },
        !it.done ? h('button', { class: 'icon-btn small', type: 'button', title: 'Add to Pomodoro tasks', 'aria-label': `Add “${it.text}” to Pomodoro tasks`, onclick: () => toPomodoro(it.text) }, icon('target', 14)) : null,
        h('button', { class: 'icon-btn small', type: 'button', title: 'Remove', 'aria-label': `Remove “${it.text}”`, onclick: remove }, icon('x', 14))));
      return li;
    }

    async function toPomodoro(text) {
      const plan = await getLocal('pomodoro:tasks', { goal: '', tasks: [] });
      if (plan.tasks.some((t) => t.text === text && !t.done)) { toast('Already in your Pomodoro tasks'); return; }
      await setLocal('pomodoro:tasks', { ...plan, goal: plan.goal || 'Today', tasks: [...plan.tasks, { text, done: false }] });
      toast('Added to your Pomodoro tasks');
    }

    // ---------- Notes pad ----------
    function padView() {
      if (editingPad) {
        const ta = h('textarea', { class: 'nt-pad', 'aria-label': 'Notes', placeholder: 'Write anything…', spellcheck: 'true', maxlength: '20000' });
        ta.value = pad.text;
        const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, sizeOf(el) === 'big' ? 520 : 280)}px`; };
        ta.addEventListener('input', () => { savePad(ta.value); fit(); });
        ta.addEventListener('keydown', (e) => {
          e.stopPropagation(); // typing "z" must not toggle Zen mode
          if (e.key === 'Escape') { ta.blur(); return; }
          if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
          // Lists continue on Enter; Enter on an empty list line ends the list.
          const start = ta.selectionStart;
          const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
          const line = ta.value.slice(lineStart, start);
          const m = line.match(/^(\s*)(- |• |\[[ x]\] )/i);
          if (!m) return;
          e.preventDefault();
          if (line.trim() === m[2].trim()) { ta.setRangeText('', lineStart, start, 'end'); }
          else ta.setRangeText(`\n${m[1]}${m[2].startsWith('[') ? '[ ] ' : m[2]}`, start, ta.selectionEnd, 'end');
          savePad(ta.value); fit();
        });
        ta.addEventListener('blur', () => { clearTimeout(padTimer); setLocal(PAD_KEY, pad); editingPad = false; draw(); });
        requestAnimationFrame(() => { fit(); ta.focus(); });
        return ta;
      }
      const lines = pad.text.split('\n');
      const toggleLine = (i) => {
        const next = [...lines];
        next[i] = next[i].replace(/^(\s*)\[( |x)\]/i, (_, s, c) => `${s}[${c === ' ' ? 'x' : ' '}]`);
        pad = { text: next.join('\n'), at: Date.now() }; setLocal(PAD_KEY, pad); draw();
      };
      const view = h('div', {
        class: `nt-pad-view ${pad.text.trim() ? '' : 'empty'}`, tabindex: '0', role: 'button', 'aria-label': 'Notes. Press Enter to edit',
        onclick: (e) => { if (!e.target.closest('a, .nt-box')) { editingPad = true; draw(); } },
        onkeydown: (e) => { if (e.key === 'Enter' && e.target === view) { e.preventDefault(); editingPad = true; draw(); } },
      }, pad.text.trim() ? lines.map((line, i) => {
        const box = line.match(/^\s*\[( |x)\]\s?(.*)$/i);
        if (box) {
          const on = box[1].toLowerCase() === 'x';
          return h('div', { class: `nt-line box ${on ? 'done' : ''}` },
            h('button', { class: 'nt-box', type: 'button', role: 'checkbox', 'aria-checked': String(on), 'aria-label': box[2] || 'Checkbox', onclick: () => toggleLine(i) }, icon('check', 9)),
            h('span', {}, linkify(box[2])));
        }
        const bullet = line.match(/^\s*[-•*]\s(.*)$/);
        if (bullet) return h('div', { class: 'nt-line bullet' }, linkify(bullet[1]));
        return h('div', { class: `nt-line ${line.trim() ? '' : 'gap'}` }, linkify(line));
      }) : h('span', { class: 'muted' }, 'Write anything… “- ” makes a bullet, “[ ] ” a checkbox'));
      return view;
    }

    // ---------- Reminders ----------
    function remindersView(compact = false) {
      const list = [...reminders].sort((a, b) => (b.fired - a.fired) || a.at - b.at);
      const rows = list.map((r) => h('li', { class: `nt-rem ${r.fired ? 'due' : ''}` },
        h('span', { class: 'nt-bell', 'aria-hidden': 'true' }, icon(r.repeat !== 'none' && !r.fired ? 'repeat' : 'bell', 14)),
        h('span', { class: 'nt-text' }, r.text),
        r.fired
          ? h('span', { class: 'nt-due' },
            h('button', { class: 'chip-btn', type: 'button', onclick: () => send({ type: 'reminder:action', id: r.id, action: 'snooze' }) }, 'Snooze'),
            h('button', { class: 'chip-btn nt-done-btn', type: 'button', onclick: () => send({ type: 'reminder:action', id: r.id, action: 'done' }) }, 'Done'))
          : [
            h('span', { class: 'nt-when', title: r.repeat === 'daily' ? 'Every day' : r.repeat === 'weekly' ? 'Every week' : 'Once' }, whenLabel(r.at, new Date(), hour12())),
            h('span', { class: 'nt-actions' }, h('button', { class: 'icon-btn small', type: 'button', title: 'Delete reminder', 'aria-label': `Delete reminder “${r.text}”`,
              onclick: () => { reminders = reminders.filter((x) => x.id !== r.id); saveReminders(); draw(); } }, icon('x', 14))),
          ]));
      if (compact) return rows.length ? h('ul', { class: 'nt-list rems' }, rows) : h('p', { class: 'muted small nt-empty' }, 'No reminders');

      const text = h('input', { class: 'nt-add', type: 'text', maxlength: '160', placeholder: 'Remind me to…', 'aria-label': 'Reminder' });
      const time = h('input', { class: 'nt-time', type: 'time', value: nextHour(), 'aria-label': 'Time', required: true });
      const repeat = h('select', { class: 'nt-repeat', 'aria-label': 'Repeat' },
        [['none', 'Once'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([v, l]) => h('option', { value: v }, l)));
      const add = () => {
        const v = text.value.trim();
        if (!v || !time.value) { (v ? time : text).focus(); return; }
        const [hh, mm] = time.value.split(':').map(Number);
        const at = new Date(); at.setHours(hh, mm, 0, 0);
        if (at.getTime() <= Date.now() + 15000) at.setDate(at.getDate() + 1); // a time already past today means tomorrow
        reminders = [...reminders, { id: newId(), text: v, at: at.getTime(), repeat: repeat.value, fired: false }];
        saveReminders(); draw();
        toast(`Reminder set for ${whenLabel(at.getTime(), new Date(), hour12())}`);
        el.querySelector('.nt-rem-add .nt-add')?.focus();
      };
      [text, time].forEach((n) => n.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); }));
      return h('div', {},
        rows.length ? h('ul', { class: 'nt-list rems', 'aria-label': 'Reminders' }, rows) : h('p', { class: 'muted small nt-empty' }, 'Reminders pop up as a Chrome notification, even with no tab open.'),
        h('div', { class: 'nt-rem-add' }, h('label', { class: 'nt-add-row' }, icon('bell', 14), text),
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Add reminder', title: 'Add reminder', onclick: add }, icon('plus', 15)),
          h('span', { class: 'nt-break', 'aria-hidden': 'true' }), time, repeat));
    }

    // ---------- Draw ----------
    function glance() {
      const left = today.items.filter((i) => !i.done).length;
      const due = reminders.filter((r) => r.fired);
      const next = reminders.filter((r) => !r.fired).sort((a, b) => a.at - b.at)[0];
      const first = !today.items.length ? h('span', { class: 'muted' }, 'Nothing planned') : left ? h('b', {}, `${left} left today`) : h('b', {}, 'All done today');
      const rem = due.length ? h('span', { class: 'nt-gold' }, `${due.length} due`) : next ? h('span', { class: 'nt-gold' }, whenLabel(next.at, new Date(), hour12())) : null;
      setGlance(first, rem ? h('span', { class: 'muted' }, '·') : null, rem);
    }

    function draw(focusId) {
      glance();
      paintTools();
      const big = sizeOf(el) === 'big';
      if (big) {
        render(body, h('div', { class: 'nt-big' },
          h('div', { class: 'nt-col' },
            h('div', { class: 'nt-sec' }, 'Today', today.items.length ? h('span', {}, `${doneCount()} of ${today.items.length}`) : null), todayView(),
            h('div', { class: 'nt-sec' }, 'Reminders'), remindersView()),
          h('div', { class: 'nt-col nt-col-pad' }, h('div', { class: 'nt-sec' }, 'Notes'), padView())));
      } else {
        render(body, h('div', { class: 'nt fade-swap' }, tab === 'today' ? todayView() : tab === 'notes' ? padView() : remindersView()));
      }
      if (focusId) el.querySelector(`.nt-item[data-id="${focusId}"] .nt-check`)?.focus();
    }

    // ---------- Data ----------
    async function load() {
      const [t, p, r] = await Promise.all([getLocal(TODAY_KEY), getLocal(PAD_KEY, { text: '', at: 0 }), getLocal(REMINDERS_KEY, [])]);
      const rolled = rollOver(t);
      if (rolled !== t) setLocal(TODAY_KEY, rolled);
      today = rolled; pad = p; reminders = r;
      draw();
    }
    onLocalChanged([TODAY_KEY, PAD_KEY, REMINDERS_KEY], (key, value) => {
      // Our own save echoing back: nothing changed, and redrawing would drop keyboard focus.
      const mine = { [TODAY_KEY]: today, [PAD_KEY]: pad, [REMINDERS_KEY]: reminders }[key];
      if (JSON.stringify(value) === JSON.stringify(mine)) return;
      if (key === TODAY_KEY) today = value ?? { day: '', items: [] };
      if (key === REMINDERS_KEY) reminders = value ?? [];
      if (key === PAD_KEY) {
        // Our own autosave echoing back while typing: don't redraw under the cursor.
        if (editingPad) return;
        pad = value ?? { text: '', at: 0 };
      }
      if (el.contains(document.activeElement) && document.activeElement.matches('input, textarea')) { glance(); return; }
      draw();
    });
    // A new day while the tab sat open: roll the list over.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const rolled = rollOver(today);
      if (rolled !== today) { today = rolled; saveToday(); draw(); } else glance();
    });

    load();
    return { el, resize: () => draw(), update: () => glance() };
  },
};
