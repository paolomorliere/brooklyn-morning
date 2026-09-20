import { describe, expect, it } from 'vitest';
import { canonicalUrl, dedupe, recencyFactor, scoreItem, selectPerTopic, tagGlossary, titleSimilarity } from '../scripts/lib/rank.mjs';
import { BOOSTS, MATCH_REPORT } from '../scripts/feeds.config.mjs';

const now = Date.parse('2026-09-20T10:00:00Z');
const hoursAgo = (h: number) => new Date(now - h * 3.6e6).toISOString();
const item = (title: string, extra: Record<string, unknown> = {}) => ({ title, excerpt: '', url: `https://ex.com/${title.replace(/\W+/g, '-')}`, publishedAt: hoursAgo(2), topic: 'soccer', publisher: 'P', lang: 'en', score: 1, ...extra });

describe('edition ranking', () => {
  it('canonicalizes URLs (tracking params, www, trailing slash)', () => {
    expect(canonicalUrl('https://www.npr.org/2026/x/?utm_source=rss&id=1')).toBe('https://npr.org/2026/x/?id=1');
  });
  it('detects near-duplicate titles', () => {
    expect(titleSimilarity('Real Madrid beat Barcelona in Clásico thriller', 'Real Madrid beat Barcelona in Clasico thriller')).toBeGreaterThan(0.6);
    expect(titleSimilarity('Fed holds rates', 'Marseille sign new striker')).toBe(0);
  });
  it('decays with age', () => {
    expect(recencyFactor(hoursAgo(0), now)).toBeCloseTo(1);
    expect(recencyFactor(hoursAgo(18), now)).toBeCloseTo(0.5);
  });
  it('boosts Paolo\'s clubs and penalizes match reports', () => {
    const feed = { id: 'f', weight: 1 };
    const om = scoreItem(item('Marseille appoint new sporting director'), feed, { boosts: BOOSTS.soccer, matchReport: MATCH_REPORT, now });
    const plain = scoreItem(item('Club appoints new sporting director'), feed, { boosts: BOOSTS.soccer, matchReport: MATCH_REPORT, now });
    const report = scoreItem(item('Marseille 2-1 Lyon: player ratings'), feed, { boosts: BOOSTS.soccer, matchReport: MATCH_REPORT, now });
    expect(om).toBeGreaterThan(plain);
    expect(report).toBeLessThan(plain);
  });
  it('dedupes by URL and title, keeping the higher score', () => {
    const a = item('Fed holds rates steady', { score: 2, url: 'https://a.com/x' });
    const b = item('Fed holds rates steady', { score: 1, url: 'https://b.com/y' });
    const c = item('Different story', { score: 1, url: 'https://a.com/x?utm_source=z' });
    expect(dedupe([a, b, c]).map((x) => x.url)).toEqual(['https://a.com/x']);
  });
  it('selects per topic with caps, freshness, seen-state, and background label', () => {
    const items = [
      ...['Parliament debates budget', 'Storm hits coast', 'Election results announced', 'Court rules on merger', 'Volcano erupts overnight'].map((t, i) => item(t, { publisher: 'BBC', topic: 'world', score: 10 - i })),
      item('NPR story', { publisher: 'NPR', topic: 'world', score: 1 }),
      item('Le Monde story', { publisher: 'Le Monde', topic: 'world', score: 9, lang: 'fr' }),
      item('Old story', { publisher: 'NPR', topic: 'world', score: 50, publishedAt: hoursAgo(72) }),
      item('Seen story', { publisher: 'NPR', topic: 'world', score: 50, url: 'https://seen.com/a' }),
      item('Water polo old but only', { topic: 'waterpolo', score: 1, publishedAt: hoursAgo(60) }),
    ];
    const r = selectPerTopic(items, { perTopic: 4, maxAgeHours: { world: 36, waterpolo: 168 }, seen: { 'https://seen.com/a': '2026-09-19' }, now, topics: ['world', 'waterpolo'] });
    const world = r.world.map((x) => x.title);
    expect(world).toHaveLength(4);
    expect(world.filter((t) => ['Parliament debates budget', 'Storm hits coast', 'Election results announced', 'Court rules on merger', 'Volcano erupts overnight'].includes(t))).toHaveLength(2); // publisher cap, first pass
    expect(world).toContain('NPR story');
    expect(world).toContain('Le Monde story');
    expect(world).not.toContain('Old story');
    expect(world).not.toContain('Seen story');
    expect(r.waterpolo[0].isBackground).toBe(true);
  });
  it('fills remaining slots past the publisher cap when a topic is thin', () => {
    const items = ['Brescia win opener', 'Oradea appoint coach', 'Registration opens for camp', 'Novi Beograd sign goalkeeper', 'Referee course announced'].map((t, i) => item(t, { publisher: 'LEN', topic: 'waterpolo', score: 5 - i }));
    const r = selectPerTopic(items, { perTopic: 4, maxAgeHours: { waterpolo: 168 }, now, topics: ['waterpolo'] });
    expect(r.waterpolo).toHaveLength(4);
  });
  it('tags glossary terms', () => {
    const glossary = [{ id: 'the-fed', pattern: /\b(the fed|federal reserve)\b/i }, { id: 'inflation', pattern: /\binflation\b/i }];
    expect(tagGlossary({ title: 'The Fed weighs inflation risk' }, glossary)).toEqual(['the-fed', 'inflation']);
  });
});
