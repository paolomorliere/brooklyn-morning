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

/**
 * Manual reordering, within one category.
 *
 * Starred tasks stay pinned above the rest — that was the decision — so the list is really two
 * lists, and a task cannot leave the one it is in. Everything here takes and returns a sorted list
 * so the index a finger lands on is the index these functions reason about.
 */

/**
 * Give every task a gap-free `order`, numbered from 0 inside each star block.
 *
 * `sortOpen` only ever compares `order` between tasks of the same starred state, so the two blocks
 * can be numbered independently. Renumbering on every move is what stops deleted tasks, completed
 * tasks and the `Date.now()` values new tasks start with from leaving holes that later make a move
 * land somewhere unexpected.
 */
export function renumberTasks(tasks: Task[]): Task[] {
  let starred = 0;
  let plain = 0;
  return tasks.map((t) => ({ ...t, order: t.starred ? starred++ : plain++ }));
}

/** The first and last index a task may be dropped at: the bounds of its own star block. */
function blockBounds(sorted: Task[], starred: boolean): { first: number; last: number } {
  const starredCount = sorted.filter((t) => t.starred).length;
  return starred ? { first: 0, last: starredCount - 1 } : { first: starredCount, last: sorted.length - 1 };
}

/**
 * Move one task to `toIndex` within its category, clamped to its star block.
 *
 * `tasks` is one category's open tasks; the result is the same tasks, in the new order, renumbered.
 * An out-of-range index is clamped rather than refused, so a drag that overshoots the end of the
 * block drops at the end of the block instead of doing nothing.
 */
export function moveTask(tasks: Task[], id: string, toIndex: number): Task[] {
  const sorted = sortOpen(tasks);
  const from = sorted.findIndex((t) => t.id === id);
  if (from < 0) return renumberTasks(sorted);
  const { first, last } = blockBounds(sorted, sorted[from].starred);
  const to = Math.max(first, Math.min(last, toIndex));
  if (to === from) return renumberTasks(sorted);
  const next = [...sorted];
  const [moving] = next.splice(from, 1);
  next.splice(to, 0, moving);
  return renumberTasks(next);
}

/** One step up or down. The keyboard and the Move up / Move down buttons use this. */
export function moveTaskBy(tasks: Task[], id: string, direction: -1 | 1): Task[] {
  const sorted = sortOpen(tasks);
  const from = sorted.findIndex((t) => t.id === id);
  if (from < 0) return renumberTasks(sorted);
  return moveTask(sorted, id, from + direction);
}

/** Whether that step is possible, so a button that would do nothing can be disabled instead. */
export function canMoveTask(tasks: Task[], id: string, direction: -1 | 1): boolean {
  const sorted = sortOpen(tasks);
  const i = sorted.findIndex((t) => t.id === id);
  if (i < 0) return false;
  const j = i + direction;
  if (j < 0 || j >= sorted.length) return false;
  // The boundary between the starred block and the rest is not crossable in either direction.
  return sorted[j].starred === sorted[i].starred;
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
