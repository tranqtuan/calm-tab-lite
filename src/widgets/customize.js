/**
 * Customize mode (toolbar ⊞ button): rearrange widgets by dragging them within or
 * between the side columns, hide any widget, and bring hidden ones back from the tray.
 * Changes save immediately to the same settings the Settings → Widgets list uses.
 */
import { h, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { COLUMN_WIDGETS, WIDGET_LABELS } from '../shared/defaults.js';

const CENTER = ['greeting', 'affirmation', 'quote'];
let ctx, columns, tray, unsubscribe, marker, dragging = null;

const root = document.documentElement;
export const isEditing = () => root.classList.contains('editing');

/** Current layout with any widget missing from the saved one appended to the right. */
function plan(s) {
  const placed = [...s.layout.left, ...s.layout.right];
  return { left: [...s.layout.left], right: [...s.layout.right, ...COLUMN_WIDGETS.filter((id) => !placed.includes(id))] };
}

function decorate() {
  for (const cardEl of document.querySelectorAll('.column .card')) {
    if (cardEl.querySelector(':scope > .edit-bar')) continue;
    const id = cardEl.dataset.widget;
    const bar = h('div', { class: 'edit-bar' },
      h('span', { class: 'edit-grip', 'aria-hidden': 'true' }, icon('grip', 16)),
      h('span', { class: 'edit-name' }, WIDGET_LABELS[id] ?? id),
      h('button', { class: 'icon-btn small', type: 'button', title: `Hide ${WIDGET_LABELS[id]}`, 'aria-label': `Hide ${WIDGET_LABELS[id]}`, onclick: () => setVisible(id, false) }, icon('eyeOff', 15)));
    cardEl.prepend(bar);
  }
  for (const cardEl of document.querySelectorAll('.column .card')) cardEl.draggable = isEditing();
}

function setVisible(id, on) {
  const s = ctx.settings;
  const patch = { widgets: { ...s.widgets, [id]: on } };
  if (on && COLUMN_WIDGETS.includes(id)) {
    // Bring it back at the end of the column it last lived in.
    const p = plan(s);
    const side = p.left.includes(id) ? 'left' : 'right';
    patch.layout = { ...p, [side]: [...p[side].filter((x) => x !== id), id] };
  }
  ctx.save(patch);
}

function setAllSizes(size) {
  ctx.setSizes(Object.fromEntries(COLUMN_WIDGETS.map((id) => [id, size])));
}

function drawTray() {
  const s = ctx.settings;
  const hidden = COLUMN_WIDGETS.filter((id) => s.widgets[id] === false);
  render(tray,
    h('div', { class: 'tray-main' },
      h('div', { class: 'tray-title' }, icon('grid', 15), h('span', {}, 'Customize')),
      h('div', { class: 'tray-hint' }, 'Drag cards to rearrange them. Use the eye to hide a card.'),
      h('div', { class: 'tray-chips' },
        CENTER.map((id) => h('button', {
          type: 'button', class: `tray-chip toggle ${s.widgets[id] !== false ? 'on' : ''}`, 'aria-pressed': String(s.widgets[id] !== false),
          onclick: () => setVisible(id, s.widgets[id] === false),
        }, icon(s.widgets[id] !== false ? 'eye' : 'eyeOff', 13), WIDGET_LABELS[id])),
        hidden.length ? h('span', { class: 'tray-sep' }) : null,
        hidden.map((id) => h('button', { type: 'button', class: 'tray-chip', title: `Show ${WIDGET_LABELS[id]}`, onclick: () => setVisible(id, true) },
          icon('plus', 13), WIDGET_LABELS[id])),
      ),
    ),
    h('div', { class: 'tray-sizes' },
      h('button', { class: 'pill-btn', type: 'button', title: 'Collapse every card to one line', onclick: () => setAllSizes('mini') }, icon('up', 14), 'Collapse all'),
      h('button', { class: 'pill-btn', type: 'button', title: 'Return every card to its regular size', onclick: () => setAllSizes('regular') }, icon('down', 14), 'Expand all')),
    h('button', { class: 'pill-btn primary', type: 'button', onclick: stop }, 'Done'),
  );
}

// ---------- Drag & drop ----------
function onDragStart(e) {
  const cardEl = e.target.closest('.column .card');
  if (!cardEl || !isEditing()) return;
  dragging = cardEl;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', cardEl.dataset.widget);
  // Fade the original on the next frame (so the drag image stays opaque), unless the drag already ended.
  requestAnimationFrame(() => { if (dragging === cardEl) cardEl.classList.add('dragging'); });
}

function onDragOver(e) {
  const col = e.target.closest('.column');
  if (!dragging || !col) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const cards = [...col.querySelectorAll(':scope > .card:not(.dragging)')];
  const before = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  before ? col.insertBefore(marker, before) : col.append(marker);
}

function onDrop(e) {
  if (!dragging || !marker.isConnected) return;
  e.preventDefault();
  marker.replaceWith(dragging);
  const order = (side) => [...columns[side].querySelectorAll(':scope > .card')].map((c) => c.dataset.widget);
  const p = plan(ctx.settings);
  // Keep hidden widgets in place relative to their side so they reappear where they were.
  const keepHidden = (side) => p[side].filter((id) => ctx.settings.widgets[id] === false);
  ctx.save({ layout: { left: [...order('left'), ...keepHidden('left')], right: [...order('right'), ...keepHidden('right')] } });
}

function onDragEnd() {
  dragging?.classList.remove('dragging');
  dragging = null;
  marker.remove();
}

function onKey(e) { if (e.key === 'Escape' && !document.querySelector('dialog[open], :popover-open')) stop(); }

export function start(context, cols) {
  ctx = context;
  columns = cols;
  if (isEditing()) return;
  if (ctx.settings.zen) ctx.save({ zen: false });
  root.classList.add('editing');
  marker ??= h('div', { class: 'drop-marker', 'aria-hidden': 'true' });
  tray = h('div', { class: 'edit-tray', role: 'toolbar', 'aria-label': 'Customize widgets' });
  document.body.append(tray);
  decorate();
  drawTray();
  unsubscribe = ctx.subscribe(() => { decorate(); drawTray(); });
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onDragEnd);
  document.addEventListener('keydown', onKey);
}

export function stop() {
  root.classList.remove('editing');
  tray?.remove();
  unsubscribe?.();
  for (const c of document.querySelectorAll('.column .card')) c.draggable = false;
  document.removeEventListener('dragstart', onDragStart);
  document.removeEventListener('dragover', onDragOver);
  document.removeEventListener('drop', onDrop);
  document.removeEventListener('dragend', onDragEnd);
  document.removeEventListener('keydown', onKey);
}
