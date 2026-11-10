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

/**
 * Replaying earlier lessons, for weeks that were missed.
 *
 * `from` is the first app date the replay applies to; every date before it keeps showing exactly what
 * it showed at the time, so archived editions, saved Library lessons and past quiz results are all
 * left alone. `offsetDays` is how far back to look, and it must be a multiple of seven: that is what
 * keeps Monday on Monday and the weekly quiz on Sunday.
 *
 * Only the lesson moves. The edition's own date, the news, the stock card and the water polo results
 * are on the real calendar and this never touches them.
 */
export interface LessonReplay {
  /** First app date this applies to, YYYY-MM-DD in New York. */
  from: string;
  /** Whole days to look back. A multiple of 7, so weekdays and the Sunday quiz stay aligned. */
  offsetDays: number;
  /** Why it exists, in the code rather than only in a commit message. */
  why?: string;
}

/**
 * Paolo missed four weeks of lessons, so from Monday 9 November 2026 the learning section runs
 * exactly four weeks behind: 9 November shows the lesson of 12 October, 10 November shows 13 October,
 * Sunday 15 November shows 18 October together with that week's twenty-question quiz, and 16 November
 * carries on with 19 October. The offset is fixed and never catches up — one original lesson per day,
 * in the original order.
 *
 * Without it the sequence would have reached the end of the eight published packs and started a
 * Review cycle on 16 November, repeating week 1 instead of continuing through weeks 5 to 8.
 *
 * Set to `null` to put the learning section back on the real calendar.
 */
export const LESSON_REPLAY: LessonReplay | null = {
  from: '2026-11-09',
  offsetDays: 28,
  why: 'Four weeks of lessons were missed; working through the existing material in its original order.',
};

/** The start date the lesson lookup should use for `ymd`: shifted only once the replay has begun. */
export function effectiveStartMonday(startMonday: string, ymd: string, replay: LessonReplay | null = LESSON_REPLAY): string {
  return replay && ymd >= replay.from ? shiftYMD(startMonday, replay.offsetDays) : startMonday;
}

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
  /**
   * Set when a replay is in force: the date whose lesson this originally was. The card says so, because
   * a week number that goes backwards with no explanation is the kind of thing that looks like a bug.
   */
  replayOf?: string;
}

/**
 * Which lesson is today's. Weeks run Mon–Sun from the Monday of the install week.
 * When the sequence runs past the available packs, we cycle back and label it a Review week.
 */
export function lessonForDate(
  startMonday: string,
  packs: LessonPack[],
  date: Date | string,
  replay: LessonReplay | null = LESSON_REPLAY,
): TodayLesson {
  const ymd = typeof date === 'string' ? date : nyDate(date);
  // The replay moves the *start* of the sequence forward, not the date being asked about. Shifting the
  // date instead would also move `weekStart`, and `weekStart` is the key every quiz result and draft is
  // filed under: a replayed Sunday would then overwrite the original attempt it is replaying. Moving
  // the start keeps `weekStart` on the real calendar, so the two attempts are separate records and the
  // October one survives.
  const start = effectiveStartMonday(startMonday, ymd, replay);
  const replayOf = start === startMonday ? undefined : shiftYMD(ymd, -(replay as LessonReplay).offsetDays);
  const rawDays = daysBetween(start, date);
  if (rawDays < 0) {
    return { lesson: null, weekNumber: 0, dayIndex: rawDays + 7, isReview: false, packWeek: null, startsOn: start, weekStart: start, packVersion: null, replayOf };
  }
  const weekIdx = Math.floor(rawDays / 7);
  const dayIndex = rawDays % 7;
  const weekStart = shiftYMD(start, weekIdx * 7);
  const sorted = [...packs].sort((a, b) => a.week - b.week);
  if (sorted.length === 0) {
    return { lesson: null, weekNumber: weekIdx + 1, dayIndex, isReview: false, packWeek: null, weekStart, packVersion: null, replayOf };
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
    replayOf,
  };
}

/**
 * Every Monday from the sequence start up to and including the week containing `upTo`.
 *
 * Deliberately not replay-aware: these are the app's own weeks, the keys quizzes and week reviews are
 * filed under, and they stay on the real calendar whatever the learning section is showing.
 */
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
