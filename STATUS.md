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

## Fixes round (2026-09-27)
Seven reported problems, each traced to a cause and fixed there rather than papered over.

### The three that hid existing content
- **No Sunday quiz.** The eight lesson packs were first published on 19 September *without* quizzes; the quizzes were added on the 20th. `lessonActions.sync()` skipped any week it already held, so the phone kept the quiz-less copy for good and no amount of syncing could fix it. Packs now carry a content `version` (sha1 of the pack), the index carries it too, and a changed version re-downloads. `build-lessons.mjs` now **fails** if a week has no quiz, and a quiz must be exactly 20 questions. A Sunday whose stored pack has no quiz says so and offers "Check for it now" instead of silently omitting it. Lesson text itself never changed, so nothing was lost.
- **Past editions had no lesson.** The lesson section was rendered only when `viewingDate` was null — archived editions simply omitted it, and `Edition.lessonRef` existed in the type but was never written. An archived date now resolves through the fixed date→week/day mapping, and the resolved `{lessonId, packVersion}` is pinned into the stored edition the first time it is read, so a later content edit cannot rewrite what an old edition contained. A Sunday archive links to that week's quiz and to all seven lessons.
- **Library opened the editor.** `LibraryEntry` held only metadata and the row tap called `setEditing`. Entries now carry a `ref` (and a `snapshot` for stories); tapping reads at `#/read/:id` and Edit is its own action. A one-time additive repair resolves existing entries — lessons by title, falling back to the "Week N · Day D" note; stories by URL against the stored editions — and marks what it cannot recover with the reason and the original link. Nothing is deleted, renamed or recreated.

### Water polo
- **Concordia duplicate.** Harvard prints "Concordia" where every other school prints "Concordia Irvine"; no alias covered the bare form, so one game arrived as two. Both names link to **cuigoldeneagles.com**, which is what settles it. New `scripts/lib/polo-identity.mjs` merges two identities only when they share a verified athletics hostname **and** one printed name is the start of the other — so the real mislinks in this data (`uc-santa-barbara` → gostanford.com, `uc-san-diego` → usdtoreros.com) are correctly left alone. Applied before any game is bucketed, matched or de-duplicated, and `repairIdentities()` rewrites what was already published, collapsing duplicates only inside buckets the rewrite touched. `pomona-pitzer-colleges` was the same class of bug (a trailing plural "Colleges" was not trimmed) and is fixed in the alias table. The Concordia/Harvard game is a regression test.
- **Manual refresh.** The old watcher lived in memory, so leaving the screen lost it, and it had no success, failure or timestamp. The state now lives in `kv` and survives navigation and restarts. Queued / running / failed come from GitHub's **public, unauthenticated, CORS-enabled** runs API (60 requests an hour, no key, no account, cannot bill); success comes only from the published file being downloaded, validated, saved and displayed. Distinguishes "new results or schedule changes found" from "no changes found", never reports all 13 schools when only some were read, keeps the last successful completion time in New York on screen, offers Retry, and cannot start a second overlapping watch. Cache-busted reads are `NetworkOnly` in the service worker so a refresh can never show a stale copy.
- **Fixtures.** The parser dropped every row without a score. It now emits `scheduled` / `postponed` / `cancelled` rows too, and a game is one event that changes `status` — the same id before and after it is played, so a final moves it out of Upcoming and into Results without duplication. "This weekend" is Friday–Sunday of the current Mon–Sun New York week and rolls over by itself. An elapsed start time reads "Awaiting result" and is never treated as a result. Team pages gained a Results / Schedule switch.
- **Time zones.** A start time is converted to ET only where a source makes the zone certain — the host school's own zone for a home game, or the venue's state where that state has a single zone. Otherwise the printed time is labelled "local", and no time at all reads "Time TBD". Air Force is Mountain, not Eastern.
- **Bracket placeholders.** Reading fixtures surfaced "MAWPC Championships", "NCAA Opening Round" and the like as teams; `NON_TEAM_PATTERNS` now covers championships, tournaments, conferences, rounds and semifinals.
- **Feed size.** 752 games would have been 689 KB. Null/false/zero fields and a source reading that merely repeats the result are left out, taking it to 540 KB; `conflict` and `hosted` stay explicit because their null is a statement.

### Found while fixing
- `lessonForDate` used the device's local date, so opening the app abroad could move Sunday. Week boundaries are now decided in America/New_York throughout.
- The quiz screen reset its answers whenever the derived week changed, which on first render happens once — an answer tapped in that window was discarded. It now loads a week exactly once.
- Lesson packs were fetched one after another with no retry; they are now fetched together with one retry each, which also made the first open markedly faster.
- Editing a Library entry before its packs had downloaded left it with no content reference; `update()` now retries the resolution.

### Tests
265 Vitest (was 242) · 279 Playwright across 320/390/430 (was 183). New: `tests/lessons-week.test.ts`, `tests/library-repair.test.ts`, `tests/polo-identity.test.ts`, `tests/polo-fixtures.test.ts`, `e2e/lessons.spec.ts`, `e2e/library.spec.ts`, `e2e/fixtures.spec.ts`.

