import { useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from 'lucide-preact';
import type { Category, Task } from '@/types';
import { Sheet } from '@/ui/Sheet';
import { todoActions } from '@/state/todo';
import { moveCategory, validateCategoryName } from '@/lib/tasks';

interface Props { categories: Category[]; tasks: Task[]; onClose: () => void }

export function CategoriesSheet({ categories, tasks, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = (id: string) => tasks.filter((t) => t.categoryId === id).length;

  const add = async () => {
    const err = validateCategoryName(newName, categories);
    if (err) return setError(err);
    setError(null);
    await todoActions.addCategory(newName);
    setNewName('');
  };
  const rename = async () => {
    if (!editId) return;
    const err = validateCategoryName(editName, categories, editId);
    if (err) return setError(err);
    setError(null);
    await todoActions.renameCategory(editId, editName);
    setEditId(null);
  };
  const move = (id: string, d: -1 | 1) => void todoActions.saveCategoryOrder(moveCategory(categories, id, d));

  const removing = categories.find((c) => c.id === removeId);
  const inboxId = categories.find((c) => c.system)?.id ?? 'inbox';

  return (
    <Sheet title="Categories" onClose={onClose}>
      <form
        class="quickadd-row"
        style="margin-top:8px"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input class="input" placeholder="New category" value={newName} onInput={(e) => setNewName((e.target as HTMLInputElement).value)} aria-label="New category name" />
        <button class="btn" type="submit" aria-label="Add category" disabled={!newName.trim()}><Plus size={20} /></button>
      </form>
      {error && <div class="error">{error}</div>}

      <ul style="margin-top:12px">
        {categories.map((c, i) => (
          <li class="row-btn" key={c.id} style="cursor:default">
            {editId === c.id ? (
              <form class="grow" style="display:flex;gap:8px" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
                <input class="input" value={editName} onInput={(e) => setEditName((e.target as HTMLInputElement).value)} aria-label="Rename to" autoFocus />
                <button class="btn" type="submit" aria-label="Save name"><Check size={18} /></button>
              </form>
            ) : (
              <>
                <div class="grow">
                  <div>{c.name}</div>
                  <div class="small faint">{count(c.id)} {count(c.id) === 1 ? 'task' : 'tasks'}{c.system ? ' · default for new tasks' : ''}</div>
                </div>
                <button class="icon-btn" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c.id, -1)} style={i === 0 ? 'opacity:.3' : ''}><ArrowUp size={18} /></button>
                <button class="icon-btn" aria-label={`Move ${c.name} down`} disabled={i === categories.length - 1} onClick={() => move(c.id, 1)} style={i === categories.length - 1 ? 'opacity:.3' : ''}><ArrowDown size={18} /></button>
                <button class="icon-btn" aria-label={`Rename ${c.name}`} onClick={() => { setEditId(c.id); setEditName(c.name); setError(null); }}><Pencil size={18} /></button>
                {!c.system && (
                  <button class="icon-btn" aria-label={`Remove ${c.name}`} onClick={() => setRemoveId(c.id)} style="color:var(--danger)"><Trash2 size={18} /></button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {removing && (
        <div class="card" style="margin-top:16px;padding:16px">
          <h3 style="font-size:var(--fs-18)">Remove “{removing.name}”</h3>
          <p class="small muted" style="margin-top:4px">
            {count(removing.id) > 0 ? `Move its ${count(removing.id)} ${count(removing.id) === 1 ? 'task' : 'tasks'} to:` : 'It has no tasks. Remove it?'}
          </p>
          {count(removing.id) > 0 ? (
            <div class="chip-row" style="margin:12px 0 0;padding-inline:0">
              {categories.filter((c) => c.id !== removing.id).map((c) => (
                <button key={c.id} class="chip" onClick={() => void todoActions.removeCategory(removing.id, c.id).then(() => setRemoveId(null))}>
                  → {c.name}
                </button>
              ))}
            </div>
          ) : (
            <button class="btn" style="margin-top:12px;background:var(--danger)" onClick={() => void todoActions.removeCategory(removing.id, inboxId).then(() => setRemoveId(null))}>
              Remove
            </button>
          )}
          <button class="btn btn--quiet" style="margin-top:8px" onClick={() => setRemoveId(null)}>Cancel</button>
        </div>
      )}
    </Sheet>
  );
}
