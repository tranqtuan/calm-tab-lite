/**
 * Ice Breaker widget: a ready-to-tell story, question, game, fact or joke to open a meeting.
 *  - 165 bundled ice breakers in English and Vietnamese.
 *  - Filters: type, audience, length, meeting type, language (en / vi / bilingual).
 *  - Presenter mode: full-screen, large text, punchline revealed on tap, delivery tip,
 *    read-aloud practice (Web Speech).
 *  - AI-news starters built from today's AI headlines (simple templates).
 * Favorites, history and "never show again" are stored locally.
 */
import { card, h, render, iconButton, loadJson, toast, sizeOf, placeholder } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getLocal, setLocal } from '../shared/storage.js';
import { dayKey } from '../shared/util.js';

const TYPES = [['all', 'All'], ['story', 'Stories'], ['question', 'Questions'], ['wyr', 'Would you rather'], ['game', 'Games'], ['fact', 'Fun facts'], ['joke', 'Jokes'], ['ainews', 'AI news']];
const AUDIENCE = [['any', 'Any audience'], ['internal', 'Internal team'], ['clients', 'Clients & partners'], ['new', 'New team members'], ['large', 'Large group']];
const LENGTH = [['any', 'Any length'], ['quick', 'Quick (~15s)'], ['short', 'Short (~45s)'], ['story', 'Story (1–2 min)']];
const MEETING = [['any', 'Any meeting'], ['standup', 'Daily standup'], ['weekly', 'Weekly sync'], ['workshop', 'Workshop'], ['client', 'Client call'], ['casual', 'Casual chat'], ['friday', 'Friday fun']];
const KEYS = { fav: 'ib:fav', history: 'ib:history', never: 'ib:never', filters: 'ib:filters', current: 'ib:current' };

const secs = (s) => (s < 60 ? `~${s} sec` : `~${Math.round(s / 6) / 10} min`);

/** AI-news starters from today's AI headlines (templates; no AI needed). */
function newsStarters(news) {
  const items = (news?.ai ?? []).filter((it) => !it.tags?.includes('Policy & Safety')).slice(0, 8);
  return items.map((it, i) => ({
    id: `news-${dayKey()}-${i}`, type: 'ainews',
    title: { en: 'From today’s AI news', vi: 'Từ tin AI hôm nay' },
    lines: { en: [`Did anyone see this? “${it.title}” (${it.source}).`, 'Quick round: would you actually use something like that at work — yes, no, or “ask me in a year”?'],
      vi: [`Mọi người thấy tin này chưa? “${it.title}” (${it.source}).`, 'Hỏi nhanh: bạn có thật sự dùng thứ này trong công việc không — có, không, hay “hỏi lại sau một năm”?'] },
    punchline: null, tip: { en: 'Keep it light — invite one quick answer from each person.', vi: 'Giữ không khí nhẹ nhàng — mời mỗi người trả lời thật nhanh.' },
    keyPhrases: ['ask me in a year', 'quick round'], audience: ['internal', 'new', 'large'], length: 'quick', seconds: 20,
    meetings: ['standup', 'weekly', 'casual', 'friday'], link: it.link,
  }));
}

