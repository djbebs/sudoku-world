# MINDPLAY Sudoku — worldwide leaderboard

**Play it: <https://djbebs.github.io/sudoku-world/>** (all games: <https://djbebs.github.io/sudoku-world/landing.html>)

`sudoku.html` now has an optional **worldwide leaderboard**: anyone who opens the game on a phone or a computer can play and compete, with no account. The game itself is unchanged and **stays fully playable offline** — the online ranking is an extra that switches itself off when it is not configured or not reachable.

- Easy, Medium, Hard: each player's **personal best**, top 20.
- Daily Challenge: one ranking **per UTC date**, same puzzle for everybody, top 20.
- Players pick a nickname (14 characters max), identified by an anonymous Firebase ID. No registration.
- The ranking lives in a popup opened by the **🏆 Leaderboard** button (first header row, right of the logo). Two levels of navigation: **This device** | **Worldwide** (live, updates by itself), then **Easy | Medium | Hard | Daily**. A line under the difficulty pills says what the list is: **This device** → *My game history* / *Historique de mes parties* (every game saved here, so the same player can appear several times), **Worldwide** → *Best score per player* / *Meilleur score par joueur* (one row per player and difficulty: only the personal best is kept, top 20). Daily also names its UTC day on a second line. Browsing them never touches the game being played (the timer keeps running). The popup closes with a click outside, a click on an empty spot of the card, the ✕, or Esc; tabs, pills, buttons and a list that scrolls never close it. The last tab and difficulty are remembered for the session.
- A **Share** button (first header row, next to 🏆, plus a discreet invitation on the win screen) opens a popup with **Facebook**, **Messenger**, **WhatsApp** and **Copy link**, in French or English. The game is free, with no ads: *No ads. Just Sudoku.* / *Zéro pub. Juste du Sudoku.* See "Sharing and link preview" below.
- **The game is the first page**: it opens straight on today's Daily Challenge (or, once that one is done, on a regular Easy game); the calendar of daily challenges is one tap away behind the 📅 button next to **Daily Challenge** (its **Play** button comes back to the Daily).
- The controls above the grid are organised in three short lines (a computer shows them in full, a phone keeps them compact):
  1. the logo, then **🏆 Leaderboard** and **Share** (icon + text on a computer, icon only on a phone, each with a translated `aria-label`), then the **EN | FR** switch and the day/night button;
  2. the **difficulty** group (Easy | Medium | Hard), the **daily-challenge** group (the 📅 calendar and **Daily Challenge** are two buttons with two actions, drawn as one group) and **New Game**;
  3. **Time**, **Best** and **Mistakes** (♥♥♥) on one line, then the grid right below.
  The header is a little wider than the 480 px grid on a computer (the longest French / English labels need it); on a phone it is the same 480 px column as the grid, scaled to the screen like the rest of the game, but its buttons and text are sized in *screen* pixels (`--u` in the CSS = one screen pixel, derived from the scale `--fit`), so 🏆 / Share / EN-FR / theme stay at least 44 px high and the text stays readable on a 320 px phone. Nothing about the game logic, the saves or Firebase changed.
- The pencil-marks mode is a labelled two-state button, **✏️ Candidates** (*Candidats*), under the digit keys: neutral when OFF, violet with a ticked box when ON (so the state never relies on colour alone), `aria-pressed` for assistive technology, at least 44 × 44 px on screen at any phone width, Day and Night themes. The first time it is switched on, a small tip under the button explains it; it is shown once (`localStorage` key `sudoku-cand-tip`) and never again. The `N` key still toggles it.

Stack: Firebase **Firestore** + **Anonymous Authentication** + optional **App Check**, Firebase modular SDK, vanilla HTML/CSS/JS, hosted for free on **GitHub Pages**. No framework, no build step.

---

## 1. Files

