import { useEffect, useMemo, useState } from 'preact/hooks';
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, ExternalLink, History, Info, RefreshCw, Settings } from 'lucide-preact';
import type { Edition, Lesson, StockBlock, StockPickV1, StockPickV2, StockRecap, Story, TopicId } from '@/types';
import { TOPIC_META, TOPIC_ORDER, strategyVersionOf } from '@/types';
import { formatDateLong, formatTime, readMinutes, relativeTime, shortDate } from '@/lib/format';
import { navigate } from '@/ui/router';
import { useToast } from '@/ui/Toast';
import { Sheet } from '@/ui/Sheet';
import { LessonBody } from '@/ui/LessonBody';
import { snapshotOfStory } from '@/lib/library-repair';
import { onResume } from '@/state/store';
import { editionActions, editionStore, type GlossaryTerm } from '@/state/edition';
import { lessonActions, lessonStore } from '@/state/lessons';
import { dateFromYMD, type TodayLesson } from '@/lib/lessons';
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
  // The lesson that belonged to the date being read. The date → week/day mapping is fixed, so an
  // archived edition resolves to the lesson it actually carried, never to today's.
  const archivedLesson = useMemo(
    () => (viewingDate ? lessonActions.today(viewingDate) : null),
    [viewingDate, ls.packs, ls.progress],
  );

  // Pin the resolved lesson into the stored edition the first time it is read, so a later edit to
  // a lesson pack cannot silently rewrite what an old edition says it contained.
  useEffect(() => {
    if (!viewingDate || !archived || !archivedLesson?.lesson) return;
    if (archived.lessonRef?.lessonId === archivedLesson.lesson.id) return;
    void editionActions.pinLesson(viewingDate, {
      week: archivedLesson.packWeek ?? archivedLesson.lesson.week,
      day: archivedLesson.lesson.day,
      lessonId: archivedLesson.lesson.id,
      packVersion: archivedLesson.packVersion,
    });
  }, [viewingDate, archived, archivedLesson?.lesson?.id]);
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

  // Both save paths record where the content lives, so a saved item is readable from the moment it
  // is saved rather than depending on a later repair pass.
  const saveStory = async (s: Story) => {
    const { existed } = await libraryActions.save({
      kind: 'story',
      title: s.title,
      url: s.url,
      note: '',
      publisher: s.publisher,
      tags: ['Read later'],
      ref: { kind: 'story', storyId: s.id, editionDate: edition?.date ?? null, url: s.url },
      snapshot: snapshotOfStory(s, edition?.date ?? null),
    });
    toast({ message: existed ? 'Already in Library' : 'Saved to Library' }, 1800);
  };
  const saveLesson = async (l: Lesson, packVersion: string | null) => {
    const { existed } = await libraryActions.save({
      kind: 'lesson',
      title: l.title,
      url: null,
      note: `Week ${l.week} · Day ${l.day} · ${l.theme}`,
      tags: ['Learning'],
      ref: { kind: 'lesson', lessonId: l.id, packWeek: l.week, day: l.day, packVersion },
    });
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
        {!viewingDate && edition && !isToday && (
          <p class="small muted" style="margin-top:8px">
            Today's edition hasn't been published yet, so this is {formatDateLong(edition.preparedAt)}.{' '}
            <button class="btn btn--quiet" style="display:inline;padding:0;min-height:0;color:var(--terracotta-deep)" onClick={() => void editionActions.refresh(true)}>Check again</button>
          </p>
        )}
        {ed.lastError && !viewingDate && <p class="small muted" style="margin-top:8px">{ed.lastError}</p>}
      </div>

      {edition?.quote && (
        <blockquote class="quote">
          <p>“{edition.quote.text}”<span class="who">— {edition.quote.who}</span></p>
        </blockquote>
      )}

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

      {viewingDate && ls.ready && archivedLesson && (
        <ArchivedLesson view={archivedLesson} date={viewingDate} pinned={archived?.lessonRef ?? null} />
      )}

      {!viewingDate && ls.ready && today.startsOn && (
        <section class="lesson" aria-label="Lessons">
          <div class="eyebrow">Daily lesson</div>
          <h2>Starts Monday</h2>
          <p class="lesson-theme" style="margin-top:8px">Your first week, <em>{ls.packs.find((p) => p.week === 1)?.theme ?? 'The stock market, from zero'}</em>, begins {formatDateLong(`${today.startsOn}T12:00:00`)} with lesson 1 of 7. Every Sunday ends with a 20-question quiz.</p>
          <p class="small" style="margin-top:8px;color:#cdbfb4">{ls.totalWeeksAvailable} weeks downloaded and ready.</p>
        </section>
      )}
      {!viewingDate && ls.ready && !today.startsOn && (
        today.lesson ? (
          <LessonCard
            lesson={today.lesson}
            dayIndex={today.dayIndex}
            isReview={today.isReview}
            weekNumber={today.weekNumber}
            readIds={ls.progress?.readLessonIds ?? []}
            saved={savedLessonTitles.has(today.lesson.title)}
            onMarkRead={() => void lessonActions.markRead(today.lesson!.id).then(() => toast({ message: 'Marked as read' }, 1500))}
            onSave={() => void saveLesson(today.lesson!, today.packVersion)}
            weekStart={today.weekStart}
            quizMissing={!!today.quizMissing}
            staleWeek={today.packWeek !== null && ls.staleWeeks.includes(today.packWeek)}
            quiz={
              today.quiz?.length
                ? {
                    count: today.quiz.length,
                    result:
                      ls.progress?.quizResults?.find((r) => (r.weekStart ? r.weekStart === today.weekStart : r.week === today.weekNumber)) ?? null,
                    started: !!ls.progress?.quizDrafts?.find((d) => d.weekStart === today.weekStart)?.answers.some((a) => a !== null),
                  }
                : null
            }
          />
        ) : (
          <section class="lesson" aria-label="Today's lesson">
            <div class="eyebrow">Today's lesson</div>
            <h2>Lessons not downloaded yet</h2>
            <p class="lesson-theme" style="margin-top:8px">{ls.lastError ? `Couldn't load lesson packs (${ls.lastError}). They download automatically when you're online.` : 'Lesson packs download automatically on first connection.'}</p>
          </section>
        )
      )}

      {/*
        Archived editions show their stock card too. Hiding it was a small dishonesty: the published
        record of what the rule picked on a given day is exactly the thing worth being able to look
        back at, and a feature that only ever shows today's pick cannot be held to account.
      */}
      {edition?.stock && (
        <StockSection
          stock={edition.stock}
          archived={!!viewingDate}
          onSave={(title, url) =>
            void libraryActions
              .save({ kind: 'own', title, url, note: 'Stock in focus', tags: ['Learning'] })
              .then(({ existed }) => toast({ message: existed ? 'Already in Library' : 'Saved to Library' }, 1500))
          }
        />
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
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(story.imageUrl) && !imgFailed;
  return (
    <li class="story" lang={story.lang ?? 'en'}>
      <div class="story-row">
      <div class="story-main">
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
      </div>
      {showImg && (
        <a class="story-thumb" href={story.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
          <img src={story.imageUrl!} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setImgFailed(true)} />
        </a>
      )}
      </div>
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

interface LessonProps {
  lesson: Lesson;
  dayIndex: number;
  isReview: boolean;
  weekNumber: number;
  weekStart: string;
  readIds: string[];
  saved: boolean;
  onMarkRead: () => void;
  onSave: () => void;
  quiz: { count: number; result: { score: number; total: number } | null; started: boolean } | null;
  /** Sunday, but the downloaded pack carries no quiz. Said plainly rather than hidden. */
  quizMissing: boolean;
  /** The published pack for this week is newer than the stored one and could not be fetched. */
  staleWeek: boolean;
}

function LessonCard({ lesson, dayIndex, isReview, weekNumber, weekStart, readIds, saved, onMarkRead, onSave, quiz, quizMissing, staleWeek }: LessonProps) {
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
      <LessonBody lesson={lesson} />
      <div class="lesson-footer">
        <button class="btn" onClick={onMarkRead} disabled={isRead} style={isRead ? 'opacity:.7' : ''}>{isRead ? 'Read ✓' : 'Mark as read'}</button>
        <button class="btn btn--ghost" onClick={onSave} aria-pressed={saved}>
          {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {quiz && (
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.15)">
          <div class="eyebrow">Weekly quiz · {quiz.count} questions on all seven days</div>
          {quiz.result ? (
            <p class="lesson-theme" style="margin-top:6px">Your score: {quiz.result.score} / {quiz.result.total}.</p>
          ) : quiz.started ? (
            <p class="lesson-theme" style="margin-top:6px">You have answers saved. Pick up where you left off.</p>
          ) : (
            <p class="lesson-theme" style="margin-top:6px">Multiple choice. Review and change every answer before you submit.</p>
          )}
          <button class="btn" style="margin-top:12px;background:var(--sage-deep)" onClick={() => navigate('quiz', weekStart)}>
            {quiz.result ? 'Retake the quiz' : quiz.started ? 'Continue the quiz' : `Take this week's quiz — ${quiz.count} questions`}
          </button>
          <button class="btn btn--ghost" style="margin-top:8px;width:100%" onClick={() => navigate('week', weekStart)}>Review the week first</button>
        </div>
      )}
      {quizMissing && (
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.15)">
          <div class="eyebrow">Weekly quiz</div>
          <p class="lesson-theme" style="margin-top:6px">
            {staleWeek
              ? 'This week’s quiz is published but could not be downloaded. It will appear next time you open Morning online.'
              : 'This week’s pack was downloaded before its quiz existed. Open Morning online once and the quiz will appear.'}
          </p>
          <button class="btn btn--ghost" style="margin-top:12px" onClick={() => void lessonActions.sync()}>Check for it now</button>
        </div>
      )}
    </section>
  );
}


function pct(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

/** SEC EDGAR, which is where every figure on a v2 card actually comes from. */
const edgar = (cik: string | null) =>
  cik
    ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(cik)}&type=10-&dateb=&owner=include&count=20`
    : 'https://www.sec.gov/edgar/searchedgar/companysearch';

/** Version 1 cards linked here, so an archived v1 card keeps the link it was published with. */
const yahooQuote = (t: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`;

const money = (v: number | null | undefined) => {
  if (v == null || Number.isNaN(v)) return '—';
  const m = v / 1e6;
  return Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(1)}bn` : `$${Math.round(m).toLocaleString('en-US')}M`;
};

const ratioText = (v: number | null | undefined, digits = 2) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}×`);

function StockSection({ stock, archived, onSave }: { stock: StockBlock; archived?: boolean; onSave: (title: string, url: string) => void }) {
  const [showRows, setShowRows] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const version = strategyVersionOf(stock as { strategyVersion?: number });
  const rule = 'rule' in stock ? stock.rule : null;
  return (
    <section class="stock" aria-labelledby="stock-title">
      <div class="eyebrow">
        {stock.kind === 'scoreboard'
          ? "Stocks · this week's scoreboard"
          : stock.kind === 'recap'
            ? 'Stocks · the record so far'
            : version === 2
              ? 'Stock in focus · research process, not a recommendation'
              : 'Stock in focus · rules-based, not a recommendation'}
      </div>

      {stock.kind === 'pick' && version === 2 && <StockBrief pick={stock as StockPickV2} archived={archived} onSave={onSave} />}

      {stock.kind === 'pick' && version === 1 && (
        <>
          {/* Version 1's card, kept exactly as it was so an archived edition still reads correctly. */}
          <div class="stock-head">
            <h2 id="stock-title">
              {stock.name} <span class="muted" style="font-family:var(--font-ui);font-size:var(--fs-15)">{stock.ticker}</span>
            </h2>
            <span class="price">${(stock as StockPickV1).lastClose.toFixed(2)}</span>
          </div>
          <div class="small muted">
            Last close {shortDate(`${(stock as StockPickV1).asOf}T12:00:00`)} · picked by the rule on {shortDate(`${stock.date}T12:00:00`)}
          </div>
          <div class="stock-metrics">
            <div><div class={`v ${(stock as StockPickV1).r5 >= 0 ? 'pos' : 'neg'}`}>{pct((stock as StockPickV1).r5 * 100)}</div><div class="k">5 days</div></div>
            <div><div class={`v ${(stock as StockPickV1).r20 >= 0 ? 'pos' : 'neg'}`}>{pct((stock as StockPickV1).r20 * 100)}</div><div class="k">20 days</div></div>
            <div><div class="v">{(stock as StockPickV1).volRatio.toFixed(1)}×</div><div class="k">volume vs avg</div></div>
            <div><div class="v">{(stock as StockPickV1).mentions}</div><div class="k">headline hits</div></div>
          </div>
          <p class="stock-frozen">
            Version 1 of this feature, which stopped picking on 6 October 2026. It ranked 104 hand-picked tickers mostly on their
            five-day return, stated no holding period and was never tested. Its record is kept as published and is never merged
            with the current process.
          </p>
          <div class="story-actions" style="margin-top:12px">
            <a class="btn btn--quiet" href={yahooQuote(stock.ticker)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Quote</a>
            <button class="btn btn--quiet" onClick={() => onSave(`${stock.name} (${stock.ticker}) — stock in focus ${stock.date}`, yahooQuote(stock.ticker))}><Bookmark size={16} /> Save</button>
            <button class="btn btn--quiet" onClick={() => setShowRule(!showRule)} aria-expanded={showRule}>{showRule ? <ChevronUp size={16} /> : <ChevronDown size={16} />} The rule</button>
          </div>
        </>
      )}

      {stock.kind === 'recap' && <StockRecapCard recap={stock} />}

      {stock.kind === 'scoreboard' && (
        <div class="scoreboard">
          <h2 id="stock-title" style="font-size:var(--fs-22);margin-top:4px">Week of {shortDate(`${stock.weekOf}T12:00:00`)}</h2>
          {stock.counted > 0 ? (
            <>
              <div class={`scoreboard-combined ${(stock.combinedPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{pct(stock.combinedPct, 2)}</div>
              <div class="small muted">Equal amounts in each of the {stock.counted} featured stocks, bought at the open on the day featured, valued at the latest close{stock.best ? ` · best ${stock.best}` : ''}{stock.worst && stock.worst !== stock.best ? ` · worst ${stock.worst}` : ''}</div>
              <div class="story-actions" style="margin-top:8px">
                <button class="btn btn--quiet" onClick={() => setShowRows(!showRows)} aria-expanded={showRows}>{showRows ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {showRows ? 'Hide breakdown' : 'Stock-by-stock breakdown'}</button>
                <button class="btn btn--quiet" onClick={() => setShowRule(!showRule)} aria-expanded={showRule}>{showRule ? <ChevronUp size={16} /> : <ChevronDown size={16} />} The rule</button>
              </div>
              {showRows && (
                <table>
                  <thead><tr><th>Day</th><th>Stock</th><th class="num">Open</th><th class="num">Latest</th><th class="num">Change</th></tr></thead>
                  <tbody>
                    {stock.rows.map((r) => (
                      <tr key={r.date + r.ticker}>
                        <td>{shortDate(`${r.date}T12:00:00`)}</td>
                        <td><a href={yahooQuote(r.ticker)} target="_blank" rel="noopener noreferrer">{r.ticker}</a></td>
                        <td class="num">{r.openAtPick != null ? r.openAtPick.toFixed(2) : '—'}</td>
                        <td class="num">{r.latestClose != null ? r.latestClose.toFixed(2) : '—'}</td>
                        <td class={`num ${(r.changePct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{pct(r.changePct, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p class="muted" style="margin-top:8px">{stock.note}</p>
          )}
          {stock.counted > 0 && <p class="stock-disclaimer">{stock.note}</p>}
        </div>
      )}

      {stock.kind === 'unavailable' && (
        <>
          <h2 id="stock-title" style="font-size:var(--fs-22);margin-top:4px">No qualifying pick today</h2>
          {/*
            The reason is always the test that actually bound, never a softened summary. The thresholds
            are published and are not moved to fill this card: an empty card is information, and a card
            filled by relaxing a rule would make every number on it meaningless.
          */}
          <p class="muted small" style="margin-top:4px">
            {stock.reason === 'skipped' ? 'The screen was not run for this edition.' : stock.reason}
          </p>
          {stock.lastPublishedFor && (
            <p class="small faint" style="margin-top:4px">
              The last pick was published for {shortDate(`${stock.lastPublishedFor}T12:00:00`)}. It is not repeated here: a pick
              belongs to the session it was made in.
            </p>
          )}
          <button class="btn btn--quiet" style="margin-top:8px;margin-left:-10px" onClick={() => setShowRule(!showRule)} aria-expanded={showRule}>{showRule ? <ChevronUp size={16} /> : <ChevronDown size={16} />} The rule</button>
        </>
      )}

      {showRule && rule && <p class="stock-rule">{rule}</p>}
      <p class="stock-disclaimer">
        {version === 2
          ? 'A transparent research process on public filings and end-of-day prices. Not investment advice; nothing here knows your situation. Fundamentals from SEC filings, universe from Nasdaq Trader, prices from Massive.'
          : 'Mechanical screen on past prices. Not investment advice; nothing here knows your situation. Prices via Yahoo Finance, may be delayed.'}
      </p>
    </section>
  );
}

/**
 * The version 2 card: a brief, with the detail one tap away.
 *
 * Three things are kept deliberately apart, because they are different questions and running them
 * together is how a screen starts sounding like advice: a **figure off a filing** (in the evidence
 * table, with its period and the date it was filed), a **comparison** against other candidates (the
 * score and the signal list), and a **judgement** (the thesis, the counterargument, the invalidation
 * conditions). The counterargument and the invalidation conditions are never behind the expander —
 * they are the parts most worth reading.
 */
function StockBrief({ pick, archived, onSave }: { pick: StockPickV2; archived?: boolean; onSave: (title: string, url: string) => void }) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <div class="stock-head">
        <h2 id="stock-title">
          {pick.name} <span class="muted" style="font-family:var(--font-ui);font-size:var(--fs-15)">{pick.ticker}</span>
        </h2>
        <span class="price">${pick.referenceClose.toFixed(2)}</span>
      </div>
      <div class="small muted">
        Reference close {shortDate(`${pick.referenceCloseDate}T12:00:00`)} · {pick.sector}
        {pick.sic ? ` (SIC ${pick.sic})` : ''}
      </div>
      <div class="small muted stock-horizon">
        <strong>{pick.horizonSessions}-session horizon</strong>
        {pick.plannedEntry ? ` · entry ${shortDate(`${pick.plannedEntry}T12:00:00`)} open` : ''}
        {pick.plannedExit ? ` → exit ${shortDate(`${pick.plannedExit}T12:00:00`)} close` : ''}
      </div>

      <div class="stock-score">
        <div class="stock-score-v">{pick.rankScore}<span class="stock-score-of">/100</span></div>
        <div class="stock-score-k">
          Ranked above {pick.rankScore}% of the {pick.eligible.toLocaleString('en-US')} candidates that were eligible today, out of{' '}
          {pick.scanned.toLocaleString('en-US')} scanned. <strong>This is a ranking position, not an {pick.rankScore}% chance of
          profit.</strong>
        </div>
      </div>

      <p class="stock-thesis">{pick.thesis}</p>

      <div class="stock-judgement">
        <h3>The strongest counterargument</h3>
        <p>{pick.counterargument}</p>
      </div>

      {pick.invalidation.length > 0 && (
        <div class="stock-judgement">
          <h3>What would show this was wrong</h3>
          <ul>
            {pick.invalidation.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div class="stock-judgement">
        <h3>Timing and risk</h3>
        <p>
          {pick.earnings.estimate ? (
            <>
              Next results <strong>estimated {shortDate(`${pick.earnings.estimate}T12:00:00`)}</strong>
              {pick.earnings.spreadDays ? `, give or take about ${pick.earnings.spreadDays} days` : ''} —{' '}
              {pick.earnings.basis}. This is an estimate, not a confirmed date: no free source publishes one.
              {pick.earnings.inWindow
                ? ' It falls inside the holding window, so part of the outcome rides on that announcement.'
                : pick.earnings.nearWindow
                  ? ' It sits just outside the holding window, within the spread of the estimate.'
                  : ' It falls outside the holding window.'}
            </>
          ) : (
            'No announcement history on file, so no next results date can be estimated.'
          )}
        </p>
        {pick.risks.length > 0 && (
          <ul>
            {pick.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div class="story-actions" style="margin-top:12px">
        <a class="btn btn--quiet" href={edgar(pick.cik)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Filings
        </a>
        <button
          class="btn btn--quiet"
          onClick={() => onSave(`${pick.name} (${pick.ticker}) — stock in focus ${pick.date}`, edgar(pick.cik))}
        >
          <Bookmark size={16} /> Save
        </button>
        <button class="btn btn--quiet" onClick={() => setShowDetail(!showDetail)} aria-expanded={showDetail}>
          {showDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {showDetail ? 'Hide the evidence' : 'The evidence'}
        </button>
      </div>

      {showDetail && (
        <div class="stock-detail">
          <h3>Evidence</h3>
          <p class="small faint">
            Every figure below is read off an SEC filing, from single quarters only so no year-to-date total is counted twice.
            Figures are stated as filed; the periods and filing dates are shown so each can be checked.
          </p>
          <table class="stock-table">
            <thead>
              <tr>
                <th scope="col">Figure</th>
                <th scope="col" class="num">Value</th>
                <th scope="col">Period</th>
                <th scope="col">Filed</th>
              </tr>
            </thead>
            <tbody>
              {pick.evidence.map((e) => (
                <tr key={e.label} class={e.interpretation ? 'stock-interpretation' : undefined}>
                  <td>
                    {e.label}
                    {e.tag && <span class="stock-tag">{e.tag}</span>}
                  </td>
                  <td class="num">{e.value}</td>
                  <td>{e.period ?? '—'}</td>
                  <td>{e.filed ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>What produced the score</h3>
          <p class="small faint">
            Equally weighted z-scores against {pick.scoredAgainst}. A positive number means the signal helped.
          </p>
          <ul class="stock-signals">
            {pick.signals.map((sig) => (
              <li key={sig.key}>
                <span class="grow">{sig.label}</span>
                <span class={`num ${sig.z >= 0 ? 'pos' : 'neg'}`}>{sig.z >= 0 ? '+' : ''}{sig.z.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {pick.signalsDropped.length > 0 && (
            <>
              <h3>Signals that do not apply to this company</h3>
              <p class="small faint">
                These were left out and the remaining weights share the difference. None of them was scored as zero, which would
                have been a claim that the company is average at something nobody measured.
              </p>
              <ul class="stock-dropped">
                {pick.signalsDropped.map((d) => (
                  <li key={d.key}>
                    <strong>{d.key}</strong> — {d.why}
                  </li>
                ))}
              </ul>
            </>
          )}

          {pick.peers.length > 0 && (
            <>
              <h3>Peers</h3>
              <p class="small faint">{pick.peerBasis ?? 'The same method, the same source, the same periods.'}</p>
              <table class="stock-table">
                <thead>
                  <tr>
                    <th scope="col">&nbsp;</th>
                    <th scope="col" class="num">TTM rev</th>
                    <th scope="col" class="num">Growth</th>
                    <th scope="col" class="num">Gross</th>
                    <th scope="col" class="num">Op</th>
                    <th scope="col" class="num">OCF/NI</th>
                  </tr>
                </thead>
                <tbody>
                  {pick.peers.map((peer) => (
                    <tr key={peer.ticker} class={peer.ticker === pick.ticker ? 'stock-self' : undefined}>
                      <td>{peer.ticker}</td>
                      <td class="num">{money(peer.revenueTtm)}</td>
                      <td class="num">{pct(peer.revenueGrowth == null ? null : peer.revenueGrowth * 100)}</td>
                      <td class="num">{pct(peer.grossMargin == null ? null : peer.grossMargin * 100)}</td>
                      <td class="num">{pct(peer.operatingMargin == null ? null : peer.operatingMargin * 100)}</td>
                      <td class="num">{ratioText(peer.cashConversion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {pick.runnersUp.length > 0 && (
            <>
              <h3>Why this one and not the runners-up</h3>
              <ul class="stock-dropped">
                {pick.runnersUp.map((r) => (
                  <li key={r.ticker}>
                    <strong>{r.ticker}</strong> scored {r.rankScore} — {r.why}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Sources</h3>
          <ul class="stock-dropped">
            {Object.entries(pick.sources).map(([what, where]) => (
              <li key={what}>
                <strong>{what}</strong> — {where}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p class="stock-validation">{pick.validation}</p>
      {archived && (
        <p class="small faint" style="margin-top:4px">
          This is the pick as it was published on {shortDate(`${pick.date}T12:00:00`)}. Nothing on this card has been revised
          since.
        </p>
      )}
    </>
  );
}

/**
 * The record so far.
 *
 * Only completed positions enter the average. A position still running is listed with the sessions
 * elapsed and counted nowhere else — which is the specific failure the first version of this feature
 * had, when five positions held 5, 4, 3, 2 and 1 sessions were averaged into a single figure.
 */
function StockRecapCard({ recap }: { recap: StockRecap }) {
  const [showRows, setShowRows] = useState(false);
  return (
    <div class="scoreboard">
      <h2 id="stock-title" style="font-size:var(--fs-22);margin-top:4px">
        {recap.strategyVersion === 1 ? 'Version 1, tracked to the end' : 'The record so far'}
      </h2>
      {recap.completed > 0 ? (
        <>
          <div class={`scoreboard-combined ${(recap.meanExcessSpyPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{pct(recap.meanExcessSpyPct, 2)}</div>
          <div class="small muted">
            Average return against SPY over {recap.completed} completed {recap.completed === 1 ? 'position' : 'positions'}, after
            costs{recap.meanExcessRspPct != null ? ` · against RSP ${pct(recap.meanExcessRspPct, 2)}` : ''}
            {recap.winRate != null ? ` · ${Math.round(recap.winRate * 100)}% finished ahead` : ''}
          </div>
        </>
      ) : (
        <p class="muted" style="margin-top:8px">
          No position has completed its horizon yet{recap.open > 0 ? `, and ${recap.open} ${recap.open === 1 ? 'is' : 'are'} still running` : ''}.
          There is nothing to average.
        </p>
      )}
      {recap.open > 0 && recap.completed > 0 && (
        <div class="small faint" style="margin-top:4px">
          {recap.open} {recap.open === 1 ? 'position is' : 'positions are'} still running and {recap.open === 1 ? 'is' : 'are'} not in
          that average.
        </div>
      )}
      <div class="story-actions" style="margin-top:8px">
        <button class="btn btn--quiet" onClick={() => setShowRows(!showRows)} aria-expanded={showRows}>
          {showRows ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {showRows ? 'Hide positions' : 'Every position'}
        </button>
      </div>
      {showRows && (
        <table>
          <thead>
            <tr>
              <th>Picked</th>
              <th>Stock</th>
              <th class="num">Entry</th>
              <th class="num">Held</th>
              <th class="num">Net</th>
              <th class="num">vs SPY</th>
            </tr>
          </thead>
          <tbody>
            {recap.rows.map((r) => (
              <tr key={r.date + r.ticker}>
                <td>{shortDate(`${r.date}T12:00:00`)}</td>
                <td>{r.ticker}</td>
                <td class="num">{r.entryPrice != null ? r.entryPrice.toFixed(2) : '—'}</td>
                <td class="num">{r.status === 'complete' ? `${r.horizon ?? r.sessionsHeld}` : `${r.sessionsHeld ?? 0}/${r.horizon ?? '—'}`}</td>
                <td class={`num ${(r.netPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{pct(r.netPct, 2)}</td>
                <td class={`num ${(r.excessSpyPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{pct(r.excessSpyPct, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="stock-disclaimer">{recap.note}</p>
    </div>
  );
}

/**
 * The lesson an archived edition carried, resolved from the fixed date → week/day mapping.
 *
 * Read-only on purpose: revisiting an old lesson must not mark it read, must not move the daily
 * sequence, and must not change which lesson belongs to today. On a Sunday it also offers that
 * week's quiz, which is how an old Sunday edition stays connected to its own quiz.
 */
function ArchivedLesson({ view, date, pinned }: { view: TodayLesson; date: string; pinned: Edition['lessonRef'] }) {
  if (!view.lesson) {
    return (
      <section class="lesson" aria-label="Lesson for this edition">
        <div class="eyebrow">Lesson for {formatDateLong(dateFromYMD(date))}</div>
        <h2>Not recoverable</h2>
        <p class="lesson-theme" style="margin-top:8px">
          {view.startsOn
            ? `The lesson sequence starts ${formatDateLong(dateFromYMD(view.startsOn))}, so this edition predates it.`
            : 'The lesson pack for this week is not downloaded, so this day’s lesson cannot be shown.'}
        </p>
      </section>
    );
  }
  const changed = pinned?.packVersion && view.packVersion && pinned.packVersion !== view.packVersion;
  return (
    <section class="lesson" aria-label="Lesson for this edition">
      <div class="eyebrow">Lesson for {formatDateLong(dateFromYMD(date))} · Day {view.lesson.day} of 7</div>
      <h2>{view.lesson.title}</h2>
      <div class="lesson-theme">
        Week {view.weekNumber}: {view.lesson.theme} · {view.lesson.readMinutes} min
      </div>
      <LessonBody lesson={view.lesson} />
      {changed && (
        <p class="small" style="margin-top:10px;opacity:.8">
          This week&rsquo;s lesson pack has been updated since this edition was read. You are seeing the current text.
        </p>
      )}
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.15);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--ghost" onClick={() => navigate('week', view.weekStart)}>See the whole week</button>
        {view.dayIndex === 6 && !view.quizMissing && (
          <button class="btn" style="background:var(--sage-deep)" onClick={() => navigate('quiz', view.weekStart)}>
            Take this week&rsquo;s quiz
          </button>
        )}
      </div>
      {view.dayIndex === 6 && view.quizMissing && (
        <p class="small" style="margin-top:10px;opacity:.8">
          This week&rsquo;s quiz is not in the downloaded pack yet.
        </p>
      )}
    </section>
  );
}
