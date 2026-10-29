/**
 * Weather & clocks card.
 *  - Current city: Open-Meteo weather (free, no API key) and air quality (US AQI with
 *    PM2.5, PM10 and ozone). Location comes from geolocation, or a city picked in Settings.
 *  - World clocks underneath (see worldclock.js).
 * Results are cached for 30 minutes; temperatures are stored in °C and converted on display.
 */
import { card, h, placeholder, render, iconButton, sizeOf } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal } from '../shared/storage.js';
import { worldClocks } from './worldclock.js';

const CACHE_KEY = 'weather:cache';
const TTL = 30 * 60 * 1000;

/** WMO weather code → [label, day icon, night icon]. */
export function describe(code) {
  if (code === 0) return ['Clear', 'sun', 'moon'];
  if (code <= 2) return ['Partly cloudy', 'cloudSun', 'cloudMoon'];
  if (code === 3) return ['Overcast', 'cloud', 'cloud'];
  if (code === 45 || code === 48) return ['Fog', 'fog', 'fog'];
  if (code >= 51 && code <= 57) return ['Drizzle', 'drizzle', 'drizzle'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['Rain', 'rain', 'rain'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['Snow', 'snow', 'snow'];
  if (code >= 95) return ['Thunderstorm', 'storm', 'storm'];
  return ['—', 'cloud', 'cloud'];
}

export const toUnit = (c, unit) => Math.round(unit === 'F' ? c * 9 / 5 + 32 : c);

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

/** "Asia/Ho_Chi_Minh" → "Ho Chi Minh": a free, private label without reverse geocoding. */
const labelFromTimezone = (tz) => (tz?.split('/').pop() ?? '').replace(/_/g, ' ');

async function fetchWeather(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3),
    current: 'temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: 'auto', forecast_days: '6',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const data = await res.json();
  const d = data.daily;
  return {
    temp: data.current.temperature_2m,
    code: data.current.weather_code,
    isDay: data.current.is_day === 1,
    feels: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    wind: data.current.wind_speed_10m,
    high: d.temperature_2m_max[0],
    low: d.temperature_2m_min[0],
    // The next five days, for the big card.
    days: d.time.slice(1).map((date, i) => ({ date, high: d.temperature_2m_max[i + 1], low: d.temperature_2m_min[i + 1], code: d.weather_code[i + 1] })),
    timezone: data.timezone,
  };
}

/** US AQI bands (EPA): [upper bound, label, advice, css level]. */
const AQI_BANDS = [
  [50, 'Good', 'Air quality is great for being outside.', 'good'],
  [100, 'Moderate', 'Fine for most people; very sensitive people may want to limit long outdoor effort.', 'moderate'],
  [150, 'Unhealthy for sensitive groups', 'Children, older adults and people with asthma should take it easier outside.', 'sensitive'],
  [200, 'Unhealthy', 'Limit long or intense outdoor activity; consider a mask.', 'unhealthy'],
  [300, 'Very unhealthy', 'Avoid outdoor exertion; keep windows closed.', 'very'],
  [Infinity, 'Hazardous', 'Stay indoors and use an air purifier if you can.', 'hazardous'],
];
export const aqiBand = (aqi) => AQI_BANDS.find(([max]) => aqi <= max);

async function fetchAir(lat, lon) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), current: 'us_aqi,pm2_5,pm10,ozone', timezone: 'auto' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`air ${res.status}`);
  const c = (await res.json()).current ?? {};
  return c.us_aqi == null ? null : { aqi: Math.round(c.us_aqi), pm25: c.pm2_5, pm10: c.pm10, o3: c.ozone };
}

/** City search for Settings (Open-Meteo geocoding). */
export async function searchCity(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' });
  const res = await fetch(url);
  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    short: r.name, lat: r.latitude, lon: r.longitude, tz: r.timezone,
  }));
}

