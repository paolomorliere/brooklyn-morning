import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SLOTS, decide, nyParts } from '../scripts/polo-due.mjs';

const at = (iso: string, runs: Record<string, string> = {}) => decide(new Date(iso), runs);

/** The eight UTC slots the workflow asks for: the four New York times under both DST offsets. */
const CRONS = ['13:00', '14:00', '15:30', '16:30', '18:00', '19:00', '20:30', '21:30'];

/** Walk a day's crons in order, letting each successful run claim its slot, as the workflow does. */
function dayRun(date: string) {
  const runs: Record<string, string> = {};
  const claimed: string[] = [];
  for (const utc of CRONS) {
    const v = decide(new Date(`${date}T${utc}:00Z`), runs);
    if (v.action === 'run') {
      runs[v.key!] = 'done';
      claimed.push(v.slot!);
    }
  }
  return claimed;
}

describe('the four New York slots', () => {
  it('is the times Paolo asked for, and nothing at 6 or 7 p.m.', () => {
    expect(SLOTS).toEqual(['09:00', '11:30', '14:00', '16:30']);
  });

  it('runs exactly four checks on an EDT Saturday', () => {
    expect(dayRun('2026-09-26')).toEqual(['09:00', '11:30', '14:00', '16:30']);
  });

  it('runs exactly four checks on an EDT Sunday', () => {
    expect(dayRun('2026-09-27')).toEqual(['09:00', '11:30', '14:00', '16:30']);
  });

  it('still runs exactly four after the clocks go back', () => {
    // US daylight saving ends on 2026-11-01, so these dates are Eastern Standard Time.
    expect(dayRun('2026-11-14')).toEqual(['09:00', '11:30', '14:00', '16:30']);
    expect(dayRun('2026-11-15')).toEqual(['09:00', '11:30', '14:00', '16:30']);
  });

  it('runs four on the changeover weekend itself', () => {
    expect(dayRun('2026-10-31')).toEqual(['09:00', '11:30', '14:00', '16:30']); // Saturday, still EDT
    expect(dayRun('2026-11-01')).toEqual(['09:00', '11:30', '14:00', '16:30']); // Sunday, clocks go back
  });
});

describe('what never runs', () => {
  it('skips every weekday', () => {
    for (const d of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']) {
      expect(dayRun(d)).toEqual([]);
    }
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

  it('still never exceeds four checks when every cron is delayed by five hours', () => {
    const runs: Record<string, string> = {};
    const claimed: string[] = [];
    for (const utc of CRONS) {
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

  it('keeps a late Sunday run on Sunday in New York, though it is Monday in UTC', () => {
    // 2026-09-28T02:00Z is Monday in UTC but 22:00 Sunday in New York.
    const parts = nyParts(new Date('2026-09-28T02:00:00Z'));
    expect(parts.weekday).toBe('Sun');
    expect(parts.date).toBe('2026-09-27');
    expect(at('2026-09-28T02:00:00Z').action).toBe('run');
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
