import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { conferenceCoverageOf, isNewerBuild, refreshOutcome } from '@/lib/polo';

describe('refreshOutcome', () => {
  const base = { rebuilt: true, added: 0, fixturesChanged: 0, failedSources: 0 };

  it('calls a rebuild with new results a success', () => {
    expect(refreshOutcome({ ...base, added: 3 })).toBe('success');
    expect(refreshOutcome({ ...base, fixturesChanged: 2 })).toBe('success');
  });

  it('calls a rebuild with nothing new "unchanged"', () => {
    expect(refreshOutcome(base)).toBe('unchanged');
  });

  it('reports partial coverage rather than "all schools"', () => {
    expect(refreshOutcome({ ...base, added: 3, failedSources: 2 })).toBe('partial');
    expect(refreshOutcome({ ...base, failedSources: 1 })).toBe('partial');
  });

  it('never calls an attempt that published nothing a success', () => {
    // The regression this exists for: a manual run that finished green in ten seconds without
    // reading anything, which the app announced as "all 13 schools read, nothing has changed".
    expect(refreshOutcome({ ...base, rebuilt: false })).toBe('nothing');
    // Not even if the previous file happens to contain unread sources or would look like a change.
    expect(refreshOutcome({ rebuilt: false, added: 5, fixturesChanged: 5, failedSources: 3 })).toBe('nothing');
  });
});

/**
 * The cause of the reported bug was in the workflow, not in any function, so the guard has to read
 * the workflow. A manual run must never be routed through the once-per-slot cron guard: that is what
 * made "Refresh scores & fixtures" finish successfully without reading a single school.
 */
describe('the workflows a manual refresh triggers', () => {
  const files = ['.github/workflows/waterpolo.yml', '.github/workflows/poll.yml'];

  it.each(files)('%s lets a hand-started run collect unconditionally', (file) => {
    const yml = readFileSync(file, 'utf8');
    expect(yml).toContain('workflow_dispatch:');
    // No dropdown to get wrong. The old `mode: auto | force` input defaulted to the gated path.
    expect(yml).not.toMatch(/inputs:\s*\n\s*mode:/);
    expect(yml).not.toContain('inputs.mode');
    // The guard applies to the schedule only.
    expect(yml).toMatch(/if \[ "\$\{\{ github\.event_name \}\}" != "schedule" \]/);
  });

  it.each(files)('%s still claims a slot only for the cron', (file) => {
    const yml = readFileSync(file, 'utf8');
    // A hand-started run sets an empty slot, and the claim step is guarded on a non-empty one, so
    // a manual refresh cannot consume one of the automatic checks.
    expect(yml).toMatch(/echo "slot=" >> "\$GITHUB_OUTPUT"/);
    expect(yml).toMatch(/steps\.due\.outputs\.slot != ''/);
  });

  it('keeps the automatic water polo schedule exactly as it was', () => {
    const yml = readFileSync('.github/workflows/waterpolo.yml', 'utf8');
    for (const cron of ["'0 13,14,18,19 * * 6,0'", "'30 15,16,20,21 * * 6,0'", "'0 2,3,13,14 * * 1'"]) {
      expect(yml).toContain(cron);
    }
  });

  it('keeps the automatic poll schedule exactly as it was', () => {
    const yml = readFileSync('.github/workflows/poll.yml', 'utf8');
    expect(yml).toContain("'0 22,23 * * 3'");
    expect(yml).toContain("'0 10,11 * * 4'");
  });

  it('only claims a poll week the cron was expecting', () => {
    // --expect-new drives the "awaiting this week's poll" notice, so a manual check that finds the
    // current week again must not raise it.
    const yml = readFileSync('.github/workflows/poll.yml', 'utf8');
    expect(yml).toMatch(/steps\.due\.outputs\.expect == 'true' && '--expect-new'/);
    expect(yml).toMatch(/echo "expect=false" >> "\$GITHUB_OUTPUT"/);
  });
});

describe('a feed may never roll backwards', () => {
  it('accepts a strictly newer build', () => {
    expect(isNewerBuild('2026-10-05T08:50:33.974Z', '2026-10-05T19:11:02.000Z')).toBe(true);
  });
  it('refuses the same build, so a re-download is a fetch and not a refresh', () => {
    expect(isNewerBuild('2026-10-05T08:50:33.974Z', '2026-10-05T08:50:33.974Z')).toBe(false);
  });
  it('refuses an older build — the case a stale cache or a lagging CDN node produces', () => {
    expect(isNewerBuild('2026-10-05T19:11:02.000Z', '2026-10-05T08:50:33.974Z')).toBe(false);
  });
  it('accepts anything when nothing is saved yet', () => {
    expect(isNewerBuild(null, '2026-10-05T08:50:33.974Z')).toBe(true);
    expect(isNewerBuild(undefined, '2026-10-05T08:50:33.974Z')).toBe(true);
  });
  it('refuses an unreadable incoming timestamp and replaces an unreadable saved one', () => {
    expect(isNewerBuild('2026-10-05T08:50:33.974Z', 'not a date')).toBe(false);
    expect(isNewerBuild('2026-10-05T08:50:33.974Z', null)).toBe(false);
    expect(isNewerBuild('nonsense', '2026-10-05T08:50:33.974Z')).toBe(true);
  });
  it('compares moments, not strings, across a zone offset', () => {
    // Same instant written two ways: neither is newer than the other.
    expect(isNewerBuild('2026-10-05T12:00:00Z', '2026-10-05T08:00:00-04:00')).toBe(false);
    expect(isNewerBuild('2026-10-05T08:00:00-04:00', '2026-10-05T12:00:00Z')).toBe(false);
  });
});

describe('conference coverage is reported separately from the schools', () => {
  const src = (id: string, ok: boolean) => ({ id, url: `https://example.test/${id}`, ok, fixtures: ok ? 30 : 0, skipped: 0, error: ok ? null : 'HTTP 503' });
  const block = (sources: ReturnType<typeof src>[]) => ({
    checkedAt: '2026-10-05T08:50:33.974Z',
    sources,
    classified: 72,
    dropped: [],
    members: {},
  });

  it('reports both schedules read', () => {
    const c = conferenceCoverageOf(block([src('MAWPC', true), src('NWPC', true)]));
    expect(c).toMatchObject({ complete: true, okCount: 2, total: 2, failed: [], classified: 72 });
    expect(c.checkedAt).toBe('2026-10-05T08:50:33.974Z');
  });

  it('names the conference whose schedule could not be read', () => {
    const c = conferenceCoverageOf(block([src('MAWPC', true), src('NWPC', false)]));
    expect(c.complete).toBe(false);
    expect(c.failed).toEqual(['NWPC']);
    expect(c.okCount).toBe(1);
  });

  it('a build with no conference block is no coverage, never complete', () => {
    expect(conferenceCoverageOf(undefined)).toEqual({ complete: false, okCount: 0, total: 0, failed: [], checkedAt: null, classified: 0 });
  });

  it('an unread conference schedule makes a refresh partial even when all schools were read', () => {
    const coverage = conferenceCoverageOf(block([src('MAWPC', true), src('NWPC', false)]));
    expect(
      refreshOutcome({ rebuilt: true, added: 3, fixturesChanged: 0, failedSources: 0 + coverage.failed.length }),
    ).toBe('partial');
  });
});
