import { describe, expect, it } from 'vitest';
import { loadStrategy, ruleText, stockCardFor, validationNote } from '../scripts/lib/strategy.mjs';

const feed = (over: Record<string, unknown> = {}) => ({
  builtAt: '2026-10-06T10:00:00.000Z',
  decidedFor: '2026-10-06',
  strategyVersion: 2,
  strategyHash: 'abc',
  block: { kind: 'pick', strategyVersion: 2, ticker: 'ADI', rule: 'the rule' },
  recaps: [],
  ...over,
});

describe('strategy — the frozen rules', () => {
  it('hashes the exact bytes of the committed rule file', async () => {
    const a = await loadStrategy();
    const b = await loadStrategy();
    expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(b.hash).toBe(a.hash);
    expect(a.rules.strategyVersion).toBe(2);
    expect(a.rules.horizonSessions).toBe(21);
  });

  it('keeps the candidate signals out until a visible edit admits them', async () => {
    const { rules } = await loadStrategy();
    // Adopting 12−1 momentum or the five-session return has to be an edit to this file, which changes
    // the hash, so a pick can never be attributed to rules that did not make it.
    expect(rules.ranking.candidateSignalsAdopted).toEqual([]);
    expect(rules.ranking.candidateSignalsUnderTest).toEqual(['momentum12_1', 'return5']);
  });

  it('states every threshold the card quotes, and what the score is not', async () => {
    const { rules } = await loadStrategy();
    const text = ruleText(rules);
    expect(text).toContain('$5');
    expect(text).toContain('$20M');
    expect(text).toContain('253 sessions');
    expect(text).toContain('200 days');
    expect(text).toContain('85th percentile');
    expect(text).toContain('21 sessions');
    expect(text).toContain('10 basis points');
    expect(text).toMatch(/not a probability/);
    expect(validationNote(rules)).toMatch(/No claim of an edge/);
  });
});

describe('strategy — which card an edition carries', () => {
  it('uses the card when it was built for that edition', () => {
    expect(stockCardFor(feed(), '2026-10-06')).toMatchObject({ kind: 'pick', ticker: 'ADI' });
  });

  it('never shows yesterday\'s pick as today\'s', () => {
    // A feed that silently repeats itself is how a broken price source produces weeks of confident,
    // wrong cards with nothing failing.
    const card = stockCardFor(feed({ decidedFor: '2026-10-05' }), '2026-10-06');
    expect(card.kind).toBe('unavailable');
    expect(card.reason).toContain('last published for 2026-10-05');
    expect(card.reason).toContain('belongs to the session it was made in');
    expect(card.lastPublishedFor).toBe('2026-10-05');
    // And the rule text survives, so the card can still explain itself.
    expect(card.rule).toBe('the rule');
  });

  it('says so when nothing has been published at all', () => {
    expect(stockCardFor(null, '2026-10-06')).toMatchObject({
      kind: 'unavailable',
      reason: 'The stock build has not published anything yet.',
      lastPublishedFor: null,
    });
    expect(stockCardFor(feed({ decidedFor: undefined }), '2026-10-06').reason).toBe('The stock build has not published a dated card.');
  });

  it('a refresh keeps the card today\'s edition already published', () => {
    // A refresh rebuilds today's edition in place with the latest stories. Replacing a real card with
    // "nothing published" would take away something the edition had already said, which is a different
    // thing from declining to invent a card.
    const published = { kind: 'pick', ticker: 'NVDA', name: 'Nvidia', rule: 'v1 rule' };
    expect(stockCardFor(null, '2026-10-06', { existing: published })).toBe(published);
    expect(stockCardFor(feed({ decidedFor: '2026-10-05' }), '2026-10-06', { existing: published })).toBe(published);
    // But a newer card for today wins over whatever was there.
    expect(stockCardFor(feed(), '2026-10-06', { existing: published })).toMatchObject({ ticker: 'ADI' });
    // And an existing card that already says nothing is not preserved in preference to a fresh reason.
    const blank = { kind: 'unavailable', reason: 'old reason' };
    expect(stockCardFor(null, '2026-10-06', { existing: blank })).toMatchObject({
      reason: 'The stock build has not published anything yet.',
    });
  });

  it('passes an unavailable card through unchanged when it is today\'s', () => {
    const published = { kind: 'unavailable', strategyVersion: 2, reason: 'No candidate qualified today. …', rule: 'r' };
    expect(stockCardFor(feed({ block: published }), '2026-10-06')).toBe(published);
  });

  it('does not blank a live card when a later run the same day finds nothing', () => {
    // While the price history is still being filled in, each run publishes "not enough sessions yet".
    // That is true, but it should not take today's card off the screen partway through the morning.
    // `existing` is only ever this edition's own card, so a new day still never inherits yesterday's.
    const onScreen = { kind: 'pick', ticker: 'NVDA', name: 'Nvidia', rule: 'v1 rule' };
    const emptyToday = { kind: 'unavailable', strategyVersion: 2, reason: 'The price history holds 120 sessions…', rule: 'r' };
    expect(stockCardFor(feed({ block: emptyToday }), '2026-10-06', { existing: onScreen })).toBe(onScreen);
    // With nothing already on screen, the honest message is what shows.
    expect(stockCardFor(feed({ block: emptyToday }), '2026-10-06')).toBe(emptyToday);
  });
});

