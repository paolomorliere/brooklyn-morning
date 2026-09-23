// Turns per-school schedule rows into one set of games, each appearing exactly once.
// Pure: no network, no clock (timestamps are passed in), no filesystem.
//
// Three problems this solves, in order:
//   1. A game between two watched teams appears on both schools' pages, each from its own perspective.
//      They must collapse into one row with each score on the right side.
//   2. A score can be corrected later. Identity therefore never includes the score — a correction
//      updates the existing game instead of adding a second one.
//   3. Two teams can genuinely meet twice on one day (tournaments). Those must stay separate, which
//      is what the time-ordered `slot` is for.

import { createHash } from 'node:crypto';
import { SEASON, WATCHED_IDS, displayName, resolutionFor, teamSlug } from '../waterpolo.config.mjs';

/** Sorted pair, so both schools' pages produce the same identity for the same game. */
export function teamPair(a, b) {
  return [a, b].sort();
}

/**
 * Stable identity: season, the sorted team pair, the game date, and which meeting of that pair
 * on that date this is. Deliberately excludes the score, the venue and the source.
 */
export function gameKey(season, slugA, slugB, date, slot = 0) {
  const [a, b] = teamPair(slugA, slugB);
  return createHash('sha1').update(`${season}|${a}|${b}|${date}|${slot}`).digest('hex').slice(0, 12);
}

const bucketOf = (date, a, b) => `${date}|${teamPair(a, b).join('|')}`;

/** Rows with no time sort after rows with one, so a known kickoff always wins the earlier slot. */
const timeRank = (t) => t ?? '99:99';

/**
 * Who hosted, as far as this row can tell.
 *   neutral site            -> nobody
 *   "at <opponent>"         -> the opponent, whatever else the row says
 *   "vs" with a known venue -> this school
 *   "vs" with the newer markup, which has no neutral flag -> unknown, because "vs" is printed
 *                              at neutral sites too and guessing would invent a home team
 */
function hostOf(neutral, away, school, opponent) {
  if (neutral === true) return null;
  if (away) return opponent;
  return neutral === false ? school : null;
}

/**
 * One source's rows → canonical game candidates, with `slot` assigned per (date, pair) bucket.
 * `row.us` is always the school's own score; `row.them` the opponent's.
 */
export function toCandidates(rows, cfg, verifiedAt, season = SEASON) {
  const mapped = rows.map((row, i) => {
    const school = cfg.id;
    const opponent = teamSlug(row.opponentRaw);
    const scores = { [school]: row.us, [opponent]: row.them };
    // Sidearm's neutral flag is trustworthy where it exists; the newer markup does not carry one,
    // and its "vs" is meaningless at a neutral site, so leave both unknown rather than guessing.
    const neutral = row.neutral;
    const homeTeam = hostOf(neutral, row.away, school, opponent);
    return {
      order: i,
      bucket: bucketOf(row.date, school, opponent),
      date: row.date,
      time: row.time ?? null,
      scores,
      teams: teamPair(school, opponent),
      homeTeam,
      neutral,
      ot: row.ot ?? null,
      exhibition: !!row.exhibition,
      tournament: row.tournament ?? null,
      venue: row.venue ?? null,
      opponentName: row.opponentRaw,
      opponentSlug: opponent,
      opponentLogo: row.opponentLogo ?? null,
      source: {
        id: cfg.id,
        url: cfg.url,
        verifiedAt,
        detailUrl: row.detailUrl ?? null,
        reading: { ...scores },
      },
    };
  });

  const byBucket = new Map();
  for (const c of mapped) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket).push(c);
  }
  for (const group of byBucket.values()) {
    group.sort((x, y) => timeRank(x.time).localeCompare(timeRank(y.time)) || x.order - y.order);
    group.forEach((c, slot) => {
      c.slot = slot;
      c.id = gameKey(season, c.teams[0], c.teams[1], c.date, slot);
    });
  }
  return mapped;
}

/**
 * Find the game in `bucket` that this candidate is another view of.
 *   1. same clock time — the strongest signal two sources are describing one game;
 *   2. same identity;
 *   3. the bucket holds exactly one game and this source has not contributed to it yet.
 * Anything else is a different game (a genuine same-day rematch).
 */
