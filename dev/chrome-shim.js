/**
 * DEV ONLY — a minimal fake of the chrome.* APIs so newtab.html can be previewed
 * in a normal browser tab (see dev/serve.mjs). The real service-worker modules are
 * loaded in-page (dev/sw-in-page.js) so messages, alarms and storage behave for real.
 * Not loaded by the extension.
 */
(() => {
  const storageListeners = [];
  const event = () => { const fns = []; return { fns, addListener: (fn) => fns.push(fn), removeListener: (fn) => fns.splice(fns.indexOf(fn), 1) }; };

  const area = (name) => {
    const key = `shim:${name}`;
    const read = () => JSON.parse((name === 'session' ? sessionStorage : localStorage).getItem(key) || '{}');
    const write = (obj) => (name === 'session' ? sessionStorage : localStorage).setItem(key, JSON.stringify(obj));
    return {
      async get(keys) {
        const all = read();
        if (keys == null) return all;
        const out = {};
        for (const k of [].concat(keys)) if (k in all) out[k] = all[k];
        return out;
      },
      async set(items) {
        const all = read();
        const changes = {};
        for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: all[k], newValue: v }; all[k] = v; }
        write(all);
        queueMicrotask(() => storageListeners.forEach((fn) => fn(structuredClone(changes), name)));
      },
      async remove(keys) {
        const all = read();
        const changes = {};
        for (const k of [].concat(keys)) { changes[k] = { oldValue: all[k] }; delete all[k]; }
        write(all);
        queueMicrotask(() => storageListeners.forEach((fn) => fn(changes, name)));
      },
      async clear() { write({}); },
    };
  };

  const onMessage = event();
  const onAlarm = event();
  const alarms = new Map();

  window.chrome = {
    storage: {
      sync: area('sync'), local: area('local'), session: area('session'),
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    runtime: {
      id: 'calm-tab-dev',
      getURL: (p) => new URL(p, location.origin + '/').href,
      sendMessage: (msg) => new Promise((resolve) => {
        // Test switch: simulate a background worker stuck on an older version (answers with the stale cache).
        if (localStorage.getItem('shim:test:staleSW') === '1' && msg?.type === 'rss:refresh') {
          return window.chrome.storage.local.get('news:cache').then((r) => resolve(r['news:cache']));
        }
        let answered = false;
        for (const fn of onMessage.fns) {
          const keep = fn(msg, { id: 'calm-tab-dev', url: location.href }, (r) => { answered = true; resolve(r); });
          if (keep === true) return;
        }
        if (!answered) resolve(undefined);
      }),
      onMessage,
      onInstalled: event(),
      onStartup: event(),
      getContexts: async () => [{}],
    },
    alarms: {
      async create(name, info) {
        clearTimeout(alarms.get(name)?.t);
        const when = info.when ?? Date.now() + (info.delayInMinutes ?? info.periodInMinutes) * 60000;
        const fire = () => {
          onAlarm.fns.forEach((fn) => fn({ name }));
          if (info.periodInMinutes) alarms.set(name, { t: setTimeout(fire, info.periodInMinutes * 60000), when: Date.now() + info.periodInMinutes * 60000 });
          else alarms.delete(name);
        };
        alarms.set(name, { t: setTimeout(fire, Math.max(0, when - Date.now())), when });
      },
      async get(name) { return alarms.has(name) ? { name, scheduledTime: alarms.get(name).when } : undefined; },
      async getAll() { return [...alarms].map(([name, a]) => ({ name, scheduledTime: a.when })); },
      async clear(name) { clearTimeout(alarms.get(name)?.t); alarms.delete(name); return true; },
      onAlarm,
    },
    notifications: {
      create: (_id, opts) => console.info('[shim] notification:', opts.title, '—', opts.message),
      clear() {}, onClicked: event(), onButtonClicked: event(),
    },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
    tabs: {
      query: async () => [], get: async () => null, update: async () => {}, create: async () => {},
      onUpdated: event(), onActivated: event(), onRemoved: event(),
    },
    windows: { getLastFocused: async () => ({ focused: false }), onFocusChanged: event() },
    idle: { queryState: async () => 'active', setDetectionInterval() {}, onStateChanged: event() },
    permissions: {
      // API permissions (e.g. "history") start un-granted so the opt-in flow can be tested.
      _granted: new Set(JSON.parse(localStorage.getItem('shim:perms') || '[]')),
      async request({ permissions = [], origins = [] } = {}) {
        permissions.forEach((p) => this._granted.add(p)); localStorage.setItem('shim:perms', JSON.stringify([...this._granted]));
        if (origins.length) { const w = JSON.parse(localStorage.getItem('shim:test:withhold') || '[]'); localStorage.setItem('shim:test:withhold', JSON.stringify(w.filter((x) => !origins.some((o) => o.includes(x))))); }
        return true;
      },
      async contains({ permissions = [], origins = [] } = {}) {
        // Test switch: origins listed in shim:test:withhold behave as withheld by Chrome.
        const withheld = JSON.parse(localStorage.getItem('shim:test:withhold') || '[]');
        if (origins.some((o) => withheld.some((w) => o.includes(w)))) return false;
        return permissions.every((p) => this._granted.has(p));
      },
      async remove({ permissions = [] } = {}) { permissions.forEach((p) => this._granted.delete(p)); localStorage.setItem('shim:perms', JSON.stringify([...this._granted])); return true; },
    },
    // Fake Chrome history: a month of plausible visits across common sites.
    history: (() => {
      const sites = ['https://github.com/', 'https://mail.google.com/', 'https://docs.google.com/', 'https://www.youtube.com/', 'https://www.facebook.com/', 'https://vnexpress.net/', 'https://stackoverflow.com/', 'https://claude.ai/'];
      const visits = {};
      let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let d = 0; d < 30; d++) for (let i = 0; i < 60; i++) {
        const day = new Date(); day.setDate(day.getDate() - d); day.setHours(8 + Math.floor(rnd() * 12), Math.floor(rnd() * 60), 0, 0);
        const url = sites[Math.floor(rnd() * sites.length)] + 'page' + Math.floor(rnd() * 20);
        (visits[url] ??= []).push({ visitTime: day.getTime() });
      }
      return {
        search: async () => Object.keys(visits).map((url) => ({ url })),
        getVisits: async ({ url }) => visits[url] ?? [],
      };
    })(),
    identity: {
      getAuthToken: async () => { throw new Error('OAuth is not available in the dev preview'); },
      removeCachedAuthToken: async () => {},
      getRedirectURL: () => 'https://preview.chromiumapp.org/',
      launchWebAuthFlow: async () => { throw new Error('OAuth is not available in the dev preview'); },
    },
  };

  // Route cross-origin feed requests through the dev server (the real extension has host permissions).
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(input?.url ?? input);
    const passthrough = url.startsWith(location.origin) || /open-meteo\.com|googleapis\.com|unsplash\.com|pexels\.com|microsoftonline\.com|graph\.microsoft\.com/.test(url) || !/^https?:/.test(url);
    return passthrough ? nativeFetch(input, init) : nativeFetch(`/proxy?url=${encodeURIComponent(url)}`, { signal: init?.signal });
  };
})();

