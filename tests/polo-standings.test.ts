import { describe, expect, it } from 'vitest';
import type { PoloGame, PoloTeam } from '@/types';
import { byLatestFirst, formatRecord, groupByDate, recordOf, standingsOf } from '@/lib/polo';

let n = 0;
const game = (over: Partial<PoloGame> = {}): PoloGame => ({
  id: `g${++n}`,
  date: '2026-09-19',
  time: '14:00',
  home: { team: 'fordham', score: 21 },
  away: { team: 'bucknell', score: 11 },
  neutral: false,
  hosted: 'bucknell',
  ot: null,
  exhibition: false,
  tournament: null,
  venue: null,
  conference: 'MAWPC',
  conferenceSource: 'https://collegiatewaterpolo.org/2026-mid-atlantic-water-polo-conference-schedule/',
  conferenceMarker: 'CWPA',
  sources: [],
  conflict: null,
  firstSeenAt: null,
  ...over,
});

const teams = (over: Record<string, Partial<PoloTeam>> = {}): Record<string, PoloTeam> =>
  Object.fromEntries(
    ['fordham', 'navy', 'george-washington', 'bucknell', 'mount-st-marys', 'mercyhurst', 'wagner'].map((slug) => [
      slug,
      { name: slug, watched: true, logo: null, coverage: 'full' as const, ...over[slug] },
    ]),
  );

const MAWPC = ['fordham', 'navy', 'george-washington', 'bucknell', 'mount-st-marys', 'mercyhurst', 'wagner'];

describe('a team’s season record', () => {
  it('counts wins and losses from whichever side the team is on', () => {
    const r = recordOf(
      [
        game({ home: { team: 'wagner', score: 17 }, away: { team: 'mercyhurst', score: 15 } }),
        game({ home: { team: 'bucknell', score: 19 }, away: { team: 'wagner', score: 14 } }),
        game({ home: { team: 'wagner', score: 9 }, away: { team: 'navy', score: 12 } }),
      ],
      'wagner',
    );
    expect(r).toMatchObject({ wins: 1, losses: 2, ties: 0, played: 3, scored: 40, conceded: 46 });
    expect(formatRecord(r)).toBe('1–2');
  });

  it('counts an overtime win as a win, like any other', () => {
    const r = recordOf([game({ home: { team: 'liu', score: 16 }, away: { team: 'wagner', score: 15 }, ot: '2OT' })], 'liu');
    expect(r.wins).toBe(1);
  });

  it('counts conference and non-conference games alike', () => {
    const r = recordOf(
      [
        game({ home: { team: 'fordham', score: 21 }, away: { team: 'bucknell', score: 11 }, conference: 'MAWPC' }),
        game({ home: { team: 'fordham', score: 12 }, away: { team: 'ucla', score: 20 }, conference: null }),
      ],
      'fordham',
    );
    expect(r).toMatchObject({ wins: 1, losses: 1, played: 2 });
  });

  it('never counts a game whose score is withheld, and never as a 0-0', () => {
    const r = recordOf([game({ home: { team: 'liu', score: null }, away: { team: 'iona', score: null } })], 'liu');
    expect(r).toMatchObject({ wins: 0, losses: 0, ties: 0, played: 0 });
  });

  it('leaves exhibitions out', () => {
    const r = recordOf([game({ home: { team: 'liu', score: 20 }, away: { team: 'iona', score: 3 }, exhibition: true })], 'liu');
    expect(r.played).toBe(0);
  });

  it('counts a game once however many times it appears', () => {
    const g = game({ home: { team: 'brown', score: 15 }, away: { team: 'wagner', score: 10 } });
    expect(recordOf([g, { ...g }, { ...g }], 'brown')).toMatchObject({ wins: 1, played: 1 });
  });

  it('records a level game as neither a win nor a loss', () => {
    const r = recordOf([game({ home: { team: 'liu', score: 9 }, away: { team: 'iona', score: 9 } })], 'liu');
    expect(r).toMatchObject({ wins: 0, losses: 0, ties: 1 });
    expect(formatRecord(r)).toBe('0–0–1');
  });

  it('is the same whatever the screen is filtered to, because it reads the games it is given', () => {
    const all = [
      game({ date: '2026-09-19', home: { team: 'wagner', score: 17 }, away: { team: 'mercyhurst', score: 15 } }),
      game({ date: '2026-09-20', home: { team: 'bucknell', score: 19 }, away: { team: 'wagner', score: 14 } }),
    ];
    expect(recordOf(all, 'wagner')).toMatchObject({ wins: 1, losses: 1 });
    // Filtering the screen to one day must not be allowed to change it: the screen passes the
    // whole feed to this helper, not the filtered list.
    expect(recordOf(all.filter((g) => g.date === '2026-09-19'), 'wagner')).toMatchObject({ wins: 1, losses: 0 });
  });
});

