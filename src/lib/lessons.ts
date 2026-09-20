import type { Lesson } from '@/types';

export interface LessonPack { schemaVersion: 1; week: number; theme: string; lessons: Lesson[] }
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
}

/**
 * Which lesson is today's. Weeks run Mon–Sun from the Monday of the install week.
 * When the sequence runs past the available packs, we cycle back and label it a Review week.
 */
export function lessonForDate(startMonday: string, packs: LessonPack[], date: Date): TodayLesson {
  const days = Math.max(0, daysBetween(startMonday, date));
  const weekIdx = Math.floor(days / 7);
  const dayIndex = days % 7;
  const sorted = [...packs].sort((a, b) => a.week - b.week);
  if (sorted.length === 0) return { lesson: null, weekNumber: weekIdx + 1, dayIndex, isReview: false, packWeek: null };
  const isReview = weekIdx >= sorted.length;
  const pack = sorted[weekIdx % sorted.length];
  const lesson = pack.lessons.find((l) => l.day === dayIndex + 1) ?? null;
  return { lesson, weekNumber: weekIdx + 1, dayIndex, isReview, packWeek: pack.week };
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
  return [];
}
