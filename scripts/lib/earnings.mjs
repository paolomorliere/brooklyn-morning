// Earnings dates from EDGAR, which is the only free source that actually has them.
//
// Two things are true at once here, and the card has to keep them apart:
//
//   * **Past announcements are exact.** An 8-K carrying item 2.02, "Results of Operations and
//     Financial Condition", *is* the earnings release. EDGAR records it with an acceptance
//     timestamp, so "has this company just reported?" is answerable to the minute. This replaces the
//     old heuristic of "did it file something recently", which conflated the release with the 10-Q
//     that follows it — for Analog Devices' third quarter of FY26 both were filed on 2026-08-19.
//   * **Future announcements are not obtainable free, at scale.** Nasdaq's earnings calendar is
//     robots-disallowed. A full-text search of EDGAR over five weeks found 19 8-Ks market-wide that
//     announced a future results date, and none for ADI. So the next date here is an **estimate**,
//     labelled as one, carrying the spread of the company's own recent gaps.
//
// The estimator is the year-ago announcement for the same fiscal quarter plus 364 days, not the mean
// gap. Companies announce on a weekday in a fixed week of the quarter, so a 52-week shift lands on
// the same weekday and the pattern repeats. On ADI's history the mean-gap rule gives 2026-11-18
// while this rule gives 2026-11-24, and late November is where ADI's fourth-quarter release actually
// falls.

import { addDays, daysBetween } from './fundamentals.mjs';

/** Item 2.02 is "Results of Operations and Financial Condition" — the earnings release itself. */
export const EARNINGS_ITEM = '2.02';

/**
 * Other 8-K items that mean something happened. Used only to tell a price move that has a public
 * cause from one that does not; never to score a candidate.
 */
export const MATERIAL_ITEMS = new Set([
  '1.01', // entry into a material agreement
  '1.03', // bankruptcy
  '2.01', // completion of an acquisition or disposition
  '2.03', // material direct financial obligation
  '2.05', // costs of exit or disposal
  '2.06', // material impairment
  '3.01', // listing deficiency
  '4.01', // change of auditor
  '4.02', // non-reliance on previously issued statements
  '5.02', // departure or appointment of directors or officers
  '7.01', // regulation FD disclosure
  '8.01', // other material events
]);

/** A 52-week shift, which keeps the weekday. */
const YEAR_SHIFT = 364;

/** How far from the 364-day target an announcement may sit and still count as the same quarter. */
const SAME_QUARTER_SLACK = 45;

/** Pure: the item numbers in EDGAR's `items` field, which is a comma-separated string. */
export function parseItems(items) {
  const found = String(items ?? '').match(/\d+\.\d+/g);
  return found ? [...new Set(found)] : [];
}

/**
 * Pure: EDGAR's `submissions/CIK##########.json` → one row per filing.
 *
 * The file stores each attribute as a parallel array, which is compact and completely unreadable, so
 * it is transposed once here. `files` holds older filings in separate documents; this reads only
 * what the caller passes in, and the fetcher decides whether the older pages are needed.
 */
export function parseSubmissionIndex(json) {
  const recent = json?.filings?.recent ?? json?.recent ?? json ?? {};
  const forms = recent.form ?? [];
  const out = [];
  for (let i = 0; i < forms.length; i++) {
    const accepted = String(recent.acceptanceDateTime?.[i] ?? '').trim();
    const filed = String(recent.filingDate?.[i] ?? '').trim();
    if (!filed) continue;
    out.push({
      accession: String(recent.accessionNumber?.[i] ?? '').trim(),
      form: String(forms[i] ?? '').trim(),
      filed,
      reportDate: String(recent.reportDate?.[i] ?? '').trim() || null,
      // A filing with no acceptance timestamp is treated as accepted at the end of its filing day,
      // which is the latest it could have been — never earlier than the truth.
      accepted: accepted || `${filed}T23:59:59.000Z`,
      items: parseItems(recent.items?.[i]),
    });
  }
  return out;
}

/** Pure: is this filing the earnings release? */
export function isEarningsRelease(filing) {
  return /^8-K/.test(filing?.form ?? '') && (filing?.items ?? []).includes(EARNINGS_ITEM);
}

/** Pure: does this filing report some other material event? */
export function isMaterialEvent(filing) {
  return /^8-K/.test(filing?.form ?? '') && (filing?.items ?? []).some((i) => MATERIAL_ITEMS.has(i));
}

/**
 * Pure: every earnings release known at `asOf`, oldest first.
 *
 * The date used throughout is the filing date, because that is the day the market saw the numbers;
 * the acceptance timestamp is kept alongside it for the "has it just reported" test, where the hour
 * matters.
 */
