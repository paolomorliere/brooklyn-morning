import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parsePollArticle,
  parsePollIndex,
  parsePreviousHeader,
  parsePublished,
  supersedes,
  validatePoll,
} from '../scripts/lib/poll-parse.mjs';

const article = readFileSync('tests/fixtures/cwpa-poll-week3.html', 'utf8');
const index = readFileSync('tests/fixtures/cwpa-polls-index.html', 'utf8');
const URL3 = 'https://collegiatewaterpolo.org/polls/2026-mens-varsity-polls-week-3-september-16/';

/** The Week 3 article, already asserted to have parsed, so the tests can read `.poll` directly. */
function week3() {
  const r = parsePollArticle(article, { url: URL3, season: 2026, week: 3 });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('finding the newest poll', () => {
  it('lists the 2026 weekly polls, newest first', () => {
    const found = parsePollIndex(index, 2026);
    expect(found.map((f) => f.week)).toEqual([3, 2, 1]);
    expect(found[0].url).toBe(URL3);
  });

  it('does not offer the preseason poll as a weekly one', () => {
    expect(parsePollIndex(index, 2026).some((f) => /preseason/i.test(f.url))).toBe(false);
  });

  it('ignores other seasons', () => {
    expect(parsePollIndex(index, 2025).every((f) => f.url.includes('/2025-'))).toBe(true);
    expect(parsePollIndex(index, 2099)).toEqual([]);
  });
});

describe('reading the Top 20 table', () => {
  it('takes the national table and not the Division III or conference ones', () => {
    const r = week3();
    expect(r.ok).toBe(true);
    expect(r.poll.title).toBe("2026 Men's Varsity Top 20");
    // The Division III Top 10 and the two conference Top 5s are on the same page.
    expect(r.poll.rows.some((x) => x.team === 'claremont-mudd-scripps')).toBe(false);
    expect(r.poll.rows.filter((x) => x.rank === '1')).toHaveLength(1);
  });

  it('keeps all 22 published rows, including the two receiving votes', () => {
    const rows = week3().poll.rows;
    expect(rows).toHaveLength(22);
    expect(rows.filter((r) => r.rank === 'RV').map((r) => r.team)).toEqual(['harvard', 'air-force']);
  });

  it('keeps ties verbatim rather than inventing an order', () => {
    const rows = week3().poll.rows;
    expect(rows.filter((r) => r.rank === '6 (T)').map((r) => r.team)).toEqual(['uc-davis', 'long-beach-state']);
    expect(rows.filter((r) => r.rank === '11 (T)').map((r) => r.team)).toEqual(['pepperdine', 'san-jose-state']);
    // A tie means equal points; nothing splits them.
    expect(rows.filter((r) => r.rank === '6 (T)').map((r) => r.points)).toEqual([72, 72]);
  });

  it('copies the points exactly as published', () => {
    const rows = week3().poll.rows;
    expect(rows[0]).toMatchObject({ rank: '1', team: 'ucla', points: 97 });
    expect(rows.at(-1)).toMatchObject({ rank: 'RV', team: 'air-force', points: 1 });
    // The 3-points-per-win rule used for the conference standings must never reach these numbers:
    // no row's points are a multiple-of-three recomputation of anything.
    expect(rows.map((r) => r.points)).toEqual([97, 96, 90, 85, 84, 72, 72, 64, 61, 52, 50, 50, 41, 34, 27, 24, 20, 15, 12, 5, 3, 1]);
  });

  it('keeps the previous-week column, including its own ties and RV entries', () => {
    const rows = week3().poll.rows;
    expect(week3().poll.previous).toEqual({ week: 2, label: 'Week 2' });
    expect(rows.find((r) => r.team === 'brown')!.previous).toBe('18 (T)');
    expect(rows.find((r) => r.team === 'navy')!.previous).toBe('RV');
    expect(rows.find((r) => r.team === 'princeton')!.previous).toBe('12');
  });

  it('reads the week and the publication date from the article', () => {
    expect(week3().poll.week).toBe(3);
    expect(week3().poll.publishedAt).toBe('2026-09-16');
  });

  it('resolves the CWPA’s formal names to the same teams the schedules use', () => {
    const by = Object.fromEntries(week3().poll.rows.map((r) => [r.name, r.team]));
    expect(by['University of California-Los Angeles']).toBe('ucla');
    expect(by['University of California']).toBe('california');
    expect(by['United States Naval Academy']).toBe('navy');
    expect(by["Saint Mary's University (Calif.)"]).toBe('saint-marys-ca');
    expect(by['Long Beach State University']).toBe('long-beach-state');
  });
});

describe('refusing to publish something wrong', () => {
  it('reports a page with no Top 20 table instead of inventing one', () => {
    const r = parsePollArticle('<html><body><h1>2026 Polls</h1></body></html>', { url: URL3, season: 2026, week: 3 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/Top 20/);
  });

  it('rejects a table that is too short to be the national poll', () => {
    const short = { ...week3().poll, rows: week3().poll.rows.slice(0, 4) };
    expect(validatePoll(short, { season: 2026 }).join(' ')).toMatch(/only 4 rows/);
  });

  it('accepts the real Week 3 table', () => {
    expect(validatePoll(week3().poll, { season: 2026 })).toEqual([]);
  });

  it('rejects a poll with no publication date', () => {
    expect(validatePoll({ ...week3().poll, publishedAt: null }, { season: 2026 })).toContain('no publication date');
  });
});

describe('a stale run can never overwrite a newer poll', () => {
  const published = { season: 2026, week: 3 };
  it('refuses the same week', () => {
    expect(supersedes({ season: 2026, week: 3 }, published)).toBe(false);
  });
  it('refuses an older week', () => {
    expect(supersedes({ season: 2026, week: 2 }, published)).toBe(false);
  });
  it('accepts a newer week', () => {
    expect(supersedes({ season: 2026, week: 4 }, published)).toBe(true);
  });
  it('accepts anything when nothing is published yet', () => {
    expect(supersedes({ season: 2026, week: 1 }, null)).toBe(true);
  });
});

describe('the small parsers', () => {
  it('reads the publication date in either spelling', () => {
    expect(parsePublished('Sep 16, 2026')).toBe('2026-09-16');
    expect(parsePublished('September 16, 2026')).toBe('2026-09-16');
    expect(parsePublished('not a date')).toBeNull();
  });
  it('reads which poll the previous column refers to', () => {
    expect(parsePreviousHeader('2026 Week 2 Poll')).toEqual({ week: 2, label: 'Week 2' });
    expect(parsePreviousHeader('Points')).toBeNull();
  });
});
