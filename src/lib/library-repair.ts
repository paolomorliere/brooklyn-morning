import type { Edition, LibraryEntry, LibraryRef, LibrarySnapshot, Story } from '@/types';
import type { LessonPack } from '@/lib/lessons';

/**
 * Give an already-saved Library entry a content reference, so it can be read rather than only
 * listed.
 *
 * Entries saved before reading existed carry nothing but metadata: a title, a URL, a publisher and
 * a note. Both kinds are still recoverable:
 *
 *   * a lesson was saved with the note "Week N · Day D · theme" and the lesson's exact title, so
 *     the pack it came from identifies it without guessing;
 *   * a story was saved with the publisher's URL, which is unique inside the stored editions.
 *
 * Nothing is invented. An entry that resolves to nothing is marked with the reason and keeps its
 * original link, rather than opening an empty reader.
 */

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** "Week 3 · Day 5 · theme" → { week: 3, day: 5 }. Returns null when the note says something else. */
export function parseLessonNote(note: string): { week: number; day: number } | null {
  const m = /week\s*(\d+)\s*[·|,-]\s*day\s*(\d+)/i.exec(note ?? '');
  if (!m) return null;
  const week = Number(m[1]);
  const day = Number(m[2]);
  if (!Number.isInteger(week) || !Number.isInteger(day) || day < 1 || day > 7) return null;
  return { week, day };
}

/** The lesson a saved entry refers to, found by title first and by the note's week/day second. */
export function resolveLessonRef(entry: LibraryEntry, packs: LessonPack[]): LibraryRef | null {
  const byTitle = packs.flatMap((p) => p.lessons.map((l) => ({ pack: p, lesson: l }))).filter((x) => norm(x.lesson.title) === norm(entry.title));
  if (byTitle.length === 1) {
    const { pack, lesson } = byTitle[0];
    return { kind: 'lesson', lessonId: lesson.id, packWeek: pack.week, day: lesson.day, packVersion: pack.version ?? null };
  }
  const noted = parseLessonNote(entry.note);
  if (noted) {
    // The title is the tiebreaker when two weeks happen to use the same lesson title.
    const exact = byTitle.find((x) => x.pack.week === noted.week && x.lesson.day === noted.day);
    const hit = exact ?? (() => {
      const pack = packs.find((p) => p.week === noted.week);
      const lesson = pack?.lessons.find((l) => l.day === noted.day);
      return pack && lesson ? { pack, lesson } : null;
    })();
    if (hit) return { kind: 'lesson', lessonId: hit.lesson.id, packWeek: hit.pack.week, day: hit.lesson.day, packVersion: hit.pack.version ?? null };
  }
  return null;
}

/** The story a saved entry refers to, found by URL across the stored editions. */
export function findStory(url: string, editions: Edition[]): { story: Story; edition: Edition } | null {
  for (const edition of editions) {
    const story = edition.stories.find((s) => s.url === url);
    if (story) return { story, edition };
  }
  return null;
}

export function snapshotOfStory(story: Story, editionDate: string | null): LibrarySnapshot {
  return {
    excerpt: story.excerpt,
    lead: story.lead ?? null,
    publishedAt: story.publishedAt,
    imageUrl: story.imageUrl ?? null,
    topic: story.topic,
    editionDate,
  };
}

export interface RepairResult {
  /** Entries that changed and need writing back. */
  updated: LibraryEntry[];
  repaired: number;
  unresolved: number;
}

/**
 * Attach a reference (and, for stories, a snapshot) to every entry that lacks one.
 * Returns only the entries that actually changed, so the migration writes as little as possible
 * and never touches a Library entry it has nothing to add to.
 */
export function repairEntries(entries: LibraryEntry[], packs: LessonPack[], editions: Edition[]): RepairResult {
  const updated: LibraryEntry[] = [];
  let repaired = 0;
  let unresolved = 0;

  for (const entry of entries) {
    if (entry.ref) continue; // already readable
    if (entry.kind === 'lesson') {
      const ref = resolveLessonRef(entry, packs);
      if (ref) {
        updated.push({ ...entry, ref, contentMissing: undefined });
        repaired++;
      } else if (!entry.contentMissing) {
        updated.push({
          ...entry,
          contentMissing: packs.length
            ? 'This lesson is not in any downloaded pack, so its text could not be recovered.'
            : 'Lesson packs have not been downloaded yet. Open Morning online and try again.',
        });
        unresolved++;
      }
      continue;
    }
    if (entry.kind === 'story' && entry.url) {
      const hit = findStory(entry.url, editions);
      if (hit) {
        updated.push({
          ...entry,
          ref: { kind: 'story', storyId: hit.story.id, editionDate: hit.edition.date, url: entry.url },
          snapshot: snapshotOfStory(hit.story, hit.edition.date),
          contentMissing: undefined,
        });
        repaired++;
      } else if (!entry.contentMissing) {
        updated.push({
          ...entry,
          ref: { kind: 'story', storyId: null, editionDate: null, url: entry.url },
          contentMissing: 'Saved before the app kept story text, and the edition it came from is no longer in the 14-day archive. The publisher’s link still works.',
        });
        unresolved++;
      }
    }
  }
  return { updated, repaired, unresolved };
}
