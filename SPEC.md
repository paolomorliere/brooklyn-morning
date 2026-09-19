# Brooklyn Morning — Paolo's daily phone app

## Context

Paolo wants one installable phone app used every day for three jobs: read a curated morning edition (news + one lesson) over coffee, capture responsibilities instantly, and manage a Trader Joe's–centred grocery list. Hard constraint: **zero additional cost**, ever. No paid APIs, hosting, databases, schedulers, or runtime AI. Discovery is complete (4 rounds); this plan records the confirmed spec and the implementation path.

### Confirmed in discovery
| Area | Decision |
|---|---|
| Device | iPhone only; installable web app (PWA) from Safari. No Mac use, no sync needed. |
| Edition | Ready by **6:00 AM America/New_York**, **8–9 min** read, adjustable. |
| Topics (ranked) | 1) AI, data & analytics. 2) World/US/France top stories. 3) Politics and finance, plain-language sources + glossary. 4) Water polo: anything found (NCAA, international, pro leagues, coaching). 5) Soccer: Ligue 1 & Les Bleus → Champions League/European cups → Premier League; clubs OM, Real Madrid, Man United. News over scores (deprioritize match reports). |
| Learning | Weekly themes, Mon–Sun, 7 lessons on one topic. **No code**: general knowledge readable over coffee. Stock market is the priority (2 of 8 weeks). **8 weeks / 56 lessons** at launch; later packs are downloaded automatically by the app, no manual step. |
| To Do categories | SFC Institutional Research, LIU Water Polo, MS Coursework, Business Ideas, Personal, + Inbox. Optional fields: priority flag, notes. No due dates, no recurrence. |
| Groceries | City Point (Downtown Brooklyn). Quantities, group by store section, check-off removes row with undo (no separate "bought" strip). |
| Screen 4 | Library (saved stories/lessons, own links & notes, tags, search). |
| Visual | Brooklyn Morning (ivory / espresso / terracotta / sage), light theme. |
| Notifications | None. |
| Backup | Manual JSON export via share sheet + banner if last backup > 14 days. |
| Hosting | Paolo's existing GitHub account, public repo. |

