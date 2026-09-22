import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/edition-needed.mjs');

/** Run the pre-check in a throwaway directory holding just an edition.json. */
function run(edition: unknown | null, env: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'bm-'));
  try {
    mkdirSync(join(dir, 'public/data'), { recursive: true });
    if (edition) writeFileSync(join(dir, 'public/data/edition.json'), JSON.stringify(edition));
    return execFileSync(process.execPath, [script], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' }).split(':')[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const nyDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('edition pre-check (keeps delayed scheduled runs cheap)', () => {
  it('builds when there is no edition at all', () => {
    expect(run(null)).toBe('build');
  });
  it('builds when the newest edition is from an earlier day', () => {
    expect(run({ date: '2020-01-01', preparedAt: minutesAgo(10) })).toBe('build');
  });
  it('skips a fresh edition from today', () => {
    expect(run({ date: nyDate(), preparedAt: minutesAgo(5) }, { REFRESH_FROM_HOUR: '0', REFRESH_UNTIL_HOUR: '24' })).toBe('skip');
  });
  it('refreshes a stale edition inside the morning window', () => {
    expect(run({ date: nyDate(), preparedAt: minutesAgo(200) }, { REFRESH_FROM_HOUR: '0', REFRESH_UNTIL_HOUR: '24' })).toBe('refresh');
  });
  it('never refreshes outside the window, however stale', () => {
    expect(run({ date: nyDate(), preparedAt: minutesAgo(600) }, { REFRESH_FROM_HOUR: '0', REFRESH_UNTIL_HOUR: '0' })).toBe('skip');
  });
});
