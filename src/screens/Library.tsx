import { useEffect, useMemo, useState } from 'preact/hooks';
import { BookOpen, Link as LinkIcon, Newspaper, Pencil, Plus, Search, Trash2 } from 'lucide-preact';
import type { LibraryEntry } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';
import { shortDate } from '@/lib/format';
import { navigate, routeParam } from '@/ui/router';
import { DEFAULT_TAGS, libraryActions, libraryStore } from '@/state/library';
import { lessonActions } from '@/state/lessons';

const ICONS = { story: Newspaper, lesson: BookOpen, own: LinkIcon };

export function Library() {
  const { entries, ready } = libraryStore.use();
  const toast = useToast();
  const [q, setQ] = useState(() => sessionStorage.getItem('library:q') ?? '');
  const [tag, setTag] = useState<string | null>(() => sessionStorage.getItem('library:tag'));
  const [editing, setEditing] = useState<LibraryEntry | 'new' | null>(null);

  // Give older saved items their content reference once per open, so tapping them reads rather than
  // edits. Additive and idempotent: nothing is deleted and nothing already readable is touched.
  useEffect(() => {
    void lessonActions.sync().finally(() => void libraryActions.repair());
  }, []);

  // Keep the search, the tag and the scroll position across a trip into the reader and back.
  useEffect(() => {
    try {
      sessionStorage.setItem('library:q', q);
      if (tag) sessionStorage.setItem('library:tag', tag);
      else sessionStorage.removeItem('library:tag');
    } catch { /* storage disabled; filters simply do not persist */ }
  }, [q, tag]);

  useEffect(() => {
    if (!ready) return;
    const y = Number(sessionStorage.getItem('library:scrollY') ?? '0');
    if (y > 0) requestAnimationFrame(() => scrollTo({ top: y }));
  }, [ready]);

  // `#/library/edit:<id>` opens the editor directly — the path the reader's Edit button uses.
  useEffect(() => {
    const p = routeParam();
    if (!p?.startsWith('edit:') || !ready) return;
    const hit = entries.find((e) => e.id === p.slice(5));
    if (hit) setEditing(hit);
    navigate('library');
  }, [ready, entries]);

  const openEntry = (e: LibraryEntry) => {
    try { sessionStorage.setItem('library:scrollY', String(Math.round(scrollY))); } catch { /* ignore */ }
    navigate('read', e.id);
  };

  const tags = useMemo(() => [...new Set([...DEFAULT_TAGS, ...entries.flatMap((e) => e.tags)])].filter((t) => entries.some((e) => e.tags.includes(t)) || DEFAULT_TAGS.includes(t)), [entries]);
  const shown = useMemo(
    () => entries.filter((e) => (!tag || e.tags.includes(tag)) && (!q || `${e.title} ${e.note} ${e.publisher ?? ''} ${e.url ?? ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [entries, tag, q],
  );

  return (
    <main class="screen">
      <ScreenHeader
        title="Library"
        sub={ready ? `${entries.length} saved` : ' '}
        right={
          <button class="icon-btn" aria-label="Add entry" onClick={() => setEditing('new')}>
            <Plus size={22} />
          </button>
        }
      />
      <div class="search-wrap">
        <Search class="lead" size={18} strokeWidth={2} />
        <input class="input" placeholder="Search saved items" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search library" autocomplete="off" />
      </div>
      <div class="chip-row" style="margin-top:12px">
        <button class="chip" aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
        {tags.map((t) => (
          <button key={t} class="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
        ))}
      </div>

      {ready && shown.length === 0 && (
        <div class="empty">
          <h3>{entries.length === 0 ? 'Nothing here yet' : 'No match'}</h3>
          <p>{entries.length === 0 ? 'Save a story or lesson from Morning, or add your own link with +.' : 'Try another word or tag.'}</p>
        </div>
      )}
      <ul style="margin-top:8px">
        {shown.map((e) => {
          const Icon = ICONS[e.kind];
          return (
            <li class="task" key={e.id} style="align-items:center">
              <div class="thumb" style="width:40px;height:40px;border-radius:10px;flex:none">
                <Icon size={18} strokeWidth={1.8} />
              </div>
              <button class="task-body" style="text-align:left" onClick={() => openEntry(e)} aria-label={`Read ${e.title}`}>
                <div class="task-text" style="font-weight:500">{e.title}</div>
                <div class="task-notes">
                  {e.publisher ? `${e.publisher} · ` : ''}
                  {e.note || shortDate(e.savedAt)}
                </div>
                {e.tags.length > 0 && (
                  <div class="gloss" style="margin-top:6px">
                    {e.tags.map((t) => <span key={t} class="pill pill--sage" style="padding:2px 8px">{t}</span>)}
                  </div>
                )}
              </button>
              <button class="icon-btn" onClick={() => setEditing(e)} aria-label={`Edit ${e.title}`}>
                <Pencil size={18} strokeWidth={1.9} />
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <EntrySheet
          entry={editing === 'new' ? null : editing}
          knownTags={tags}
          onClose={() => setEditing(null)}
          onSave={async (e) => {
            if (editing === 'new') await libraryActions.save(e);
            // Spread the edits over the existing entry so `ref` and `snapshot` survive: editing a
            // title or a note must never break the link to the saved content.
            else await libraryActions.update({ ...editing, ...e });
            setEditing(null);
            toast({ message: editing === 'new' ? 'Added to Library' : 'Saved' }, 1500);
          }}
          onDelete={editing === 'new' ? undefined : async () => { await libraryActions.remove(editing.id); setEditing(null); toast({ message: 'Removed' }, 1500); }}
        />
      )}
    </main>
  );
}

interface SheetProps { entry: LibraryEntry | null; knownTags: string[]; onClose: () => void; onSave: (e: Omit<LibraryEntry, 'id' | 'savedAt'>) => Promise<void>; onDelete?: () => Promise<void> }

function EntrySheet({ entry, knownTags, onClose, onSave, onDelete }: SheetProps) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [confirm, setConfirm] = useState(false);
  const toggle = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag('');
  };
  const urlOk = !url.trim() || /^https?:\/\/\S+$/i.test(url.trim());
  return (
    <Sheet
      title={entry ? 'Edit entry' : 'New entry'}
      onClose={onClose}
      footer={
        <>
          <button class="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button class="btn" disabled={!title.trim() || !urlOk} onClick={() => void onSave({ kind: entry?.kind ?? 'own', title: title.trim(), url: url.trim() || null, note: note.trim(), publisher: entry?.publisher, tags, ref: entry?.ref, snapshot: entry?.snapshot, contentMissing: entry?.contentMissing })}>Save</button>
        </>
      }
    >
      <div class="field">
        <label for="lib-title">Title</label>
        <input id="lib-title" class="input" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} autoFocus={!entry} />
      </div>
      <div class="field">
        <label for="lib-url">Link (optional)</label>
        <input id="lib-url" class="input" type="url" inputMode="url" placeholder="https://" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
        {!urlOk && <div class="error">Links need to start with http:// or https://</div>}
      </div>
      <div class="field">
        <label for="lib-note">Note</label>
        <textarea id="lib-note" class="input" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      </div>
      <div class="field">
        <label>Tags</label>
        <div class="chip-row" style="margin:0;padding-inline:0;flex-wrap:wrap;overflow:visible">
          {[...new Set([...knownTags, ...tags])].map((t) => (
            <button key={t} class="chip" aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>{t}</button>
          ))}
        </div>
        <form class="quickadd-row" style="margin-top:8px" onSubmit={(e) => { e.preventDefault(); addTag(); }}>
          <input class="input" placeholder="New tag" value={newTag} onInput={(e) => setNewTag((e.target as HTMLInputElement).value)} aria-label="New tag" />
          <button class="btn btn--ghost" type="submit" disabled={!newTag.trim()}><Plus size={18} /></button>
        </form>
      </div>
      {onDelete && (
        <button class="row-btn danger" style="margin-top:16px" onClick={() => (confirm ? void onDelete() : setConfirm(true))}>
          <Trash2 size={20} />
          <span class="grow">{confirm ? 'Tap again to remove' : 'Remove from Library'}</span>
        </button>
      )}
    </Sheet>
  );
}
