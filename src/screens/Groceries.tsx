import { useEffect, useMemo, useState } from 'preact/hooks';
import { AlertTriangle, Check, Minus, Plus, Search, X } from 'lucide-preact';
import type { ListItem, Product } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Sheet } from '@/ui/Sheet';
import { Thumb } from '@/ui/Thumb';
import { useToast } from '@/ui/Toast';
import { groceryActions, groceryStore } from '@/state/grocery';
import { prefsStore, updatePrefs } from '@/state/prefs';
import { discover, groceryState, rankBuyAgain } from '@/lib/grocery';
import { SECTIONS } from '../../scripts/lib/sections.mjs';

export function Groceries() {
  const g = groceryStore.use();
  const prefs = prefsStore.use();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [otherOpen, setOtherOpen] = useState<string | null>(null);

  // Check for a catalog on first open of the screen (cheap when unchanged; silent when offline).
  useEffect(() => void groceryActions.maybeSyncCatalog(), []);

  const state = groceryState(g.list, g.history);
  const results = useMemo(() => (q.trim().length >= 2 && g.index ? g.index.search(q, 25) : []), [q, g.index]);
  const onList = useMemo(() => new Map(g.list.filter((it) => it.productId).map((it) => [it.productId as string, it.qty])), [g.list]);
  const buyAgain = useMemo(() => (state === 'suggest' ? rankBuyAgain(g.history, prefs.hiddenSuggestions) : []), [state, g.history, prefs.hiddenSuggestions]);
  const suggestions = useMemo(() => (state === 'suggest' ? discover(g.history, g.products, prefs.hiddenSuggestions) : []), [state, g.history, g.products, prefs.hiddenSuggestions]);

  const add = async (p: Product) => {
    await groceryActions.addProduct(p);
    toast({ message: onList.has(p.id) ? `${p.name} ×${(onList.get(p.id) ?? 1) + 1}` : `Added ${p.name}` }, 1800);
  };
  const addOther = async (name: string, section: string) => {
    await groceryActions.addOther(name, section as ListItem['section']);
    setOtherOpen(null);
    setQ('');
    toast({ message: `Added ${name}` }, 1800);
  };
  const check = async (it: ListItem) => {
    const r = await groceryActions.purchase(it.id);
    if (r) toast({ message: `Got ${it.name}`, actionLabel: 'Undo', onAction: () => void groceryActions.undoPurchase(r.item, r.eventId) });
  };
  const addBack = async (row: { productId: string | null; name: string; section: string }) => {
    const p = row.productId ? g.products.find((x) => x.id === row.productId) : undefined;
    if (p) await groceryActions.addProduct(p);
    else await groceryActions.addOther(row.name, row.section as ListItem['section']);
    toast({ message: `Added ${row.name}` }, 1800);
  };
  const dismiss = (id: string) => void updatePrefs({ hiddenSuggestions: [...prefs.hiddenSuggestions, id] });

  const searching = q.trim().length >= 2;

  return (
    <main class="screen">
      <ScreenHeader title="Groceries" sub="Trader Joe's · City Point" />

      <div class="search-wrap">
        <Search class="lead" size={18} strokeWidth={2} />
        <input
          class="input"
          placeholder={g.catalog.count ? 'Search Trader Joe’s products' : 'Search (catalog not loaded yet)'}
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          enterkeyhint="search"
          autocomplete="off"
          aria-label="Search products"
        />
        {q && (
          <button class="icon-btn" aria-label="Clear search" onClick={() => setQ('')} style="position:absolute;right:2px;top:50%;transform:translateY(-50%)">
            <X size={18} />
          </button>
        )}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn btn--quiet" style="color:var(--terracotta-deep)" onClick={() => setOtherOpen(q.trim())}>
          <Plus size={16} /> Add other item
        </button>
      </div>

      {g.ready && g.catalog.count === 0 && !searching && (
        <div class="notice" style="margin-top:8px">
          <AlertTriangle size={18} strokeWidth={1.8} style="flex:none;margin-top:2px" />
          <span>
            {g.catalogLoading ? 'Downloading the product catalog…' : g.catalog.lastError ? `Product catalog unavailable: ${g.catalog.lastError}. You can still add items by name.` : 'Product catalog not loaded yet. You can still add items by name.'}
            {!g.catalogLoading && (
              <>
                {' '}
                <button class="btn btn--quiet" style="display:inline;padding:0;min-height:0;color:var(--terracotta-deep)" onClick={() => void groceryActions.syncCatalog(true)}>Retry</button>
              </>
            )}
          </span>
        </div>
      )}

      {searching && (
        <section aria-label="Search results" style="margin-top:8px">
          {results.length === 0 ? (
            <div class="empty" style="padding:24px 16px">
              <h3>No match</h3>
              <p>{g.catalog.count ? 'Not in the catalog.' : 'The catalog is not loaded.'} You can add “{q.trim()}” as an other item.</p>
              <button class="btn btn--ghost" style="margin-top:12px" onClick={() => setOtherOpen(q.trim())}>
                <Plus size={16} /> Add “{q.trim()}”
              </button>
            </div>
          ) : (
            <ul>
              {results.map((p) => {
                const qty = onList.get(p.id);
                return (
                  <li key={p.id}>
                    <button class="result" onClick={() => void add(p)} aria-label={`Add ${p.name}`}>
                      <Thumb src={p.imageUrl} />
                      <div class="result-body">
                        <div class="result-name">{p.name}</div>
                        <div class="result-sub">
                          {p.size ? `${p.size} · ` : ''}
                          {p.section}
                        </div>
                      </div>
                      {qty ? <span class="pill pill--sage">On list ×{qty}</span> : <Plus size={18} style="color:var(--ink-faint)" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!searching && state === 'first' && g.ready && (
        <div class="empty">
          <h3>Your list is empty</h3>
          <p>Search a product above, or add anything with “Add other item”.</p>
        </div>
      )}

      {!searching && state === 'list' && (
        <ListView list={g.list} onCheck={(it) => void check(it)} onQty={(it, d) => void groceryActions.setQty(it.id, it.qty + d)} />
      )}

      {!searching && state === 'suggest' && (
        <>
          <div class="empty" style="padding:24px 16px 8px">
            <h3>List is clear</h3>
            <p>Start again from what you usually buy.</p>
          </div>
          {buyAgain.length > 0 && (
            <>
              <div class="section-title">
                <h2>Buy again</h2>
                <span class="count">from your history</span>
              </div>
              <div class="buyagain">
                {buyAgain.map((r) => (
                  <button key={r.key} onClick={() => void addBack(r)} aria-label={`Add ${r.name}`}>
                    <Thumb src={r.imageUrl} />
                    <div class="name">{r.name}</div>
                    <div class="sub">{r.times ? `Bought ${r.times}×` : 'Added before'}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          {suggestions.length > 0 && (
            <>
              <div class="section-title">
                <h2>Discover</h2>
                <span class="count">never on your list</span>
              </div>
              {suggestions.map(({ product, why }) => (
                <div class="discover" key={product.id}>
                  <Thumb src={product.imageUrl} size={22} />
                  <div class="result-body">
                    <div class="result-name">{product.name}</div>
                    {product.size && <div class="result-sub">{product.size}</div>}
                    <div class="why">{why}</div>
                  </div>
                  <button class="icon-btn" aria-label={`Add ${product.name}`} onClick={() => void add(product)}><Plus size={20} /></button>
                  <button class="icon-btn" aria-label={`Dismiss ${product.name}`} onClick={() => dismiss(product.id)}><X size={18} /></button>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {otherOpen !== null && <OtherItemSheet initial={otherOpen} onClose={() => setOtherOpen(null)} onAdd={addOther} />}
    </main>
  );
}

function ListView({ list, onCheck, onQty }: { list: ListItem[]; onCheck: (it: ListItem) => void; onQty: (it: ListItem, d: number) => void }) {
  const order = new Map(SECTIONS.map((s, i) => [s, i]));
  const groups = new Map<string, ListItem[]>();
  for (const it of list) groups.set(it.section, [...(groups.get(it.section) ?? []), it]);
  const sections = [...groups.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
  return (
    <>
      {sections.map(([section, items]) => (
        <section class="gsection" key={section} aria-label={section}>
          <h2>{section}</h2>
          {items.map((it) => (
            <div class="gitem" key={it.id}>
              <button class="task-check" role="checkbox" aria-checked="false" aria-label={`Got ${it.name}`} onClick={() => onCheck(it)}>
                <Check size={14} strokeWidth={3} />
              </button>
              <Thumb src={it.imageUrl} />
              <div class="result-body">
                <div class="result-name">{it.name}</div>
                {it.size && <div class="result-sub">{it.size}</div>}
              </div>
              <div class="qty" aria-label={`Quantity ${it.qty}`}>
                <button aria-label={`Decrease ${it.name}`} onClick={() => onQty(it, -1)}><Minus size={14} /></button>
                <span>{it.qty}</span>
                <button aria-label={`Increase ${it.name}`} onClick={() => onQty(it, 1)}><Plus size={14} /></button>
              </div>
            </div>
          ))}
        </section>
      ))}
      <p class="small faint" style="margin-top:16px;text-align:center">Check an item off when it’s in your basket. Tap − to zero to remove without recording a purchase.</p>
    </>
  );
}

function OtherItemSheet({ initial, onClose, onAdd }: { initial: string; onClose: () => void; onAdd: (name: string, section: string) => void }) {
  const [name, setName] = useState(initial);
  const [section, setSection] = useState('Other');
  return (
    <Sheet
      title="Add other item"
      onClose={onClose}
      footer={
        <>
          <button class="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button class="btn" disabled={!name.trim()} onClick={() => onAdd(name.trim(), section)}>Add to list</button>
        </>
      }
    >
      <div class="field">
        <label for="other-name">Item name</label>
        <input id="other-name" class="input" value={name} placeholder="e.g. Bananas" onInput={(e) => setName((e.target as HTMLInputElement).value)} autoFocus enterkeyhint="done" onKeyDown={(e) => e.key === 'Enter' && name.trim() && onAdd(name.trim(), section)} />
      </div>
      <div class="field">
        <label>Aisle (optional)</label>
        <div class="chip-row" style="margin:0;padding-inline:0;flex-wrap:wrap;overflow:visible">
          {SECTIONS.map((s) => (
            <button key={s} class="chip" aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
