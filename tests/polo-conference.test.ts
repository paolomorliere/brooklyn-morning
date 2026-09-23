import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyGame,
  fixtureKey,
  indexFixtures,
  parseConferenceSchedule,
  parseMatchup,
  type ParsedConferenceSchedule,
} from '../scripts/lib/polo-conference.mjs';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

const MAWPC_URL = 'https://collegiatewaterpolo.org/2026-mid-atlantic-water-polo-conference-schedule/';
const NWPC_URL = 'https://collegiatewaterpolo.org/2026-northeast-water-polo-conference-schedule/';

const mawpc = () =>
  parseConferenceSchedule(fixture('cwpa-mawpc.html'), { conference: 'MAWPC', url: MAWPC_URL, seasonYear: 2026 });
const nwpc = () =>
  parseConferenceSchedule(fixture('cwpa-nwpc.html'), { conference: 'NWPC', url: NWPC_URL, seasonYear: 2026 });

describe('reading the CWPA conference schedule', () => {
  it('reads every fixture on both pages, with nothing left unexplained', () => {
    expect(mawpc().fixtures).toHaveLength(42);
    expect(nwpc().fixtures).toHaveLength(30);
    expect(mawpc().skipped).toEqual([]);
    expect(nwpc().skipped).toEqual([]);
  });

  it('ignores the championship bracket further down the same page', () => {
    // The fixture deliberately contains both tables. A "4th Seed vs. 5th Seed" row must never
    // become a fixture, and a conference tournament is not a regular-season game.
    const keys = mawpc().fixtures.map((f) => f.teams.join('|'));
    expect(keys.some((k) => /seed/i.test(k))).toBe(false);
    expect(mawpc().fixtures.every((f) => f.date < '2026-11-20')).toBe(true);
  });

  it('resolves the names the CWPA prints, including its own misspellings', () => {
    const all = [...mawpc().fixtures, ...nwpc().fixtures];
    // "Bucknell Universtiy", "Forhdham Universtiy", "Iona Universtiy", "Harvard Universtiy".
    expect(all.some((f) => f.names.some((n) => /Universtiy/.test(n)))).toBe(true);
    // Every one of them still lands on a real slug — no `bucknell-universtiy` in the output.
    for (const f of all) {
      for (const slug of f.teams) expect(slug).not.toMatch(/universtiy|forhdham/);
    }
  });

  it('maps "U.S. Naval Academy" to the watched team rather than a new one', () => {
    const f = mawpc().fixtures.find((x) => x.date === '2026-09-04');
    expect(f!.teams).toEqual(['mount-st-marys', 'navy']);
  });

  it('reads the dates the CWPA writes, in all the shapes it writes them', () => {
    const dates = nwpc().fixtures.map((f) => f.date);
    expect(dates).toContain('2026-09-12'); // "Sat., Sept. 12"
    expect(dates).toContain('2026-09-30'); // "Wed. Sept. 30" — no comma
    expect(dates).toContain('2026-11-07'); // "Sat., Nov 7" — no full stop
    expect(dates.every((d) => /^2026-(0[89]|1[012])-\d\d$/.test(d))).toBe(true);
  });

  it('reads "(Noon)" as 12:00 and never invents a missing time', () => {
    const noon = nwpc().fixtures.find((f) => f.date === '2026-10-04' && f.teams.includes('princeton'));
    expect(noon!.time).toBe('12:00');
    expect(nwpc().fixtures.every((f) => f.time === null || /^\d\d:\d\d$/.test(f.time))).toBe(true);
  });
});

