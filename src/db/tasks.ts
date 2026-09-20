import type { Category, Task } from '@/types';
import { newId, personalDB } from './personal';
import { expiredCompletedIds, planCategoryRemoval, renumber } from '@/lib/tasks';

export async function allTasks(): Promise<Task[]> {
  return (await personalDB()).getAll('tasks');
}

export async function allCategories(): Promise<Category[]> {
  return renumber(await (await personalDB()).getAll('categories'));
}

export async function addTask(text: string, categoryId: string): Promise<Task> {
  const db = await personalDB();
  const task: Task = {
    id: newId(),
    text: text.trim(),
    notes: '',
    categoryId,
    starred: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
    order: Date.now(),
  };
  await db.put('tasks', task);
  return task;
}

export async function updateTask(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task | undefined> {
  const db = await personalDB();
  const tx = db.transaction('tasks', 'readwrite');
  const cur = await tx.store.get(id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export const completeTask = (id: string, at = new Date()) => updateTask(id, { completedAt: at.toISOString() });
export const uncompleteTask = (id: string) => updateTask(id, { completedAt: null });

export async function deleteTask(id: string): Promise<void> {
  await (await personalDB()).delete('tasks', id);
}

/** Remove completed tasks older than 12 h. Returns how many were removed. Call on load, resume, and visibility change. */
export async function purgeExpiredCompleted(now = Date.now()): Promise<number> {
  const db = await personalDB();
  const tx = db.transaction('tasks', 'readwrite');
  const ids = expiredCompletedIds(await tx.store.getAll(), now);
  for (const id of ids) tx.store.delete(id);
  await tx.done;
  return ids.length;
}

export async function addCategory(name: string): Promise<Category> {
  const db = await personalDB();
  const tx = db.transaction('categories', 'readwrite');
  const existing = await tx.store.getAll();
  const cat: Category = { id: newId(), name: name.trim(), order: existing.length };
  await tx.store.put(cat);
  await tx.done;
  return cat;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const db = await personalDB();
  const tx = db.transaction('categories', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) await tx.store.put({ ...cur, name: name.trim() });
  await tx.done;
}

export async function saveCategoryOrder(categories: Category[]): Promise<void> {
  const db = await personalDB();
  const tx = db.transaction('categories', 'readwrite');
  for (const c of renumber(categories)) tx.store.put(c);
  await tx.done;
}

/** Remove a category and move its tasks to `targetId`, atomically. */
export async function removeCategory(removeId: string, targetId: string): Promise<void> {
  const db = await personalDB();
  const tx = db.transaction(['categories', 'tasks'], 'readwrite');
  const categories = await tx.objectStore('categories').getAll();
  const tasks = await tx.objectStore('tasks').getAll();
  const plan = planCategoryRemoval(categories, tasks, removeId, targetId);
  for (const t of plan.movedTasks) tx.objectStore('tasks').put(t);
  await tx.objectStore('categories').delete(removeId);
  for (const c of plan.categories) tx.objectStore('categories').put(c);
  await tx.done;
}
