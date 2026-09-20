import type { Favorite, HistoryEvent, ListItem, Product, Section } from '@/types';
import { newId, personalDB } from './personal';

export async function allList(): Promise<ListItem[]> {
  return (await personalDB()).getAll('list');
}
export async function allHistory(): Promise<HistoryEvent[]> {
  return (await personalDB()).getAll('history');
}

/** Add a catalog product (or bump its quantity) and record an `added` history event, in one transaction. */
export async function addProduct(p: Product): Promise<ListItem> {
  const db = await personalDB();
  const tx = db.transaction(['list', 'history'], 'readwrite');
  const existing = (await tx.objectStore('list').getAll()).find((it) => it.productId === p.id);
  const now = new Date().toISOString();
  let item: ListItem;
  if (existing) {
    item = { ...existing, qty: existing.qty + 1 };
  } else {
    // Copy display fields so the row still renders if the product vanishes from a future catalog.
    item = { id: newId(), productId: p.id, name: p.name, size: p.size, section: p.section, imageUrl: p.imageUrl, qty: 1, addedAt: now };
    tx.objectStore('history').put({ id: newId(), productId: p.id, name: p.name, section: p.section, imageUrl: p.imageUrl, kind: 'added', at: now });
  }
  tx.objectStore('list').put(item);
  await tx.done;
  return item;
}

/** Add a free-text item not in the catalog. */
export async function addOther(name: string, section: Section = 'Other'): Promise<ListItem> {
  const db = await personalDB();
  const tx = db.transaction(['list', 'history'], 'readwrite');
  const clean = name.trim();
  const existing = (await tx.objectStore('list').getAll()).find((it) => it.productId === null && it.name.toLowerCase() === clean.toLowerCase());
  const now = new Date().toISOString();
  let item: ListItem;
  if (existing) item = { ...existing, qty: existing.qty + 1 };
  else {
    item = { id: newId(), productId: null, name: clean, size: '', section, imageUrl: null, qty: 1, addedAt: now };
    tx.objectStore('history').put({ id: newId(), productId: null, name: clean, section, imageUrl: null, kind: 'added', at: now });
  }
  tx.objectStore('list').put(item);
  await tx.done;
  return item;
}

export async function setQty(id: string, qty: number): Promise<void> {
  const db = await personalDB();
  const tx = db.transaction('list', 'readwrite');
  const it = await tx.store.get(id);
  if (it) {
    if (qty <= 0) await tx.store.delete(id);
    else await tx.store.put({ ...it, qty });
  }
  await tx.done;
}

/** Check-off: remove from list and record a `purchased` event. Returns the removed row for Undo. */
export async function purchase(id: string): Promise<{ item: ListItem; eventId: string } | null> {
  const db = await personalDB();
  const tx = db.transaction(['list', 'history'], 'readwrite');
  const item = await tx.objectStore('list').get(id);
  if (!item) return null;
  const eventId = newId();
  tx.objectStore('history').put({ id: eventId, productId: item.productId, name: item.name, section: item.section, imageUrl: item.imageUrl, kind: 'purchased', at: new Date().toISOString() });
  tx.objectStore('list').delete(id);
  await tx.done;
  return { item, eventId };
}

/** Undo a check-off: restore the row and delete the purchase event. */
export async function undoPurchase(item: ListItem, eventId: string): Promise<void> {
  const db = await personalDB();
  const tx = db.transaction(['list', 'history'], 'readwrite');
  tx.objectStore('list').put(item);
  tx.objectStore('history').delete(eventId);
  await tx.done;
}

export async function removeFromList(id: string): Promise<void> {
  await (await personalDB()).delete('list', id);
}

export async function clearHistory(): Promise<void> {
  await (await personalDB()).clear('history');
}

export const favoriteKey = (it: { productId: string | null; name: string }) => it.productId ?? `other:${it.name.trim().toLowerCase()}`;

export async function allFavorites(): Promise<Favorite[]> {
  return (await personalDB()).getAll('favorites');
}

/** Add or remove a favorite. Returns true if it is now a favorite. */
export async function toggleFavorite(it: { productId: string | null; name: string; size?: string; section: Section; imageUrl: string | null }): Promise<boolean> {
  const db = await personalDB();
  const key = favoriteKey(it);
  const tx = db.transaction('favorites', 'readwrite');
  const existing = await tx.store.get(key);
  if (existing) await tx.store.delete(key);
  else await tx.store.put({ key, productId: it.productId, name: it.name.trim(), size: it.size ?? '', section: it.section, imageUrl: it.imageUrl, addedAt: new Date().toISOString() });
  await tx.done;
  return !existing;
}
