# Publishing Calm Tab Lite on the Chrome Web Store

Everything to upload is ready in this folder and in `dist/`. Steps marked **(you)** need your Google account, a payment or a decision, so only you can do them.

## What's ready

| Item | File |
|---|---|
| Upload package | `dist/calm-tab-lite-1.1.0.zip` (536 KB, tested as an installed extension) |
| Listing text and privacy answers | `store/LISTING.md` |
| Screenshots 1280×800 | `store/screenshot-1.png` … `screenshot-5.png` (overview · Âm lịch Day sheet · Focus session · light mode with Notes and Sites of the day · Zen with ambient sound) |
| Small promo tile 440×280 | `store/promo-small.png` |
| Marquee 1400×560 (optional) | `store/promo-marquee.png` |
| Store icon 128×128 | `icons/icon128.png` |
| Privacy policy text | `PRIVACY.md` |

## 1. Create a developer account (you)

1. Open the Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account you want to publish from. A personal account is usually better than a work one, since the listing, reviews and payments stay tied to it.
3. Turn on 2-Step Verification for that account (required to publish).
4. Accept the developer agreement and pay the one-time registration fee (US$5).
5. In **Account**, set your publisher name (e.g. "Tom Tran") and add and verify a contact email. That email is shown to users and is what PRIVACY.md points to.

## 2. Build the package

```
cd ~/Developer/calm-tab-lite
sh scripts/package.sh
```

This writes `dist/calm-tab-lite-<version>.zip` with only the files the extension runs. For every later update, raise `"version"` in `manifest.json` first; the store rejects a version it has already seen.

## 3. Put the privacy policy online (you)

The store needs a public web address for the policy. The GitHub repository (tranqtuan/calm-tab-lite) is private, so its files can't be that address. Pick one:
- **Google Sites:** create a one-page site, paste `PRIVACY.md`, and publish.
- **A public Notion page:** paste the text and turn on "Share to web".
- **A public GitHub Gist:** paste `PRIVACY.md` into a new public gist at https://gist.github.com.

Your firm may have rules about publishing from a work laptop, so a personal device is the safer choice for this step. Keep the link; it goes in the Privacy practices tab.

## 4. Upload the item

1. In the dashboard, click **New item** and upload `dist/calm-tab-lite-1.1.0.zip`.
2. The dashboard now shows your item's permanent ID. You don't need to change any code for it.

## 5. Fill in the Store listing tab

Copy from `store/LISTING.md`:
- Description, category (Productivity), language (English)
- Upload the store icon, the five screenshots in order, the small promo tile and, optionally, the marquee
- Mature content: No

## 6. Fill in the Privacy practices tab

Copy from `store/LISTING.md`:
- Single purpose
- One justification per permission (the table lists each one the dashboard asks about)
- Remote code: **No**
- Data usage: tick **Location** (weather) and **Authentication information** (only the optional Product Hunt token), leave the rest unticked, tick the three certifications
- Privacy policy URL from step 3

## 7. Distribution

- **Payments:** Free
- **Visibility:** **Unlisted** is a good first step: only people with the link can install it, so you and a few friends can try the store build before going **Public**. You can switch to Public later from the same page.
- **Regions:** All regions

## 8. Submit for review

1. Click **Submit for review**. Tick **Defer publishing** if you'd like to choose the moment it goes live after approval.
2. Review usually takes a few days. It can take longer for extensions that can ask for access to any site, as Calm Tab Lite can (only when you turn on a feature such as a custom feed).
3. Google emails your account when it's approved or if something needs changing.

## 9. After it's live

- **Your own copy:** the store version is a separate extension from the one you load from `~/Developer/calm-tab-lite`, so it starts empty (your notes and settings stay in the developer copy). Only one extension can own the New Tab page, so turn off the developer copy in `chrome://extensions` when you switch.
- **Updates:** raise the version, run `scripts/package.sh`, then **Package → Upload new package** in the dashboard and submit again.
- **Reviews:** reply to user reviews from the dashboard.

## Why reviews get rejected, and how Lite stands

| Common reason | Calm Tab Lite |
|---|---|
| A permission isn't used | Each one is used and justified in LISTING.md |
| Remote or obfuscated code | None: strict security policy, all code in the package |
| Missing or wrong privacy policy | PRIVACY.md matches what Lite does (step 3 puts it online) |
| Misleading or keyword-stuffed listing | Plain description of real features |
| Broken features | The packaged zip was installed and run in Chrome with no errors |
