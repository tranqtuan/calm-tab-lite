# Calm Tab Lite

The simpler edition of Calm Tab: no AI, no calendar sign-in, and English and Vietnamese only. The full version lives in `~/Developer/calm-tab`.

A calm, minimalist New Tab page for Chrome (Manifest V3). It shows a large clock, the weather, a solar/lunar calendar, a daily quote, an affirmation, a fun fact, a word of the day in English or Vietnamese and a phong thủy reading, plus news with images, Product Hunt's top launches, a Pomodoro timer and private time tracking with Focus Mode. Everything sits on a quiet nature background.

No build step, no framework, no analytics. Plain ES modules load straight from disk.

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Open a new tab. Chrome may ask whether to keep the new New Tab page. Choose **Keep it**.

To update after editing files, click the ↻ reload icon on the extension card, then open a new tab.

## Features

| | |
|---|---|
| **Clock & greeting** | The centre reads top to bottom: clock, date, greeting ("Good morning/afternoon/evening, Name"), affirmation, then the quote. 12h/24h, optional seconds. **Eight watch faces:** Classic (thin), Bold (rounded, lock-screen style), Serif (italic numerals), Flip (glass tiles that fold when a digit changes), Analog (a liquid-glass dial with a sweeping second hand), Words ("It's about twenty past seven"), Neon (glowing tubes) and Stack (hours over minutes, StandBy style). **Eight colours:** Default, Jade, Sunset, Ocean, Aurora, Peach, Lime, Mono; the gradients fill the digits. **Click the clock** (or press Enter on it) to cycle faces, or pick one in Settings → General → Clock face, a gallery of live previews. Zen mode keeps the clock centred. |
| **Weather & clocks** | One card. **Your city:** Open-Meteo weather (free, no key) with temperature, condition, high/low and location, from geolocation or a city you search for in Settings, with a °C/°F toggle. **Air quality:** the US AQI with a coloured badge (Good → Hazardous); hover for advice plus PM2.5, PM10 and ozone. **World clocks** underneath: your chosen cities (Settings → World clocks), each with local time, day or night, the difference from you ("Tomorrow · +6h") and current weather, all from one Open-Meteo request. Everything is cached for 30 min. |
| **Calendar** | A month view of the current month, fully offline. |
| **Âm lịch** | One calendar: every day shows the solar date with its lunar date underneath, and the header shows today's lunar date with Can Chi. Saturdays are blue, Sundays and Vietnamese public holidays (days off) are red, and days off get a soft tint. Special days from both calendars get a small gold dot: solar ones such as Valentine, 8/3, 20/10, 20/11 and Christmas, and lunar ones such as Rằm tháng Giêng, Phật Đản, Đoan Ngọ, Vu Lan, Trung Thu, Ông Công Ông Táo and Giao thừa. Mùng 1 and Rằm have a gold lunar number. A one-line legend sits under the grid. Computed offline for UTC+7 using Hồ Ngọc Đức's algorithm. |
| **Calendar views** | The calendar is a glass *lịch bloc* (a Vietnamese tear-off wall calendar) with **Day · Week · Month · Year** views. Click any day to open its sheet. The Day sheet shows a large date (red on Sundays and days off), the weekday, any holiday, the lunar date with Can Chi and the year's animal, Hoàng đạo / Hắc đạo, and the six good hours. The big card adds what the day is good for and what to avoid. Turn pages with ‹ ›, a drag or swipe (the sheet tears off forward or is laid back on), the scroll wheel, or ← / →. **T** jumps to today, **Esc** goes back to the month, and clicking the title goes up a level (day → month → year). Week lists seven days with their special days. Year shows twelve small months; tap one to open it. Every new tab opens on today; the last view is remembered for the browser session. With *reduce motion* on, pages crossfade. |
| **Phong thủy** | **Today:** a color score ring and a plain-language headline, **Best for / Avoid** activities from the day's Trực, a 24-hour strip of good hours with a "now" marker and the next good hour, your compatibility as a badge, plus "Why this rating?" and "What do these mean?" explanations. **Month:** a heat map; tap a day for its reading. **You:** element badge, a compass of lucky directions, and real color swatches. Uses your birth date, gender and optional birth hour, kept only on this device. Traditional guidance, for reflection. |
| **Quote** | 242 bundled quotes in **English or Tiếng Việt**, or English with a Vietnamese line underneath (Settings → Typography & learning). Set in an artistic serif. Choose Classic (Cormorant Garamond), Editorial (Playfair Display), Handwritten (Dancing Script) or System in Settings. The fonts are bundled locally with Vietnamese support. Changes daily. Hover to copy, favorite or refresh. The quote sits on its own liquid-glass card under the affirmation (readable at WCAG AA on any photo), kept to a 45–65 character line; copy, favourite and next appear in a small pill beside the card. |
| **Affirmation** | 169 bundled "I am…" affirmations in English or Vietnamese (or English + Vietnamese), plus your own, which stay as you wrote them. Click to refresh. Shown in the **Spotlight** style: a bold statement (600 weight, balanced lines) with its key phrase marked by a soft jade highlighter, picked automatically from the words after "I am" / "I" / "Tôi". Long affirmations step down a size. |
| **Fun fact** | 229 science and technology facts, each with a picture from its matched Wikipedia article. All 229 matches are verified, images are fetched from Wikipedia's public summary API with no key and cached for 30 days, and an illustrated category tile is shown offline. |
| **Word of the day** | Switch between **EN · VI** on the card or in Settings. English (465 words): IPA, part of speech, Vietnamese meaning. Vietnamese (456): definition and English meaning. Every word has an example sentence with a translation, shown on hover. Includes 🔊 pronunciation, plus learned words and a saved list for each language. |
| **News** | Vietnam and Tech tabs fed by RSS. The first story gets a hero image and the rest get thumbnails. When a feed has no picture (TechCrunch, some Tinhte posts), Calm Tab uses the article's share image (`og:image`) from sites it can already read, cached for 3 days. Optionally (Settings → News → Pictures) it does the same for any linked site, such as Hacker News stories. Anything left shows the site's icon from Chrome's local favicon cache. Images are lazy-loaded with reserved space. The service worker fetches feeds every 30 min. Add, remove or disable feeds in Settings. |
| **Product Hunt** | Today's top 5–10 launches with tagline and upvotes, refreshed hourly. **Product logos need the free developer token**, because Product Hunt only shares images through its API and its pages block automated access. Without a token, launches come from the public feed with a colored letter tile each. |
| **Background** | 33 Unsplash photos and 8 optional Pexels looping videos. Rotates daily, on every tab, or stays fixed. Favorite photos with ♥. The overlay strength adapts to how bright the image is. |
| **Ambient sound** | Six soundscapes synthesised live with Web Audio (no audio files, works offline): Rain, Forest, Ocean, Fireplace, Soft piano and Lo-fi. The ♪ panel works like a Control Center module: a 3×2 grid of tiles with icons (tap one to play it; switching cross-fades), a large play/pause button, volume, and a sleep timer (15 min, 30 min or 1 h, then a gentle fade-out). While sound plays, the ♪ button shows a small equaliser and an accent ring, and its label says what's playing. Sound fades in and out (about 0.6 s), starts only when you click, and plays from a hidden offscreen document, so it keeps playing as you open and close tabs (stop it from the ♪ button in any new tab). The six are levelled to a similar loudness (measured offline, K-weighted). Keys: arrows move between tiles, Enter picks one, Space plays or pauses. |
| **Focus session** | Start on the Pomodoro card begins a Focus session: the timer, Focus Mode and ambient sound together, in one card. The first Start asks once what comes along (block distracting sites, play a sound), then it's one click; *Session options* changes it. During focus phases sites are blocked and sound plays; breaks dim the sound to 40% (or pause it) and lift blocking; pause keeps blocking on; the session ends by itself after the long break, or with Stop (which asks first if more than 5 minutes of focus are left). Changing a part from its own control (the Focus Mode pill, the ♪ panel) adapts the session. Every tab shows the same session. Each feature still works on its own; turn the link off in Settings → Pomodoro → Focus session. |
| **Notes** | One card with **Today · Notes · Reminders**. **Today** is the day's checklist: type and press Enter to add, click the circle to check off ("3 of 5 done" with a thin progress bar), double-click to edit, drag (or Alt+↑/↓) to reorder. Unfinished items come along to the next day marked *from yesterday*; finished ones clear. The target button sends an item to the Pomodoro card's task list. **Notes** is a scratchpad that saves as you type: "- " makes a bullet, "[ ] " a checkbox you can tick, and links are clickable when you're not editing. **Reminders** fire a Chrome notification at their time, even with no tab open (`chrome.alarms`), with **Snooze 10 min** and **Done**; once, daily or weekly. Mini: "2 left today · 3:00 PM". Big: Today and Reminders beside the pad. Everything stays on this device. |
| **Sites of the day** | Awwwards' **three latest Sites of the day**: a large preview with its date, title and description, and the three picks underneath to switch between (← / → work too). Big shows the three with their titles. The ♥ saves a site, kept after it leaves the latest three, under *Saved*. Calm Tab reads Awwwards' public feed (`feeds.feedburner.com`) a few times a day in the background, only after you allow it in the card the first time (an optional permission, nothing asked at install), and uses Awwwards' smaller preview images. The last picks stay cached, so the card opens instantly and works offline. |
| **Signature** | A quiet "Calm Tab · made with ♥ by Tom Tran" in the bottom-left corner: the name in the quote's italic serif, the credit in small spaced capitals, and a gold heart that draws itself in one line on the first new tab of the day (static with *reduce motion*). Hover shows the version; click opens Settings. It steps aside while Jade is talking, hides in Zen mode, and can be turned off in Settings → Widgets. |
| **Pomodoro** | Default 25/5/15 with a long break every 4 sessions, all adjustable. Runs on `chrome.alarms`, so it keeps going after the tab closes. Ends with a desktop notification and a soft chime, and counts sessions per day. |
| **Time & focus** | Active time per site, paused when you're idle or Chrome isn't focused. Shows a daily donut by category, your top 5 sites and a 7-day trend. Export to CSV or reset. Optionally, **Estimate past days from Chrome history**: Chrome history records when you visited pages, not how long you stayed, so each visit counts until the next one, up to 10 minutes. Estimated days are marked ≈ and refresh every 6 hours, and nothing leaves your Mac. |
| **Focus Mode** | Sends distracting categories to a calm interstitial: either a gentle warning with "continue for 5 min", or a full block. It can turn on automatically during Pomodoro focus sessions. |
| **Zen mode** | 👁 button or the **Z** key. Hides the widgets, leaving the clock and background. The toolbar stays faintly visible, so **Settings and the sound player still work**. **Esc** exits. |
| **Liquid glass** | Every card, mini row, toolbar button, panel and notice uses one Apple-style Liquid Glass material: a lens-like blur that lifts the photo's colour, a top sheen, a specular rim lit from the top-left, inner light and a floating shadow. **It reacts to the cursor:** a soft light follows the pointer under the content, and the rim brightens where the pointer is closest (mouse and trackpad only). **Settings → General → Glass transparency** goes from Frosted (0%) to Crystal (100%) and previews live as you drag. The system's *Reduce transparency* setting always gets the frosted look. |
| **Card sizes** | Every card has three sizes, saved per card. **Mini** collapses it to one line with a live summary: weather + AQI, the date and lunar date, the top headline, a Pomodoro countdown with its own play/pause, today's phong thủy rating, the word of the day, and more. Click the header to open it again. **Regular** is the normal card. **Big** widens its column and shows more: a 5-day forecast with feels-like, humidity and wind; month plus "Coming up" lunar milestones; all 15 stories; the full ice breaker with punchline and tip; Today + Month phong thủy; Today + Week time tracking; the word's definition without hovering. Use the ⤢ and ⌃ buttons in each card's header, Settings → Widgets, or *Collapse all / Expand all* in Customize. Size changes animate only the card you change: its height and padding glide on an iOS-style ease curve, the old content fades as it folds away, and the cards below follow it. Nothing else on the page re-renders. |
| **Widget details** | **Pomodoro:** 15 · 25 · 50 min presets when idle, play/skip/reset together, a daily goal ("2 of 4 today", Settings → Focus), "+ Add a task", and in Big a timeline of today's sessions with total focused time. **Ice breaker:** one menu for types, favorites and history, and a clear Present button. **Phong thủy:** Regular shows score, headline, one "best for" and the next good hour; the full reading lives in Big; one birthday prompt; a softer heat map. **Word of the day:** example always shown; "Got it" schedules reviews after 1, 3 and 7 days (Review · Again · Got it); saved words in the card body. **Did you know:** 21:9 picture, favourite and copy, and a mini headline like "Venus · 243 Earth days". **Time & focus:** "Focused 2h 35m of 4h" (Work + Learning) with a goal bar (Settings → Focus), a Focus Mode pill with 25 min / 1 h timers, and one clear empty state. **All cards:** at most three header buttons, Refresh in the right-click menu, "Updated X ago" on news and weather, and shared empty states. |
| **Design system** | Glance-first by default: Weather and Pomodoro open, every other card a one-line mini row, so the whole page fits a 13" laptop without scrolling. Six type sizes with an 11px floor, three corner radii (cards, controls, pills) and a 4-point spacing rhythm. Jade is the only colour for actions; data colours (air quality, ratings) are tinted pills. The glass thickens automatically over photos that would wash text out, keeping secondary text at WCAG AA (≥ 4.5:1) on any photo. **Right-click any card** (or press the menu key) for Collapse / Big / Move / Hide; a visible focus ring for keyboard use; one-time hints for the clock and the card menu. |
| **Customize** | The ⊞ toolbar button. **Drag cards** within or between columns, hide any card with its eye button, and bring hidden ones back from the tray, which also toggles the greeting, affirmation and quote. Esc or **Done** finishes. Settings → Widgets offers the same controls as a list. |
| **AI News** | A third News tab. Sources: The Verge, TechCrunch, MIT Technology Review and Ars Technica (their AI sections); the OpenAI, Google DeepMind, Google AI, Hugging Face and Meta AI Research blogs; arXiv cs.AI and cs.CL (off by default); and Số Hóa, Genk and Tinhte filtered to AI headlines. Topic chips (New Models, Research, Tools & Products, Business, Policy & Safety, Vietnam AI), hidden topics and muted keywords. Stories covered by several outlets are grouped ("Covered by N sources"). Includes Read later with an unread count, an unread dot for important stories, and reading time counted as **Learning**. |
| **Distraction nudges** | Funny reminders on Social Media, Entertainment and News sites: **level 1** a toast (10 min), **level 2** a card (20 min), **level 3** a full-screen frosted overlay (30 min), with adjustable thresholds. During a Pomodoro or Focus Mode they start at level 2. Personalities: Disappointed Grandma, Dramatic Narrator, Sarcastic Robot, Motivational Coach, Your Future Self, or a random mix. 900 bundled lines (EN + VI), with placeholders like {name}, {site} and {minutes}. No message repeats in a day. Buttons: back to work (counts a **Save**), 5 more minutes (sassier next time), this is for learning, start a Pomodoro. Also: quiet hours, an optional hard daily limit, a streak, and a weekly summary. Nudges are drawn in a sealed Shadow DOM, with system notifications as the fallback. |
| **Ice breaker** | 165 bundled ice breakers in English and Vietnamese: stories, questions, would-you-rather, mini games, fun facts and jokes, plus starters from today's AI news. Filter by type, audience, length, meeting type and language (EN / VI / bilingual with English key phrases). **Presenter mode** shows it full-screen with large text, the punchline revealed on tap, a delivery tip and read-aloud practice. Favorites, history and "never show again" are kept. |
| **Settings** | Gear icon. Five groups (Appearance · Focus · Content · AI & Jade · Privacy; Lite has four) with their pages as a second row, plus **search** across every option. Covers name, formats, theme, glass, clock face, location, widget visibility, size, order and column, backgrounds, feeds, Product Hunt token, site categories, phong thủy details, Pomodoro, Focus Mode, nudges, ice breakers, custom affirmations, favourite quotes and data. |