// DEV ONLY — fake on-device AI (enable with localStorage['shim:fakeAI'] = '1') so AI flows can
// be exercised without Gemini Nano. Mirrors the shapes of LanguageModel / Summarizer / Translator.
(() => {
  if (localStorage.getItem('shim:fakeAI') !== '1') return;
  const reply = (prompt) => {
    if (/digest|briefing|bullets?/i.test(prompt)) return '• First key story in one line.\n• Second important development.\n• A third notable item.\n• One more thing to watch.';
    if (/affirmations/i.test(prompt)) return 'I am making steady progress on what matters.\nI finish what I start, one step at a time.\nI am calm and focused under pressure.\nI give my best work my best hours.\nI am proud of the effort I put in today.';
    if (/25-minute|Pomodoro tasks/i.test(prompt)) return 'Outline the report structure\nDraft the executive summary\nBuild the key charts\nReview and polish';
    if (/label/i.test(prompt)) return prompt.split('\n').filter((l) => /^\d+\./.test(l)).map(() => 'Tools & Products').join('\n');
    if (/Term: definition|technical term/i.test(prompt)) return 'Context window: how much text an AI model can consider at once.';
    if (/reflection/i.test(prompt)) return 'You spent most of the day on focused work. Social media crept in after lunch. Try one Pomodoro before your next check.';
    if (/nudge|playful/i.test(prompt)) return '{name}, {site} has had you for {minutes} minutes.\nThe {goal} called — it misses you.\nScroll count: impressive. Progress count: pending.\nThis is your sign to close {site}.\nFive more minutes? That is what you said {snoozeCount} times.';
    if (/ice breaker/i.test(prompt)) return 'TITLE: The Coffee Machine Standoff\nLINES:\nLast week our office coffee machine started asking for a firmware update.\nWe all just stood there, mugs in hand.\nNobody wanted to be the one to press OK.\nPUNCHLINE: Turns out the coffee machine had more patience than our release schedule.\nTIP: Pause before the last line.';
    return 'This is a short, helpful answer from the fake on-device model.';
  };
  const session = () => ({
    prompt: async (p) => reply(p),
    async *promptStreaming(p) { for (const w of reply(p).split(/(?<=\s)/)) { await new Promise((r) => setTimeout(r, 8)); yield w; } },
    destroy() {},
  });
  window.LanguageModel = { availability: async () => 'available', create: async () => session() };
  window.Summarizer = { availability: async () => 'available', create: async () => ({
    summarize: async () => '• Key point one.\n• Key point two.\n• Key point three.',
    async *summarizeStreaming() { for (const l of ['• Key point one.\n', '• Key point two.\n', '• Key point three.']) { await new Promise((r) => setTimeout(r, 10)); yield l; } },
    destroy() {} }) };
  window.Translator = { availability: async () => 'available', create: async ({ targetLanguage }) => ({ translate: async (t) => `[${targetLanguage}] ${t}`, destroy() {} }) };
})();
