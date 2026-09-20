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

## In progress
- Phase 4: Morning — `scripts/build-edition.mjs`, feeds config, ranking, glossary, Actions workflow, client rendering + edition cache, 56 lessons + progression + auto pack download.

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
