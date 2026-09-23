import type { PoloFeed, PoloGame, PoloSourceStatus } from '@/types';

/** Games that happened on one date, newest date first. */
export interface PoloDay {
  date: string;
  games: PoloGame[];
}

/** Rows with no known start time sort last within their day; we never invent a time to order them. */
const timeRank = (t: string | null) => t ?? '99:99';

/**
 * Group by the date the game was played, newest day first, and order each day by start time.
 * Ties fall back to the game id so the order is the same on every render.
 */
export function groupByDate(games: PoloGame[]): PoloDay[] {
  const byDate = new Map<string, PoloGame[]>();
  for (const g of games) {
    const list = byDate.get(g.date);
    if (list) list.push(g);
    else byDate.set(g.date, [g]);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      games: [...list].sort(
        (x, y) => timeRank(x.time).localeCompare(timeRank(y.time)) || x.id.localeCompare(y.id),
      ),
    }));
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
