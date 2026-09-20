import type { Category, Task } from '@/types';

export const COMPLETED_TTL_MS = 12 * 60 * 60 * 1000;

/** Ids of completed tasks whose 12-hour window has elapsed at `now`. Pure; safe to run on every resume. */
export function expiredCompletedIds(tasks: Task[], now: number = Date.now()): string[] {
  return tasks
    .filter((t) => t.completedAt !== null && now - new Date(t.completedAt).getTime() >= COMPLETED_TTL_MS)
    .map((t) => t.id);
}

/** Open tasks for a category: starred first, then manual order, then creation time. */
export function sortOpen(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => Number(b.starred) - Number(a.starred) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/** Completed tasks, most recent first. */
export function sortCompleted(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

/**
 * Plan a category removal: every task in `removeId` moves to `targetId`.
 * Returns the updated tasks and categories (re-numbered), or throws if the plan is invalid.
 */
export function planCategoryRemoval(categories: Category[], tasks: Task[], removeId: string, targetId: string) {
  const remove = categories.find((c) => c.id === removeId);
  const target = categories.find((c) => c.id === targetId);
  if (!remove) throw new Error('Category not found');
  if (remove.system) throw new Error('Inbox cannot be removed');
  if (!target || targetId === removeId) throw new Error('Choose a different category to move tasks to');
  const movedTasks = tasks.filter((t) => t.categoryId === removeId).map((t) => ({ ...t, categoryId: targetId }));
  const remaining = renumber(categories.filter((c) => c.id !== removeId));
  return { movedTasks, categories: remaining };
}

export function renumber(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, order: i }));
}

export function moveCategory(categories: Category[], id: string, direction: -1 | 1): Category[] {
  const sorted = renumber(categories);
  const i = sorted.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return sorted;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  return renumber(sorted.map((c, k) => ({ ...c, order: k })));
}

export function validateCategoryName(name: string, existing: Category[], selfId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Name cannot be empty';
  if (n.length > 40) return 'Keep it under 40 characters';
  if (existing.some((c) => c.id !== selfId && c.name.toLowerCase() === n.toLowerCase())) return 'That name is already used';
  return null;
}
