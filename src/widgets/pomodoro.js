/**
 * Pomodoro widget. The timer itself lives in the service worker (chrome.alarms);
 * this card only renders state from "pomodoro:state" and sends commands.
 * Start can begin a Focus session (timer + Focus Mode + ambient sound together): the card then
 * becomes the Focus session card until the session ends (see lib/sessioncard.js).
 */
import { card, h, render, iconButton, sizeOf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal, onLocalChanged } from '../shared/storage.js';
import { dayKey } from '../shared/util.js';
import { choicePanel, sessionPanel, sessionStart, sessionStop } from '../lib/sessioncard.js';
import { SOUNDS } from '../shared/sounds.js';

const LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const R = 44;
const CIRC = 2 * Math.PI * R;

const send = (action) => chrome.runtime.sendMessage({ type: 'pomodoro', action }).catch(() => null);

export default {
  id: 'pomodoro',
  create(ctx) {
    const { el, body, actions, title, setGlance } = card('pomodoro', 'Pomodoro', 'timer');
    const glanceTime = h('b', { class: 'tabular' });
    let state = { phase: 'focus', status: 'idle', cycle: 0 };
    let today = 0;
    let ticker;

    // Skip and reset sit next to play/pause (the header keeps only the size controls).
    const PRESETS = [15, 25, 50];
    let log = []; // today's finished sessions: [{ end, minutes }]

    const progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const ring = h('div', { class: 'pomo-ring' });
    ring.innerHTML = `<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="${R}" fill="none" stroke-width="3"/></svg>`;
    Object.entries({ class: 'progress', cx: 50, cy: 50, r: R, fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': CIRC }).forEach(([k, v]) => progress.setAttribute(k, v));
    ring.firstChild.append(progress);
    const time = h('div', { class: 'pomo-time' });
    ring.append(time);
    const side = h('div', { class: 'pomo-side' });
    const tasksBox = h('div', { class: 'pomo-tasks' });
    const dayBox = h('div', { class: 'pomo-day' }); // Big only: today's timeline and total
    body.append(h('div', { class: 'pomo' }, ring, side), dayBox, tasksBox);

    // ---------- Focus session: timer + Focus Mode + sound together ----------
    const sessBox = h('div', { class: 'pomo-sess' });
    const live = h('div', { class: 'sound-live', 'aria-live': 'polite' });
    body.insertBefore(sessBox, dayBox);
    body.append(live);
    const titleText = title.lastElementChild;
    let session = { active: false };
    let snd = { playing: false, duck: 1, volume: 0.5 };
    let focusOn = false;
    let choosing = false;
    let confirming = false;
    let lastKey = null;
    const sessionKey = () => (session.active ? `${state.phase === 'focus' ? 'work' : 'break'}` : 'off');
    function announce() {
      const key = sessionKey();
      if (lastKey !== null && key !== lastKey) {
        live.textContent = key === 'off' ? 'Focus session ended' : lastKey === 'off' ? 'Focus session started' : key === 'break' ? 'Break' : 'Back to work';
      }
      lastKey = key;
    }
    /** Start: a Focus session when enabled (asking once what comes along), otherwise the plain timer. */
    const startTimer = () => {
      const ss = ctx.settings.session ?? {};
      if (state.status !== 'idle' || ss.enabled === false) return send('toggle');
      if (!ss.asked) { choosing = true; draw(); return; }
      sessionStart({ block: ss.block !== false, sound: ss.sound !== false, track: ctx.settings.sound.track });
    };
    Promise.all([chrome.storage.local.get(['session:state', 'focus:state']), chrome.storage.session.get('sound:state')]).then(([l, sess]) => {
      session = l['session:state'] ?? session;
      focusOn = !!l['focus:state']?.active;
      snd = { ...snd, ...sess['sound:state'] };
      lastKey = sessionKey();
      draw();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      let dirty = false;
      if (area === 'local' && changes['session:state']) { session = changes['session:state'].newValue ?? { active: false }; if (!session.active) confirming = false; dirty = true; }
      if (area === 'local' && changes['focus:state']) { focusOn = !!changes['focus:state'].newValue?.active; dirty = session.active; }
      if (area === 'session' && changes['sound:state']) { snd = { ...snd, ...changes['sound:state'].newValue }; dirty = dirty || session.active; }
      if (dirty) draw();
    });
    let addingTask = false;

    // ---------- Task breakdown: a goal split into 25-minute steps attached to the timer ----------
    const TASKS_KEY = 'pomodoro:tasks'; // { goal, tasks: [{ text, done }] }
    let plan = { goal: '', tasks: [] };
    const savePlan = () => setLocal(TASKS_KEY, plan);

    function drawTasks() {
      if (!plan.tasks.length && !addingTask && sizeOf(el) !== 'big') {
        render(tasksBox, h('button', { class: 'link-btn pomo-add', type: 'button', onclick: () => { addingTask = true; drawTasks(); tasksBox.querySelector('input')?.focus(); } }, icon('plus', 13), 'Add a task'));
        return;
      }
      if (!plan.tasks.length) {
        const input = h('input', { class: 'field wide', placeholder: 'What are you working on?', maxlength: '160', 'aria-label': 'Goal for this session' });
        const add = () => {
          const parts = input.value.split(/[\n;,]|\s+(?:then|and then)\s+/i).map((t) => t.trim()).filter(Boolean);
          if (!parts.length) return;
          plan = { goal: input.value.trim(), tasks: parts.map((text) => ({ text, done: false })) };
          addingTask = false; savePlan(); drawTasks(); draw();
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { addingTask = false; drawTasks(); } });
        render(tasksBox, h('div', { class: 'pomo-goal' }, input,
          h('button', { class: 'chip-btn', type: 'button', onclick: add, title: 'Add as tasks (separate with commas)' }, icon('plus', 12))));
        return;
      }
      const next = plan.tasks.findIndex((t) => !t.done);
      render(tasksBox,
        h('div', { class: 'pomo-goal-title' }, h('span', {}, plan.goal),
          h('button', { class: 'icon-btn small', type: 'button', title: 'Clear plan', 'aria-label': 'Clear plan', onclick: () => { plan = { goal: '', tasks: [] }; addingTask = false; savePlan(); drawTasks(); draw(); } }, icon('x', 13))),
        h('ul', { class: 'pomo-checklist' }, plan.tasks.map((t, i) => {
          const cb = h('input', { type: 'checkbox', 'aria-label': t.text });
          cb.checked = t.done;
          cb.addEventListener('change', () => { plan.tasks[i].done = cb.checked; savePlan(); drawTasks(); });
          return h('li', { class: `${t.done ? 'done' : ''} ${i === next ? 'current' : ''}` }, h('label', {}, cb, h('span', {}, t.text), h('span', { class: 'muted small' }, ' 25m')));
        })),
        next < 0 ? h('div', { class: 'muted small' }, 'All done — nice work. 🎉') : null);
    }

    drawTasks(); // the empty state ("+ Add a task") is there from the first frame; saved tasks replace it
    getLocal(TASKS_KEY, plan).then((p) => { plan = p; drawTasks(); });
    // Tasks added elsewhere (the Notes card's Today list, another tab).
    onLocalChanged(TASKS_KEY, (_k, p) => { if (!el.contains(document.activeElement) || !document.activeElement.matches('input')) { plan = p ?? { goal: '', tasks: [] }; drawTasks(); } });
    let lastCount = null;

    const totalMs = () => state.durationMs ?? ctx.settings.pomodoro[state.phase] * 60000;
    const remainingMs = () => {
      if (state.status === 'running') return Math.max(0, state.endsAt - Date.now());
      if (state.status === 'paused') return state.remainingMs;
      return ctx.settings.pomodoro[state.phase] * 60000;
    };

    function tick() {
      const ms = remainingMs();
      const s = Math.ceil(ms / 1000);
      time.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      glanceTime.textContent = time.textContent;
      progress.setAttribute('stroke-dashoffset', String(CIRC * (1 - ms / totalMs())));
      if (state.status === 'running') document.title = `${time.textContent} · ${LABEL[state.phase]}`;
    }

    function draw() {
      announce();
      if (session.active) { drawSession(); return; }
      titleText.textContent = 'Pomodoro';
      el.classList.remove('in-session');
      ring.classList.remove('is-break', 'is-paused');
      tasksBox.hidden = false;
      const ss = ctx.settings.session ?? {};
      const canChoose = state.status === 'idle' && ss.enabled !== false;
      if (!canChoose) choosing = false;
      render(sessBox, choosing
        ? choicePanel({
          settings: ctx.settings,
          onStart: (pick) => {
            choosing = false;
            ctx.save({ session: { ...ss, block: pick.block, sound: pick.sound, asked: true }, sound: { ...ctx.settings.sound, track: pick.track } });
            sessionStart({ block: pick.block, sound: pick.sound, track: pick.track });
          },
          onTimerOnly: () => { choosing = false; ctx.save({ session: { ...ss, asked: true } }); send('toggle'); },
        })
        : canChoose && ss.asked ? h('button', { class: 'link-btn pomo-sess-opts', type: 'button', onclick: () => { choosing = true; draw(); } }, 'Session options') : null);
      const running = state.status === 'running';
      const every = ctx.settings.pomodoro.longEvery;
      const goal = ctx.settings.pomodoro.dailyGoal ?? 4;
      const task = plan.tasks.find((t) => !t.done)?.text;
      render(side,
        h('div', { class: 'pomo-phase' }, LABEL[state.phase], state.status === 'paused' ? h('span', { class: 'muted' }, ' · paused') : null),
        h('div', { class: 'pomo-controls' },
          h('button', { class: 'icon-btn main', type: 'button', 'aria-label': running ? 'Pause' : 'Start', title: running ? 'Pause' : 'Start', onclick: () => (state.status === 'idle' ? startTimer() : send('toggle')) },
            icon(running ? 'pause' : 'play', 16)),
          iconButton('skip', 'Skip to next', () => send('skip'), 'small'),
          iconButton('reset', 'Reset', () => send('reset'), 'small'),
        ),
        state.status === 'idle' && state.phase === 'focus' ? h('div', { class: 'pomo-presets', role: 'radiogroup', 'aria-label': 'Focus length' }, PRESETS.map((m) =>
          h('button', { type: 'button', role: 'radio', class: `chip ${ctx.settings.pomodoro.focus === m ? 'on' : ''}`, 'aria-checked': String(ctx.settings.pomodoro.focus === m), onclick: () => ctx.save({ pomodoro: { ...ctx.settings.pomodoro, focus: m } }) }, `${m}m`))) : null,
        // One dot per session in the daily goal, filled as today's sessions finish.
        h('div', { class: 'pomo-dots', title: `${today} of ${goal} focus sessions today · long break every ${every}` },
          Array.from({ length: Math.min(12, Math.max(goal, today)) }, (_, i) => h('span', { class: `pomo-dot ${i < today ? 'done' : ''}` })),
          h('span', {}, `${today} of ${goal} today`),
        ),
      );
      drawDay();
      // Mini card: a live countdown with its own play/pause, so the timer works while collapsed.
      setGlance(
        h('button', { class: 'icon-btn small glance-btn', type: 'button', 'aria-label': running ? 'Pause' : 'Start', title: running ? 'Pause' : 'Start', onclick: () => (state.status === 'idle' ? startTimer() : send('toggle')) }, icon(running ? 'pause' : 'play', 13)),
        glanceTime, h('span', { class: 'muted' }, running || state.status === 'paused'
          ? `${state.status === 'paused' ? 'paused' : 'left'} · ${state.phase === 'focus' ? (task ?? 'Focus') : LABEL[state.phase]}`
          : `${today} of ${goal} today`));
      clearInterval(ticker);
      if (running) ticker = setInterval(tick, 1000);
      else document.title = 'New Tab';
      tick();
    }

    /** The card while a Focus session runs: timer, phase and task, then the session group and controls. */
    function drawSession() {
      const running = state.status === 'running';
      const paused = state.status === 'paused';
      const work = state.phase === 'focus';
      const every = ctx.settings.pomodoro.longEvery;
      const goal = ctx.settings.pomodoro.dailyGoal ?? 4;
      const task = plan.tasks.find((t) => !t.done)?.text;
      const entering = !el.classList.contains('in-session');
      titleText.textContent = 'Focus session';
      el.classList.add('in-session');
      ring.classList.toggle('is-break', !work);
      ring.classList.toggle('is-paused', paused);
      tasksBox.hidden = true;
      choosing = false;
      const playing = !!snd.playing && session.sound;
      render(side,
        h('div', { class: 'pomo-phase' }, paused ? 'Paused' : work ? 'Focus' : 'Break',
          h('span', { class: `sess-pill ${work ? '' : 'break'}` }, playing && !paused ? h('span', { class: 'eq mini', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : null,
            work ? `${(state.cycle % every) + 1} of ${every}` : `${ctx.settings.pomodoro[state.phase]} min`)),
        h('div', { class: 'pomo-task' }, work ? (task ?? 'Deep work') : state.phase === 'long' ? 'Long break · step away' : 'Stretch, drink water'),
        h('div', { class: 'pomo-dots', title: `${today} of ${goal} focus sessions today` },
          Array.from({ length: Math.min(12, Math.max(goal, today)) }, (_, i) => h('span', { class: `pomo-dot ${i < today ? 'done' : ''}` })),
          h('span', {}, `${today} of ${goal} today`)));
      const panel = sessionPanel({
        session, snd, work, paused, focusOn, confirming,
        onToggle: () => send('toggle'),
        onSkip: () => send('skip'),
        // Ending with more than 5 minutes of focus left asks first.
        onStop: () => { if (work && remainingMs() > 5 * 60000) { confirming = true; draw(); } else sessionStop(); },
        onConfirmStop: () => { confirming = false; sessionStop(); },
        onCancelStop: () => { confirming = false; draw(); },
      });
      if (entering) panel.classList.add('entering');
      render(sessBox, panel);
      drawDay();
      const parts = [SOUNDS[session.track]?.label && session.sound ? `${SOUNDS[session.track].label}${snd.duck < 1 && playing ? ` ${Math.round(snd.duck * 100)}%` : ''}` : null, work && session.block ? 'Blocking' : null].filter(Boolean);
      setGlance(
        h('button', { class: 'icon-btn small glance-btn', type: 'button', 'aria-label': running ? 'Pause' : 'Resume', title: running ? 'Pause' : 'Resume', onclick: () => send('toggle') }, icon(running ? 'pause' : 'play', 13)),
        glanceTime, h('span', { class: 'muted' }, [paused ? 'paused' : work ? 'left' : 'break', ...parts].join(' · ')));
      clearInterval(ticker);
      if (running) ticker = setInterval(tick, 1000);
      tick();
    }

    function drawDay() {
      if (sizeOf(el) !== 'big') { render(dayBox); dayBox.hidden = true; return; }
      dayBox.hidden = false;
      const start = new Date(); start.setHours(6, 0, 0, 0);
      const span = 18 * 3600000; // 06:00 → 24:00
      const total = log.reduce((a, x) => a + x.minutes, 0);
      const pct = (t) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
      render(dayBox,
        h('div', { class: 'pomo-day-head' }, h('span', { class: 'pomo-day-title' }, 'Today'),
          h('span', { class: 'muted small' }, total ? `${Math.floor(total / 60) ? `${Math.floor(total / 60)}h ` : ''}${total % 60}m focused` : 'No sessions yet')),
        h('div', { class: 'pomo-track', role: 'img', 'aria-label': `${log.length} focus sessions today` },
          log.map((x) => h('span', { class: 'pomo-seg', title: `${x.minutes} min · ended ${new Date(x.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
            style: { left: `${pct(x.end - x.minutes * 60000)}%`, width: `${Math.max(1.2, pct(x.end) - pct(x.end - x.minutes * 60000))}%` } })),
          h('span', { class: 'pomo-now', style: { left: `${pct(Date.now())}%` } })),
        h('div', { class: 'pomo-axis' }, ['6', '12', '18', '24'].map((t) => h('span', {}, t))));
    }

    const loadLog = () => getLocal(`pomolog:${dayKey()}`, []).then((l) => { log = l; });
    loadLog().then(drawDay);
    const loadToday = () => getLocal(`pomo:${dayKey()}`, 0).then((n) => { today = n; });
    Promise.all([getLocal('pomodoro:state'), loadToday()]).then(([s]) => { if (s) state = { ...state, ...s }; lastCount = today; draw(); });
    onLocalChanged(['pomodoro:state', 'pomo:*', 'pomolog:*'], async (key, value) => {
      if (key === 'pomodoro:state') state = { ...state, ...value };
      else if (key.startsWith('pomolog:')) { log = value ?? []; drawDay(); return; }
      else {
        const before = today;
        await loadToday();
        if (lastCount !== null && today > before) {
          const i = plan.tasks.findIndex((t) => !t.done);
          if (i >= 0) { plan.tasks[i].done = true; savePlan(); drawTasks(); ctx.toast(`✓ ${plan.tasks[i].text}`); }
        }
        lastCount = today;
      }
      draw();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    return { el, update: draw, resize: () => { drawTasks(); draw(); } };
  },
};
