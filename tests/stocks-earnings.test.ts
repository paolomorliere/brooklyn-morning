import { describe, expect, it } from 'vitest';
import {
  announcedBetween,
  announcementGaps,
  earningsAnnouncements,
  earningsRiskInWindow,
  estimateNextEarnings,
  isEarningsRelease,
  isMaterialEvent,
  materialEventsBetween,
  parseItems,
  parseSubmissionIndex,
} from '../scripts/lib/earnings.mjs';
import type { IndexedFiling } from '../scripts/lib/earnings.mjs';

const filing = (over: Partial<IndexedFiling>): IndexedFiling => ({
  accession: '0000000000-26-000001',
  form: '8-K',
  filed: '2026-08-19',
  reportDate: '2026-08-19',
  accepted: '2026-08-19T20:31:00.000Z',
  items: ['2.02', '9.01'],
  ...over,
});

/**
 * Analog Devices' own release history, which is what the estimator was checked against. The gaps run
 * 85 to 97 days, so a mean-gap rule and the year-ago rule disagree by six days — and late November is
 * where ADI's fourth-quarter release actually falls.
 */
const ADI_DATES = [
  '2024-05-22', '2024-08-21', '2024-11-26',
  '2025-02-19', '2025-05-22', '2025-08-20', '2025-11-25',
  '2026-02-18', '2026-05-20', '2026-08-19',
];
const ADI = ADI_DATES.map((d, i) => filing({ filed: d, reportDate: d, accepted: `${d}T20:31:00.000Z`, accession: `adi-${i}` }));