### Verified on the deployed app (2026-09-27)
`npm run e2e:deployed` runs `e2e/deployed.spec.ts` against GitHub Pages; four checks, all passing:
the Concordia/Harvard game is one row named "Concordia Irvine"; **This weekend** and
**Refresh scores & fixtures** are on the Water Polo screen; a team page switches to Schedule with
real start times; the CWPA Top 20 shows Week 4's 25 rows with every crest. Sunday's lesson card
ends with **Take this week's quiz — 20 questions**. Deploy run 36337109181.

The round-2 poll pipeline is now confirmed in production too: `poll.yml` ran on Wednesday 23
September and saved **Week 4** by itself.

### Known limits
- Four junior-college opponents of opponents have no crest and show initials.
- The published feed is 540 KB and the precache 974 KB. Both are fetched once and cached; the feed re-downloads only when its build changes.
- GitHub's unauthenticated API allows 60 requests an hour. A manual watch uses about 24. If it is ever rate-limited the watcher falls back to watching the published file, which is what decides success anyway.

## Water polo round 2 (2026-09-23)
Team screens, conference tables, the CWPA national poll, a manual check, and a wider schedule. The round-1 screen below is unchanged in what it claims; everything here is added on top of it.

- **Manual check.** "Check sources now" opens `actions/workflows/waterpolo.yml` in Safari, where one tap on GitHub's Run workflow button starts the real job; the screen then polls the published file every 20 s for up to 12 min and reports *waiting* → *updated, N new* / *nothing new* / *partial* / *may still be going*. One watcher at a time, 30 s cooldown with the seconds shown, filters and scroll untouched. **No token is in the app.** Nothing reachable from the phone is CORS-enabled (verified on brownbears.com, navysports.com and collegiatewaterpolo.org), so all ingestion stays in Actions and a true one-tap refresh would need a server — which the $0 rule rules out.
- **Schedule widened** (explicitly replacing the old no-weekday-checks rule): Sat 09:00/11:30/14:00/16:30, Sun the same plus 22:00, Mon 09:00, New York. Crons `0 13,14,18,19 * * 6,0`, `30 15,16,20,21 * * 6,0`, `0 2,3,13,14 * * 1`. `polo-due.mjs` now has an **eight-hour look-back**: the Sunday 22:00 check is requested by a Monday 02:00 UTC cron, and GitHub's 3.5-6 h delay would push it past midnight in New York onto a day whose only slot is 09:00 — the check would have been silently dropped precisely when delayed. Covered by a test.
- **Conference classification** (`scripts/lib/polo-conference.mjs`). Both CWPA conference schedules are parsed each run; a game is marked `conference` only when that exact (date, pair) fixture is listed. 42 MAWPC + 30 NWPC fixtures read with zero unexplained rows; 7 played so far (6 MAWPC, 1 NWPC) and all 7 classify. The championship bracket on the same page is deliberately excluded. Sharing a conference is never enough — the school's own "CWPA" badge is stored as `conferenceMarker`, corroboration only. Ambiguous or doubly-claimed fixtures are dropped rather than guessed.
- **Standings** (pure, in `src/lib/polo.ts`): Pts/W/L/GD, three points a win, ties share a position, every official member gets a row, a genuine zero reads `0` and a team whose own page failed reads `—`. Labelled on screen as Paolo's own calculation, not the CWPA's. The CWPA's own table uses 2 points a win — deliberately not used.
- **Opponent seasons.** A second build pass fetches every opponent a watched school played (29 teams) so team screens show whole seasons; the feed grew 113 → 261 games, 60 teams. A school's opponent link is a hint, not a fact: one links "UC San Diego" to usdtoreros.com and another links "UC Santa Barbara" to gostanford.com. Every fetched page must pass the season and sport gates **and** list a game that team is already known to have played. 26 of 29 read.
- **CWPA poll** (`scripts/lib/poll-parse.mjs`, `build-poll.mjs`, `poll.yml`, `#/poll`). Week 3 imported: 22 rows, ties and RV kept verbatim, points copied. The national table is chosen by its own title row, so the Division III and two conference tables on the same page can never be mistaken for it. Wednesday 18:00 NY primary, Thursday 06:00 NY backup that skips only when `state/poll-runs.json` records a week that was actually **saved** — an HTTP 200 or re-finding last week's poll is not success. `supersedes()` refuses to replace a poll with an equal or older week, on both the build and the app side.
- **Parser bug fixed** (found while planning): the nextgen tournament chip and conference chip share `data-test-id="s-descriptor__text"`. Reading the first worked only because Sidearm happens to print the tournament first — Bucknell v Fordham carries both. Now scoped by the conference pill's own class.
- **Identity gaps closed** while the opponent pass widened the team list: accents folded (San José/San Jose State), an unbracketed `RV ` prefix and a trailing `(Exhib.)` stripped, and aliases added for Cal, Cal State Fullerton, Concordia Irvine, Pomona-Pitzer, Redlands, Wheaton, Austin College and the CWPA's own formal names and typos (`Forhdham Universtiy`, `Bucknell Universtiy`, …). The archive was rebuilt once from the sources so no game kept an old slug.
- **Row tap targets split**: the row is a container with two team-name buttons above a full-area "Game details" button. The score column needed `pointer-events: none` — it is positioned for the overtime marker and was swallowing taps on the middle of the row.
- Tests: **207 Vitest** (was 132), **183 Playwright** across 320/390/430 (was 102).