export default {
  id: 'weather',
  create(ctx) {
    const { el, body, actions, setGlance, setFresh } = card('weather', 'Weather & clocks', 'pin');
    let fetchedAt = 0;
    const current = h('div', { class: 'wx-current' });
    const clocks = worldClocks(ctx);
    body.append(current, clocks.el);
    let data = null;
    let air = null;
    let label = '';

    const unitBtn = h('button', { class: 'chip-btn', type: 'button', title: 'Toggle °C / °F' });
    unitBtn.addEventListener('click', () => {
      ctx.save({ tempUnit: ctx.settings.tempUnit === 'C' ? 'F' : 'C' });
    });
    actions.append(unitBtn); // refresh lives in the card menu (right-click) and runs automatically

    /** Big card: feels-like, humidity and wind. */
    function details(unit) {
      if (data.feels == null) return null;
      const wind = unit === 'F' ? `${Math.round(data.wind / 1.609)} mph` : `${Math.round(data.wind)} km/h`;
      return h('div', { class: 'wx-details' },
        h('span', {}, h('span', { class: 'muted' }, 'Feels like '), `${toUnit(data.feels, unit)}°`),
        h('span', {}, h('span', { class: 'muted' }, 'Humidity '), `${Math.round(data.humidity)}%`),
        h('span', {}, h('span', { class: 'muted' }, 'Wind '), wind));
    }

    /** Big card: the next five days. */
    function forecast(unit) {
      if (!data.days?.length) return null;
      return h('ol', { class: 'wx-days' }, data.days.map((d) => {
        const [text, dayIcon] = describe(d.code);
        const name = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
        return h('li', { title: text }, h('span', { class: 'wx-day' }, name), icon(dayIcon, 20),
          h('span', { class: 'wx-hl' }, `${toUnit(d.high, unit)}°`, h('span', { class: 'muted' }, ` ${toUnit(d.low, unit)}°`)));
      }));
    }

    function airRow() {
      if (!air) return null;
      const [, text, advice, level] = aqiBand(air.aqi);
      const fmt = (v) => (v == null ? '–' : Math.round(v));
      return h('div', { class: `aqi aqi-${level}`, title: `${advice}\nPM2.5 ${fmt(air.pm25)} · PM10 ${fmt(air.pm10)} · Ozone ${fmt(air.o3)} µg/m³ (US AQI)` },
        h('span', { class: 'aqi-badge' }, String(air.aqi)),
        h('span', { class: 'aqi-text' }, h('b', {}, 'Air quality'), ` · ${text}`),
        h('span', { class: 'aqi-pm muted' }, `PM2.5 ${fmt(air.pm25)}`));
    }

    function draw() {
      if (fetchedAt) setFresh(fetchedAt, 2 * TTL); // stale after an hour
      const unit = ctx.settings.tempUnit;
      unitBtn.textContent = unit === 'C' ? '°F' : '°C';
      if (!data) return;
      const [text, dayIcon, nightIcon] = describe(data.code);
      render(current,
        h('div', { class: 'weather' },
          h('div', { class: 'weather-icon' }, icon(data.isDay ? dayIcon : nightIcon, 34)),
          h('div', { class: 'weather-main' },
            h('div', { class: 'weather-temp' }, `${toUnit(data.temp, unit)}°`),
            h('div', { class: 'weather-meta' },
              h('span', {}, text),
              h('span', { class: 'muted' }, `H ${toUnit(data.high, unit)}°  L ${toUnit(data.low, unit)}°`),
            ),
          ),
        ),
        h('div', { class: 'weather-location muted' }, label || 'Current location'),
        sizeOf(el) === 'big' ? details(unit) : null,
        airRow(),
        sizeOf(el) === 'big' ? forecast(unit) : null,
      );
      setGlance(icon(data.isDay ? dayIcon : nightIcon, 15), h('b', {}, `${toUnit(data.temp, unit)}°`),
        air ? h('span', { class: `glance-aqi aqi-${aqiBand(air.aqi)[3]}`, title: `Air quality: ${aqiBand(air.aqi)[1]}` }, `AQI ${air.aqi}`) : null,
        h('span', {}, text));
    }

    async function load(force = false) {
      const s = ctx.settings;
      // Stale-while-revalidate: show the last weather at once (no skeleton, no wait for the
      // location or the network), then refresh it below if it's old or for another place.
      if (!data) {
        const last = await getLocal(CACHE_KEY);
        if (last?.data) { data = last.data; air = last.air ?? null; fetchedAt = last.at; label = s.location.label || labelFromTimezone(data.timezone); draw(); }
      }
      try {
        let loc;
        if (s.location.mode === 'city' && s.location.lat != null) loc = { lat: s.location.lat, lon: s.location.lon, label: s.location.label };
        else loc = await getPosition();

        const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
        const cache = await getLocal(CACHE_KEY);
        if (!force && cache?.key === key && Date.now() - cache.at < TTL && 'air' in cache && cache.data?.days) {
          data = cache.data;
          air = cache.air;
          fetchedAt = cache.at;
        } else {
          // Air quality is a bonus: its failure never hides the weather.
          [data, air] = await Promise.all([fetchWeather(loc.lat, loc.lon), fetchAir(loc.lat, loc.lon).catch(() => null)]);
          fetchedAt = Date.now();
          await setLocal(CACHE_KEY, { key, at: fetchedAt, data, air });
        }
        label = loc.label || labelFromTimezone(data.timezone);
        draw();
      } catch (err) {
        console.info('[Calm Tab] weather unavailable:', err?.message ?? err);
        // Fall back to any cached data, however old, before showing a placeholder.
        const cache = await getLocal(CACHE_KEY);
        if (cache?.data) { data = cache.data; air = cache.air ?? null; fetchedAt = cache.at; label = s.location.label || labelFromTimezone(data.timezone); draw(); return; }
        setGlance(h('span', { class: 'muted' }, 'Weather unavailable'));
        render(current, placeholder('Weather unavailable', 'Set a city', () => ctx.openSettings('location')));
      }
    }

    render(current, h('div', { class: 'skeleton', style: { height: '7.5rem' } })); // the block's real height (weather, place, air quality)
    draw();
    load();

    let lastLoc = JSON.stringify(ctx.settings.location);
    return {
      el,
      resize: () => draw(),
      refresh: () => { load(true); clocks.refresh(); },
      update(s) {
        const loc = JSON.stringify(s.location);
        if (loc !== lastLoc) { lastLoc = loc; load(true); } else draw();
        clocks.update(s);
      },
    };
  },
};
