/**
 * Calm Tab distraction nudge — injected on demand by the service worker (chrome.scripting)
 * into a distracting tab. Renders inside a closed Shadow DOM so the site's CSS can't touch it.
 *   Level 1 · gentle: corner toast, auto-dismisses after 8 s
 *   Level 2 · cheeky: card with actions
 *   Level 3 · dramatic: full-screen frosted overlay (page blurred), actions after 5 s
 * Messages come from the extension; this script only displays them and reports button clicks.
 */
(() => {
  if (window.__calmNudge) return; // already injected in this page
  window.__calmNudge = true;

  let host = null;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif; }
    .wrap { position: fixed; z-index: 2147483647; color: #f5f5f7; }
    .glass { background: rgba(28, 30, 34, 0.72); -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.16); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.2); }
    .l1 { right: 20px; bottom: 20px; max-width: 340px; border-radius: 16px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start;
      animation: spring-in 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
    .l2 { right: 24px; bottom: 24px; width: 380px; border-radius: 20px; padding: 18px; animation: spring-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
    .l3 { inset: 0; display: grid; place-items: center; background: rgba(10, 12, 16, 0.45); -webkit-backdrop-filter: blur(18px) saturate(120%); backdrop-filter: blur(18px) saturate(120%);
      animation: fade 400ms ease-out both; }
    .l3 .panel { width: min(520px, calc(100vw - 48px)); border-radius: 26px; padding: 32px 30px 26px; text-align: center; animation: spring-in 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
    .emoji { font-size: 22px; line-height: 1; }
    .l2 .emoji { font-size: 30px; margin-bottom: 8px; }
    .l3 .emoji { font-size: 54px; margin-bottom: 14px; animation: bob 2.4s ease-in-out infinite; }
    .msg { font-size: 14px; line-height: 1.45; font-weight: 450; }
    .l2 .msg { font-size: 16px; font-weight: 500; }
    .l3 .msg { font-size: 22px; line-height: 1.4; font-weight: 500; letter-spacing: -0.01em; }
    .meta { margin-top: 6px; font-size: 11px; color: rgba(255, 255, 255, 0.55); letter-spacing: 0.02em; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .l3 .actions { justify-content: center; margin-top: 22px; }
    button { all: unset; cursor: pointer; font-size: 13px; font-weight: 500; padding: 8px 13px; border-radius: 999px; background: rgba(255, 255, 255, 0.1);
      color: #f5f5f7; transition: background 160ms ease, transform 120ms ease; }
    button:hover { background: rgba(255, 255, 255, 0.18); }
    button:active { transform: scale(0.96); }
    button:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.6); outline-offset: 2px; }
    button.primary { background: #f5f5f7; color: #111; }
    button.primary:hover { background: #fff; }
    .close { margin-left: auto; padding: 2px 8px; font-size: 16px; line-height: 1; background: transparent; color: rgba(255,255,255,.6); }
    .count { font-size: 12px; color: rgba(255, 255, 255, 0.6); margin-top: 18px; }
    .hidden { display: none; }
    @keyframes spring-in { from { opacity: 0; transform: translateY(18px) scale(0.94); } to { opacity: 1; transform: none; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes bob { 50% { transform: translateY(-6px) rotate(-4deg); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k); // strings become text nodes (never HTML)
    return n;
  }

  function remove() {
    host?.remove();
    host = null;
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') remove(); }

  function act(action) {
    chrome.runtime.sendMessage({ type: 'nudge:action', action, url: location.href }).catch(() => {});
    remove();
  }

  function chime() {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.65);
      setTimeout(() => ctx.close(), 900);
    } catch { /* audio not allowed */ }
  }

  function buttons(p) {
    const vi = p.lang === 'vi';
    return el('div', { class: 'actions' },
      el('button', { class: 'primary', onclick: () => act('back') }, vi ? 'Đúng rồi, làm việc thôi' : 'You’re right, back to work'),
      el('button', { onclick: () => act('snooze') }, vi ? '5 phút nữa' : '5 more minutes'),
      el('button', { onclick: () => act('learning') }, vi ? 'Mình đang học mà' : 'This is for learning'),
      p.pomodoroRunning ? '' : el('button', { onclick: () => act('pomodoro') }, vi ? 'Bắt đầu Pomodoro' : 'Start a Pomodoro'));
  }

  function show(p) {
    remove();
    host = document.createElement('calm-tab-nudge');
    const root = host.attachShadow({ mode: 'closed' });
    root.append(el('style', {}, CSS));
    const meta = el('div', { class: 'meta' }, 'Calm Tab Lite');
    if (p.level === 1) {
      const card = el('div', { class: 'wrap glass l1', role: 'status' },
        el('span', { class: 'emoji' }, p.emoji),
        el('div', {}, el('div', { class: 'msg' }, p.text), meta),
        el('button', { class: 'close', 'aria-label': 'Dismiss', onclick: remove }, '×'));
      root.append(card);
      setTimeout(remove, 8000);
    } else if (p.level === 2) {
      root.append(el('div', { class: 'wrap glass l2', role: 'dialog', 'aria-label': 'Calm Tab reminder' },
        el('div', { class: 'emoji' }, p.emoji), el('div', { class: 'msg' }, p.text), meta, buttons(p)));
    } else {
      const acts = buttons(p);
      acts.classList.add('hidden');
      const count = el('div', { class: 'count' }, '5');
      root.append(el('div', { class: 'wrap l3', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Calm Tab reminder' },
        el('div', { class: 'panel glass' }, el('div', { class: 'emoji' }, p.emoji), el('div', { class: 'msg' }, p.text), meta, count, acts)));
      // A short pause before the buttons appear, so the moment lands.
      let s = 5;
      const t = setInterval(() => {
        s--;
        count.textContent = String(s);
        if (s <= 0) { clearInterval(t); count.remove(); acts.classList.remove('hidden'); acts.querySelector('button')?.focus(); }
      }, 1000);
    }
    document.documentElement.append(host);
    document.addEventListener('keydown', onKey, true);
    if (p.sound) chime();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'nudge:show') show(msg.payload);
  });
})();
