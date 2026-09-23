# STATUS — Brooklyn Morning

Continuation file. Read this first when resuming. Spec: `SPEC.md`. Rules: `CLAUDE.md`.

## Decisions (locked)
- Zero additional cost; GitHub Pages + Actions (public repo), Open Food Facts catalog, public RSS. No runtime AI.
- iPhone-only PWA, light theme "Brooklyn Morning" (ivory/espresso/terracotta/sage), Fraunces + Inter, Lucide icons.
- Topic order: AI & Data → World/US/France → Politics & Finance (plain-language + glossary) → Water polo → Soccer.
- Stories = headline + publisher excerpt + optional extracted opening + link. No full articles, no rewriting.
- Lessons: weekly themes Mon–Sun, no code, stock market priority (weeks 1 and 3). 8 weeks at launch; new packs auto-download via `lessons.index.json`; "Review week" when none new.
- To Do categories: Inbox, SFC Institutional Research, LIU Water Polo, MS Coursework, Business Ideas, Personal. Priority star + notes only.
- Groceries: three-state rule, check-off removes with undo, Buy again + ≤3 Discover suggestions, City Point store.
- No notifications, no cloud sync. Manual JSON backup + banner after 14 days.

## Completed
- Discovery (4 rounds) and plan approval — 2026-09-19.
- Feed verification: 28/34 feeds OK (list in `scripts/feeds.config.mjs` once written).
- Open Food Facts search endpoint verified: `search.openfoodfacts.org/search?q=brands_tags:trader-joe-s` → ~5,690 records.
- Phase 0 scaffold: package.json, deps, tsconfig, vite config (PWA manifest + caching), index.html, .gitignore, CLAUDE.md, SPEC.md, STATUS.md.

- Phase 1 (2026-09-19): design tokens (`src/styles/tokens.css`), shell (hash router, tab bar, toast), Home/To Do/Groceries/Library/Settings screens rendering preview fixtures (`fixtures/preview.ts`, real feed snapshot in `fixtures/sample-stories.json`). Screenshot helper: `node scripts/shots.mjs` (dev server on :5173). Screenshots sent to Paolo for design feedback.

- Design feedback (2026-09-19): quick-add stays at top, dark lesson card stays.
- Phase 2 (2026-09-19): `personal` IndexedDB (`src/db/personal.ts`, stores tasks/categories/list/history/library/kv), task repo + pure rules (`src/lib/tasks.ts`), reactive store (`src/state/`), wired To Do screen with edit sheet, categories manager (add/rename/move up-down/remove with mandatory move picker), completion + Undo toast, 12-h purge on load/resume/visibility/5-min interval. Backup export (share sheet → download fallback) and validated atomic restore in Settings; 14-day reminder banner. Tests: 14 Vitest, 4 Playwright specs × 3 viewports.
- Deviation to note: category reorder uses up/down arrows instead of drag handles (reliable on iOS Safari, no library). Drag can be added later if wanted.

- Phase 3 (2026-09-20): `scripts/build-catalog.mjs` imports Open Food Facts → `public/data/catalog.json` (+ `.meta.json` with sha256, report in `state/catalog-report.json`). Result: 5,690 raw → 4,077 kept (1,089 non-US/German "Trader Joe's"-brand Aldi records and non-English names dropped, 422 dupes merged); 79% have photos, 41% sizes, 13% land in "Other". Section rules shared in `scripts/lib/sections.mjs`. Client: `brooklyn-catalog` IndexedDB with validated atomic swap (checksum, schema, ≥80% of previous count), search index, list/history repo, three-state screen, Buy again ranking, ≤3 Discover suggestions with reasons + dismiss, Other-item sheet, Settings: catalog status/retry, history hide/clear. Tests: 23 Vitest, 11 Playwright specs × 3 viewports (incl. corrupt catalog, truncated catalog, broken images, offline).

- Phase 4 (2026-09-20): `scripts/feeds.config.mjs` (27 feeds, all verified working), `scripts/lib/rank.mjs` (scoring, boosts, match-report penalty, dedupe, per-topic selection with publisher cap 2 and ≤50% French), `scripts/build-edition.mjs` (15 s/2 retries per feed, ≤20 lead extractions via Readability from allow-listed publishers, seen-state 14 d, archive 14 editions). `public/data/glossary.json` (44 terms). Client: edition store with IndexedDB cache + archive + 10-min manual throttle; glossary sheet; lesson store with auto pack download, Mon–Sun progression, Review-week label, optional import. 56 lessons in `scripts/lessons/week-0N.mjs` → `public/data/lessons/` via `scripts/build-lessons.mjs`. Library wired (save/edit/tags/search). Workflows: `deploy.yml`, `edition.yml` (09:50/10:50/12:20 UTC + dispatch), `catalog.yml` (monthly).
- Phase 5 (2026-09-20): Settings complete (stories per topic, topic toggles, lessons status + import, backup, categories, catalog, history, licences). App icon set via `scripts/make-icons.mjs`. Production build verified: SW registers, manifest OK, offline reload serves shell + cached edition.
- Tests: 37 Vitest, 15 Playwright specs × 3 viewports = 45 passing.

