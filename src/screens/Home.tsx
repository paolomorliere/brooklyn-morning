import { useMemo, useState } from 'preact/hooks';
import { Bookmark, ChevronDown, ChevronUp, ExternalLink, Info, RefreshCw, Settings } from 'lucide-preact';
import type { Edition, Lesson, Story, TopicId } from '@/types';
import { TOPIC_META, TOPIC_ORDER } from '@/types';
import { formatDateLong, formatTime, readMinutes, relativeTime, shortDate } from '@/lib/format';
import { navigate } from '@/ui/router';
import { useToast } from '@/ui/Toast';

interface Props {
  edition: Edition | null;
  lesson: Lesson | null;
  lessonDayIndex: number; // 0..6 (Mon..Sun)
  readDays: boolean[];
  storiesPerSection: number;
  onRefresh?: () => void;
  onMarkRead?: () => void;
}

export function Home({ edition, lesson, lessonDayIndex, readDays, storiesPerSection, onRefresh, onMarkRead }: Props) {
  const totalMin = useMemo(() => {
    if (!edition) return 0;
    const text = edition.stories.map((s) => `${s.title} ${s.excerpt} ${s.lead ?? ''}`).join(' ');
    return readMinutes(text) + (lesson?.readMinutes ?? 0);
  }, [edition, lesson]);

  const isToday = edition ? edition.date === new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : false;

  return (
    <main class="screen" style="padding-top:0">
      <div class="masthead">
        <div class="masthead-top">
          <span>{edition ? formatDateLong(edition.preparedAt) : formatDateLong(new Date())}</span>
          <span style="display:flex;gap:2px;margin-right:-10px">
            <button class="icon-btn" aria-label="Refresh edition" onClick={onRefresh}>
              <RefreshCw size={20} strokeWidth={1.8} />
            </button>
            <button class="icon-btn" aria-label="Settings" onClick={() => navigate('settings')}>
              <Settings size={20} strokeWidth={1.8} />
            </button>
          </span>
        </div>
        <h1>Brooklyn Morning</h1>
        <div class="masthead-meta">
          {edition ? (
            <span class={`pill ${isToday ? 'pill--sage' : 'pill--terra'}`}>
              {isToday ? `Prepared ${formatTime(edition.preparedAt)}` : `From ${shortDate(edition.preparedAt)}`}
            </span>
          ) : (
            <span class="pill">No edition yet</span>
          )}
          {edition && <span class="pill pill--outline">{totalMin} min read</span>}
          {edition && <span class="pill pill--outline">{edition.stories.length} stories</span>}
        </div>
      </div>

      {!edition && (
        <div class="empty">
          <h3>Nothing to read yet</h3>
          <p>The first edition appears once the app can reach the internet. Nothing is stored until then.</p>
        </div>
      )}

      {edition &&
        TOPIC_ORDER.map((topic) => (
          <TopicSection key={topic} topic={topic} edition={edition} limit={storiesPerSection} />
        ))}

      {lesson && <LessonCard lesson={lesson} dayIndex={lessonDayIndex} readDays={readDays} onMarkRead={onMarkRead} />}
    </main>
  );
}

function TopicSection({ topic, edition, limit }: { topic: TopicId; edition: Edition; limit: number }) {
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
          <span>Nothing new from these sources today. This section stays honest rather than padded.</span>
        </div>
      )}
      <ul>
        {stories.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </ul>
      {failed.length > 0 && (
        <p class="small faint" style="margin-top:8px">
          Source unavailable today: {failed.map((f) => f.name).join(', ')}
        </p>
      )}
    </section>
  );
}

function StoryCard({ story }: { story: Story }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <li class="story">
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
        <a href={story.url} target="_blank" rel="noopener noreferrer">
          {story.title}
        </a>
      </h3>
      {story.excerpt && (
        <p class="story-excerpt">
          <span class="label-src">From publisher</span>
          {story.excerpt}
        </p>
      )}
      {open && story.lead && (
        <div class="story-lead">
          <div class="label-src" style="margin-bottom:6px">Opening of the article · extracted from the page</div>
          {story.lead.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      {story.glossaryTerms.length > 0 && (
        <div class="gloss">
          {story.glossaryTerms.map((t) => (
            <button key={t} class="pill pill--terra" onClick={() => toast({ message: `Glossary: ${t} (coming in Phase 4)` })}>
              {t}
            </button>
          ))}
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
        <button class="btn btn--quiet" onClick={() => toast({ message: 'Saved to Library' })} aria-label="Save to Library">
          <Bookmark size={16} /> Save
        </button>
      </div>
    </li>
  );
}

function LessonCard({ lesson, dayIndex, readDays, onMarkRead }: { lesson: Lesson; dayIndex: number; readDays: boolean[]; onMarkRead?: () => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <section class="lesson" aria-labelledby="lesson-title">
      <div class="eyebrow">Today's lesson · Day {lesson.day} of 7</div>
      <h2 id="lesson-title">{lesson.title}</h2>
      <div class="lesson-theme">
        Week {lesson.week}: {lesson.theme} · {lesson.readMinutes} min
      </div>
      <div class="lesson-progress" aria-label={`Day ${dayIndex + 1} of 7`}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} class={i === dayIndex ? 'today' : readDays[i] ? 'done' : ''} />
        ))}
      </div>
      <div class="lesson-body">
        <h4>Explanation</h4>
        {lesson.explanation.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h4>Example</h4>
        <div class="lesson-example">
          {lesson.example.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {lesson.exercise && (
          <details class="lesson-exercise" style="margin-top:12px">
            <summary>
              <span>Exercise (optional)</span>
              <ChevronDown size={18} />
            </summary>
            <p>{lesson.exercise.prompt}</p>
            {reveal ? (
              <div class="lesson-answer">{lesson.exercise.answer}</div>
            ) : (
              <button class="btn btn--ghost" style="margin-top:12px" onClick={() => setReveal(true)}>
                Reveal answer
              </button>
            )}
          </details>
        )}
      </div>
      <div class="lesson-footer">
        <button class="btn" onClick={onMarkRead}>Mark as read</button>
        <button class="btn btn--ghost">
          <Bookmark size={16} /> Save
        </button>
      </div>
    </section>
  );
}