| File | Role |
|---|---|
| `sudoku.html` | The game. Gained the leaderboard popup (Worldwide tab, difficulty selector), the share popup and win-screen invitation, nickname dialog and a status line in the win screen. |
| `online.js` | ES module: Firebase bootstrap (lazy), anonymous sign-in, live ranking, score submission, offline queue. Exposes `window.SudokuOnline`. |
| `online-core.js` | Pure helpers (board ids, nickname cleaning, validation limits, ordering, queue). Shared by the browser and the tests. |
| `firebase-config.js` | **You edit this** (Firebase web config). While it contains `YOUR_…` the leaderboard stays off. |
| `firebase-config.example.js` | A filled-in example with fake values. |
| `firestore.rules` | Security rules (the server-side gate). |
| `firestore.indexes.json` | Required composite indexes. |
| `firebase.json` | Firebase CLI config (rules, indexes, local emulators). |
| `tests/` | Unit, link-preview, security-rules and two-browser end-to-end tests (run on local emulators only). |
| `index.html` | Tiny redirect so the bare site address opens `sudoku.html` (with English link-preview tags). |
| `fr/index.html`, `en/index.html` | The French and English **share pages** (`…/sudoku-world/fr/`, `…/en/`): their own link-preview tags and image, then they open the game in that language. |
| `landing.html`, `2048.html`, `minesweeper.html`, `spectrum-flux.html`, `tictactoe.html` | The other games and the portal behind Sudoku's "All games" button. |
| `assets/` | Link-preview images `og-sudoku-en.jpg`, `og-sudoku-fr.jpg` (1200×630; the older `og-sudoku-world-v2.jpg` stays for links already shared), the logo for the share popup / pages `logo-sudoku.png`, and the favicons (`favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`), all made from the Sudoku logo. |
| `.nojekyll` | Empty file: tells GitHub Pages to serve the files as they are. |
| `.gitignore` | An **allowlist**: only the files named in it can be committed. Add a file there before publishing it. |

---

## 2. How it works

```
 sudoku.html ──(win, "Save score")──► online.js ──► Firestore
   │  local scoreboard (localStorage, unchanged)        scores/{board}_{uid}   public leaderboard
   │  Worldwide tab  ◄── live listener (top 20) ◄────── players/{uid}          private nickname record
   └─ game, timer, hearts, notes, themes, EN/FR … untouched
```

