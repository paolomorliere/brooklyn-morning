import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Product } from '@/types';
import { validateCatalog, type CatalogFile, type CatalogMeta } from '@/lib/catalog';

interface CatalogDB extends DBSchema {
  products: { key: string; value: Product };
  meta: { key: string; value: { key: string; value: unknown } };
}

const NAME = 'brooklyn-catalog';
let dbp: Promise<IDBPDatabase<CatalogDB>> | null = null;

function db() {
  dbp ??= openDB<CatalogDB>(NAME, 1, {
    upgrade(d) {
      d.createObjectStore('products', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'key' });
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
