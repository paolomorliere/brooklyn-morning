import { useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronRight, Plus, Star } from 'lucide-preact';
import type { Category, Task } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';

interface Props {
  categories: Category[];
  tasks: Task[];
  onAdd?: (text: string, categoryId: string) => void;
}

export function Todo({ categories, tasks, onAdd }: Props) {
  const [text, setText] = useState('');
  const [catId, setCatId] = useState(categories.find((c) => c.system)?.id ?? categories[0]?.id ?? '');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onAdd?.(v, catId);
    setText('');
  };

  return (
    <main class="screen" style="padding-top:0">
      <div class="quickadd">
        <form
          class="quickadd-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            class="input"
            placeholder="Add a task…"
            value={text}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            enterkeyhint="done"
            autocapitalize="sentences"
            aria-label="New task"
          />
          <button class="btn" type="submit" aria-label="Add">
            <Plus size={20} />
          </button>
        </form>
        <div class="chip-row" role="radiogroup" aria-label="Category for new task">
          {categories.map((c) => (
            <button key={c.id} class="chip" role="radio" aria-checked={catId === c.id} aria-pressed={catId === c.id} onClick={() => setCatId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <ScreenHeader title="To Do" sub={`${open.length} open`} />

      {open.length === 0 && (
        <div class="empty">
          <h3>All clear</h3>
          <p>Type above and press return. Tasks land in Inbox unless you pick a category.</p>
        </div>
      )}

      {categories.map((c) => {
        const items = open.filter((t) => t.categoryId === c.id).sort((a, b) => Number(b.starred) - Number(a.starred) || a.order - b.order);
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
                  <li class="task" key={t.id}>
                    <button class="task-check" role="checkbox" aria-checked="false" aria-label={`Complete ${t.text}`}>
                      <Check size={14} strokeWidth={3} />
                    </button>
                    <div class="task-body">
                      <div class="task-text">{t.text}</div>
                      {t.notes && <div class="task-notes">{t.notes}</div>}
                    </div>
                    <button class="task-star" aria-pressed={t.starred} aria-label="Priority">
                      <Star size={18} fill={t.starred ? 'currentColor' : 'none'} />
                    </button>
                  </li>
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
              <button class="btn btn--quiet" style="color:var(--terracotta-deep)">Undo</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
