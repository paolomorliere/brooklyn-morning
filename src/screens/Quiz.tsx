import { useEffect, useMemo, useState } from 'preact/hooks';
import { BookOpen, Check, ChevronLeft, X } from 'lucide-preact';
import { navigate, useRouteParam } from '@/ui/router';
import { lessonActions, lessonStore } from '@/state/lessons';
import { formatDateLong } from '@/lib/format';
import { dateFromYMD, shiftYMD } from '@/lib/lessons';

/**
 * The weekly quiz: 20 multiple-choice questions on the whole Mon–Sun week.
 *
 * Reached as `#/quiz` for the current week, or `#/quiz/<Monday>` for any past week, so a Sunday
 * edition from three weeks ago still leads to its own quiz. The Monday is the stable key — the
 * sequence number would shift if the start date were ever repaired.
 *
 * Answers are kept as a draft in the lesson progress record, so leaving the screen or closing the
 * app does not lose them, and every answer can be changed on the review step before submitting.
 */
export function Quiz() {
  const param = useRouteParam();
  const ls = lessonStore.use();

  // A quiz can be opened straight from an archived Sunday edition or a bookmark, without passing
  // through Morning. Fetch the packs here too, so a deep link never lands on "not downloaded" when
  // the pack is one request away.
  useEffect(() => {
    if (ls.ready && ls.packs.length === 0) void lessonActions.sync();
  }, [ls.ready, ls.packs.length]);

  // The week being taken: the one in the URL, or the week containing today.
  const target = useMemo(() => {
    const today = lessonActions.today();
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return lessonActions.today(param);
    return today;
  }, [param, ls.packs, ls.progress]);

  const pack = ls.packs.find((p) => p.week === target.packWeek);
  const quiz = pack?.quiz ?? [];
  const weekStart = target.weekStart;

  const stored = ls.progress?.quizResults?.find((r) => (r.weekStart ? r.weekStart === weekStart : r.week === target.weekNumber));
  const draft = ls.progress?.quizDrafts?.find((d) => d.weekStart === weekStart);

  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'answering' | 'review' | 'done'>('answering');
  /** The week the answers on screen belong to. Null until the first load has happened. */
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);

  /**
   * Load a week once, and only once.
   *
   * The week is derived from the stored progress, so on the first render it is still the fallback
   * and changes a moment later. Resetting on every change of that value threw away an answer tapped
   * in the meantime; keying on the week actually loaded makes the reset happen exactly when the
   * quiz on screen is a different one.
   */
  useEffect(() => {
    if (!ls.ready || loadedWeek === weekStart) return;
    setI(0);
    if (stored) {
      setAnswers(stored.answers);
      setPhase('done');
    } else if (draft) {
      setAnswers(draft.answers);
      setPhase('answering');
      setI(Math.max(0, draft.answers.findIndex((a) => a === null)));
    } else {
      setAnswers([]);
      setPhase('answering');
    }
    setLoadedWeek(weekStart);
  }, [ls.ready, weekStart, loadedWeek, stored, draft]);

  if (!ls.ready) return <main class="screen" />;

  // A week before the sequence began has no pack by design, which is a different thing from a
  // pack that has not downloaded — saying "not downloaded yet" there would send Paolo looking for
  // a fix that does not exist.
  if (target.startsOn) {
    return (
      <main class="screen">
        <Header weekStart={weekStart} />
        <div class="empty">
          <h3>No quiz for that week</h3>
          <p>Your lessons start on {formatDateLong(dateFromYMD(target.startsOn))}, so there is no week to be quizzed on yet.</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => navigate('home')}>Back to Morning</button>
        </div>
      </main>
    );
  }

  if (!pack || quiz.length === 0) {
    return (
      <main class="screen">
        <Header weekStart={weekStart} />
        <div class="empty">
          <h3>This week&rsquo;s quiz isn&rsquo;t downloaded yet</h3>
          <p>
            The quiz ships inside the week&rsquo;s lesson pack. Open Morning while you&rsquo;re online and it will
            download with the lessons.
          </p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => void lessonActions.sync()}>
            Download now
          </button>
        </div>
      </main>
    );
  }

  const answered = answers.filter((a) => a !== null).length;
  const scoreOf = (a: (number | null)[]) => a.filter((v, k) => v === quiz[k]?.answer).length;

  const choose = (idx: number) => {
    const next = [...answers];
    while (next.length < quiz.length) next.push(null);
    next[i] = idx;
    setAnswers(next);
    void lessonActions.saveQuizDraft({
      weekStart,
      packWeek: pack.week,
      packVersion: pack.version ?? null,
      answers: next,
      updatedAt: new Date().toISOString(),
    });
  };

  const submit = async () => {
    const final = Array.from({ length: quiz.length }, (_, k) => answers[k] ?? null);
    setPhase('done');
    await lessonActions.saveQuizResult({
      week: target.weekNumber,
      packWeek: pack.week,
      weekStart,
      packVersion: pack.version ?? null,
      score: scoreOf(final),
      total: quiz.length,
      answers: final.map((a) => (a === null ? -1 : a)),
      takenAt: new Date().toISOString(),
    });
  };

  const retake = () => {
    setAnswers([]);
    setI(0);
    setPhase('answering');
    setLoadedWeek(weekStart); // already loaded; do not let the loader put the old result back
    void lessonActions.clearQuizDraft(weekStart);
  };

  // ---- result -------------------------------------------------------------------------------
  if (phase === 'done') {
    const score = scoreOf(answers);
    const pct = Math.round((score / quiz.length) * 100);
    return (
      <main class="screen">
        <Header weekStart={weekStart} />
        <section class="lesson" style="margin-top:8px">
          <div class="eyebrow">Week {target.weekNumber} · {pack.theme}</div>
          <h2 style="margin-top:8px">{score} / {quiz.length} <span style="opacity:.75;font-size:.72em">({pct}%)</span></h2>
          <div class="lesson-theme">
            {score >= 18
              ? 'Excellent.'
              : score >= 14
                ? 'Solid. Review the ones below.'
                : score >= 10
                  ? 'Halfway there; worth a second read of the week.'
                  : 'Tough week. Re-read the lessons and try again.'}
            {stored && ` Taken ${formatDateLong(stored.takenAt)}.`}
          </div>
          <button class="btn btn--quiet" style="margin-top:12px;padding:0;min-height:0;color:var(--terracotta-deep);display:inline-flex;gap:6px;align-items:center" onClick={() => navigate('week', weekStart)}>
            <BookOpen size={16} strokeWidth={1.9} aria-hidden="true" /> Review this week&rsquo;s seven lessons
          </button>
        </section>

        <ol style="margin-top:16px">
          {quiz.map((q, k) => {
            const mine = answers[k];
            const ok = mine === q.answer;
            return (
              <li key={k} class="card" style="padding:12px 14px;margin-bottom:8px">
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <span style={`flex:none;margin-top:2px;color:${ok ? 'var(--sage-deep)' : 'var(--danger)'}`}>
                    {ok ? <Check size={18} /> : <X size={18} />}
                  </span>
                  <div>
                    <div style="font-weight:500">{k + 1}. {q.q}</div>
                    {!ok && (
                      <div class="small" style="margin-top:4px;color:var(--danger)">
                        Your answer: {mine != null && mine >= 0 ? q.choices[mine] : 'not answered'}
                      </div>
                    )}
                    <div class="small" style="margin-top:2px;color:var(--sage-deep)">Correct: {q.choices[q.answer]}</div>
                    {q.why && <div class="small muted" style="margin-top:2px">{q.why}</div>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn btn--ghost" onClick={retake}>Retake</button>
          <button class="btn" onClick={() => navigate('home')}>Back to Morning</button>
        </div>
      </main>
    );
  }

  // ---- review before submitting -------------------------------------------------------------
  if (phase === 'review') {
    return (
      <main class="screen">
        <Header weekStart={weekStart} />
        <section class="lesson" style="margin-top:8px">
          <div class="eyebrow">Week {target.weekNumber} · {pack.theme}</div>
          <h2 style="margin-top:8px">Check your answers</h2>
          <div class="lesson-theme">
            {answered} of {quiz.length} answered. Tap any question to change it. Nothing is marked until you submit.
          </div>
        </section>
        <ol style="margin-top:16px">
          {quiz.map((q, k) => (
            <li key={k} style="margin-bottom:8px">
              <button
                class="card"
                style="width:100%;text-align:left;padding:12px 14px"
                onClick={() => { setI(k); setPhase('answering'); }}
              >
                <div style="font-weight:500">{k + 1}. {q.q}</div>
                <div class="small" style={`margin-top:4px;color:${answers[k] != null ? 'var(--ink-muted)' : 'var(--danger)'}`}>
                  {answers[k] != null ? q.choices[answers[k]!] : 'Not answered — tap to answer'}
                </div>
              </button>
            </li>
          ))}
        </ol>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn btn--ghost" onClick={() => setPhase('answering')}>Keep answering</button>
          <button class="btn" style="flex:1" onClick={() => void submit()}>
            Submit {answered < quiz.length ? `(${quiz.length - answered} blank)` : ''}
          </button>
        </div>
      </main>
    );
  }

  // ---- answering ----------------------------------------------------------------------------
  const q = quiz[i];
  return (
    <main class="screen">
      <Header weekStart={weekStart} />
      <div class="small muted" style="display:flex;justify-content:space-between">
        <span>Week {target.weekNumber} · {pack.theme}</span>
        <span>{i + 1} / {quiz.length}</span>
      </div>
      <div class="lesson-progress" style="margin-top:8px" aria-hidden="true">
        {quiz.map((_, k) => (
          <span key={k} class={answers[k] != null ? 'done' : k === i ? 'today' : ''} style={answers[k] == null && k !== i ? 'background:var(--line)' : ''} />
        ))}
      </div>
      <h2 style="font-size:var(--fs-22);margin-top:20px;line-height:1.3">{q.q}</h2>
      <div style="display:grid;gap:8px;margin-top:16px" role="radiogroup" aria-label="Answer">
        {q.choices.map((c, idx) => (
          <button
            key={idx}
            class="card"
            role="radio"
            aria-checked={answers[i] === idx}
            onClick={() => choose(idx)}
            style={`text-align:left;padding:14px 16px;font-size:var(--fs-16);line-height:1.35;border-width:2px;${answers[i] === idx ? 'border-color:var(--terracotta);background:var(--terracotta-soft)' : ''}`}
          >
            <span class="faint" style="margin-right:8px;font-weight:600">{'ABCD'[idx]}</span>
            {c}
          </button>
        ))}
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn--ghost" disabled={i === 0} onClick={() => setI(i - 1)} style={i === 0 ? 'opacity:.4' : ''}>Back</button>
        {i < quiz.length - 1 ? (
          <button class="btn" style="flex:1" disabled={answers[i] == null} onClick={() => setI(i + 1)}>Next</button>
        ) : (
          <button class="btn" style="flex:1" onClick={() => setPhase('review')}>Review answers</button>
        )}
      </div>
      <button class="btn btn--quiet" style="margin-top:10px;width:100%" onClick={() => setPhase('review')}>
        Review all {quiz.length} answers
      </button>
    </main>
  );
}

function Header({ weekStart }: { weekStart: string }) {
  const sunday = shiftYMD(weekStart, 6);
  return (
    <header class="screen-header" style="align-items:center">
      <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('home'))} style="margin-left:-12px">
        <ChevronLeft size={24} />
      </button>
      <div style="flex:1">
        <h1 style="font-size:var(--fs-22)">Weekly quiz</h1>
        <div class="sub small muted">
          {formatDateLong(dateFromYMD(weekStart))} – {formatDateLong(dateFromYMD(sunday))}
        </div>
      </div>
    </header>
  );
}
