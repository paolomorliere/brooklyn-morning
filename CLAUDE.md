# Brooklyn Morning — project instructions

Personal iPhone PWA for Paolo: morning edition (news + one daily lesson), fast to-do capture, Trader Joe's grocery list, Library. Full approved spec: `SPEC.md`. Progress and continuation point: `STATUS.md` — update it at the end of every work session.

## Hard rules (never relax)
- **Zero additional cost.** Only free, non-metered services: GitHub Pages + Actions on a public repo, Open Food Facts, public RSS feeds, OSS packages. No paid/metered AI APIs at build or run time, no free trials, no billing-enabled infrastructure. If a free service stops, keep data and fall back to cache — never route around it with a paid one.
- **Privacy.** `about-me.md` and any personal file must never be committed or deployed (`.gitignore` covers it). No employer or student records. Personal data lives only in the browser's IndexedDB (`personal` DB). Dev fixtures under `fixtures/` load only with `?fixtures=1` on localhost.
- **No advertising, tracking, analytics, affiliate links, or monetization.**
- **News honesty.** Never fabricate stories, quotes, or links. Publisher excerpts are labeled "From publisher"; build-time extracted lead paragraphs are labeled "Opening of the article"; the app never rewrites or claims to have read an article. No paywall circumvention. Freshness labels always show the edition's real date.
- **Never silently weaken a feature.** If something can't be done at zero cost, say so and record it in `STATUS.md`.

## Stack
Vite + Preact + TypeScript · `vite-plugin-pwa` (Workbox) · IndexedDB via `idb` (separate `personal` and `catalog` databases) · Vitest (+ fake-indexeddb, jsdom) · Playwright (iPhone viewports 375/393/430) · Node scripts in `scripts/` (edition build, catalog build, icons) · GitHub Actions cron for the daily edition.

## Layout
- `src/` app code (`ui/` components, `screens/`, `db/`, `lib/` pure logic, `styles/`)
- `public/data/` edition, editions archive, lessons, glossary, catalog (generated + authored data)
- `scripts/` Node build scripts · `tests/` Vitest · `e2e/` Playwright · `fixtures/` dev fixtures
- `state/` build-time state (seen URLs)

## Conventions
- Pure logic (ranking, cleanup, discovery rules, validators) lives in `src/lib/` and is unit-tested.
- Every IndexedDB write is one transaction; catalog is validated before replacing the previous one.
- Copy for the UI is plain English, concise. Labels must not overstate ("Prepared 5:52 AM", "From yesterday", "Source unavailable today").
- Commit messages: short imperative subject; no personal info.

## Commands
`npm run dev` · `npm run build` · `npm test` · `npm run e2e` · `npm run build:edition` · `npm run build:catalog` · `npm run icons`
