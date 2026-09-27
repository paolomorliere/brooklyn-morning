import { useEffect, useMemo, useState } from 'preact/hooks';
import { ChevronLeft, ExternalLink, Info, Pencil } from 'lucide-preact';
import type { Lesson, LibraryEntry } from '@/types';
import { navigate, useRouteParam } from '@/ui/router';
import { LessonBody } from '@/ui/LessonBody';
import { libraryStore } from '@/state/library';
import { lessonStore } from '@/state/lessons';
import { editionActions } from '@/state/edition';
import { formatDateLong, shortDate } from '@/lib/format';

/**
 * Reading view for a saved Library item, at `#/read/<entry id>`.
 *
 * Tapping a saved item used to open the edit sheet, so its content was unreachable. Reading is now
 * the default and editing is a separate, clearly labelled action. The content comes from the
 * entry's stored reference — the lesson pack for a lesson, the snapshot or the archived edition for
 * a story — never from today's lesson or today's edition.
 */
export function Reader() {
  const id = useRouteParam();
  const lib = libraryStore.use();
  const ls = lessonStore.use();
  const entry = useMemo(() => lib.entries.find((e) => e.id === id) ?? null, [lib.entries, id]);

  useEffect(() => { scrollTo({ top: 0 }); }, [id]);

  if (!lib.ready) return <main class="screen"><Header entry={null} /></main>;
  if (!entry) {
    return (
      <main class="screen">
        <Header entry={null} />
        <div class="empty">
          <h3>Not in your Library</h3>
          <p>This item may have been deleted.</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => navigate('library')}>Back to Library</button>
        </div>
      </main>
    );
  }

  const ref = entry.ref;
  const lesson: Lesson | null =
    ref?.kind === 'lesson'
      ? ls.packs.find((p) => p.week === ref.packWeek)?.lessons.find((l) => l.id === ref.lessonId) ?? null
      : null;

  return (
    <main class="screen">
      <Header entry={entry} />
      {entry.kind === 'lesson' ? (
        <LessonReader entry={entry} lesson={lesson} />
      ) : entry.kind === 'story' ? (
        <StoryReader entry={entry} />
      ) : (
        <OwnReader entry={entry} />
      )}
    </main>
  );
}

function Header({ entry }: { entry: LibraryEntry | null }) {
  return (
    <header class="screen-header" style="align-items:center;padding-top:calc(var(--safe-top) + 8px)">
      <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('library'))} style="margin-left:-12px">
        <ChevronLeft size={24} />
      </button>
      <h1 style="flex:1;font-size:var(--fs-18);font-family:var(--font-ui);font-weight:600">Saved</h1>
      {entry && (
        <button class="icon-btn" aria-label="Edit this saved item" onClick={() => navigate('library', `edit:${entry.id}`)}>
          <Pencil size={19} strokeWidth={1.9} />
        </button>
      )}
    </header>
  );
}

/** The notes and tags the reader keeps, shown under every kind of saved item. */
function Meta({ entry }: { entry: LibraryEntry }) {
  return (
    <>
      {entry.note && <p class="small muted" style="margin-top:14px;white-space:pre-wrap">{entry.note}</p>}
      {entry.tags.length > 0 && (
        <div class="gloss" style="margin-top:10px">
          {entry.tags.map((t) => <span key={t} class="pill pill--sage" style="padding:2px 8px">{t}</span>)}
        </div>
      )}
      <p class="small faint" style="margin-top:12px">Saved {formatDateLong(entry.savedAt)}</p>
      <button class="btn btn--ghost" style="margin-top:12px" onClick={() => navigate('library', `edit:${entry.id}`)}>
        <Pencil size={16} strokeWidth={1.9} aria-hidden="true" /> Edit title, note and tags
      </button>
    </>
  );
}

