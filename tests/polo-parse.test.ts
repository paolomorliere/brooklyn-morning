import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeOvertime,
  parseClassic,
  parseGameDate,
  parseNextgen,
  parseResult,
  parseTime,
} from '../scripts/lib/polo-parse.mjs';
import { isNonTeam, teamSlug } from '../scripts/waterpolo.config.mjs';

const fixture = (name: string) => readFileSync(resolve('tests/fixtures', name), 'utf8');

const WAGNER = { url: 'https://wagnerathletics.com/sports/mens-polo/schedule/2026', generation: 'classic' as const, seasonYear: 2026 };
const BROWN = { url: 'https://brownbears.com/sports/mens-water-polo/schedule/2026', generation: 'nextgen' as const, seasonYear: 2026 };

describe('score parsing', () => {
  it('reads the school’s own score first, then the opponent’s', () => {
    expect(parseResult('W, 16-15')).toEqual({ outcome: 'W', us: 16, them: 15, ot: null });
    expect(parseResult('L, 8-21')).toEqual({ outcome: 'L', us: 8, them: 21, ot: null });
  });
  it('keeps the two sites’ overtime spellings in one form', () => {
    expect(parseResult('L, 15-16 (2 OT)')?.ot).toBe('2OT');
    expect(parseResult('W, 16-15 2OT')?.ot).toBe('2OT');
    expect(normalizeOvertime('OT')).toBe('OT');
    expect(normalizeOvertime('(1 OT)')).toBe('OT');
    expect(normalizeOvertime(null)).toBeNull();
  });
  it('returns nothing rather than a 0-0 when there is no final score', () => {
    for (const s of ['', 'TBA', '1 p.m.', 'Postponed', 'Canceled', 'W,', 'Final']) {
      expect(parseResult(s)).toBeNull();
    }
  });
  it('rejects a row whose outcome contradicts its numbers', () => {
    expect(parseResult('W, 8-21')).toBeNull();
    expect(parseResult('L, 21-8')).toBeNull();
    expect(parseResult('T, 9-10')).toBeNull();
  });
});

describe('date and time parsing', () => {
  it('puts autumn months in the season’s opening year', () => {
    expect(parseGameDate('Aug 29 (Sat)', 2026)?.date).toBe('2026-08-29');
    expect(parseGameDate('Dec 6 (Sun)', 2026)?.date).toBe('2026-12-06');
  });
  it('rolls January into the following calendar year', () => {
    expect(parseGameDate('Jan 4 (Sun)', 2026)?.date).toBe('2027-01-04');
  });
  it('reads a 24-hour time and keeps Eastern when two zones are printed', () => {
    expect(parseTime('2 p.m.')).toBe('14:00');
    expect(parseTime('6:15 p.m.')).toBe('18:15');
    expect(parseTime('10 a.m.')).toBe('10:00');
    expect(parseTime('12:30 p.m.')).toBe('12:30');
    expect(parseTime('1 p.m. ET/10 a.m. PT')).toBe('13:00');
  });
  it('leaves the time null rather than inventing one', () => {
    expect(parseTime('Aug 29 (Sat)')).toBeNull();
    expect(parseGameDate('Aug 29 (Sat)', 2026)?.time).toBeNull();
  });
});

describe('classic Sidearm pages', () => {
  const rows = parseClassic(fixture('classic-wagner.html'), WAGNER);

  it('emits one game per <li>, not one per mobile/desktop copy', () => {
    // The fixture holds four games; each <li> repeats itself as a mobile row and a desktop row.
    const ids = rows.map((r) => r.sourceGameId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows).toHaveLength(4);
  });

  it('reads Wagner’s loss at Brown from Wagner’s perspective', () => {
    const g = rows.find((r) => r.opponentRaw === 'Brown')!;
    expect(g).toMatchObject({ date: '2026-08-29', us: 10, them: 15, outcome: 'L', away: true, neutral: false });
  });

  it('records a two-overtime game and its neutral site', () => {
    const g = rows.find((r) => r.opponentRaw === 'LIU')!;
    expect(g).toMatchObject({ date: '2026-08-29', us: 15, them: 16, ot: '2OT', neutral: true });
  });

  it('carries the tournament through from the wrapper above the games', () => {
    expect(rows.every((r) => r.tournament === 'Bruno Classic')).toBe(true);
  });
});

describe('newer Sidearm pages', () => {
  const rows = parseNextgen(fixture('nextgen-brown.html'), BROWN);

  it('reads Brown’s win over Wagner — the same game the classic page reports as a loss', () => {
    const g = rows.find((r) => r.opponentRaw === 'Wagner')!;
    expect(g).toMatchObject({ date: '2026-08-29', time: '10:00', us: 15, them: 10, outcome: 'W' });
  });

  it('marks an exhibition from its badge', () => {
    expect(rows.find((r) => r.opponentRaw === 'Pacific')!.exhibition).toBe(true);
    expect(rows.find((r) => r.opponentRaw === 'Wagner')!.exhibition).toBe(false);
  });

  it('treats "at" as the opponent hosting, and leaves the neutral flag unknown', () => {
    const away = rows.find((r) => r.opponentRaw === 'Iona')!;
    expect(away.away).toBe(true);
    expect(away.neutral).toBeNull();
  });

  it('links the official recap when the card offers one', () => {
    const g = rows.find((r) => r.opponentRaw === 'Wagner')!;
    expect(g.detailUrl).toMatch(/^https:\/\/brownbears\.com\/news\//);
  });
});

describe('team identity', () => {
  it('strips rankings and division tags', () => {
    expect(teamSlug('No. 13 UC Irvine')).toBe('uc-irvine');
    expect(teamSlug('#13 California Baptist')).toBe('california-baptist');
    expect(teamSlug('(RV) LIU')).toBe('liu');
    expect(teamSlug('No. 3 (D-III) Redlands')).toBe('redlands');
  });
  it('keeps Mount St. Mary’s apart from Saint Mary’s College of California', () => {
    expect(teamSlug("Mount St. Mary's (Md.)")).toBe('mount-st-marys');
    expect(teamSlug("Mt. St. Mary's")).toBe('mount-st-marys');
    expect(teamSlug("Mount Saint Mary's")).toBe('mount-st-marys');
    expect(teamSlug("Saint Mary's College of California")).toBe('saint-marys-ca');
    expect(teamSlug("St. Mary's")).toBe('saint-marys-ca');
    expect(teamSlug("Mount St. Mary's")).not.toBe(teamSlug("Saint Mary's College of California"));
  });
  it('resolves the aliases the schools actually print', () => {
    expect(teamSlug('Long Island University')).toBe('liu');
    expect(teamSlug('LIU')).toBe('liu');
    expect(teamSlug('United States Naval Academy')).toBe('navy');
    expect(teamSlug('Naval Academy')).toBe('navy');
    expect(teamSlug('Biola (Calif.)')).toBe('biola');
  });
  it('rejects page furniture that sits where an opponent would', () => {
    expect(isNonTeam('NWPC Tournament')).toBe(true);
    expect(isNonTeam('TBA')).toBe(true);
    expect(isNonTeam('Princeton')).toBe(false);
  });
});
