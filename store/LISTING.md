# Chrome Web Store listing: Calm Tab Lite

Copy each block into the matching field of the Developer Dashboard. Limits are noted in brackets.

## Store listing tab

**Name** (from the manifest)
Calm Tab Lite

> Optional: the name field allows up to 75 characters and its words help search. Two listings called "Calm Tab" and "CalmTab" already exist, so a descriptive title helps people find yours, e.g. `Calm Tab Lite: Lịch Âm, Focus & New Tab`. This means changing `name` in manifest.json.

**Summary** [132 characters; comes from the manifest description]
A calm, simple New Tab: clock, weather, lunar calendar, focus tools, news and daily inspiration in English and Vietnamese.

**Category**
Productivity (choose the closest subcategory the dashboard offers, e.g. Workflow & Planning)

**Language**
English (you can add a Vietnamese listing later under "Add a language")

**Description** [16,000 characters]

```
Calm Tab Lite turns every new tab into a quiet, beautiful start: a big clock over a calm photo, your day at a glance, and gentle tools to help you focus. Everything is designed with Apple-style liquid glass, in light and dark mode.

YOUR DAY AT A GLANCE
• Clock with eight faces and colours, greeting, daily affirmation and quote (English and Tiếng Việt)
• Weather and air quality for your city, plus world clocks
• Calendar: Day, Week, Month and Year views styled like a Vietnamese tear-off wall calendar (lịch bloc), with every day's Âm lịch date, Can Chi, holidays and days off.
• Phong thủy: today's rating, good hours, and what the day is good for

FOCUS
• Focus session: one Start runs the Pomodoro timer, blocks distracting sites and plays ambient sound together. Breaks soften the sound and lift blocking
• Pomodoro timer that keeps running when the tab is closed
• Focus Mode: a gentle warning or a full block for distracting sites
• Ambient sound: rain, forest, ocean, fireplace, soft piano and lo-fi, made live in your browser, with a sleep timer
• Time & focus: see where your time goes, by category, kept only on your computer
• Friendly nudges when you've spent too long on social media

NOTES & INSPIRATION
• Notes: today's checklist, a notes pad and reminders that pop up as Chrome notifications
• Sites of the day from Awwwards
• News from Vietnam and tech, AI news, and Product Hunt
• Word of the day (English and Vietnamese) and a fun fact with a picture
• Ice breakers for meetings

SIMPLE AND OFFLINE-FRIENDLY
No AI, no accounts and no sign-ins: just the essentials, in English and Vietnamese.

PRIVATE BY DESIGN
No account, no ads, no analytics, no servers of our own. Your notes, settings and time data stay in Chrome on your computer. Calm Tab only contacts the services a feature needs (for example weather or a news feed), and asks before reading any new site.

Make every card mini, regular or big, drag cards between columns, or press Z for Zen mode: just the clock and the photo.
```

**Graphic assets** (in `store/` next to this file)
- Store icon 128×128: `icons/icon128.png`
- Screenshots 1280×800 (1–5): `store/screenshot-1.png` … `store/screenshot-5.png`
- Small promo tile 440×280: `store/promo-small.png`
- Marquee 1400×560 (optional): `store/promo-marquee.png`

**Additional fields**
- Official URL: leave empty unless you own a verified site
- Homepage URL: optional (e.g. your LinkedIn or a project page)
- Support URL: optional; a contact email is required in the Account tab
- Mature content: No

## Privacy practices tab

**Single purpose**
```
Calm Tab replaces Chrome's New Tab page with a calm personal dashboard: clock, calendar, weather, news, notes and focus tools. Its background features (Pomodoro timer, Focus Mode, reminders and time tracking) exist to support that dashboard.
```

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| storage | Saves your settings, notes, reminders, favourites and cached feeds on your computer. |
| alarms | Runs the Pomodoro timer, reminders and feed refreshes while no tab is open. |
| notifications | Shows Pomodoro, reminder and focus nudge notifications. |
| tabs | Reads the active tab's address to measure time per site (Time & focus), apply Focus Mode and open links in new tabs. |
| idle | Pauses time tracking while you're away from the computer. |
| offscreen | Plays ambient sound and the Pomodoro chime so they keep playing while tabs open and close. |
| favicon | Shows a site's icon next to news stories without contacting the site. |
| scripting | Shows a focus nudge on a distracting site, only on sites you've given access to. |
| Host permissions (news sites listed in the manifest) | Reads the news feeds shown on the News and Product Hunt cards. |
| Optional host permission https://*/* | Asked only when you turn on a feature that needs a new site (a custom feed, Sites of the day, pictures for news links). Never asked at install. |
| Optional permission history | Asked only if you choose "Estimate past days from Chrome history" in Time & focus. |

**Remote code**
No, I am not using remote code. (All code is in the package; feeds are parsed as text.)

**Data usage** (tick what applies; everything else stays unticked)
- [x] Location: coordinates are sent to Open-Meteo to show local weather (or a city you type)
- [x] Authentication information: only if you add a Product Hunt developer token, used only to call Product Hunt
- [ ] Personally identifiable information, Health, Financial and payment, Personal communications, Web history, User activity, Website content: not collected. Time tracking and history estimates stay on your computer

Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
The public web address where you host `PRIVACY.md` (see PUBLISHING.md, step 3).
