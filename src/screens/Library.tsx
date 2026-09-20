import { useState } from 'preact/hooks';
import { BookOpen, Link as LinkIcon, Newspaper, Plus, Search } from 'lucide-preact';
import type { LibraryEntry } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { shortDate } from '@/lib/format';

const ICONS = { story: Newspaper, lesson: BookOpen, own: LinkIcon };

export function Library({ entries }: { entries: LibraryEntry[] }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set(entries.flatMap((e) => e.tags))];
  const shown = entries.filter((e) => (!tag || e.tags.includes(tag)) && (!q || `${e.title} ${e.note}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <main class="screen">
      <ScreenHeader
        title="Library"
        sub={`${entries.length} saved`}
        right={
          <button class="icon-btn" aria-label="Add entry">
            <Plus size={22} />
          </button>
        }
      />
      <div class="search-wrap">
        <Search class="lead" size={18} strokeWidth={2} />
        <input class="input" placeholder="Search saved items" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search library" />
      </div>
      <div class="chip-row" style="margin-top:12px">
        <button class="chip" aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
        {tags.map((t) => (
          <button key={t} class="chip" aria-pressed={tag === t} onClick={() => setTag(t)}>{t}</button>
        ))}
      </div>

      {shown.length === 0 && (
        <div class="empty">
          <h3>Nothing here yet</h3>
          <p>Save a story or lesson from Morning, or add your own link with +.</p>
        </div>
      )}
      <ul style="margin-top:8px">
        {shown.map((e) => {
          const Icon = ICONS[e.kind];
          return (
            <li class="task" key={e.id} style="align-items:center">
              <div class="thumb" style="width:40px;height:40px;border-radius:10px">
                <Icon size={18} strokeWidth={1.8} />
              </div>
              <div class="task-body">
                <div class="task-text" style="font-weight:500">{e.title}</div>
                <div class="task-notes">
                  {e.publisher ? `${e.publisher} · ` : ''}
                  {e.note || shortDate(e.savedAt)}
                </div>
                {e.tags.length > 0 && (
                  <div class="gloss" style="margin-top:6px">
                    {e.tags.map((t) => (
                      <span key={t} class="pill pill--sage" style="padding:2px 8px">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