### Honest limitations agreed up front
- **No runtime summarization (Option A chosen).** Each story = headline + publisher excerpt (labeled "From publisher") + on tap the article's first 2–3 paragraphs extracted at build time from non-paywalled pages (labeled "Opening of the article") + link. Plain-language sources (NPR, BBC) and a development-time glossary handle jargon. The app never rewrites or claims to have read an article; if extraction fails for a story, only the excerpt shows.
- **Water polo volume** is thin: 3 working feeds found (Total Waterpolo, USA Water Polo, LEN). Some days may have 0–1 items; the section says so rather than padding.
- **Catalog source**: traderjoes.com blocks non-browser requests (403). Catalog comes from **Open Food Facts** (open data, ~5,690 Trader Joe's records, crowd-sourced photos of real packaging). Coverage/quality numbers reported after import; "listed in catalog" ≠ "stocked at City Point". No prices, no availability.
- **Scheduling**: GitHub Actions cron may be delayed at busy times and is disabled after 60 days without repo activity (daily edition commits are expected to count as activity, but this is not documented; the app's freshness label and a re-enable note cover the gap). No background refresh on iPhone: the edition is fetched when the app opens.

---

## Product specification

### Screens (persistent bottom tabs: Home · To Do · Groceries · Library; Settings via header gear)

**Home / Morning** — masthead ("Brooklyn Morning", weekday + date, freshness pill "Prepared 5:52 AM" / "From yesterday"), reading-time estimate. Sections in ranked order: AI & Data, World & France, Politics & Finance (plain-language), Water polo, Soccer, then **Today's lesson**. Story card: headline, publisher, relative + absolute date, "From publisher" excerpt, expand → "Opening of the article" (extracted lead paragraphs, when available), optional glossary chips, "Background" badge if >48h old, Save-to-Library, opens link in Safari. Lesson card: week theme + day n/7, explanation → example → collapsible exercise with reveal. Manual refresh (bounded, re-fetches edition.json only). Length slider in Settings (stories per section). Archive of past 14 editions.

**To Do** — quick-add bar pinned above the keyboard, Enter adds and keeps focus for rapid entry, new tasks land in Inbox unless a category chip is selected. Category sections (collapsible), star sorts to top, tap task → sheet for text/notes/category/star/delete. Swipe or checkbox completes → moves to compact Completed strip with Undo; auto-removed 12 h after `completedAt`, reconciled on every app resume/visibility change, not only by timer. Manage categories: add, rename, drag-reorder, remove with mandatory "move tasks to …" picker. Add-category available from the assign sheet too.

**Groceries** — three explicit states: (1) first use: empty list area, search + "Add other item" visible, nothing else; (2) list has ≥1 entry (catalog or Other): list grouped by section with qty stepper, check-off removes with Undo; Buy again / Discover hidden; (3) list completely empty and history exists: Buy again (ranked by frequency, recency, confirmed purchases) then Discover (≤3 never-added catalog products, matched by section/category tags and name tokens from history; dismissable; omitted if no candidates). Search: local index over catalog (name, size), thumbnails with neutral placeholder fallback, "On list" badge, tap adds (repeat tap increments qty). "Add other item" always one tap away, including inside empty search results. History records `added` and `purchased` events separately; hide item / clear history in Settings.

**Library** — saved stories and lessons (one tap from Home), own entries (title, URL optional, note), tags (Business idea, Travel, Learning, Read later + custom), search, offline.

**Settings** — interests & sources toggles, reading length, backup/restore, category management, grocery history, catalog status (version, count, last update, retry), about/licences.

### Visual direction — Brooklyn Morning
- Tokens: ivory `#F7F1E6` bg, espresso `#2B1D16` text, terracotta `#C0623B` accent, sage `#8A9A7B` detail, paper cards `#FFFBF3`, ink-muted `#6B5B52`. Contrast checked ≥ 4.5:1 for text.
- Type: **Fraunces** (headlines, OFL) + **Inter** (UI, OFL), self-hosted via `@fontsource`. Scale 12/14/16/18/22/28/36, 8-pt spacing.
- Icons: **Lucide** (ISC). App icon: terracotta coffee ring on ivory with an "M" monogram, generated as SVG → PNG set (180/192/512, maskable).
- Motion: 150–250 ms ease-out, `prefers-reduced-motion` respected. Safe areas via `env(safe-area-inset-*)`, `100dvh`, keyboard-aware quick-add.

---

## Architecture (one recommended path)

| Layer | Choice | Why zero cost |
|---|---|---|
| App | Vite + Preact + TypeScript, `vite-plugin-pwa` (Workbox) | Free OSS; static files |
| Storage | IndexedDB via `idb`; separate databases: `personal` (tasks, categories, list, history, library, prefs, lesson progress) and `catalog` (products) | On-device; catalog isolated from personal data |
| Hosting | GitHub Pages from public repo `paolo/brooklyn-morning` (name TBD) → `https://<user>.github.io/<repo>/` | Pages free on public repos |
| Morning build | GitHub Actions cron → Node script fetches RSS, ranks, writes `public/data/edition.json` + `public/data/editions/YYYY-MM-DD.json`, commits, deploys | Actions free on public repos; no payment method ⇒ blocked, never billed |
| Catalog build | Node script (run by me now, re-runnable by workflow_dispatch monthly) pulls Open Food Facts → validates → `public/data/catalog.json` + `catalog.meta.json` (version, count, checksum) | OFF API free, no key; polite rate limit + UA |
| Images | OFF image URLs hotlinked at runtime, cached by service worker; placeholder on error; attribution in Settings (CC BY-SA) | No image hosting |
| Fonts/icons | Fontsource, Lucide, bundled | OFL / ISC |

Why nothing here can bill: GitHub Free with no payment method blocks when quota is exhausted (verified in docs); public repos have unlimited standard Actions minutes and free Pages. Open Food Facts is a non-profit open database with no paid tier. No other services.

### Edition pipeline details
- Cron at `50 9 * * *` and `50 10 * * *` UTC (= 5:50 EDT / 5:50 EST respectively); script computes NY date, exits if today's edition exists ⇒ DST handled, no duplicates. Third run `20 12 * * *` UTC as bounded retry. `workflow_dispatch` for manual runs.
- Per-feed timeout 15 s, 2 retries, partial success allowed; a feed failure is recorded in `edition.json.sources[]` and shown as "Source unavailable today".
- Ranking: interest weight × source weight × recency decay; club/competition keyword boosts (OM/Marseille, Real Madrid, Man United, Ligue 1, Champions League, Les Bleus); penalties for match-report patterns (`\d+-\d+`, "player ratings", "live", "as it happened"); title/URL dedupe; `state/seen.json` (14-day) prevents repeats unless a new URL.
- Story fields: `title, publisher, url, publishedAt, excerpt (publisher, stripped, ≤300 chars), excerptSource: "rss", lead (first 2–3 paragraphs via @mozilla/readability, ≤700 chars, null if fetch blocked/paywalled/failed), leadSource: "extracted", topic, isBackground, glossaryTerms[]`. Article fetches: ≤20 per edition, 10 s timeout, 1 retry, only for allow-listed non-paywalled publishers.
- Client: on open, fetch `edition.json` with `If-None-Match`; if network fails, show last cached edition with its real date and a "Couldn't refresh" line; manual Refresh limited to once per 10 min.

### Lessons
- `public/data/lessons/week-01..08.json` (7 each) + `lessons.index.json`, authored during development, served from the site and cached by the app. Rotation: **W1 Stock market I** (what a stock is, exchanges, indices, why prices move) · W2 History turning points · **W3 Stock market II** (ETFs vs funds, dividends, valuation basics, reading financial news) · W4 How AI actually works, no code · W5 Geography · W6 Cooking fundamentals · W7 Data literacy (averages that lie, correlation, sampling, reading charts) · W8 Everyday economics (inflation, interest rates, taxes basics). Educational only, never investment advice.
- Progress: `lessonProgress { startMonday, weekIndex, readDays[] }`. Week begins Monday of install week; missed days readable in an archive. **Continuation**: on each edition fetch the app reads `lessons.index.json` and downloads any new week packs; new packs pushed to the repo later appear with no action from Paolo. If no unread pack exists: **"Review week"** label, clearly marked, never presented as new. Manual JSON import stays as an optional path. Schema + template in `public/data/lessons/README.md`.

### Data safety
- Every write is a single IDB transaction; catalog replaced only after full validation (`count ≥ 0.8 × previous`, checksum, schema) and swapped via versioned store name.
- Saved list rows store `name, size, imageUrl, section` copies so a vanished product still renders.
- Backup: one JSON (`schemaVersion, exportedAt, tasks, categories, list, history, library, prefs, lessonProgress, dismissedSuggestions`), shared via Web Share API / download; restore validates and asks before replacing. Round-trip test asserts category assignments, `completedAt`, history, lesson progress.
- Dev fixtures live under `fixtures/` and load only with `?fixtures=1` on localhost.
- `about-me.md` and anything personal in `.gitignore`; repo holds code, interest config, lessons, glossary, catalog.

---

## Implementation phases

0. **Scaffold & records** (repo, Vite/Preact/TS, PWA plugin, `CLAUDE.md`, `SPEC.md` (this spec), `STATUS.md`, `.gitignore`).
1. **Design system + shell + visual preview**: tokens, fonts, tab bar, all four screens with representative static content → **screenshots to Paolo for feedback before polishing**.
2. **To Do**: IDB layer, quick-add, categories CRUD with safe removal, completion/undo/12-h reconciliation, backup/restore.
3. **Groceries**: `scripts/build-catalog.mjs` (OFF import → validated catalog + report of counts/images), client search index, list/history/buy-again/discovery rules, failure paths (missing catalog, corrupt catalog, broken images, offline).
4. **Morning**: `scripts/build-edition.mjs`, feeds config, ranking, glossary (~40 finance/politics terms), Actions workflow, client rendering, lessons (56) + progression + import.
5. **Library + Settings**, app icon, install experience (manifest, splash, status-bar style).
6. **Verification & deploy**: Playwright at 375/393/430 px iPhone viewports (screens, empty/error/offline states, failure-path tests), unit tests for ranking/cleanup/discovery rules, deploy to Pages, trigger and confirm a real scheduled run, write install guide.

## Verification
- **Automated**: Vitest unit tests (12-h cleanup reconciliation, category removal migration, buy-again ranking, discovery exclusions, edition ranking/dedupe, catalog validator rejecting malformed/partial input, backup round-trip). Playwright: quick-add rapid entry, category rename/reorder/remove, grocery three-state rule incl. Other-only list, offline reload, corrupt-catalog startup, broken-image fallback, screenshots of every screen and state.
- **Deployed**: confirm `edition.json` regenerates at the scheduled time on GitHub; confirm Pages serves SW + manifest; Lighthouse PWA installability.
- **Needs Paolo's phone**: Add to Home Screen, keyboard behavior with the real iOS keyboard, share-sheet export to Files, large-text setting. I'll give a checklist.

## Setup needing Paolo (no payment info ever)
1. Create an empty public repo on GitHub and share its URL.
2. Enable Pages (Settings → Pages → Source: GitHub Actions) — I'll give the click path.
3. Install on iPhone: open the URL in Safari → Share → Add to Home Screen.