function matchExisting(bucket, cand) {
  if (cand.time) {
    const byTime = bucket.find((g) => g.time === cand.time);
    if (byTime) return byTime;
  }
  const byId = bucket.find((g) => g.id === cand.id);
  if (byId) return byId;
  if (bucket.length === 1 && !bucket[0].sources.some((s) => s.id === cand.source.id)) {
    const only = bucket[0];
    // Only accept the single-game shortcut when neither side claims a conflicting time.
    if (!only.time || !cand.time) return only;
  }
  return null;
}

const sameScores = (a, b) => Object.keys(a).every((k) => a[k] === b[k]) && Object.keys(a).length === Object.keys(b).length;

function emptyGame(cand) {
  return {
    id: cand.id,
    date: cand.date,
    time: cand.time,
    teams: cand.teams,
    scores: null,
    homeTeam: null,
    neutral: null,
    ot: null,
    exhibition: false,
    tournament: null,
    venue: null,
    sources: [],
    conflict: null,
    firstSeenAt: cand.source.verifiedAt,
  };
}

/** Prefer a real value over a missing one; never overwrite something known with null. */
const fill = (current, next) => (next === null || next === undefined ? current : next);

/**
 * Merge one run's candidates into the archive.
 *
 * `archive` is the previously published set of games and is authoritative for anything this run
 * does not see: a game that vanishes from a school's page is kept, never deleted.
 */
