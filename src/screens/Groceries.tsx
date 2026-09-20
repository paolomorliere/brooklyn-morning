import { useState } from 'preact/hooks';
import { Check, Minus, Package, Plus, Search, X } from 'lucide-preact';
import type { HistoryEvent, ListItem, Product } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';

interface Props {
  list: ListItem[];
  history: HistoryEvent[];
  buyAgain: Product[];
  discover: { product: Product; why: string }[];
  searchResults?: Product[];
}

export function Groceries({ list, history, buyAgain, discover }: Props) {
  const [q, setQ] = useState('');
  const sections = groupBySection(list);
  const state = list.length > 0 ? 'list' : history.length > 0 ? 'suggest' : 'first';

  return (
    <main class="screen">
      <ScreenHeader title="Groceries" sub="Trader Joe's · City Point" />

      <div class="search-wrap">
        <Search class="lead" size={18} strokeWidth={2} />
        <input
          class="input"
          placeholder="Search Trader Joe's products"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          enterkeyhint="search"
          aria-label="Search products"
        />
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn btn--quiet" style="color:var(--terracotta-deep)">
          <Plus size={16} /> Add other item
        </button>
      </div>

      {state === 'first' && (
        <div class="empty">
          <h3>Your list is empty</h3>
          <p>Search a product above, or add anything with "Add other item".</p>
        </div>
      )}

      {state === 'list' &&
        sections.map(([section, items]) => (
          <section class="gsection" key={section}>
            <h2>{section}</h2>
            {items.map((it) => (
              <div class="gitem" key={it.id}>
                <button class="task-check" role="checkbox" aria-checked="false" aria-label={`Got ${it.name}`}>
                  <Check size={14} strokeWidth={3} />
                </button>
                <div class="thumb">
                  {it.imageUrl ? <img src={it.imageUrl} alt="" loading="lazy" /> : <Package size={20} strokeWidth={1.6} />}
                </div>
                <div class="result-body">
                  <div class="result-name">{it.name}</div>
                  {it.size && <div class="result-sub">{it.size}</div>}
                </div>
                <div class="qty" aria-label={`Quantity ${it.qty}`}>
                  <button aria-label="Decrease"><Minus size={14} /></button>
                  <span>{it.qty}</span>
                  <button aria-label="Increase"><Plus size={14} /></button>
                </div>
              </div>
            ))}
          </section>
        ))}

      {state === 'suggest' && (
        <>
          <div class="empty" style="padding:24px 16px 8px">
            <h3>List is clear</h3>
            <p>Start again from what you usually buy.</p>
          </div>
          <div class="section-title">
            <h2>Buy again</h2>
            <span class="count">from your history</span>
          </div>
          <div class="buyagain">
            {buyAgain.map((p) => (
              <button key={p.id}>
                <div class="thumb">{p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <Package size={20} strokeWidth={1.6} />}</div>
                <div class="name">{p.name}</div>
                <div class="sub">{p.size}</div>
              </button>
            ))}
          </div>
          {discover.length > 0 && (
            <>
              <div class="section-title">
                <h2>Discover</h2>
                <span class="count">never on your list</span>
              </div>
              {discover.map(({ product, why }) => (
                <div class="discover" key={product.id}>
                  <div class="thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <Package size={22} strokeWidth={1.6} />}</div>
                  <div class="result-body">
                    <div class="result-name">{product.name}</div>
                    <div class="result-sub">{product.size}</div>
                    <div class="why">{why}</div>
                  </div>
                  <button class="icon-btn" aria-label="Add to list"><Plus size={20} /></button>
                  <button class="icon-btn" aria-label="Dismiss"><X size={18} /></button>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}

function groupBySection(list: ListItem[]): [string, ListItem[]][] {
  const m = new Map<string, ListItem[]>();
  for (const it of list) m.set(it.section, [...(m.get(it.section) ?? []), it]);
  return [...m.entries()];
}
