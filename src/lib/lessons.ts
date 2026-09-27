import type { Lesson } from '@/types';

export interface QuizQuestion { q: string; choices: string[]; answer: number; why?: string }
export interface LessonPack {
  schemaVersion: 1;
  week: number;
  theme: string;
  lessons: Lesson[];
  quiz?: QuizQuestion[];
  /** Content hash written by the build. A pack whose version changed is re-downloaded. */
  version?: string;
}

/**
 * Today's date in New York, as YYYY-MM-DD.
 *
 * The lesson sequence is a calendar, so which lesson is "today's" and where a week ends have to be
 * decided in one fixed timezone. Using the device's own zone meant that opening the app abroad, or
 * late at night on a westward flight, could move Sunday.
 */
export const NY_TZ = 'America/New_York';
export function nyDate(d: Date = new Date(), tz = NY_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** A YYYY-MM-DD string as a Date fixed at midday, so no timezone shift can move it a day. */
export const dateFromYMD = (ymd: string): Date => new Date(`${ymd}T12:00:00`);

/** Calendar arithmetic on YYYY-MM-DD, with no timezone involved either way. */
export function shiftYMD(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekday of a YYYY-MM-DD date, Monday = 0. */
export function weekdayIndex(ymd: string): number {
  return (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Monday of the Mon–Sun week containing this date. */
export function mondayOfYMD(ymd: string): string {
  return shiftYMD(ymd, -weekdayIndex(ymd));
}

/** The sequence never starts before this Monday, so a mid-week install waits for the next Monday and begins at lesson 1. */
export const LESSONS_EPOCH = '2026-09-21';

/** First Monday on or after `d`, in New York (a Monday returns itself). */
export function nextMondayOnOrAfter(d: Date): string {
  const ymd = nyDate(d);
  const day = weekdayIndex(ymd);
  return day === 0 ? ymd : shiftYMD(ymd, 7 - day);
}

/** Where the sequence should start for a first open on `d`: the next Monday, but never before the epoch. */
export function startMondayFor(d: Date): string {
  const m = nextMondayOnOrAfter(d);
  return m < LESSONS_EPOCH ? LESSONS_EPOCH : m;
}
export interface LessonIndexEntry {
  week: number;
  theme: string;
  file: string;
  /** Content version of the published pack. Absent on index files written before versioning. */
  version?: string;
  quizQuestions?: number;
}
export interface LessonIndex { schemaVersion: 1; weeks: LessonIndexEntry[] }

/** Monday (YYYY-MM-DD, New York) of the week containing `d`. */
export function mondayOf(d: Date): string {
  return mondayOfYMD(nyDate(d));
}

/** Whole days from `fromYMD` to `to`, counted on the New York calendar. */
export function daysBetween(fromYMD: string, to: Date | string): number {
  const b = typeof to === 'string' ? to : nyDate(to);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${fromYMD}T00:00:00Z`)) / 86400e3);
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
  /** Monday of this lesson's Mon–Sun week, in New York. The stable key for quizzes and archives. */
  weekStart: string;
  /** Content version of the pack this lesson came from, so an archived reference can be pinned. */
  packVersion: string | null;
  /**
   * Sunday only, and only when the pack in hand has no quiz: the week is complete but the quiz
   * cannot be shown. Rendered as an honest notice rather than silently omitting the quiz.
   */
  quizMissing?: boolean;
}

/**
 * Which lesson is today's. Weeks run Mon–Sun from the Monday of the install week.
 * When the sequence runs past the available packs, we cycle back and label it a Review week.
 */
export function lessonForDate(startMonday: string, packs: LessonPack[], date: Date | string): TodayLesson {
  const rawDays = daysBetween(startMonday, date);
  if (rawDays < 0) {
    return { lesson: null, weekNumber: 0, dayIndex: rawDays + 7, isReview: false, packWeek: null, startsOn: startMonday, weekStart: startMonday, packVersion: null };
  }
  const weekIdx = Math.floor(rawDays / 7);
  const dayIndex = rawDays % 7;
  const weekStart = shiftYMD(startMonday, weekIdx * 7);
  const sorted = [...packs].sort((a, b) => a.week - b.week);
  if (sorted.length === 0) {
    return { lesson: null, weekNumber: weekIdx + 1, dayIndex, isReview: false, packWeek: null, weekStart, packVersion: null };
  }
  const isReview = weekIdx >= sorted.length;
  const pack = sorted[weekIdx % sorted.length];
  const lesson = pack.lessons.find((l) => l.day === dayIndex + 1) ?? null;
  const quiz = dayIndex === 6 ? pack.quiz ?? null : null;
  return {
    lesson,
    weekNumber: weekIdx + 1,
    dayIndex,
    isReview,
    packWeek: pack.week,
    weekStart,
    packVersion: pack.version ?? null,
    quiz,
    quizMissing: dayIndex === 6 && !quiz?.length,
  };
}

/** Every Monday from the sequence start up to and including the week containing `upTo`. */
export function weekStartsUpTo(startMonday: string, upTo: Date | string): string[] {
  const days = daysBetween(startMonday, upTo);
  if (days < 0) return [];
  const out: string[] = [];
  for (let w = 0; w <= Math.floor(days / 7); w++) out.push(shiftYMD(startMonday, w * 7));
  return out;
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
    // Twenty exactly: the app promises "20 questions" on the Sunday card, and a short quiz would
    // make that label a lie.
    if (!Array.isArray(p.quiz) || p.quiz.length !== 20) return [`Week ${p.week} quiz has ${Array.isArray(p.quiz) ? p.quiz.length : 0} questions, expected 20`];
    for (const q of p.quiz) {
      if (typeof q.q !== 'string' || !Array.isArray(q.choices) || q.choices.length < 2 || typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) return [`Week ${p.week} has a malformed quiz question`];
    }
  }
  return [];
}