## Product Hunt token (optional)

Without a token the widget uses the public feed. To rank today's launches by votes, go to [producthunt.com/v2/oauth/applications](https://www.producthunt.com/v2/oauth/applications), create an application, copy its **Developer token** and paste it into Settings → News → Product Hunt. It's stored only on this device.

## Permissions

| Permission | Why |
|---|---|
| `chrome_url_overrides.newtab` | Replaces the New Tab page. |
| `storage` | Saves settings (synced through your own Chrome profile), caches and time tracking on this device. |
| `alarms` | Pomodoro timer, 30-minute RSS refresh, and the 1-minute time-tracking heartbeat. Alarms keep working when no tab is open. |
| `notifications` | Tells you when a Pomodoro session ends. |
| `offscreen` | A hidden page that plays the end-of-session chime, because service workers can't play audio. |
| `tabs` | Reads the active tab's URL to track time per site, and redirects distracting sites during Focus Mode. Page contents are never read. |
| `idle` | Pauses time tracking when you step away or lock the screen. |
| `history` (optional) | Only if you click *Estimate past days from Chrome history*. Reads visit times locally to estimate past days. Settings → Privacy & Data → Remove gives the permission back. |
| `scripting` | Injects the nudge overlay into a distracting tab **only when a nudge fires**. There are no always-on content scripts. |
| `favicon` | Shows a site's icon next to stories without a picture, read from Chrome's own favicon cache, so no network request is made. |
| Host permissions (VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, Genk, Tinhte, The Verge, TechCrunch, hnrss.org) | Lets the service worker fetch the default RSS feeds without CORS problems. |
| `api.producthunt.com`, `www.producthunt.com` | Product Hunt widget (API with your token, or the public feed). |
| AI News hosts (technologyreview.com, arstechnica.com, openai.com, deepmind.google, blog.google, huggingface.co, engineering.fb.com, rss.arxiv.org) | Lets the service worker read those AI feeds, and the article text used for summaries. |
| Optional host permissions (`https://*/*`) | Requested for one site at a time when you add a custom RSS feed. Access to all sites is requested only if you turn on *Pictures for every linked site*, and turning it off removes that access again. When you turn on **nudges**, Chrome asks for access to your distracting sites only (Facebook, YouTube, TikTok…); without it, nudges arrive as notifications. |

