/**
 * Ambient background: rotating royalty-free nature photos (optionally looping video).
 * Modes: "daily" (one per day), "newtab" (new one every tab, next one preloaded),
 * "fixed" (a chosen/favourite image). A readability overlay adapts to image brightness.
 */
import { h, render, iconButton, loadJson, toast } from '../lib/dom.js';
import { dayNumber } from '../shared/util.js';

const media = document.getElementById('bg-media');
const creditEl = document.getElementById('bg-credit');
const NEXT_KEY = 'calm:bg-next'; // localStorage: URL preloaded for the next new tab
// localStorage: { url, day, thumbs: { [url]: { src, lum } } }. src/boot.js paints the expected
// photo's tiny blurred thumbnail in the very first frame, before any module has loaded.
const BG_KEY = 'calm:bg';
const readBg = () => { try { return JSON.parse(localStorage.getItem(BG_KEY) || 'null') ?? { thumbs: {} }; } catch { return { thumbs: {} }; } };
function rememberThumb(url, entry) {
  const bg = readBg();
  bg.thumbs = Object.fromEntries([...Object.entries(bg.thumbs ?? {}).filter(([u]) => u !== url), [url, entry]].slice(-6));
  try { localStorage.setItem(BG_KEY, JSON.stringify(bg)); } catch { /* quota: placeholder is optional */ }
}
function rememberShown(url) {
  const bg = readBg();
  bg.url = url; bg.day = new Date().toDateString();
  try { localStorage.setItem(BG_KEY, JSON.stringify(bg)); } catch { /* ignore */ }
}

/** Ask Unsplash for the width this screen needs (it resizes on its CDN) instead of always 2560 px. */
export function sized(url) {
  if (!/^https:\/\/images\.unsplash\.com\//.test(url)) return url;
  const need = Math.min(2560, Math.ceil((screen.width * (devicePixelRatio || 1)) / 640) * 640);
  return url.replace(/([?&]w=)\d+/, `$1${need}`);
}

let data = { photos: [], videos: [] };
let current = null;
let ctxRef;
let lastSig = '';

/** All photos available, including a user-supplied custom URL. */
export async function getPhotos(settings) {
  data = await loadJson('data/backgrounds.json').catch(() => ({ photos: [], videos: [] }));
  const custom = settings.background.customUrl?.trim();
  return custom ? [{ url: custom, thumb: custom, credit: 'Your image', source: '', link: '' }, ...data.photos] : data.photos;
}

function pick(photos, settings) {
  const bg = settings.background;
  if (!photos.length) return null;
  if (bg.mode === 'fixed') {
    return photos.find((p) => p.url === bg.fixedUrl) ?? photos.find((p) => bg.favorites.includes(p.url)) ?? photos[0];
  }
  if (bg.mode === 'newtab') {
    const next = localStorage.getItem(NEXT_KEY);
    return photos.find((p) => p.url === next) ?? photos[Math.floor(Math.random() * photos.length)];
  }
  return photos[dayNumber() % photos.length];
}

/** Warm the HTTP cache with the next random photo so the next tab paints instantly. */
function preloadNext(photos) {
  if (photos.length < 2) return;
  let next;
  do next = photos[Math.floor(Math.random() * photos.length)]; while (next.url === current?.url);
  localStorage.setItem(NEXT_KEY, next.url);
  // Low priority: warming the cache for the *next* tab must never compete with this one.
  const run = () => { const img = new Image(); img.fetchPriority = 'low'; img.src = sized(next.url); if (next.thumb) measureLuminance(next.thumb, next.url); };
  'requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500);
}

/** Estimate perceived brightness (0–1) from the small thumbnail. Cached per URL (and across tabs). */
const lumCache = new Map();
function measureLuminance(url, photoUrl = url) {
  if (!lumCache.has(url)) lumCache.set(url, measure(url, photoUrl));
  return lumCache.get(url);
}
const knownLum = (photoUrl) => readBg().thumbs?.[photoUrl]?.lum;
function measure(url, photoUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.fetchPriority = 'low';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 16;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, c.width, c.height);
        const px = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        const lum = sum / (px.length / 4);
        // A 40×25 JPEG (~1 KB) of the photo: the next tab's first-frame placeholder.
        const t = document.createElement('canvas');
        t.width = 40; t.height = 25;
        t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
        rememberThumb(photoUrl, { src: t.toDataURL('image/jpeg', 0.7), lum: +lum.toFixed(3) });
        resolve(lum);
      } catch { resolve(0.5); }
    };
    img.onerror = () => resolve(0.5);
    img.src = url;
  });
}

