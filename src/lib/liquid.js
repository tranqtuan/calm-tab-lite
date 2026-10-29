/**
 * Liquid glass light: the glass under the pointer catches it. A soft glow follows the
 * cursor inside the surface (beneath its content) and the specular rim brightens where
 * the pointer is closest. Pointer position is written as --mx / --my on the hovered
 * surface once per frame; the look itself lives in styles/main.css (".lg-lit").
 * Only for a precise pointer (mouse or trackpad); touch screens keep the static glass.
 */
const SURFACES = '.card, .toolbar-btn, .qa-bar, .jade-btn';

export function initLiquidGlass() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let lit = null, frame = 0, x = 0, y = 0;

  const place = () => {
    frame = 0;
    if (!lit) return;
    const r = lit.getBoundingClientRect();
    lit.style.setProperty('--mx', `${(x - r.left).toFixed(1)}px`);
    lit.style.setProperty('--my', `${(y - r.top).toFixed(1)}px`);
  };
  const light = (el) => {
    if (el === lit) { if (el && !el.classList.contains('lg-lit')) el.classList.add('lg-lit'); return; }
    lit?.classList.remove('lg-lit');
    lit = el;
    if (lit) { place(); lit.classList.add('lg-lit'); } // position first, so the glow appears under the cursor
  };

  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    light(e.target.closest?.(SURFACES) ?? null);
    if (lit && !frame) frame = requestAnimationFrame(place);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => light(null));
  addEventListener('blur', () => light(null));
}
