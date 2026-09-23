import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SLOTS_BY_DAY, decide, nyParts } from '../scripts/polo-due.mjs';

const at = (iso: string, runs: Record<string, string> = {}) => decide(new Date(iso), runs);

/**
 * Every UTC time the workflow's crons fire, under both daylight-saving offsets.
 *   Sat/Sun 09:00, 11:30, 14:00, 16:30 New York
 *   Sun 22:00 New York (Monday 02:00/03:00 UTC)
 *   Mon 09:00 New York (Monday 13:00/14:00 UTC)
 */
const WEEKEND_CRONS = ['13:00', '14:00', '15:30', '16:30', '18:00', '19:00', '20:30', '21:30'];
const MONDAY_CRONS = ['02:00', '03:00', '13:00', '14:00'];

/** Walk a day's crons in order, letting each successful run claim its slot, as the workflow does. */
function dayRun(date: string, crons: string[] = WEEKEND_CRONS, runs: Record<string, string> = {}) {
  const claimed: string[] = [];
  for (const utc of crons) {
    const v = decide(new Date(`${date}T${utc}:00Z`), runs);
    if (v.action === 'run') {
      runs[v.key!] = 'done';
      claimed.push(`${v.key}`);
    }
  }
  return claimed;
}

/** The slots claimed on one New York date, whatever UTC date the cron fired on. */
const slotsOn = (claimed: string[], date: string) =>
  claimed.filter((k) => k.startsWith(`${date}|`)).map((k) => k.split('|')[1]);

describe('the slots Paolo asked for', () => {
  it('is Saturday four, Sunday five including 10 p.m., and Monday morning', () => {
    expect(SLOTS_BY_DAY).toEqual({
      Sat: ['09:00', '11:30', '14:00', '16:30'],
      Sun: ['09:00', '11:30', '14:00', '16:30', '22:00'],
      Mon: ['09:00'],
    });
  });

  it('runs exactly four checks on an EDT Saturday', () => {
    expect(slotsOn(dayRun('2026-09-26'), '2026-09-26')).toEqual(['09:00', '11:30', '14:00', '16:30']);
  });

  it('runs five on Sunday, the last of them at 22:00', () => {
    const runs: Record<string, string> = {};
    dayRun('2026-09-27', WEEKEND_CRONS, runs);
    dayRun('2026-09-28', MONDAY_CRONS, runs); // Monday's crons carry Sunday 22:00 New York
    expect(slotsOn(Object.keys(runs), '2026-09-27')).toEqual(['09:00', '11:30', '14:00', '16:30', '22:00']);
  });

  it('runs exactly one check on Monday morning', () => {
    const runs: Record<string, string> = {};
    dayRun('2026-09-28', MONDAY_CRONS, runs);
    expect(slotsOn(Object.keys(runs), '2026-09-28')).toEqual(['09:00']);
  });

  it('still runs four, five and one after the clocks go back', () => {
    // US daylight saving ends on 2026-11-01, so these dates are Eastern Standard Time.
    const runs: Record<string, string> = {};
    dayRun('2026-11-14', WEEKEND_CRONS, runs); // Saturday
    dayRun('2026-11-15', WEEKEND_CRONS, runs); // Sunday
    dayRun('2026-11-16', MONDAY_CRONS, runs); // Monday, and Sunday 22:00 New York
    expect(slotsOn(Object.keys(runs), '2026-11-14')).toEqual(['09:00', '11:30', '14:00', '16:30']);
    expect(slotsOn(Object.keys(runs), '2026-11-15')).toEqual(['09:00', '11:30', '14:00', '16:30', '22:00']);
    expect(slotsOn(Object.keys(runs), '2026-11-16')).toEqual(['09:00']);
  });

  it('runs the right number on the changeover weekend itself', () => {
    const runs: Record<string, string> = {};
    dayRun('2026-10-31', WEEKEND_CRONS, runs); // Saturday, still EDT
    dayRun('2026-11-01', WEEKEND_CRONS, runs); // Sunday, clocks go back
    dayRun('2026-11-02', MONDAY_CRONS, runs);
    expect(slotsOn(Object.keys(runs), '2026-10-31')).toEqual(['09:00', '11:30', '14:00', '16:30']);
    expect(slotsOn(Object.keys(runs), '2026-11-01')).toEqual(['09:00', '11:30', '14:00', '16:30', '22:00']);
    expect(slotsOn(Object.keys(runs), '2026-11-02')).toEqual(['09:00']);
  });
});

