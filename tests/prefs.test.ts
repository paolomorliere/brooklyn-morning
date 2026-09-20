import { describe, expect, it } from 'vitest';
import { backupOverdue } from '@/state/prefs';

describe('backup reminder', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  it('uses last backup when present', () => {
    expect(backupOverdue('2026-09-20T00:00:00Z', '2026-01-01T00:00:00Z', now)).toBe(false);
    expect(backupOverdue('2026-09-10T00:00:00Z', '2026-01-01T00:00:00Z', now)).toBe(true);
  });
  it('falls back to first use when never backed up', () => {
    expect(backupOverdue(null, '2026-09-25T00:00:00Z', now)).toBe(false);
    expect(backupOverdue(null, '2026-09-01T00:00:00Z', now)).toBe(true);
    expect(backupOverdue(null, null, now)).toBe(false);
  });
});
