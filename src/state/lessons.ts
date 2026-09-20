import type { LessonProgress, QuizResult } from '@/types';
import { createStore } from './store';
import { getLessonProgress, kvGet, kvSet, setLessonProgress } from '@/db/personal';
import { LESSONS_EPOCH, lessonForDate, startMondayFor, validatePack, type LessonIndex, type LessonPack, type TodayLesson } from '@/lib/lessons';

interface LessonState { packs: LessonPack[]; progress: LessonProgress | null; totalWeeksAvailable: number; ready: boolean; lastError: string | null }

const base = () => import.meta.env.BASE_URL;

export const lessonStore = createStore<LessonState>({ packs: [], progress: null, totalWeeksAvailable: 0, ready: false, lastError: null }, async () => {
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
  return { packs, progress, totalWeeksAvailable: packs.length, ready: true, lastError: null };
});

const patch = (p: Partial<LessonState>) => lessonStore.set({ ...lessonStore.get(), ...p });

export const lessonActions = {
  /** Read lessons.index.json and download any packs we don't have yet. New packs pushed later appear with no manual step. */
  async sync(): Promise<void> {
    await lessonStore.ensure();
    try {
      const r = await fetch(`${base()}data/lessons/lessons.index.json`, { cache: 'no-cache', signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const idx = (await r.json()) as LessonIndex;
      const have = new Set(lessonStore.get().packs.map((p) => p.week));
      const packs = [...lessonStore.get().packs];
      for (const entry of idx.weeks) {
        if (have.has(entry.week)) continue;
        const pr = await fetch(`${base()}data/lessons/${entry.file}`, { signal: AbortSignal.timeout(15_000) });
        if (!pr.ok) continue;
        const pack: unknown = await pr.json();
        const problems = validatePack(pack);
        if (problems.length) {
          console.warn('Skipping lesson pack', entry.file, problems[0]);
          continue;
        }
        await kvSet(`lessons:week-${entry.week}`, pack);
        packs.push(pack as LessonPack);
      }
      packs.sort((a, b) => a.week - b.week);
      await kvSet('lessons:weeks', packs.map((p) => p.week));
      patch({ packs, totalWeeksAvailable: packs.length, lastError: null });
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
  async saveQuizResult(result: QuizResult) {
    await lessonStore.ensure();
    const cur = lessonStore.get().progress;
    if (!cur) return;
    const quizResults = [...(cur.quizResults ?? []).filter((r) => r.week !== result.week), result];
    const progress = { ...cur, quizResults };
    await setLessonProgress(progress);
    patch({ progress });
  },
  today(date = new Date()): TodayLesson {
    const s = lessonStore.get();
    if (!s.progress) return { lesson: null, weekNumber: 1, dayIndex: 0, isReview: false, packWeek: null };
    return lessonForDate(s.progress.startMonday, s.packs, date);
  },
};