async function applyOverlay(photo, settings) {
  const base = settings.background.dim;
  const root = document.documentElement;
  // A photo measured on an earlier tab is applied at once (no veil flicker); others are measured now.
  const known = photo ? knownLum(photo.url) : undefined;
  if (known == null) {
    root.style.setProperty('--overlay', base);
    root.style.setProperty('--glass-boost', '0.08'); // until the photo is measured
  }
  if (!photo?.thumb) return;
  const lum = known ?? await measureLuminance(photo.thumb, photo.url);
  const isLight = root.dataset.theme === 'light';
  // Brighter photos get a stronger dark veil in dark mode, a lighter veil in light mode.
  const adjust = isLight ? (0.5 - lum) * 0.4 : (lum - 0.45) * 0.45;
  root.style.setProperty('--overlay', Math.min(0.75, Math.max(0.08, base + adjust)).toFixed(3));
  // Thicker glass over photos that would wash out the text (bright in dark mode, dark in light mode).
  // Tuned by sweeping photo brightness 0–100%: tertiary text stays ≥ 4.5:1 (WCAG AA) on any photo.
  const boost = isLight ? (0.8 - lum) * 0.7 : (lum - 0.2) * 0.7;
  root.style.setProperty('--glass-boost', Math.min(0.4, Math.max(0, boost)).toFixed(3));
}

/** Cross-fade a new layer in, then drop the old ones. */
function showLayer(layer) {
  media.append(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('visible')));
  setTimeout(() => {
    for (const el of [...media.children]) if (el !== layer) el.remove();
  }, 1000);
}

function showPhoto(photo) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = 'high'; // the background is the page's largest paint (LCP)
    img.onload = () => {
      const layer = h('div', { class: 'bg-layer' });
      layer.style.backgroundImage = `url("${sized(photo.url).replace(/"/g, '%22')}")`;
      showLayer(layer);
      if (!performance.getEntriesByName('ct:bg').length) performance.mark('ct:bg');
      resolve(true);
    };
    img.onerror = () => resolve(false); // offline: the gradient stays, quietly
    img.src = sized(photo.url);
    rememberShown(photo.url);
  });
}

function showVideo(video) {
  const el = h('video', { class: 'bg-layer', muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto', 'aria-hidden': 'true' });
  el.muted = true; // must be set as a property for autoplay to be allowed
  el.addEventListener('playing', () => showLayer(el), { once: true });
  el.src = video.url;
  el.play().catch(() => {});
}

// Save CPU: pause video while the tab is hidden.
document.addEventListener('visibilitychange', () => {
  const v = media.querySelector('video');
  if (v) document.hidden ? v.pause() : v.play().catch(() => {});
});

function drawCredit(photo, settings) {
  if (!photo) { render(creditEl); return; }
  const fav = settings.background.favorites.includes(photo.url);
  const label = photo.source ? `${photo.credit} · ${photo.source}` : photo.credit;
  render(creditEl,
    photo.link
      ? h('a', { href: photo.link, target: '_blank', rel: 'noopener noreferrer', title: 'View photo' }, label)
      : h('span', {}, label),
    iconButton('heart', fav ? 'Remove from favorite backgrounds' : 'Favorite this background', () => toggleFavorite(photo), fav ? 'active small' : 'small'),
    iconButton('right', 'Next background', next, 'small'),
  );
}

async function toggleFavorite(photo) {
  const bg = ctxRef.settings.background;
  const favorites = bg.favorites.includes(photo.url) ? bg.favorites.filter((u) => u !== photo.url) : [...bg.favorites, photo.url];
  await ctxRef.save({ background: { ...bg, favorites } });
  toast(favorites.includes(photo.url) ? 'Background saved to favorites' : 'Removed from favorites');
}

/** Skip to another photo now (doesn't change the mode). */
async function next() {
  const photos = await getPhotos(ctxRef.settings);
  if (photos.length < 2) return;
  let p;
  do p = photos[Math.floor(Math.random() * photos.length)]; while (p.url === current?.url);
  current = p;
  await showPhoto(p);
  drawCredit(p, ctxRef.settings);
  applyOverlay(p, ctxRef.settings);
}

async function apply(settings) {
  const photos = await getPhotos(settings);
  const photo = pick(photos, settings);
  current = photo;
  applyOverlay(photo, settings);
  drawCredit(photo, settings);
  if (photo) await showPhoto(photo);

  if (settings.background.useVideo && data.videos.length) {
    const videos = data.videos;
    const video = settings.background.mode === 'newtab' ? videos[Math.floor(Math.random() * videos.length)] : videos[dayNumber() % videos.length];
    showVideo(video);
  }
  if (settings.background.mode === 'newtab') preloadNext(photos);
}

export function initBackground(ctx) {
  ctxRef = ctx;
  lastSig = signature(ctx.settings);
  apply(ctx.settings);
  ctx.subscribe((s) => {
    const sig = signature(s);
    if (sig !== lastSig) { lastSig = sig; apply(s); }
    else drawCredit(current, s);
    applyOverlay(current, s);
  });
}

/** Only these settings require re-choosing the background. */
function signature(s) {
  const { mode, fixedUrl, useVideo, customUrl } = s.background;
  return JSON.stringify({ mode, fixedUrl: mode === 'fixed' ? fixedUrl : '', useVideo, customUrl });
}
