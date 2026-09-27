import { useEffect, useMemo } from 'preact/hooks';
import { ChevronLeft, HelpCircle } from 'lucide-preact';
import { navigate, useRouteParam } from '@/ui/router';
import { LessonBody } from '@/ui/LessonBody';
import { lessonActions, lessonStore } from '@/state/lessons';
import { formatDateLong } from '@/lib/format';
import { dateFromYMD, shiftYMD } from '@/lib/lessons';

/**
 * One Mon–Sun week's seven lessons, in order, reachable as `#/week/<Monday>`.
 *
 * This is the "review before you answer" path from the quiz, and the way an archived Sunday
 * edition offers the rest of its week. Reading here never touches today's lesson or the read
 * markers — it renders stored pack content and nothing else.
 */
export function WeekReview() {
  const param = useRouteParam();
  const ls = lessonStore.use();

  // Reachable by deep link from a quiz result or an archived edition, so it syncs for itself.
  useEffect(() => {
    if (ls.ready && ls.packs.length === 0) void lessonActions.sync();
  }, [ls.ready, ls.packs.length]);
  const weekStart = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : lessonActions.today().weekStart;

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => lessonActions.today(shiftYMD(weekStart, i))),
    [weekStart, ls.packs, ls.progress],
  );
  const pack = ls.packs.find((p) => p.week === days[0]?.packWeek);
  const result = ls.progress?.quizResults?.find((r) => r.weekStart === weekStart);

  return (
    <main class="screen">
      <header class="screen-header" style="align-items:center;padding-top:calc(var(--safe-top) + 8px)">
        <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('home'))} style="margin-left:-12px">
          <ChevronLeft size={24} />
        </button>
        <div style="flex:1">
          <h1 style="font-size:var(--fs-18);font-family:var(--font-ui);font-weight:600">This week&rsquo;s lessons</h1>
          <div class="sub small muted">
            {formatDateLong(dateFromYMD(weekStart))} – {formatDateLong(dateFromYMD(shiftYMD(weekStart, 6)))}
          </div>
        </div>
      </header>

      {!ls.ready ? (
        <p class="small faint">Loading…</p>
      ) : !pack ? (
        <div class="empty">
          <h3>That week isn&rsquo;t downloaded</h3>
          <p>Lesson packs download automatically when you open Morning online.</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => void lessonActions.sync()}>Download now</button>
        </div>
      ) : (
        <>
          <p class="small muted" style="margin-top:4px">
            Week {days[0].weekNumber} · {pack.theme}
          </p>
          {days.map((d, i) =>
            d.lesson ? (
              <section class="lesson lesson--quiet" key={d.lesson.id} style="margin-top:12px">
                <div class="eyebrow">Day {i + 1} of 7 · {formatDateLong(dateFromYMD(shiftYMD(weekStart, i)))}</div>
                <h2>{d.lesson.title}</h2>
                <div class="lesson-theme">{d.lesson.readMinutes} min</div>
                <LessonBody lesson={d.lesson} />
              </section>
            ) : (
              <section class="lesson lesson--quiet" key={i} style="margin-top:12px">
                <div class="eyebrow">Day {i + 1} of 7</div>
                <h2>Not available</h2>
                <div class="lesson-theme">This day&rsquo;s lesson is not in the downloaded pack.</div>
              </section>
            ),
          )}

          <button class="btn" style="margin-top:20px;width:100%;background:var(--sage-deep);display:inline-flex;gap:8px;align-items:center;justify-content:center" onClick={() => navigate('quiz', weekStart)}>
            <HelpCircle size={18} strokeWidth={1.9} aria-hidden="true" />
            {result ? `Retake the quiz (last: ${result.score}/${result.total})` : `Take this week's quiz — ${pack.quiz?.length ?? 20} questions`}
          </button>
        </>
      )}
    </main>
  );
}