function speak(text, lang) {
  if (!('speechSynthesis' in window)) return toast('Speech is not available');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
  u.rate = 0.95;
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.replace('_', '-').startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export default {
  id: 'icebreaker',
  create(ctx) {
    const { el, body, actions, setGlance } = card('icebreaker', 'Ice breaker', 'sparkle');
    let all = [];
    let state = { fav: [], history: [], never: [] };
    let filters = { type: 'all', audience: 'any', length: 'any', meeting: 'any', lang: ctx.settings.icebreakers?.lang ?? 'en' };
    let current = null;
    let view = 'card'; // 'card' | 'favorites' | 'history'
    let showFilters = false;

    const lang = () => (filters.lang === 'vi' || filters.lang === 'bi' ? 'vi' : 'en');
    // Header: one action. Favorites and history live in the type menu in the body.
    actions.append(iconButton('refresh', 'Another one', () => next()));

    function candidates() {
      const pool = [...all, ...(filters.type === 'all' || filters.type === 'ainews' ? newsStarters(state.news) : [])];
      return pool.filter((it) =>
        !state.never.includes(it.id)
        && (filters.type === 'all' || it.type === filters.type)
        && (filters.audience === 'any' || it.audience?.includes(filters.audience))
        && (filters.length === 'any' || it.length === filters.length)
        && (filters.meeting === 'any' || it.meetings?.includes(filters.meeting)));
    }

    async function next() {
      const list = candidates();
      if (!list.length) { current = null; draw(); return; }
      const recent = new Set(state.history.slice(0, 20).map((x) => x.id));
      const fresh = list.filter((it) => !recent.has(it.id) && it.id !== current?.id);
      current = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length ? fresh : list).length)];
      view = 'card';
      setLocal(KEYS.current, { id: current.id, day: dayKey() });
      draw(true);
    }

    const saveState = (k) => setLocal(KEYS[k], state[k]);
    const toggleFav = (it) => { state.fav = state.fav.includes(it.id) ? state.fav.filter((x) => x !== it.id) : [it.id, ...state.fav]; saveState('fav'); toast(state.fav.includes(it.id) ? 'Added to favorites' : 'Removed from favorites'); draw(); };
    const markUsed = (it) => { state.history = [{ id: it.id, date: Date.now() }, ...state.history].slice(0, 300); saveState('history'); toast('Marked as used'); next(); };
    const never = (it) => { state.never = [...new Set([it.id, ...state.never])]; saveState('never'); toast('You won’t see this one again'); next(); };
    const asText = (it, l = lang()) => [it.title[l], '', ...it.lines[l], it.punchline ? `\n${it.punchline[l]}` : ''].join('\n').trim();
    const copy = async (it) => { await navigator.clipboard.writeText(asText(it)); toast('Copied'); };

    function lineBlock(it, l) {
      // Big card: the whole thing, ready to read out; otherwise a three-line preview.
      if (sizeOf(el) === 'big') return h('div', { class: 'ib-lines' }, it.lines[l].map((t) => h('p', {}, t)));
      return h('div', { class: 'ib-lines' }, it.lines[l].slice(0, 3).map((t) => h('p', {}, t)), it.lines[l].length > 3 ? h('p', { class: 'muted' }, '…') : null);
    }

    function filterRow() {
      const menu = h('select', { class: 'field ib-menu', 'aria-label': 'Show', onchange: () => {
        if (menu.value === 'favorites' || menu.value === 'history') { view = menu.value; draw(); return; }
        filters.type = menu.value; view = 'card'; setLocal(KEYS.filters, filters); next();
      } },
        h('optgroup', { label: 'Show' }, TYPES.map(([id, label]) => h('option', { value: id, selected: view === 'card' && filters.type === id }, id === 'all' ? 'All ice breakers' : label))),
        h('optgroup', { label: 'Saved' },
          h('option', { value: 'favorites', selected: view === 'favorites' }, `Favorites (${state.fav.length})`),
          h('option', { value: 'history', selected: view === 'history' }, 'History')));
      const sel = (key, opts) => {
        const s = h('select', { class: 'field ib-select', 'aria-label': key, onchange: () => { filters[key] = s.value; setLocal(KEYS.filters, filters); next(); } }, opts.map(([v, l]) => h('option', { value: v, selected: filters[key] === v }, l)));
        return s;
      };
      const narrowed = ['audience', 'length', 'meeting'].filter((k) => filters[k] !== 'any').length;
      return h('div', { class: 'ib-bar' },
        h('div', { class: 'ib-bar-row' }, menu,
          h('button', { class: `chip ${showFilters || narrowed ? 'on' : ''}`, type: 'button', 'aria-expanded': String(showFilters), onclick: () => { showFilters = !showFilters; draw(); } }, icon('filter', 12), narrowed ? `Filters · ${narrowed}` : 'Filters')),
        showFilters ? h('div', { class: 'ib-filters' },
          sel('audience', AUDIENCE), sel('length', LENGTH), sel('meeting', MEETING),
          sel('lang', [['en', 'English'], ['vi', 'Tiếng Việt'], ['bi', 'Bilingual (VI + EN phrases)']])) : null);
    }

    function cardView(animate) {
      if (!current) return placeholder('No ice breakers match these filters', 'Reset filters', () => { filters = { ...filters, type: 'all', audience: 'any', length: 'any', meeting: 'any' }; setLocal(KEYS.filters, filters); next(); }, 'filter');
      const it = current;
      const l = lang();
      return h('div', { class: `ib ${animate ? 'fade-swap' : ''}` },
        h('div', { class: 'ib-head' },
          h('span', { class: 'ib-type' }, TYPES.find(([id]) => id === it.type)?.[1] ?? it.type),
          h('span', { class: 'muted small' }, secs(it.seconds))),
        h('div', { class: 'ib-title' }, it.title[l]),
        lineBlock(it, l),
        it.punchline ? h('details', { class: 'ib-punch', open: sizeOf(el) === 'big' }, h('summary', {}, 'Punchline'), h('p', {}, it.punchline[l])) : null,
        sizeOf(el) === 'big' && it.tip?.[l] ? h('p', { class: 'ib-tip' }, '💡 ', it.tip[l]) : null,
        filters.lang === 'bi' && it.keyPhrases?.length ? h('div', { class: 'ib-phrases' }, h('span', { class: 'muted small' }, 'Key phrases: '), it.keyPhrases.map((p) => h('span', { class: 'chip on' }, p))) : null,
        h('div', { class: 'ib-actions' },
          h('button', { class: 'pill-btn primary', type: 'button', onclick: () => presenter(it) }, icon('external', 13), 'Present'),
          iconButton('copy', 'Copy', () => copy(it), 'small'),
          iconButton('heart', state.fav.includes(it.id) ? 'Unfavorite' : 'Favorite', () => toggleFav(it), `small ${state.fav.includes(it.id) ? 'active' : ''}`),
          iconButton('check', 'Mark as used', () => markUsed(it), 'small'),
          iconButton('eyeOff', 'Never show again', () => never(it), 'small')));
    }

    function listView(kind) {
      const byId = new Map([...all, ...newsStarters(state.news)].map((x) => [x.id, x]));
      const rows = kind === 'favorites'
        ? state.fav.map((id) => ({ it: byId.get(id) })).filter((r) => r.it)
        : state.history.map((x) => ({ it: byId.get(x.id), x })).filter((r) => r.it).slice(0, 40);
      return h('div', { class: 'fade-swap' },
        rows.length ? h('ul', { class: 'ib-list' }, rows.map(({ it, x }) => h('li', {},
          h('button', { class: 'vocab-list-word', type: 'button', onclick: () => { current = it; view = 'card'; draw(true); } }, it.title[lang()]),
          h('span', { class: 'muted small' }, x ? `${new Date(x.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${x.meeting ? ' · ' + x.meeting : ''}` : secs(it.seconds)))))
          : h('p', { class: 'muted small' }, kind === 'favorites' ? 'Tap ♥ on an ice breaker to keep it here.' : 'Ice breakers you mark as used appear here.'));
    }

    // ---------- Presenter mode ----------
    function presenter(it) {
      const l = lang();
      const dlg = h('dialog', { class: 'presenter', closedby: 'any', 'aria-label': it.title[l] });
      const punch = it.punchline ? h('p', { class: 'pr-punch', hidden: true }, it.punchline[l]) : null;
      const reveal = it.punchline ? h('button', { class: 'pill-btn primary pr-reveal', type: 'button', onclick: () => { punch.hidden = false; reveal.remove(); } }, 'Reveal the punchline') : null;
      dlg.append(...[ // native append() would print "null" for absent optional parts
        h('div', { class: 'pr-top' }, h('span', { class: 'ib-type' }, TYPES.find(([id]) => id === it.type)?.[1] ?? ''), h('span', { class: 'muted' }, secs(it.seconds)),
          h('button', { class: 'icon-btn', type: 'button', title: 'Read aloud to practise', 'aria-label': 'Read aloud', onclick: () => speak([...it.lines[l], it.punchline?.[l] ?? ''].join(' '), l) }, icon('speaker', 18)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', command: 'close', commandfor: 'ib-presenter' }, icon('x', 18))),
        h('h1', { class: 'pr-title' }, it.title[l]),
        h('div', { class: 'pr-lines' }, it.lines[l].map((t) => h('p', {}, t))),
        reveal, punch,
        h('p', { class: 'pr-tip' }, '💡 ', it.tip[l]),
        filters.lang === 'bi' && it.keyPhrases?.length ? h('p', { class: 'pr-tip' }, 'Key phrases: ', it.keyPhrases.join(' · ')) : null].filter(Boolean));
      dlg.id = 'ib-presenter';
      dlg.addEventListener('close', () => { speechSynthesis?.cancel(); dlg.remove(); });
      dlg.addEventListener('keydown', (e) => { if (e.key === ' ' && reveal?.isConnected) { e.preventDefault(); reveal.click(); } });
      document.body.append(dlg);
      dlg.showModal();
    }

    const typeName = (t) => ({ story: 'Story', question: 'Question', wyr: 'Would you rather', game: 'Game', fact: 'Fun fact', joke: 'Joke', ainews: 'AI news' }[t] ?? '');
    function draw(animate = false) {
      // Mini: "Story · The title · ~1 min"
      if (current) setGlance(h('span', { class: 'muted' }, typeName(current.type)), h('span', { class: 'glance-title' }, current.title[lang()]), h('span', { class: 'muted' }, secs(current.seconds)));
      else setGlance(h('span', { class: 'muted' }, 'No ice breaker matches these filters'));
      if (view !== 'card') return render(body, filterRow(), listView(view));
      render(body, filterRow(), cardView(animate));
    }

    (async () => {
      const [b1, b2, b3, fav, history, nev, saved, news] = await Promise.all([
        loadJson('data/icebreakers/stories.json'), loadJson('data/icebreakers/interactive.json'), loadJson('data/icebreakers/light.json'),
        getLocal(KEYS.fav, []), getLocal(KEYS.history, []), getLocal(KEYS.never, []), getLocal(KEYS.filters, null), getLocal('news:cache'),
      ]);
      all = [...b1, ...b2, ...b3];
      state = { fav, history, never: nev, news };
      if (saved) filters = { ...filters, ...saved };
      const cur = await getLocal(KEYS.current);
      current = cur?.day === dayKey() ? [...all, ...newsStarters(news)].find((x) => x.id === cur.id) ?? null : null;
      if (!current) await next(); else draw();
    })();

    return { el, resize: () => draw() };
  },
};
