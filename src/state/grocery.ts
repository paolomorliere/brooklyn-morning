import type { HistoryEvent, ListItem, Product, Section } from '@/types';
import { createStore } from './store';
import * as repo from '@/db/grocery';
import { catalogStatus, loadProducts, syncCatalog, type CatalogStatus } from '@/db/catalog';
import { buildIndex, type SearchIndex } from '@/lib/catalog';

interface GroceryState {
  list: ListItem[];
  history: HistoryEvent[];
  products: Product[];
  index: SearchIndex | null;
  catalog: CatalogStatus;
  catalogLoading: boolean;
  ready: boolean;
}

const emptyIndex: SearchIndex = { search: () => [] };

export const groceryStore = createStore<GroceryState>(
  { list: [], history: [], products: [], index: null, catalog: { version: null, count: 0, updatedAt: null, lastError: null, lastCheckedAt: null }, catalogLoading: false, ready: false },
  async () => {
    const [list, history, products, catalog] = await Promise.all([repo.allList(), repo.allHistory(), loadProducts(), catalogStatus()]);
    return { list, history, products, index: products.length ? buildIndex(products) : emptyIndex, catalog, catalogLoading: false, ready: true };
  },
);

const patch = (p: Partial<GroceryState>) => groceryStore.set({ ...groceryStore.get(), ...p });
const reloadPersonal = async () => patch({ list: await repo.allList(), history: await repo.allHistory() });

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
  async clearHistory() {
    await repo.clearHistory();
    await reloadPersonal();
  },
  /** Check for a new catalog (cheap when unchanged). `force` re-downloads even if the version matches. */
  async syncCatalog(force = false) {
    if (groceryStore.get().catalogLoading) return;
    patch({ catalogLoading: true });
    const status = await syncCatalog(import.meta.env.BASE_URL, force);
    const products = await loadProducts();
    patch({ catalog: status, products, index: products.length ? buildIndex(products) : emptyIndex, catalogLoading: false });
  },
};