Open-Meteo (weather and air quality) supports CORS, so it needs no host permission.

**Location** has no install-time permission. The first time weather uses *My location*, Chrome asks once; choose a city in Settings to skip it.

### Security

Calm Tab follows Google's [extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure):

- **A strict content security policy:** only packaged scripts run (`script-src 'self'`, no `eval`, no remote code). There are no plugins and no `<base>` tag, network requests are HTTPS only, and pages can't be framed.
- **HTTPS only:** custom feeds added as `http://` are upgraded to `https://`.
- **Message checks:** the service worker accepts commands only from the extension's own pages. The nudge script runs inside web pages, so it can send just one message type, and the worker re-checks every field (it uses the tab URL Chrome reports, not one the page sends).
- **Untrusted text never becomes HTML:** feed and other remote text is inserted with `textContent`. The only `innerHTML` is for the bundled, constant SVG icons.
- No `unload` handlers, which keeps pages eligible for the back/forward cache.

A full privacy policy for the Chrome Web Store listing is in [PRIVACY.md](PRIVACY.md).

## Privacy

- No analytics, no tracking, no servers of our own.
- Browsing time, favorites, learned words and caches stay in `chrome.storage.local` on this device. Settings are in `chrome.storage.sync`, which is your own Chrome profile.
- Network requests go only to Open-Meteo (weather, air quality and city search), your RSS sources and their image hosts, Product Hunt, Wikipedia (fact pictures, which reveals only which fact is shown), `images.unsplash.com` / `videos.pexels.com` (backgrounds).
- Your birth details (phong thủy) and the Product Hunt token are kept in `chrome.storage.local` only, never synced.
- Time data older than 60 days is pruned automatically. Settings → Privacy & Data has CSV export and reset.

