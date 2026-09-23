import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BACKUP, PRIMARY, decide, shiftDate } from '../scripts/poll-due.mjs';

type Runs = Record<string, { week: number; at: string }>;
const at = (iso: string, runs: Runs = {}) => decide(new Date(iso), runs);

/** The UTC times the workflow's crons fire, under both daylight-saving offsets. */
const WED = ['22:00', '23:00']; // Wednesday 18:00 New York
const THU = ['10:00', '11:00']; // Thursday 06:00 New York

describe('when the poll is checked', () => {
  it('is Wednesday evening and Thursday morning, New York', () => {
    expect(PRIMARY).toEqual({ weekday: 'Wed', from: '18:00' });
    expect(BACKUP).toEqual({ weekday: 'Thu', from: '06:00' });
  });

  it('runs on Wednesday at 6 p.m. New York, under both offsets', () => {
    // 2026-09-23 is a Wednesday in EDT; 2026-11-18 is a Wednesday in EST.
    expect(at(`2026-09-23T${WED[0]}:00Z`)).toMatchObject({ action: 'run', slot: 'primary', key: '2026-09-23' });
    expect(at(`2026-11-18T${WED[1]}:00Z`)).toMatchObject({ action: 'run', slot: 'primary', key: '2026-11-18' });
  });

  it('does not run on Wednesday morning or afternoon', () => {
    expect(at('2026-09-23T14:00:00Z').action).toBe('skip'); // 10:00 New York
    expect(at('2026-09-23T21:00:00Z').action).toBe('skip'); // 17:00 New York
  });

  it('never runs on the other five days', () => {
    // Friday through Tuesday in New York. The UTC instants are chosen so that each one really is
    // that New York weekday — 02:00 UTC on a Friday is still Thursday evening in New York.
    const nyDays: Array<[string, string[]]> = [
      ['2026-09-18', ['13:00', '18:00', '22:00']], // Friday
      ['2026-09-19', ['13:00', '18:00', '22:00']], // Saturday
      ['2026-09-20', ['13:00', '18:00', '22:00']], // Sunday
      ['2026-09-21', ['13:00', '18:00', '22:00']], // Monday
      ['2026-09-22', ['13:00', '18:00', '22:00']], // Tuesday
    ];
    for (const [d, times] of nyDays) {
      for (const t of times) expect(at(`${d}T${t}:00Z`).action, `${d} ${t}Z`).toBe('skip');
    }
  });

  it('does not touch the poll outside the season', () => {
    expect(at('2026-06-17T22:00:00Z').action).toBe('skip');
    expect(at('2027-04-14T22:00:00Z').why).toContain('season');
  });
});

describe('the Thursday backup only runs when Wednesday did not save a poll', () => {
  it('runs on Thursday when Wednesday saved nothing', () => {
    const v = at(`2026-09-24T${THU[0]}:00Z`);
    expect(v).toMatchObject({ action: 'run', slot: 'backup', key: '2026-09-23' });
    expect(v.why).toContain('no new poll was saved');
  });

  it('skips on Thursday when Wednesday saved a new week', () => {
    const runs: Runs = { '2026-09-23': { week: 4, at: '2026-09-23T22:10:00Z' } };
    const v = at(`2026-09-24T${THU[0]}:00Z`, runs);
    expect(v.action).toBe('skip');
    expect(v.why).toContain('week 4 was already saved');
  });

  it('still runs on Thursday when Wednesday only found last week’s poll again', () => {
    // A Wednesday run that fetched the page, got HTTP 200 and found week 3 again records nothing,
    // because the workflow claims a week only on `saved=true`.
    expect(at(`2026-09-24T${THU[1]}:00Z`, {}).action).toBe('run');
  });

  it('does not run twice on Thursday', () => {
    const runs: Runs = { '2026-09-23': { week: 4, at: '2026-09-24T10:20:00Z' } };
    expect(at(`2026-09-24T${THU[1]}:00Z`, runs).action).toBe('skip');
  });
});

describe('GitHub’s scheduling delay', () => {
  it('a Wednesday run that starts after midnight still does the Wednesday check', () => {
    // 2026-09-24T04:00Z is 00:00 Thursday in New York — the Wednesday cron, six hours late.
    const v = at('2026-09-24T04:00:00Z');
    expect(v).toMatchObject({ action: 'run', slot: 'primary', key: '2026-09-23' });
  });

  it('and cannot be mistaken for the Thursday backup', () => {
    // Having saved a poll late on Wednesday, the Thursday 06:00 run correctly skips.
    const runs: Runs = { '2026-09-23': { week: 4, at: '2026-09-24T04:05:00Z' } };
    expect(at('2026-09-24T10:00:00Z', runs).action).toBe('skip');
  });

  it('a Thursday run delayed into the afternoon still does the backup check', () => {
    // 2026-09-24T17:00Z is 13:00 Thursday in New York.
    expect(at('2026-09-24T17:00:00Z')).toMatchObject({ action: 'run', slot: 'backup', key: '2026-09-23' });
  });

  it('but a Friday run does nothing at all', () => {
    expect(at('2026-09-25T13:00:00Z').action).toBe('skip');
  });
});

describe('calendar arithmetic', () => {
  it('steps back across a month boundary', () => {
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
  });
});

describe('running the guard as the workflow does', () => {
  // The workflow calls `node scripts/poll-due.mjs` and reads what it writes to $GITHUB_OUTPUT.
  // Running the real process catches what importing the module cannot: the entry-point check
  // has to survive a project path containing a space.
  const script = resolve('scripts/poll-due.mjs');

  it('prints a decision and writes it to the step output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bm-poll-'));
    const outFile = join(dir, 'gh-output');
    writeFileSync(outFile, '');
    try {
      const stdout = execFileSync(process.execPath, [script], {
        cwd: resolve('.'),
        env: { ...process.env, GITHUB_OUTPUT: outFile },
        encoding: 'utf8',
      });
      expect(stdout.trim()).toMatch(/^(run|skip): .+/);
      expect(readFileSync(outFile, 'utf8')).toMatch(/^action=(run|skip)$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
