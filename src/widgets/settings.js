/**
 * Slide-in Settings panel (gear icon). Loaded on demand so it costs nothing at startup.
 * Sections: General, Widgets, Background, News, Sites, Pomodoro & Focus, Affirmations, Data.
 */
import { h, render, iconButton, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { searchCity } from './weather.js';
import { FACES, CLOCK_COLORS, facePreview } from './clock.js';
import { getPhotos } from './background.js';
import { CATEGORIES, COLUMN_WIDGETS, DEFAULT_CATEGORY_MAP, DEFAULT_FEEDS, WIDGET_LABELS } from '../shared/defaults.js';
import { categoryFor, domainOf } from '../shared/util.js';
import { getLocal, setLocal } from '../shared/storage.js';
import { PROFILE_KEY } from './fengshui.js';
import { profile as fsProfile } from '../shared/fengshui.js';
import { hasHistoryAccess, requestHistoryAccess, importHistory, getHistoryMeta, forgetHistory } from '../lib/history.js';

const SECTIONS = [
  ['general', 'General'],
  ['widgets', 'Widgets'],
  ['clocks', 'World clocks'],
  ['background', 'Background'],
  ['news', 'News'],
  ['sites', 'Sites'],
  ['fengshui', 'Phong thủy'],
  ['pomodoro', 'Pomodoro & Focus'],
  ['nudges', 'Nudges'],
  ['icebreakers', 'Ice breakers'],
  ['affirmations', 'Affirmations'],
  ['data', 'Privacy & Data'],
];

/** Five groups instead of fourteen tabs; each group lists its pages as a second row. */
const GROUPS = [
  ['appearance', 'Appearance', ['general', 'background', 'widgets', 'clocks']],
  ['focus', 'Focus', ['pomodoro', 'nudges', 'sites']],
  ['content', 'Content', ['news', 'fengshui', 'icebreakers', 'affirmations']],
  ['ai', 'AI & Jade', ['ai', 'jade']],
  ['privacy', 'Privacy', ['data']],
].map(([id, label, ids]) => [id, label, ids.filter((s) => SECTIONS.some(([k]) => k === s))]).filter(([, , ids]) => ids.length);
const sectionLabel = (id) => (SECTIONS.find(([k]) => k === id)?.[1] ?? id).replace(/^✦\s*/, '');
const groupOf = (section) => GROUPS.find(([, , ids]) => ids.includes(section)) ?? GROUPS[0];

let panel, body, nav, ctx, active = 'general', query = '', searchInput;

// ---------- Small form builders ----------
const row = (label, hint, ...controls) =>
  h('div', { class: 'row' }, h('label', {}, label, hint ? h('span', { class: 'hint' }, hint) : null), h('div', { class: 'row-actions' }, controls));

function toggle(checked, onchange, label) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  input.checked = !!checked;
  input.addEventListener('change', () => onchange(input.checked));
  return h('span', { class: 'switch' }, input);
}

function segmented(options, value, onchange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const [v, label] of options) {
    const btn = h('button', { type: 'button', class: v === value ? 'active' : '', role: 'radio', 'aria-checked': String(v === value) }, label);
    btn.addEventListener('click', () => {
      for (const b of wrap.children) { b.classList.toggle('active', b === btn); b.setAttribute('aria-checked', String(b === btn)); }
      onchange(v);
    });
    wrap.append(btn);
  }
  return wrap;
}

function select(options, value, onchange, cls = '') {
  const el = h('select', { class: `field ${cls}`, onchange: () => onchange(el.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  return el;
}

function numberField(value, min, max, onchange) {
  const el = h('input', { type: 'number', class: 'field num', min: String(min), max: String(max), value: String(value) });
  el.addEventListener('change', () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(el.value) || min)));
    el.value = String(n);
    onchange(n);
  });
  return el;
}

const save = (patch) => ctx.save(patch);

/** Clock faces: live mini previews of every face, plus colour swatches. Tip: click the clock to cycle. */
const SWATCH = {
  default: 'var(--text)', jade: '#3DBE8B', lime: '#B8E35A', mono: '#D8DADF',
  sunset: 'linear-gradient(135deg, #FFC36E, #FF7A90 55%, #C86DD7)', ocean: 'linear-gradient(135deg, #8FE7FF, #5BB8E6 50%, #4C7BE8)',
  aurora: 'linear-gradient(135deg, #A8E6C9, #5BB8E6 50%, #B296E0)', peach: 'linear-gradient(135deg, #FFE0B5, #FFB199 50%, #FF8FA3)',
};
function clockFaceGroup(s) {
  const clock = { face: 'classic', color: 'default', ...s.clock };
  const opts = { timeFormat: s.timeFormat, showSeconds: false };
  const choose = (patch) => nested('clock', patch).then(redraw);
  return h('div', { class: 'group' },
    h('div', { class: 'face-gallery', role: 'radiogroup', 'aria-label': 'Clock face' },
      FACES.map(([id, name]) => h('button', {
        type: 'button', class: `face-tile ${clock.face === id ? 'active' : ''}`, role: 'radio', 'aria-checked': String(clock.face === id),
        onclick: () => choose({ face: id }),
      }, facePreview(id, clock.color, opts), h('span', { class: 'face-tile-name' }, name)))),
    row('Colour', 'Tip: click the clock itself to cycle faces', h('div', { class: 'color-swatches', role: 'radiogroup', 'aria-label': 'Clock colour' },
      CLOCK_COLORS.map(([id, name]) => h('button', {
        type: 'button', class: `color-swatch ${clock.color === id ? 'active' : ''}`, role: 'radio', 'aria-checked': String(clock.color === id),
        title: name, 'aria-label': name, style: { background: SWATCH[id] }, onclick: () => choose({ color: id }),
      })))),
  );
}

