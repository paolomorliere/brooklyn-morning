import { useRef, useState } from 'preact/hooks';
import { Download, Upload } from 'lucide-preact';
import { exportBackup, restoreBackup } from '@/db/backup';
import { backupFilename, summarizeBackup, validateBackup, type Backup } from '@/lib/backup';
import { readFileAsText, shareOrDownloadJSON } from '@/lib/share';
import { prefsStore, updatePrefs } from '@/state/prefs';
import { todoActions } from '@/state/todo';
import { useToast } from '@/ui/Toast';
import { Sheet } from '@/ui/Sheet';
import { shortDate } from '@/lib/format';

export function BackupSection() {
  const prefs = prefsStore.use();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup | null; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const b = await exportBackup();
      const how = await shareOrDownloadJSON(backupFilename(), b);
      if (how !== 'cancelled') {
        await updatePrefs({ lastBackupAt: new Date().toISOString() });
        toast({ message: how === 'shared' ? 'Backup shared. Save it to Files or iCloud Drive.' : 'Backup downloaded.' });
      }
    } catch (e) {
      toast({ message: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await readFileAsText(file));
      const problems = validateBackup(data);
      setPending({ backup: problems.length ? null : (data as Backup), problems });
    } catch {
      setPending({ backup: null, problems: ['This file is not valid JSON'] });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doRestore = async () => {
    if (!pending?.backup) return;
    setBusy(true);
    try {
      await restoreBackup(pending.backup);
      await todoActions.refresh();
      await prefsStore.reload();
      toast({ message: 'Restored. Your data now matches the backup.' });
      setPending(null);
    } catch (e) {
      toast({ message: `Restore failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div class="section-title"><h2>Backup</h2></div>
      <p class="small muted" style="margin-bottom:8px">
        Everything lives only on this phone. A backup is one JSON file with your tasks, categories, grocery list and history, library, settings, and lesson progress.
        {prefs.lastBackupAt ? ` Last backup: ${shortDate(prefs.lastBackupAt)}.` : ' No backup yet.'}
      </p>
      <button class="row-btn" onClick={() => void doExport()} disabled={busy}>
        <Download size={20} />
        <span class="grow">
          <div>Export everything</div>
          <div class="small muted">Opens the share sheet · save to Files or iCloud Drive</div>
        </span>
      </button>
      <button class="row-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload size={20} />
        <span class="grow">
          <div>Restore from a backup file</div>
          <div class="small muted">Replaces current data after you confirm</div>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" class="visually-hidden" aria-label="Choose backup file" onChange={(e) => void pick((e.target as HTMLInputElement).files?.[0])} />

      {pending && (
        <Sheet
          title={pending.backup ? 'Restore this backup?' : 'Cannot restore'}
          onClose={() => setPending(null)}
          footer={
            <>
              <button class="btn btn--ghost" onClick={() => setPending(null)}>Cancel</button>
              {pending.backup && (
                <button class="btn" style="background:var(--danger)" onClick={() => void doRestore()} disabled={busy}>Replace my data</button>
              )}
            </>
          }
        >
          {pending.backup ? (
            <>
              <p style="margin-top:8px">Exported {new Date(pending.backup.exportedAt).toLocaleString()}.</p>
              <p class="muted" style="margin-top:8px">{summarizeBackup(pending.backup)}</p>
              <p class="small" style="margin-top:16px;color:var(--danger)">Everything currently on this phone will be replaced. This cannot be undone unless you export first.</p>
            </>
          ) : (
            <ul style="margin-top:8px">
              {pending.problems.slice(0, 5).map((p) => <li class="error" key={p}>{p}</li>)}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}
