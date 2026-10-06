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

  it('passes an unavailable card through unchanged when it is today\'s', () => {
    const published = { kind: 'unavailable', strategyVersion: 2, reason: 'No candidate qualified today. …', rule: 'r' };
    expect(stockCardFor(feed({ block: published }), '2026-10-06')).toBe(published);
  });
});
