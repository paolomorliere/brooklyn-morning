import { useEffect, useMemo, useState } from 'preact/hooks';
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, ExternalLink, History, Info, RefreshCw, Settings } from 'lucide-preact';
import type { Edition, Lesson, StockBlock, Story, TopicId } from '@/types';
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
            onSave={() => void saveLesson(today.lesson!)}
            quiz={today.quiz ? { count: today.quiz.length, result: ls.progress?.quizResults?.find((r) => r.week === today.weekNumber) ?? null } : null}
          />
        ) : (
          <section class="lesson" aria-label="Today's lesson">
            <div class="eyebrow">Today's lesson</div>
            <h2>Lessons not downloaded yet</h2>
            <p class="lesson-theme" style="margin-top:8px">{ls.lastError ? `Couldn't load lesson packs (${ls.lastError}). They download automatically when you're online.` : 'Lesson packs download automatically on first connection.'}</p>
          </section>
        )
      )}

      {edition?.stock && !viewingDate && <StockSection stock={edition.stock} onSave={(title, url) => void libraryActions.save({ kind: 'own', title, url, note: 'Stock in focus', tags: ['Learning'] }).then(({ existed }) => toast({ message: existed ? 'Already in Library' : 'Saved to Library' }, 1500))} />}

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

interface LessonProps { lesson: Lesson; dayIndex: number; isReview: boolean; weekNumber: number; readIds: string[]; saved: boolean; onMarkRead: () => void; onSave: () => void; quiz: { count: number; result: { score: number; total: number } | null } | null }

function LessonCard({ lesson, dayIndex, isReview, weekNumber, readIds, saved, onMarkRead, onSave, quiz }: LessonProps) {
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
      {quiz && (
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.15)">
          <div class="eyebrow">Sunday quiz · {quiz.count} questions on this week</div>
          {quiz.result ? (
            <p class="lesson-theme" style="margin-top:6px">Your score: {quiz.result.score} / {quiz.result.total}.</p>
          ) : (
            <p class="lesson-theme" style="margin-top:6px">Multiple choice. Score and corrections at the end.</p>
          )}
          <button class="btn" style="margin-top:12px;background:var(--sage-deep)" onClick={() => navigate('quiz')}>{quiz.result ? 'Retake the quiz' : 'Start the quiz'}</button>
        </div>
      )}
    </section>
  );
}


function pct(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function StockSection({ stock, onSave }: { stock: StockBlock; onSave: (title: string, url: string) => void }) {
  const [showRows, setShowRows] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const yahoo = (t: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`;
  return (
    <section class="stock" aria-labelledby="stock-title">
      <div class="eyebrow">{stock.kind === 'scoreboard' ? 'Stocks · this week\'s scoreboard' : 'Stock in focus · rules-based, not a recommendation'}</div>
      {stock.kind === 'pick' && (
        <>
          <div class="stock-head">
            <h2 id="stock-title">{stock.name} <span class="muted" style="font-family:var(--font-ui);font-size:var(--fs-15)">{stock.ticker}</span></h2>
            <span class="price">${stock.lastClose.toFixed(2)}</span>
          </div>
          <div class="small muted">Last close {shortDate(`${stock.asOf}T12:00:00`)} · picked by the rule on {shortDate(`${stock.date}T12:00:00`)}</div>
          <div class="stock-metrics">
            <div><div class={`v ${stock.r5 >= 0 ? 'pos' : 'neg'}`}>{pct(stock.r5 * 100)}</div><div class="k">5 days</div></div>
            <div><div class={`v ${stock.r20 >= 0 ? 'pos' : 'neg'}`}>{pct(stock.r20 * 100)}</div><div class="k">20 days</div></div>
            <div><div class="v">{stock.volRatio.toFixed(1)}×</div><div class="k">volume vs avg</div></div>
            <div><div class="v">{stock.mentions}</div><div class="k">headline hits</div></div>
          </div>
          <div class="story-actions" style="margin-top:12px">
            <a class="btn btn--quiet" href={yahoo(stock.ticker)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Quote</a>
            <button class="btn btn--quiet" onClick={() => onSave(`${stock.name} (${stock.ticker}) — stock in focus ${stock.date}`, yahoo(stock.ticker))}><Bookmark size={16} /> Save</button>
            <button class="btn btn--quiet" onClick={() => setShowRule(!showRule)} aria-expanded={showRule}>{showRule ? <ChevronUp size={16} /> : <ChevronDown size={16} />} The rule</button>
          </div>
        </>
      )}
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
                        <td><a href={yahoo(r.ticker)} target="_blank" rel="noopener noreferrer">{r.ticker}</a></td>
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
          <h2 id="stock-title" style="font-size:var(--fs-22);margin-top:4px">No stock today</h2>
          <p class="muted small" style="margin-top:4px">{stock.reason === 'skipped' ? 'The screen was not run for this edition.' : `Market data was unavailable when the edition was prepared (${stock.reason}).`}</p>
          <button class="btn btn--quiet" style="margin-top:8px;margin-left:-10px" onClick={() => setShowRule(!showRule)} aria-expanded={showRule}>{showRule ? <ChevronUp size={16} /> : <ChevronDown size={16} />} The rule</button>
        </>
      )}
      {showRule && <p class="stock-rule">{stock.rule}</p>}
      <p class="stock-disclaimer">Mechanical screen on past prices. Not investment advice; nothing here knows your situation. Prices via Yahoo Finance, may be delayed.</p>
    </section>
  );
}
