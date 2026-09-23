# Brooklyn Morning

A personal iPhone web app: a curated morning edition (news + one daily lesson), fast task capture, and a Trader Joe's grocery list. Installable from Safari, works offline, stores everything on the phone. Runs entirely on free services.

## Install on iPhone
1. Open the site URL in **Safari** (not Chrome): `https://<user>.github.io/<repo>/`
2. Tap the **Share** button (square with arrow) → **Add to Home Screen** → **Add**.
3. Open it from the Home Screen once while online. It downloads today's edition, the lesson packs (8 weeks), and the product catalog (~770 KB) and keeps them for offline use.

First-run checklist on the phone:
- **Morning** shows "Prepared h:mm AM" in green. If it says "From <date>" in terracotta, the edition is older than today.
- **Groceries** search returns products with photos after a few seconds (catalog download).
- **Settings → Export everything** opens the share sheet; save the file to Files or iCloud Drive to confirm backups work.
- Type a task and press return: the keyboard should stay up for the next one.

## How the morning edition works
- A GitHub Actions job fetches 40 public RSS feeds, ranks stories by interest, recency, and source, removes repeats from the previous 14 days, extracts the opening paragraphs of up to 20 articles from non-paywalled publishers, and commits `public/data/edition.json`. Pages redeploys automatically.
- **Scheduling.** GitHub runs free scheduled workflows on a best-effort basis; on this repository they have started **3.5–6 hours late**. So the workflow asks for a slot every 30 minutes from just after New York midnight until late morning, and a dependency-free pre-check (`scripts/edition-needed.mjs`) makes the slots with nothing to do cost about ten seconds. Whichever slot actually starts first builds the day's edition. If that edition is more than 2.5 hours old and it is still between 4 and 9 AM in New York, the next slot **refreshes it in place**: same date, same quote, same stock pick, newest stories. This means the edition is normally waiting before 6 AM even on a badly delayed morning.
- The app fetches the edition when opened or brought back to the foreground. iPhone web apps cannot refresh in the background.
- **What you see is what the publisher wrote.** "From publisher" is the feed excerpt; "Opening of the article" is the article's first paragraphs, unedited. The app never summarizes, rewrites, or invents. Tap the headline to read the original.
- If a feed is down, its section says "Source unavailable today". If nothing new was found, the section says so instead of padding.
- Past 14 editions: tap the clock icon on Morning.

