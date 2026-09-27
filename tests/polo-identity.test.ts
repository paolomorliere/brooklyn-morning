import { describe, expect, it } from 'vitest';
import { buildIdentity, canonicalize, hostOf, namesCompatible } from '../scripts/lib/polo-identity.mjs';
import { fromFeedGames, repairIdentities, toFeedGames } from '../scripts/lib/polo-merge.mjs';

describe('what counts as the same school', () => {
  it('reads a hostname out of however a page wrote it', () => {
    expect(hostOf('http://www.cuigoldeneagles.com/')).toBe('cuigoldeneagles.com');
    expect(hostOf('https://cuigoldeneagles.com')).toBe('cuigoldeneagles.com');
    expect(hostOf(null)).toBeNull();
    expect(hostOf('not a url')).toBeNull();
  });

  it('treats a shorter name as compatible only when it starts the longer one', () => {
    expect(namesCompatible('Concordia', 'Concordia Irvine')).toBe(true);
    expect(namesCompatible('Pomona-Pitzer', 'Pomona-Pitzer Colleges')).toBe(true);
    // The mislink guard: San Diego is not the start of UC San Diego.
    expect(namesCompatible('San Diego', 'UC San Diego')).toBe(false);
    expect(namesCompatible('Navy', 'Fordham')).toBe(false);
    // Nor a fragment in the middle.
    expect(namesCompatible('Irvine', 'Concordia Irvine')).toBe(false);
  });
});

describe('the Concordia/Harvard duplicate', () => {
  // Exactly what the two pages printed on 26 September 2026.
  const rows = [
    { opponentRaw: 'Concordia', opponentSite: 'https://cuigoldeneagles.com', selfSlug: 'harvard', selfSite: 'https://gocrimson.com' },
    { opponentRaw: 'Harvard', opponentSite: 'https://gocrimson.com', selfSlug: 'concordia-irvine', selfSite: 'https://cuigoldeneagles.com' },
    { opponentRaw: 'Concordia Irvine', opponentSite: 'https://cuigoldeneagles.com', selfSlug: 'chapman', selfSite: 'https://chapmanathletics.com' },
  ];

  it('resolves both names to one team, on the host they share', () => {
    const { canonical, merges } = buildIdentity(rows);
    expect(canonicalize('concordia', canonical)).toBe('concordia-irvine');
    expect(canonicalize('concordia-irvine', canonical)).toBe('concordia-irvine');
    expect(merges.find((m) => m.merged)?.host).toBe('cuigoldeneagles.com');
  });

  it('does not merge every school whose name contains Concordia', () => {
    const { canonical } = buildIdentity([
      ...rows,
      // A different Concordia, on its own athletics site.
      { opponentRaw: 'Concordia Wisconsin', opponentSite: 'https://cuwfalcons.com', selfSlug: 'x', selfSite: 'https://x.com' },
    ]);
    expect(canonicalize('concordia-wisconsin', canonical)).toBe('concordia-wisconsin');
  });

  it('leaves a mislinked pair alone rather than renaming a team', () => {
    // One watched school links "UC San Diego" to the University of San Diego's site.
    const { canonical, merges } = buildIdentity([
      { opponentRaw: 'UC San Diego', opponentSite: 'https://usdtoreros.com', selfSlug: 'bucknell', selfSite: 'https://bucknellbison.com' },
      { opponentRaw: 'San Diego', opponentSite: 'https://usdtoreros.com', selfSlug: 'x', selfSite: 'https://x.com' },
    ]);
    expect(canonical.size).toBe(0);
    expect(merges[0]).toMatchObject({ merged: false });
  });

  it('never merges on a matching score alone', () => {
    // Two different schools, same opponent, same score, no shared host.
    const { canonical } = buildIdentity([
      { opponentRaw: 'Alpha', opponentSite: 'https://alpha.com', selfSlug: 'harvard', selfSite: 'https://gocrimson.com' },
      { opponentRaw: 'Beta', opponentSite: 'https://beta.com', selfSlug: 'harvard', selfSite: 'https://gocrimson.com' },
    ]);
    expect(canonical.size).toBe(0);
  });
});

