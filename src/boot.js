/**
 * First-frame setup (a tiny classic script, so it runs before the first paint).
 * Applies the theme, glass, Zen state and a blurred copy of the expected background photo
 * from the snapshot the page saved last time, so a new tab never flashes the wrong colour
 * or an empty background while the modules load. Everything here is optional: with no
 * snapshot (first run) the CSS defaults apply and the page boots normally.
 */
(() => {
  const root = document.documentElement;
  let s = null;
  try { s = JSON.parse(localStorage.getItem('calm:settings') || 'null'); } catch { /* ignore */ }
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = s && s.theme && s.theme !== 'auto' ? s.theme : (dark ? 'dark' : 'light');
  root.dataset.theme = theme;
  // Very first tab (nothing cached yet): keep the centre stack hidden until its text is in (newtab.js reveals it).
  root.classList.add('quote-wait'); // newtab.js removes it once the quote's typeface is in
  if (!localStorage.getItem('calm:center')) root.classList.add('center-wait');
  if (!s) return;
  if (s.zen) root.classList.add('zen');
  const t = Math.min(100, Math.max(0, Number(s.glass && s.glass.transparency != null ? s.glass.transparency : 50) || 0)) / 100;
  root.style.setProperty('--glass-a', (0.62 - t * 0.56).toFixed(3));
  root.style.setProperty('--glass-blur', `${Math.round(30 - t * 14)}px`);
  // The photo this tab will most likely show: the preloaded "next" one, else the last one shown.
  try {
    const bg = JSON.parse(localStorage.getItem('calm:bg') || 'null');
    if (!bg || (s.background && s.background.mode === 'none')) return;
    const mode = s.background && s.background.mode;
    const url = mode === 'newtab' ? localStorage.getItem('calm:bg-next') : bg.url;
    const day = new Date().toDateString();
    const hit = bg.thumbs && bg.thumbs[url];
    if (!hit || (mode === 'daily' && bg.day !== day)) return;
    root.style.setProperty('--bg-ph', `url("${hit.src}")`);
    // Same veil and glass thickness background.js derives from the photo's brightness.
    const base = Number(s.background && s.background.dim) || 0;
    const light = theme === 'light';
    const lum = hit.lum;
    root.style.setProperty('--overlay', Math.min(0.75, Math.max(0.08, base + (light ? (0.5 - lum) * 0.4 : (lum - 0.45) * 0.45))).toFixed(3));
    root.style.setProperty('--glass-boost', Math.min(0.4, Math.max(0, light ? (0.8 - lum) * 0.7 : (lum - 0.2) * 0.7)).toFixed(3));
  } catch { /* ignore */ }
})();
