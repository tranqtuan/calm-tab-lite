/**
 * Calm Tab — New Tab page entry point.
 * Critical path: src/boot.js has already applied the theme, glass and a blurred photo in the
 * first frame. This module (with only the clock, storage and DOM helpers as static imports)
 * paints the clock, date and the cached centre text from the last-known settings, lets the
 * browser show that frame, then wires up the widgets, whose modules load in parallel
 * meanwhile. Heavy, rarely used modules (Settings, ambient sound, AI) load on demand.
 */
import { getSettings, saveSettings, onSettingsChanged } from './shared/storage.js';
import { COLUMN_WIDGETS, WIDGET_LABELS } from './shared/defaults.js';
import { h, toast, iconButton, render } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { initClock, update as updateClock, FACES } from './widgets/clock.js';
import { initBackground } from './widgets/background.js';
import { restoreCenter, watchCenter } from './lib/paintcache.js';

// Startup timing (DevTools → Performance → Timings): ct:start → ct:clock → ct:bg → ct:cards → ct:idle.
performance.mark('ct:start');

// Start fetching everything that isn't needed for the first frame right away, in parallel.
const WIDGET_IDS = ['weather', 'fact', 'vocab', 'news', 'pomodoro', 'calendar', 'focus', 'fengshui', 'producthunt', 'icebreaker', 'notes', 'sites'];
const later = Promise.all([
  import('./lib/liquid.js'), import('./widgets/affirmation.js'), import('./widgets/quote.js'),
  ...WIDGET_IDS.map((id) => import(`./widgets/${id}.js`)),
]);
const REGISTRY = {};

const root = document.documentElement;
const columns = { left: document.getElementById('col-left'), right: document.getElementById('col-right') };
const affirmationEl = document.getElementById('affirmation');
const quoteEl = document.getElementById('quote');
const signatureEl = document.getElementById('signature');

// Last-known settings (saved by this page in localStorage) paint the first frame without waiting
// for chrome.storage; the real settings replace them a moment later, before any card is built.
const settingsReady = getSettings();
const SNAP_KEY = 'calm:settings';
const snapshot = (() => { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch { return null; } })();
let settings = snapshot ?? await settingsReady;
const remember = () => { try { localStorage.setItem(SNAP_KEY, JSON.stringify(settings)); } catch { /* optional */ } };
let affirmation;
let quote;
const instances = new Map();
const listeners = new Set();

/** Context object handed to every widget. */
const ctx = {
  get settings() { return settings; },
  /** Optimistically apply a settings patch, then persist it. */
  async save(patch) {
    settings = { ...settings, ...patch };
    applyAll();
    await saveSettings(patch);
  },
  toast,
  openSettings: (section) => openSettings(section),
  /** Let a widget expand or collapse itself (e.g. Ice breaker before a meeting). */
  setSize: (id, size) => setSize(id, size),
  /** Let non-column modules (e.g. sound, settings) react to settings changes. */
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// ---------- Theme & Zen ----------
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme = settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme;
  root.dataset.theme = theme;
}
darkQuery.addEventListener('change', applyTheme);

/** Glass transparency 0 (frosted) … 100 (clear) → tint opacity and blur radius. */
function applyGlass(value = settings.glass?.transparency ?? 50) {
  const t = Math.min(100, Math.max(0, Number(value) || 0)) / 100;
  root.style.setProperty('--glass-a', (0.62 - t * 0.56).toFixed(3)); // 0.62 → 0.06
  root.style.setProperty('--glass-blur', `${Math.round(30 - t * 14)}px`); // 30px → 16px, always legible
}
ctx.previewGlass = applyGlass;

function applyZen() {
  root.classList.toggle('zen', !!settings.zen);
  zenBtn?.classList.toggle('active', !!settings.zen);
  zenBtn?.setAttribute('aria-label', settings.zen ? 'Exit Zen mode' : 'Zen mode');
  zenBtn?.setAttribute('title', settings.zen ? 'Exit Zen mode (Z)' : 'Zen mode (Z)');
}

