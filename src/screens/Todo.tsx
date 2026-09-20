import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronRight, Plus, SlidersHorizontal, Star } from 'lucide-preact';
import type { Category, Task } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { useToast } from '@/ui/Toast';
import { onResume } from '@/state/store';
import { todoActions, todoStore } from '@/state/todo';
import { sortCompleted, sortOpen } from '@/lib/tasks';
import { TaskSheet } from './todo/TaskSheet';
import { CategoriesSheet } from './todo/CategoriesSheet';

export function Todo() {
  const { tasks, categories, ready } = todoStore.use();
  const toast = useToast();
  const [text, setText] = useState('');
  const [catId, setCatId] = useState('inbox');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Task | null>(null);
  const [managing, setManaging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 12-hour cleanup runs on load, resume, visibility change, and every 5 minutes.
  useEffect(() => onResume(() => void todoActions.purge()), []);
  useEffect(() => {
    if (ready && !categories.some((c) => c.id === catId)) setCatId(categories.find((c) => c.system)?.id ?? categories[0]?.id ?? 'inbox');
  }, [ready, categories, catId]);

  const open = tasks.filter((t) => !t.completedAt);
  const done = sortCompleted(tasks.filter((t) => t.completedAt));

  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    await todoActions.add(v, catId);
    inputRef.current?.focus(); // keep the keyboard up for rapid entry
  };

  const complete = async (t: Task) => {
    await todoActions.complete(t.id);
    toast({ message: `Done: ${t.text}`, actionLabel: 'Undo', onAction: () => void todoActions.uncomplete(t.id) });
  };

  return (
    <main class="screen" style="padding-top:0">
      <div class="quickadd">
        <form
          class="quickadd-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            class="input"
            placeholder="Add a task…"
            value={text}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            enterkeyhint="done"
            autocapitalize="sentences"
            autocomplete="off"
            aria-label="New task"
          />
          <button class="btn" type="submit" aria-label="Add" disabled={!text.trim()}>
            <Plus size={20} />
          </button>
        </form>
        <div class="chip-row" role="radiogroup" aria-label="Category for new task">
          {categories.map((c) => (
            <button key={c.id} type="button" class="chip" role="radio" aria-checked={catId === c.id} aria-pressed={catId === c.id} onClick={() => setCatId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <ScreenHeader
        title="To Do"
        sub={ready ? `${open.length} open` : ' '}
        right={
          <button class="icon-btn" aria-label="Manage categories" onClick={() => setManaging(true)}>
            <SlidersHorizontal size={22} strokeWidth={1.8} />
          </button>
        }
      />

      {ready && open.length === 0 && (
        <div class="empty">
          <h3>All clear</h3>
          <p>Type above and press return. Tasks land in Inbox unless you pick a category.</p>
        </div>
      )}

      {categories.map((c) => {
        const items = sortOpen(open.filter((t) => t.categoryId === c.id));
        if (items.length === 0) return null;
        const isCollapsed = collapsed[c.id];
        return (
          <section class="cat" key={c.id}>
            <button class="cat-head" onClick={() => setCollapsed({ ...collapsed, [c.id]: !isCollapsed })} aria-expanded={!isCollapsed}>
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              <h2>{c.name}</h2>
              <span class="count">{items.length}</span>
            </button>
            {!isCollapsed && (
              <ul>
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} onComplete={() => void complete(t)} onOpen={() => setEditing(t)} onStar={() => void todoActions.update(t.id, { starred: !t.starred })} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {done.length > 0 && (
        <div class="completed-strip">
          <div class="small faint" style="font-weight:600;margin-bottom:4px">
            Completed · clears 12 h after check-off
          </div>
          {done.map((t) => (
            <div class="row" key={t.id}>
              <span>{t.text}</span>
              <button class="btn btn--quiet" style="color:var(--terracotta-deep)" onClick={() => void todoActions.uncomplete(t.id)}>
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && <TaskSheet task={tasks.find((t) => t.id === editing.id) ?? editing} categories={categories} onClose={() => setEditing(null)} onManageCategories={() => { setEditing(null); setManaging(true); }} />}
      {managing && <CategoriesSheet categories={categories} tasks={tasks} onClose={() => setManaging(false)} />}
    </main>
  );
}

function TaskRow({ task, onComplete, onOpen, onStar }: { task: Task; onComplete: () => void; onOpen: () => void; onStar: () => void }) {
  return (
    <li class="task">
      <button class="task-check" role="checkbox" aria-checked="false" aria-label={`Complete ${task.text}`} onClick={onComplete}>
        <Check size={14} strokeWidth={3} />
      </button>
      <button class="task-body" onClick={onOpen} style="text-align:left">
        <div class="task-text">{task.text}</div>
        {task.notes && <div class="task-notes">{task.notes}</div>}
      </button>
      <button class="task-star" aria-pressed={task.starred} aria-label={task.starred ? 'Remove priority' : 'Mark priority'} onClick={onStar}>
        <Star size={18} fill={task.starred ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}

export type { Category };