describe('the conference table', () => {
  const played = [
    game({ date: '2026-09-19', home: { team: 'bucknell', score: 11 }, away: { team: 'fordham', score: 21 } }),
    game({ date: '2026-09-19', home: { team: 'mount-st-marys', score: 5 }, away: { team: 'fordham', score: 23 } }),
    game({ date: '2026-09-19', home: { team: 'mercyhurst', score: 3 }, away: { team: 'fordham', score: 26 } }),
    game({ date: '2026-09-20', home: { team: 'bucknell', score: 19 }, away: { team: 'wagner', score: 14 } }),
    game({ date: '2026-09-20', home: { team: 'mercyhurst', score: 15 }, away: { team: 'wagner', score: 17 } }),
    game({ date: '2026-09-04', home: { team: 'mount-st-marys', score: 14 }, away: { team: 'navy', score: 15 } }),
  ];

  it('gives three points a win and nothing else', () => {
    const rows = standingsOf(played, 'MAWPC', MAWPC, teams());
    const by = Object.fromEntries(rows.map((r) => [r.team, r]));
    expect(by.fordham).toMatchObject({ points: 9, wins: 3, losses: 0, goalDifference: 70 - 19 });
    expect(by.wagner).toMatchObject({ points: 3, wins: 1, losses: 1, goalDifference: 31 - 34 });
    expect(by.mercyhurst).toMatchObject({ points: 0, wins: 0, losses: 2 });
  });

  it('orders by points, then goal difference', () => {
    const rows = standingsOf(played, 'MAWPC', MAWPC, teams());
    expect(rows.map((r) => r.team)).toEqual([
      'fordham', // 9 points, +51
      'navy', // 3, +1
      'wagner', // 3, -3
      'bucknell', // 3, -5
      'george-washington', // 0, no game played yet
      'mount-st-marys', // 0, -19
      'mercyhurst', // 0, -25
    ]);
  });

  it('gives every member a row, including one that has not played yet', () => {
    const rows = standingsOf(played, 'MAWPC', MAWPC, teams());
    expect(rows).toHaveLength(7);
    const gw = rows.find((r) => r.team === 'george-washington')!;
    expect(gw).toMatchObject({ played: 0, points: 0, unplayed: true, partial: false });
  });

  it('distinguishes a genuine zero from a team whose own page could not be read', () => {
    const rows = standingsOf(played, 'MAWPC', MAWPC, teams({ 'george-washington': { coverage: 'partial' } }));
    const gw = rows.find((r) => r.team === 'george-washington')!;
    expect(gw).toMatchObject({ played: 0, unplayed: false, partial: true });
  });

  it('shares a position between teams level on points and goal difference', () => {
    const level = [
      game({ date: '2026-10-03', home: { team: 'wagner', score: 12 }, away: { team: 'mercyhurst', score: 10 } }),
      game({ date: '2026-10-04', home: { team: 'navy', score: 12 }, away: { team: 'mount-st-marys', score: 10 } }),
    ];
    const rows = standingsOf(level, 'MAWPC', MAWPC, teams());
    expect(rows.slice(0, 2).map((r) => r.position)).toEqual([1, 1]);
    expect(rows.slice(0, 2).map((r) => r.team)).toEqual(['navy', 'wagner']); // alphabetical, for display only
  });

  it('counts only games the CWPA listed, never two members simply meeting', () => {
    const invitational = game({
      date: '2026-08-30',
      home: { team: 'fordham', score: 14 },
      away: { team: 'navy', score: 9 },
      conference: null, // the CWPA schedule does not list this fixture
      conferenceMarker: null,
    });
    const rows = standingsOf([...played, invitational], 'MAWPC', MAWPC, teams());
    expect(rows.find((r) => r.team === 'fordham')!.wins).toBe(3);
    expect(rows.find((r) => r.team === 'navy')!.losses).toBe(0);
  });

  it('ignores the other conference’s games', () => {
    const nwpc = game({ date: '2026-09-12', home: { team: 'iona', score: 10 }, away: { team: 'brown', score: 14 }, conference: 'NWPC' });
    expect(standingsOf([...played, nwpc], 'MAWPC', MAWPC, teams())).toEqual(standingsOf(played, 'MAWPC', MAWPC, teams()));
  });

  it('counts a duplicated game once', () => {
    const doubled = [...played, { ...played[0] }];
    expect(standingsOf(doubled, 'MAWPC', MAWPC, teams()).find((r) => r.team === 'fordham')!.wins).toBe(3);
  });

  it('recomputes from the games, so a correction moves both teams at once', () => {
    const corrected = played.map((g) =>
      g.home.team === 'bucknell' && g.away.team === 'wagner'
        ? { ...g, home: { team: 'bucknell', score: 13 }, away: { team: 'wagner', score: 14 } }
        : g,
    );
    const before = standingsOf(played, 'MAWPC', MAWPC, teams());
    const after = standingsOf(corrected, 'MAWPC', MAWPC, teams());
    expect(before.find((r) => r.team === 'bucknell')!.points).toBe(3);
    expect(after.find((r) => r.team === 'bucknell')!.points).toBe(0);
    expect(after.find((r) => r.team === 'wagner')!.points).toBe(6);
  });

  it('never counts a withheld score for either side', () => {
    const withheld = game({ date: '2026-10-05', home: { team: 'navy', score: null }, away: { team: 'wagner', score: null } });
    const rows = standingsOf([...played, withheld], 'MAWPC', MAWPC, teams());
    expect(rows.find((r) => r.team === 'navy')!.played).toBe(1);
    expect(rows.find((r) => r.team === 'wagner')!.played).toBe(2);
  });
});

describe('order within a day', () => {
  it('puts the latest start time first', () => {
    const list = [
      game({ id: 'a', time: '09:00' }),
      game({ id: 'b', time: '16:30' }),
      game({ id: 'c', time: '12:00' }),
    ];
    expect([...list].sort(byLatestFirst).map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts a game with no known time last, rather than inventing one', () => {
    const list = [game({ id: 'a', time: null }), game({ id: 'b', time: '09:00' })];
    expect([...list].sort(byLatestFirst).map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('keeps day groups newest first with the last game of each day at the top', () => {
    const days = groupByDate([
      game({ id: 'a', date: '2026-09-19', time: '10:00' }),
      game({ id: 'b', date: '2026-09-19', time: '16:00' }),
      game({ id: 'c', date: '2026-09-20', time: '11:00' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-09-20', '2026-09-19']);
    expect(days[1].games.map((g) => g.id)).toEqual(['b', 'a']);
  });
});
