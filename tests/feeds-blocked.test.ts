import { describe, expect, it } from 'vitest';
import { BLOCKED_HOSTS, FEEDS, isBlockedUrl } from '../scripts/feeds.config.mjs';

/**
 * 2026-11-23: Paolo asked to stop receiving Real Python in AI & Data — "No more." It had filled a slot on
 * 32 of the previous 37 days with tutorials and quizzes. Removing the feed is half of it; the host block
 * is what keeps it out if a link to it arrives through any other feed.
 */
describe('Real Python stays out of the edition', () => {
  it('is not one of the feeds', () => {
    expect(FEEDS.some((f) => /realpython/i.test(f.url) || /real python/i.test(f.name))).toBe(false);
  });

  it('is blocked wherever a link to it comes from', () => {
    expect(isBlockedUrl('https://realpython.com/python-quiz/')).toBe(true);
    expect(isBlockedUrl('https://www.realpython.com/podcasts/rpp/280/')).toBe(true);
    expect(BLOCKED_HOSTS.length).toBeGreaterThan(0);
  });

  it('does not block look-alike hosts or ordinary stories about Python', () => {
    expect(isBlockedUrl('https://notrealpython.com/x')).toBe(false);
    expect(isBlockedUrl('https://arstechnica.com/ai/2026/11/python-3-15-released/')).toBe(false);
    expect(isBlockedUrl('not a url')).toBe(false);
  });

  it('still has an AI section with several reporting sources', () => {
    const ai = FEEDS.filter((f) => f.topic === 'ai');
    expect(ai.map((f) => f.id)).toContain('wired-ai');
    expect(ai.length).toBeGreaterThanOrEqual(6);
  });
});
