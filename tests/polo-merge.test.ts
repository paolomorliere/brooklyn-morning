import { describe, expect, it } from 'vitest';
import {
  buildTeams,
  fromFeedGames,
  gameKey,
  involvesWatched,
  mergeGames,
  toCandidates,
  toFeedGames,
} from '../scripts/lib/polo-merge.mjs';
import { SCHOOLS } from '../scripts/waterpolo.config.mjs';

const school = (id: string) => SCHOOLS.find((s) => s.id === id)!;
const AT = '2026-09-22T12:00:00.000Z';

/** A parsed row as the adapters produce it: `us` is always the page owner's score. */
const row = (over: Record<string, unknown> = {}) => ({
  sourceGameId: null,
  date: '2026-08-29',
  time: '10:00',
  opponentRaw: 'Wagner',
  us: 15,
  them: 10,
  outcome: 'W',
  ot: null,
  neutral: false,
  away: false,
  exhibition: false,
  venue: null,
  tournament: null,
  opponentLogo: null,
  detailUrl: null,
  ...over,
});

const run = (batches: [string, Record<string, unknown>[]][], archive: never[] | ReturnType<typeof fromFeedGames> = []) => {
  const candidates = batches.flatMap(([id, rows]) => toCandidates(rows as never, school(id), AT, 2026));
  const { games, stats } = mergeGames(archive as never, candidates);
  return { feed: toFeedGames(games), stats };
};

