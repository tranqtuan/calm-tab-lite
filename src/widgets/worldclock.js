/**
 * World clocks section of the Weather & clocks card: local time, day/night, offset from
 * you, and current weather for each city you pick (Settings → World clocks). Weather for
 * every city comes from one Open-Meteo request, cached for 30 minutes.
 */
import { h, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal } from '../shared/storage.js';
import { describe, toUnit } from './weather.js';

const CACHE_KEY = 'worldclock:weather';
const TTL = 30 * 60 * 1000;

/** Minutes east of UTC for a zone at `date`. */
function offsetMinutes(tz, date = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** "+6h", "−14h", "+5h 30m", "Same time". */
function relative(tz, now) {
  const diff = offsetMinutes(tz, now) + now.getTimezoneOffset();
  if (diff === 0) return 'Same time';
  const sign = diff > 0 ? '+' : '−';
  const abs = Math.abs(diff);
  return `${sign}${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ''}`;
}

/** Which day it is there relative to here: "Today" / "Tomorrow" / "Yesterday". */
function dayLabel(tz, now) {
  const fmt = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const there = fmt(tz), here = fmt(Intl.DateTimeFormat().resolvedOptions().timeZone);
  return there === here ? 'Today' : there > here ? 'Tomorrow' : 'Yesterday';
}

async function fetchWeather(cities) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: cities.map((c) => c.lat.toFixed(2)).join(','),
    longitude: cities.map((c) => c.lon.toFixed(2)).join(','),
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'auto',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const data = await res.json();
  return [].concat(data).map((d) => ({ temp: d.current.temperature_2m, code: d.current.weather_code, isDay: d.current.is_day === 1 }));
}

/** Builds the section. Returns { el, update } for the host card. */
export function worldClocks(ctx) {
  const body = h('div', { class: 'wc' });
  let weather = [];
  let timer;

  function draw() {
    const cities = ctx.settings.worldClocks ?? [];
    if (!cities.length) {
      render(body, h('div', { class: 'wc-empty' },
        h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.openSettings('clocks') }, '+ Add world clocks')));
      return;
    }
    const now = new Date();
    const unit = ctx.settings.tempUnit;
    render(body, h('ul', { class: 'wc-list' }, cities.map((c, i) => {
      const time = new Intl.DateTimeFormat([], { timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: ctx.settings.timeFormat !== '24h' }).formatToParts(now);
      const hm = time.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
      const period = time.find((p) => p.type === 'dayPeriod')?.value;
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
      const w = weather[i];
      const isDay = w ? w.isDay : hour >= 6 && hour < 18;
      const [cond, dayIcon, nightIcon] = w ? describe(w.code) : ['', null, null];
      return h('li', { class: `wc-row ${isDay ? 'day' : 'night'}`, title: `${c.name} · ${c.tz}${cond ? ' · ' + cond : ''}` },
        h('span', { class: 'wc-dot', 'aria-hidden': 'true' }),
        h('div', { class: 'wc-place' },
          h('span', { class: 'wc-city' }, c.name),
          h('span', { class: 'wc-rel' }, `${dayLabel(c.tz, now)} · ${relative(c.tz, now)}`)),
        w ? h('span', { class: 'wc-weather' }, icon(isDay ? dayIcon : nightIcon, 16), `${toUnit(w.temp, unit)}°`) : null,
        h('span', { class: 'wc-time' }, hm, period ? h('span', { class: 'wc-period' }, period) : null),
      );
    })));
  }

  async function loadWeather(force = false) {
    const cities = ctx.settings.worldClocks ?? [];
    if (!cities.length) return;
    const key = cities.map((c) => `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`).join('|');
    const cache = await getLocal(CACHE_KEY);
    if (!force && cache?.key === key && Date.now() - cache.at < TTL) { weather = cache.data; draw(); return; }
    try {
      weather = await fetchWeather(cities);
      await setLocal(CACHE_KEY, { key, at: Date.now(), data: weather });
    } catch {
      weather = cache?.key === key ? cache.data : []; // offline: times still work
    }
    draw();
  }

  // Tick on the minute boundary.
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { draw(); schedule(); }, 60000 - (Date.now() % 60000) + 20); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { draw(); schedule(); loadWeather(); } });

  draw();
  schedule();
  loadWeather();

  let sig = JSON.stringify(ctx.settings.worldClocks);
  return {
    el: body,
    refresh: () => loadWeather(true),
    update(s) {
      const next = JSON.stringify(s.worldClocks);
      if (next !== sig) { sig = next; weather = []; draw(); loadWeather(true); } else draw();
    },
  };
}