* **Identity.** On first use Firebase Anonymous Auth creates a persistent anonymous user (stored in the browser's IndexedDB). The nickname is kept in `localStorage` (`sudoku-player-name`, the same key the local scoreboard already used) and in `players/{uid}`.
* **One entry per player per leaderboard.** A score document's id is `<board>_<uid>` — e.g. `easy_Zk3…`, `daily-2026-10-31_Zk3…`. Rules force the id to match, so a second entry is physically impossible; a later run only *replaces* it when it is strictly better (faster, or same time with fewer mistakes).
* **Boards** are `easy`, `medium`, `hard`, and `daily-YYYY-MM-DD` (UTC).
* **Daily Challenge uses the UTC date** everywhere (puzzle seed, calendar, leaderboard), so a player in Tokyo and one in New York get the same puzzle on the same date. (Before this change it used the device's local date.)
* **Random puzzles.** Easy/Medium/Hard puzzles are generated randomly on each device, so times come from *different puzzles of the same difficulty*. The Worldwide tab says so under the list.
* **Reads are economical.** The live listener only runs while the Worldwide list is actually on screen (popup open on the Worldwide tab, page visible) and stops when the popup closes. The Firebase SDK is downloaded only when first needed.
* **Offline / outages.** If a score cannot be sent (offline, Firebase down, SDK blocked) it is stored in `localStorage` (one entry per board, best kept) and retried when the connection returns (and every 20 s while pending). A Daily result older than yesterday (UTC) is dropped, because the server would refuse it.

---

## 3. Security — what is and is not guaranteed

A public leaderboard must not trust the browser. Here is the honest picture.

**What cannot be done on the free plan.** *Real* server-side validation — re-solving the submitted grid, regenerating the Daily puzzle from its date, checking the difficulty from the puzzle itself — needs code running on a server you control, i.e. **Cloud Functions, which require the paid Blaze (pay-as-you-go) plan**. This project is built for the free **Spark** plan, so it does **not** do that.

**What is done instead (practical free-tier alternative): Firestore Security Rules** (`firestore.rules`, tested — see §8). They run on Google's servers and cannot be bypassed by editing the page:

| Check | Where |
|---|---|
| Only signed-in (anonymous) users write; nobody can write for another uid or into someone else's document | rules |
| Fixed document shape (no extra fields, no missing fields), types checked | rules |
| Document id must equal `<board>_<uid>` → no duplicates per identity per leaderboard | rules |
| Timestamp is the **server's** (`request.time`), never the device clock | rules |
| Board must be `easy/medium/hard` or **today's / yesterday's UTC date** (server clock) — no arbitrary or future dates | rules |
| Plausibility: time between a per-difficulty floor (30 s / 45 s / 60 s) and 6 h; mistakes 0–2 (3 = game over); clue count inside the range the generator really produces | rules |
| Updates: only the owner, only a **strictly better** result, at most one every **10 s**; or a nickname-only change | rules |
| Nickname: 1–14 characters, trimmed, no control characters or `< >` (also rendered with `textContent`, never as HTML) | rules + client |
| No deletes from the client; unknown collections closed; `players/{uid}` private | rules |
| Reads are public (it is a public leaderboard) | rules |

**What is NOT guaranteed.** Rules cannot prove that a grid was really solved. Someone who understands the protocol can still post a *plausible* time (above the floors) from a script, or create many anonymous accounts. So the leaderboard is **not cheat-proof**. Mitigations you can add:

1. **App Check** (§5.4) — makes it much harder to call Firestore from outside your real website. Strongly recommended.
2. **Restrict the API key** to your website's domain (§5.5).
3. **Moderate by hand** — delete suspicious documents in the Firebase console (Firestore → `scores`). Nicknames cannot be pre-filtered for bad words without a server; moderate the same way.
4. **Upgrade path (needs Blaze):** a callable Cloud Function that receives the solved grid, checks it against the puzzle (for Daily, regenerated server-side from the date with the same seeded generator) and is the *only* writer (`allow write: if false` in the rules). That is the right design if cheating becomes a real problem; it is not included because it cannot run on the free plan and so could not be tested here.

**Identity limits.** Anonymous identities live in the browser. Clearing site data, using a private window, or switching browser/device creates a *new* identity: the old scores stay in the leaderboard under the old identity, and the player can post again. iPhone Safari also erases site data after about a week without use. Fixing that needs real accounts (e.g. Google sign-in, which Firebase Auth can link to the anonymous user); not included.

---

## 4. Firestore design, indexes and free-tier budget

**`scores/{board}_{uid}`** — `uid`, `board`, `nickname`, `time` (s), `mistakes` (0–2), `clues`, `ts` (server timestamp). Denormalised nickname → listing needs no join.
**`players/{uid}`** — `nickname`, `updatedAt`. Owner-only; used to remember the nickname server-side.

Queries:

* Top 20: `scores where board == X order by time, mistakes, ts limit 20` → composite index `(board, time, mistakes, ts)`.
* "Your rank" when outside the top 20: `count(where board == X and time < mine)` → index `(board, time)` (both are in `firestore.indexes.json`).
* Renaming: `scores where documentId in [your ≤5 ids]`.

If you ever see "The query requires an index" in the browser console, click the link in the message: it creates the missing index in one click.

**Free tier (Spark), at the time of writing — check the Firebase pricing page:** 1 GiB stored, ~50 000 document reads/day, ~20 000 writes/day. Rough costs: opening the Worldwide list ≈ 20 reads (+1–3 for your own rank) and +1 read per change while open; a score ≈ 2–4 reads and 1–2 writes. So a few thousand list views a day fit comfortably. If you outgrow the free reads, the game keeps working and the ranking shows "unavailable" until the quota resets; switch the live listener to a one-shot `getDocs` + the Refresh button in `online.js → subscribe()` to cut reads, or move to Blaze with a **budget alert**.

---

## 5. Step-by-step setup

### 5.1 Create the Firebase project (free Spark plan)

1. Go to <https://console.firebase.google.com> → **Add project** → name it (e.g. `my-sudoku`). Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
3. **Build → Firestore Database → Create database** → pick a location near your players (cannot be changed later) → **Start in production mode** (the rules below replace the default).
4. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no Firebase Hosting needed) → copy the `firebaseConfig` values.

### 5.2 Put the config in the site

Edit `firebase-config.js` and replace the four `YOUR_…` values (see `firebase-config.example.js`). Until you do, the leaderboard stays hidden and the game behaves exactly as before.

### 5.3 Publish rules and indexes

With the Firebase CLI (needs Node.js):

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # choose your project (creates .firebaserc)
firebase deploy --only firestore   # deploys firestore.rules and firestore.indexes.json
```

No CLI? Paste `firestore.rules` into **Firestore Database → Rules → Publish**, and create the two indexes of `firestore.indexes.json` by hand under **Firestore Database → Indexes → Composite → Add index** (collection `scores`; fields `board ↑, time ↑, mistakes ↑, ts ↑`, and `board ↑, time ↑`). Indexes take a minute or two to build.

### 5.4 App Check (recommended)

1. <https://www.google.com/recaptcha/admin> → create a **reCAPTCHA v3** site; add your domain (`<your-user>.github.io`) and `localhost`.
2. Firebase console → **App Check → Apps → your web app → reCAPTCHA** → paste the **secret key**.
3. Put the **site key** in `firebase-config.js` → `appCheckSiteKey`.
4. Test on your live site first, then **App Check → APIs → Cloud Firestore → Enforce** (and **Authentication** if offered). Do not enforce before the site key is deployed or every player is rejected.
5. Local testing with enforcement on: open the site on `localhost`, copy the *debug token* printed in the browser console, and register it under **App Check → Apps → Manage debug tokens**.

### 5.5 Restrict the API key

Firebase web config values are public by design, but restrict the browser key anyway: <https://console.cloud.google.com> → **APIs & Services → Credentials** → the *Browser key* → **Application restrictions: HTTP referrers** → add `https://<your-user>.github.io/*` and `http://localhost/*`.

### 5.6 Authorize your domain for sign-in

Firebase console → **Authentication → Settings → Authorized domains → Add domain** → `<your-user>.github.io`. (`localhost` is already there.) Without this, anonymous sign-in fails on your public site.

---

## 6. GitHub Pages deployment (free, HTTPS)

This project is published as the repository **`djbebs/sudoku-world`** (public — Pages on a free account needs a public repo).

1. **What gets published.** Everything in a public repo is public, so `.gitignore` is an allowlist: only the files it names can be committed (the site, the other games, the Firebase rules and the tests). Personal or unrelated files in the same folder (`fitness_tetris.py`, `hand_landmarker.task`, design notes, `node_modules`…) can never be committed by accident. Check with `git status` / `git ls-files`.
2. **Private commit address.** Commits carry an e-mail address that is public. This repository is set to the GitHub no-reply address:
   ```bash
   git config user.email "144615027+djbebs@users.noreply.github.com"
   ```
3. **First publication** (GitHub CLI, one command; run `gh auth login` once beforehand):
   ```bash
   gh repo create sudoku-world --public --source . --remote origin --push
   ```
   Without GitHub CLI: create an empty public repo `sudoku-world` on github.com, then
   `git remote add origin https://github.com/djbebs/sudoku-world.git && git push -u origin main`.
4. **Switch on Pages:** GitHub → repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.**
5. After a minute or two the site is live at **`https://djbebs.github.io/sudoku-world/`** (opens `sudoku.html`). Direct links: `…/sudoku.html`, `…/landing.html` (all games). This address never changes as long as the repository and the account keep their names.
6. Do §5.5 and §5.6 with the domain `djbebs.github.io`.
7. **Updates:** `git add -A && git commit -m "…" && git push`. Pages redeploys to the same address within a couple of minutes (browsers may cache files for up to ~10 minutes).

Scores saved in the local scoreboard live in the browser, **per site address**: scores saved while opening the file directly or on `localhost` do not appear on `djbebs.github.io`.

> The page must be served over **http(s)**. Opened as a plain file (`file://`) the Worldwide tab simply does not appear and the game works as before.

### Sharing and link preview (Facebook, WhatsApp, X, Telegram…)

**The Share button** (header, next to 🏆) and the invitation on the win screen open a popup with the logo, the name, the slogan and four buttons. Everything is optional and starts with a click: the popup never opens by itself, the message never contains a score, and the game sends nothing anywhere.

* **Facebook** → `https://www.facebook.com/sharer/sharer.php?u=<share page>`, Facebook's public link-share URL: no app id, no Facebook SDK, no login. **Limitation:** only the link is passed. Facebook builds the preview (title, description, image) from the page's Open Graph tags, and the sender writes their own message: Facebook does not let a site pre-fill the text of a post.
* **Messenger** → Messenger has no public web share address that works without a Facebook **app id** (Facebook's "Send dialog" requires one, i.e. a Meta developer account, which this project avoids). So the button adapts to the device. **On a phone** it uses the app's own link, `fb-messenger://share/?link=<share page>`, which opens Messenger on its share screen. If the page is still in front 1.5 s later (no app installed, or the browser refused to open it), the link is copied instead and the player is told: "Couldn't open Messenger. Link copied." / « Impossible d'ouvrir Messenger. Lien copié. » **On a computer** it opens `https://www.messenger.com/` in a new tab and copies the link at the same moment, with an instruction that stays up: "Link copied. Paste it in Messenger." / « Lien copié. Colle-le dans Messenger. » The preview of the pasted link is built by Messenger from the same Open Graph tags as for Facebook. If the clipboard is refused, the link is shown selected, like the Copy button.
* **WhatsApp** → `https://api.whatsapp.com/send?text=…`, WhatsApp's official send link (opens the app on a phone, WhatsApp Web / Desktop on a computer), with a ready-made message in the player's language:
  `🧩 No ads. Just Sudoku.` / `Play for free and challenge me on the global leaderboard!` / the link (French: `🧩 Zéro pub. Juste du Sudoku.` / `Joue gratuitement et défie-moi au classement mondial !` / the link). The player can edit it before sending. (`wa.me/?text=` is the shorter official form, but its redirect turns every emoji — here the 🧩 — into `�`; checked on 2026-11-01, so the game uses `api.whatsapp.com/send`, which keeps them. On a computer, WhatsApp's intermediate web page may *display* the emoji as `�` (its own rendering), but the "Open app" / "Continue to WhatsApp Web" links behind it carry the exact message including the 🧩 (checked); look at the message in the chat once by hand.)
* **Copy link** → the clipboard (fallbacks: `document.execCommand('copy')`, then the link is shown, selected, to copy by hand), with a discreet "Link copied!" / "Lien copié !".

**Why two share pages.** Preview robots (Facebook, WhatsApp…) do not run JavaScript, and GitHub Pages is static, so one page cannot show a French preview to French readers and an English one to the others. Each language therefore has its own static page with its own Open Graph / Twitter tags and image:

| Language | Link that is shared | Preview image |
|---|---|---|
| French | `https://djbebs.github.io/sudoku-world/fr/` | `assets/og-sudoku-fr.jpg` ("Zéro pub. Juste du Sudoku.") |
| English | `https://djbebs.github.io/sudoku-world/en/` | `assets/og-sudoku-en.jpg` ("No ads. Just Sudoku.") |

A human who opens one of these pages is sent straight to the game (`sudoku.html?lang=fr|en`) by a one-line script — deliberately **not** a `meta refresh`, so a robot keeps reading the page it was given. Without JavaScript a visible *Play / Jouer* button leads to the game. `?lang=` picks the language for that visit only: it does not overwrite the language the player saved, and it disappears from the address as soon as they choose one. The bare address (`…/sudoku-world/`) and `sudoku.html` keep working exactly as before, with English tags (`og:locale` `en_US`, `fr_FR` as alternate).

**Images.** Two images, because the slogan is part of the picture. They are 1200×630 **JPEG**, not PNG: WhatsApp skips preview images above ~300 KB, and a PNG with glowing gradients is several times heavier (these are ~145 KB). They reuse the real neon Sudoku logo, untouched, next to a discreet 9×9 board drawn like the game's and the slogan in the game's own title gradient. Editable source (kept local, not published): `assets-src/og-share.html?lang=en|fr`, rendered with Chrome at 1200×630. The logo in the popup and on the share pages is `assets/logo-sudoku.png`, the original trimmed and resized to 320×320.

**No ads, no tracking.** No Meta Pixel, no Facebook SDK, no analytics, no ad code, no sign-in: `tests/share.test.mjs` scans every published page for them. The only third-party code is the Firebase SDK that powers the optional worldwide leaderboard.

**WhatsApp caches previews for a long time, per exact URL.** To see a changed preview, share a URL it has never seen — add a throw-away query parameter, which the site ignores:

```
https://djbebs.github.io/sudoku-world/fr/?v=2
https://djbebs.github.io/sudoku-world/en/?v=2
```

Use a new number each time (`?v=3`, …). Send it to yourself ("Messages to yourself") and wait a few seconds. If you change the *image*, also give it a new file name (e.g. `og-sudoku-fr-v2.jpg`) and update the tags: robots cache the image URL too. Free checkers: the Facebook Sharing Debugger (<https://developers.facebook.com/tools/debug/>, "Scrape Again"; needs a Facebook login) or <https://www.opengraph.xyz>. Keep the image under ~300 KB — WhatsApp skips larger ones.

---

## 7. Behaviour reference

* **First launch** (online configured): a dialog asks for a nickname once (skippable). Change it any time from **👤** on the calendar screen or **✎** under the Worldwide list. Changing it renames your existing leaderboard entries (your three personal bests and today's/yesterday's Daily).
* **Saving a score** (win screen → *Save score*) records it locally as before **and** posts it worldwide; the win screen shows `🌍 Worldwide: #n`, or that it was not a personal best, or that it is queued.
* **Daily Challenge** results are grouped by the puzzle's UTC date (kept even if midnight UTC passes mid-game; accepted up to one day later).
* The calendar now follows UTC dates too.

---

## 8. Tests — what exists and what was actually run

```bash
cd tests
npm install
npm test            # = test:core + test:share + test:rules + test:e2e
```

Requirements: Node 22+, **Java 11+** (the Firestore emulator), Google Chrome (set `CHROME_PATH` if needed) and internet access (the Firebase SDK loads from gstatic.com). Everything runs against **local emulators** with a fake project (`demo-sudoku`); nothing touches your real Firebase project.

| Suite | Covers |
|---|---|
| `core.test.mjs` | UTC date, board/doc ids, nickname cleaning, ordering, personal-best rule, validation limits, offline queue |
| `share.test.mjs` | The link-preview tags read from the raw HTML of the 4 pages (every `og:*` / `twitter:*` tag, absolute https URLs, locales), the two share images (real 1200×630 JPEG, under 300 KB), the FR / EN share pages (no meta refresh, redirect, hreflang), the exact FR / EN texts and share links in `sudoku.html`, and the "no ads, no tracking" scan of every published page |
| `rules.test.mjs` | Firestore rules: signed-out writes, wrong uid/doc id, extra/missing fields, client timestamps, nickname rules (incl. emoji), time/mistakes/clues bounds, board/date rules, duplicate prevention, improvement-only updates, 10 s rate limit, rename-only updates, no deletes, private `players` |
| `e2e.mjs` | Two separate Chrome profiles (two identities) + a third: first-launch nickname, same Daily puzzle, ranks #1/#2, both see the same list, live update without reload, persistence after reload, duplicate prevention, better-score replacement, tie-break by mistakes, live rename, offline play + queue + automatic send, Firebase unreachable, EN/FR, 390×844 touch layout, leaderboard-off when unconfigured. Leaderboard popup: 🏆 button position, centred card and light dimming, game and timer untouched, closing (outside / passive spot / ✕ / Esc, never by tabs, pills, buttons, gaps or a scrolling list), Local ⇄ Worldwide and the four difficulties, the explanatory subtitle of each tab (EN / FR, immediate, contrast in Night and Day, 320 → 768 px), several local games of one player vs one worldwide row, session memory, listener only while open, personal rank below the top 20, 20-row scrolling on desktop and on a 390 px touch screen, EN/FR, day theme. Candidates button: toggle + `aria-pressed` + N key + Space/Enter, same size ON and OFF, WCAG contrast computed for Day/Night × ON/OFF plus hover, pressed and focus ring, theme switch while ON, entering / removing candidates without placing a digit or counting a mistake, the first-use tip (once, ✕ / outside click / Esc, language, localStorage), 320 / 375 / 390 px touch targets (EN and FR). Sharing: the Share button next to 🏆, popup content and style, closing (never by the share buttons), exact Facebook / Messenger / WhatsApp links in EN and FR (opened in a new tab, hosts blocked in the test browsers), Messenger on a computer (tab + link copied + instruction that stays) and on a phone user agent (app link, "not installed" fallback, app taking over, popup closed while waiting), copy to the real clipboard and its three fallbacks, `?lang=` and the static FR / EN pages, the win-screen invitation (never automatic, score logic untouched, none after a loss), 390 / 320 px and landscape phones. Header layout (2026-11-01): the two header rows and the stats row in reading order on a computer (EN and FR, exact labels and accessible names, groups told apart by spacing, nothing overlapping), then 320 / 375 / 390 / 430 / 768 / 1024 / 1440 px × EN / FR × Night / Day (no overflow, nothing cut, covered or overlapping, icon-only 🏆 / Share with a 44 px target and readable text on phones), short landscape phones, the controls' behaviour (difficulty, calendar, Daily's UTC grid, New Game, popups, theme / language switches keeping the game) and keyboard order with a visible focus ring |

**Last run (2026-11-01, Windows 11, Node 24, Java 21, Chrome, local emulators):** `core` 8/8, `share` 13/13, `rules` 20/20, `e2e` 60/60 (header layout, tab title and first page included). Also checked by hand-run scripts against the live site after publishing (see the release notes in the commit). **Not tested:** a real Firebase project (so App Check, real index builds and production quotas are untested), real iPhone/Android devices (only Chrome's touch/viewport emulation), other browsers than Chrome, and automated runs against the live GitHub Pages URL (it is checked by hand after each release). The Firestore emulator does not enforce indexes, so `firestore.indexes.json` is unverified until deployed.

---

## 9. Maintenance

* **Watch usage:** Firebase console → Firestore → **Usage**. Set a Google Cloud budget alert if you ever move to Blaze.
* **Abuse or bad nicknames:** Firestore → `scores` → delete the document (or filter by `uid`). Deleting a document lets that player post again.
* **Reset a leaderboard:** delete the documents with that `board` value (console, or a small script with the Admin SDK on your own machine — never ship admin credentials in the site).
* **Change limits:** edit the constants in `online-core.js` **and** the matching numbers in `firestore.rules` (`minTime`, `cluesOk`, `21600`), then `firebase deploy --only firestore` and re-run the tests.
* **Firebase SDK version:** bump the `SDK` URL constant at the top of `online.js`, run the tests.
* **Privacy:** the only data stored is the chosen nickname, an anonymous ID and the scores. There are no emails or tracking cookies from this feature. To honour a deletion request, remove the player's documents in `scores` and `players` (and the user under Authentication → Users).
* **Keep secrets out of the site:** service-account keys and Admin credentials must never be placed in this repository.
