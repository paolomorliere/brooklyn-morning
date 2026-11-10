import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkSeason, checkSport, feedProblems, gameProblems, pageHeadings, partitionProblems, quarantineRows, validateFeed, validateSource } from '../scripts/lib/polo-validate.mjs';
import { parseClassic } from '../scripts/lib/polo-parse.mjs';
import { SCHOOLS } from '../scripts/waterpolo.config.mjs';

const fixture = (name: string) => readFileSync(resolve('tests/fixtures', name), 'utf8');
const school = (id: string) => SCHOOLS.find((s) => s.id === id)!;
const rowsFrom = (name: string, id: string) =>
  parseClassic(fixture(name), { url: school(id).url, generation: 'classic', seasonYear: 2026 });

describe('season gate', () => {
  it('accepts the season the page names', () => {
    const v = validateSource(fixture('classic-wagner.html'), rowsFrom('classic-wagner.html', 'wagner'), school('wagner'));
    expect(v.ok).toBe(true);
  });

  it('rejects an older season served from the same URL shape', () => {
    // The real trap: wagnerathletics.com/.../schedule/2019 returns 2019 games while the site's
    // season <select> still reports 2026 as "current".
    const html = fixture('classic-wagner-2019.html');
    const rows = parseClassic(html, { url: school('wagner').url, generation: 'classic', seasonYear: 2026 });
    const v = validateSource(html, rows, school('wagner'));
    expect(v.ok).toBe(false);
    expect(v.why).toContain('2019');
  });

  it('falls back to the game dates when the page names no year', () => {
    const headings = { title: 'Long Island University Athletics', h1: 'Long Island University', ogTitle: '' };
    expect(checkSeason(headings, [{ date: '2026-09-11' }, { date: '2026-08-29' }] as never, 2026).ok).toBe(true);
    const wrong = checkSeason(headings, [{ date: '2025-09-11' }] as never, 2026);
    expect(wrong.ok).toBe(false);
    expect(wrong.why).toContain('outside');
  });

  it('refuses a page that names no season and lists no games, rather than guessing', () => {
    const headings = { title: 'Some University Athletics', h1: 'Athletics', ogTitle: '' };
    expect(checkSeason(headings, [], 2026).ok).toBe(false);
  });

  it('reads the season from og:title when the title has none', () => {
    const html = fixture('classic-liu.html');
    expect(pageHeadings(html).ogTitle).toContain('2026');
    const v = validateSource(html, rowsFrom('classic-liu.html', 'liu'), school('liu'));
    expect(v.ok).toBe(true);
  });
});

describe('sport gate', () => {
  const headings = (title: string, ogTitle = '') => ({ title, h1: '', ogTitle });

  it("rejects a women's page", () => {
    const v = checkSport(
      'https://gwsports.com/sports/mens-water-polo/schedule/2026',
      headings("2020 Women's Water Polo Schedule - George Washington"),
      school('george-washington'),
    );
    expect(v.ok).toBe(false);
    expect(v.why).toContain('women');
  });

  it('rejects a URL that is not the configured sport', () => {
    expect(checkSport('https://gocrimson.com/sports/mens-soccer/schedule/2026', headings("2026 Men's Water Polo"), school('harvard')).ok).toBe(false);
  });

  it("accepts GW's page, which omits “Men’s”, only because the registry records why", () => {
    const gw = school('george-washington');
    expect(gw.sportNote).toBeTruthy();
    const v = checkSport(gw.url, headings('2026 Water Polo Schedule - George Washington University Athletics'), gw);
    expect(v.ok).toBe(true);
    // The same page without that recorded exception would be refused.
    expect(checkSport(gw.url, headings('2026 Water Polo Schedule'), { ...gw, sportNote: undefined }).ok).toBe(false);
  });

  it('accepts Wagner’s non-standard sport slug', () => {
    const w = school('wagner');
    expect(w.sportSlug).toBe('mens-polo');
    expect(checkSport(w.url, headings("2026 Men's Water Polo Schedule"), w).ok).toBe(true);
  });
});

