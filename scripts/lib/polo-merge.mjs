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
import { SEASON, WATCHED_IDS, displayName, resolutionFor, teamSlug, zoneForSchool, zoneForVenue } from '../waterpolo.config.mjs';

/**
 * A scheduled game and the result it becomes are one event.
 *
 * `final` is reached only by a printed score, never by the clock — a start time in the past means
 * the result has not been published yet, not that the game was played. `postponed` and `cancelled`
 * are what the school says, and either can go back to `scheduled` when a new date is posted.
 */
const STATUS_RANK = { scheduled: 0, postponed: 1, cancelled: 1, final: 2 };
const strongerStatus = (a, b) => ((STATUS_RANK[b] ?? 0) > (STATUS_RANK[a] ?? 0) ? b : a);

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
 * Within one day, the latest verified start time comes first.
 * A game whose start time no source printed sorts after every game that has one — it is never given
 * an invented time to sort by — and ties break on the stable game id so the order does not wobble.
 */
export function byLatestFirst(x, y) {
  if (!x.time && !y.time) return x.id.localeCompare(y.id);
  if (!x.time) return 1;
  if (!y.time) return -1;
  return y.time.localeCompare(x.time) || x.id.localeCompare(y.id);
}

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
export function toCandidates(rows, cfg, verifiedAt, season = SEASON, resolve = teamSlug) {
  const mapped = rows.map((row, i) => {
    const school = cfg.id;
    // `resolve` applies the canonical identity decided from the pages themselves, so two spellings
    // of one school collapse before any game is bucketed, matched or de-duplicated.
    const opponent = resolve(row.opponentRaw);
    const status = row.status ?? 'final';
    const scores = status === 'final' && row.us !== null && row.them !== null ? { [school]: row.us, [opponent]: row.them } : null;
    // Sidearm's neutral flag is trustworthy where it exists; the newer markup does not carry one,
    // and its "vs" is meaningless at a neutral site, so leave both unknown rather than guessing.
    const neutral = row.neutral;
    const homeTeam = hostOf(neutral, row.away, school, opponent);
    return {
      order: i,
      bucket: bucketOf(row.date, school, opponent),
      date: row.date,
      time: row.time ?? null,
      // Whose clock the printed time is on. A home row is in this school's own zone; otherwise the
      // venue's state decides, and where neither is certain it stays null and the app says so
      // rather than calling an unverified time Eastern.
      timeZone: row.away === true ? zoneForVenue(row.venue) : (zoneForVenue(row.venue) ?? zoneForSchool(school)),
      status,
      scores,
      teams: teamPair(school, opponent),
      homeTeam,
      neutral,
      ot: row.ot ?? null,
      exhibition: !!row.exhibition,
      tournament: row.tournament ?? null,
      conferenceMarker: row.conferenceMarker ?? null,
      venue: row.venue ?? null,
      opponentName: row.opponentRaw,
      opponentSlug: opponent,
      opponentLogo: row.opponentLogo ?? null,
      source: {
        id: cfg.id,
        url: cfg.url,
        verifiedAt,
        detailUrl: row.detailUrl ?? null,
        reading: scores ? { ...scores } : {},
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
    timeZone: null,
    status: 'scheduled',
    // Set by the build from the CWPA's published conference schedule, never by the merge.
    conference: null,
    conferenceSource: null,
    conferenceMarker: null,
    sources: [],
    conflict: null,
    firstSeenAt: cand.source.verifiedAt,
    slot: cand.slot ?? 0,
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
    // A later posting wins for the clock: schools do move start times, and the newest read of a
    // page is the one to believe.
    if (cand.time) {
      game.time = cand.time;
      game.timeZone = cand.timeZone ?? null;
    } else {
      game.timeZone = fill(game.timeZone, cand.timeZone);
    }
    game.status = strongerStatus(game.status ?? 'scheduled', cand.status);
    game.ot = fill(game.ot, cand.ot);
    game.tournament = fill(game.tournament, cand.tournament);
    game.conferenceMarker = fill(game.conferenceMarker, cand.conferenceMarker);
    game.venue = fill(game.venue, cand.venue);
    game.neutral = fill(game.neutral, cand.neutral);
    game.homeTeam = game.neutral === true ? null : fill(game.homeTeam, cand.homeTeam);
    game.exhibition = game.exhibition || cand.exhibition;

    // Nothing below this point concerns a game without a result.
    if (cand.scores === null) {
      stats.unchanged++;
      continue;
    }
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
  // Fields that are null, false or zero are left out of the file rather than written 750 times
  // over. The app reads them with defaults, and the feed is a third smaller for it — which matters
  // on a phone that re-downloads the whole thing.
  const put = (obj, key, value, skip) => {
    if (value !== skip && value !== null && value !== undefined) obj[key] = value;
  };
  return games
    .map((g) => {
      const [a, b] = g.teams;
      const home = g.homeTeam ?? a;
      const away = home === a ? b : a;
      const score = (slug) => (g.scores ? (g.scores[slug] ?? null) : null);
      const status = g.status ?? (g.scores ? 'final' : 'scheduled');
      const out = {
        id: g.id,
        date: g.date,
        time: g.time ?? null,
        status,
        home: { team: home, score: score(home) },
        away: { team: away, score: score(away) },
      };
      put(out, 'timeZone', g.timeZone ?? null);
      put(out, 'neutral', g.neutral === true, false);
      // Always written: at a neutral site "nobody hosted" is a fact the feed states, and the sheet
      // distinguishes it from "not recorded".
      out.hosted = g.homeTeam ?? null;
      put(out, 'ot', g.ot ?? null);
      put(out, 'exhibition', !!g.exhibition, false);
      put(out, 'tournament', g.tournament ?? null);
      put(out, 'venue', g.venue ?? null);
      put(out, 'conference', g.conference ?? null);
      put(out, 'conferenceSource', g.conferenceSource ?? null);
      put(out, 'conferenceMarker', g.conferenceMarker ?? null);
      put(out, 'slot', g.slot ?? 0, 0);
      // Always written, even when null: "no school disagrees about this score" is a statement the
      // feed makes on purpose, not an absence.
      out.conflict = g.conflict ?? null;
      put(out, 'firstSeenAt', g.firstSeenAt ?? null);
      out.sources = g.sources
        .map((s) => {
          const src = { id: s.id, url: s.url, verifiedAt: s.verifiedAt };
          put(src, 'detailUrl', s.detailUrl ?? null);
          // A source's own reading is only worth storing when it differs from the result shown.
          // That is the whole reason it exists — so a recorded disagreement survives a round trip —
          // and writing it out when it simply repeats the score doubles the file for nothing.
          const reading = s.reading && Object.keys(s.reading).length ? s.reading : null;
          const same =
            reading && g.scores && Object.keys(reading).length === Object.keys(g.scores).length &&
            Object.keys(reading).every((k) => reading[k] === g.scores[k]);
          if (reading && !same) src.reading = { ...reading };
          return src;
        })
        .sort((x, y) => x.id.localeCompare(y.id));
      return out;
    })
    // Results first, newest day first and latest game of the day first; then everything still to
    // play, earliest first. The file reads in the order a person would want it.
    .sort((x, y) => {
      const xd = x.status === 'final' ? 0 : 1;
      const yd = y.status === 'final' ? 0 : 1;
      if (xd !== yd) return xd - yd;
      if (xd === 0) return y.date.localeCompare(x.date) || byLatestFirst(x, y);
      return x.date.localeCompare(y.date) || (x.time ?? '99:99').localeCompare(y.time ?? '99:99') || x.id.localeCompare(y.id);
    });
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

/**
 * Rewrite stored games onto canonical team identities, and collapse the duplicates that creates.
 *
 * Fixing identity only for future imports would leave the rows already on the phone wrong — the
 * 26 September Concordia/Harvard game was written twice and would have stayed twice. This rewrites
 * the archive in place: every team slug, every score key, every source's own reading and the host.
 *
 * Two archive games only collapse when they land on the same identity AND the same slot, and only
 * inside a bucket the rewrite actually touched. A genuine doubleheader keeps its separate slots and
 * is never affected; nothing here compares scores.
 */
/** One entry per school, keeping the most recently verified reading. */
function dedupeSources(sources) {
  const by = new Map();
  for (const s of sources) {
    const prior = by.get(s.id);
    if (!prior || (s.verifiedAt ?? '') >= (prior.verifiedAt ?? '')) by.set(s.id, s);
  }
  return [...by.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function repairIdentities(games, canonical, season = SEASON) {
  if (!canonical || canonical.size === 0) return { games, rewritten: 0, collapsed: 0 };
  const map = (slug) => {
    let s = slug;
    for (let i = 0; i < 8 && canonical.has(s); i++) s = canonical.get(s);
    return s;
  };
  const rekey = (obj) => {
    if (!obj) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[map(k)] = v;
    return out;
  };

  let rewritten = 0;
  const touched = new Set();
  const moved = games.map((g) => {
    const teams = teamPair(map(g.teams[0]), map(g.teams[1]));
    const changed = teams[0] !== g.teams[0] || teams[1] !== g.teams[1];
    if (changed) {
      rewritten++;
      touched.add(bucketOf(g.date, teams[0], teams[1]));
    }
    return {
      ...g,
      teams,
      scores: rekey(g.scores),
      homeTeam: g.homeTeam ? map(g.homeTeam) : g.homeTeam,
      sources: g.sources.map((src) => ({ ...src, reading: rekey(src.reading) })),
      // The schools that published this row, before their ids move. Renaming them first would make
      // the two halves of a duplicate look like the same school reporting twice, and they would
      // never be recognised as one game.
      publishedBy: g.sources.map((src) => src.id),
      conflict: g.conflict
        ? { ...g.conflict, readings: (g.conflict.readings ?? []).map((r) => ({ ...r, scores: rekey(r.scores) })) }
        : g.conflict,
    };
  });

  // Only the buckets the rewrite actually touched are reconsidered. Everything else keeps the id it
  // was published with — feeds written before this existed carry no slot, so re-deriving an id for
  // an untouched game would collapse genuine same-day rematches into one row.
  const out = [];
  const buckets = new Map();
  for (const g of moved) {
    const key = bucketOf(g.date, g.teams[0], g.teams[1]);
    if (!touched.has(key)) {
      out.push(g);
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }

  const absorb = (into, from) => {
    const seen = new Set(into.sources.map((x) => x.id));
    for (const src of from.sources) if (!seen.has(src.id)) into.sources.push(src);
    into.publishedBy = [...new Set([...into.publishedBy, ...from.publishedBy])];
    into.time = into.time ?? from.time;
    into.ot = into.ot ?? from.ot;
    into.venue = into.venue ?? from.venue;
    into.tournament = into.tournament ?? from.tournament;
    into.neutral = into.neutral ?? from.neutral;
    into.homeTeam = into.homeTeam ?? from.homeTeam;
    into.exhibition = into.exhibition || from.exhibition;
    into.scores = into.scores ?? from.scores;
    into.status = strongerStatus(into.status ?? 'scheduled', from.status ?? 'scheduled');
    into.timeZone = into.timeZone ?? from.timeZone;
    into.conference = into.conference ?? from.conference;
    into.conferenceSource = into.conferenceSource ?? from.conferenceSource;
    into.conferenceMarker = into.conferenceMarker ?? from.conferenceMarker;
    into.firstSeenAt = [into.firstSeenAt, from.firstSeenAt].filter(Boolean).sort()[0] ?? null;
  };

  let collapsed = 0;
  for (const group of buckets.values()) {
    const kept = [];
    for (const g of group) {
      // One event reported twice under two names: the two rows come from different schools, so
      // their source lists do not overlap. A genuine doubleheader has each school reporting both
      // games, which shows up as overlapping sources or as more than two rows at distinct times.
      const mine = new Set(g.publishedBy);
      const twin = kept.find((k) => {
        if (k.publishedBy.some((id) => mine.has(id))) return false;
        if (k.time && g.time && k.time !== g.time) return group.length === 2;
        return true;
      });
      if (twin) {
        absorb(twin, g);
        collapsed++;
      } else {
        kept.push(g);
      }
    }
    // Re-slot what is left by start time, nulls last, and give each row its identity.
    kept.sort((a, b) => timeRank(a.time).localeCompare(timeRank(b.time)) || (a.id ?? '').localeCompare(b.id ?? ''));
    kept.forEach((g, slot) => {
      g.slot = slot;
      g.id = gameKey(season, g.teams[0], g.teams[1], g.date, slot);
      out.push(g);
    });
  }
  // Now that duplicates are settled, a source's id follows the school that published it.
  for (const g of out) {
    g.sources = dedupeSources(g.sources.map((src) => ({ ...src, id: map(src.id) })));
    delete g.publishedBy;
  }
  return { games: out, rewritten, collapsed };
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
    status: g.status ?? (g.home.score !== null && g.away.score !== null ? 'final' : 'scheduled'),
    timeZone: g.timeZone ?? null,
    conference: g.conference ?? null,
    conferenceSource: g.conferenceSource ?? null,
    conferenceMarker: g.conferenceMarker ?? null,
    sources: (g.sources ?? []).map((s) => ({
      id: s.id,
      url: s.url,
      verifiedAt: s.verifiedAt,
      detailUrl: s.detailUrl ?? null,
      // Each source's own reading round-trips, so a recorded disagreement stays a disagreement.
      // Feeds written before this field existed fall back to the stored result.
      // Left out of the file when it simply repeated the result, so rebuild it from the result.
      reading:
        s.reading ??
        (g.home.score === null || g.away.score === null
          ? {}
          : { [g.home.team]: g.home.score, [g.away.team]: g.away.score }),
    })),
    conflict: g.conflict ?? null,
    firstSeenAt: g.firstSeenAt ?? null,
    slot: g.slot ?? 0,
  }));
}