### Adjusting the brief
- Reading length and topics: **Settings → Morning** on the phone.
- Sources, weights, boosts (clubs, keywords), match-report penalties, freshness windows: [`scripts/feeds.config.mjs`](scripts/feeds.config.mjs). Commit → next edition uses them.
- Glossary terms: [`public/data/glossary.json`](public/data/glossary.json).
- Rebuild by hand: **Actions → Morning edition → Run workflow**, choosing `auto` (same rules as a scheduled slot), `refresh` (rebuild today's edition in place), or `force` (rebuild regardless).

### Stock in focus
Monday–Friday the edition names one S&P 100 stock chosen by a fixed, published rule (above 20-day average, positive 5-day return, ranked by 5- and 20-day return, volume vs. average, and mentions in the day's finance/AI headlines; nothing repeated within 10 trading days). Saturday and Sunday show the week's scoreboard: equal amounts bought at the open on each pick day, valued at the latest close, combined and per stock. It is a mechanical screen on past prices, **not a recommendation**; prices come from Yahoo Finance's public endpoint, which is unofficial and may break (the card then says so). Rule: `scripts/lib/stocks.mjs`; log: `state/stocks.json`.

## Lessons
- 8 weeks × 7 lessons ship at launch (stock market ×2, history, AI without code, geography, cooking, data literacy, everyday economics). Weeks run Monday–Sunday and start on the first Monday on or after install (a placeholder shows until then). Every Sunday also has a 20-question multiple-choice quiz on the week, on its own screen, with score and corrections.
- To add a week: copy `scripts/lessons/week-08.mjs` to `week-09.mjs`, write 7 lessons, run `node scripts/build-lessons.mjs`, commit. The phone downloads new weeks automatically the next time it fetches the edition. Nothing to do on the phone.
- When the sequence runs past the last week, the card is labeled **Review week** and revisits earlier weeks. It never presents old content as new.
- Schema and rules: [`public/data/lessons/README.md`](public/data/lessons/README.md).

## Groceries
- Catalog: ~4,100 Trader Joe's products from **Open Food Facts** (open data). About 79% have photos, 41% have sizes. It is a community database: some items are missing, some are discontinued, and "listed" never means "stocked at City Point". No prices. Refreshed monthly by `catalog.yml`; a smaller-than-80% result is rejected so a bad import cannot wipe a good catalog.
- Anything not found is one tap away via **Add other item**.
- Buy again ranks your own history (purchases weigh more than adds, recent more than old). Discover shows up to three catalog items you have never added, with a reason, dismissable.

## Water polo
A results feed for **NCAA men's water polo, 2026 only**. It shows completed games involving any of the thirteen teams on the watchlist, including games against opponents outside it.

Watchlist and sources — all thirteen verified 2026-09-22:

| Team | Official 2026 schedule |
|---|---|
| LIU | https://liuathletics.com/sports/mens-water-polo/schedule/2026 |
| Harvard | https://gocrimson.com/sports/mens-water-polo/schedule/2026 |
| Princeton | https://goprincetontigers.com/sports/mens-water-polo/schedule/2026 |
| MIT | https://mitathletics.com/sports/mens-water-polo/schedule/2026 |
| Brown | https://brownbears.com/sports/mens-water-polo/schedule/2026 |
| Iona | https://ionagaels.com/sports/mens-water-polo/schedule/2026 |
| Wagner | https://wagnerathletics.com/sports/mens-polo/schedule/2026 |
| Fordham | https://fordhamsports.com/sports/mens-water-polo/schedule/2026 |
| Bucknell | https://bucknellbison.com/sports/mens-water-polo/schedule/2026 |
| Air Force | https://goairforcefalcons.com/sports/mens-water-polo/schedule/2026 |
| Navy | https://navysports.com/sports/mens-water-polo/schedule/2026 |
| Mount St. Mary's | https://mountathletics.com/sports/mens-water-polo/schedule/2026 |
| George Washington | https://gwsports.com/sports/mens-water-polo/schedule/2026 |

- **Season is pinned to 2026 and validated on every fetch.** A school's URL can quietly serve a different year, so each page must name 2026 (in its title, heading or `og:title`); where it names no year at all, every game date must fall inside the season. A page that fails is reported as unchecked and its saved games are kept.
- **One row per game.** A game between two watched teams appears on both schools' pages, each from its own perspective. They are matched on the teams, the date and the start time, never on the score, so a later correction updates the row instead of adding one. Two genuine meetings on the same day stay separate.
- **When two schools disagree**, the feed shows one row and never averages. If an official box score or recap settles it, that result is shown with the evidence linked in the details sheet; if nothing does, the score is withheld and the row says so.
- Tap any row for the venue, the event, overtime, exhibition status and a link to the official page each score came from.
- The freshness line says how many of the thirteen schools were actually read. A school that failed is never counted as checked.
- Logos are downloaded once into `public/logos/` so the screen works offline and sends no requests to school websites while you read. A team without one shows its initials.

### When it updates
Sources are read on **Saturday and Sunday at 9:00, 11:30, 2:00 and 4:30 New York time** — four checks a day, no weekday checks. The workflow asks for eight UTC slots (those four times under both daylight-saving offsets) and `scripts/polo-due.mjs` turns them into exactly four real checks by reading the actual New York clock.

GitHub runs scheduled workflows on a best-effort basis and has started this repository's runs 3.5–6 hours late, so a check will often happen later in the day than the time above. Nothing is lost when it does: every run re-reads all thirteen complete 2026 schedules, so Friday games, other weekday games, late postings and corrections are all picked up by the next check and filed under **the date they were played**. Saturday's 9:00 check is what collects Friday's results. Anything posted after Sunday's 4:30 check waits for the following Saturday, by design.

The **refresh button** on the screen re-downloads the published results file. It does not read the school websites — only the weekend job does that.

Maintenance: if a school redesigns its site, `node scripts/build-waterpolo.mjs --dry-run` will report that source as failed while the other twelve keep working. The registry of URLs and team aliases is `scripts/waterpolo.config.mjs`.

## Backup and restore
Everything lives in the phone's browser storage. Deleting the app from the Home Screen or clearing Safari website data deletes it. **Settings → Export everything** writes one JSON file (tasks, categories, list, history, library, settings, lesson progress) through the share sheet; **Restore** validates and replaces after confirmation. The app reminds you after 14 days without a backup.

## Cost and services
| Service | Used for | Why it cannot bill |
|---|---|---|
| GitHub Pages | hosting | free for public repositories |
| GitHub Actions | daily edition, weekend water polo results, monthly catalog, deploy | free minutes for public repos; with no payment method on the account, usage blocks instead of charging |
| Open Food Facts | product catalog | non-profit open database, no paid tier, no key |
| Publisher RSS feeds | headlines and excerpts | public feeds |
| School athletics sites | water polo schedules and results | ordinary requests to public pages, no key, no account |
| Fontsource, Lucide, Preact, Vite, Workbox | fonts, icons, code | open-source licences |

No accounts, analytics, ads, tracking, or AI APIs. **Never add a payment method to the GitHub account for this project.**

Known limits: GitHub delays scheduled runs at busy times (see *Scheduling* above for how the workflow absorbs it) and disables scheduled workflows in repositories with no activity for 60 days; the daily commits count as activity, but if the edition ever stops updating, open **Actions** and click *Enable workflow*. If the app keeps showing an older date, close it from the app switcher and reopen it: it checks for a new version every time it returns to the foreground.

## Development
```bash
npm install
npm run dev            # http://localhost:5173  (?fixtures=1 seeds sample data)
npm test               # Vitest
npm run e2e            # Playwright, iPhone SE / 14 / 14 Pro Max
npm run build:edition  # builds today's edition locally
npm run build:catalog  # rebuilds the catalog from Open Food Facts
node scripts/build-lessons.mjs
BASE_PATH=/<repo>/ npm run build
```
Records: `SPEC.md` (approved spec), `STATUS.md` (progress and continuation point), `CLAUDE.md` (working rules).