## Project structure

```
manifest.json
newtab.html            New Tab page
blocked.html           Focus Mode interstitial
offscreen.html         Hidden page for the Pomodoro chime
styles/
  main.css             Design system: glass materials, type scale, light/dark, motion
  blocked.css
src/
  boot.js              First-frame setup (theme, glass, blurred photo) before any module loads
  newtab.js            Page entry: boot order, layout, theme, Zen, toolbar
  blocked.js / offscreen.js
  shared/              Used by both page and service worker
    defaults.js        Default settings, RSS feeds, domain → category map
    storage.js         chrome.storage wrapper (serialised settings saves)
    util.js            Dates, domains, categories, formatting
    lunar.js           Vietnamese lunar calendar + Can Chi
    fengshui.js        Phong thủy profile + daily reading rules
  lib/
    dom.js             Tiny DOM helpers (text-only rendering of remote data)
    paintcache.js      First-frame copy of the affirmation and quote (no layout shift)
    icons.js           Thin-line, Lucide-style icon set
    daily.js           Daily rotation + refresh
    ambient.js         Web Audio soundscape engine
    history.js         Optional Chrome-history time estimates
  widgets/             One module per feature
    clock, weather, quote, affirmation, fact, vocab, news, producthunt,
    calendar, fengshui, worldclock, pomodoro, focus (time tracking), background,
    sound, settings, customize (drag & drop layout mode), icebreaker
  background/          Service worker
    service-worker.js  Listeners and message router
    rss.js             Fetch + parse RSS/Atom (no DOMParser in workers)
    pomodoro.js        Timer state machine on chrome.alarms
    focus.js           Focus Mode redirects
    producthunt.js     Product Hunt API / feed
    tracker.js         Idle- and focus-aware active-time tracking
    chime.js           Offscreen-document chime
    nudges.js          Distraction nudges: levels, messages, actions, streak
  content/
    nudge.js           Shadow-DOM nudge overlay (injected on demand)
data/                  Bundled offline content
  quotes.json  affirmations.json  facts.json  backgrounds.json
  i18n/                quotes.vi  affirmations.vi  facts.wiki (index-aligned)
  nudges/              5 personalities × 3 levels × 30 lines × EN/VI
  icebreakers/         stories, interactive (questions, would-you-rather, games), light (facts, jokes)
  vocab/en.json  vocab/vi.json
fonts/                 Quote typefaces (OFL), Latin + Vietnamese subsets
icons/                 Extension icons (generated by scripts/make-icons.mjs)
dev/                   Preview harness only (not used by the extension)
```