export function mergeGames(archive, candidates) {
  const games = archive.map((g) => ({ ...g, sources: g.sources.map((s) => ({ ...s })), fromArchive: true }));
  const buckets = new Map();
  const put = (g) => {
    const key = bucketOf(g.date, g.teams[0], g.teams[1]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  };
  games.forEach(put);

  const stats = { added: 0, corrected: 0, unchanged: 0, conflicts: 0, resolved: 0 };

  for (const cand of candidates) {
    const bucket = buckets.get(cand.bucket) ?? [];
    let game = matchExisting(bucket, cand);

    if (!game) {
      game = emptyGame(cand);
      games.push(game);
      put(game);
      stats.added++;
    }

    const prior = game.sources.find((s) => s.id === cand.source.id);
    if (prior) Object.assign(prior, cand.source);
    else game.sources.push(cand.source);

    // Details are additive: the first source that knows a venue or a tournament supplies it.
    game.time = fill(game.time, cand.time);
    game.ot = fill(game.ot, cand.ot);
    game.tournament = fill(game.tournament, cand.tournament);
    game.venue = fill(game.venue, cand.venue);
    game.neutral = fill(game.neutral, cand.neutral);
    game.homeTeam = game.neutral === true ? null : fill(game.homeTeam, cand.homeTeam);
    game.exhibition = game.exhibition || cand.exhibition;

    if (game.scores === null) {
      game.scores = { ...cand.scores };
      continue;
    }
    if (sameScores(game.scores, cand.scores)) {
      // Everyone agrees again — a conflict that has resolved should stop warning.
      if (game.conflict && game.sources.every((s) => sameScores(s.reading, game.scores))) {
        game.conflict = null;
      } else {
        stats.unchanged++;
      }
      continue;
    }

    const sameSourceAsBefore = game.sources.length === 1 && game.sources[0].id === cand.source.id;
    if (sameSourceAsBefore) {
      // The one school that reported this game has changed its own number: a correction, not a dispute.
      game.scores = { ...cand.scores };
      stats.corrected++;
      continue;
    }

    // Two different official pages disagree. Never average, never split into two rows.
    stats.conflicts++;
    game.conflict = {
      detectedAt: cand.source.verifiedAt,
      readings: game.sources.map((s) => ({ source: s.id, url: s.url, scores: { ...s.reading } })),
    };

    const settled = resolutionFor(game.date, game.teams[0], game.teams[1]);
    if (settled) {
      // An official box score or recap decides it. The disagreement stays on the record.
      game.scores = { ...settled.scores };
      game.conflict.withheld = false;
      game.conflict.resolved = { evidence: settled.evidence, note: settled.note };
      stats.resolved++;
    } else if (!game.fromArchive) {
      // Never verified before this run, so there is no trusted number to show. Withhold it.
      game.scores = null;
      game.conflict.withheld = true;
    } else {
      game.conflict.withheld = false;
      game.conflict.showing = { ...game.scores };
    }
  }

  return { games, stats };
}

/**
 * Canonical output order and shape.
 * For a neutral-site game there is no home team, so the two sides are ordered by slug — a stable
 * choice that does not imply anyone hosted. `neutral` tells the UI to say so.
 */
export function toFeedGames(games) {
  return games
    .map((g) => {
      const [a, b] = g.teams;
      const home = g.homeTeam ?? a;
      const away = home === a ? b : a;
      const score = (slug) => (g.scores ? (g.scores[slug] ?? null) : null);
      return {
        id: g.id,
        date: g.date,
        time: g.time ?? null,
        home: { team: home, score: score(home) },
        away: { team: away, score: score(away) },
        neutral: g.neutral === true,
        hosted: g.homeTeam ?? null,
        ot: g.ot ?? null,
        exhibition: !!g.exhibition,
        tournament: g.tournament ?? null,
        venue: g.venue ?? null,
        sources: g.sources
          .map((s) => ({
            id: s.id,
            url: s.url,
            verifiedAt: s.verifiedAt,
            detailUrl: s.detailUrl ?? null,
            // What this page actually said, kept verbatim. Without it a disagreement would be
            // rewritten as agreement the next time the feed is read back in.
            reading: s.reading && Object.keys(s.reading).length ? { ...s.reading } : null,
          }))
          .sort((x, y) => x.id.localeCompare(y.id)),
        conflict: g.conflict ?? null,
        firstSeenAt: g.firstSeenAt ?? null,
      };
    })
    .sort((x, y) => y.date.localeCompare(x.date) || timeRank(x.time).localeCompare(timeRank(y.time)) || x.id.localeCompare(y.id));
}

/** The teams table the app needs to render names and logos, built from the games actually present. */
export function buildTeams(games, names, logos) {
  const teams = {};
  for (const g of games) {
    for (const slug of [g.home.team, g.away.team]) {
      if (teams[slug]) continue;
      teams[slug] = {
        name: displayName(slug, names.get(slug) ?? slug),
        watched: WATCHED_IDS.has(slug),
        logo: logos.get(slug) ?? null,
      };
    }
  }
  return teams;
}

/** Every game must involve at least one watched team. Anything else is out of scope by design. */
export function involvesWatched(game) {
  return WATCHED_IDS.has(game.home.team) || WATCHED_IDS.has(game.away.team);
}

/**
 * The published feed back into the internal shape `mergeGames` works on, so each run continues
 * from the archive rather than rebuilding history from scratch.
 */
export function fromFeedGames(feedGames) {
  return feedGames.map((g) => ({
    id: g.id,
    date: g.date,
    time: g.time ?? null,
    teams: teamPair(g.home.team, g.away.team),
    scores:
      g.home.score === null || g.away.score === null
        ? null
        : { [g.home.team]: g.home.score, [g.away.team]: g.away.score },
    homeTeam: g.hosted ?? null,
    neutral: g.neutral === true ? true : (g.hosted ? false : null),
    ot: g.ot ?? null,
    exhibition: !!g.exhibition,
    tournament: g.tournament ?? null,
    venue: g.venue ?? null,
    sources: (g.sources ?? []).map((s) => ({
      id: s.id,
      url: s.url,
      verifiedAt: s.verifiedAt,
      detailUrl: s.detailUrl ?? null,
      // Each source's own reading round-trips, so a recorded disagreement stays a disagreement.
      // Feeds written before this field existed fall back to the stored result.
      reading:
        s.reading ??
        (g.home.score === null || g.away.score === null
          ? {}
          : { [g.home.team]: g.home.score, [g.away.team]: g.away.score }),
    })),
    conflict: g.conflict ?? null,
    firstSeenAt: g.firstSeenAt ?? null,
  }));
}
