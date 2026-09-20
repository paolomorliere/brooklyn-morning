import { useMemo, useState } from 'preact/hooks';
import { Check, ChevronLeft, X } from 'lucide-preact';
import { navigate } from '@/ui/router';
import { lessonActions, lessonStore } from '@/state/lessons';

/** Weekly quiz on its own screen: 20 multiple-choice questions, one at a time, then score and corrections. */
export function Quiz() {
  const ls = lessonStore.use();
  const today = useMemo(() => lessonActions.today(), [ls.packs, ls.progress]);
  const pack = ls.packs.find((p) => p.week === today.packWeek);
  const quiz = pack?.quiz ?? [];
  const [answers, setAnswers] = useState<number[]>([]);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const previous = ls.progress?.quizResults?.find((r) => r.week === today.weekNumber);

  if (!ls.ready) return <main class="screen" />;
  if (!pack || quiz.length === 0) {
    return (
      <main class="screen">
        <Header />
        <div class="empty"><h3>No quiz available</h3><p>The quiz appears on Sundays once the week's lessons are downloaded.</p></div>
      </main>
    );
  }

  const score = answers.filter((a, k) => a === quiz[k].answer).length;

  const choose = (idx: number) => {
    const next = [...answers];
    next[i] = idx;
    setAnswers(next);
  };
  const forward = async () => {
    if (i < quiz.length - 1) setI(i + 1);
    else {
      setDone(true);
      const finalScore = answers.filter((a, k) => a === quiz[k].answer).length;
      await lessonActions.saveQuizResult({ week: today.weekNumber, packWeek: pack.week, score: finalScore, total: quiz.length, answers, takenAt: new Date().toISOString() });
    }
  };

  if (done) {
    return (
      <main class="screen">
        <Header />
        <section class="lesson" style="margin-top:8px">
          <div class="eyebrow">Week {today.weekNumber} · {pack.theme}</div>
          <h2 style="margin-top:8px">{score} / {quiz.length}</h2>
          <div class="lesson-theme">{score >= 18 ? 'Excellent.' : score >= 14 ? 'Solid. Review the ones below.' : score >= 10 ? 'Halfway there; worth a second read of the week.' : 'Tough week. Re-read the lessons and try again next Sunday.'} {previous && previous.takenAt !== undefined && previous.score !== score ? `Previous attempt: ${previous.score}/${previous.total}.` : ''}</div>
        </section>
        <ol style="margin-top:16px">
          {quiz.map((q, k) => {
            const ok = answers[k] === q.answer;
            return (
              <li key={k} class="card" style="padding:12px 14px;margin-bottom:8px">
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <span style={`flex:none;margin-top:2px;color:${ok ? 'var(--sage-deep)' : 'var(--danger)'}`}>{ok ? <Check size={18} /> : <X size={18} />}</span>
                  <div>
                    <div style="font-weight:500">{k + 1}. {q.q}</div>
                    {!ok && <div class="small" style="margin-top:4px;color:var(--danger)">Your answer: {answers[k] != null ? q.choices[answers[k]] : '—'}</div>}
                    <div class="small" style="margin-top:2px;color:var(--sage-deep)">Correct: {q.choices[q.answer]}</div>
                    {q.why && <div class="small muted" style="margin-top:2px">{q.why}</div>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn btn--ghost" onClick={() => { setAnswers([]); setI(0); setDone(false); }}>Retake</button>
          <button class="btn" onClick={() => navigate('home')}>Back to Morning</button>
        </div>
      </main>
    );
  }

  const q = quiz[i];
  return (
    <main class="screen">
      <Header />
      <div class="small muted" style="display:flex;justify-content:space-between">
        <span>Week {today.weekNumber} · {pack.theme}</span>
        <span>{i + 1} / {quiz.length}</span>
      </div>
      <div class="lesson-progress" style="margin-top:8px" aria-hidden="true">
        {quiz.map((_, k) => <span key={k} class={k < i ? 'done' : k === i ? 'today' : ''} style={k > i ? 'background:var(--line)' : ''} />)}
      </div>
      <h2 style="font-size:var(--fs-22);margin-top:20px;line-height:1.3">{q.q}</h2>
      <div style="display:grid;gap:8px;margin-top:16px" role="radiogroup" aria-label="Answer">
        {q.choices.map((c, idx) => (
          <button key={idx} class="card" role="radio" aria-checked={answers[i] === idx} onClick={() => choose(idx)} style={`text-align:left;padding:14px 16px;font-size:var(--fs-16);line-height:1.35;border-width:2px;${answers[i] === idx ? 'border-color:var(--terracotta);background:var(--terracotta-soft)' : ''}`}>
            <span class="faint" style="margin-right:8px;font-weight:600">{'ABCD'[idx]}</span>{c}
          </button>
        ))}
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn--ghost" disabled={i === 0} onClick={() => setI(i - 1)} style={i === 0 ? 'opacity:.4' : ''}>Back</button>
        <button class="btn" style="flex:1" disabled={answers[i] == null} onClick={() => void forward()}>{i === quiz.length - 1 ? 'See my score' : 'Next'}</button>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header class="screen-header" style="align-items:center">
      <button class="icon-btn" aria-label="Back to Morning" onClick={() => navigate('home')} style="margin-left:-12px"><ChevronLeft size={24} /></button>
      <h1 style="flex:1;font-size:var(--fs-22)">Sunday quiz</h1>
    </header>
  );
}