## Platform features used

Calm Tab Lite targets Chrome 138 or later and follows Chrome's [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance):
- **Settings** is a native modal `<dialog>` (`showModal()`, `closedby="any"`), so focus trapping, Esc, click-outside dismissal and focus return are handled by the browser.
- **Ambient sound** is a native `popover` opened with `commandfor`/`command="toggle-popover"` and placed under the ♪ button with CSS anchor positioning.
- **Text** scales with your browser font size (a rem-based fluid scale, plus `<meta name="text-scale">` for OS text size).
- **The background photo** loads with `fetchPriority = high`. Prefetching the next photo and the Settings thumbnails run at low priority, and the thumbnails are lazy-loaded.
- **Cards** use container queries, so they adapt to their own column width.

## Customising

- **Default feeds and site categories:** `src/shared/defaults.js`.
- **Content:** edit the JSON files in `data/`. Each vocabulary file in `data/vocab/` has its own fields: see the first entry of each file.
- **Colors and spacing:** CSS variables at the top of `styles/main.css`. The category colors were checked for colour-blind separation in both themes.

## Performance

How a new tab gets on screen fast, in order:

1. **First frame (`src/boot.js`).** A tiny classic script runs before the CSS. From the snapshot the page saved last time (localStorage), it sets the theme, glass, Zen state and a 40×25 blurred copy of the photo this tab will show. No blank or wrong-coloured flash, even before any module has loaded.
2. **Clock first (`src/newtab.js`).** The entry module statically imports only the clock, storage and DOM helpers. It paints the clock, date and today's affirmation and quote from the last-known settings, lets that frame show, then wires up the cards. All widget modules load in parallel in the meantime.
3. **No layout shift.** The affirmation and quote are rebuilt in the first frame from a structural snapshot (`src/lib/paintcache.js`: tags and text, never HTML). Room for the footer controls is reserved from the start. The quote font is preloaded. Cards stay out of sight until their storage reads settle (two quiet frames, at most 300 ms).
4. **Collapsed cards cost nothing.** A mini card's body is `content-visibility: hidden`, so it isn't laid out or painted and its lazy images (news thumbnails) don't download. Did you know fetches its picture only when opened.
5. **Cache first, network later.** Weather, news and Product Hunt show their cached data at once and refresh in the background. Time & focus no longer waits for the service worker to wake up.
6. **Light service worker.** No feed fetch on install (the News card asks when it needs headlines). Feed alarms that fire in the first 20 s after Chrome starts wait 30 s.
7. **Right-sized photo.** Unsplash photos are requested at the width the screen needs (up to 2560 px), with `preconnect` and `fetchpriority="high"`.

