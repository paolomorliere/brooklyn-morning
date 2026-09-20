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

## In progress
- Phase 6: confirm the first *scheduled* edition run (cron 09:50 UTC = 5:50 AM EDT on 2026-09-21); Paolo installs on iPhone and runs the checklist in README.

## Remaining
- Phase 2 To Do · Phase 3 Groceries + catalog script · Phase 4 Morning pipeline + 56 lessons + workflow · Phase 5 Library/Settings/icon · Phase 6 tests, deploy, install guide, final report.

## Blockers / needs Paolo
- Empty public GitHub repo URL (no `gh` CLI installed; push via plain git after Paolo authenticates).
- Enable Pages: repo Settings → Pages → Source: GitHub Actions.

## Known limitations (agreed)
- traderjoes.com blocks scripts (403) → catalog from Open Food Facts; "listed" ≠ "stocked at City Point"; no prices.
- Water polo feeds are thin (3 sources); section says so on empty days.
- Actions cron can be delayed; scheduled workflows pause after 60 days of repo inactivity (daily commits should count; re-enable note in install guide).
- No background refresh on iPhone; edition fetched on open.
