import type { Category, Task } from '@/types';
import { createStore } from './store';
import * as repo from '@/db/tasks';

interface TodoState { tasks: Task[]; categories: Category[]; ready: boolean }

export const todoStore = createStore<TodoState>({ tasks: [], categories: [], ready: false }, async () => ({
  tasks: await repo.allTasks(),
  categories: await repo.allCategories(),
  ready: true,
}));

const refresh = () => todoStore.reload();

export const todoActions = {
  async add(text: string, categoryId: string) {
    await todoStore.ensure();
    const t = await repo.addTask(text, categoryId);
    todoStore.set({ ...todoStore.get(), tasks: [...todoStore.get().tasks, t] });
    return t;
  },
  async update(id: string, patch: Partial<Task>) {
    await todoStore.ensure();
    await repo.updateTask(id, patch);
    todoStore.set({ ...todoStore.get(), tasks: todoStore.get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  },
  complete: (id: string) => todoActions.update(id, { completedAt: new Date().toISOString() }),
  uncomplete: (id: string) => todoActions.update(id, { completedAt: null }),
  async remove(id: string) {
    await todoStore.ensure();
    await repo.deleteTask(id);
    todoStore.set({ ...todoStore.get(), tasks: todoStore.get().tasks.filter((t) => t.id !== id) });
  },
  async purge() {
    if ((await repo.purgeExpiredCompleted()) > 0) await refresh();
  },
  async addCategory(name: string) {
    const c = await repo.addCategory(name);
    await refresh();
    return c;
  },
  async renameCategory(id: string, name: string) {
    await repo.renameCategory(id, name);
    await refresh();
  },
  /**
   * Save a new order for one category's tasks.
   *
   * The store is updated before the write, not after it: a reorder that waited for IndexedDB and a
   * reload would let the row Paolo just dragged snap back to where it was and settle a moment later.
   */
  async saveTaskOrder(ordered: Task[]) {
    await todoStore.ensure();
    const orders = new Map(ordered.map((t) => [t.id, t.order]));
    const s = todoStore.get();
    todoStore.set({
      ...s,
      tasks: s.tasks.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id) as number } : t)),
    });
    await repo.saveTaskOrder(ordered);
  },
  async saveCategoryOrder(categories: Category[]) {
    await repo.saveCategoryOrder(categories);
    await refresh();
  },
  async removeCategory(id: string, targetId: string) {
    await repo.removeCategory(id, targetId);
    await refresh();
  },
  refresh,
};
