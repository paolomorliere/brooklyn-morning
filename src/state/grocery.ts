import type { Favorite, HistoryEvent, ListItem, Product, Section } from '@/types';
import { createStore } from './store';
import * as repo from '@/db/grocery';
import { catalogStatus, loadProducts, syncCatalog, type CatalogStatus } from '@/db/catalog';
import { buildIndex, type SearchIndex } from '@/lib/catalog';

interface GroceryState {
  list: ListItem[];
  history: HistoryEvent[];
  favorites: Favorite[];
  products: Product[];
  index: SearchIndex | null;
  catalog: CatalogStatus;
  catalogLoading: boolean;
  ready: boolean;
}

const emptyIndex: SearchIndex = { search: () => [] };

export const groceryStore = createStore<GroceryState>(
  { list: [], history: [], favorites: [], products: [], index: null, catalog: { version: null, count: 0, updatedAt: null, lastError: null, lastCheckedAt: null }, catalogLoading: false, ready: false },
  async () => {
    const [list, history, favorites, products, catalog] = await Promise.all([repo.allList(), repo.allHistory(), repo.allFavorites(), loadProducts(), catalogStatus()]);
    return { list, history, favorites, products, index: products.length ? buildIndex(products) : emptyIndex, catalog, catalogLoading: false, ready: true };
  },
);

const patch = (p: Partial<GroceryState>) => groceryStore.set({ ...groceryStore.get(), ...p });
const reloadPersonal = async () => {
  await groceryStore.ensure();
  patch({ list: await repo.allList(), history: await repo.allHistory(), favorites: await repo.allFavorites() });
};

export const groceryActions = {
  async addProduct(p: Product) {
    await repo.addProduct(p);
    await reloadPersonal();
  },
  async addOther(name: string, section?: Section) {
    await repo.addOther(name, section);
    await reloadPersonal();
  },
  async setQty(id: string, qty: number) {
    await repo.setQty(id, qty);
    await reloadPersonal();
  },
  async purchase(id: string) {
    const r = await repo.purchase(id);
    await reloadPersonal();
    return r;
  },
  async undoPurchase(item: ListItem, eventId: string) {
    await repo.undoPurchase(item, eventId);
    await reloadPersonal();
  },
  async remove(id: string) {
    await repo.removeFromList(id);
    await reloadPersonal();
  },
  async toggleFavorite(it: { productId: string | null; name: string; size?: string; section: Section; imageUrl: string | null }) {
    const now = await repo.toggleFavorite(it);
    await reloadPersonal();
    return now;
  },
  async clearHistory() {
    await repo.clearHistory();
    await reloadPersonal();
  },
  /** Download the catalog if we have none, or re-check the version once a week. Silent when offline. */
  async maybeSyncCatalog() {
    await groceryStore.ensure();
    const { catalog, catalogLoading } = groceryStore.get();
    if (catalogLoading) return;
    const stale = !catalog.lastCheckedAt || Date.now() - new Date(catalog.lastCheckedAt).getTime() > 7 * 86400e3;
    if (catalog.count === 0 || stale) await groceryActions.syncCatalog();
  },
  /** Check for a new catalog (cheap when unchanged). `force` re-downloads even if the version matches. */
  async syncCatalog(force = false) {
    await groceryStore.ensure();
    if (groceryStore.get().catalogLoading) return;
    patch({ catalogLoading: true });
    const status = await syncCatalog(import.meta.env.BASE_URL, force);
    const products = await loadProducts();
    patch({ catalog: status, products, index: products.length ? buildIndex(products) : emptyIndex, catalogLoading: false });
  },
};
