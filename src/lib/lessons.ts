import type { Lesson } from '@/types';

export interface QuizQuestion { q: string; choices: string[]; answer: number; why?: string }
export interface LessonPack { schemaVersion: 1; week: number; theme: string; lessons: Lesson[]; quiz?: QuizQuestion[] }

/** The sequence never starts before this Monday, so a mid-week install waits for the next Monday and begins at lesson 1. */
export const LESSONS_EPOCH = '2026-09-21';

/** First Monday on or after `d` (a Monday returns itself). */
export function nextMondayOnOrAfter(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // Mon=0
  if (day !== 0) x.setDate(x.getDate() + (7 - day));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Where the sequence should start for a first open on `d`: the next Monday, but never before the epoch. */
export function startMondayFor(d: Date): string {
  const m = nextMondayOnOrAfter(d);
  return m < LESSONS_EPOCH ? LESSONS_EPOCH : m;
}
export interface LessonIndexEntry { week: number; theme: string; file: string }
export interface LessonIndex { schemaVersion: 1; weeks: LessonIndexEntry[] }

/** Monday (YYYY-MM-DD, local) of the week containing `d`. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function daysBetween(fromYMD: string, to: Date): number {
  const [y, m, d] = fromYMD.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400e3);
}

export interface TodayLesson {
  lesson: Lesson | null;
  weekNumber: number; // 1-based sequence week since start (not the pack number)
  dayIndex: number; // 0..6 Mon..Sun
  isReview: boolean;
  packWeek: number | null;
  /** Set when the sequence has not started yet (before the first Monday). */
  startsOn?: string;
  /** Sunday only: the week's quiz, when the pack has one. */
  quiz?: QuizQuestion[] | null;
}

/**
 * Which lesson is today's. Weeks run Mon–Sun from the Monday of the install week.
 * When the sequence runs past the available packs, we cycle back and label it a Review week.
 */
export function lessonForDate(startMonday: string, packs: LessonPack[], date: Date): TodayLesson {
  const rawDays = daysBetween(startMonday, date);
  if (rawDays < 0) return { lesson: null, weekNumber: 0, dayIndex: rawDays + 7, isReview: false, packWeek: null, startsOn: startMonday };
  const days = rawDays;
  const weekIdx = Math.floor(days / 7);
  const dayIndex = days % 7;
  const sorted = [...packs].sort((a, b) => a.week - b.week);
  if (sorted.length === 0) return { lesson: null, weekNumber: weekIdx + 1, dayIndex, isReview: false, packWeek: null };
  const isReview = weekIdx >= sorted.length;
  const pack = sorted[weekIdx % sorted.length];
  const lesson = pack.lessons.find((l) => l.day === dayIndex + 1) ?? null;
  return { lesson, weekNumber: weekIdx + 1, dayIndex, isReview, packWeek: pack.week, quiz: dayIndex === 6 ? pack.quiz ?? null : null };
}

export function validatePack(data: unknown): string[] {
  const p = data as Partial<LessonPack>;
  if (!p || typeof p !== 'object') return ['Not an object'];
  if (p.schemaVersion !== 1) return ['Unsupported schemaVersion'];
  if (typeof p.week !== 'number' || typeof p.theme !== 'string' || !Array.isArray(p.lessons)) return ['Missing week, theme, or lessons'];
  if (p.lessons.length !== 7) return [`Week ${p.week} has ${p.lessons.length} lessons, expected 7`];
  const days = new Set<number>();
  for (const l of p.lessons) {
    if (typeof l.id !== 'string' || typeof l.title !== 'string' || !Array.isArray(l.explanation) || !Array.isArray(l.example)) return [`Lesson ${String(l.id)} is malformed`];
    if (l.exercise !== null && (typeof l.exercise?.prompt !== 'string' || typeof l.exercise?.answer !== 'string')) return [`Lesson ${l.id} has a malformed exercise`];
    if (days.has(l.day)) return [`Week ${p.week} has two lessons for day ${l.day}`];
    days.add(l.day);
  }
  if (p.quiz !== undefined) {
    if (!Array.isArray(p.quiz) || p.quiz.length < 5) return [`Week ${p.week} quiz is malformed`];
    for (const q of p.quiz) {
      if (typeof q.q !== 'string' || !Array.isArray(q.choices) || q.choices.length < 2 || typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) return [`Week ${p.week} has a malformed quiz question`];
    }
  }
  return [];
}
