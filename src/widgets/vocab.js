/**
 * Word of the day in English or Vietnamese.
 *  - en: IPA + part of speech → Vietnamese meaning
 *  - vi: Vietnamese word → English meaning (+ Vietnamese definition)
 * Data: data/vocab/<lang>.json. Learned words and daily picks are kept per language.
 * Audio uses the Web Speech API with a voice matching the language.
 */
import { card, h, render, iconButton, loadJson, toast, placeholder } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { dailyIndex, nextIndex } from '../lib/daily.js';
import { getLocal, setLocal } from '../shared/storage.js';

export const LANGS = {
  en: { label: 'English', short: 'EN', speech: 'en-US' },
  vi: { label: 'Vietnamese', short: 'VI', speech: 'vi-VN' },
};

// English keeps its original storage keys so existing progress carries over.
const learnedKey = (lang) => (lang === 'en' ? 'vocab:learned' : `vocab:learned:${lang}`);
const dailyKey = (lang) => (lang === 'en' ? 'vocab' : `vocab-${lang}`);
// Spaced repetition: { [word]: { box: 1..3, due: ms } }. "Got it" moves a word up a box
// (review again in 1 → 3 → 7 days); after the 7-day review it is mastered and leaves the queue.
const srsKey = (lang) => `vocab:srs:${lang}`;
const DAY = 86400000;
const INTERVALS = [1, 3, 7];

function speak(text, lang) {
  if (!('speechSynthesis' in window)) return toast('Speech is not available');
  const code = LANGS[lang].speech;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === code && /Samantha|Google|Ava|Allison|Linh/i.test(v.name))
    ?? voices.find((v) => v.lang?.replace('_', '-').startsWith(code.slice(0, 2)));
  if (!voice && voices.length) return toast(`No ${LANGS[lang].label} voice installed on this computer`);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = code;
  u.rate = lang === 'en' ? 0.9 : 0.8;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

/** Language-specific head + reveal content. */
const VIEWS = {
  en: (w) => ({
    sub: [h('span', { class: 'vocab-ipa' }, w.ipa), h('span', { class: 'vocab-pos' }, w.pos)],
    meaning: w.vi,
    reveal: [h('p', { class: 'vocab-def' }, w.definition), example(w.example, w.exampleVi)],
  }),
  vi: (w) => ({
    sub: [h('span', { class: 'vocab-pos' }, w.pos)],
    meaning: w.en,
    reveal: [h('p', { class: 'vocab-def' }, w.definition), example(w.example, w.exampleEn)],
  }),
};

function example(text, translation) {
  return h('div', { class: 'vocab-example-block' },
    h('p', { class: 'vocab-example' }, `“${text}”`),
    translation ? h('p', { class: 'vocab-example-tr' }, translation) : null,
  );
}

