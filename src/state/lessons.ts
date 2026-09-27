import type { LessonProgress, QuizDraft, QuizResult } from '@/types';
import { createStore } from './store';
import { getLessonProgress, kvGet, kvSet, setLessonProgress } from '@/db/personal';
import { LESSONS_EPOCH, lessonForDate, startMondayFor, validatePack, type LessonIndex, type LessonIndexEntry, type LessonPack, type TodayLesson } from '@/lib/lessons';

interface LessonState {
  packs: LessonPack[];
  progress: LessonProgress | null;
  totalWeeksAvailable: number;
  ready: boolean;
  lastError: string | null;
  /** Weeks whose stored copy is older than the published one and could not be refreshed. */
  staleWeeks: number[];
}

const base = () => import.meta.env.BASE_URL;

export const lessonStore = createStore<LessonState>({ packs: [], progress: null, totalWeeksAvailable: 0, ready: false, lastError: null, staleWeeks: [] }, async () => {
  const weeks = await kvGet<number[]>('lessons:weeks', []);
  const packs = (await Promise.all(weeks.map((w) => kvGet<LessonPack | null>(`lessons:week-${w}`, null)))).filter(Boolean) as LessonPack[];
  let progress = await getLessonProgress();
  if (!progress) {
    progress = { startMonday: startMondayFor(new Date()), readLessonIds: [] };
    await setLessonProgress(progress);
  } else if (progress.startMonday < LESSONS_EPOCH) {
    // Installed before the sequence officially began: restart cleanly at week 1 on the epoch Monday.
    progress = { ...progress, startMonday: LESSONS_EPOCH, readLessonIds: [] };
    await setLessonProgress(progress);
  }
  return { packs, progress, totalWeeksAvailable: packs.length, ready: true, lastError: null, staleWeeks: [] };
});

const patch = (p: Partial<LessonState>) => lessonStore.set({ ...lessonStore.get(), ...p });

export const lessonActions = {
  /**
   * Read lessons.index.json and download every pack we do not have **or whose version has changed**.
   *
   * The version check is the fix for the missing Sunday quiz. The old rule was "skip any week we
   * already have", so the eight packs downloaded on 19 September — before the quizzes existed —
   * were never replaced, and Sunday's quiz could never appear however many times the app synced.
   */
  async sync(): Promise<void> {
    await lessonStore.ensure();
    try {
      const r = await fetch(`${base()}data/lessons/lessons.index.json?v=${Date.now()}`, { cache: 'no-cache', signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const idx = (await r.json()) as LessonIndex;
      const have = new Map(lessonStore.get().packs.map((p) => [p.week, p]));
      const packs = [...lessonStore.get().packs];
      const stale: number[] = [];
      // An index entry with no version is an older publication: keep what we have rather than
      // re-downloading the same bytes on every sync.
      const wanted = idx.weeks.filter((e) => {
        const mine = have.get(e.week);
        return !(mine && (!e.version || mine.version === e.version));
      });

      /** One pack, with a single retry: a fetch that fails once should not leave a week stale. */
      const fetchPack = async (entry: LessonIndexEntry): Promise<LessonPack | null> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const pr = await fetch(`${base()}data/lessons/${entry.file}?v=${entry.version ?? ''}`, { signal: AbortSignal.timeout(20_000) });
            if (!pr.ok) throw new Error(`HTTP ${pr.status}`);
            const pack: unknown = await pr.json();
            const problems = validatePack(pack);
            if (problems.length) throw new Error(problems[0]);
            return pack as LessonPack;
          } catch (e) {
            if (attempt === 1) console.warn('Lesson pack', entry.file, 'could not be updated:', (e as Error).message);
          }
        }
        return null;
      };

      // Fetched together rather than one after another: eight small files in sequence made the
      // first open slow, and one slow file delayed every week behind it.
      const fetched = await Promise.all(wanted.map(fetchPack));
      wanted.forEach((entry, i) => {
        const pack = fetched[i];
        if (!pack) {
          // Keep the copy we have; say which week is behind rather than pretending it is current.
          if (have.has(entry.week)) stale.push(entry.week);
          return;
        }
        const at = packs.findIndex((p) => p.week === entry.week);
        if (at >= 0) packs[at] = pack;
        else packs.push(pack);
      });
      for (const pack of fetched) if (pack) await kvSet(`lessons:week-${pack.week}`, pack);
      packs.sort((a, b) => a.week - b.week);
      await kvSet('lessons:weeks', packs.map((p) => p.week));
      patch({ packs, totalWeeksAvailable: packs.length, lastError: null, staleWeeks: stale });
    } catch (e) {
      patch({ lastError: (e as Error).message });
    }
  },
  async importPack(data: unknown): Promise<string | null> {
    await lessonStore.ensure();
    const problems = validatePack(data);
    if (problems.length) return problems[0];
    const pack = data as LessonPack;
    const packs = [...lessonStore.get().packs.filter((p) => p.week !== pack.week), pack].sort((a, b) => a.week - b.week);
    await kvSet(`lessons:week-${pack.week}`, pack);
    await kvSet('lessons:weeks', packs.map((p) => p.week));
    patch({ packs, totalWeeksAvailable: packs.length });
    return null;
  },
  async markRead(lessonId: string) {
    await lessonStore.ensure();
    const cur = lessonStore.get().progress;
    if (!cur || cur.readLessonIds.includes(lessonId)) return;
    const progress = { ...cur, readLessonIds: [...cur.readLessonIds, lessonId] };
    await setLessonProgress(progress);
    patch({ progress });
  },
  /** Record a submitted quiz and clear that week's draft. Keyed by the week's Monday. */
  async saveQuizResult(result: QuizResult) {
    await lessonStore.ensure();
    const cur = lessonStore.get().progress;
    if (!cur) return;
    const same = (r: QuizResult) => (result.weekStart ? r.weekStart === result.weekStart : r.week === result.week);
    const quizResults = [...(cur.quizResults ?? []).filter((r) => !same(r)), result];
    const quizDrafts = (cur.quizDrafts ?? []).filter((d) => d.weekStart !== result.weekStart);
    const progress = { ...cur, quizResults, quizDrafts };
    await setLessonProgress(progress);
    patch({ progress });
  },

  /** Keep an unsubmitted quiz, so answers survive leaving the screen and closing the app. */
  async saveQuizDraft(draft: QuizDraft) {
    await lessonStore.ensure();
    const cur = lessonStore.get().progress;
    if (!cur) return;
    const quizDrafts = [...(cur.quizDrafts ?? []).filter((d) => d.weekStart !== draft.weekStart), draft];
    const progress = { ...cur, quizDrafts };
    await setLessonProgress(progress);
    patch({ progress });
  },

  async clearQuizDraft(weekStart: string) {
    await lessonStore.ensure();
    const cur = lessonStore.get().progress;
    if (!cur?.quizDrafts?.length) return;
    const progress = { ...cur, quizDrafts: cur.quizDrafts.filter((d) => d.weekStart !== weekStart) };
    await setLessonProgress(progress);
    patch({ progress });
  },
  /** The lesson for a given day — today by default, or any past date for an archived edition. */
  today(date: Date | string = new Date()): TodayLesson {
    const s = lessonStore.get();
    if (!s.progress) return { lesson: null, weekNumber: 1, dayIndex: 0, isReview: false, packWeek: null, weekStart: LESSONS_EPOCH, packVersion: null };
    return lessonForDate(s.progress.startMonday, s.packs, date);
  },
};
