import type { Prefs } from '@/types';
import { createStore } from './store';
import { DEFAULT_PREFS, getPrefs, setPrefs } from '@/db/personal';

export const prefsStore = createStore<Prefs>(DEFAULT_PREFS, getPrefs);

export async function updatePrefs(patch: Partial<Prefs>): Promise<void> {
  await prefsStore.ensure();
  const next = { ...prefsStore.get(), ...patch };
  await setPrefs(next);
  prefsStore.set(next);
}

export const BACKUP_REMINDER_DAYS = 14;

/** True when the last backup (or, if none, first use) is older than 14 days. */
export function backupOverdue(lastBackupAt: string | null, installedAt: string | null, now = Date.now()): boolean {
  const ref = lastBackupAt ?? installedAt;
  if (!ref) return false;
  return now - new Date(ref).getTime() > BACKUP_REMINDER_DAYS * 86400e3;
}
