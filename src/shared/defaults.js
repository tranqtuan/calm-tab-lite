/**
 * Default settings and reference data shared by the New Tab page and the
 * background service worker. Nothing in here touches the DOM.
 */

/** Default RSS sources. `tab` is either "vn" (Vietnam News) or "tech". */
export const DEFAULT_FEEDS = [
  { id: 'vnexpress', name: 'VnExpress', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', tab: 'vn', enabled: true },
  { id: 'tuoitre', name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', tab: 'vn', enabled: true },
  { id: 'thanhnien', name: 'Thanh Niên', url: 'https://thanhnien.vn/rss/home.rss', tab: 'vn', enabled: true },
  { id: 'dantri', name: 'Dân Trí', url: 'https://dantri.com.vn/rss/home.rss', tab: 'vn', enabled: true },
  { id: 'sohoa', name: 'VnExpress Số Hóa', url: 'https://vnexpress.net/rss/so-hoa.rss', tab: 'tech', enabled: true },
  { id: 'genk', name: 'Genk', url: 'https://genk.vn/rss/home.rss', tab: 'tech', enabled: true },
  { id: 'tinhte', name: 'Tinhte', url: 'https://tinhte.vn/rss', tab: 'tech', enabled: true },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', tab: 'tech', enabled: true },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', tab: 'tech', enabled: true },
  { id: 'hn', name: 'Hacker News', url: 'https://hnrss.org/frontpage', tab: 'tech', enabled: true },
  // AI News: AI sections of major outlets, official lab blogs, research, and filtered Vietnamese tech news.
  { id: 'verge-ai', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', tab: 'ai', enabled: true },
  { id: 'tc-ai', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', tab: 'ai', enabled: true },
  { id: 'mittr-ai', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', tab: 'ai', enabled: true },
  { id: 'ars-ai', name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/', tab: 'ai', enabled: true },
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', tab: 'ai', enabled: true, lab: true },
  { id: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', tab: 'ai', enabled: true, lab: true },
  { id: 'google-ai', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', tab: 'ai', enabled: true, lab: true },
  { id: 'hf', name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', tab: 'ai', enabled: true, lab: true },
  { id: 'meta-ai', name: 'Meta AI Research', url: 'https://engineering.fb.com/category/ai-research/feed/', tab: 'ai', enabled: true, lab: true },
  { id: 'arxiv-ai', name: 'arXiv cs.AI', url: 'https://rss.arxiv.org/rss/cs.AI', tab: 'ai', enabled: false, research: true },
  { id: 'arxiv-cl', name: 'arXiv cs.CL', url: 'https://rss.arxiv.org/rss/cs.CL', tab: 'ai', enabled: false, research: true },
  { id: 'sohoa-ai', name: 'VnExpress Số Hóa', url: 'https://vnexpress.net/rss/so-hoa.rss', tab: 'ai', enabled: true, filter: 'ai', vn: true },
  { id: 'genk-ai', name: 'Genk', url: 'https://genk.vn/rss/home.rss', tab: 'ai', enabled: true, filter: 'ai', vn: true },
  { id: 'tinhte-ai', name: 'Tinhte', url: 'https://tinhte.vn/rss', tab: 'ai', enabled: true, filter: 'ai', vn: true },
];

export const AI_TOPICS = ['New Models', 'Research', 'Tools & Products', 'Business', 'Policy & Safety', 'Vietnam AI'];

export const CATEGORIES = ['Work', 'Learning', 'Social Media', 'Entertainment', 'News', 'Other'];

/**
 * Sensible default domain → category mapping. Matching is by domain suffix,
 * so "mail.google.com" matches "google.com" unless a more specific rule exists.
 */
export const DEFAULT_CATEGORY_MAP = {
  // Work
  'mail.google.com': 'Work', 'docs.google.com': 'Work', 'drive.google.com': 'Work',
  'calendar.google.com': 'Work', 'meet.google.com': 'Work', 'sheets.google.com': 'Work',
  'outlook.office.com': 'Work', 'outlook.live.com': 'Work', 'office.com': 'Work',
  'sharepoint.com': 'Work', 'teams.microsoft.com': 'Work', 'slack.com': 'Work',
  'notion.so': 'Work', 'figma.com': 'Work', 'github.com': 'Work', 'gitlab.com': 'Work',
  'atlassian.net': 'Work', 'jira.com': 'Work', 'trello.com': 'Work', 'asana.com': 'Work',
  'linear.app': 'Work', 'zoom.us': 'Work', 'miro.com': 'Work', 'canva.com': 'Work',
  'claude.ai': 'Work', 'chatgpt.com': 'Work', 'vercel.com': 'Work', 'aws.amazon.com': 'Work',
  'console.cloud.google.com': 'Work', 'airtable.com': 'Work', 'dropbox.com': 'Work',
  // Learning
  'stackoverflow.com': 'Learning', 'developer.mozilla.org': 'Learning', 'wikipedia.org': 'Learning',
  'coursera.org': 'Learning', 'udemy.com': 'Learning', 'edx.org': 'Learning',
  'khanacademy.org': 'Learning', 'duolingo.com': 'Learning', 'medium.com': 'Learning',
  'dev.to': 'Learning', 'w3schools.com': 'Learning', 'leetcode.com': 'Learning',
  'arxiv.org': 'Learning', 'scholar.google.com': 'Learning', 'cambridge.org': 'Learning',
  'dictionary.cambridge.org': 'Learning', 'merriam-webster.com': 'Learning', 'brilliant.org': 'Learning',
  // Social Media
  'facebook.com': 'Social Media', 'messenger.com': 'Social Media', 'instagram.com': 'Social Media',
  'x.com': 'Social Media', 'twitter.com': 'Social Media', 'threads.net': 'Social Media',
  'tiktok.com': 'Social Media', 'reddit.com': 'Social Media', 'linkedin.com': 'Social Media',
  'pinterest.com': 'Social Media', 'snapchat.com': 'Social Media', 'zalo.me': 'Social Media',
  'chat.zalo.me': 'Social Media', 'discord.com': 'Social Media', 'bsky.app': 'Social Media',
  'web.whatsapp.com': 'Social Media', 'web.telegram.org': 'Social Media', 'tumblr.com': 'Social Media',
  // Entertainment
  'youtube.com': 'Entertainment', 'netflix.com': 'Entertainment', 'twitch.tv': 'Entertainment',
  'spotify.com': 'Entertainment', 'disneyplus.com': 'Entertainment', 'primevideo.com': 'Entertainment',
  'hulu.com': 'Entertainment', 'max.com': 'Entertainment', 'soundcloud.com': 'Entertainment',
  'fptplay.vn': 'Entertainment', 'vieon.vn': 'Entertainment', 'zingmp3.vn': 'Entertainment',
  'steampowered.com': 'Entertainment', 'store.steampowered.com': 'Entertainment', 'imdb.com': 'Entertainment',
  '9gag.com': 'Entertainment', 'shopee.vn': 'Entertainment', 'lazada.vn': 'Entertainment',
  // News
  'vnexpress.net': 'News', 'tuoitre.vn': 'News', 'thanhnien.vn': 'News', 'dantri.com.vn': 'News',
  'genk.vn': 'News', 'tinhte.vn': 'News', 'theverge.com': 'News', 'techcrunch.com': 'News',
  'news.ycombinator.com': 'News', 'bbc.com': 'News', 'bbc.co.uk': 'News', 'cnn.com': 'News',
  'nytimes.com': 'News', 'theguardian.com': 'News', 'reuters.com': 'News', 'bloomberg.com': 'News',
  'wsj.com': 'News', 'ft.com': 'News', 'zingnews.vn': 'News', 'znews.vn': 'News', 'vietnamnet.vn': 'News',
  'news.google.com': 'News', 'arstechnica.com': 'News', 'wired.com': 'News', 'economist.com': 'News',
};

/** Widgets that live in the side columns (the clock/affirmation/quote are fixed). */
export const COLUMN_WIDGETS = ['weather', 'calendar', 'fengshui', 'news', 'producthunt', 'pomodoro', 'icebreaker', 'vocab', 'fact', 'focus', 'notes', 'sites'];

export const WIDGET_LABELS = {
  weather: 'Weather & clocks', calendar: 'Calendar', news: 'News', pomodoro: 'Pomodoro',
  vocab: 'Word of the day', fact: 'Fun fact', focus: 'Time & focus',
  fengshui: 'Phong thủy', producthunt: 'Product Hunt', icebreaker: 'Ice breaker',
  affirmation: 'Affirmation', quote: 'Quote', greeting: 'Greeting',
  notes: 'Notes', sites: 'Sites of the day', signature: 'Signature',
};

export const DEFAULT_SETTINGS = {
  name: '',
  timeFormat: '12h', // '12h' | '24h'
  showSeconds: false,
  clock: { face: 'classic', color: 'default' }, // Settings → General → Clock face (click the clock to cycle)
  tempUnit: 'C', // 'C' | 'F'
  theme: 'auto', // 'auto' | 'light' | 'dark'
  quoteStyle: 'classic', // 'classic' | 'editorial' | 'script' | 'system'
  vocabLang: 'en', // 'en' | 'vi'
  zen: false,
  location: { mode: 'auto', label: '', lat: null, lon: null }, // mode: 'auto' (geolocation) | 'city'
  layout: {
    left: ['weather', 'calendar', 'news', 'producthunt', 'sites'],
    right: ['pomodoro', 'notes', 'icebreaker', 'fengshui', 'vocab', 'fact', 'focus'],
  },
  glass: { transparency: 50 }, // 0 = frosted … 100 = clear (Settings → General)
  sizes: {}, // per-widget card size: 'mini' | 'big' (absent = regular)
  widgets: {
    weather: true, calendar: true, news: true, pomodoro: true, vocab: true,
    fact: true, focus: true, fengshui: true, producthunt: true, icebreaker: true, affirmation: true, quote: true, greeting: true,
    notes: true, sites: true, signature: true,
  },
  background: {
    mode: 'daily', // 'daily' | 'newtab' | 'fixed'
    fixedUrl: '',
    useVideo: false,
    dim: 0.35, // strength of the dark overlay (0–0.7)
    favorites: [], // photo URLs
    customUrl: '',
  },
  sound: { track: 'rain', volume: 0.5 },
  feeds: DEFAULT_FEEDS,
  feedsVersion: 2, // v2 added the AI News tab's feeds
  newsImagesAllSites: false,
  aiNews: { hiddenTopics: [], muted: [] }, // opt-in: read share images from any linked site (e.g. Hacker News)
  pomodoro: {
    focus: 25, short: 5, long: 15, longEvery: 4,
    dailyGoal: 4, // focus sessions per day (shown as "2 of 4 today")
    autoFocus: true, // turn on Focus Mode during focus sessions
    autoStartNext: false,
    chime: true,
  },
  // Focus session: Start on the Pomodoro card also blocks sites and plays sound (each optional).
  session: {
    enabled: true, // "Start sound and Focus Mode with Pomodoro"
    block: true,
    sound: true,
    breakSound: 'dim', // 'dim' (40%) | 'pause'
    asked: false, // the first Start shows the choice once
  },
  focus: {
    mode: 'warn', // 'warn' (interstitial with "continue") | 'block'
    blocked: ['Social Media', 'Entertainment'],
    goalHours: 4, // daily focused time (Work + Learning) shown on the Time & focus card
  },
  customAffirmations: [],
  icebreakers: { lang: 'en' },
  nudges: {
    enabled: false,
    personality: 'random', // grandma | narrator | robot | coach | future | random
    lang: 'en', // 'en' | 'vi' | 'mix'
    thresholds: [10, 20, 30], // minutes of continuous time for levels 1–3
    categories: ['Social Media', 'Entertainment', 'News'],
    dailyGoal: 60, // minutes/day in distracting categories — under it keeps the streak
    sound: false,
    quietHours: { enabled: false, start: '19:00', end: '08:00', weekends: false },
    hardLimit: { enabled: false, minutes: 120 },
  }, // shared by affirmations, nudges, insights, ice breakers
  quoteLang: 'en', // 'en' | 'vi' | 'en+vi'
  affirmationLang: 'en', // same options
  worldClocks: [
    { name: 'Singapore', tz: 'Asia/Singapore', lat: 1.29, lon: 103.85 },
    { name: 'London', tz: 'Europe/London', lat: 51.51, lon: -0.13 },
    { name: 'New York', tz: 'America/New_York', lat: 40.71, lon: -74.01 },
    { name: 'San Francisco', tz: 'America/Los_Angeles', lat: 37.77, lon: -122.42 },
  ],
  calendar: { lunar: false },
};