// ---------- Widget layout ----------
function layout() {
  const placed = new Set();
  const all = [...settings.layout.left, ...settings.layout.right];
  // Widgets added in future versions that aren't in the saved layout go to the right column.
  const missing = COLUMN_WIDGETS.filter((id) => !all.includes(id));
  const plan = { left: settings.layout.left, right: [...settings.layout.right, ...missing] };

  for (const side of ['left', 'right']) {
    let pos = 0;
    for (const id of plan[side]) {
      if (!REGISTRY[id] || settings.widgets[id] === false || placed.has(id)) continue;
      let inst = instances.get(id);
      if (!inst) {
        inst = REGISTRY[id].create(ctx);
        instances.set(id, inst);
        addSizeControls(id, inst);
      }
      // Only move a card when it is not already in its slot: re-inserting a node restarts its
      // CSS animations, which made every card flash on each settings change.
      const slot = columns[side].children[pos] ?? null;
      if (slot !== inst.el) columns[side].insertBefore(inst.el, slot);
      pos++;
      applySize(id, inst);
      placed.add(id);
    }
  }
  for (const [id, inst] of instances) {
    if (!placed.has(id)) inst.el.remove();
  }
  for (const col of Object.values(columns)) { const s = spacers.get(col); if (s && col.lastElementChild !== s) col.append(s); }
}

// ---------- Column scroll anchoring ----------
// When a card shrinks inside a scrolled column, the column gets shorter and the browser
// would clamp its scroll position, sliding every card down (and the button out from under
// the pointer). A hidden spacer at the end keeps the scroll length while the card shrinks;
// it melts away as soon as it is no longer needed (e.g. when you scroll back up).
const spacers = new Map();
function spacerFor(col) {
  let s = spacers.get(col);
  if (!s) {
    s = h('div', { class: 'col-spacer', 'aria-hidden': 'true' });
    spacers.set(col, s);
    col.addEventListener('scroll', () => trimSpacer(col), { passive: true });
  }
  if (col.lastElementChild !== s) col.append(s);
  return s;
}
function trimSpacer(col) {
  const s = spacers.get(col);
  const current = s?.offsetHeight ?? 0;
  if (!current) return;
  const content = col.scrollHeight - current;
  const needed = Math.max(0, Math.ceil(col.scrollTop + col.clientHeight - content));
  if (needed < current) s.style.height = `${needed}px`;
}

// ---------- Card sizes: mini (collapsed to one line) · regular · big ----------
const SIZES = ['mini', 'regular', 'big'];
const sizeFor = (id) => (SIZES.includes(settings.sizes?.[id]) ? settings.sizes[id] : 'regular');

/** Change card sizes without re-rendering the page: only the affected cards update and animate. */
function setSizes(patch) {
  const sizes = { ...settings.sizes };
  for (const [id, size] of Object.entries(patch)) { if (size === 'regular') delete sizes[id]; else sizes[id] = size; }
  settings = { ...settings, sizes };
  for (const id of Object.keys(patch)) {
    const inst = instances.get(id);
    if (inst?.el.isConnected) animateSize(inst, () => applySize(id, inst));
  }
  remember();
  saveSettings({ sizes });
}
const setSize = (id, size) => setSizes({ [id]: size });
ctx.setSize = setSize;
ctx.setSizes = setSizes;