/** Liquid glass transparency: previews live while dragging, saves on release. */
function glassRow(s) {
  const value = s.glass?.transparency ?? 50;
  const out = h('span', { class: 'glass-value' });
  const word = (v) => (v < 20 ? 'Frosted' : v < 45 ? 'Soft' : v < 70 ? 'Balanced' : v < 90 ? 'Clear' : 'Crystal');
  const range = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(value), class: 'glass-range', 'aria-label': 'Glass transparency' });
  const show = () => { out.textContent = `${range.value}%`; range.title = `${word(+range.value)} · ${range.value}%`; range.setAttribute('aria-valuetext', range.title); };
  range.addEventListener('input', () => { show(); ctx.previewGlass(range.value); });
  range.addEventListener('change', () => nested('glass', { transparency: Number(range.value) }));
  show();
  return row('Glass transparency', 'Liquid glass, from frosted to crystal clear', h('div', { class: 'glass-control' }, range, out));
}
const nested = (key, patch) => save({ [key]: { ...ctx.settings[key], ...patch } });

// ---------- Sections ----------
const renderers = {
  general() {
    const s = ctx.settings;
    const nameInput = h('input', { class: 'field wide', placeholder: 'Your name', value: s.name, maxlength: '40' });
    nameInput.addEventListener('input', () => save({ name: nameInput.value }));

    // Location: auto (geolocation) or a searched city
    const results = h('ul', { class: 'results' });
    const cityInput = h('input', { class: 'field wide', placeholder: 'Search a city…', value: s.location.mode === 'city' ? s.location.label : '' });
    let t;
    cityInput.addEventListener('input', () => {
      clearTimeout(t);
      const q = cityInput.value.trim();
      if (q.length < 2) return render(results);
      t = setTimeout(async () => {
        try {
          const list = await searchCity(q);
          render(results, list.map((c) => h('li', {}, h('button', {
            type: 'button',
            onclick: () => { nested('location', { mode: 'city', label: c.short, lat: c.lat, lon: c.lon }); cityInput.value = c.short; render(results); toast(`Weather set to ${c.label}`); },
          }, c.label))));
        } catch { render(results, h('li', { class: 'row muted' }, 'Search unavailable offline')); }
      }, 300);
    });

    return [
      h('h3', {}, 'You'),
      h('div', { class: 'group' }, h('div', { class: 'form-row' }, nameInput)),
      h('h3', {}, 'Clock & units'),
      h('div', { class: 'group' },
        row('Time format', null, segmented([['12h', '12-hour'], ['24h', '24-hour']], s.timeFormat, (v) => save({ timeFormat: v }))),
        row('Show seconds', 'Analog shows a sweeping second hand', toggle(s.showSeconds, (v) => save({ showSeconds: v }), 'Show seconds')),
        row('Temperature', null, segmented([['C', '°C'], ['F', '°F']], s.tempUnit, (v) => save({ tempUnit: v }))),
        row('Appearance', 'Auto follows your system', segmented([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], s.theme, (v) => save({ theme: v }))),
        glassRow(s),
      ),
      h('h3', {}, 'Clock face'),
      clockFaceGroup(s),
      h('h3', {}, 'Typography & learning'),
      h('div', { class: 'group' },
        row('Quote style', null, select([['classic', 'Classic serif'], ['editorial', 'Editorial'], ['script', 'Handwritten'], ['system', 'System']], s.quoteStyle, (v) => save({ quoteStyle: v }))),
        row('Quote language', null, select([['en', 'English'], ['vi', 'Tiếng Việt'], ['en+vi', 'English + Tiếng Việt']], s.quoteLang, (v) => save({ quoteLang: v }))),
        row('Affirmation language', 'Your own affirmations stay as you wrote them', select([['en', 'English'], ['vi', 'Tiếng Việt'], ['en+vi', 'English + Tiếng Việt']], s.affirmationLang, (v) => save({ affirmationLang: v }))),
        row('Word of the day', 'Meanings shown in Vietnamese (English for Vietnamese words)', select([['en', 'English'], ['vi', 'Vietnamese']], s.vocabLang, (v) => save({ vocabLang: v }))),
      ),
      h('h3', { id: 'section-location' }, 'Weather location'),
      h('div', { class: 'group' },
        row('Use my location', 'Uses browser geolocation', toggle(s.location.mode === 'auto', (v) => nested('location', v ? { mode: 'auto' } : { mode: 'city' }), 'Use my location')),
        h('div', { class: 'form-row' }, cityInput),
        results,
      ),
    ];
  },

  widgets() {
    const s = ctx.settings;
    const fixed = ['greeting', 'affirmation', 'quote', 'signature'];
    const placed = [...s.layout.left, ...s.layout.right];
    const plan = { left: s.layout.left, right: [...s.layout.right, ...COLUMN_WIDGETS.filter((id) => !placed.includes(id))] };
    const moveWithin = (side, id, dir) => {
      const list = [...plan[side]];
      const i = list.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      save({ layout: { ...plan, [side]: list } }).then(redraw);
    };
    const moveSide = (id, side) => {
      const other = side === 'left' ? 'right' : 'left';
      save({ layout: { [side]: [...plan[side].filter((x) => x !== id), id], [other]: plan[other].filter((x) => x !== id) } }).then(redraw);
    };
    const sideRows = (side) => plan[side].filter((id) => COLUMN_WIDGETS.includes(id)).map((id, i, arr) =>
      row(WIDGET_LABELS[id], null,
        iconButton('up', 'Move up', () => moveWithin(side, id, -1), i === 0 ? 'small muted' : 'small'),
        iconButton('down', 'Move down', () => moveWithin(side, id, 1), i === arr.length - 1 ? 'small muted' : 'small'),
        select([['left', 'Left'], ['right', 'Right']], side, (v) => moveSide(id, v)),
        select([['mini', 'Mini'], ['regular', 'Regular'], ['big', 'Big']], s.sizes?.[id] ?? 'regular', (v) => ctx.setSize(id, v), 'size-select'),
        toggle(s.widgets[id] !== false, (v) => nested('widgets', { [id]: v }), `Show ${WIDGET_LABELS[id]}`),
      ));

    return [
      h('h3', {}, 'Center'),
      h('div', { class: 'group' },
        fixed.map((id) => row(WIDGET_LABELS[id], null, toggle(s.widgets[id] !== false, (v) => nested('widgets', { [id]: v }), `Show ${WIDGET_LABELS[id]}`))),
        row('Zen mode', 'Only the clock and background. Shortcut: Z', toggle(s.zen, (v) => save({ zen: v }), 'Zen mode')),
      ),
      h('p', { class: 'settings-note' }, 'Mini collapses a card to a single line with a live summary; Big widens its column and shows more. You can also use the buttons in each card’s header.'),
      h('h3', {}, 'Left column'),
      h('div', { class: 'group' }, sideRows('left')),
      h('h3', {}, 'Right column'),
      h('div', { class: 'group' }, sideRows('right')),
    ];
  },

  background() {
    const s = ctx.settings;
    const bg = s.background;
    const thumbs = h('div', { class: 'thumbs' });
    getPhotos(s).then((photos) => {
      render(thumbs, photos.map((p) => {
        const isActive = bg.mode === 'fixed' && bg.fixedUrl === p.url;
        const btn = h('button', {
          type: 'button', class: `thumb ${isActive ? 'active' : ''}`, title: `${p.credit}${p.source ? ' · ' + p.source : ''}`, 'aria-label': `Use photo by ${p.credit}`,
          onclick: () => { nested('background', { mode: 'fixed', fixedUrl: p.url }).then(redraw); },
        },
        // Lazy + low priority: thumbnails load only as they scroll into view in the panel.
        h('img', { src: p.thumb || p.url, alt: '', loading: 'lazy', decoding: 'async', fetchpriority: 'low', draggable: 'false' }),
        bg.favorites.includes(p.url) ? h('span', { class: 'fav' }, icon('heart', 12)) : null);
        return btn;
      }));
    });
    const customInput = h('input', { class: 'field wide', placeholder: 'https://… image URL', value: bg.customUrl });
    customInput.addEventListener('change', () => nested('background', { customUrl: customInput.value.trim() }));
    const dim = h('input', { type: 'range', min: '0.05', max: '0.7', step: '0.01', value: String(bg.dim), 'aria-label': 'Overlay strength' });
    dim.addEventListener('input', () => document.documentElement.style.setProperty('--overlay', dim.value));
    dim.addEventListener('change', () => nested('background', { dim: Number(dim.value) }));

    return [
      h('h3', {}, 'Change background'),
      h('div', { class: 'group' },
        row('Rotation', null, segmented([['daily', 'Daily'], ['newtab', 'Every tab'], ['fixed', 'Fixed']], bg.mode, (v) => nested('background', { mode: v }))),
        row('Looping video', 'Calm nature footage; uses more bandwidth', toggle(bg.useVideo, (v) => nested('background', { useVideo: v }), 'Looping video')),
        row('Overlay', 'Keeps text readable', dim),
      ),
      h('h3', {}, 'Choose a photo'),
      thumbs,
      h('p', { class: 'settings-note' }, 'Click a photo to keep it fixed. Use ♥ next to the photo credit to favorite the current background.'),
      h('h3', {}, 'Custom image'),
      h('div', { class: 'group' }, h('div', { class: 'form-row' }, customInput)),
    ];
  },

  news() {
    const s = ctx.settings;
    const feeds = s.feeds;
    const update = (list) => save({ feeds: list }).then(() => { chrome.runtime.sendMessage({ type: 'rss:refresh', force: true }).catch(() => {}); redraw(); });

    const feedRows = (tab) => feeds.filter((f) => f.tab === tab).map((f) =>
      row(f.name, safeHost(f.url),
        iconButton('trash', `Remove ${f.name}`, () => update(feeds.filter((x) => x.id !== f.id)), 'small'),
        toggle(f.enabled, (v) => update(feeds.map((x) => (x.id === f.id ? { ...x, enabled: v } : x))), `Enable ${f.name}`),
      ));

    const nameIn = h('input', { class: 'field', placeholder: 'Name', style: { width: '7rem' } });
    const urlIn = h('input', { class: 'field wide', placeholder: 'https://example.com/feed.xml' });
    const tabIn = select([['vn', 'Vietnam'], ['tech', 'Tech']], 'tech', () => {});
    const add = h('button', { class: 'pill-btn primary', type: 'button' }, icon('plus', 14), 'Add');
    add.addEventListener('click', () => {
      let url;
      try { url = new URL(urlIn.value.trim()); } catch { return toast('Enter a valid feed URL'); }
      if (url.protocol === 'http:') url.protocol = 'https:'; // HTTPS only: most feeds serve both
      if (url.protocol !== 'https:') return toast('Feed must be an https:// link');
      // Must be called synchronously inside the click so Chrome shows the permission prompt.
      chrome.permissions.request({ origins: [`${url.origin}/*`] }).then((granted) => {
        if (!granted) return toast('Permission needed to read this feed');
        update([...feeds, { id: `custom-${Date.now()}`, name: nameIn.value.trim() || url.hostname.replace(/^www\./, ''), url: url.href, tab: tabIn.value, enabled: true }]);
        toast('Feed added');
      });
    });

    return [
      h('h3', {}, 'Vietnam News'),
      h('div', { class: 'group' }, feedRows('vn')),
      h('h3', {}, 'Tech News'),
      h('div', { class: 'group' }, feedRows('tech')),
      h('h3', {}, 'Add a feed'),
      h('div', { class: 'group' },
        h('div', { class: 'form-row' }, nameIn, urlIn),
        h('div', { class: 'form-row' }, tabIn, h('span', { style: { flex: 1 } }), add),
      ),
      h('p', { class: 'settings-note' }, 'Feeds are fetched by the extension itself every 30 minutes and cached on this device.'),
      h('h3', {}, 'Pictures'),
      h('div', { class: 'group' },
        row('Pictures for every linked site', 'Reads the share image from sites like those on Hacker News. Calm Tab then contacts each linked site, and Chrome asks for access to all sites.',
          (() => {
            const t = toggle(s.newsImagesAllSites, () => {}, 'Pictures for every linked site');
            const input = t.querySelector('input');
            input.addEventListener('change', () => {
              if (!input.checked) {
                chrome.permissions.remove({ origins: ['https://*/*'] }).catch(() => {});
                save({ newsImagesAllSites: false }).then(() => chrome.runtime.sendMessage({ type: 'rss:refresh', force: true }).catch(() => {}));
                return;
              }
              // Requested synchronously in the change event so Chrome shows its prompt.
              chrome.permissions.request({ origins: ['https://*/*'] }).then((granted) => {
                if (!granted) { input.checked = false; return toast('Chrome didn’t allow access to all sites'); }
                save({ newsImagesAllSites: true }).then(() => chrome.runtime.sendMessage({ type: 'rss:refresh', force: true }).catch(() => {}));
                toast('Loading pictures for linked stories…');
              });
            });
            return t;
          })()),
      ),
      h('p', { class: 'settings-note' }, 'Without this, stories still get pictures from their feed or from sites Calm Tab already reads, and otherwise show the site’s icon.'),
      h('h3', {}, 'Product Hunt'),
      productHuntGroup(),
      h('div', { class: 'form-row', style: { padding: '0.75rem 0 0' } },
        h('button', { class: 'link-btn', type: 'button', onclick: () => update(structuredClone(DEFAULT_FEEDS)) }, 'Restore default feeds')),
    ];
  },

  sites() {
    const wrap = h('div', {});
    (async () => {
      const overrides = await getLocal('categories:overrides', {});
      const all = await chrome.storage.local.get(null);
      const totals = {};
      for (const [k, v] of Object.entries(all)) if (k.startsWith('track:')) for (const [d, sec] of Object.entries(v)) totals[d] = (totals[d] ?? 0) + sec;
      const domains = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, 40);
      for (const d of Object.keys(overrides)) if (!domains.includes(d)) domains.push(d);

      const setCat = async (domain, cat) => {
        const next = { ...(await getLocal('categories:overrides', {})) };
        if (cat === categoryFor(domain, {}, DEFAULT_CATEGORY_MAP)) delete next[domain]; else next[domain] = cat;
        await setLocal('categories:overrides', next);
        toast(`${domain} → ${cat}`);
      };
      const catSelect = (domain) => select(CATEGORIES.map((c) => [c, c]), categoryFor(domain, overrides, DEFAULT_CATEGORY_MAP), (v) => setCat(domain, v), 'cat-select');

      const input = h('input', { class: 'field wide', placeholder: 'example.com' });
      const cat = select(CATEGORIES.map((c) => [c, c]), 'Work', () => {}, 'cat-select');
      const add = h('button', { class: 'pill-btn primary', type: 'button', onclick: async () => {
        const domain = domainOf(/^https?:/.test(input.value) ? input.value : `https://${input.value.trim()}`);
        if (!domain) return toast('Enter a domain like example.com');
        await setCat(domain, cat.value);
        redraw();
      } }, icon('plus', 14), 'Add');

      render(wrap,
        h('h3', {}, 'Assign a site'),
        h('div', { class: 'group' }, h('div', { class: 'form-row' }, input, cat, add)),
        h('h3', {}, 'Your sites'),
        domains.length
          ? h('div', { class: 'group' }, domains.map((d) => row(d, null, catSelect(d))))
          : h('p', { class: 'settings-note' }, 'Sites you visit will appear here so you can recategorise them.'),
        h('p', { class: 'settings-note' }, 'Subdomains inherit their parent’s category (e.g. mail.google.com → google.com) unless set separately.'),
      );
    })();
    return [wrap];
  },

  pomodoro() {
    const s = ctx.settings;
    const p = s.pomodoro;
    const f = s.focus;
    const toggleCat = (c, on) => nested('focus', { blocked: on ? [...new Set([...ctx.settings.focus.blocked, c])] : ctx.settings.focus.blocked.filter((x) => x !== c) });
    return [
      h('h3', {}, 'Durations (minutes)'),
      h('div', { class: 'group' },
        row('Focus', null, numberField(p.focus, 1, 180, (v) => nested('pomodoro', { focus: v }))),
        row('Short break', null, numberField(p.short, 1, 60, (v) => nested('pomodoro', { short: v }))),
        row('Long break', null, numberField(p.long, 1, 90, (v) => nested('pomodoro', { long: v }))),
        row('Long break after', 'Focus sessions', numberField(p.longEvery, 2, 12, (v) => nested('pomodoro', { longEvery: v }))),
        row('Daily goal', 'Focus sessions per day', numberField(p.dailyGoal ?? 4, 1, 16, (v) => nested('pomodoro', { dailyGoal: v }))),
      ),
      h('h3', {}, 'Behaviour'),
      h('div', { class: 'group' },
        row('Focus Mode during sessions', 'Turns on automatically while you focus', toggle(p.autoFocus, (v) => nested('pomodoro', { autoFocus: v }), 'Auto Focus Mode')),
        row('Auto-start next session', null, toggle(p.autoStartNext, (v) => nested('pomodoro', { autoStartNext: v }), 'Auto-start')),
        row('Soft chime', null, toggle(p.chime, (v) => nested('pomodoro', { chime: v }), 'Chime')),
      ),
      h('h3', {}, 'Focus session'),
      h('div', { class: 'group' },
        row('Start sound and Focus Mode with Pomodoro', 'Start on the Pomodoro card begins a Focus session', toggle(ctx.settings.session?.enabled !== false, (v) => nested('session', { enabled: v }), 'Focus session')),
        row('Block distracting sites', 'During focus phases of a session', toggle(ctx.settings.session?.block !== false, (v) => nested('session', { block: v }), 'Block sites in sessions')),
        row('Play ambient sound', 'Your last sound', toggle(ctx.settings.session?.sound !== false, (v) => nested('session', { sound: v }), 'Sound in sessions')),
        row('Sound during breaks', null, select([['dim', 'Softer (40%)'], ['pause', 'Pause']], ctx.settings.session?.breakSound ?? 'dim', (v) => nested('session', { breakSound: v }))),
      ),
      h('h3', {}, 'Focus Mode'),
      h('div', { class: 'group' },
        row('When visiting a distracting site', null, segmented([['warn', 'Gently warn'], ['block', 'Block']], f.mode, (v) => nested('focus', { mode: v }))),
        CATEGORIES.map((c) => row(c, null, toggle(f.blocked.includes(c), (v) => toggleCat(c, v), `Distracting: ${c}`))),
        row('Daily focus goal', 'Hours of Work + Learning time', numberField(f.goalHours ?? 4, 1, 12, (v) => nested('focus', { goalHours: v }))),
      ),
      h('p', { class: 'settings-note' }, 'Categories switched on are treated as distracting while Focus Mode is active.'),
    ];
  },

  nudges() {
    const n = ctx.settings.nudges;
    const setN = (patch) => save({ nudges: { ...ctx.settings.nudges, ...patch } });
    const PERS = [['random', 'Random mix'], ['grandma', '👵 Disappointed Grandma'], ['narrator', '🎙️ Dramatic Narrator'], ['robot', '🤖 Sarcastic Robot'], ['coach', '📣 Motivational Coach'], ['future', '🔮 Your Future Self']];
    // Sites you assigned yourself (Settings → Sites) are loaded now so the prompt can open from the click.
    let overrides = {};
    getLocal('categories:overrides', {}).then((o) => { overrides = o; });
    // Turning nudges on asks Chrome for access to the distracting sites only, from this click.
    const enable = toggle(n.enabled, () => {}, 'Distraction nudges');
    const input = enable.querySelector('input');
    input.addEventListener('change', () => {
      if (!input.checked) return setN({ enabled: false });
      const cats = ctx.settings.nudges.categories;
      const origins = Object.entries({ ...DEFAULT_CATEGORY_MAP, ...overrides }).filter(([, c]) => cats.includes(c)).flatMap(([d]) => [`https://${d}/*`, `https://*.${d}/*`]);
      chrome.permissions.request({ origins }).then((granted) => {
        setN({ enabled: true });
        toast(granted ? 'Nudges on — they’ll appear on distracting sites' : 'Nudges on — shown as notifications (no site access)');
      }).catch(() => { setN({ enabled: true }); toast('Nudges on — shown as notifications'); });
    });
    const thr = (i, label) => numberField(n.thresholds[i], i === 0 ? 1 : n.thresholds[i - 1] + 1, 240, (v) => { const t = [...ctx.settings.nudges.thresholds]; t[i] = v; setN({ thresholds: t }); });
    const timeField = (key, value) => { const f = h('input', { type: 'time', class: 'field', value }); f.addEventListener('change', () => setN({ quietHours: { ...ctx.settings.nudges.quietHours, [key]: f.value } })); return f; };
    return [
      h('h3', {}, 'Distraction nudges'),
      h('div', { class: 'group' },
        row('Funny reminders on distracting sites', 'Gentle at first, sassier if you stay. Never mean.', enable),
        row('Personality', null, select(PERS, n.personality, (v) => setN({ personality: v }))),
        row('Language', null, segmented([['en', 'English'], ['vi', 'Tiếng Việt'], ['mix', 'Mix']], n.lang, (v) => setN({ lang: v }))),
        row('Soft sound', null, toggle(n.sound, (v) => setN({ sound: v }), 'Nudge sound')),
      ),
      h('h3', {}, 'When to nudge (minutes on one site)'),
      h('div', { class: 'group' },
        row('Level 1 · gentle toast', null, thr(0)),
        row('Level 2 · cheeky card', null, thr(1)),
        row('Level 3 · dramatic overlay', null, thr(2)),
        row('Daily goal for your streak', 'Minutes per day in distracting categories', numberField(n.dailyGoal, 5, 600, (v) => setN({ dailyGoal: v }))),
      ),
      h('p', { class: 'settings-note' }, 'During a Pomodoro or Focus Mode, nudges start straight at level 2. Reading opened from the AI News tab counts as Learning and never triggers nudges.'),
      h('h3', {}, 'Which categories count as distracting'),
      h('div', { class: 'group' }, ['Social Media', 'Entertainment', 'News', 'Other'].map((c) => row(c, null, toggle(n.categories.includes(c), (v) => setN({ categories: v ? [...new Set([...ctx.settings.nudges.categories, c])] : ctx.settings.nudges.categories.filter((x) => x !== c) }), c)))),
      h('p', { class: 'settings-note' }, 'Choose which sites belong to each category in Settings → Sites.'),
      h('h3', {}, 'Quiet hours'),
      h('div', { class: 'group' },
        row('No nudges during quiet hours', null, toggle(n.quietHours.enabled, (v) => setN({ quietHours: { ...ctx.settings.nudges.quietHours, enabled: v } }), 'Quiet hours')),
        row('From', null, timeField('start', n.quietHours.start)),
        row('Until', null, timeField('end', n.quietHours.end)),
        row('All weekend', null, toggle(n.quietHours.weekends, (v) => setN({ quietHours: { ...ctx.settings.nudges.quietHours, weekends: v } }), 'Weekends')),
      ),
      h('h3', {}, 'Hard limit (optional)'),
      h('div', { class: 'group' },
        row('Block after a daily limit', 'Shows a final funny message instead of the site', toggle(n.hardLimit.enabled, (v) => setN({ hardLimit: { ...ctx.settings.nudges.hardLimit, enabled: v } }), 'Hard limit')),
        row('Minutes per day per category', null, numberField(n.hardLimit.minutes, 10, 720, (v) => setN({ hardLimit: { ...ctx.settings.nudges.hardLimit, minutes: v } }))),
      ),
    ];
  },

  icebreakers() {
    const ib = ctx.settings.icebreakers;
    const setIB = (patch) => save({ icebreakers: { ...ctx.settings.icebreakers, ...patch } });
    return [
      h('h3', {}, 'Ice breakers'),
      h('div', { class: 'group' },
        row('Default language', 'Bilingual shows Vietnamese stories with English key phrases', segmented([['en', 'English'], ['vi', 'Tiếng Việt'], ['bi', 'Bilingual']], ib.lang, (v) => setIB({ lang: v }))),
      ),
      h('p', { class: 'settings-note' }, 'Filter types, audience, length and meeting type right on the card. Favorites, history and “never show again” stay on this device.'),
    ];
  },

  clocks() {
    const list = ctx.settings.worldClocks ?? [];
    const update = (next) => save({ worldClocks: next }).then(redraw);
    const move = (i, d) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; update(n); };
    const results = h('ul', { class: 'results' });
    const input = h('input', { class: 'field wide', placeholder: 'Add a city… (e.g. Tokyo, Sydney)' });
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) return render(results);
      t = setTimeout(async () => {
        try {
          const found = (await searchCity(q)).filter((c) => c.tz);
          render(results, found.map((c) => h('li', {}, h('button', {
            type: 'button',
            onclick: () => {
              if (list.some((x) => x.tz === c.tz && x.name === c.short)) return toast(`${c.short} is already in your list`);
              update([...list, { name: c.short, tz: c.tz, lat: c.lat, lon: c.lon }]);
              toast(`Added ${c.short}`);
            },
          }, `${c.label}  ·  ${c.tz.replace(/_/g, ' ')}`))));
        } catch { render(results, h('li', { class: 'row muted' }, 'Search unavailable offline')); }
      }, 300);
    });
    return [
      h('h3', {}, 'Your cities'),
      list.length
        ? h('div', { class: 'group' }, list.map((c, i) => row(c.name, c.tz.replace(/_/g, ' '),
            iconButton('up', 'Move up', () => move(i, -1), i === 0 ? 'small muted' : 'small'),
            iconButton('down', 'Move down', () => move(i, 1), i === list.length - 1 ? 'small muted' : 'small'),
            iconButton('trash', `Remove ${c.name}`, () => update(list.filter((_, j) => j !== i)), 'small'))))
        : h('p', { class: 'settings-note' }, 'No cities yet.'),
      h('h3', {}, 'Add a city'),
      h('div', { class: 'group' }, h('div', { class: 'form-row' }, input), results),
      h('p', { class: 'settings-note' }, 'Shown under your local weather in the Weather & clocks card. Each city shows its local time, whether it’s day or night there, the difference from you, and the current weather.'),
    ];
  },

  fengshui() {
    const wrap = h('div', {});
    getLocal(PROFILE_KEY, {}).then((stored) => {
      const date = h('input', { type: 'date', class: 'field', value: stored.birthDate ?? '', max: new Date().toISOString().slice(0, 10), min: '1900-01-01' });
      const gender = select([['male', 'Nam · Male'], ['female', 'Nữ · Female']], stored.gender ?? 'male', () => {});
      const hours = [['', 'Not sure'], ...Array.from({ length: 24 }, (_, i) => [String(i), `${String(i).padStart(2, '0')}:00–${String(i).padStart(2, '0')}:59`])];
      const hour = select(hours, stored.birthHour ?? '', () => {});
      const preview = h('p', { class: 'settings-note' });
      const showPreview = (p) => {
        if (!p.birthDate) return (preview.textContent = 'Your birthday stays on this device and is used only for these calculations.');
        const r = fsProfile(p);
        preview.textContent = `Tuổi ${r.yearLabel} (${r.animal}) · Mệnh ${r.napAm.name} · Cung ${r.cung}, ${r.group}`;
      };
      const persist = async () => {
        const p = { birthDate: date.value, gender: gender.value, birthHour: hour.value };
        await setLocal(PROFILE_KEY, p);
        showPreview(p);
      };
      [date, gender, hour].forEach((el) => el.addEventListener('change', persist));
      showPreview(stored);
      render(wrap,
        h('h3', {}, 'Your details'),
        h('div', { class: 'group' },
          row('Date of birth', 'Solar (dương lịch) date', date),
          row('Gender', 'Cung mệnh depends on it', gender),
          row('Birth hour', 'Optional', hour),
        ),
        preview,
        h('p', { class: 'settings-note' }, 'Readings follow common Vietnamese almanac rules (12 thần, 12 trực, tam hợp / lục xung, Bát trạch). They are traditional guidance for reflection.'),
        stored.birthDate ? h('div', { class: 'form-row', style: { padding: '0.5rem 0 0' } }, h('button', { class: 'link-btn', type: 'button', onclick: async () => { await chrome.storage.local.remove(PROFILE_KEY); redraw(); } }, 'Remove my birth details')) : null,
      );
    });
    return [wrap];
  },

  affirmations() {
    const list = ctx.settings.customAffirmations ?? [];
    const input = h('input', { class: 'field wide', placeholder: 'I am…', maxlength: '120' });
    const add = () => {
      const text = input.value.trim();
      if (!text) return;
      save({ customAffirmations: [text, ...list] }).then(redraw);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return [
      h('h3', {}, 'Your affirmations'),
      h('div', { class: 'group' },
        h('div', { class: 'form-row' }, input, h('button', { class: 'pill-btn primary', type: 'button', onclick: add }, icon('plus', 14), 'Add')),
        list.map((a, i) => row(a, null, iconButton('trash', 'Remove', () => save({ customAffirmations: list.filter((_, j) => j !== i) }).then(redraw), 'small'))),
      ),
      h('p', { class: 'settings-note' }, 'Your own affirmations join the bundled ones in the daily rotation.'),
      h('h3', {}, 'Favorite quotes'),
      favoriteQuotes(),
    ];
  },

  data() {
    return [
      h('h3', {}, 'Your data stays here'),
      h('p', { class: 'settings-note' }, 'Calm Tab Lite has no analytics and no servers. Browsing time, favorites and settings are stored only in Chrome on this device (settings sync through your own Chrome profile). Network requests go only to Open-Meteo (weather), your RSS sources, and image hosts for backgrounds.'),
      h('h3', {}, 'Time tracking'),
      h('div', { class: 'group' },
        row('Export browsing time', 'CSV: date, domain, category, minutes', h('button', { class: 'pill-btn', type: 'button', onclick: exportCsv }, icon('download', 14), 'Export CSV')),
        row('Reset time tracking', 'Deletes all tracked time', h('button', { class: 'pill-btn danger', type: 'button', onclick: resetTracking }, icon('trash', 14), 'Reset')),
      ),
      h('h3', {}, 'Chrome history estimates'),
      historyGroup(),
    ];
  },
};

