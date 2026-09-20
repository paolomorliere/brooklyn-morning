import { useState } from 'preact/hooks';
import { EyeOff, RefreshCw, Trash2, Undo2 } from 'lucide-preact';
import { groceryActions, groceryStore } from '@/state/grocery';
import { prefsStore, updatePrefs } from '@/state/prefs';
import { rankBuyAgain } from '@/lib/grocery';
import { shortDate } from '@/lib/format';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';

export function GrocerySection() {
  const g = groceryStore.use();
  const prefs = prefsStore.use();
  const toast = useToast();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const c = g.catalog;

  const rows = rankBuyAgain(g.history, [], Date.now(), 200);
  const hidden = new Set(prefs.hiddenSuggestions);

  return (
    <>
      <div class="section-title"><h2>Groceries</h2></div>
      <div class="row-btn" style="cursor:default">
        <span class="grow">
          <div>Product catalog</div>
          <div class="small muted">
            {c.count ? `${c.count.toLocaleString()} products · version ${c.version} · updated ${c.updatedAt ? shortDate(c.updatedAt) : '—'}` : 'Not loaded'}
            {c.lastError && <div class="error">{c.lastError}</div>}
          </div>
        </span>
      </div>
      <button class="row-btn" onClick={() => void groceryActions.syncCatalog(true).then(() => toast({ message: groceryStore.get().catalog.lastError ? 'Catalog update failed; current catalog kept.' : 'Catalog is up to date.' }))} disabled={g.catalogLoading}>
        <RefreshCw size={20} class={g.catalogLoading ? 'spin' : ''} />
        <span class="grow">{g.catalogLoading ? 'Checking…' : 'Check for a new catalog'}</span>
      </button>
      <button class="row-btn" onClick={() => setHistoryOpen(true)}>
        <EyeOff size={20} />
        <span class="grow">
          <div>Purchase history</div>
          <div class="small muted">{g.history.length} events · hide items from Buy again, or clear everything</div>
        </span>
      </button>
      <p class="small faint" style="margin-top:8px">
        Catalog data from Open Food Facts (ODbL); photos CC BY-SA by their contributors. Being listed does not mean City Point stocks it. No prices or availability.
      </p>

      {historyOpen && (
        <Sheet title="Purchase history" onClose={() => setHistoryOpen(false)}>
          {rows.length === 0 && <p class="muted" style="margin-top:8px">No history yet.</p>}
          <ul>
            {rows.map((r) => (
              <li class="row-btn" key={r.key} style="cursor:default">
                <span class="grow" style={hidden.has(r.key) ? 'opacity:.5' : ''}>
                  <div>{r.name}</div>
                  <div class="small muted">{r.times ? `Bought ${r.times}× · ` : ''}last {shortDate(r.lastAt)}{hidden.has(r.key) ? ' · hidden' : ''}</div>
                </span>
                <button class="icon-btn" aria-label={hidden.has(r.key) ? `Show ${r.name}` : `Hide ${r.name}`} onClick={() => void updatePrefs({ hiddenSuggestions: hidden.has(r.key) ? prefs.hiddenSuggestions.filter((k) => k !== r.key) : [...prefs.hiddenSuggestions, r.key] })}>
                  {hidden.has(r.key) ? <Undo2 size={18} /> : <EyeOff size={18} />}
                </button>
              </li>
            ))}
          </ul>
          {rows.length > 0 && (
            <div style="margin-top:16px">
              {!confirmClear ? (
                <button class="btn btn--ghost btn--block" style="color:var(--danger)" onClick={() => setConfirmClear(true)}><Trash2 size={16} /> Clear all history</button>
              ) : (
                <button class="btn btn--block" style="background:var(--danger)" onClick={() => void groceryActions.clearHistory().then(() => { setConfirmClear(false); setHistoryOpen(false); toast({ message: 'History cleared' }); })}>
                  Tap again to clear {g.history.length} events
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
