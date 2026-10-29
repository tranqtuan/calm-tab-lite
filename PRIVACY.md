# Calm Tab Lite privacy policy

_Last updated: 29 October 2026_

Calm Tab Lite replaces Chrome's New Tab page with a calm dashboard. It has no servers of its own, no analytics and no advertising. This policy explains what the extension handles and where it goes.

## What stays on your device

Everything below is stored with Chrome's `chrome.storage` and is never sent to us, because there is no "us" server.

- **Settings** (theme, widgets, feeds) are kept in `chrome.storage.sync`, which Chrome syncs only within your own Google profile.
- **Time and focus data:** the domain and the seconds of the active tab, used for the Time & focus widget, Focus Mode and distraction nudges. It's kept for 60 days, then deleted automatically.
- **Chrome history (optional):** read only if you click *Estimate past days from Chrome history*, and turned into daily totals locally. You can remove the permission at any time in Settings → Privacy & Data.
- **Personal details you enter:** the Product Hunt token and phong thủy birth details. These are kept in `chrome.storage.local` only and never synced.
- **Notes:** your Today checklist, notes pad and reminders, kept in `chrome.storage.local` only and never synced.
- **Saved items:** favourites, read-later stories, ice breaker history and caches.

Settings → Privacy & Data lets you export your time data as CSV and reset everything. Uninstalling the extension deletes all of it.

## What is sent over the network, and why

Calm Tab Lite connects only to services needed for the features you use, always over HTTPS.

| Service | When | What is sent |
|---|---|---|
| Open-Meteo | Weather, air quality and city search | Coordinates or the city name you typed |
| RSS sources you read (VnExpress, The Verge, arXiv…) | News tabs | A normal request for the feed and article |
| Product Hunt | Product Hunt widget | Your developer token, if you added one |
| Awwwards (feed via `feeds.feedburner.com`, images from `awwwards.com`) | Sites of the day, only after you allow it in the card | A normal request for the public feed and preview images |
| Wikipedia / Wikimedia | Fact of the day pictures | Which article picture is shown |
| Unsplash / Pexels | Backgrounds | A request for the image or video |

Calm Tab Lite has no AI features and no account sign-in.

## Location

Your location is used only to show local weather. Chrome asks before sharing it, and you can choose a city instead. Coordinates go only to Open-Meteo.

## What we never do

- Sell or transfer user data to third parties.
- Use or transfer data for advertising, creditworthiness or lending.
- Use data for anything other than Calm Tab Lite's features.

Calm Tab Lite's use of information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## Contact

Questions about this policy: open an issue in the project repository, or use the contact email on the Chrome Web Store listing.
