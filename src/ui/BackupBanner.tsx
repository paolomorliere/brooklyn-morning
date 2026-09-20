import { useEffect, useState } from 'preact/hooks';
import { ShieldAlert } from 'lucide-preact';
import { kvGet, kvSet } from '@/db/personal';
import { backupOverdue, prefsStore } from '@/state/prefs';
import { navigate } from './router';

export function BackupBanner() {
  const prefs = prefsStore.use();
  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      let at = await kvGet<string | null>('installedAt', null);
      if (!at) {
        at = new Date().toISOString();
        await kvSet('installedAt', at);
      }
      setInstalledAt(at);
      setDismissedAt(await kvGet<string | null>('backupBannerDismissedAt', null));
    })();
  }, []);

  const overdue = backupOverdue(prefs.lastBackupAt, installedAt);
  const snoozed = dismissedAt && Date.now() - new Date(dismissedAt).getTime() < 3 * 86400e3;
  if (!overdue || snoozed) return null;

  return (
    <div class="notice" role="status" style="margin:12px 16px 0;max-width:608px;margin-inline:auto;width:calc(100% - 32px)">
      <ShieldAlert size={18} style="flex:none;margin-top:2px;color:var(--terracotta-deep)" />
      <span style="flex:1">
        {prefs.lastBackupAt ? 'Your last backup is over two weeks old.' : 'You have not backed up yet.'} Everything lives only on this phone.{' '}
        <button class="btn btn--quiet" style="color:var(--terracotta-deep);display:inline;padding:0;min-height:0" onClick={() => navigate('settings')}>Export now</button>
        {' · '}
        <button class="btn btn--quiet" style="display:inline;padding:0;min-height:0" onClick={() => { const at = new Date().toISOString(); setDismissedAt(at); void kvSet('backupBannerDismissedAt', at); }}>Later</button>
      </span>
    </div>
  );
}