describe('what never runs', () => {
  it('skips Tuesday to Friday', () => {
    for (const d of ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']) {
      expect(dayRun(d, [...WEEKEND_CRONS, ...MONDAY_CRONS])).toEqual([]);
    }
  });

  it('skips Monday afternoon and evening — the only Monday check is 9 a.m.', () => {
    // 21:00 UTC is 17:00 Monday in New York; the 09:00 slot was claimed earlier that morning.
    const v = at('2026-09-28T21:00:00Z', { '2026-09-28|09:00': '2026-09-28T13:05:00Z' });
    expect(v.action).toBe('skip');
    expect(v.why).toContain('already ran');
  });

  it('skips before the day’s first slot', () => {
    // 13:00 UTC in November is 08:00 in New York, an hour before the first check.
    const v = at('2026-11-14T13:00:00Z');
    expect(v.action).toBe('skip');
    expect(v.why).toContain('before the first slot');
  });

  it('skips a slot that has already been checked', () => {
    const v = at('2026-09-26T13:30:00Z', { '2026-09-26|09:00': '2026-09-26T13:05:00Z' });
    expect(v.action).toBe('skip');
    expect(v.why).toContain('already ran');
  });

  it('skips outside the 2026 season, so the archive stops being touched', () => {
    expect(at('2026-07-11T18:00:00Z').action).toBe('skip'); // before the season
    expect(at('2027-03-13T18:00:00Z').action).toBe('skip'); // after it
    expect(at('2027-03-13T18:00:00Z').why).toContain('season');
  });
});

describe('GitHub’s scheduling delay', () => {
  it('does the check for the slot a late run lands in, rather than discarding it', () => {
    // The 09:00 cron fires at 13:00 UTC; this repository's runs have started 3.5-6 h later.
    const v = at('2026-09-26T18:00:00Z'); // 14:00 in New York
    expect(v.action).toBe('run');
    expect(v.slot).toBe('14:00');
  });

  it('still never exceeds a day’s slots when every cron is delayed by five hours', () => {
    const runs: Record<string, string> = {};
    const claimed: string[] = [];
    for (const utc of WEEKEND_CRONS) {
      const fired = new Date(`2026-09-26T${utc}:00Z`).getTime() + 5 * 3600_000;
      const v = decide(new Date(fired), runs);
      if (v.action === 'run') {
        runs[v.key!] = 'done';
        claimed.push(v.slot!);
      }
    }
    expect(claimed.length).toBeLessThanOrEqual(4);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('still does the Sunday 22:00 check when the run starts after midnight in New York', () => {
    // The Monday 02:00 UTC cron is Sunday 22:00 New York. GitHub starting it 3.5 hours late makes
    // it 01:30 on Monday — a day whose only slot is 09:00 — so without a look-back the Sunday night
    // check would be lost exactly when it is delayed.
    const v = at('2026-09-28T05:30:00Z');
    expect(v.action).toBe('run');
    expect(v.slot).toBe('22:00');
    expect(v.key).toBe('2026-09-27|22:00');
    expect(v.why).toContain('2026-09-27');
  });

  it('does not reach back to Sunday night from Monday morning', () => {
    // Monday 09:00 New York is eleven hours after the Sunday 22:00 slot, outside the look-back.
    const v = at('2026-09-28T13:00:00Z');
    expect(v.action).toBe('run');
    expect(v.key).toBe('2026-09-28|09:00');
  });

  it('keeps a late Sunday run on Sunday in New York, though it is Monday in UTC', () => {
    // 2026-09-28T02:00Z is Monday in UTC but 22:00 Sunday in New York.
    const parts = nyParts(new Date('2026-09-28T02:00:00Z'));
    expect(parts.weekday).toBe('Sun');
    expect(parts.date).toBe('2026-09-27');
    const v = at('2026-09-28T02:00:00Z');
    expect(v.action).toBe('run');
    expect(v.slot).toBe('22:00');
  });
});

describe('running the guard as the workflow does', () => {
  // The workflow calls `node scripts/polo-due.mjs` and reads what it writes to $GITHUB_OUTPUT.
  // Exercising the real process catches things importing the module cannot — the entry-point check
  // once compared `import.meta.url` with an unencoded path, so on any path containing a space the
  // script ran, printed nothing and reported no decision at all.
  const script = resolve('scripts/polo-due.mjs');

  function runCli() {
    const dir = mkdtempSync(join(tmpdir(), 'bm-polo-'));
    const outFile = join(dir, 'gh-output');
    writeFileSync(outFile, '');
    try {
      const stdout = execFileSync(process.execPath, [script], {
        cwd: resolve('.'),
        env: { ...process.env, GITHUB_OUTPUT: outFile },
        encoding: 'utf8',
      });
      return { stdout: stdout.trim(), output: readFileSync(outFile, 'utf8') };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('prints a decision and writes it to the step output', () => {
    const { stdout, output } = runCli();
    expect(stdout).toMatch(/^(run|skip): .+/);
    expect(output).toMatch(/^action=(run|skip)$/m);
    expect(output).toMatch(/^slot=/m);
  });
});