/**
 * The open-position card.
 *
 * Paolo's requirement is a new winner on the card every trading day, and the machinery that delivers it
 * is the retrying schedule in `stock-needed.mjs`. This card covers the minutes before the day's pick
 * lands, and the days — weekends, market holidays — when there was no session to decide on and an open
 * position is simply the correct thing to show.
 */
const PICK = {
  kind: 'pick',
  strategyVersion: 2,
  ticker: 'VCTR',
  name: 'Victory Capital Holdings, Inc.',
  rule: 'the rule',
  date: '2026-10-07',
  publishedAt: '2026-10-07T11:10:46.517Z',
  decisionSession: '2026-10-06',
  plannedEntry: '2026-10-07',
  plannedExit: '2026-11-04',
};

describe('strategy — the open position shown on a day with no pick of its own', () => {
  const stale = (over: Record<string, unknown> = {}) =>
    feed({ decidedFor: '2026-10-07', block: PICK, ...over });

  it('shows the open position when the hold is still running', () => {
    const card = stockCardFor(stale(), '2026-10-08');
    expect(card.kind).toBe('open-position');
    expect(card.date).toBe('2026-10-08');
    expect(card.heldSince).toBe('2026-10-07');
    expect(card.pick).toBe(PICK); // the pick itself, untouched
    expect(card.reason).toMatch(/has not been published yet/);
  });

  it('never dates it as today’s decision', () => {
    const card = stockCardFor(stale(), '2026-10-08');
    // The card's own date is the day it is shown on; the pick keeps the date it was made for. Nothing
    // here restates an earlier decision as fresh work.
    expect(card.date).not.toBe((card.pick as { date: string }).date);
    expect((card.pick as { date: string }).date).toBe('2026-10-07');
  });

  it('goes back to an empty card once the horizon has passed', () => {
    const card = stockCardFor(stale(), '2026-11-05');
    expect(card.kind).toBe('unavailable');
    expect(card.reason).toContain('belongs to the session it was made in');
    expect(card.lastPublishedFor).toBe('2026-10-07');
  });

  it('uses plannedExit as the boundary, to the day', () => {
    expect(stockCardFor(stale(), '2026-11-04').kind).toBe('open-position');
    expect(stockCardFor(stale(), '2026-11-05').kind).toBe('unavailable');
  });

  it('falls back to five calendar weeks when the pick recorded no planned exit', () => {
    const noExit = { ...PICK, plannedExit: null };
    expect(stockCardFor(stale({ block: noExit }), '2026-10-30').kind).toBe('open-position');
    expect(stockCardFor(stale({ block: noExit }), '2026-12-01').kind).toBe('unavailable');
  });

  it('shows the open position beside a screen that ran today and found nothing', () => {
    // Today's answer is real and is not rewritten — but an unexpired hold is still true, so it takes the
    // card and carries today's reason verbatim.
    const empty = { kind: 'unavailable', strategyVersion: 2, rule: 'r', reason: 'No candidate qualified today. The test that removed the most was trend.' };
    const card = stockCardFor(feed({ decidedFor: '2026-10-08', block: empty, recaps: [{ kind: 'recap' }] }), '2026-10-08', {
      existing: { kind: 'open-position', date: '2026-10-08', heldSince: '2026-10-07', pick: PICK },
    });
    // An existing open-position card on the same edition is kept rather than rebuilt.
    expect(card.kind).toBe('open-position');
  });

  it('says nothing at all when there is no pick anywhere and nothing published', () => {
    const card = stockCardFor(null, '2026-10-08');
    expect(card.kind).toBe('unavailable');
    expect(card.reason).toMatch(/has not published anything yet/);
  });

  it('does not invent a position from a pick dated after the edition', () => {
    const card = stockCardFor(stale(), '2026-10-06');
    expect(card.kind).toBe('unavailable');
  });
});