### Verified against reality (2026-09-23)
- Five records re-derived from the schools' own pages and compared with the app: Wagner 3-9, LIU 5-6, Navy 7-1, Brown 8-2, Fordham 9-0 — all exact.
- All 7 played conference games match the CWPA schedule; the MAWPC table (Fordham 9/+51, Navy 3/+1, Wagner 3/-3, Bucknell 3/-5) recomputes from them.
- The rendered Top 20 matches the published Week 3 article row by row, including `6 (T)`, `11 (T)`, both `RV` rows and Brown's `18 (T)` previous rank.
- E2E asserts no request leaves the app to any school or to collegiatewaterpolo.org.

### Known limits (round 2)
- The manual check needs one tap on GitHub's page. A true one-tap refresh needs a server holding a token.
- **UCLA** and **San Jose State** render their schedules client-side (no server-rendered rows, no free JSON endpoint found), and **Austin College**'s athletics host does not answer. Those three team screens say "from the results collected so far" and link the official site.
- Six genuine score disagreements between official pages surfaced once opponent pages were read (e.g. Iona says 11-31 v UC Davis, UC Davis says 29-11 — both verified by re-fetching). The watched school's verified number is shown with the disagreement on the record; a game neither side had verified is withheld.
- Conference classification depends on the CWPA publishing the fixture. An unlisted game stays unclassified rather than being guessed.
- GitHub's best-effort cron delay applies to the poll job too.
- **Not yet observed running.** `deploy.yml` ran on 8d65e91 and both files are live, but `poll.yml` has never run and `waterpolo.yml` last ran on the round-1 commit. There is no `gh` CLI or token in this environment, so the two ingestion jobs could not be triggered from here. Their next scheduled runs are Wednesday 18:00 NY (poll) and Saturday 09:00 NY (scores); either can be started immediately from the app — "Check sources now" for the results, "Check now" in the poll screen's awaiting notice — which is the same one-tap-on-GitHub mechanism the feature is built around.

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

## Manual refresh fix (2026-09-27, evening)

**Reported.** A manual refresh said *"Refresh complete — no changes found. All 13 scores were read and nothing has changed since the last check. 4:28 PM"* while Air Force's and Wagner's own pages already showed the result of their 27 September game. Three timestamps on the screen disagreed: *Checked 3:10 PM*, *Last successful refresh 4:28 PM*, and the banner's 4:28 PM.

**Cause — one, in the workflow.** `waterpolo.yml`'s `workflow_dispatch` had an input `mode` defaulting to **`auto`**, and `auto` fell through to `scripts/polo-due.mjs`, the guard whose only job is to stop the *cron* firing twice for one slot. Tapping **Run workflow** with the default therefore checked out the repo, found the 16:30 slot already claimed, and exited **successfully in ten seconds having read nothing**. GitHub's public run list confirms it: runs `36343961020`, `36347325276` and `36348119882` each lasted 9–13 s, against ~1 m 45 s for a real scheduled run. Reaching the collection step required changing a dropdown from `auto` to `force` — an undocumented click. The earlier verification (2026-09-23, run `35817169785`) had exercised `force`, never the default, which is how this shipped.