export default {
  id: 'vocab',
  create(ctx) {
    const { el, body, actions, title, setGlance } = card('vocab', 'Word of the day', 'book');
    let lang = LANGS[ctx.settings.vocabLang] ? ctx.settings.vocabLang : 'en';
    let words = [];
    let index = 0;
    let learned = [];
    let showingList = false;
    let token = 0; // guards against out-of-order loads when switching quickly

    const langSwitch = h('div', { class: 'segmented mini', role: 'radiogroup', 'aria-label': 'Language' });
    let srs = {};
    let reviewing = null; // { queue: [word], i, shown }
    actions.append(iconButton('refresh', 'Another word', async () => {
      index = await nextIndex(dailyKey(lang), words.length, index);
      showingList = false; reviewing = null;
      draw(true);
    }));
    const due = () => Object.entries(srs).filter(([word, x]) => x.due <= Date.now() && words.some((w) => w.word === word)).map(([word]) => word);
    const saveSrs = () => setLocal(srsKey(lang), srs);
    function schedule(word, ok) {
      const box = ok ? (srs[word]?.box ?? 0) + 1 : 1;
      if (ok && box > INTERVALS.length) delete srs[word]; // mastered
      else srs[word] = { box, due: Date.now() + (ok ? INTERVALS[box - 1] * DAY : 0) };
      saveSrs();
    }

    function drawSwitch() {
      render(langSwitch, Object.entries(LANGS).map(([id, l]) =>
        h('button', {
          type: 'button', class: id === lang ? 'active' : '', title: l.label, role: 'radio', 'aria-checked': String(id === lang),
          onclick: () => { if (id !== lang) ctx.save({ vocabLang: id }); },
        }, l.short)));
    }

    const isLearned = (w) => learned.includes(w.word);

    async function toggleLearned() {
      const w = words[index];
      const was = isLearned(w);
      learned = was ? learned.filter((x) => x !== w.word) : [w.word, ...learned];
      if (was) { delete srs[w.word]; saveSrs(); } else schedule(w.word, true); // first review tomorrow
      await setLocal(learnedKey(lang), learned);
      if (!was) toast('Saved · we’ll review it tomorrow');
      draw();
    }

    function drawReview() {
      const r = reviewing;
      const w = words.find((x) => x.word === r.queue[r.i]);
      if (!w) {
        render(body, h('div', { class: 'vocab fade-swap' },
          placeholder('All caught up — nothing to review', 'Back to today’s word', () => { reviewing = null; draw(true); }, 'check')));
        return;
      }
      const v = VIEWS[lang](w);
      const cjk = lang === 'zh' || lang === 'ja';
      const answer = (ok) => { schedule(w.word, ok); if (!ok) r.queue.push(w.word); r.i++; r.shown = false; drawReview(); };
      render(body, h('div', { class: 'vocab vocab-review fade-swap', lang },
        h('div', { class: 'vocab-review-head muted small' }, `Review · ${r.i + 1} of ${r.queue.length}`,
          h('button', { class: 'link-btn', type: 'button', onclick: () => { reviewing = null; draw(true); } }, 'Done')),
        h('div', { class: 'vocab-head' },
          h('span', { class: `vocab-word ${cjk ? 'cjk' : ''}` }, w.word),
          h('button', { class: 'icon-btn small', type: 'button', title: 'Pronounce', 'aria-label': 'Pronounce', onclick: () => speak(w.word, lang) }, icon('speaker', 15))),
        h('div', { class: 'vocab-sub' }, v.sub),
        r.shown
          ? [h('div', { class: 'vocab-vi', lang: lang === 'vi' ? 'en' : 'vi' }, v.meaning), h('div', { class: 'vocab-more' }, v.reveal),
            h('div', { class: 'vocab-review-btns' },
              h('button', { class: 'pill-btn', type: 'button', onclick: () => answer(false) }, 'Again'),
              h('button', { class: 'pill-btn primary', type: 'button', onclick: () => answer(true) }, icon('check', 14), 'Got it'))]
          : h('div', { class: 'vocab-review-btns' },
            h('button', { class: 'pill-btn primary', type: 'button', onclick: () => { r.shown = true; drawReview(); } }, 'Show meaning'))));
    }

    function drawWord(animate) {
      const w = words[index];
      const v = VIEWS[lang](w);
      const done = isLearned(w);
      const dueNow = due();
      setGlance(h('b', { lang }, w.word), h('span', { class: 'muted' }, v.meaning));
      render(body,
        h('div', { class: `vocab ${animate ? 'fade-swap' : ''}`, lang },
          h('div', { class: 'vocab-head' },
            h('span', { class: 'vocab-word' }, w.word),
            v.alt ? h('span', { class: 'vocab-alt' }, v.alt) : null,
            h('button', { class: 'icon-btn small', type: 'button', title: 'Pronounce', 'aria-label': 'Pronounce', onclick: () => speak(w.word, lang) }, icon('speaker', 15)),
          ),
          h('div', { class: 'vocab-sub' }, v.sub),
          v.extra ?? null,
          h('div', { class: 'vocab-vi', lang: lang === 'vi' ? 'en' : 'vi' }, v.meaning),
          // The example is part of learning the word, so it is always shown.
          h('div', { class: 'vocab-more' }, v.reveal),
          h('div', { class: 'vocab-foot' },
            h('div', { class: 'vocab-foot-l' },
              h('button', { class: `pill-btn ${done ? 'active' : ''}`, type: 'button', 'aria-pressed': String(done), onclick: toggleLearned },
                icon('check', 14), done ? 'Saved' : 'Got it'),
              dueNow.length ? h('button', { class: 'chip on vocab-review-chip', type: 'button', onclick: () => { reviewing = { queue: dueNow, i: 0, shown: false }; draw(true); } }, `Review ${dueNow.length}`) : null,
              learned.length ? h('button', { class: 'chip', type: 'button', title: 'Saved words', onclick: () => { showingList = true; draw(true); } }, icon('list', 12), String(learned.length)) : null),
            langSwitch,
          ),
        ),
      );
    }

    function drawList() {
      const byWord = new Map(words.map((w) => [w.word, w]));
      const items = learned.map((x) => byWord.get(x)).filter(Boolean);
      render(body,
        h('div', { class: 'vocab-list fade-swap' },
          h('button', { class: 'link-btn vocab-back', type: 'button', onclick: () => { showingList = false; draw(true); } }, icon('left', 13), 'Today’s word'),
          h('div', { class: 'muted small' }, items.length ? `${items.length} saved ${LANGS[lang].label} word${items.length > 1 ? 's' : ''}` : 'No saved words yet — mark words as learned to review them here.'),
          h('ul', {}, items.map((w) =>
            h('li', { title: w.definition ?? w.example },
              h('button', { class: 'vocab-list-word', type: 'button', onclick: () => { index = words.indexOf(w); showingList = false; draw(true); } }, w.word),
              h('span', { class: 'muted' }, lang === 'vi' ? w.en : w.vi),
            ))),
        ),
      );
    }

    function draw(animate = false) {
      drawSwitch();
      title.title = `${LANGS[lang].label} — switch language on hover`;
      if (!words.length) return;
      if (reviewing) return drawReview();
      showingList ? drawList() : drawWord(animate);
    }

    async function load() {
      const mine = ++token;
      const [data, saved, sched] = await Promise.all([
        loadJson(`data/vocab/${lang}.json`).catch(() => []),
        getLocal(learnedKey(lang), []),
        getLocal(srsKey(lang), null),
      ]);
      if (mine !== token) return;
      words = data;
      learned = saved;
      showingList = false; reviewing = null;
      // First run: words saved before reviews existed are spread over the coming week.
      srs = sched ?? Object.fromEntries(saved.map((word, i) => [word, { box: 1, due: Date.now() + ((i % 7) + 1) * DAY }]));
      if (!sched && saved.length) saveSrs();
      if (!words.length) { setGlance(h('span', { class: 'muted' }, 'Word list unavailable')); render(body, placeholder('Word list unavailable', 'Try again', load)); return; }
      index = await dailyIndex(dailyKey(lang), words.length);
      draw(true);
    }

    drawSwitch();
    load();

    return {
      el,
      update(s) {
        const next = LANGS[s.vocabLang] ? s.vocabLang : 'en';
        if (next !== lang) { lang = next; load(); } else drawSwitch();
      },
    };
  },
};