function LessonReader({ entry, lesson }: { entry: LibraryEntry; lesson: Lesson | null }) {
  const weekDay = entry.ref?.kind === 'lesson' ? `Week ${entry.ref.packWeek} · Day ${entry.ref.day}` : entry.note;
  if (!lesson) {
    return (
      <>
        <h2 class="reader-title">{entry.title}</h2>
        <p class="small muted">{weekDay}</p>
        <p class="small polo-partial" style="margin-top:14px">
          <Info size={14} strokeWidth={2} aria-hidden="true" />
          <span>{entry.contentMissing ?? 'The lesson pack this came from is not downloaded. Open Morning while online and it will appear here.'}</span>
        </p>
        <Meta entry={entry} />
      </>
    );
  }
  return (
    <>
      <h2 class="reader-title">{lesson.title}</h2>
      <p class="small muted">Week {lesson.week} · Day {lesson.day} of 7 · {lesson.theme} · {lesson.readMinutes} min</p>
      <section class="lesson lesson--quiet" style="margin-top:14px">
        <LessonBody lesson={lesson} />
      </section>
      <Meta entry={entry} />
    </>
  );
}

function StoryReader({ entry }: { entry: LibraryEntry }) {
  const snap = entry.snapshot;
  const [fromArchive, setFromArchive] = useState<{ excerpt: string; lead: string | null; publishedAt: string } | null>(null);

  // A story saved before snapshots existed can still be recovered while its edition is in the
  // 14-day archive.
  useEffect(() => {
    const date = entry.ref?.kind === 'story' ? entry.ref.editionDate : null;
    if (snap || !date || !entry.url) return;
    void editionActions.loadArchived(date).then((ed) => {
      const s = ed?.stories.find((x) => x.url === entry.url);
      if (s) setFromArchive({ excerpt: s.excerpt, lead: s.lead, publishedAt: s.publishedAt });
    });
  }, [entry.id]);

  const body = snap ?? fromArchive ?? null;
  return (
    <>
      <h2 class="reader-title">{entry.title}</h2>
      <p class="small muted">
        {entry.publisher ?? 'Publisher unknown'}
        {body?.publishedAt ? ` · ${shortDate(body.publishedAt)}` : ''}
        {snap?.editionDate ? ` · from the edition of ${shortDate(snap.editionDate)}` : ''}
      </p>

      {body ? (
        <article class="reader-body">
          {body.lead ? (
            <>
              <h4>Opening of the article</h4>
              <p>{body.lead}</p>
            </>
          ) : null}
          <h4>From publisher</h4>
          <p>{body.excerpt}</p>
        </article>
      ) : (
        <p class="small polo-partial" style="margin-top:14px">
          <Info size={14} strokeWidth={2} aria-hidden="true" />
          <span>{entry.contentMissing ?? 'No saved text for this story. The publisher’s link below still works.'}</span>
        </p>
      )}

      <p class="small faint" style="margin-top:14px">
        This is the summary the app saved, not the publisher&rsquo;s full article.
      </p>
      {entry.url && (
        <a class="btn" style="margin-top:12px;display:inline-flex;gap:8px;align-items:center" href={entry.url} target="_blank" rel="noopener noreferrer">
          Read original article <ExternalLink size={16} strokeWidth={1.9} aria-hidden="true" />
        </a>
      )}
      <Meta entry={entry} />
    </>
  );
}

function OwnReader({ entry }: { entry: LibraryEntry }) {
  return (
    <>
      <h2 class="reader-title">{entry.title}</h2>
      {entry.url && (
        <a class="btn" style="margin-top:12px;display:inline-flex;gap:8px;align-items:center" href={entry.url} target="_blank" rel="noopener noreferrer">
          Open link <ExternalLink size={16} strokeWidth={1.9} aria-hidden="true" />
        </a>
      )}
      {!entry.url && <p class="small muted" style="margin-top:12px">Your own note. Nothing else was saved with it.</p>}
      <Meta entry={entry} />
    </>
  );
}
