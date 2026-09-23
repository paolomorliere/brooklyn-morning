import type { Poll, PoloFeed, PoloGame, PoloTeam, PoloSourceStatus } from '@/types';

/** Games that happened on one date, newest date first. */
export interface PoloDay {
  date: string;
  games: PoloGame[];
}

/**
 * Within one day, the latest verified start time comes first — the last game of the day is the one
 * Paolo is looking for when he opens the screen.
 *
 * A game whose start time no source printed sorts after every game that has one. It is never given
 * an invented time to sort by, and ties break on the stable game id so the order does not wobble
 * between renders.
 */
export function byLatestFirst(x: PoloGame, y: PoloGame): number {
  if (!x.time && !y.time) return x.id.localeCompare(y.id);
  if (!x.time) return 1;
  if (!y.time) return -1;
  return y.time.localeCompare(x.time) || x.id.localeCompare(y.id);
}

/** Group by the date the game was played, newest day first, latest game first within each day. */
export function groupByDate(games: PoloGame[]): PoloDay[] {
  const byDate = new Map<string, PoloGame[]>();
  for (const g of games) {
    const list = byDate.get(g.date);
    if (list) list.push(g);
    else byDate.set(g.date, [g]);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, games: [...list].sort(byLatestFirst) }));
}

/** Every date that actually has a result, newest first — the date strip only offers these. */
export function datesWithResults(games: PoloGame[]): string[] {
  return [...new Set(games.map((g) => g.date))].sort().reverse();
}

/**
 * Step to the previous or next date that has results.
 * `dir` is -1 for older and +1 for newer, matching the on-screen arrows.
 * Returns null at either end so the control can be disabled rather than wrapping around.
 */
export function stepDate(dates: string[], current: string, dir: -1 | 1): string | null {
  const i = dates.indexOf(current);
  if (i === -1) return null;
  // `dates` runs newest first, so "older" moves forward through the array.
  const next = dir === -1 ? i + 1 : i - 1;
  return dates[next] ?? null;
}