function safeHost(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

function historyGroup() {
  const group = h('div', { class: 'group' });
  Promise.all([hasHistoryAccess().catch(() => false), getHistoryMeta()]).then(([ok, meta]) => {
    if (!ok) {
      const btn = h('button', { class: 'pill-btn', type: 'button', onclick: () => {
        requestHistoryAccess().then(async (granted) => {
          if (!granted) return toast('Chrome history access was not allowed');
          toast('Reading Chrome history…');
          const r = await importHistory(30);
          toast(`Estimated ${r.days} days from ${r.visits.toLocaleString()} visits`);
          redraw();
        }).catch(() => toast('Chrome history is not available here'));
      } }, 'Allow & estimate');
      render(group, row('Estimate past days', 'Reads visit times from Chrome history on this device to estimate time per site for the last 30 days. Nothing is uploaded.', btn));
      return;
    }
    render(group,
      row('Estimates from Chrome history', meta ? `Last updated ${new Date(meta.at).toLocaleString()} · ${meta.visits.toLocaleString()} visits · refreshed automatically` : 'Allowed — estimates will appear shortly',
        h('button', { class: 'pill-btn', type: 'button', onclick: async () => { toast('Reading Chrome history…'); const r = await importHistory(30); toast(`Estimated ${r.days} days`); redraw(); } }, icon('refresh', 14), 'Refresh')),
      row('Remove estimates', 'Deletes them and gives the history permission back to Chrome',
        h('button', { class: 'pill-btn danger', type: 'button', onclick: async () => { await forgetHistory(); toast('History estimates removed'); redraw(); } }, icon('trash', 14), 'Remove')),
    );
  });
  return group;
}

function productHuntGroup() {
  const group = h('div', { class: 'group' });
  getLocal('producthunt:token', '').then((token) => {
    const input = h('input', { class: 'field wide', type: 'password', placeholder: 'Developer token (optional)', value: token, autocomplete: 'off', spellcheck: 'false' });
    const apply = h('button', { class: 'pill-btn', type: 'button', onclick: async () => {
      await setLocal('producthunt:token', input.value.trim());
      await chrome.runtime.sendMessage({ type: 'ph:refresh', force: true }).catch(() => {});
      toast(input.value.trim() ? 'Token saved — ranking by votes' : 'Token removed — using the public feed');
    } }, 'Save');
    render(group,
      h('div', { class: 'form-row' }, input, apply),
      h('p', { class: 'settings-note', style: { padding: '0 0.875rem 0.625rem', margin: 0 } }, 'Without a token the widget shows the newest launches from the public feed. With one (producthunt.com/v2/oauth/applications → Developer token) it ranks today’s launches by votes. Stored only on this device.'),
    );
  });
  return group;
}

function favoriteQuotes() {
  const group = h('div', { class: 'group' });
  getLocal('quotes:favorites', []).then((favs) => {
    if (!favs.length) return render(group, h('div', { class: 'row muted' }, 'Tap ♥ on a quote to keep it here.'));
    render(group, favs.map((q) => row(`“${q.text}”`, q.author, iconButton('trash', 'Remove', async () => {
      await setLocal('quotes:favorites', favs.filter((f) => f.text !== q.text));
      redraw();
    }, 'small'))));
  });
  return group;
}

async function exportCsv() {
  const all = await chrome.storage.local.get(null);
  const overrides = all['categories:overrides'] ?? {};
  const lines = ['date,domain,category,minutes'];
  for (const key of Object.keys(all).filter((k) => k.startsWith('track:')).sort()) {
    const date = key.slice(6);
    for (const [domain, sec] of Object.entries(all[key]).sort((a, b) => b[1] - a[1])) {
      lines.push([date, domain, categoryFor(domain, overrides, DEFAULT_CATEGORY_MAP), (sec / 60).toFixed(1)].map(csvCell).join(','));
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `calm-tab-time-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

async function resetTracking() {
  if (!confirm('Delete all tracked browsing time? This cannot be undone.')) return;
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('track:')));
  toast('Time tracking reset');
}

// ---------- Panel shell ----------
// A native modal <dialog>: the browser handles focus trapping, Esc, the inert
// background and returning focus; closedby="any" adds click-outside dismissal.
function drawNav() {
  const [gid, , pages] = groupOf(active);
  const go = (section) => { active = section; query = ''; if (searchInput) searchInput.value = ''; body.scrollTop = 0; redraw(); };
  render(nav,
    h('div', { class: 'settings-groups', role: 'tablist', 'aria-label': 'Settings groups' }, GROUPS.map(([id, label, ids]) =>
      h('button', { type: 'button', role: 'tab', class: !query && id === gid ? 'active' : '', 'aria-selected': String(!query && id === gid), onclick: () => go(ids[0]) }, label))),
    !query && pages.length > 1 ? h('div', { class: 'settings-pages', role: 'tablist', 'aria-label': 'Pages' }, pages.map((id) =>
      h('button', { type: 'button', role: 'tab', class: id === active ? 'active' : '', 'aria-selected': String(id === active), onclick: () => go(id) }, sectionLabel(id)))) : null);
}

/** Search: render every page, keep only the items whose text matches. */
function renderSearch(q) {
  const needle = q.toLowerCase();
  const results = [];
  for (const [id] of SECTIONS) {
    const title = sectionLabel(id);
    const content = h('div', {}, renderers[id]());
    const whole = title.toLowerCase().includes(needle);
    let hits = 0;
    if (!whole) {
      for (const g of content.querySelectorAll('.group')) {
        const items = [...g.children];
        for (const it of items) { const ok = it.textContent.toLowerCase().includes(needle); it.hidden = !ok; if (ok) hits++; }
        g.hidden = items.every((it) => it.hidden);
      }
      for (const n of content.querySelectorAll('.settings-note, .muted.small')) n.hidden = !n.textContent.toLowerCase().includes(needle);
      for (const h3 of content.querySelectorAll('h3')) { const next = h3.nextElementSibling; h3.hidden = !next || next.hidden; }
    }
    if (whole || hits) results.push(h('section', { class: 'search-section' },
      h('button', { type: 'button', class: 'search-title', onclick: () => { active = id; query = ''; searchInput.value = ''; redraw(); } }, title, icon('right', 13)), content));
  }
  return results.length ? results : h('p', { class: 'settings-note' }, `No settings match “${q}”.`);
}

function redraw() {
  if (!panel) return;
  drawNav();
  const scroll = body.scrollTop;
  render(body, h('div', { class: 'settings-section' }, query ? renderSearch(query) : renderers[active]()));
  body.scrollTop = query ? 0 : scroll;
}

function build() {
  nav = h('nav', { class: 'settings-nav', 'aria-label': 'Settings sections' });
  searchInput = h('input', { type: 'search', class: 'field settings-search', placeholder: 'Search settings', 'aria-label': 'Search settings', autocomplete: 'off', spellcheck: 'false' });
  let t;
  searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = searchInput.value.trim(); redraw(); }, 120); });
  body = h('div', { class: 'settings-body' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', command: 'close', commandfor: 'settings-dialog', 'aria-label': 'Close settings', title: 'Close settings' }, icon('x', 16));
  panel = h('dialog', { id: 'settings-dialog', class: 'settings', closedby: 'any', 'aria-labelledby': 'settings-title' },
    h('div', { class: 'settings-head' }, h('h2', { id: 'settings-title' }, 'Settings'), searchInput, closeBtn),
    nav, body);
  document.getElementById('settings-root').append(panel);
}

export function openSettings(context, section) {
  ctx = context;
  if (section === 'location') active = 'general';
  else if (section) active = section;
  if (section) { query = ''; if (searchInput) searchInput.value = ''; }
  if (!panel) build();
  redraw();
  if (!panel.open) panel.showModal();
  if (section === 'location') setTimeout(() => body.querySelector('#section-location')?.scrollIntoView({ behavior: 'smooth' }), 350);
}