export function earningsAnnouncements(filings, { asOf } = {}) {
  const cutoff = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T23:59:59.999Z` : asOf;
  const out = [];
  for (const f of filings ?? []) {
    if (!isEarningsRelease(f)) continue;
    if (cutoff && f.accepted > cutoff) continue;
    out.push({ date: f.filed, accepted: f.accepted, accession: f.accession, reportDate: f.reportDate });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.accepted < b.accepted ? -1 : 1));
  // A company occasionally files two 8-Ks with item 2.02 on the same day — the release and a
  // supplementary exhibit. One announcement per day, or every gap calculation sees a zero.
  return out.filter((a, i) => i === 0 || a.date !== out[i - 1].date);
}

/** Pure: the gaps in days between consecutive announcements, oldest first. */
export function announcementGaps(announcements) {
  const gaps = [];
  for (let i = 1; i < announcements.length; i++) gaps.push(daysBetween(announcements[i - 1].date, announcements[i].date));
  return gaps.filter((g) => Number.isFinite(g) && g > 0);
}

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pure: the announcement whose date is nearest `target`, within `slack` days, or null. */
function nearest(announcements, target, slack) {
  let best = null;
  let bestGap = Infinity;
  for (const a of announcements) {
    const gap = Math.abs(daysBetween(a.date, target));
    if (!Number.isFinite(gap) || gap > slack) continue;
    if (gap < bestGap) {
      best = a;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Pure: when this company is likely to report next.
 *
 * Returns `{ date, basis, spreadDays, confirmed: false, gaps }` or null. `confirmed` is always false
 * and the field exists so the card can never render an estimate as a fact by omission — if a free
 * confirmed source ever appears, it sets this to true and nothing else changes.
 */
export function estimateNextEarnings(announcements, { asOf, maxGaps = 8 } = {}) {
  const anns = (announcements ?? []).filter((a) => !asOf || a.date <= asOf);
  if (anns.length === 0) return null;
  const last = anns[anns.length - 1];
  const gaps = announcementGaps(anns).slice(-maxGaps);
  // Half the observed range, so "±1 week" on a company whose gaps ran 84 to 97 days.
  const spreadDays = gaps.length >= 2 ? Math.max(3, Math.round((Math.max(...gaps) - Math.min(...gaps)) / 2)) : 14;

  // The year-ago counterpart of the *last* announcement, then the one that followed it: that is the
  // same fiscal quarter as the announcement we are waiting for.
  const yearAgoSame = nearest(anns.slice(0, -1), addDays(last.date, -YEAR_SHIFT), SAME_QUARTER_SLACK);
  if (yearAgoSame) {
    const i = anns.indexOf(yearAgoSame);
    const yearAgoNext = anns[i + 1];
    if (yearAgoNext && yearAgoNext.date > yearAgoSame.date) {
      const date = addDays(yearAgoNext.date, YEAR_SHIFT);
      if (date && date > last.date) {
        return {
          date,
          basis: `the same fiscal quarter's announcement a year earlier (${yearAgoNext.date}) plus 364 days`,
          spreadDays,
          gaps,
          confirmed: false,
        };
      }
    }
  }

  const gap = median(gaps);
  if (gap == null) return null;
  const date = addDays(last.date, Math.round(gap));
  if (!date) return null;
  return {
    date,
    basis: `the median gap between the last ${gaps.length} announcements (${Math.round(gap)} days) after ${last.date}`,
    spreadDays,
    gaps,
    confirmed: false,
  };
}

/** Pure: the announcements that fall in `[from, to]` inclusive. */
export function announcedBetween(announcements, from, to) {
  return (announcements ?? []).filter((a) => a.date >= from && a.date <= to);
}

/** Pure: the material (non-earnings) events in `[from, to]`, for the "was there news" note. */
export function materialEventsBetween(filings, from, to) {
  return (filings ?? [])
    .filter((f) => isMaterialEvent(f) && f.filed >= from && f.filed <= to)
    .map((f) => ({ date: f.filed, items: f.items, accession: f.accession }));
}

/**
 * Pure: does a results announcement fall inside the holding window?
 *
 * A **confirmed** date inside the window makes the candidate ineligible — a one-month hold through
 * an earnings release is a bet on the release, not on the thesis. An **estimated** date inside the
 * window, which is all this system can currently have, is a risk printed on the card instead,
 * because excluding on a guess would silently remove a quarter of the market every quarter.
 *
 * The estimate's own spread is honoured: a date eight days outside a window, with a ±7-day spread,
 * still counts as a risk worth stating.
 */
export function earningsRiskInWindow(estimate, { entry, exit }) {
  if (!estimate?.date) return { inWindow: false, nearWindow: false, estimate: null };
  const inWindow = estimate.date >= entry && estimate.date <= exit;
  const spread = estimate.spreadDays ?? 0;
  const nearWindow =
    !inWindow && estimate.date >= addDays(entry, -spread) && estimate.date <= addDays(exit, spread);
  return { inWindow, nearWindow, confirmed: estimate.confirmed === true, estimate };
}
