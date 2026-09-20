import { useEffect, useMemo, useState } from 'preact/hooks';
import { ChevronLeft, ExternalLink, Minus, Plus, Star } from 'lucide-preact';
import type { Product } from '@/types';
import { navigate, useRouteParam } from '@/ui/router';
import { useToast } from '@/ui/Toast';
import { Thumb } from '@/ui/Thumb';
import { getProduct, productDetail, type ProductDetail as Detail } from '@/db/catalog';
import { groceryActions, groceryStore } from '@/state/grocery';
import { favoriteKey } from '@/db/grocery';
import { aisleEstimate } from '@/lib/prices';
import { shortDate } from '@/lib/format';

const NUTRIENT_LABELS: [string, string, string][] = [
  ['energy-kcal_100g', 'Calories', 'kcal'],
  ['fat_100g', 'Fat', 'g'],
  ['saturated-fat_100g', 'Saturated fat', 'g'],
  ['carbohydrates_100g', 'Carbs', 'g'],
  ['sugars_100g', 'Sugars', 'g'],
  ['fiber_100g', 'Fiber', 'g'],
  ['proteins_100g', 'Protein', 'g'],
  ['salt_100g', 'Salt', 'g'],
];

export function ProductDetail() {
  const id = useRouteParam();
  const g = groceryStore.use();
  const toast = useToast();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setImgFailed(false);
    void (async () => {
      const p = (await getProduct(id)) ?? g.products.find((x) => x.id === id) ?? null;
      setProduct(p);
      setDetail(await productDetail(id));
      setLoading(false);
    })();
  }, [id]);

  const onList = useMemo(() => g.list.find((it) => it.productId === id), [g.list, id]);
  const isFav = useMemo(() => product ? g.favorites.some((f) => f.key === favoriteKey({ productId: product.id, name: product.name })) : false, [g.favorites, product]);

  if (!id || product === null) {
    return (
      <main class="screen">
        <Header />
        <div class="empty"><h3>Product not found</h3><p>It may have left the catalog. You can still add it by name from Groceries.</p></div>
      </main>
    );
  }
  if (!product) return <main class="screen"><Header /></main>;

  const img = (detail?.imageFull && !imgFailed ? detail.imageFull : null) ?? (product.imageUrl && !imgFailed ? product.imageUrl.replace(/\.200\.jpg$/, '.400.jpg') : null);
  const estimate = aisleEstimate(product.section);
  const offUrl = `https://world.openfoodfacts.org/product/${encodeURIComponent(product.id)}`;

  return (
    <main class="screen" style="padding-top:0">
      <Header />
      <div class="pd-image" onClick={() => img && setShowFull(true)} role={img ? 'button' : undefined} aria-label={img ? 'View full-size photo' : undefined}>
        {img ? <img src={img} alt={product.name} onError={() => setImgFailed(true)} /> : <div style="text-align:center;color:var(--ink-faint)"><Thumb src={null} size={40} class="pd-placeholder" /><div class="small" style="margin-top:8px">No photo in the database yet</div></div>}
      </div>
      <h1 style="font-size:var(--fs-28);margin-top:16px;line-height:1.15">{detail?.name?.trim() || product.name}</h1>
      <div class="muted" style="margin-top:6px">
        {[detail?.brands || "Trader Joe's", detail?.quantity && detail.quantity !== 'varies' ? detail.quantity : product.size, product.section].filter(Boolean).join(' · ')}
      </div>

      <div class="pd-actions">
        {onList ? (
          <div class="qty" aria-label={`Quantity ${onList.qty}`} style="height:44px">
            <button aria-label="Decrease" style="width:44px;height:44px" onClick={() => void groceryActions.setQty(onList.id, onList.qty - 1)}><Minus size={16} /></button>
            <span style="min-width:32px">{onList.qty}</span>
            <button aria-label="Increase" style="width:44px;height:44px" onClick={() => void groceryActions.setQty(onList.id, onList.qty + 1)}><Plus size={16} /></button>
          </div>
        ) : (
          <button class="btn" style="flex:1" onClick={() => void groceryActions.addProduct(product).then(() => toast({ message: `Added ${product.name}` }, 1500))}><Plus size={18} /> Add to list</button>
        )}
        <button class={`btn btn--ghost fav-btn-lg`} aria-pressed={isFav} aria-label={isFav ? 'Remove from Favorites' : 'Add to Favorites'} onClick={() => void groceryActions.toggleFavorite({ productId: product.id, name: product.name, size: product.size, section: product.section, imageUrl: product.imageUrl })}>
          <Star size={18} fill={isFav ? 'currentColor' : 'none'} style={isFav ? 'color:var(--star)' : ''} /> {isFav ? 'Favorite' : 'Favorite'}
        </button>
      </div>

      <section class="card pd-card">
        <h2 class="pd-h">Price</h2>
        {detail?.prices?.length ? (
          <>
            <div style="font-size:var(--fs-22);font-family:var(--font-display)">{detail.prices[0].currency === 'USD' ? '$' : detail.prices[0].currency + ' '}{detail.prices[0].price.toFixed(2)}</div>
            <div class="small muted">Reported by a shopper on {shortDate(`${detail.prices[0].date}T12:00:00`)} at {detail.prices[0].store}{detail.prices.length > 1 ? ` · ${detail.prices.length} reports` : ''} (Open Prices)</div>
          </>
        ) : (
          <>
            <div style="font-size:var(--fs-22);font-family:var(--font-display)">{estimate ?? '—'}</div>
            <div class="small muted">Rough estimate for the <strong>{product.section}</strong> aisle at Trader Joe's, not this product's price. Trader Joe's publishes no prices and no shopper has reported one for this item.</div>
          </>
        )}
      </section>

      {loading && <p class="small faint" style="margin-top:12px">Loading details from Open Food Facts…</p>}

      {!loading && detail && !detail.found && (
        <p class="small muted" style="margin-top:12px">No extra details available right now (offline, or the record has no more data). What you see is the catalog copy.</p>
      )}

      {detail?.found && (
        <>
          {(detail.labels?.length || detail.allergens?.length || detail.traces?.length) ? (
            <section class="card pd-card">
              <h2 class="pd-h">At a glance</h2>
              <div class="gloss" style="margin-top:6px">
                {detail.labels?.slice(0, 8).map((l) => <span key={l} class="pill pill--sage">{l}</span>)}
                {detail.allergens?.map((a) => <span key={a} class="pill pill--terra">contains {a}</span>)}
                {detail.traces?.map((a) => <span key={a} class="pill">may contain {a}</span>)}
              </div>
            </section>
          ) : null}

          {detail.ingredients && (
            <section class="card pd-card">
              <h2 class="pd-h">Ingredients</h2>
              <p style="font-size:var(--fs-15);line-height:1.5;margin-top:6px">{detail.ingredients}</p>
            </section>
          )}

          {detail.nutriments && Object.keys(detail.nutriments).length > 0 && (
            <section class="card pd-card">
              <h2 class="pd-h">Nutrition per 100 g{detail.servingSize ? ` · serving ${detail.servingSize}` : ''}</h2>
              <table class="pd-table">
                <tbody>
                  {NUTRIENT_LABELS.filter(([k]) => detail.nutriments![k] != null).map(([k, label, unit]) => (
                    <tr key={k}><td>{label}</td><td class="num">{Math.round(detail.nutriments![k] * 10) / 10} {unit}</td></tr>
                  ))}
                </tbody>
              </table>
              <div class="small muted" style="margin-top:8px">
                {detail.nutriscore && detail.nutriscore.length === 1 ? `Nutri-Score ${detail.nutriscore.toUpperCase()} · ` : ''}
                {detail.nova ? `NOVA group ${detail.nova} (1 = unprocessed, 4 = ultra-processed)` : ''}
              </div>
            </section>
          )}

          {(detail.imageIngredients || detail.imageNutrition) && (
            <section class="card pd-card">
              <h2 class="pd-h">Label photos</h2>
              <div style="display:flex;gap:8px;margin-top:8px">
                {detail.imageIngredients && <a href={detail.imageIngredients} target="_blank" rel="noopener noreferrer" class="pd-thumb-link"><img src={detail.imageIngredients} alt="Ingredients label" loading="lazy" onError={(e) => ((e.currentTarget as HTMLElement).parentElement!.style.display = 'none')} /></a>}
                {detail.imageNutrition && <a href={detail.imageNutrition} target="_blank" rel="noopener noreferrer" class="pd-thumb-link"><img src={detail.imageNutrition} alt="Nutrition label" loading="lazy" onError={(e) => ((e.currentTarget as HTMLElement).parentElement!.style.display = 'none')} /></a>}
              </div>
            </section>
          )}
        </>
      )}

      <p class="small faint" style="margin-top:16px;line-height:1.45">
        Data and photos from Open Food Facts contributors (ODbL / CC BY-SA){detail?.lastModified ? `, last edited ${shortDate(detail.lastModified)}` : ''}. Community data can be incomplete or out of date; check the package. Being listed does not mean City Point stocks it.
      </p>
      <a class="btn btn--ghost btn--block" style="margin-top:12px" href={offUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open on Open Food Facts</a>

      {showFull && img && (
        <div class="sheet-backdrop" style="align-items:center;justify-content:center;background:rgba(43,29,22,.92)" onClick={() => setShowFull(false)}>
          <img src={img} alt={product.name} style="max-width:100%;max-height:90dvh;object-fit:contain" />
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <header class="screen-header" style="align-items:center;padding-top:calc(var(--safe-top) + 8px)">
      <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('groceries'))} style="margin-left:-12px"><ChevronLeft size={24} /></button>
      <h1 style="flex:1;font-size:var(--fs-18);font-family:var(--font-ui);font-weight:600">Product</h1>
    </header>
  );
}