describe('classifying a game', () => {
  const { index } = indexFixtures([mawpc(), nwpc()]);

  it('marks a game the conference actually lists', () => {
    expect(classifyGame({ date: '2026-09-04', teams: ['mount-st-marys', 'navy'] }, index)).toEqual({
      conference: 'MAWPC',
      conferenceSource: MAWPC_URL,
    });
    expect(classifyGame({ date: '2026-09-12', teams: ['brown', 'iona'] }, index)).toEqual({
      conference: 'NWPC',
      conferenceSource: NWPC_URL,
    });
  });

  it('refuses to mark two conference members meeting somewhere the conference did not list', () => {
    // Fordham and Navy are both MAWPC and do meet at invitationals. Sharing a conference is never
    // enough — only a fixture printed on the conference schedule counts.
    expect(classifyGame({ date: '2026-08-30', teams: ['fordham', 'navy'] }, index)).toBeNull();
    // The right pair on the wrong date is not that fixture either.
    expect(classifyGame({ date: '2026-09-05', teams: ['mount-st-marys', 'navy'] }, index)).toBeNull();
  });

  it('leaves a cross-conference game unclassified', () => {
    expect(classifyGame({ date: '2026-10-03', teams: ['harvard', 'navy'] }, index)).toBeNull();
  });

  it('classifies exactly the seven conference games played so far', () => {
    const played = [
      ['2026-09-04', ['mount-st-marys', 'navy']],
      ['2026-09-19', ['bucknell', 'fordham']],
      ['2026-09-19', ['fordham', 'mount-st-marys']],
      ['2026-09-19', ['fordham', 'mercyhurst']],
      ['2026-09-20', ['bucknell', 'wagner']],
      ['2026-09-20', ['mercyhurst', 'wagner']],
      ['2026-09-12', ['brown', 'iona']],
    ] as const;
    for (const [date, teams] of played) {
      expect(classifyGame({ date, teams: [...teams] }, index), `${date} ${teams.join(' v ')}`).not.toBeNull();
    }
  });
});

describe('refusing to guess', () => {
  it('drops a fixture the same page lists twice for one date, rather than picking one', () => {
    const doubled: ParsedConferenceSchedule = {
      conference: 'MAWPC',
      url: MAWPC_URL,
      ambiguous: [fixtureKey('2026-10-10', 'a', 'b')],
      fixtures: [
        { key: fixtureKey('2026-10-10', 'a', 'b'), conference: 'MAWPC', url: MAWPC_URL, date: '2026-10-10', time: null, teams: ['a', 'b'], names: ['A', 'B'], cwpaScores: null },
        { key: fixtureKey('2026-10-10', 'a', 'b'), conference: 'MAWPC', url: MAWPC_URL, date: '2026-10-10', time: null, teams: ['a', 'b'], names: ['A', 'B'], cwpaScores: null },
      ],
      skipped: [],
    };
    const { index, dropped } = indexFixtures([doubled]);
    expect(index.size).toBe(0);
    expect(dropped).toEqual([fixtureKey('2026-10-10', 'a', 'b')]);
  });

  it('drops a fixture two conferences both claim', () => {
    const one: ParsedConferenceSchedule = { conference: 'MAWPC', url: MAWPC_URL, ambiguous: [], skipped: [], fixtures: [
      { key: fixtureKey('2026-10-10', 'a', 'b'), conference: 'MAWPC', url: MAWPC_URL, date: '2026-10-10', time: null, teams: ['a', 'b'], names: ['A', 'B'], cwpaScores: null },
    ] };
    const two: ParsedConferenceSchedule = { conference: 'NWPC', url: NWPC_URL, ambiguous: [], skipped: [], fixtures: [
      { key: fixtureKey('2026-10-10', 'a', 'b'), conference: 'NWPC', url: NWPC_URL, date: '2026-10-10', time: null, teams: ['a', 'b'], names: ['A', 'B'], cwpaScores: null },
    ] };
    const { index, dropped } = indexFixtures([one, two]);
    expect(index.size).toBe(0);
    expect(dropped).toContain(fixtureKey('2026-10-10', 'a', 'b'));
  });

  it('rejects a bracket placeholder as a matchup', () => {
    expect(parseMatchup('4th Seed vs. 5th Seed (Game 1)')).toBeNull();
    expect(parseMatchup('Winner Game 1 vs. Winner Game 2')).toBeNull();
    expect(parseMatchup('TBD vs. TBD')).toBeNull();
    expect(parseMatchup('Fordham University')).toBeNull();
    expect(parseMatchup('Navy vs. Navy')).toBeNull();
  });

  it('reports a page whose schedule table has gone, instead of returning nothing quietly', () => {
    const r = parseConferenceSchedule('<html><body><p>Coming soon</p></body></html>', {
      conference: 'MAWPC', url: MAWPC_URL, seasonYear: 2026,
    });
    expect(r.error).toMatch(/no schedule table/);
    expect(r.fixtures).toEqual([]);
  });
});
