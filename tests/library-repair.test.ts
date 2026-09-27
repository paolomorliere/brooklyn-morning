import { describe, expect, it } from 'vitest';
import type { Edition, LibraryEntry, Story } from '@/types';
import type { LessonPack } from '@/lib/lessons';
import { parseLessonNote, repairEntries, resolveLessonRef } from '@/lib/library-repair';

const packs: LessonPack[] = [
  {
    schemaVersion: 1, week: 1, theme: 'The stock market, from zero', version: 'v1',
    lessons: Array.from({ length: 7 }, (_, i) => ({
      id: `week-01-d${i + 1}`, week: 1, day: i + 1, theme: 'The stock market, from zero',
      title: i === 0 ? 'What a share actually is' : `Lesson ${i + 1}`,
      explanation: ['x'], example: ['y'], exercise: null, readMinutes: 2,
    })),
  },
];

const story: Story = {
  id: 's1', topic: 'finance', title: 'Fed rates explained', publisher: 'NPR',
  url: 'https://www.npr.org/a', publishedAt: '2026-09-22T11:00:00Z',
  excerpt: 'An excerpt.', excerptSource: 'rss', lead: 'A lead.', leadSource: 'extracted',
  isBackground: false, glossaryTerms: [],
};
const edition: Edition = {
  schemaVersion: 1, date: '2026-09-22', preparedAt: '2026-09-22T09:52:00Z',
  stories: [story], sources: [], lessonRef: null,
};

const entry = (over: Partial<LibraryEntry>): LibraryEntry => ({
  id: 'e', kind: 'own', title: 't', url: null, note: '', tags: [], savedAt: '2026-09-22T12:00:00Z', ...over,
});

describe('reading the old note format', () => {
  it('pulls the week and day out', () => {
    expect(parseLessonNote('Week 1 · Day 1 · The stock market, from zero')).toEqual({ week: 1, day: 1 });
    expect(parseLessonNote('Week 12 · Day 7')).toEqual({ week: 12, day: 7 });
  });
  it('returns nothing for a note that is not one', () => {
    expect(parseLessonNote('Check flight prices in January')).toBeNull();
    expect(parseLessonNote('')).toBeNull();
  });
});

describe('resolving a saved lesson', () => {
  it('finds it by title', () => {
    const ref = resolveLessonRef(entry({ kind: 'lesson', title: 'What a share actually is' }), packs);
    expect(ref).toEqual({ kind: 'lesson', lessonId: 'week-01-d1', packWeek: 1, day: 1, packVersion: 'v1' });
  });
  it('falls back to the week and day in the note', () => {
    const ref = resolveLessonRef(entry({ kind: 'lesson', title: 'renamed by me', note: 'Week 1 · Day 4' }), packs);
    expect(ref).toMatchObject({ lessonId: 'week-01-d4', day: 4 });
  });
  it('gives up rather than picking a lesson at random', () => {
    expect(resolveLessonRef(entry({ kind: 'lesson', title: 'not a lesson we have' }), packs)).toBeNull();
  });
});

describe('repairing saved entries', () => {
  it('gives an old lesson entry a reference without touching anything else', () => {
    const e = entry({ id: 'e2', kind: 'lesson', title: 'What a share actually is', note: 'Week 1 · Day 1', tags: ['Learning'] });
    const { updated, repaired } = repairEntries([e], packs, [edition]);
    expect(repaired).toBe(1);
    expect(updated[0].ref).toMatchObject({ kind: 'lesson', lessonId: 'week-01-d1' });
    expect(updated[0].title).toBe(e.title);
    expect(updated[0].note).toBe(e.note);
    expect(updated[0].tags).toEqual(e.tags);
    expect(updated[0].savedAt).toBe(e.savedAt);
  });

  it('gives an old story entry its text from the stored edition', () => {
    const e = entry({ id: 'e1', kind: 'story', title: 'Fed rates explained', url: story.url, publisher: 'NPR' });
    const { updated, repaired } = repairEntries([e], packs, [edition]);
    expect(repaired).toBe(1);
    expect(updated[0].ref).toMatchObject({ kind: 'story', storyId: 's1', editionDate: '2026-09-22' });
    expect(updated[0].snapshot).toMatchObject({ excerpt: 'An excerpt.', lead: 'A lead.', editionDate: '2026-09-22' });
  });

  it('says what is missing rather than opening an empty reader', () => {
    const e = entry({ id: 'e1', kind: 'story', title: 'Gone', url: 'https://example.org/gone' });
    const { updated, unresolved } = repairEntries([e], packs, [edition]);
    expect(unresolved).toBe(1);
    expect(updated[0].contentMissing).toMatch(/14-day archive/);
    expect(updated[0].url).toBe('https://example.org/gone'); // the link out is kept
  });

  it('leaves entries that are already readable alone', () => {
    const e = entry({ kind: 'lesson', ref: { kind: 'lesson', lessonId: 'week-01-d1', packWeek: 1, day: 1, packVersion: 'v1' } });
    expect(repairEntries([e], packs, [edition]).updated).toEqual([]);
  });

  it('never drops an entry it cannot help', () => {
    const own = entry({ id: 'own', kind: 'own', title: 'Lisbon in March', url: 'https://example.org' });
    const { updated } = repairEntries([own], packs, [edition]);
    expect(updated).toEqual([]);
  });

  it('does not re-mark an entry already reported as unrecoverable', () => {
    const e = entry({ kind: 'story', url: 'https://example.org/gone', contentMissing: 'already said' });
    expect(repairEntries([e], packs, [edition]).updated).toEqual([]);
  });
});
