import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Product } from '@/types';
import { validateCatalog, type CatalogFile, type CatalogMeta } from '@/lib/catalog';

export interface ProductDetail {
  id: string;
  fetchedAt: string;
  found: boolean;
  name?: string;
  brands?: string;
  quantity?: string;
  servingSize?: string;
  ingredients?: string;
  allergens?: string[];
  traces?: string[];
  labels?: string[];
  categories?: string[];
  nutriscore?: string;
  nova?: number;
  nutriments?: Record<string, number>;
  imageFull?: string | null;
  imageIngredients?: string | null;
  imageNutrition?: string | null;
  stores?: string[];
  lastModified?: string;
  prices?: { price: number; currency: string; date: string; store: string }[];
}

interface CatalogDB extends DBSchema {
  products: { key: string; value: Product };
  meta: { key: string; value: { key: string; value: unknown } };
  details: { key: string; value: ProductDetail };
}

const NAME = 'brooklyn-catalog';
let dbp: Promise<IDBPDatabase<CatalogDB>> | null = null;

function db() {
  dbp ??= openDB<CatalogDB>(NAME, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('products', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) d.createObjectStore('details', { keyPath: 'id' });
    },
  });
  return dbp;
}

export function _resetCatalogDB() {
  dbp = null;
}

export interface CatalogStatus {
  version: string | null;
  count: number;
  updatedAt: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
}

export async function catalogStatus(): Promise<CatalogStatus> {
  const d = await db();
  const s = (await d.get('meta', 'status'))?.value as Partial<CatalogStatus> | undefined;
  return { version: null, count: 0, updatedAt: null, lastError: null, lastCheckedAt: null, ...s };
}

async function setStatus(patch: Partial<CatalogStatus>) {
  const d = await db();
  const cur = await catalogStatus();
  await d.put('meta', { key: 'status', value: { ...cur, ...patch } });
}

export async function loadProducts(): Promise<Product[]> {
  return (await db()).getAll('products');
}

/** Replace the whole catalog in one transaction. Only called after validation passed. */
async function replaceCatalog(file: CatalogFile): Promise<void> {
  const d = await db();
  const tx = d.transaction(['products', 'meta'], 'readwrite');
  await tx.objectStore('products').clear();
  for (const p of file.products) tx.objectStore('products').put(p);
  const cur = ((await tx.objectStore('meta').get('status'))?.value ?? {}) as Partial<CatalogStatus>;
  tx.objectStore('meta').put({ key: 'status', value: { ...cur, version: file.version, count: file.products.length, updatedAt: new Date().toISOString(), lastError: null } });
  await tx.done;
}

async function sha256(text: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check the server for a newer catalog; download, validate, and swap atomically.
 * Never removes a working catalog: on any failure the previous one stays and the error is recorded.
 */
export async function syncCatalog(base: string, force = false): Promise<CatalogStatus> {
  const status = await catalogStatus();
  try {
    const metaRes = await fetch(`${base}data/catalog.meta.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
    if (!metaRes.ok) throw new Error(`Could not reach catalog (HTTP ${metaRes.status})`);
    const meta = (await metaRes.json()) as CatalogMeta;
    if (!force && meta.version === status.version && status.count > 0) {
      await setStatus({ lastCheckedAt: new Date().toISOString(), lastError: null });
      return catalogStatus();
    }
    const res = await fetch(`${base}data/catalog.json`, { cache: 'no-cache', signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Could not download catalog (HTTP ${res.status})`);
    const text = await res.text();
    const digest = await sha256(text);
    if (digest && meta.checksum && digest !== meta.checksum) throw new Error('Catalog download was incomplete or altered (checksum mismatch)');
    const file: unknown = JSON.parse(text);
    const problems = validateCatalog(file, status.count);
    if (problems.length) throw new Error(problems[0]);
    await replaceCatalog(file as CatalogFile);
    await setStatus({ lastCheckedAt: new Date().toISOString() });
  } catch (e) {
    await setStatus({ lastCheckedAt: new Date().toISOString(), lastError: (e as Error).message });
  }
  return catalogStatus();
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return (await db()).get('products', id);
}

const DETAIL_TTL_MS = 30 * 86400e3;
const OFF_FIELDS = 'product_name,brands,quantity,serving_size,ingredients_text_en,ingredients_text,allergens_tags,traces_tags,labels_tags,categories_tags,nutriscore_grade,nova_group,nutriments,image_front_url,image_ingredients_url,image_nutrition_url,stores_tags,last_modified_t';
const tag = (t: string) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');

/** Product details from Open Food Facts (and any crowd-reported prices from Open Prices), cached for 30 days. */
export async function productDetail(id: string, force = false): Promise<ProductDetail> {
  const d = await db();
  const cached = await d.get('details', id);
  if (cached && !force && Date.now() - new Date(cached.fetchedAt).getTime() < DETAIL_TTL_MS) return cached;
  let detail: ProductDetail = { id, fetchedAt: new Date().toISOString(), found: false };
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(id)}.json?fields=${OFF_FIELDS}`, { signal: AbortSignal.timeout(12_000) });
    if (r.ok) {
      const j = (await r.json()) as { status: number; product?: Record<string, unknown> };
      const p = j.product;
      if (j.status === 1 && p) {
        const n = (p.nutriments ?? {}) as Record<string, number>;
        const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => typeof n[k] === 'number').map((k) => [k, n[k]]));
        detail = {
          id,
          fetchedAt: detail.fetchedAt,
          found: true,
          name: p.product_name as string,
          brands: p.brands as string,
          quantity: p.quantity as string,
          servingSize: p.serving_size as string,
          ingredients: ((p.ingredients_text_en as string) || (p.ingredients_text as string) || '').trim(),
          allergens: ((p.allergens_tags as string[]) ?? []).map(tag),
          traces: ((p.traces_tags as string[]) ?? []).map(tag),
          labels: ((p.labels_tags as string[]) ?? []).map(tag),
          categories: ((p.categories_tags as string[]) ?? []).map(tag).slice(-4),
          nutriscore: p.nutriscore_grade as string,
          nova: p.nova_group as number,
          nutriments: pick(['energy-kcal_100g', 'fat_100g', 'saturated-fat_100g', 'carbohydrates_100g', 'sugars_100g', 'fiber_100g', 'proteins_100g', 'salt_100g', 'energy-kcal_serving']),
          imageFull: (p.image_front_url as string) ?? null,
          imageIngredients: (p.image_ingredients_url as string) ?? null,
          imageNutrition: (p.image_nutrition_url as string) ?? null,
          stores: ((p.stores_tags as string[]) ?? []).map(tag),
          lastModified: p.last_modified_t ? new Date((p.last_modified_t as number) * 1000).toISOString() : undefined,
        };
      }
    }
  } catch { /* offline or blocked: keep found=false; caller shows the catalog copy */ }
  try {
    const r = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(id)}&size=5&order_by=-date`, { signal: AbortSignal.timeout(8_000) });
    if (r.ok) {
      const j = (await r.json()) as { items?: { price: number; currency: string; date: string; location?: { osm_name?: string } }[] };
      detail.prices = (j.items ?? []).map((it) => ({ price: it.price, currency: it.currency, date: it.date, store: it.location?.osm_name ?? 'unknown store' }));
    }
  } catch { /* optional */ }
  if (detail.found || detail.prices?.length) await d.put('details', detail);
  return detail;
}
