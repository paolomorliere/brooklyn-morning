import { describe, expect, it } from 'vitest';
import { SPONSORED_CATEGORIES, NEAR_DUPLICATE, TOPIC_KEYWORDS } from '../scripts/feeds.config.mjs';
import { documentFrequency, properNouns, sameStory, sharedDistinctive, titleSimilarity } from '../scripts/lib/rank.mjs';

/**
 * The two stories that ran next to each other in the 7 October 2026 edition. Verbatim, because the whole
 * point is that the rule has to catch *these*, not a convenient paraphrase of them.
 */
const SABADELL = {
  title: 'Sabadell earns three points in Montenegro; Recco struggles in Italian derby',
  excerpt:
    'Visiting teams recorded victories in the first four games of the 2027 Champions League. The most exciting match took place in Podgorica, where Sabadell defeated Jadran Carine.',
  publisher: 'Total Waterpolo',
};
const LEN = {
  title: 'Champions League Men: Sabadell, Recco, Olympiacos and Radnicki all head home with three points',
  excerpt:
    'Recco and Sabadell were the big winners as the Champions League Group Stage got underway across the continent, with both teams earning crucial away victories at Jadran and in the Italian derby.',
  publisher: 'LEN',
};

/** Four water polo stories from the same week that are genuinely about different things. */
const DIFFERENT = [
  { title: 'Euro Cup Men: Teams set for qualification fight to reach main event', excerpt: 'The spotlight is ready to shine on the Euro Cup, as the men’s Qualification Round gets underway on Thursday night.', publisher: 'LEN' },
  { title: 'Harvard University to Stream October 10 Northeast Water Polo Conference Battle with No. 19 Brown University', excerpt: 'Harvard University will stream the Crimson’s Northeast Water Polo Conference home game on Saturday versus No. 19-ranked Brown.', publisher: 'CWPA' },
  { title: 'Kim Named NWPC Player of the Week', excerpt: 'Harvard’s Kim earned Northeast Water Polo Conference Player of the Week honors.', publisher: 'Harvard Athletics' },
  { title: 'Navy Pair Claims Weekly Conference Honors', excerpt: 'Two Midshipmen were recognised by the Mid-Atlantic Water Polo Conference this week.', publisher: 'Navy Athletics' },
];

/**
 * A pool the size and shape the live build ranks: water polo keeps a week of candidates, and the same
 * schools and conferences recur through them. The recurrence matters — it is what makes "Harvard" and
 * "Northeast" ordinary section vocabulary rather than a distinguishing name, and a pool of identical
 * filler would make this test easier than reality rather than harder.
 */
const SCHOOLS = ['Harvard', 'Brown', 'Fordham', 'Navy', 'Iona', 'Bucknell', 'Princeton', 'Johns Hopkins', 'Long Island', 'MIT', 'Gannon', 'Mercyhurst'];
const COMPETITIONS = ['Northeast Water Polo Conference', 'Mid-Atlantic Water Polo Conference', 'Collegiate Club Division'];

function pool(extra: object[] = []) {
  const filler: object[] = [];
  for (let i = 0; i < 36; i++) {
    const home = SCHOOLS[i % SCHOOLS.length];
    const away = SCHOOLS[(i * 5 + 3) % SCHOOLS.length];
    filler.push({
      title: `${home} University Defeats ${away} University in ${COMPETITIONS[i % COMPETITIONS.length]} Play`,
      excerpt: `${home} beat ${away} on Saturday in ${COMPETITIONS[i % COMPETITIONS.length]} action, with the Collegiate Water Polo Association reporting the result.`,
      publisher: 'CWPA',
    });
  }
  return [SABADELL, LEN, ...DIFFERENT, ...filler, ...extra];
}

describe('properNouns', () => {
  it('keeps the names inside a headline and ignores the word that opens it', () => {
    const w = properNouns({ title: 'Sabadell earns three points in Montenegro; Recco struggles in Italian derby' });
    expect(w).toContain('montenegro');
    expect(w).toContain('recco');
    expect(w).toContain('italian');
    // "Sabadell" opens the title, so it is capitalised whatever it is and is not counted from there.
    // It is counted from the excerpt, where it appears mid-sentence — which the pair test relies on.
    expect(properNouns(SABADELL)).toContain('sabadell');
  });

  it('ignores the publisher’s own name, which several feeds sign their excerpts with', () => {
    const w = properNouns({ title: 'Great weekend for Sabac in VRL League', excerpt: 'A report from Total Waterpolo.', publisher: 'Total Waterpolo' });
    expect(w).toContain('sabac');
    expect(w).not.toContain('total');
    expect(w).not.toContain('waterpolo');
  });

  it('ignores short words and anything lower-case', () => {
    const w = properNouns({ title: 'The LEN Cup is on', excerpt: 'It starts soon.' });
    expect([...w].every((x) => x.length >= 4)).toBe(true);
    expect(w).not.toContain('cup'); // three letters
    expect(w).not.toContain('starts');
  });
});

