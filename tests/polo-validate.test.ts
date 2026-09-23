import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkSeason, checkSport, pageHeadings, validateFeed, validateSource } from '../scripts/lib/polo-validate.mjs';
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
});
