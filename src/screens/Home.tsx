import { useEffect, useMemo, useState } from 'preact/hooks';
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, ExternalLink, History, Info, RefreshCw, Settings } from 'lucide-preact';
import type { Edition, Lesson, Story, TopicId } from '@/types';
import { TOPIC_META, TOPIC_ORDER } from '@/types';
import { formatDateLong, formatTime, readMinutes, relativeTime, shortDate } from '@/lib/format';
import { navigate } from '@/ui/router';
import { useToast } from '@/ui/Toast';
import { Sheet } from '@/ui/Sheet';
import { onResume } from '@/state/store';
import { editionActions, editionStore, type GlossaryTerm } from '@/state/edition';
import { lessonActions, lessonStore } from '@/state/lessons';
import { libraryActions, libraryStore } from '@/state/library';
import { prefsStore } from '@/state/prefs';
import { groceryActions } from '@/state/grocery';

const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function Home() {
  const ed = editionStore.use();
  const ls = lessonStore.use();
  const prefs = prefsStore.use();
  const lib = libraryStore.use();
  const toast = useToast();
  const [viewingDate, setViewingDate] = useState<string | null>(null);
  const [archived, setArchived] = useState<Edition | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [term, setTerm] = useState<GlossaryTerm | null>(null);

  // On open and on every resume: fetch the edition (cheap when unchanged), sync lesson packs, and let the catalog check itself.
  useEffect(() => onResume(() => {
    void editionActions.refresh(false);
    void lessonActions.sync();
    void groceryActions.maybeSyncCatalog();
  }, 30 * 60_000), []);

  useEffect(() => {
    if (!viewingDate) return setArchived(null);
    void editionActions.loadArchived(viewingDate).then(setArchived);
  }, [viewingDate]);

  const edition = viewingDate ? archived : ed.edition;
  const today = lessonActions.today();
  const savedUrls = useMemo(() => new Set(lib.entries.map((e) => e.url).filter(Boolean)), [lib.entries]);
  const savedLessonTitles = useMemo(() => new Set(lib.entries.filter((e) => e.kind === 'lesson').map((e) => e.title)), [lib.entries]);

  const visibleStories = useMemo(() => {
    if (!edition) return [];
    return TOPIC_ORDER.filter((t) => prefs.topicsEnabled[t]).flatMap((t) => edition.stories.filter((s) => s.topic === t).slice(0, prefs.storiesPerSection));
  }, [edition, prefs]);
  const totalMin = useMemo(() => {
    const text = visibleStories.map((s) => `${s.title} ${s.excerpt} ${s.lead ?? ''}`).join(' ');
    return (visibleStories.length ? readMinutes(text) : 0) + (today.lesson && !viewingDate ? today.lesson.readMinutes : 0);
  }, [visibleStories, today.lesson, viewingDate]);

  const isToday = edition?.date === nyToday();
  const glossaryById = useMemo(() => new Map(ed.glossary.map((g) => [g.id, g])), [ed.glossary]);

  const saveStory = async (s: Story) => {
    const { existed } = await libraryActions.save({ kind: 'story', title: s.title, url: s.url, note: '', publisher: s.publisher, tags: ['Read later'] });
    toast({ message: existed ? 'Already in Library' : 'Saved to Library' }, 1800);
  };
  const saveLesson = async (l: Lesson) => {
    const { existed } = await libraryActions.save({ kind: 'lesson', title: l.title, url: null, note: `Week ${l.week} · Day ${l.day} · ${l.theme}`, tags: ['Learning'] });
    toast({ message: existed ? 'Already in Library' : 'Lesson saved to Library' }, 1800);
  };

  return (
    <main class="screen" style="padding-top:0">
      <div class="masthead">
        <div class="masthead-top">
          <span>{formatDateLong(edition?.preparedAt ?? new Date())}</span>
          <span style="display:flex;gap:2px;margin-right:-10px">
            <button class="icon-btn" aria-label="Past editions" onClick={() => setArchiveOpen(true)}>
              <History size={20} strokeWidth={1.8} />
            </button>
            <button class="icon-btn" aria-label="Refresh edition" onClick={() => void editionActions.refresh(true)} disabled={ed.refreshing}>
              <RefreshCw size={20} strokeWidth={1.8} class={ed.refreshing ? 'spin' : ''} />
            </button>
            <button class="icon-btn" aria-label="Settings" onClick={() => navigate('settings')}>
              <Settings size={20} strokeWidth={1.8} />
            </button>
          </span>
        </div>
        <h1>Brooklyn Morning</h1>
        <div class="masthead-meta">
          {edition ? (
            <span class={`pill ${isToday ? 'pill--sage' : 'pill--terra'}`}>{isToday ? `Prepared ${formatTime(edition.preparedAt)}` : `From ${shortDate(edition.preparedAt)}`}</span>
          ) : (
            <span class="pill">{ed.ready && !ed.refreshing ? 'No edition yet' : 'Loading…'}</span>
          )}
          {edition && <span class="pill pill--outline">{totalMin} min read</span>}
          {edition && <span class="pill pill--outline">{visibleStories.length} stories</span>}
          {viewingDate && (
            <button class="pill pill--terra" onClick={() => setViewingDate(null)}>Back to latest</button>
          )}
        </div>
        {ed.lastError && !viewingDate && <p class="small muted" style="margin-top:8px">{ed.lastError}</p>}
      </div>

      {ed.ready && !edition && !ed.refreshing && (
        <div class="empty">
          <h3>Nothing to read yet</h3>
          <p>{ed.lastError ? 'Connect to the internet once to download today’s edition.' : 'The first edition will appear here.'}</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => void editionActions.refresh(true)}>Try again</button>
        </div>
      )}

      {edition &&
        TOPIC_ORDER.filter((t) => prefs.topicsEnabled[t]).map((topic) => (
          <TopicSection key={topic} topic={topic} edition={edition} limit={prefs.storiesPerSection} savedUrls={savedUrls} onSave={saveStory} onTerm={(id) => setTerm(glossaryById.get(id) ?? null)} glossaryById={glossaryById} />
        ))}

      {!viewingDate && ls.ready && (
        today.lesson ? (
          <LessonCard
            lesson={today.lesson}
            dayIndex={today.dayIndex}
            isReview={today.isReview}
            weekNumber={today.weekNumber}
            readIds={ls.progress?.readLessonIds ?? []}
            saved={savedLessonTitles.has(today.lesson.title)}
            onMarkRead={() => void lessonActions.markRead(today.lesson!.id).then(() => toast({ message: 'Marked as read' }, 1500))}
            onSave={() => void saveLesson(today.lesson!)}
          />
        ) : (
          <section class="lesson" aria-label="Today's lesson">
            <div class="eyebrow">Today's lesson</div>
            <h2>Lessons not downloaded yet</h2>
            <p class="lesson-theme" style="margin-top:8px">{ls.lastError ? `Couldn't load lesson packs (${ls.lastError}). They download automatically when you're online.` : 'Lesson packs download automatically on first connection.'}</p>
          </section>
        )
      )}

      {edition && edition.sources.some((s) => !s.ok) && (
        <p class="small faint" style="margin-top:24px">
          Sources unavailable for this edition: {edition.sources.filter((s) => !s.ok).map((s) => s.name).join(', ')}.
        </p>
      )}

      {term && (
        <Sheet title={term.term} onClose={() => setTerm(null)}>
          <p style="margin-top:8px;font-size:var(--fs-16);line-height:1.6">{term.definition}</p>
          <p class="small faint" style="margin-top:16px">Plain-language note written for this app. Educational, not financial or legal advice.</p>
        </Sheet>
      )}

      {archiveOpen && (
        <Sheet title="Past editions" onClose={() => setArchiveOpen(false)}>
          {ed.archiveDates.length === 0 && <p class="muted" style="margin-top:8px">No saved editions yet. Each morning's edition is kept for 14 days.</p>}
          <ul>
            {ed.archiveDates.map((d) => (
              <li key={d}>
                <button class="row-btn" onClick={() => { setViewingDate(d === ed.edition?.date ? null : d); setArchiveOpen(false); }}>
                  <span class="grow">{formatDateLong(`${d}T12:00:00`)}</span>
                  {d === ed.edition?.date && <span class="pill pill--sage">Latest</span>}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </main>
  );
}

interface TopicProps { topic: TopicId; edition: Edition; limit: number; savedUrls: Set<string | null>; onSave: (s: Story) => void; onTerm: (id: string) => void; glossaryById: Map<string, GlossaryTerm> }

function TopicSection({ topic, edition, limit, savedUrls, onSave, onTerm, glossaryById }: TopicProps) {
  const meta = TOPIC_META[topic];
  const stories = edition.stories.filter((s) => s.topic === topic).slice(0, limit);
  const failed = edition.sources.filter((s) => s.topic === topic && !s.ok);
  return (
    <section aria-labelledby={`t-${topic}`}>
      <div class="topic-head">
        <h2 id={`t-${topic}`}>
          {meta.label}
          <span class="blurb">{meta.blurb}</span>
        </h2>
      </div>
      {stories.length === 0 && (
        <div class="notice">
          <Info size={18} strokeWidth={1.8} style="flex:none;margin-top:2px" />
          <span>Nothing new from these sources today.</span>
        </div>
      )}
      <ul>
        {stories.map((s) => (
          <StoryCard key={s.id} story={s} saved={savedUrls.has(s.url)} onSave={() => onSave(s)} onTerm={onTerm} glossaryById={glossaryById} />
        ))}
      </ul>
      {failed.length > 0 && <p class="small faint" style="margin-top:8px">Source unavailable today: {failed.map((f) => f.name).join(', ')}</p>}
    </section>
  );
}

function StoryCard({ story, saved, onSave, onTerm, glossaryById }: { story: Story; saved: boolean; onSave: () => void; onTerm: (id: string) => void; glossaryById: Map<string, GlossaryTerm> }) {
  const [open, setOpen] = useState(false);
  return (
    <li class="story" lang={(story as Story & { lang?: string }).lang ?? 'en'}>
      <div class="story-meta">
        <span class="pub">{story.publisher}</span>
        <span class="dot">·</span>
        <span title={new Date(story.publishedAt).toLocaleString()}>{relativeTime(story.publishedAt)}</span>
        {story.isBackground && (
          <>
            <span class="dot">·</span>
            <span class="pill pill--outline" style="padding:1px 8px">Background</span>
          </>
        )}
      </div>
      <h3>
        <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
      </h3>
      {story.excerpt && (
        <p class="story-excerpt">
          <span class="label-src">From publisher</span>
          {story.excerpt}
        </p>
      )}
      {open && story.lead && (
        <div class="story-lead">
          <div class="label-src" style="margin-bottom:6px">Opening of the article · first paragraphs, unedited</div>
          {story.lead.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}
      {story.glossaryTerms.length > 0 && (
        <div class="gloss">
          {story.glossaryTerms.map((id) => {
            const g = glossaryById.get(id);
            return g ? (
              <button key={id} class="pill pill--terra" onClick={() => onTerm(id)}>{g.term}</button>
            ) : null;
          })}
        </div>
      )}
      <div class="story-actions">
        {story.lead && (
          <button class="btn btn--quiet" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {open ? 'Hide opening' : 'Read the opening'}
          </button>
        )}
        <a class="btn btn--quiet" href={story.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Open article
        </a>
        <button class="btn btn--quiet" onClick={onSave} aria-label={saved ? 'Saved in Library' : 'Save to Library'} aria-pressed={saved}>
          {saved ? <BookmarkCheck size={16} style="color:var(--sage-deep)" /> : <Bookmark size={16} />} {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </li>
  );
}

interface LessonProps { lesson: Lesson; dayIndex: number; isReview: boolean; weekNumber: number; readIds: string[]; saved: boolean; onMarkRead: () => void; onSave: () => void }

function LessonCard({ lesson, dayIndex, isReview, weekNumber, readIds, saved, onMarkRead, onSave }: LessonProps) {
  const [reveal, setReveal] = useState(false);
  const isRead = readIds.includes(lesson.id);
  const weekIds = Array.from({ length: 7 }, (_, i) => lesson.id.replace(/-d\d$/, `-d${i + 1}`));
  return (
    <section class="lesson" aria-labelledby="lesson-title">
      <div class="eyebrow">{isReview ? 'Review week' : "Today's lesson"} · Day {lesson.day} of 7</div>
      <h2 id="lesson-title">{lesson.title}</h2>
      <div class="lesson-theme">
        {isReview ? `Revisiting week ${lesson.week}` : `Week ${weekNumber}`}: {lesson.theme} · {lesson.readMinutes} min
        {isReview && <span> · no new pack yet</span>}
      </div>
      <div class="lesson-progress" aria-label={`Day ${dayIndex + 1} of 7`}>
        {weekIds.map((id, i) => <span key={id} class={i === dayIndex ? 'today' : readIds.includes(id) ? 'done' : ''} />)}
      </div>
      <div class="lesson-body">
        <h4>Explanation</h4>
        {lesson.explanation.map((p, i) => <p key={i}>{p}</p>)}
        <h4>Example</h4>
        <div class="lesson-example">
          {lesson.example.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        {lesson.exercise && (
          <details class="lesson-exercise" style="margin-top:12px">
            <summary>
              <span>Exercise (optional)</span>
              <ChevronDown size={18} />
            </summary>
            <p>{lesson.exercise.prompt}</p>
            {reveal ? <div class="lesson-answer">{lesson.exercise.answer}</div> : (
              <button class="btn btn--ghost" style="margin-top:12px" onClick={() => setReveal(true)}>Reveal answer</button>
            )}
          </details>
        )}
      </div>
      <div class="lesson-footer">
        <button class="btn" onClick={onMarkRead} disabled={isRead} style={isRead ? 'opacity:.7' : ''}>{isRead ? 'Read ✓' : 'Mark as read'}</button>
        <button class="btn btn--ghost" onClick={onSave} aria-pressed={saved}>
          {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </section>
  );
}