describe('whole-feed gate', () => {
  const game = (over: Record<string, unknown> = {}) => ({
    id: 'aaa1',
    date: '2026-09-12',
    time: '15:30',
    home: { team: 'liu', score: 8 },
    away: { team: 'navy', score: 22 },
    neutral: true,
    hosted: null,
    ot: null,
    exhibition: false,
    tournament: null,
    venue: null,
    sources: [{ id: 'liu', url: 'x', verifiedAt: 'y', detailUrl: null, reading: null }],
    conflict: null,
    firstSeenAt: null,
    ...over,
  });
  const feed = (games: unknown[]) => ({
    schemaVersion: 1,
    season: 2026,
    sport: "Men's Water Polo",
    builtAt: 'now',
    sources: [],
    teams: { liu: {}, navy: {}, brown: {} },
    games,
  });

  it('passes a sound feed', () => {
    expect(validateFeed(feed([game()]))).toEqual([]);
  });
  it('catches a duplicate id, a date outside the season and a missing source', () => {
    expect(validateFeed(feed([game(), game()]))[0]).toContain('duplicate');
    expect(validateFeed(feed([game({ date: '2025-09-12' })]))[0]).toContain('outside the season');
    expect(validateFeed(feed([game({ sources: [] })]))[0]).toContain('provenance');
  });
  it('catches a team that is not in the teams table', () => {
    expect(validateFeed(feed([game({ away: { team: 'ghost', score: 1 } })])).join()).toContain('unknown team');
  });
  it('rejects a null score unless the game is a withheld conflict', () => {
    expect(validateFeed(feed([game({ home: { team: 'liu', score: null } })])).join()).toContain('bad home score');
    const withheld = game({
      home: { team: 'liu', score: null },
      away: { team: 'navy', score: null },
      conflict: { detectedAt: 'x', readings: [], withheld: true },
    });
    expect(validateFeed(feed([withheld]))).toEqual([]);
  });

  // Why this split exists: for eight days in November 2026 one impossible row stopped the whole
  // feed from being written. A bad row and a bad feed are not the same failure and must not have
  // the same consequence.
  describe('telling a bad row apart from a bad feed', () => {
    it('reports a sound feed as sound on both counts', () => {
      const { fatal, rows } = partitionProblems(feed([game()]));
      expect(fatal).toEqual([]);
      expect(rows).toEqual([]);
    });

    it('puts the same-team-both-sides row in rows, and leaves fatal empty', () => {
      const self = game({ home: { team: 'liu', score: 11 }, away: { team: 'liu', score: 9 } });
      const { fatal, rows } = partitionProblems(feed([game(), self]));
      expect(fatal).toEqual([]);
      expect(rows).toHaveLength(1);
      expect(rows[0].game).toBe(self);
      expect(rows[0].problems.join()).toContain('same team on both sides');
    });

    it('puts a wrong season in fatal, where no row can be salvaged', () => {
      const bad = { ...feed([game()]), season: 2025 };
      const { fatal, rows } = partitionProblems(bad);
      expect(fatal.join()).toContain('is not 2026');
      expect(rows).toEqual([]);
    });

    it('blames the second row for a duplicate id, so the first one survives', () => {
      const a = game();
      const b = game();
      const { rows } = partitionProblems(feed([a, b]));
      expect(rows).toHaveLength(1);
      expect(rows[0].game).toBe(b);
    });

    it('finds the same problems as validateFeed when every id is distinct', () => {
      const broken = feed([
        game({ id: 'one', sources: [] }),
        game({ id: 'two', away: { team: 'ghost', score: 1 } }),
      ]);
      const { fatal, rows } = partitionProblems(broken);
      expect([...fatal, ...rows.flatMap((r) => r.problems)].sort()).toEqual(validateFeed(broken).sort());
    });

    // The one place the two deliberately disagree. `validateFeed` only ever answers "is this whole
    // feed sound", so it counts an id it has seen even on a row it has already condemned.
    // `partitionProblems` answers "which rows must go", and a row that is going cannot also be the
    // reason the next row is a duplicate — once the first is dropped, the second id is unique.
    it('does not call a row a duplicate of a row that is itself being dropped', () => {
      const broken = feed([game({ sources: [] }), game()]);
      expect(validateFeed(broken).join()).toContain('duplicate');
      const { rows } = partitionProblems(broken);
      expect(rows).toHaveLength(1);
      expect(rows[0].problems.join()).toContain('provenance');
      expect(rows.flatMap((r) => r.problems).join()).not.toContain('duplicate');
    });

    it('checks one game on its own, which is what lets a row be replaced by its last good version', () => {
      const f = feed([]);
      expect(gameProblems(game(), f)).toEqual([]);
      expect(gameProblems(game({ away: { team: 'ghost', score: 1 } }), f).join()).toContain('unknown team');
      expect(feedProblems(f)).toEqual([]);
    });
  });

  // The behaviour the eight-day outage should have had. Each of these is a day the app would have
  // kept moving instead of silently freezing on 2 November 2026.
  describe('quarantining the rows that cannot be published', () => {
    const sound = (id: string) => game({ id, away: { team: 'navy', score: 7 } });

    it('writes the feed untouched when every row is sound', () => {
      const f = feed([sound('a'), sound('b')]);
      const out = quarantineRows(f);
      expect(out.write).toBe(true);
      expect(out.games).toHaveLength(2);
      expect(out.rescued).toEqual([]);
      expect(out.discarded).toEqual([]);
    });

    it('drops the one unsound row and publishes the rest', () => {
      const bad = game({ id: 'bad', home: { team: 'liu', score: 'x' } });
      const f = feed([sound('a'), bad, sound('b')]);
      const out = quarantineRows(f);
      expect(out.write).toBe(true);
      expect(out.games.map((g: { id: string }) => g.id)).toEqual(['a', 'b']);
      expect(out.discarded).toHaveLength(1);
      expect(out.discarded[0].game).toBe(bad);
      expect(out.rescued).toEqual([]);
    });

    it('keeps the last published version of a row rather than losing the game', () => {
      const good = sound('x');
      const broken = game({ id: 'x', home: { team: 'liu', score: null }, away: { team: 'navy', score: 7 } });
      const f = feed([sound('a'), broken]);
      const out = quarantineRows(f, feed([good]));
      expect(out.write).toBe(true);
      expect(out.rescued).toHaveLength(1);
      expect(out.discarded).toEqual([]);
      // The published row is back in the feed, scores and all.
      const restored = out.games.find((g: { id: string }) => g.id === 'x');
      expect(restored).toBe(good);
      expect(restored.home.score).toBe(8);
    });

    it('drops a row whose published version is just as unsound', () => {
      const brokenBefore = game({ id: 'x', home: { team: 'liu', score: null }, away: { team: 'navy', score: 7 } });
      const brokenNow = game({ id: 'x', home: { team: 'liu', score: null }, away: { team: 'navy', score: 7 } });
      const out = quarantineRows(feed([brokenNow]), feed([brokenBefore]));
      expect(out.rescued).toEqual([]);
      expect(out.discarded).toHaveLength(1);
      expect(out.games).toEqual([]);
    });

    it('publishes nothing when more rows fail than the allowance covers — that is a broken build', () => {
      const rows = Array.from({ length: 4 }, (_, i) => game({ id: `b${i}`, sources: [] }));
      const out = quarantineRows(feed(rows), null, 3);
      expect(out.systemic).toBe(true);
      expect(out.write).toBe(false);
      // The caller keeps the published file, so the games it hands back are the unfiltered ones.
      expect(out.games).toHaveLength(4);
      expect(out.rescued).toEqual([]);
      expect(out.discarded).toEqual([]);
    });

    it('publishes nothing when the feed itself is wrong, however good the rows are', () => {
      const out = quarantineRows({ ...feed([sound('a')]), season: 2025 });
      expect(out.write).toBe(false);
      expect(out.fatal.join()).toContain('is not 2026');
    });

    it('allows five bad rows in a small feed and one percent in a large one', () => {
      expect(quarantineRows(feed([sound('a')])).limit).toBe(5);
      const many = Array.from({ length: 800 }, (_, i) => sound(`g${i}`));
      expect(quarantineRows(feed(many)).limit).toBe(8);
    });
  });
});
