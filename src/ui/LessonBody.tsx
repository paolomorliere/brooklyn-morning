import { useState } from 'preact/hooks';
import { ChevronDown } from 'lucide-preact';
import type { Lesson } from '@/types';

/**
 * A lesson's actual content: explanation, example, exercise and its answer reveal.
 *
 * Extracted so the four places that show a lesson all show the same thing — today's card on
 * Morning, an archived edition's lesson, the week review, and a lesson saved in the Library.
 * Before this, only Morning could render a lesson at all, which is why a saved lesson opened the
 * edit sheet and an archived edition showed no lesson.
 */
export function LessonBody({ lesson, tone = 'dark' }: { lesson: Lesson; tone?: 'dark' | 'light' }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div class={`lesson-body ${tone === 'light' ? 'lesson-body--light' : ''}`}>
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
          {reveal ? (
            <div class="lesson-answer">{lesson.exercise.answer}</div>
          ) : (
            <button class="btn btn--ghost" style="margin-top:12px" onClick={() => setReveal(true)}>Reveal answer</button>
          )}
        </details>
      )}
    </div>
  );
}
