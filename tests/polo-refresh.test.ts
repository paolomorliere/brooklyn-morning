import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { refreshOutcome } from '@/lib/polo';

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