describe('sameStory', () => {
  it('catches the two Champions League write-ups that ran together on 7 October 2026', () => {
    const items = pool();
    const df = documentFrequency(items);
    expect(sameStory(SABADELL, LEN, df, items.length, NEAR_DUPLICATE)).toBe(true);
  });

  it('catches them although their titles are nowhere near the dedupe threshold', () => {
    // This is why the rule had to exist: the existing title Jaccard sees almost nothing in common.
    expect(titleSimilarity(SABADELL.title, LEN.title)).toBeLessThan(0.5);
    expect(titleSimilarity(SABADELL.title, LEN.title)).toBeCloseTo(0.21, 1);
  });

  it('names the words it decided on', () => {
    const items = pool();
    const { shared } = sharedDistinctive(SABADELL, LEN, documentFrequency(items), items.length, NEAR_DUPLICATE);
    expect(shared).toContain('sabadell');
    expect(shared).toContain('recco');
  });

  it('leaves four genuinely different water polo stories alone', () => {
    const items = pool();
    const df = documentFrequency(items);
    for (let i = 0; i < DIFFERENT.length; i++) {
      for (let j = i + 1; j < DIFFERENT.length; j++) {
        expect(
          sameStory(DIFFERENT[i], DIFFERENT[j], df, items.length, NEAR_DUPLICATE),
          `${DIFFERENT[i].title} / ${DIFFERENT[j].title}`,
        ).toBe(false);
      }
    }
  });

  it('does not tie two CWPA notices together just because both say "Collegiate Water Polo Association"', () => {
    const items = pool();
    const df = documentFrequency(items);
    const notices = items.filter((it: { publisher?: string }) => it.publisher === 'CWPA') as { title: string }[];
    const schoolsIn = (t: string) => SCHOOLS.filter((s) => t.includes(s));
    for (let i = 0; i < notices.length; i++) {
      for (let j = i + 1; j < notices.length; j++) {
        const common = schoolsIn(notices[i].title).filter((s) => schoolsIn(notices[j].title).includes(s));
        if (common.length >= 2) continue; // the same two schools: see the next test
        expect(
          sameStory(notices[i], notices[j], df, items.length, NEAR_DUPLICATE),
          `${notices[i].title} / ${notices[j].title}`,
        ).toBe(false);
      }
    }
  });

  it('treats two write-ups that name the same two schools as one story, which is the point', () => {
    // This is not a concession, it is the behaviour that caught "No. 4 Fordham University Washes Away
    // No. 6 Long Beach State University in Overtime, 14-10" and "#4 Water Polo Works Overtime to Defeat
    // #6 Long Beach State" — the same game, filed by both athletics departments.
    const items = pool();
    const df = documentFrequency(items);
    const fordham = { title: 'No. 4 Fordham University Washes Away No. 6 Long Beach State University in Overtime, 14-10', excerpt: 'Fordham beat Long Beach State in overtime.', publisher: 'CWPA' };
    const longBeach = { title: '#4 Water Polo Works Overtime to Defeat #6 Long Beach State', excerpt: 'The Rams went to overtime against Long Beach State at Fordham.', publisher: 'Fordham Athletics' };
    expect(sameStory(fordham, longBeach, df, items.length, NEAR_DUPLICATE)).toBe(true);
    // The cost is understood and accepted: two *different* games between the same two schools in the
    // same week would also collapse to one. No score is lost by that — scores come from the water polo
    // feed, not from this news section.
  });

  it('is not satisfied by a single shared name', () => {
    const items = pool();
    const df = documentFrequency(items);
    const a = { title: 'Report: Sabadell sign a new goalkeeper', excerpt: 'A transfer at Sabadell.', publisher: 'LEN' };
    const b = { title: 'Preview: the Hungarian league restarts', excerpt: 'Fixtures in Hungary, with Sabadell watching.', publisher: 'LEN' };
    const { shared } = sharedDistinctive(a, b, df, items.length, NEAR_DUPLICATE);
    expect(shared.length).toBeLessThan(2);
    expect(sameStory(a, b, df, items.length, NEAR_DUPLICATE)).toBe(false);
  });
});

describe('the advertising and topic rules', () => {
  const sponsored = (c: string) => SPONSORED_CATEGORIES.some((re: RegExp) => re.test(c));

  it('drops the labels MIT Technology Review actually uses on its paid placements', () => {
    expect(sponsored('sponsored')).toBe(true);
    expect(sponsored('sponsored content')).toBe(true);
    expect(sponsored('paid post')).toBe(true);
    expect(sponsored('partner content')).toBe(true);
    expect(sponsored('presented by acme')).toBe(true);
  });

  it('does not mistake an editorial category for an advertisement', () => {
    for (const c of ['artificial intelligence', 'opinion', 'the algorithm', 'policy', 'subscriber-only stories', 'sponsorship rules in football']) {
      expect(sponsored(c), c).toBe(false);
    }
  });

  const onTopic = (t: string) => TOPIC_KEYWORDS.ai.some((re: RegExp) => re.test(t));

  it('keeps AI stories and the data work the section is also for', () => {
    for (const t of [
      'Google rolls out improved SynthID AI content detector',
      'Quiz: Using pandas and Python to Explore Your Dataset',
      'Why your DAX measure is slow',
      'Power BI adds a new dashboard layout',
      'Mistral says Le Chonk can challenge the best models',
      'Connecting agents to enterprise knowledge',
    ]) expect(onTopic(t), t).toBe(true);
  });

  it('drops the biotech and climate pieces that filled the section on 7 October 2026', () => {
    for (const t of [
      'Weight-loss drugs show signs of slowing biological aging, say drugmakers',
      'The Download: 10 climate tech companies to watch',
      'Young organs may not be a fountain of youth for recipients',
      'How smaller, distributed batteries could help the grid',
      'Nobel Prize awarded for showing how nerve cells shape feelings',
    ]) expect(onTopic(t), t).toBe(false);
  });

  it('passes an item on the publisher’s own category alone', () => {
    const title = 'Roundtables: The Deadly Failures of The Virtual Border Wall';
    expect(onTopic(title)).toBe(false);
    expect(onTopic(`${title}  artificial intelligence`)).toBe(true);
  });
});