describe('one game, two schools', () => {
  it('collapses the Brown/Wagner game into a single row with each score on its own side', () => {
    // Brown's page: W, 15-10 vs Wagner.  Wagner's page: L, 10-15 at Brown.  One game.
    const { feed } = run([
      ['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10, away: false, neutral: null })]],
      ['wagner', [row({ opponentRaw: 'Brown', us: 10, them: 15, away: true, neutral: false })]],
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0].home).toEqual({ team: 'brown', score: 15 });
    expect(feed[0].away).toEqual({ team: 'wagner', score: 10 });
    expect(feed[0].sources.map((s) => s.id)).toEqual(['brown', 'wagner']);
  });

  it('never gives the winning score to the losing side', () => {
    const { feed } = run([['wagner', [row({ opponentRaw: 'Harvard', us: 6, them: 18, outcome: 'L', away: true, neutral: false })]]]);
    expect(feed[0].home).toEqual({ team: 'harvard', score: 18 });
    expect(feed[0].away).toEqual({ team: 'wagner', score: 6 });
  });

  it('matches across sites whose overtime spelling differs', () => {
    const { feed } = run([
      ['liu', [row({ opponentRaw: 'Wagner', us: 16, them: 15, time: '14:00', ot: '2OT', neutral: true })]],
      ['wagner', [row({ opponentRaw: 'LIU', us: 15, them: 16, time: '14:00', ot: '2OT', neutral: true })]],
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0].ot).toBe('2OT');
    expect(feed[0].neutral).toBe(true);
    expect(feed[0].hosted).toBeNull();
  });

  it('merges even when only one side records a start time', () => {
    const { feed } = run([
      ['liu', [row({ opponentRaw: 'Wagner', us: 16, them: 15, time: '14:00', neutral: true })]],
      ['wagner', [row({ opponentRaw: 'LIU', us: 15, them: 16, time: null, neutral: true })]],
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0].time).toBe('14:00');
  });
});

describe('same-day rematches stay separate', () => {
  it('keeps two meetings on one date apart by their start times', () => {
    const { feed } = run([
      ['liu', [
        row({ opponentRaw: 'Wagner', date: '2026-09-20', time: '12:30', us: 16, them: 13, neutral: true }),
        row({ opponentRaw: 'Wagner', date: '2026-09-20', time: '16:30', us: 9, them: 17, outcome: 'L', neutral: true }),
      ]],
    ]);
    expect(feed).toHaveLength(2);
    expect(feed.map((g) => g.time)).toEqual(['16:30', '12:30']);
    expect(new Set(feed.map((g) => g.id)).size).toBe(2);
  });

  it('still keeps them apart when the other school also reports both', () => {
    const rows = (a: number, b: number) => [
      row({ opponentRaw: 'Wagner', date: '2026-09-20', time: '12:30', us: a, them: b, neutral: true }),
      row({ opponentRaw: 'Wagner', date: '2026-09-20', time: '16:30', us: b, them: a, outcome: 'L', neutral: true }),
    ];
    const { feed } = run([
      ['liu', rows(16, 13)],
      ['wagner', [
        row({ opponentRaw: 'LIU', date: '2026-09-20', time: '12:30', us: 13, them: 16, outcome: 'L', neutral: true }),
        row({ opponentRaw: 'LIU', date: '2026-09-20', time: '16:30', us: 16, them: 13, neutral: true }),
      ]],
    ]);
    expect(feed).toHaveLength(2);
    expect(feed.every((g) => g.sources.length === 2)).toBe(true);
  });
});

describe('identity survives re-imports and corrections', () => {
  it('produces no extra rows when the same import runs again', () => {
    const batch: [string, Record<string, unknown>[]][] = [
      ['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]],
      ['wagner', [row({ opponentRaw: 'Brown', us: 10, them: 15, away: true })]],
    ];
    const first = run(batch);
    const second = run(batch, fromFeedGames(first.feed));
    expect(second.feed).toHaveLength(1);
    expect(second.stats.added).toBe(0);
    expect(second.feed[0].id).toBe(first.feed[0].id);
  });

  it('updates a corrected score in place instead of adding a row', () => {
    const first = run([['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]]]);
    const second = run([['brown', [row({ opponentRaw: 'Wagner', us: 16, them: 10 })]]], fromFeedGames(first.feed));
    expect(second.feed).toHaveLength(1);
    expect(second.feed[0].id).toBe(first.feed[0].id);
    expect(second.feed[0].home.score).toBe(16);
    expect(second.stats.corrected).toBe(1);
    expect(second.feed[0].conflict).toBeNull();
  });

  it('does not include the score in the identity', () => {
    expect(gameKey(2026, 'brown', 'wagner', '2026-08-29', 0)).toBe(gameKey(2026, 'wagner', 'brown', '2026-08-29', 0));
    expect(gameKey(2026, 'brown', 'wagner', '2026-08-29', 0)).not.toBe(gameKey(2026, 'brown', 'wagner', '2026-08-29', 1));
  });

  it('keeps a game that has vanished from the school’s page', () => {
    const first = run([['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]]]);
    const second = run([['brown', []]], fromFeedGames(first.feed));
    expect(second.feed).toHaveLength(1);
    expect(second.feed[0].home.score).toBe(15);
  });
});

describe('sources that disagree', () => {
  const disagree: [string, Record<string, unknown>[]][] = [
    ['george-washington', [row({ opponentRaw: 'Princeton', date: '2026-09-04', time: '18:00', us: 11, them: 23, outcome: 'L', neutral: true })]],
    ['princeton', [row({ opponentRaw: 'George Washington', date: '2026-09-04', time: '18:00', us: 23, them: 12, neutral: true })]],
  ];

  it('produces one row, not two, and records both readings verbatim', () => {
    const { feed, stats } = run(disagree);
    expect(feed).toHaveLength(1);
    expect(stats.conflicts).toBe(1);
    const readings = feed[0].conflict!.readings;
    expect(readings.find((r) => r.source === 'george-washington')!.scores['george-washington']).toBe(11);
    expect(readings.find((r) => r.source === 'princeton')!.scores['george-washington']).toBe(12);
  });

  it('uses the official recap recorded in the registry rather than guessing or averaging', () => {
    const { feed, stats } = run(disagree);
    expect(stats.resolved).toBe(1);
    const g = feed[0];
    expect(g.conflict!.withheld).toBe(false);
    expect(g.conflict!.resolved!.evidence).toContain('goprincetontigers.com');
    // Princeton 23, George Washington 12 — what the recap states.
    const score = (slug: string) => (g.home.team === slug ? g.home.score : g.away.score);
    expect(score('princeton')).toBe(23);
    expect(score('george-washington')).toBe(12);
  });

  it('withholds the numbers when nothing official settles it', () => {
    const { feed } = run([
      ['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]],
      ['wagner', [row({ opponentRaw: 'Brown', us: 11, them: 15, outcome: 'L', away: true })]],
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0].conflict!.withheld).toBe(true);
    expect(feed[0].home.score).toBeNull();
    expect(feed[0].away.score).toBeNull();
  });

  it('keeps the already-verified result when a second source later contradicts it', () => {
    const first = run([['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]]]);
    const second = run(
      [['wagner', [row({ opponentRaw: 'Brown', us: 11, them: 15, outcome: 'L', away: true })]]],
      fromFeedGames(first.feed),
    );
    expect(second.feed).toHaveLength(1);
    expect(second.feed[0].home.score).toBe(15);
    expect(second.feed[0].conflict!.withheld).toBe(false);
  });

  it('clears the warning once the sources agree again', () => {
    const conflicted = run([
      ['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]],
      ['wagner', [row({ opponentRaw: 'Brown', us: 11, them: 15, outcome: 'L', away: true })]],
    ]);
    expect(conflicted.feed[0].conflict).not.toBeNull();
    const fixed = run(
      [
        ['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10 })]],
        ['wagner', [row({ opponentRaw: 'Brown', us: 10, them: 15, outcome: 'L', away: true })]],
      ],
      fromFeedGames(conflicted.feed),
    );
    expect(fixed.feed[0].conflict).toBeNull();
    expect(fixed.feed[0].home.score).toBe(15);
  });
});

describe('scope and shape', () => {
  it('keeps only games involving a watched team', () => {
    expect(involvesWatched({ home: { team: 'liu' }, away: { team: 'gannon' } })).toBe(true);
    expect(involvesWatched({ home: { team: 'gannon' }, away: { team: 'mercyhurst' } })).toBe(false);
  });

  it('orders the feed newest date first, then latest start time first within the day', () => {
    const { feed } = run([['liu', [
      row({ opponentRaw: 'Gannon', date: '2026-08-29', time: '19:20', neutral: true }),
      row({ opponentRaw: 'Wagner', date: '2026-08-29', time: '14:00', neutral: true }),
      row({ opponentRaw: 'Navy', date: '2026-09-12', time: '15:30', neutral: true }),
    ]]]);
    expect(feed.map((g) => `${g.date} ${g.time}`)).toEqual(['2026-09-12 15:30', '2026-08-29 19:20', '2026-08-29 14:00']);
  });

  it('sorts a game with no known start time after every game that has one', () => {
    const { feed } = run([['liu', [
      row({ opponentRaw: 'Gannon', date: '2026-08-29', time: null, neutral: true }),
      row({ opponentRaw: 'Wagner', date: '2026-08-29', time: '14:00', neutral: true }),
      row({ opponentRaw: 'Navy', date: '2026-08-29', time: '19:20', neutral: true }),
    ]]]);
    expect(feed.map((g) => g.time)).toEqual(['19:20', '14:00', null]);
  });

  it('names watched teams from the registry, and others from the short-name list or the page', () => {
    const { feed } = run([['liu', [
      row({ opponentRaw: 'Connecticut College', us: 19, them: 7, neutral: true }),
      row({ opponentRaw: 'Gannon', date: '2026-08-30', us: 14, them: 13, neutral: true }),
    ]]]);
    const teams = buildTeams(
      feed,
      new Map([['connecticut-college', 'Connecticut College'], ['gannon', 'Gannon']]),
      new Map([['liu', 'logos/liu.webp']]),
    );
    // Watched team: the watchlist's own short name.
    expect(teams.liu).toEqual({ name: 'LIU', watched: true, logo: 'logos/liu.webp' });
    // Opponent with a preferred short name, so the row stays readable on a phone.
    expect(teams['connecticut-college']).toEqual({ name: 'Conn. College', watched: false, logo: null });
    // Opponent with no short name: exactly what the school's page printed.
    expect(teams.gannon).toEqual({ name: 'Gannon', watched: false, logo: null });
  });

  it('keeps every display name short enough for the results row', () => {
    const { feed } = run([['liu', [
      row({ opponentRaw: 'California Baptist University', us: 9, them: 12, outcome: 'L', neutral: true }),
      row({ opponentRaw: 'University of California - Santa Barbara', date: '2026-09-01', us: 9, them: 12, outcome: 'L', neutral: true }),
      row({ opponentRaw: "Saint Mary's College of California", date: '2026-09-02', us: 9, them: 12, outcome: 'L', neutral: true }),
    ]]]);
    const teams = buildTeams(feed, new Map(), new Map());
    for (const t of Object.values(teams)) expect(t.name.length).toBeLessThanOrEqual(20);
  });

  it('gives one school one identity however its name is spelled', () => {
    const { feed } = run([
      ['liu', [row({ opponentRaw: 'California Baptist University', us: 9, them: 12, outcome: 'L', neutral: true })]],
      ['wagner', [row({ opponentRaw: 'Cal Baptist', date: '2026-08-28', us: 8, them: 21, outcome: 'L', neutral: true })]],
      ['brown', [row({ opponentRaw: 'California Baptist', date: '2026-08-27', us: 16, them: 14, neutral: null })]],
    ]);
    const teams = buildTeams(feed, new Map(), new Map());
    expect(Object.keys(teams).filter((s) => s.includes('baptist'))).toEqual(['california-baptist']);
  });

  it('round-trips through the published shape without changing anything', () => {
    const { feed } = run([
      ['brown', [row({ opponentRaw: 'Wagner', us: 15, them: 10, venue: 'Providence, R.I.', tournament: 'Bruno Classic' })]],
      ['wagner', [row({ opponentRaw: 'Brown', us: 10, them: 15, away: true })]],
    ]);
    const again = toFeedGames(fromFeedGames(feed));
    expect(again).toEqual(feed);
  });
});
