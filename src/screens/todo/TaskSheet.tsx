import { useState } from 'preact/hooks';
import { Plus, Star, Trash2 } from 'lucide-preact';
import type { Category, Task } from '@/types';
import { Sheet } from '@/ui/Sheet';
import { todoActions } from '@/state/todo';

interface Props { task: Task; categories: Category[]; onClose: () => void; onManageCategories: () => void }

export function TaskSheet({ task, categories, onClose, onManageCategories }: Props) {
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