Measured with `dev/perf/bench.mjs` in Chrome for Testing 151, headless, 1440×900. Each figure is the median of 5 runs, in ms from navigation start; "page" is the time from the HTML arriving to the clock painted. The old and new builds were run back to back on the same machine.

| | Install / reload | First tab after Chrome starts | Warm new tab |
|---|---:|---:|---:|
| Clock painted | 788 → **432** | 784 → **696** | 196 → **124** |
| Page: HTML → clock painted | 373 → **186** | 269 → **99** | 106 → **49** |
| Photo visible | 1853 → **592** | 843 → **672** | 120 → **106** |
| Cards usable | 751 → **497** | 816 → **753** | 121 → 158 |
| Layout shift (CLS) | 0 (one run 0.06) → **0** | 0 → **0** | 0 → **0** |

Notes:
- Chrome itself needs about 80–750 ms before the HTML reaches the page (more just after it starts). That part is outside an extension's control; the "page" rows are what the page adds.
- The cards now appear a little later than before (they wait until they've settled) in exchange for zero layout shift.

Re-run with `node dev/perf/bench.mjs . out.json 5 && node dev/perf/report.mjs out.json`. Set `CHROME=/path/to/chrome-for-testing` if needed; branded Chrome ignores `--load-extension`. `node dev/perf/diag.mjs . waterfall.json` records every request and every `chrome.storage` call. In DevTools → Performance, the `ct:*` marks show the startup timeline.

## Developing without reloading the extension

```bash
node dev/serve.mjs
```

Then open <http://localhost:5178/>. The dev server fakes the `chrome.*` APIs with `localStorage`, runs the real service-worker modules inside the page, and proxies RSS requests. Geolocation, notifications and real tab tracking only work in the installed extension.

## Credits

Photos from [Unsplash](https://unsplash.com/license) and videos from [Pexels](https://www.pexels.com/license/), both free to use. Each photo's credit and link appear in the bottom-right corner of the page. Icons are adapted from [Lucide](https://lucide.dev) (ISC). Fonts are Cormorant Garamond, Playfair Display and Dancing Script (SIL Open Font License). The lunar calendar algorithm is by Hồ Ngọc Đức.

## License

Copyright © 2026 Tom Tran. All rights reserved. The code is public so you can see how Calm Tab Lite works and what it does with your data; please don't copy or republish it. See [LICENSE](LICENSE). Install it from the Chrome Web Store.
