import { useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from 'lucide-preact';
import type { Category, Task } from '@/types';
import { Sheet } from '@/ui/Sheet';
import { todoActions } from '@/state/todo';
import { canMoveTask, moveTaskBy } from '@/lib/tasks';

interface Props {
  task: Task;
  categories: Category[];
  /** The open tasks of this task's category, in the order the screen shows them. */
  siblings: Task[];
  onClose: () => void;
  onManageCategories: () => void;
}

export function TaskSheet({ task, categories, siblings, onClose, onManageCategories }: Props) {
  const [text, setText] = useState(task.text);
  const [notes, setNotes] = useState(task.notes);
  const [categoryId, setCategoryId] = useState(task.categoryId);
  const [starred, setStarred] = useState(task.starred);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    await todoActions.update(task.id, { text: t, notes: notes.trim(), categoryId, starred });
    onClose();
  };

  return (
    <Sheet
      title="Edit task"
      onClose={onClose}
      footer={
        <>
          <button class="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button class="btn" onClick={() => void save()} disabled={!text.trim()}>Save</button>
        </>
      }
    >
      <div class="field">
        <label for="task-text">Task</label>
        <input id="task-text" class="input" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <label for="task-notes">Notes</label>
        <textarea id="task-notes" class="input" value={notes} placeholder="Optional" onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
      </div>
      <div class="field">
        <label>Category</label>
        <div class="chip-row" style="margin:0;padding-inline:0">
          {categories.map((c) => (
            <button key={c.id} class="chip" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</button>
          ))}
          <button class="chip" onClick={onManageCategories} aria-label="Add category"><Plus size={16} /> New</button>
        </div>
      </div>
      {/*
        The pointer-free way to reorder, and the only place the press-and-hold gesture is explained.
        It lives in the sheet rather than on the row so the list itself does not grow two buttons per
        task. The position shown counts within the block the task is in, because priority tasks stay
        pinned above the rest and a move never crosses that line.
      */}
      {siblings.length > 1 && (
        <div class="field">
          <label>Order in {categories.find((c) => c.id === task.categoryId)?.name ?? 'this category'}</label>
          <div class="task-move">
            <button
              class="btn btn--ghost"
              disabled={!canMoveTask(siblings, task.id, -1)}
              onClick={() => void todoActions.saveTaskOrder(moveTaskBy(siblings, task.id, -1))}
            >
              <ArrowUp size={17} strokeWidth={2} aria-hidden="true" /> Move up
            </button>
            <button
              class="btn btn--ghost"
              disabled={!canMoveTask(siblings, task.id, 1)}
              onClick={() => void todoActions.saveTaskOrder(moveTaskBy(siblings, task.id, 1))}
            >
              <ArrowDown size={17} strokeWidth={2} aria-hidden="true" /> Move down
            </button>
          </div>
          <p class="small faint" style="margin:6px 0 0">
            {positionNote(siblings, task)} On the list you can also press and hold a task for a moment, then drag it.
          </p>
        </div>
      )}

      <div class="field">
        <button class="row-btn" aria-pressed={starred} onClick={() => setStarred(!starred)}>
          <Star size={20} fill={starred ? 'currentColor' : 'none'} style={starred ? 'color:var(--terracotta)' : 'color:var(--ink-faint)'} />
          <span class="grow">{starred ? 'Priority on' : 'Mark as priority'}</span>
        </button>
        {!confirmDelete ? (
          <button class="row-btn danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={20} />
            <span class="grow">Delete task</span>
          </button>
        ) : (
          <button class="row-btn danger" onClick={() => void todoActions.remove(task.id).then(onClose)}>
            <Trash2 size={20} />
            <span class="grow">Tap again to delete permanently</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** "2nd of 5 priority tasks." — stated in terms of the block, since the blocks never mix. */
function positionNote(siblings: Task[], task: Task): string {
  const block = siblings.filter((t) => t.starred === task.starred);
  const i = block.findIndex((t) => t.id === task.id);
  if (i < 0) return '';
  const kind = task.starred ? 'priority task' : 'task';
  return `${ordinal(i + 1)} of ${block.length} ${kind}${block.length === 1 ? '' : 's'}.`;
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
