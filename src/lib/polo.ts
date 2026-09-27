import type { Poll, PoloFeed, PoloGame, PoloTeam, PoloSourceStatus } from '@/types';
import { NY_TZ, mondayOfYMD, nyDate, shiftYMD } from '@/lib/lessons';

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
  return game.status === 'final' && !game.exhibition && game.home.score !== null && game.away.score !== null;
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

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** A published result. Nothing else counts toward a record or a standings table. */
export const isFinal = (g: PoloGame): boolean => g.status === 'final';

/** Still to be played, as far as the schools say. A start time in the past does not change this. */
export const isUpcoming = (g: PoloGame): boolean => g.status === 'scheduled';

/**
 * Has this fixture's start time passed without a result being published?
 *
 * Shown as "Awaiting result", never as a result. Schools post scores hours after a game, and a
 * fixture is not removed from the list merely because the clock has gone past it.
 */
export function awaitingResult(g: PoloGame, now: Date = new Date()): boolean {
  if (g.status !== 'scheduled') return false;
  const today = nyDate(now);
  if (g.date < today) return true;
  if (g.date > today) return false;
  if (!g.time) return false; // no start time to have passed
  const nowTime = new Intl.DateTimeFormat('en-GB', { timeZone: NY_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return etTimeOf(g) !== null && etTimeOf(g)! <= nowTime;
}

/**
 * The start time expressed in New York, or null when it cannot be worked out honestly.
 *
 * A time is only converted when a source made its zone certain. An away game whose venue names no
 * state keeps the time the page printed, and the screen labels it as the venue's local time rather
 * than claiming it is Eastern.
 */
export function etTimeOf(g: PoloGame): string | null {
  if (!g.time) return null;
  const zone = g.timeZone ?? null;
  if (!zone) return null;
  if (zone === NY_TZ) return g.time;
  // Build the instant that wall-clock time represents in the source zone, then read it in New York.
  const utc = zonedTimeToUtc(g.date, g.time, zone);
  if (!utc) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: NY_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(utc);
}

/** The UTC instant of a wall-clock date and time in a named zone. */
function zonedTimeToUtc(date: string, time: string, zone: string): Date | null {
  const guess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  // One correction pass is enough: read the guess back in the target zone and shift by the error.
  const seen = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess);
  const get = (t: string) => seen.find((p) => p.type === t)?.value ?? '00';
  const asSeen = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
  return new Date(guess.getTime() + (guess.getTime() - asSeen));
}

export interface FixtureTime {
  /** "7:00 PM", or null when no time was published. */
  text: string | null;
  /** 'et' when converted to New York, 'local' when the zone is unknown, 'tbd' when there is none. */
  kind: 'et' | 'local' | 'tbd';
  label: string;
}

/** How to show a fixture's start time without overstating what is known about it. */
export function fixtureTime(g: PoloGame): FixtureTime {
  if (!g.time) return { text: null, kind: 'tbd', label: 'Time TBD' };
  const et = etTimeOf(g);
  if (et) return { text: clockLabel(et), kind: 'et', label: `${clockLabel(et)} ET` };
  return { text: clockLabel(g.time), kind: 'local', label: `${clockLabel(g.time)} local` };
}

/** "19:00" → "7:00 PM". */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export interface Weekend {
  /** Friday of the Monday–Sunday week containing `now`, in New York. */
  from: string;
  /** Sunday of that same week. */
  to: string;
  label: string;
}

/**
 * The weekend of the current Monday–Sunday week in New York.
 *
 * On Monday that is the Friday, Saturday and Sunday still to come; during the weekend it is the
 * same three days, so a Saturday morning still shows Saturday and Sunday. It rolls over by itself
 * on the next Monday, because the week it is derived from does.
 */
export function weekendOf(now: Date | string = new Date()): Weekend {
  const today = typeof now === 'string' ? now : nyDate(now);
  const monday = mondayOfYMD(today);
  const from = shiftYMD(monday, 4);
  const to = shiftYMD(monday, 6);
  return { from, to, label: `${formatDateChip(from)} – ${formatDateChip(to)}` };
}

/** Fixtures inside a window, earliest first; a fixture with no time sorts after those that have one. */
export function fixturesBetween(games: PoloGame[], from: string, to: string): PoloGame[] {
  return games
    .filter((g) => isUpcoming(g) && g.date >= from && g.date <= to)
    .sort(byEarliestFirst);
}

/** Every remaining fixture for one team, earliest first. */
export function scheduleFor(games: PoloGame[], slug: string, from?: string): PoloGame[] {
  return games
    .filter((g) => (g.home.team === slug || g.away.team === slug) && g.status !== 'final' && (!from || g.date >= from))
    .sort(byEarliestFirst);
}

/**
 * Upcoming order: earliest date first, then earliest start time.
 * A fixture whose time has not been published sorts after the ones that have, never before.
 */
export function byEarliestFirst(x: PoloGame, y: PoloGame): number {
  if (x.date !== y.date) return x.date.localeCompare(y.date);
  const a = etTimeOf(x) ?? x.time;
  const b = etTimeOf(y) ?? y.time;
  if (!a && !b) return x.id.localeCompare(y.id);
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b) || x.id.localeCompare(y.id);
}

/** Group fixtures by date, earliest day first. */
export function groupUpcoming(games: PoloGame[]): PoloDay[] {
  const byDate = new Map<string, PoloGame[]>();
  for (const g of games) {
    const list = byDate.get(g.date);
    if (list) list.push(g);
    else byDate.set(g.date, [g]);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({ date, games: [...list].sort(byEarliestFirst) }));
}

/**
 * What a finished refresh attempt actually achieved.
 *
 * Pure, so the one question that matters — may this be called a success? — is decided in one place
 * and unit-tested. The rule is deliberately strict: a refresh is only a success when the workflow
 * published a **newly built** file. A run that finishes without publishing anything has not read
 * the schools, whatever its green tick on GitHub says, and gets its own outcome rather than being
 * dressed up as "no changes found".
 *
 * This case was not hypothetical. The manual dispatch used to be routed through the cron's
 * once-per-slot guard, so a manual refresh on a slot that had already run exited successfully in
 * ten seconds having fetched nothing, and the app announced "all 13 schools were read and nothing
 * has changed" over data that was hours old.
 */
export function refreshOutcome(input: {
  /** Did the published file's `builtAt` move past the value held when the attempt began? */
  rebuilt: boolean;
  /** Results that are final now and were not before. */
  added: number;
  /** Fixtures that are new, or whose date or time moved. */
  fixturesChanged: number;
  /** Sources the build itself reports as unread. */
  failedSources: number;
}): 'success' | 'unchanged' | 'partial' | 'nothing' {
  if (!input.rebuilt) return 'nothing';
  if (input.failedSources > 0) return 'partial';
  return input.added + input.fixturesChanged > 0 ? 'success' : 'unchanged';
}