describe('repairing what has already been published', () => {
  const published = [
    {
      id: 'aaa', date: '2026-09-26', time: '06:00', slot: 0, status: 'final' as const,
      home: { team: 'concordia-irvine', score: 19 }, away: { team: 'harvard', score: 18 },
      neutral: false, hosted: 'concordia-irvine', ot: null, exhibition: false, tournament: null, venue: null,
      conference: null, conferenceSource: null, conferenceMarker: null,
      sources: [{ id: 'concordia-irvine', url: 'https://cuigoldeneagles.com/s', verifiedAt: '2026-09-26T20:00:00Z', detailUrl: null, reading: { 'concordia-irvine': 19, harvard: 18 } }],
      conflict: null, firstSeenAt: '2026-09-26T20:00:00Z',
    },
    {
      id: 'bbb', date: '2026-09-26', time: '09:00', slot: 0, status: 'final' as const,
      home: { team: 'concordia', score: 19 }, away: { team: 'harvard', score: 18 },
      neutral: false, hosted: 'concordia', ot: null, exhibition: false, tournament: null, venue: null,
      conference: null, conferenceSource: null, conferenceMarker: null,
      sources: [{ id: 'harvard', url: 'https://gocrimson.com/s', verifiedAt: '2026-09-26T20:00:00Z', detailUrl: null, reading: { concordia: 19, harvard: 18 } }],
      conflict: null, firstSeenAt: '2026-09-26T20:00:00Z',
    },
  ];

  it('turns the two published rows into one, keeping both schools as sources', () => {
    const canonical = new Map([['concordia', 'concordia-irvine']]);
    const { games, rewritten, collapsed } = repairIdentities(fromFeedGames(published), canonical, 2026);
    expect(rewritten).toBe(1);
    expect(collapsed).toBe(1);
    expect(games).toHaveLength(1);

    const feed = toFeedGames(games);
    expect(feed[0].home.team).toBe('concordia-irvine');
    expect(feed[0].away.team).toBe('harvard');
    expect(feed[0].home.score).toBe(19);
    expect(feed[0].sources.map((s) => s.id).sort()).toEqual(['concordia-irvine', 'harvard']);
    // Each school's own reading is rewritten onto the canonical slug, so a disagreement that is
    // not one cannot reappear. A reading that simply repeats the result is not written to the file
    // and is rebuilt on read, so the round trip is what this checks.
    expect(feed[0].conflict).toBeNull();
    for (const src of fromFeedGames(feed)[0].sources) {
      const reading = src.reading as Record<string, number>;
      expect(Object.keys(reading).sort()).toEqual(['concordia-irvine', 'harvard']);
      expect(reading['concordia-irvine']).toBe(19);
    }
  });

  it('counts the repaired game once in each team’s record', () => {
    const canonical = new Map([['concordia', 'concordia-irvine']]);
    const feed = toFeedGames(repairIdentities(fromFeedGames(published), canonical, 2026).games);
    const played = (slug: string) => feed.filter((g) => g.home.team === slug || g.away.team === slug).length;
    expect(played('harvard')).toBe(1);
    expect(played('concordia-irvine')).toBe(1);
  });

  it('keeps a genuine same-day doubleheader as two games', () => {
    const doubleheader = [
      { ...published[0], id: 'd1', slot: 0, time: '08:00', home: { team: 'navy', score: 12 }, away: { team: 'austin-college', score: 5 }, hosted: 'navy', sources: [{ id: 'navy', url: 'u', verifiedAt: 't', detailUrl: null, reading: { navy: 12, 'austin-college': 5 } }] },
      { ...published[0], id: 'd2', slot: 1, time: '09:30', home: { team: 'navy', score: 14 }, away: { team: 'austin-college', score: 6 }, hosted: 'navy', sources: [{ id: 'navy', url: 'u', verifiedAt: 't', detailUrl: null, reading: { navy: 14, 'austin-college': 6 } }] },
    ];
    // A canonicalisation elsewhere must not disturb this bucket at all.
    const { games, collapsed } = repairIdentities(fromFeedGames(doubleheader), new Map([['concordia', 'concordia-irvine']]), 2026);
    expect(collapsed).toBe(0);
    expect(games).toHaveLength(2);
    expect(games.map((g) => g.id).sort()).toEqual(['d1', 'd2']);
  });

  it('does nothing at all when there is nothing to canonicalise', () => {
    const archive = fromFeedGames(published);
    expect(repairIdentities(archive, new Map(), 2026)).toEqual({ games: archive, rewritten: 0, collapsed: 0 });
  });
});