describe('earnings — reading EDGAR', () => {
  it('pulls the item numbers out of the comma-separated field', () => {
    expect(parseItems('2.02,9.01')).toEqual(['2.02', '9.01']);
    expect(parseItems('Item 5.02')).toEqual(['5.02']);
    expect(parseItems('')).toEqual([]);
    expect(parseItems(null)).toEqual([]);
  });

  it('transposes the submission index\'s parallel arrays', () => {
    const rows = parseSubmissionIndex({
      filings: {
        recent: {
          accessionNumber: ['a-1', 'a-2'],
          form: ['8-K', '10-Q'],
          filingDate: ['2026-08-19', '2026-08-19'],
          reportDate: ['2026-08-19', '2026-08-01'],
          acceptanceDateTime: ['2026-08-19T20:31:00.000Z', ''],
          items: ['2.02,9.01', ''],
        },
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ form: '8-K', items: ['2.02', '9.01'] });
    // No acceptance timestamp means the end of the filing day — the latest it could have been.
    expect(rows[1].accepted).toBe('2026-08-19T23:59:59.000Z');
  });

  it('identifies the earnings release and nothing else', () => {
    expect(isEarningsRelease(filing({}))).toBe(true);
    expect(isEarningsRelease(filing({ form: '8-K/A' }))).toBe(true);
    expect(isEarningsRelease(filing({ items: ['7.01'] }))).toBe(false);
    // The 10-Q filed the same day as the release is the financial filing, not the announcement. The
    // old "filed something recently" rule could not tell them apart.
    expect(isEarningsRelease(filing({ form: '10-Q', items: [] }))).toBe(false);
  });

  it('identifies other material events separately', () => {
    expect(isMaterialEvent(filing({ items: ['5.02'] }))).toBe(true);
    expect(isMaterialEvent(filing({ items: ['9.01'] }))).toBe(false);
    expect(isMaterialEvent(filing({ form: '10-Q', items: ['2.01'] }))).toBe(false);
  });

  it('lists the announcements oldest first and never one accepted after the cutoff', () => {
    const anns = earningsAnnouncements(ADI, { asOf: '2026-10-02' });
    expect(anns.map((a) => a.date)).toEqual(ADI_DATES);
    expect(earningsAnnouncements(ADI, { asOf: '2026-05-21' }).at(-1)!.date).toBe('2026-05-20');
  });

  it('counts a day with two item 2.02 filings once, so no gap is zero', () => {
    const doubled = [...ADI, filing({ filed: '2026-08-19', accession: 'extra', accepted: '2026-08-19T21:00:00.000Z' })];
    const anns = earningsAnnouncements(doubled, { asOf: '2026-10-02' });
    expect(anns).toHaveLength(ADI_DATES.length);
    expect(announcementGaps(anns).every((g) => g > 0)).toBe(true);
  });
});

describe('earnings — the next date is an estimate', () => {
  it('uses the same fiscal quarter a year earlier plus 364 days', () => {
    const anns = earningsAnnouncements(ADI, { asOf: '2026-10-02' });
    const est = estimateNextEarnings(anns, { asOf: '2026-10-02' })!;
    expect(est.date).toBe('2026-11-24');
    expect(est.basis).toContain('2025-11-25');
    expect(est.confirmed).toBe(false);
  });

  it('reports the spread from the company\'s own recent gaps, not a fixed guess', () => {
    const anns = earningsAnnouncements(ADI, { asOf: '2026-10-02' });
    const est = estimateNextEarnings(anns, { asOf: '2026-10-02' })!;
    expect(Math.min(...est.gaps)).toBe(85);
    expect(Math.max(...est.gaps)).toBe(97);
    expect(est.spreadDays).toBe(6); // half the observed range — about a week either way
  });

  it('differs from the mean-gap rule, which is why the mean-gap rule is not used', () => {
    const anns = earningsAnnouncements(ADI, { asOf: '2026-10-02' });
    // The median of ADI's last eight gaps is 91 days, which would put the release on 18 November.
    expect(estimateNextEarnings(anns, { asOf: '2026-10-02' })!.date).not.toBe('2026-11-18');
  });

  it('falls back to the median gap when there is no year-ago counterpart', () => {
    const short = earningsAnnouncements(ADI.slice(-3), { asOf: '2026-10-02' });
    const est = estimateNextEarnings(short, { asOf: '2026-10-02' })!;
    expect(est.basis).toMatch(/median gap/);
    expect(est.date).toBe('2026-11-18'); // 2026-08-19 plus the 91-day median
  });

  it('has nothing to say when the company has never announced', () => {
    expect(estimateNextEarnings([], { asOf: '2026-10-02' })).toBeNull();
    expect(estimateNextEarnings(null, { asOf: '2026-10-02' })).toBeNull();
  });

  it('estimates from what was known at the cutoff, not from later filings', () => {
    const anns = earningsAnnouncements(ADI, { asOf: '2026-03-01' });
    const est = estimateNextEarnings(anns, { asOf: '2026-03-01' })!;
    // Last release 2026-02-18; its year-ago counterpart is 2025-02-19, followed by 2025-05-22.
    expect(est.date).toBe('2026-05-21');
  });
});

describe('earnings — the holding window', () => {
  const estimate = { date: '2026-11-24', basis: 'x', spreadDays: 6, gaps: [], confirmed: false as const };

  it('clears a window that ends well before the estimate', () => {
    expect(earningsRiskInWindow(estimate, { entry: '2026-10-06', exit: '2026-11-04' })).toMatchObject({
      inWindow: false,
      nearWindow: false,
    });
  });

  it('flags an estimate that lands inside the window', () => {
    expect(earningsRiskInWindow(estimate, { entry: '2026-11-02', exit: '2026-12-01' }).inWindow).toBe(true);
  });

  it('flags an estimate that lands just outside, within its own spread', () => {
    const r = earningsRiskInWindow(estimate, { entry: '2026-10-20', exit: '2026-11-20' });
    expect(r.inWindow).toBe(false);
    expect(r.nearWindow).toBe(true);
  });

  it('says nothing at all when there is no estimate', () => {
    expect(earningsRiskInWindow(null, { entry: '2026-10-06', exit: '2026-11-04' })).toEqual({
      inWindow: false,
      nearWindow: false,
      estimate: null,
    });
  });
});

describe('earnings — recent activity', () => {
  it('finds the announcements in a span', () => {
    const anns = earningsAnnouncements(ADI, { asOf: '2026-10-02' });
    expect(announcedBetween(anns, '2026-08-17', '2026-08-21').map((a) => a.date)).toEqual(['2026-08-19']);
    expect(announcedBetween(anns, '2026-09-01', '2026-10-02')).toEqual([]);
  });

  it('separates material events from earnings releases', () => {
    const filings = [filing({ filed: '2026-09-15', items: ['5.02'] }), filing({ filed: '2026-09-20', items: ['2.02'] })];
    const events = materialEventsBetween(filings, '2026-09-01', '2026-09-30');
    expect(events.map((e) => e.date)).toEqual(['2026-09-15']);
  });
});