- Favorites (2026-09-20, Paolo's request): star button on search results, list rows, and Buy-again cards; Favorites grid on the Groceries screen; `favorites` store (personal DB v2); included in backup (optional field, old backups still valid). e2e + unit tests added.
- Pushed to https://github.com/paolomorliere/brooklyn-morning (2026-09-20). First deploy failed only because Pages was not yet set to "GitHub Actions"; Paolo enabled it.

- Deployed 2026-09-20 to https://paolomorliere.github.io/brooklyn-morning/ — manifest, SW, edition, catalog, lessons all served; smoke test passed. Tests: 38 Vitest, 48 Playwright.

- Round 2 (2026-09-20, Paolo's feedback): daily quote (120 curated, `public/data/quotes.json`); slot rules (1 politics + 1 finance + 1 markets; ≥1 France; NCAA first, east then west) + subject diversity in the top 3 + cross-topic dedupe + publisher/language caps; new feeds (CNBC Markets/Finance, MarketWatch, Guardian markets, NPR Economy, CWPA, LIU m/w, Harvard, Navy, Fordham, UCSD; school feeds gated on "water polo"); story thumbnails from feed media/og:image (84 px, hidden on error); "Stock in focus" rules-based S&P 100 screen via Yahoo chart endpoint (Mon–Fri pick, Sat–Sun scoreboard from open on pick day; log in `state/stocks.json`; labeled not a recommendation); lessons start on the first Monday on/after install (epoch 2026-09-21), placeholder before; Sunday quiz (20 MCQ × 8 weeks, shuffled, `#/quiz` screen, scores stored); To Do priority filter; groceries: fuzzy head-noun search, catalog 4,401 products incl. Giotto's/José's/Ming's/Jacques', seafood/beverage aisle fixes, product detail screen `#/product/:id` (OFF live data cached 30 d, Open Prices when present, labeled aisle estimate), tap = details / + = add, steppers in search results, Favorites → Discover → Buy again always visible with dividers, per-item hide/delete history.
- Tests: 44 Vitest, 60 Playwright (20 specs × 3 viewports).

## In progress
- Phase 6: confirm the first *scheduled* edition run (cron 09:50 UTC = 5:50 AM EDT on 2026-09-21); Paolo installs on iPhone and runs the checklist in README.

## Remaining
- Phase 2 To Do · Phase 3 Groceries + catalog script · Phase 4 Morning pipeline + 56 lessons + workflow · Phase 5 Library/Settings/icon · Phase 6 tests, deploy, install guide, final report.

## Scheduling (resolved 2026-09-22)
- Observed: GitHub starts this repo's scheduled runs **3.5–6 h after the cron slot**, every day so far. Workflow state is `active`; repo is public and not a fork; this is GitHub's best-effort scheduling, not a config error.
- 09-20: three runs fired late and failed at "Commit data" (`git add state/stocks.json` with no such file on a weekend). Fixed with `git add state` + rebase before push.
- 09-21: three runs fired late and correctly did nothing (that day's edition had been built by hand), so nothing deployed. Paolo saw no update.
- 09-22 fix: cron `5,35 4-12 * * *` (18 slots from 00:05 NY), dependency-free pre-check `scripts/edition-needed.mjs` (build / refresh / skip) so idle slots cost ~10 s, and `--refresh` mode that rebuilds today's edition in place (same date, quote and stock pick) when it is >2.5 h old between 04:00 and 09:00 NY. `workflow_dispatch` now takes auto/refresh/force.
- If this still fails for several days, the next option to propose (needs Paolo's approval, verify terms first) is an external free cron (e.g. Cloudflare Workers cron trigger calling `workflow_dispatch` with a PAT stored as a Worker secret). Not implemented.

## Blockers / needs Paolo
- Empty public GitHub repo URL (no `gh` CLI installed; push via plain git after Paolo authenticates).
- Enable Pages: repo Settings → Pages → Source: GitHub Actions.

## Known limitations (agreed)
- traderjoes.com blocks scripts (403) → catalog from Open Food Facts; "listed" ≠ "stocked at City Point"; no prices.
- Water polo feeds are thin (3 sources); section says so on empty days.
- Actions cron can be delayed; scheduled workflows pause after 60 days of repo inactivity (daily commits should count; re-enable note in install guide).
- No background refresh on iPhone; edition fetched on open.

## Water polo screen (2026-09-23)
Fifth tab: NCAA men's water polo results, 2026 season only, 13 watched teams.

- **Sources**: all 13 schools run Sidearm Sports in one of two generations — `classic` (LIU, Harvard, MIT, Iona, Wagner, Fordham, Navy, Mount St. Mary's) and `nextgen` (Princeton, Brown, Bucknell, Air Force, GW). Both server-render the whole season and accept a season-pinned URL. Two adapters in `scripts/lib/polo-parse.mjs`, registry in `scripts/waterpolo.config.mjs`. No API, no key, no browser automation. Wagner's sport slug is `mens-polo`, not `mens-water-polo`.
- **Season trap found and handled**: the classic season `<select option[data-current="1"]>` reports the program's current season, not the season on the page — `/schedule/2019` serves 2019 games while still saying 2026. Season is validated from the title/H1/`og:title` year, falling back to the game-date window (LIU's title names neither season nor sport; its `og:title` does).
- **Identity**: `sha1(season | sorted team pair | date | slot)`, slot assigned by start time within a (date, pair) bucket. Never includes the score, so corrections update in place; same-day rematches stay separate. Verified idempotent — three consecutive builds produce byte-identical games.
- **Conflict found in real data**: GW lists its 2026-09-04 game against Princeton as 11-23; Princeton lists 23-12. Princeton's official recap states "Princeton 23, George Washington 12", recorded in `RESOLUTIONS` with the link. Without such evidence the score would be withheld, not guessed.
- **Team identity bug fixed during the build**: California Baptist appeared under three slugs and UCSB under a long one. `teamSlug` now tries progressively simpler spellings against the alias table and only accepts a shortened form if it matches a known team, so two different schools can never be merged. Mount St. Mary's vs Saint Mary's College of California is guarded explicitly and unit-tested.
- **Backfill**: 112 unique games, 2026-08-28 to 2026-09-20, from 144 raw rows across 13 pages (31 games confirmed by two schools). 43 teams, all with logos (190 KB in `public/logos/`, precached). 1 exhibition (Brown v Pacific, flagged in the details sheet).
- **Schedule**: `.github/workflows/waterpolo.yml`, cron `0 13,14,18,19 * * 6,0` and `30 15,16,20,21 * * 6,0` (the four NY times under both DST offsets); `scripts/polo-due.mjs` claims the most recent slot at or before the real New York time and records it in `state/waterpolo-runs.json`, giving exactly four checks per weekend day and none on weekdays. Delay-tolerant by design.
- **Storage**: `kv` key `waterpolo:feed`. No IndexedDB version bump, not in the backup file — it is re-downloadable, like editions and lessons.
- **Layout**: `devices['iPhone SE']` in Playwright is **320 px**, not 375 as assumed earlier. The row was retuned for it; names clamp at three lines so nothing clips at 320/390/430.
- Tests: 129 Vitest (was 49), 102 Playwright across 3 viewports (was 63).

### Decisions Paolo made
- Exhibitions included, marked in the details sheet (not hidden).
- Logos downloaded into the repo rather than hotlinked — they are trademarks used only to identify teams; say the word to switch to initials-only.
- Keep the four requested slots and accept GitHub's delay, plus a manual refresh button on the screen (which re-reads the published file only, never the schools).

### Known limits
- GitHub's best-effort cron delay (3.5–6 h here) shifts when weekend checks actually run. No $0 fix; every run reconciles all 13 full schedules so nothing is lost, only timing.
- Coverage is what the 13 official pages publish. A game between two non-watched teams is out of scope by design.
- Pinned to 2026. It will not roll forward to 2027 on its own — `SEASON`, `SEASON_START`, `SEASON_END` and the 13 URLs in `scripts/waterpolo.config.mjs` are a deliberate edit.
- Bug found after the first real workflow run: `polo-due.mjs`'s entry-point check compared `import.meta.url` with an unencoded `file://${process.argv[1]}`, so on a path containing a space (this project's own path) the script ran and printed nothing. It worked on the GitHub runner by luck. Fixed with `pathToFileURL`; a subprocess test now covers it.
- Verified on GitHub 2026-09-23: manual `workflow_dispatch` (force) ran the whole path on a clean checkout — 13/13 sources read, 112 games, 0 added, logos already present, committed, and `deploy.yml` published it. Run 35817169785.