**Consequences in the app, each fixed at its own cause.**
- A completed run whose published file had not moved was reported as `unchanged` — *"all 13 schools were read"* — using the **previous** build's source list. It is now its own phase, `nothing`: *"The run finished without reading anything."* Not a success, no timestamp advanced, Retry offered.
- `lastSuccessAt` was written by any successful **download**, including the quiet one on resume. That is what put *"Last successful refresh 4:28 PM"* above data read at 3:10. It now moves only when `builtAt` actually advances.
- The two timestamps were both unlabelled as to what they timed. Above the button: *Scores read from the schools* (the data's age). Below it: *Your last refresh* (the attempt and its outcome). No third time.
- Closing the banner used to reset the refresh state, so the outcome vanished. `dismissed` now hides the message and keeps the one-line summary.
- `queued` with no run seen after a minute says so explicitly and names both taps, instead of spinning.
- A finished run is given a 90 s grace before it can be called "published nothing", so Pages lagging the green tick is not mistaken for a skipped job.

**Also fixed.** `poll.yml` had the identical `mode: auto` trap. A hand-started poll check now always reads the CWPA and, since no new week is expected of it, does not pass `--expect-new` and so cannot raise a false *"awaiting this week's poll"*.

**Not a bug.** The parser and merge were correct throughout: on the first real rebuild, Air Force 16–15 Wagner arrived as `final` under the game's existing id `376ab5ded00e`, moving it out of Upcoming and into Results once, with no duplicate. 318 → 324 results.

**Schedules untouched.** Both crons are byte-identical; a hand-started run claims no slot, so it cannot consume an automatic check. `tests/polo-refresh.test.ts` asserts all of this against the YAML, plus the absence of the `mode` input, so the trap cannot return.

## Deployment 1 — table alignment, fixtures, standings freshness, task reordering (2026-10-05)

Four reported problems plus a failed run, all fixed at their own cause.

**1. Conference table alignment.** `src/styles/waterpolo.css` set `.polo-table th { text-align: left }` at specificity (0,1,1) against `.polo-num { text-align: right }` at (0,1,0): the class lost regardless of source order, so **PTS / W / L / GD were left-aligned over right-aligned numbers**. Two compounding faults: no `table-layout: fixed`, so the stated widths were only hints the browser could ignore; and a `colSpan={4}` dash cell in `Standings.tsx` that genuinely spanned the four numeric columns and perturbed auto-layout widths for the whole table. Fixed with one shared column layout: `table-layout: fixed`, a `<colgroup>` in both tables (`.polo-col-*`, 7 columns for the standings and 5 for the poll, narrowed inside the existing 380 px media query), `th.polo-num { text-align: right }`, and four separate dash cells so every row has the same number of cells. The name column alone is left unsized, so it is the only one that changes width and long school names wrap instead of widening the table. `e2e/polo-table.spec.ts` measures it: every `th`'s box and computed `text-align` against every `td` beneath it, at 375/390/430.

**2. Upcoming fixtures only in the unfiltered view.** The section was gated on `ready && feed` alone. It is now `… && !filtered`, so the heading, count, range line and empty state disappear together under any team, conference or day filter and come back on Reset. A team's own fixtures remain on its team screen, under Schedule. Two adjacent bugs fixed while there: `weekendOf()` was memoised with empty deps, so a session left open across Sunday→Monday kept showing and labelling the finished weekend (it now follows a `today` value refreshed on resume); and the scroll-restore effect listed `feed` in its deps, so every background refresh yanked the page back to the stored offset.

**3. Standings that could show old results.** The table is derived from `feed.games` on every render, so nothing was cached — the staleness was in the data, two ways.
  - *The feed could roll backwards.* Any difference in `builtAt` was treated as a rebuild, including an older one, and the quiet hourly fetch is served by the service worker's NetworkFirst cache or a lagging Pages node. New `isNewerBuild()` in `src/lib/polo.ts` accepts only a strictly newer build; applied in both `waterPoloActions.refresh` and the watcher's `tick`, mirroring the guard `src/state/poll.ts` already had.
  - *Conference classification could silently lag.* A game counts only when the CWPA's own conference schedule lists it, so when a CWPA page fails the results list grows and the table does not. `feed.conference.sources[].ok/.checkedAt/.classified` existed in the type and were read nowhere. New `conferenceCoverageOf()` surfaces them: the table now states when its conference schedule was read, and says plainly when it could not be. A refresh whose CWPA sources failed now resolves as **`partial`**, never `success` — this is what satisfies "do not mark a manual refresh as fully completed while the displayed standings still reflect the old results".

**4. Press-and-hold task reordering.** `Task.order` already existed and already drove `sortOpen`; nothing was migrated and `PERSONAL_VERSION` stays at 2. **Starred tasks stay pinned on top** (Paolo's decision), so the list is two blocks and a task cannot cross the boundary — enforced in the pure layer (`moveTask`, `moveTaskBy`, `canMoveTask`, `renumberTasks` in `src/lib/tasks.ts`) and again in the gesture, so the gap on screen stops where the drop will. `saveTaskOrder` writes in one transaction and re-reads each row first, writing only `order`, so a task completed or edited while a finger is down is not clobbered. New `src/screens/todo/TaskList.tsx` holds the gesture: ~400 ms to arm, movement before that cancels and lets the page scroll, `setPointerCapture` once armed, a `touchmove` `preventDefault` (the only thing that reliably stops Safari scrolling a gesture it has already latched `touch-action` for), auto-scroll near the window edges, and exactly one swallowed click so a reorder cannot also complete, open or star the task it moved. No drag library and no drag handle — the whole row is the handle, so no row changed how it looks. **Move up / Move down** live in the task's own sheet, with the position stated ("2nd of 5 priority tasks"), which is the pointer-free route and the only place the gesture is explained.
  - *Restore hardening:* `order` was never validated, so a backup written before manual ordering existed restored `undefined`, `a.order - b.order` became `NaN`, and the comparator became inconsistent — the same list would come back in a different order on different reads. `repairTaskOrders` / `repairCategoryOrders` now fall back to creation time and renumber on the way in.

**5. The failed run — diagnosed, no code fault.** Run `37365182925` (Morning edition, 2026-10-05 19:42 UTC) carries GitHub's annotation *"The job was not acquired by Runner of type hosted even after multiple attempts"*: `runner_name` empty, zero steps executed, cancelled after 15 minutes. GitHub never allocated a runner. That day's edition had already built at 11:22 UTC, so nothing was lost, and the 18-slot cron is self-healing by design. The same run carried a dated warning that **`ubuntu-latest` migrates to Ubuntu 26 from 19 October**, so all six workflows are now pinned to `ubuntu-24.04` — both images are free on public repositories, so this costs nothing.

**Still true.** No new service, no key, no paid anything. Nothing was removed or weakened.

## Deployment 2 — "Stock in focus" rebuilt as a research process (2026-10-06)

Replaces the version 1 screen. **Version 1's last pick was NVDA on 2026-10-06**, published by the morning
cron shortly before this change landed; it stops picking from the next run. Its twelve published picks and
their cards are kept exactly as they were — verified byte-identical — and are read as `strategyVersion: 1`
because the field is absent from every historical file. Version 1 and version 2 are reported separately
and never combined into one figure.

### Why version 1 had to be replaced, not tuned
- It ranked **104 tickers chosen by hand**, so "the best stock today" could only mean "the best of the
  104 I typed in".
- The score was mostly `1.0 × z(5-day return)`. It stated **no holding period**, used **unadjusted
  closes**, compared itself to **no benchmark**, and had **no tests**.
- Its published −2.85% averaged five positions held 5, 4, 3, 2 and **1** sessions as if comparable. The
  figure reproduces exactly (independent recomputation −2.8483%) but is not a return. On a uniform
  five-session hold: n=6 completed, mean excess **−2.03%**, sd 4.14%, **t ≈ −1.20** — inconclusive.
- **Its price source was not ours to use.** Yahoo's robots.txt is `User-agent: * / Disallow: /`, the
  chart endpoint is undocumented, and version 2's universe would have taken it from ~104 requests a day
  to ~5,000. Removed, not scaled. `scripts/lib/stocks.mjs` keeps version 1's scoring functions for the
  record and no longer contains a network call.

### What version 2 is
Quality compounding, bought when the trend confirms it, at a price that is not indefensible — **one
position per session, held 21 sessions, a twenty-first of capital each**. Three stages, and the card says
which one decided it: eligibility (binary), comparison (equal-weighted z-scores within a sector group),
then thesis and risk. The frozen rules live in `scripts/strategy-v2.json` and are **hashed onto every
pick**, so a later rule change can never be presented as having made an earlier selection.

### New code, all unit-tested
`scripts/lib/universe.mjs` · `fundamentals.mjs` · `earnings.mjs` · `signals.mjs` · `portfolio.mjs` ·
`select.mjs` · `prices.mjs` · `sec.mjs` · `zip.mjs` · `strategy.mjs` · `scripts/build-stocks.mjs` ·
`scripts/backtest-stocks.mjs` · `.github/workflows/stocks.yml` · `e2e/stock.spec.ts`.
The edition build no longer fetches any price; it reads `public/data/stock.json`.

### Measured facts this round (not assumptions)
- Nasdaq Trader: **13,289 rows → 5,051** US common stocks. Largest exclusions: 5,758 funds, 1,524 not
  described as common or ordinary shares, 547 class/status-suffixed symbols, 316 flagged financial
  status. **5,042 resolve to a CIK.**
- SEC digests, twelve quarters: **2,083,579 facts for 6,802 companies, 27 MB committed.** Of the 5,021
  distinct universe CIKs, **2,663 (53.0%)** have a complete eight-quarter revenue series and are
  analysable; 1,156 do not, and 1,132 filed nothing with these tags in twelve quarters (20-F filers are
  not analysed). Three quarters of digests gave only 2.6% — the twelve-quarter window is what makes the
  set usable.
- Signals legitimately dropped among analysable companies: gross margin trend **53.5%**, cash conversion
  39.7%, gross profitability 32.0%, FCF yield 22.0%, operating margin trend 15.8%, earnings yield 4.7%.
  Each is recorded on the pick with its reason and the remaining weights renormalise. None is scored zero.
- `EntityCommonStockSharesOutstanding` is **not in the data sets at all** (only in `companyfacts`), and
  class-level share counts are filtered out as non-consolidated. Adding `CommonStockSharesIssued` and the
  weighted-average fallback cut missing market caps from **31.6% to 4.1%**.
- A confirmed **forward** earnings date is not obtainable free at scale. EDGAR full-text search found 19
  8-Ks market-wide in five weeks announcing a future results date. The next date is an **estimate**: the
  same fiscal quarter's announcement a year earlier plus 364 days. Verified end to end on Analog Devices:
  **2026-11-24 ± 6 days**, from 2025-11-25, on gaps of 85–97 days. The mean-gap rule gives 2026-11-18.

### Three bugs the live-data check caught
1. **A tag a company stopped using could win the preference order.** ADI reported `Revenues` until FY2018
   and ASC 606 contract revenue after; the old series is eight unbroken quarters long, so it was chosen,
   and every figure described a company eight years out of date. A chosen series must now be **current**
   as well as complete.
2. **A fiscal-year equality check blocked the fourth-quarter derivation.** `companyfacts` labels a fact
   with the fiscal year of the filing it appeared in, not of the period it covers, so a prior-year
   quarter restated as a comparative carries the later year. The durations already pin the year. With the
   check gone, ADI's four quarters sum to its reported annual revenue **exactly** (11,019.7M).
3. **Debt could be double-counted.** `LongTermDebt` includes current maturities and
   `LongTermDebtNoncurrent` excludes them; adding the current portion to the first counts it twice. The
   two are now separate paths and the tags used are recorded on the pick.

### The plan's demonstration figures for ADI were wrong — corrected
The approved plan's §5 card quoted TTM revenue $13,686M, +43.5%, and a quarterly year-on-year of +52.3%.
Those came from a gapped quarterly series computed before bug 2 was found: the missing FY2025 fourth
quarter pushed the "year-ago quarter" back to 2025-05-03, a 455-day comparison. The correct figures at
`asOf` 2026-10-02 are **TTM revenue $13,881.7M, +33.6%, quarterly year-on-year +39.6% against +37.2%**,
cross-checked against ADI's own reported annual revenue. The card's *format* stands; those numbers do not.

### Honesty mechanisms, concretely
- Every Stage A rejection names **which test** fired, so an empty card says "the test that removed the
  most was trend: the close is below its 200-session average — 1,904 of 2,663 screened" and the
  thresholds are not touched.
- The displayed score is a **percentile among the day's eligible candidates**, and the sentence next to it
  says it is not a probability of profit.
- The evidence table shows each figure's period, the day it was filed and the XBRL tag; anything that
  involves a market price is marked as an interpretation, not a filed figure.
- `decidedFor` on `public/data/stock.json` means a stale card can never be shown as today's. A **refresh**
  keeps the card today's edition already published, because rebuilding in place must not take away
  something the edition had already said — declining to destroy a card is not the same as inventing one.
- Archived editions now show their stock card. Hiding it was a small dishonesty: the published record of
  what the rule picked is the thing most worth being able to look back at.

### Not yet done, and why
- **12−1 momentum and the five-session return are computed but not in the score.**
  `candidateSignalsAdopted` is empty in the frozen rules and stays empty until the development window
  says otherwise. Adopting one is a visible edit with a new hash.

### Known limitations (agreed, and disclosed in the app)
- **~12 non-overlapping 21-session blocks** is what two years of free history gives after the burn-in.
  That cannot establish an edge. The card says "not enough evidence yet" and will keep saying it.
- **Survivorship bias cannot be removed.** The universe is what trades today, so no backtest ever buys a
  delisted company. There is no free source of historical listings.
- **Forward earnings dates stay estimates**, ±1 week, until a free confirmed source exists.
- **In the backtest the quiet window is a proxy** — the 10-Q/10-K acceptance date rather than the 8-K
  item 2.02 announcement, because a historical per-company filing index is not cached. Live, the exact
  test is applied to the candidates at the top of the ranking.
- **Massive's free tier could change.** All bars are cached in the repo, so history is never lost; if the
  tier ends the app says the feed stopped and publishes nothing. No paid plan is ever activated.

### What Paolo must do, once
Two repository Actions secrets (Settings → Secrets and variables → Actions):
1. **`MASSIVE_API_KEY`** — a free Massive (Polygon.io) "Stocks Basic" key. No card, blocks rather than bills.
2. **`SEC_CONTACT`** — a working email address. The SEC refuses automated requests that do not declare a
   contact (measured: 403), and refuses a user agent carrying a URL instead of an address. A false contact
   would misrepresent the requester, so the build fails without this rather than inventing one.

Then run the **Stock in focus** workflow once with `backfill` set to about `520` to fill the price cache
(~500 grouped-bars calls, paced at five a minute, roughly 1h45m), and `max_companyfacts` at `300`.

## 2026-10-08 — four defects from the 7 October edition, and a pick every trading day

Paolo opened the 2026-10-07 edition and reported three problems. Investigating found a fourth he could
not have seen, which was the most serious. Deployment 2 itself works — 494 sessions cached, 5,051 names
scanned, 488 eligible, a real VCTR pick for 2026-10-07. These were defects in working code.

### 1. The stock card was empty although a good pick existed

The edition was committed at 07:00 and the pick at 07:10. `build-edition.mjs` reads `stock.json` once,
and `edition-needed.mjs` only refreshes between 04:00 and 09:00 NY, so nothing looked again: the card
stayed empty all day with VCTR sitting in the file beside it.

Four changes, each removing one way the card can be empty:

- **Decide overnight.** `stocks.yml` now asks for a slot every 30 minutes from just after NY midnight
  through late morning (`10,40 4-16 * * *`, 26 slots). The pick for day T uses data through session T−1,
  so it can be made at 02:00 — hours before the edition needs it, and in the window where the entry rule
  is trivially satisfied.
- **A pre-check, so 26 slots cost almost nothing.** New `scripts/stock-needed.mjs`, dependency-free, runs
  before `npm ci`. A skipped slot is one checkout, about ten seconds.
- **`outcome` on the published feed**, so a run that *could not decide* is distinguishable from a screen
  that ran to the end and found nothing. `incomplete` is retried on the next slot; `none-qualified` is
  final, because thresholds are never relaxed to fill a card. **This retry is the mechanism behind "a new
  pick every trading day"** — the system keeps trying until it has one instead of giving up at 09:00.
- **A third pre-check answer, `patch`.** The decision exists but the edition card is not showing it:
  nothing is fetched and nothing is re-decided, the card just catches up. This is what leaves no way for
  a published pick to stay off the card — if the patch that should have followed the decision did not
  land, the next slot notices and does it.
- **The stocks workflow patches the card itself.** `build-edition.mjs --stock-only` recomputes only
  `edition.stock`, fetches nothing, and leaves `preparedAt` alone — that field means "when the stories
  were prepared" and the refresh pre-check uses it as a staleness clock. The app watches the new optional
  `stockUpdatedAt` instead, so a patched file is still downloaded. **Run against today's edition, this
  repaired the card Paolo reported: it now carries the VCTR pick.**
- **The edition is the last resort.** `edition.yml` runs the stock build itself when `stock.json` is not
  today's — `continue-on-error`, 20-minute timeout, skipped without secrets — so `build-edition.mjs` reads
  a file written moments earlier in the same job and the ordering is right by construction.
- **An alarm.** When the card is still not a pick, the run emits `::warning::` and a step-summary line
  naming the reason. `none-qualified` is a `::notice::`, because that one is a legitimate answer.
- **The fallback.** A pick still inside its 21-session hold now shows as `kind: 'open-position'` — the
  pick untouched, under a muted dated header and an eyebrow reading "open position, not today's
  decision". On a weekend or market holiday this is the *correct* card, not a fallback: no session closed,
  so there was nothing to decide. `unavailable` survives for the real cases.

Both workflows now share `concurrency.group: brooklyn-data`, so they queue instead of racing; a manual
backfill takes `brooklyn-backfill` so a long run cannot block a morning. Both push steps retry five times
and then **fail loudly** instead of `|| true`. The edition's conflict resolution is fixed rather than
arbitrary: keep this run's stories, then re-apply the card with `--stock-only`.

### 2. `plannedEntry` ignored the publication time — a look-ahead (found here, not reported)

`portfolio.mjs` had `entrySession(calendar, publishedAt)`, correct and unit-tested at the 09:30 ET
boundary. **`build-stocks.mjs` never called it.** It used the first projected weekday after the last
cached bar, which knows nothing about when the pick was published, and `publishedAt` was not even created
until 100 lines later.

ATEX, published 2026-10-06 at **18:20 ET**, was recorded as entering the open of **2026-10-06** — a
session that had closed nine hours before the pick existed. That is exactly the look-ahead acceptance
test 8 forbids. The library test passed the whole time.

- `publishedAt` is now computed once, before anything is screened, and the window comes from a new
  `plannedWindow(calendar, publishedAt, horizon)` in `portfolio.mjs` — the function the build actually
  calls, so `tests/stocks-entry.test.ts` tests the shipped path rather than a library in isolation. This
  also fixes the window handed to `earningsRiskInWindow`, which had been one session early.
- **ATEX's record is corrected.** `state/stocks-v2.json` now records `plannedEntry: 2026-10-07` for it,
  recomputed from its own `publishedAt`. The card was never displayed, so nothing Paolo saw is rewritten —
  but leaving it would have credited the strategy with a price from before the pick existed. ATEX and
  VCTR therefore both enter at the 2026-10-07 open; that is a consequence of the delayed run, not of the
  rule.
- The log field is named `plannedEntry`, not `entryDate`, and nothing measures a position from it. A
  projected weekday is a guess that a market holiday makes wrong, so `measurePick` and
  `openPositionsFrom` both recompute the real entry from `publishedAt` against the sessions that traded.
  `openPositionsFrom` had been counting the hold from `p.date`, the edition date, which let a position
  leave the book a session early.

### 3. Two water polo stories about the same four results

Measured on the real items: title similarity **0.211**, far under the 0.5 dedupe threshold, and
`SUBJECTS.waterpolo` had only three keys so one story matched `cl-quali` and the other matched nothing —
the top-three diversity rule had nothing to compare. There were in fact **two** duplicate pairs that day;
the second (Ilija Duretic / PanAm gold, told twice) Paolo did not mention.

New in `rank.mjs`: `properNouns`, `documentFrequency`, `distinctiveTokens`, `sharedDistinctive`,
`sameStory`, wired into `selectPerTopic` against **every** pick in a section, not just the first three.
Two items are one story when they share ≥2 proper nouns that are rare in the topic's candidate pool *and*
those names are ≥25% of the shorter item's rare vocabulary.

**The thresholds were calibrated, not chosen.** `scripts/replay-rules.mjs` replays all the new rules over
the archive; a parameter sweep over 21 hand-labelled pairs (16 real duplicates, 5 that merely share a
section's vocabulary) at production pool sizes picked `maxShare 0.15 / minShared 2 / minOverlap 0.25`:
**15 of 16 duplicates caught, 0 false positives.** Two findings came out of doing it this way:

- A *single* shared rare name is not evidence. The one miss is "Man City rule breaches not my concern —
  Mancini" against "Mancini refers to 'double' Manchester City contract": in a soccer pool "Manchester"
  and "City" are too common to count, leaving only "Mancini". `SUBJECTS.soccer` separates those anyway.
- Document frequency has to come from the **whole candidate pool**, not the six stories selected. At a
  pool of six, "Men", "Club", "Division", "Water" and "Polo" look distinctive and tie unrelated CWPA
  notices together — 6 false positives, measured. At the ~42 the live build ranks, they do not.
- The publisher's own name is excluded: several feeds sign their excerpts ("…Total Waterpolo"), which made
  every pair from one publisher look related.

`SUBJECTS.waterpolo` also goes from 3 keys to 10. It only orders the top three; `sameStory` is the net.

### 4. "AI & Data" was "whatever those tech publishers posted"

The topic was a property of the *feed*, never checked against the item, and two of six feeds were
general-interest. On 2026-10-07 MIT Technology Review's main feed carried **zero** AI items — ten pieces
of climate tech and biotech — and `technology-lab` was security, space and hardware. Three of six stories
were off-topic.

- Feeds swapped to `technologyreview.com/topic/artificial-intelligence/feed/` and
  `arstechnica.com/ai/feed/`. Both re-checked against each robots.txt `User-agent: *` block on 2026-10-07.
  `technologyreview.com/topic/data/feed/` answers 200 with no items, so there is no data-topic feed.
- **A latent rule violation found while probing this.** MIT TR's AI feed is **40% `<category>sponsored</category>`**
  — 4 of 10 items — and `parseFeed` read no categories at all, so all four were ordinary candidates for
  the edition. The project forbids advertising. `parseFeed` now extracts categories from RSS, Atom and
  RDF, and `SPONSORED_CATEGORIES` drops them from **every** topic. Verified on a live run: all four
  dropped, by name, in the log.
- `TOPIC_KEYWORDS` is a backstop so a publisher reorganising its feeds cannot quietly refill the section
  with biotech again. It covers the data side too — Python, pandas, SQL, DAX, Power BI, Excel, dashboards,
  analytics — because that is half of what the section is for.
- Every dropped item is logged with its title and the rule that dropped it (`reportDrops`).

Verified on a live build: the AI section came back as six genuine AI/data stories (SynthID, an AI
"virtual cell" investment, Python IDEs, Gemini pricing, a pandas tutorial, Apple Intelligence removal),
no sponsored item, and no duplicate in any section.

### The backtest was run — and it does not support the ranking

`npm run backtest:stocks`, development window only (the held-out window stays closed). Full output under
`<!-- backtest -->` below. The number that matters:

| | mean excess vs SPY | win rate | t / Newey-West |
|---|---|---|---|
| composite (the live rule) | **+0.43%** | 55% | 0.46 / 1.39 |
| random pick from the same eligible set | **+1.14%** | 58% | 0.72 / 1.72 |

**On 132 overlapping decision days the composite ranking did worse than picking at random from the names
it had already qualified.** The eligibility screens and the ranking are different things, and this says
nothing good about the ranking. It is not evidence that the ranking is harmful either: t = 0.46, about ten
non-overlapping blocks, and survivorship bias flatters every row equally. But it is the opposite of
support, and the card's "not enough evidence yet" stays — now with a measurement behind it rather than an
absence of one.

The five-session-return decile table is flat (top decile less the rest: **−0.26%**), so that signal stays
out of the score, which is what `candidateSignalsAdopted: []` already says.

### Still open
- **One real run has not been watched yet.** The overnight schedule, the pre-check, the `--stock-only`
  patch and the retrying pushes have been exercised locally and in the shell, but not yet by GitHub's
  scheduler. The first run's duration belongs in this file.
- **Two write-ups of two *different* games between the same two schools in one week would collapse to
  one.** Understood and accepted: no score is lost, because scores come from the water polo feed, not the
  news section.
- **`TOPIC_KEYWORDS` has only an `ai` entry.** The other sections have not shown the problem. Adding one
  for a section that does not need it would risk dropping a legitimate story for nothing.

## Backtest

<!-- backtest -->
### Backtest — strategy 46527bc8ea38a026, run 2026-10-07

494 sessions cached · 221 decision days · development 2025-10-20 to 2026-04-29 (132) · held out 2026-04-30 to 2026-09-04 (89, not opened)

**development** — 2025-10-20 to 2026-04-29, 132 decision days. Buy and hold: SPY +5.94%, RSP +5.51%.

| strategy | portfolio | mean position | mean excess vs SPY | win rate | avg gain | avg loss | max drawdown | n | names | top division | t / Newey-West |
|---|---|---|---|---|---|---|---|---|---|---|---|
| composite | +17.01% | +2.08% | +0.43% | 55% | +11.72% | -9.85% | -4.33% | 132 | 78 | 16% Finance, Insurance and Real Estate | 0.46 / 1.39 |
| priceOnly | no positions | | | | | | | | | | |
| random | +15.10% | +2.12% | +1.14% | 58% | +9.82% | -8.65% | -2.48% | 132 | 112 | 20% Mining | 0.72 / 1.72 |
| v1 | +28.79% | +3.85% | +4.02% | 49% | +14.05% | -6.04% | -5.22% | 132 | 67 | 100% n/a | 1.39 / 1.37 |

**Forward 21-session excess return by five-session-return decile** — the reversal hypothesis, tested rather than assumed.

| decile | five-session return | n | mean excess vs SPY |
|---|---|---|---|
| 1 | -19.91% to -4.10% | 1,757 | -0.73% |
| 2 | -4.10% to -2.26% | 1,757 | +0.30% |
| 3 | -2.26% to -1.06% | 1,757 | +0.14% |
| 4 | -1.06% to -0.03% | 1,757 | +0.53% |
| 5 | -0.03% to +0.96% | 1,757 | +0.17% |
| 6 | +0.96% to +1.97% | 1,757 | +0.22% |
| 7 | +1.97% to +3.09% | 1,757 | +0.10% |
| 8 | +3.09% to +4.52% | 1,757 | -0.16% |
| 9 | +4.53% to +6.88% | 1,757 | -0.33% |
| 10 | +6.88% to +39.22% | 1,765 | -0.24% |

Top decile less the rest: **-0.26%** over 17,578 overlapping observations. Observations overlap heavily — thousands share the same 21 sessions — so the differences are descriptive and no significance is claimed from them. A flat table means the five-session return stays out of the score.

**Limitations**
- The universe is the list of securities traded today, so no delisted company is ever bought. The result is biased upward and there is no free source of historical listings to correct it.
- The quiet window uses the 10-Q or 10-K acceptance date, not the 8-K item 2.02 announcement, because a historical filing index per company per day is not cached.
- Fundamentals come from twelve quarters of data sets, so decisions early in the window see fewer filings than decisions late in it.
- About 10 non-overlapping blocks exist. That cannot establish an edge, and no claim of one is made.
<!-- backtest -->