/** "Saturday, August 29" — the day heading. */
export function formatDayHeading(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Aug 29" — the compact label on a date chip. */
export function formatDateChip(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "2:14 PM" in the reader's own timezone, from an ISO timestamp. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Initials for a team with no logo: "Mount St. Mary's" → "MS", "LIU" → "LI". */
export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Which side won, for emphasis. Null when the game was tied or the scores are withheld. */
export function winnerOf(game: PoloGame): 'home' | 'away' | null {
  const h = game.home.score;
  const a = game.away.score;
  if (h === null || a === null || h === a) return null;
  return h > a ? 'home' : 'away';
}

export interface Freshness {
  /** True only when every school was checked successfully. */
  complete: boolean;
  okCount: number;
  total: number;
  /** Display names of the schools that could not be checked this time. */
  failed: string[];
  /** The most recent successful check, which is what "checked at" honestly means. */
  checkedAt: string | null;
}

/**
 * What the freshness line may claim. A school that failed is never counted as checked, so the
 * screen can say "11 of 13" instead of implying everything is current.
 */
export function freshnessOf(sources: PoloSourceStatus[]): Freshness {
  const ok = sources.filter((s) => s.ok);
  const failed = sources.filter((s) => !s.ok);
  const checkedAt = ok.map((s) => s.checkedAt).sort().at(-1) ?? null;
  return {
    complete: failed.length === 0 && sources.length > 0,
    okCount: ok.length,
    total: sources.length,
    failed: failed.map((s) => s.display),
    checkedAt,
  };
}

/** Shape check before a downloaded feed is allowed to replace the cached one. */
export function validFeed(value: unknown): value is PoloFeed {
  const f = value as Partial<PoloFeed>;
  return (
    !!f &&
    f.schemaVersion === 1 &&
    typeof f.season === 'number' &&
    typeof f.builtAt === 'string' &&
    Array.isArray(f.games) &&
    Array.isArray(f.sources) &&
    !!f.teams &&
    typeof f.teams === 'object'
  );
}

/**
 * Games that count toward a record: a final score on both sides, and not an exhibition.
 * A withheld score is not a result, so it counts for nobody.
 */
export function counts(game: PoloGame): boolean {
  return !game.exhibition && game.home.score !== null && game.away.score !== null;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  played: number;
  scored: number;
  conceded: number;
}

const EMPTY_RECORD: TeamRecord = { wins: 0, losses: 0, ties: 0, played: 0, scored: 0, conceded: 0 };

/**
 * One team's record from its own completed games.
 *
 * Deliberately independent of every filter on the screen: conference and non-conference games count
 * alike, an overtime win is a win, and each game is counted once however many schools reported it.
 * Games without a final score and exhibitions are excluded rather than treated as anything.
 */
export function recordOf(games: PoloGame[], slug: string): TeamRecord {
  const seen = new Set<string>();
  const r = { ...EMPTY_RECORD };
  for (const g of games) {
    if (seen.has(g.id) || !counts(g)) continue;
    const side = g.home.team === slug ? 'home' : g.away.team === slug ? 'away' : null;
    if (!side) continue;
    seen.add(g.id);
    const mine = side === 'home' ? g.home.score! : g.away.score!;
    const theirs = side === 'home' ? g.away.score! : g.home.score!;
    r.played++;
    r.scored += mine;
    r.conceded += theirs;
    if (mine > theirs) r.wins++;
    else if (mine < theirs) r.losses++;
    else r.ties++;
  }
  return r;
}

/** "5–3", or "5–3–1" when a game finished level. En dashes, as the sport writes them. */
export function formatRecord(r: TeamRecord): string {
  return r.ties > 0 ? `${r.wins}–${r.losses}–${r.ties}` : `${r.wins}–${r.losses}`;
}

export interface StandingsRow {
  position: number;
  team: string;
  name: string;
  points: number;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  goalDifference: number;
  /** True when this team's own schedule page could not be read, so its row may be incomplete. */
  partial: boolean;
  /** True when the team has no conference game yet AND its source was read — a genuine zero. */
  unplayed: boolean;
}

/**
 * The conference table, computed here and stored nowhere.
 *
 * This is Paolo's own system — three points for a win, none for a loss — not the CWPA's official
 * standings or its tiebreakers. Only games the CWPA's conference schedule actually lists are
 * counted, each once. Every member of the official membership list gets a row even with no game
 * played, because a table missing a member would be wrong.
 *
 * Teams level on points and goal difference share a position; the alphabetical order between them
 * is for a stable display only and does not claim one is ahead of the other.
 */
export function standingsOf(
  games: PoloGame[],
  conference: 'MAWPC' | 'NWPC',
  members: string[],
  teams: Record<string, PoloTeam>,
): StandingsRow[] {
  const relevant = games.filter((g) => g.conference === conference);
  const rows = members.map((slug) => {
    const r = recordOf(relevant, slug);
    const coverage = teams[slug]?.coverage ?? 'full';
    return {
      position: 0,
      team: slug,
      name: teams[slug]?.name ?? slug,
      // Three points a win, nothing for a loss or a draw. Nothing else feeds this number.
      points: r.wins * 3,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      played: r.played,
      goalDifference: r.scored - r.conceded,
      partial: coverage === 'partial',
      unplayed: r.played === 0 && coverage !== 'partial',
    };
  });

  rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    const above = rows[i - 1];
    row.position =
      above && above.points === row.points && above.goalDifference === row.goalDifference ? above.position : i + 1;
  });
  return rows;
}

/** Every conference that has at least one member in this feed, in a fixed order. */
export const CONFERENCE_ORDER: Array<'NWPC' | 'MAWPC'> = ['NWPC', 'MAWPC'];

/** Shape check before a downloaded poll is allowed to replace the cached one. */
export function validPoll(value: unknown): value is Poll {
  const p = value as Partial<Poll>;
  return (
    !!p &&
    p.schemaVersion === 1 &&
    typeof p.season === 'number' &&
    typeof p.week === 'number' &&
    Array.isArray(p.rows) &&
    p.rows.length > 0 &&
    !!p.teams &&
    typeof p.teams === 'object'
  );
}

/** "September 16, 2026" — the poll's publication date, spelled out. */
export function formatLongDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