// Motion: an iOS-style ease-out (fast start, long soft landing). Height and padding animate
// together so the header glides instead of jumping; the content folds away or fades in.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION = 460;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function animateSize(inst, change) {
  const el = inst.el;
  inst.sizeAnims?.forEach((a) => a.cancel());
  el.classList.remove('size-anim', 'collapsing');
  if (reduceMotion.matches || document.hidden) return change();

  const box = () => { const cs = getComputedStyle(el); return { height: `${el.getBoundingClientRect().height}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom }; };
  const fromMini = el.dataset.size === 'mini';
  const from = box();
  // Reserve the scroll length first, so the column cannot clamp while the card shrinks.
  const col = el.parentElement;
  const spacer = col?.classList.contains('column') ? spacerFor(col) : null;
  const held = spacer?.offsetHeight ?? 0;
  if (spacer) spacer.style.height = `${held + parseFloat(from.height)}px`;
  change();
  const to = box();
  // Keep the length through the whole animation (the card starts at its old height); trim when it ends.
  if (spacer) spacer.style.height = `${held + Math.max(0, parseFloat(from.height) - parseFloat(to.height))}px`;
  const toMini = el.dataset.size === 'mini';

  el.classList.add('size-anim');
  if (toMini && !fromMini) el.classList.add('collapsing'); // keep the old content visible while it folds away
  const timing = { duration: DURATION, easing: EASE };
  const body = el.querySelector('.card-body'), tools = el.querySelector('.card-tools');
  const glance = el.querySelector('.card-glance'), label = el.querySelector('.card-title > span');
  const anims = [el.animate([from, to], timing)];
  if (toMini && !fromMini) {
    anims.push(...[body, tools].map((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' })));
    anims.push(glance.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 120, easing: EASE, fill: 'backwards' }));
  } else if (fromMini && !toMini) {
    anims.push(...[body, tools, label].map((n) => n.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 340, delay: 80, easing: EASE, fill: 'backwards' })));
  } else {
    // regular <-> big: the card re-renders with more or less content; let it settle in softly.
    anims.push(body.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 320, easing: EASE }));
  }
  inst.sizeAnims = anims;
  const done = () => { if (inst.sizeAnims !== anims) return; el.classList.remove('size-anim', 'collapsing'); anims.forEach((a) => a.cancel()); inst.sizeAnims = null; if (spacer) trimSpacer(col); };
  anims[0].finished.then(done, () => {});
}

function addSizeControls(id, inst) {
  const collapse = h('button', { class: 'icon-btn size-btn', type: 'button' });
  const grow = h('button', { class: 'icon-btn size-btn', type: 'button' });
  collapse.addEventListener('click', (e) => { e.stopPropagation(); setSize(id, sizeFor(id) === 'mini' ? 'regular' : 'mini'); });
  grow.addEventListener('click', (e) => { e.stopPropagation(); setSize(id, sizeFor(id) === 'big' ? 'regular' : 'big'); });
  inst.el.querySelector('.card-actions')?.append(grow, collapse);
  // A collapsed card opens again from a click anywhere on its header.
  inst.el.querySelector('.card-head')?.addEventListener('click', (e) => {
    if (sizeFor(id) === 'mini' && !e.target.closest('button, a, input, select, label')) setSize(id, 'regular');
  });
  // Keep the title clear of the hover controls: track their real width.
  const actions = inst.el.querySelector('.card-actions');
  new ResizeObserver(() => inst.el.style.setProperty('--actions-w', `${actions.offsetWidth}px`)).observe(actions);
  inst.sizeButtons = { collapse, grow };
}

function applySize(id, inst) {
  const size = sizeFor(id);
  const name = WIDGET_LABELS[id] ?? id;
  const { collapse, grow } = inst.sizeButtons;
  const set = (btn, iconName, label) => { render(btn, icon(iconName, 15)); btn.title = label; btn.setAttribute('aria-label', label); };
  set(collapse, size === 'mini' ? 'down' : 'up', size === 'mini' ? `Expand ${name}` : `Collapse ${name}`);
  inst.el.querySelector('.card-head').title = size === 'mini' ? `${name}. Click to expand` : '';
  collapse.setAttribute('aria-expanded', String(size !== 'mini'));
  set(grow, size === 'big' ? 'minimize' : 'maximize', size === 'big' ? `Regular size` : `Big ${name}`);
  grow.hidden = size === 'mini';
  const prev = inst.el.dataset.size;
  if (prev !== size) {
    inst.el.dataset.size = size;
    // Mini and regular show the same content; only big adds or removes some, so only then redraw.
    if (prev === 'big' || size === 'big') inst.resize?.(size);
    else if (prev === 'mini') inst.expand?.(); // e.g. load a picture that was skipped while collapsed
  }
}

function applyAll() {
  applyTheme();
  applyGlass();
  applyZen();
  updateClock(settings);
  affirmationEl.hidden = settings.widgets.affirmation === false;
  quoteEl.hidden = settings.widgets.quote === false;
  if (signatureEl) signatureEl.hidden = settings.widgets.signature === false;
  layout();
  for (const inst of instances.values()) inst.update?.(settings);
  affirmation?.update();
  quote?.update();
  for (const fn of listeners) fn(settings);
  remember();
}

// ---------- Toolbar ----------
let zenBtn;
let soundModule;
function buildToolbar() {
  const toolbar = document.getElementById('toolbar');
  // Native popover: commandfor/command toggles it (and sets aria-expanded); the panel
  // module is loaded lazily the first time it opens.
  const soundBtn = iconButton('music', 'Ambient sound', null, 'toolbar-btn');
  soundBtn.id = 'sound-btn';
  soundBtn.setAttribute('commandfor', 'sound-popover');
  soundBtn.setAttribute('command', 'toggle-popover');
  const soundPopover = document.getElementById('sound-popover');
  soundPopover.addEventListener('beforetoggle', async (e) => {
    if (e.newState !== 'open') return;
    soundModule ??= await import('./widgets/sound.js');
    soundModule.renderSoundPanel(soundPopover, soundBtn, ctx);
  });
  zenBtn = iconButton('eyeOff', 'Zen mode', () => ctx.save({ zen: !settings.zen }), 'toolbar-btn zen-btn');
  const customizeBtn = iconButton('grid', 'Customize widgets', async () => {
    const mod = await import('./widgets/customize.js');
    mod.isEditing() ? mod.stop() : mod.start(ctx, columns);
  }, 'toolbar-btn customize-btn');
  const settingsBtn = iconButton('settings', 'Settings', () => openSettings(), 'toolbar-btn');
  toolbar.append(soundBtn, customizeBtn, zenBtn, settingsBtn);
}

/**
 * The ♪ button shows whether ambient sound is playing. Sound plays in the offscreen document, so
 * this works in every tab: an equaliser and an accent ring while playing, and a label that says
 * what's on ("Rain playing", "Rain · in session", "Ambient sound off").
 */
async function watchSoundButton(btn) {
  if (!btn) return;
  const { SOUNDS } = await import('./shared/sounds.js');
  let sound = {};
  let session = {};
  const paint = () => {
    const playing = !!sound.playing;
    const name = SOUNDS[sound.track]?.label;
    const label = playing ? `${name ?? 'Ambient sound'} ${session.active && session.sound ? '· in session' : 'playing'}` : name ? `${name} paused` : 'Ambient sound off';
    btn.classList.toggle('playing', playing);
    btn.setAttribute('aria-label', label);
    btn.title = label;
    if (playing !== !!btn.querySelector('.eq')) btn.replaceChildren(playing ? h('span', { class: 'eq toolbar-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : icon('music', 16));
  };
  const [{ 'sound:state': s }, { 'session:state': ss }] = await Promise.all([chrome.storage.session.get('sound:state'), chrome.storage.local.get('session:state')]);
  sound = s ?? {};
  session = ss ?? {};
  paint();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes['sound:state']) { sound = changes['sound:state'].newValue ?? {}; paint(); }
    if (area === 'local' && changes['session:state']) { session = changes['session:state'].newValue ?? {}; paint(); }
  });
}

async function openSettings(section) {
  const mod = await import('./widgets/settings.js');
  mod.openSettings(ctx, section);
}

// Keyboard: "z" toggles Zen mode (ignored while typing).
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  // Esc closes an open Settings dialog or sound popover first; it shouldn't also leave Zen.
  if (document.querySelector('dialog[open], :popover-open')) return;
  if (root.classList.contains('editing')) return;
  if (e.key === 'z' || e.key === 'Z') ctx.save({ zen: !settings.zen });
  if (e.key === 'Escape' && settings.zen) ctx.save({ zen: false });
});

affirmationEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); affirmationEl.click(); } });

// ---------- Card menu (right-click, or the keyboard menu key / Shift+F10 on a focused card) ----------
let cardMenu = null;
function closeCardMenu() { cardMenu?.remove(); cardMenu = null; }
function openCardMenu(card, x, y) {
  closeCardMenu();
  const id = card.dataset.widget;
  const size = sizeFor(id);
  const side = settings.layout.left.includes(id) ? 'left' : 'right';
  const other = side === 'left' ? 'right' : 'left';
  const item = (label, iconName, run) => h('button', { type: 'button', role: 'menuitem', class: 'ctx-item', onclick: () => { closeCardMenu(); run(); } }, icon(iconName, 15), h('span', {}, label));
  const move = () => {
    const placed = [...settings.layout.left, ...settings.layout.right];
    const right = [...settings.layout.right, ...COLUMN_WIDGETS.filter((w) => !placed.includes(w))];
    const plan = { left: settings.layout.left.filter((w) => w !== id), right: right.filter((w) => w !== id) };
    plan[other] = [...plan[other], id];
    ctx.save({ layout: plan });
  };
  cardMenu = h('div', { class: 'ctx-menu', role: 'menu', 'aria-label': `${WIDGET_LABELS[id] ?? id} options` },
    size === 'mini' ? item('Expand', 'down', () => setSize(id, 'regular')) : item('Collapse', 'up', () => setSize(id, 'mini')),
    size === 'big' ? item('Regular size', 'minimize', () => setSize(id, 'regular')) : item('Make big', 'maximize', () => setSize(id, 'big')),
    item(`Move to ${other} column`, other === 'left' ? 'left' : 'right', move),
    instances.get(id)?.refresh ? item('Refresh', 'refresh', () => instances.get(id).refresh()) : null,
    h('div', { class: 'ctx-sep', role: 'separator' }),
    item('Hide card', 'eyeOff', () => { ctx.save({ widgets: { ...settings.widgets, [id]: false } }); toast(`${WIDGET_LABELS[id] ?? id} hidden. Bring it back in Customize`); }),
    item('Customize layout…', 'grid', () => document.querySelector('.customize-btn')?.click()),
  );
  document.body.append(cardMenu);
  const r = cardMenu.getBoundingClientRect();
  cardMenu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  cardMenu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  cardMenu.querySelector('.ctx-item')?.focus();
}
document.addEventListener('contextmenu', (e) => {
  const card = e.target.closest?.('.column .card');
  if (!card || root.classList.contains('editing') || e.target.closest('input, textarea, a')) return;
  e.preventDefault();
  const fromKeyboard = e.button !== 2 && e.clientX === 0 && e.clientY === 0;
  const r = card.getBoundingClientRect();
  openCardMenu(card, fromKeyboard ? r.left + 16 : e.clientX, fromKeyboard ? r.top + 32 : e.clientY);
});
document.addEventListener('pointerdown', (e) => { if (cardMenu && !cardMenu.contains(e.target)) closeCardMenu(); }, true);
document.addEventListener('keydown', (e) => {
  if (!cardMenu) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCardMenu(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = [...cardMenu.querySelectorAll('.ctx-item')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
}, true);
addEventListener('blur', closeCardMenu);
addEventListener('resize', closeCardMenu);

// ---------- One-time hints for things you can't see ----------
async function showHintOnce(key, text, anchor) {
  const storeKey = `hint:${key}`;
  const { [storeKey]: seen } = await chrome.storage.local.get(storeKey);
  if (seen || !anchor?.isConnected || document.hidden) return false;
  chrome.storage.local.set({ [storeKey]: Date.now() });
  const tip = h('div', { class: 'coach-tip', role: 'status' }, text);
  document.body.append(tip);
  const r = anchor.getBoundingClientRect();
  tip.style.left = `${Math.round(r.left + r.width / 2)}px`;
  tip.style.top = `${Math.round(r.bottom + 10)}px`;
  const dismiss = () => { tip.classList.add('out'); setTimeout(() => tip.remove(), 300); };
  setTimeout(dismiss, 6000);
  tip.addEventListener('click', dismiss);
  anchor.addEventListener('click', dismiss, { once: true });
  return true;
}

// ---------- Signature: "Calm Tab · made with ♥ by Tom Tran" (bottom-left, hidden in Zen) ----------
// The wordmark opens Settings; the name links to Tom's LinkedIn (a new tab).
function initSignature() {
  if (!signatureEl) return;
  signatureEl.hidden = settings.widgets.signature === false;
  const version = chrome.runtime.getManifest?.().version;
  document.getElementById('sig-more').textContent = version ? `Version ${version} · Settings` : 'Settings';
  document.getElementById('sig-settings')?.addEventListener('click', () => openSettings('widgets'));
  // The heart draws itself once a day (on the first new tab), then simply rests.
  try {
    const today = new Date().toDateString();
    if (localStorage.getItem('calm:sig-drawn') !== today) { signatureEl.classList.add('sig-draw'); localStorage.setItem('calm:sig-drawn', today); }
  } catch { /* optional */ }
}

// ---------- Boot ----------
// First: the clock is the one thing that must paint immediately. Clicking it tries the next face.
applyTheme();
applyGlass();
initClock(settings, {
  onCycle: (face) => {
    ctx.save({ clock: { ...settings.clock, face } });
    toast(`${FACES.find(([id]) => id === face)?.[1] ?? face} clock`);
  },
});
affirmationEl.hidden = settings.widgets.affirmation === false;
quoteEl.hidden = settings.widgets.quote === false;
initSignature();
// The very first tab has nothing cached: keep the centre stack invisible until its text is in.
if (!restoreCenter({ affirmation: affirmationEl, quote: quoteEl })) root.classList.add('center-wait');
const centerShown = setTimeout(() => root.classList.remove('center-wait'), 800);
// The quote's typefaces are bundled but arrive a frame after the first paint. Keep the quote out
// of sight (boot.js adds quote-wait) until they're in, so the font swap can't reflow it on screen.
const QUOTE_FONT = { classic: 'italic 500 1em "Cormorant Garamond"', editorial: 'italic 400 1em "Playfair Display"', script: '500 1em "Dancing Script"' };
Promise.race([
  Promise.all(['italic 500 1em "Cormorant Garamond"', QUOTE_FONT[settings.quoteStyle ?? 'classic']].filter(Boolean).map((f) => document.fonts.load(f, 'Aa\u201C'))),
  new Promise((r) => setTimeout(r, 400)),
]).catch(() => {}).finally(() => root.classList.remove('quote-wait'));
buildToolbar();
applyZen();
performance.mark('ct:clock');
// Let the browser put that frame on screen before building ten cards.
await new Promise((resolve) => { requestAnimationFrame(() => setTimeout(resolve, 0)); setTimeout(resolve, 50); });

const fresh = await settingsReady;
performance.mark('ct:settings');
if (JSON.stringify(fresh) !== JSON.stringify(settings)) { settings = fresh; applyTheme(); applyGlass(); applyZen(); updateClock(settings); }
initBackground(ctx); // the photo request goes out before the cards are built
const [{ initLiquidGlass }, { initAffirmation }, { initQuote }, ...widgetModules] = await later;
WIDGET_IDS.forEach((id, i) => { REGISTRY[id] = widgetModules[i].default; });
initLiquidGlass();
[affirmation, quote] = await Promise.all([initAffirmation(affirmationEl, () => settings), initQuote(quoteEl, () => settings)]);
// Cards fill from chrome.storage a few milliseconds after they're built. Keep the columns out of
// sight until they stop changing (two quiet frames, at most 300 ms) so nothing jumps once shown.
root.classList.add('cards-pending');
applyAll();
performance.mark('ct:cards');
clearTimeout(centerShown); root.classList.remove('center-wait');
await new Promise((resolve) => {
  let quiet;
  const done = () => { mo.disconnect(); clearTimeout(quiet); clearTimeout(cap); resolve(); };
  const mo = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, 32); });
  for (const col of Object.values(columns)) mo.observe(col, { childList: true, subtree: true, characterData: true });
  quiet = setTimeout(done, 32);
  const cap = setTimeout(done, 300);
});
root.classList.remove('cards-pending');
performance.mark('ct:cards-shown');
watchCenter({ affirmation: affirmationEl, quote: quoteEl });
watchSoundButton(document.getElementById('sound-btn'));
root.classList.add('ready');
performance.mark('ct:ready');
(window.requestIdleCallback ?? setTimeout)(() => performance.mark('ct:idle'));
// First visits: teach the two invisible gestures, one per new tab.
setTimeout(async () => {
  if (!(await showHintOnce('clock', 'Tip: click the clock to try another face', document.getElementById('clock')))) {
    showHintOnce('cards', 'Tip: right-click any card for quick options', document.querySelector('.column .card .card-head'));
  }
}, 1800);

onSettingsChanged((next) => {
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(settings[k]));
  if (!changed.length) return; // our own save echoing back
  if (changed.every((k) => k === 'sizes')) {
    // e.g. sizes changed in another tab: update just those cards
    const ids = new Set([...Object.keys(next.sizes ?? {}), ...Object.keys(settings.sizes ?? {})]);
    const patch = Object.fromEntries([...ids].map((id) => [id, next.sizes?.[id] ?? 'regular']).filter(([id, s]) => s !== (settings.sizes?.[id] ?? 'regular')));
    settings = { ...settings, sizes: next.sizes };
    for (const [id] of Object.entries(patch)) { const inst = instances.get(id); if (inst) animateSize(inst, () => applySize(id, inst)); }
    return;
  }
  settings = next;
  applyAll();
});
remember();

