// Point-in-time fundamentals from the SEC's Financial Statement Data Sets.
//
// The whole purpose of this module is to answer "what did the filings say *on day T*", not "what do
// they say now". Those differ by a lot: the measured period-end→filed lag across a quarter of
// filings is 39 days at the median, 69 at the 90th percentile, 304 at the 99th and 1,172 at worst.
// Ranking a 2026-03 pick on a figure first published in 2026-06 is not a strategy, it is a leak.
//
// Four rules do the real work, each learned from a filing that breaks the naive reading:
//
//   * `qtrs` is a duration, not a quarter number. 0 = instant, 1 = one quarter, n = n quarters
//     year-to-date. It is not uniform between filers: Apple's Q2 10-Q carries both qtrs=1 and
//     qtrs=2, Microsoft's Q3 carries qtrs=1 and qtrs=3, and Nvidia's Q1 carries only qtrs=1.
//     Summing without checking the duration double-counts.
//   * `segments` and `coreg` must both be empty, or a business segment's revenue gets ranked
//     against another company's consolidated revenue.
//   * `accepted` is the only honest timestamp. `filed` is a date; `accepted` is the moment EDGAR
//     took the document, and a filing accepted at 18:30 was not knowable at that day's close.
//   * tags are not synonyms. Walmart reports `Revenues` of $177,751M and
//     `RevenueFromContractWithCustomerExcludingAssessedTax` of $175,684M in the same filing. A
//     fixed preference order picks one, every derived figure for that company uses the same one, and
//     the tag is recorded on the pick so the number can always be traced back.

/** The only forms we take financial facts from. An 8-K's exhibit figures are not in these datasets. */
export const FINANCIAL_FORMS = new Set(['10-K', '10-Q', '10-K/A', '10-Q/A', '10-KT', '10-QT']);

/**
 * How far apart two consecutive fiscal quarter-ends may sit.
 *
 * 13 weeks is 91 days; a 52/53-week filer has one 14-week quarter, which is 98. Calendar-quarter
 * filers run 89–92. Anything outside this range is a fiscal-year change or a missing quarter, and
 * the series is reported as a gap rather than summed across the hole.
 */
const MIN_Q_GAP = 80;
const MAX_Q_GAP = 102;

/** A year apart, measured between two period-end dates four quarters apart. */
const MIN_Y_GAP = 350;
const MAX_Y_GAP = 380;

/**
 * The span covered by four consecutive quarter-ends. It is three gaps, not four — the oldest and
 * newest period ends of a trailing year sit about 273 days apart, which catches a series that
 * silently skipped a quarter without rejecting a 53-week fiscal year.
 */
const MIN_TTM_SPAN = 3 * MIN_Q_GAP;
const MAX_TTM_SPAN = 3 * MAX_Q_GAP;

/** Preference orders. First tag that yields a usable series wins, and that choice is recorded. */
export const TAGS = {
  // `Revenues` is the US-GAAP total, so it is preferred where a filer reports it; the ASC 606
  // contract tags are the common fallback. Growth is always computed within one tag, never across.
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RevenuesNetOfInterestExpense',
  ],
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  operatingCashFlow: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
    'PaymentsForCapitalImprovements',
  ],
  assets: ['Assets'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  // Two different concepts that look alike. `LongTermDebt` is the US-GAAP total *including* current
  // maturities; `LongTermDebtNoncurrent` excludes them. Adding the current portion to the first counts
  // it twice, so they are kept in separate lists and the caller picks one path or the other.
  longTermDebtTotal: ['LongTermDebt'],
  longTermDebtNoncurrent: ['LongTermDebtNoncurrent'],
  longTermDebtCurrent: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
  shortTermDebt: ['ShortTermBorrowings', 'OtherShortTermBorrowings', 'CommercialPaper'],
  // Counted in shares, not dollars, so every caller passes `uom: 'shares'` for these.
  shares: ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'],
};

/** Every tag this module ever asks for, so the 60 MB num.txt can be filtered in one pass. */
export function allTags() {
  return new Set(Object.values(TAGS).flat());
}

/* ------------------------------------------------------------------ dates */

/** `20260801` → `2026-08-01`. Returns null for anything that is not eight digits. */
export function ymdToIso(ymd) {
  const s = String(ymd ?? '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * `2026-08-19 18:30:00.0` → `2026-08-19T18:30:00.000Z`.
 *
 * The SEC publishes `accepted` in US Eastern time without a zone marker. Treating it as UTC shifts
 * it four or five hours later, which is the safe direction: a filing is never treated as knowable
 * earlier than it was. The offset is applied explicitly so the choice is visible, not accidental.
 */
export function acceptedToIso(accepted) {
  const s = String(accepted ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) {
    const iso = ymdToIso(s.replace(/-/g, ''));
    return iso ? `${iso}T23:59:59.000Z` : null;
  }
  const [, y, mo, d, h, mi, se] = m;
  // America/New_York is UTC−4 in EDT and UTC−5 in EST. EDGAR accepts filings between 06:00 and
  // 22:00 ET, so using the EDT offset year-round moves a winter filing one hour later — later is
  // the conservative direction and never makes a figure available sooner than it truly was.
  const t = Date.UTC(+y, +mo - 1, +d, +h + 4, +mi, +se);
  return new Date(t).toISOString();
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. Positive when `b` is later. */
export function daysBetween(a, b) {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return NaN;
  return Math.round((pb - pa) / 86_400_000);
}

/** `YYYY-MM-DD` plus n days, in UTC so no local zone can shift it. */
export function addDays(date, n) {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ parsing */

/**
 * Walk a tab-delimited SEC dataset file, calling `cb` with a header-keyed object per row.
 *
 * Streaming rather than returning an array: `num.txt` is tens of millions of rows a quarter and
 * materialising it is the difference between a build that runs and one that is killed.
 */
export function forEachTsvRow(text, cb) {
  const lines = text.split('\n');
  if (lines.length === 0) return 0;
  const header = lines[0].replace(/\r$/, '').split('\t');
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (!line) continue;
    const f = line.split('\t');
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = f[j] ?? '';
    cb(row);
    n++;
  }
  return n;
}

/** The whole file as rows. Fine for `sub.txt` (tens of thousands) and for tests. */
export function parseTsvRows(text) {
  const out = [];
  forEachTsvRow(text, (row) => out.push(row));
  return out;
}

/**
 * `sub.txt` → submissions we care about, keyed by accession number and grouped by CIK.
 *
 * `prevrpt` is kept rather than dropped here. The SEC sets it when a filing was amended before the
 * dataset's cutoff, so dropping those rows outright would hide what was actually on file on an
 * earlier `T` and reintroduce the look-ahead this module exists to prevent. Selection below prefers
 * an unamended row whenever one is already knowable, which is what "never use a superseded figure"
 * means in practice.
 */
export function digestSubmissions(text, { forms = FINANCIAL_FORMS, ciks = null } = {}) {
  const byAdsh = new Map();
  const byCik = new Map();
  forEachTsvRow(text, (r) => {
    const form = (r.form ?? '').trim();
    if (forms && !forms.has(form)) return;
    const cik = String(Number(r.cik ?? NaN));
    if (cik === 'NaN') return;
    if (ciks && !ciks.has(cik)) return;
    const accepted = acceptedToIso(r.accepted);
    if (!accepted) return;
    const sub = {
      adsh: (r.adsh ?? '').trim(),
      cik,
      name: (r.name ?? '').trim(),
      sic: (r.sic ?? '').trim(),
      form,
      period: ymdToIso(r.period),
      fy: (r.fy ?? '').trim(),
      fp: (r.fp ?? '').trim(),
      filed: ymdToIso(r.filed),
      accepted,
      prevrpt: String(r.prevrpt ?? '').trim() === '1',
    };
    if (!sub.adsh) return;
    byAdsh.set(sub.adsh, sub);
    const list = byCik.get(cik);
    if (list) list.push(sub);
    else byCik.set(cik, [sub]);
  });
  for (const list of byCik.values()) list.sort((a, b) => (a.accepted < b.accepted ? -1 : a.accepted > b.accepted ? 1 : 0));
  return { byAdsh, byCik };
}

/** Consolidated means the registrant as a whole: no segment breakdown, no co-registrant. */
export function isConsolidated(row) {
  return (row.segments ?? '') === '' && (row.coreg ?? '') === '';
}

/**
 * `num.txt` → facts, joined to their submission.
 *
 * Everything that cannot be used is dropped at the door — unknown accession, non-consolidated,
 * unwanted tag, unparseable value — so no later stage has to re-check.
 */
export function collectFacts(text, byAdsh, { tags = null } = {}) {
  const out = [];
  forEachTsvRow(text, (r) => {
    const sub = byAdsh.get((r.adsh ?? '').trim());
    if (!sub) return;
    const tag = (r.tag ?? '').trim();
    if (tags && !tags.has(tag)) return;
    if (!isConsolidated(r)) return;
    const value = Number(r.value);
    if (!Number.isFinite(value)) return;
    const ddate = ymdToIso(r.ddate);
    if (!ddate) return;
    const qtrs = Number(r.qtrs);
    if (!Number.isInteger(qtrs)) return;
    out.push({
      cik: sub.cik,
      adsh: sub.adsh,
      tag,
      version: (r.version ?? '').trim(),
      ddate,
      qtrs,
      uom: (r.uom ?? '').trim(),
      value,
      accepted: sub.accepted,
      filed: sub.filed,
      form: sub.form,
      period: sub.period,
      fy: sub.fy,
      fp: sub.fp,
      prevrpt: sub.prevrpt,
    });
  });
  return out;
}

/* ------------------------------------------------------------------ point in time */

/**
 * Pick the one fact that was the best available statement of a figure at `asOf`.
 *
 * Order: nothing accepted after `asOf`; then an unamended filing ahead of a superseded one; then
 * the latest acceptance; then the greatest accession number, purely so the result is deterministic
 * when a filer accepts two documents in the same second.
 */
function bestKnownAt(candidates, asOf) {
  let best = null;
  for (const f of candidates) {
    if (f.accepted > asOf) continue;
    if (!best) {
      best = f;
      continue;
    }
    const a = [best.prevrpt ? 0 : 1, best.accepted, best.adsh];
    const b = [f.prevrpt ? 0 : 1, f.accepted, f.adsh];
    if (b[0] > a[0] || (b[0] === a[0] && (b[1] > a[1] || (b[1] === a[1] && b[2] > a[2])))) best = f;
  }
  return best;
}

/** Normalise `asOf` — a date means the end of that day, since filings are timestamped. */
function asOfIso(asOf) {
  const s = String(asOf ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59.999Z` : s;
}

/**
 * Point-in-time facts for one tag and one duration, keyed by period-end date.
 *
 * Returns a Map so the caller can walk the period ends in order; each entry keeps the provenance
 * (`accepted`, `adsh`, `form`) because the card has to show where a number came from.
 */
export function seriesFor(facts, { tag, qtrs, uom = 'USD', asOf }) {
  const cutoff = asOfIso(asOf);
  const groups = new Map();
  for (const f of facts) {
    if (f.tag !== tag) continue;
    if (f.qtrs !== qtrs) continue;
    if (uom && f.uom !== uom) continue;
    const list = groups.get(f.ddate);
    if (list) list.push(f);
    else groups.set(f.ddate, [f]);
  }
  const out = new Map();
  for (const [ddate, list] of groups) {
    const best = bestKnownAt(list, cutoff);
    if (!best) continue;
    out.set(ddate, {
      ddate,
      value: best.value,
      tag,
      qtrs,
      uom: best.uom,
      accepted: best.accepted,
      filed: best.filed,
      adsh: best.adsh,
      form: best.form,
      fy: best.fy,
      fp: best.fp,
      derived: false,
    });
  }
  return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** The period end exactly one quarter before `ddate` in `ends`, or null if the series has a hole. */
function previousEnd(ends, ddate) {
  let best = null;
  for (const d of ends) {
    if (d >= ddate) continue;
    const gap = daysBetween(d, ddate);
    if (gap < MIN_Q_GAP || gap > MAX_Q_GAP) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/**
 * A single-quarter series for a flow tag, with the quarters nobody reports filled in.
 *
 * Most filers publish the standalone quarter (`qtrs=1`) every time, but a 10-K almost never does:
 * it publishes the year (`qtrs=4`), leaving the fourth quarter implied. The same is true of filers
 * that only ever report year-to-date. Both are recovered by the same subtraction —
 * `YTD(n) at this period end − YTD(n−1) at the previous period end` — which is only applied when
 * the two period ends really are one quarter apart. A derived quarter is flagged `derived: true`
 * and carries the later of the two acceptance timestamps, because it was not knowable before both
 * halves existed.
 */
export function quarterlySeries(facts, { tag, uom = 'USD', asOf }) {
  const ytd = [1, 2, 3, 4].map((q) => seriesFor(facts, { tag, qtrs: q, uom, asOf }));
  const out = new Map(ytd[0]);
  for (let n = 2; n <= 4; n++) {
    const cur = ytd[n - 1];
    const prev = ytd[n - 2];
    const prevEnds = [...prev.keys()];
    for (const [ddate, fact] of cur) {
      if (out.has(ddate)) continue;
      const pd = previousEnd(prevEnds, ddate);
      if (!pd) continue;
      const base = prev.get(pd);
      // No fiscal-year check here, deliberately. The durations already pin it: `n` quarters ending on
      // this period end, less `n − 1` quarters ending one quarter earlier, is the quarter in between,
      // in the same fiscal year by construction. An explicit `fy` comparison looked like a safety net
      // and was in fact a bug — `companyfacts` labels a fact with the fiscal year of the filing it
      // appeared in, not of the period it covers, so Analog Devices' third quarter of FY2025 is
      // labelled 2026 where it appears as a comparative. That mismatch silently blocked the fourth
      // quarter of every such year, and with it every trailing-year figure.
      out.set(ddate, {
        ddate,
        value: fact.value - base.value,
        tag,
        qtrs: 1,
        uom: fact.uom,
        accepted: fact.accepted > base.accepted ? fact.accepted : base.accepted,
        filed: fact.filed,
        adsh: fact.adsh,
        form: fact.form,
        fy: fact.fy,
        fp: fact.fp,
        derived: true,
        derivedFrom: { ytd: fact.adsh, base: base.adsh, qtrs: n },
      });
    }
  }
  return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** Instant figures — assets, debt, equity, share count. `qtrs` is 0 by definition. */
export function instantSeries(facts, { tag, uom = 'USD', asOf }) {
  return seriesFor(facts, { tag, qtrs: 0, uom, asOf });
}

/* ------------------------------------------------------------------ derived figures */

/**
 * Trailing twelve months ending at `ddate`: exactly four consecutive single quarters.
 *
 * Never a mixed sum. If any of the four is missing, or two of them are not one quarter apart, the
 * answer is null and the candidate loses the signal — it does not get a three-quarter total
 * presented as a year.
 */
export function ttmAt(series, ddate) {
  const ends = [...series.keys()].filter((d) => d <= ddate).sort();
  if (ends.length < 4) return null;
  const chosen = [];
  let cursor = ddate;
  if (!series.has(cursor)) return null;
  for (let i = 0; i < 4; i++) {
    const fact = series.get(cursor);
    if (!fact) return null;
    chosen.push(fact);
    if (i === 3) break;
    const pd = previousEnd(ends, cursor);
    if (!pd) return null;
    cursor = pd;
  }
  const span = daysBetween(chosen[3].ddate, chosen[0].ddate);
  if (span < MIN_TTM_SPAN || span > MAX_TTM_SPAN) return null;
  return {
    value: chosen.reduce((a, f) => a + f.value, 0),
    tag: chosen[0].tag,
    /** The oldest of the four period ends. The year covered begins the day after its quarter began. */
    firstQuarterEnd: chosen[3].ddate,
    end: chosen[0].ddate,
    quarters: chosen.map((f) => f.ddate),
    derived: chosen.some((f) => f.derived),
    accepted: chosen.reduce((a, f) => (f.accepted > a ? f.accepted : a), chosen[0].accepted),
    filed: chosen[0].filed,
    adsh: chosen[0].adsh,
    form: chosen[0].form,
  };
}

/** The period end four quarters before `ddate` — the same fiscal quarter a year earlier. */
export function yearAgoEnd(series, ddate) {
  const ends = [...series.keys()].filter((d) => d <= ddate).sort();
  let cursor = ddate;
  for (let i = 0; i < 4; i++) {
    const pd = previousEnd(ends, cursor);
    if (!pd) return null;
    cursor = pd;
  }
  const span = daysBetween(cursor, ddate);
  if (span < MIN_Y_GAP || span > MAX_Y_GAP) return null;
  return cursor;
}

/**
 * The period end exactly one quarter before `ddate`, or null when the series has a hole there.
 *
 * Exported because the quarter-on-quarter signals need it and they must use the same definition of
 * "one quarter earlier" that the TTM assembly uses — two definitions would eventually disagree.
 */
export function previousQuarterEnd(series, ddate) {
  return previousEnd([...series.keys()], ddate);
}

/** The most recent period end in the series at or before `ddate`. */
export function latestEnd(series, ddate = '9999-12-31') {
  let best = null;
  for (const d of series.keys()) if (d <= ddate && (!best || d > best)) best = d;
  return best;
}

/**
 * The first tag in a preference order that actually yields what the caller needs.
 *
 * `quarters` is how many consecutive single quarters must be present ending at the latest period
 * end — 8 for a year-on-year TTM comparison, 5 for a quarterly year-on-year. The tag that wins is
 * returned with the series, and callers record it on the pick.
 */
export function chooseQuarterlyTag(facts, preference, { asOf, uom = 'USD', quarters = 8, maxAgeDays = 200 } = {}) {
  const cutoffDate = String(asOf ?? '').slice(0, 10);
  for (const tag of preference) {
    const series = quarterlySeries(facts, { tag, uom, asOf });
    const end = latestEnd(series);
    if (!end) continue;
    // A tag the company stopped using is not a usable series, however long and unbroken it is.
    // Analog Devices reported `Revenues` until its 2018 fiscal year and ASC 606 contract revenue
    // afterwards; without this check the preference order picked the 2018 series and every figure on
    // the card would have described a company eight years out of date.
    if (maxAgeDays != null && daysBetween(end, cutoffDate) > maxAgeDays) continue;
    let cursor = end;
    const ends = [...series.keys()];
    let ok = true;
    for (let i = 1; i < quarters; i++) {
      const pd = previousEnd(ends, cursor);
      if (!pd) {
        ok = false;
        break;
      }
      cursor = pd;
    }
    if (ok) return { tag, series, end };
  }
  return null;
}

/** The same, for an instant tag: the first preference that has a value at or before `asOf`. */
export function chooseInstantTag(facts, preference, { asOf, uom = 'USD', maxAgeDays = 200 } = {}) {
  const cutoffDate = String(asOf ?? '').slice(0, 10);
  for (const tag of preference) {
    const series = instantSeries(facts, { tag, uom, asOf });
    const end = latestEnd(series);
    if (!end) continue;
    if (maxAgeDays != null && daysBetween(end, cutoffDate) > maxAgeDays) continue;
    return { tag, series, end, fact: series.get(end) };
  }
  return null;
}

/* ------------------------------------------------------------------ sectors */

/**
 * The four groups the signal set is defined over, chosen because tag coverage differs so sharply
 * between them. Measured on 2026Q2 consolidated facts: `GrossProfit` is present for 53.5% of
 * operating filers and 4.3% of finance, insurance and REIT filers, so gross profitability is simply
 * not a computable signal for a quarter of the market. JPMorgan's trailing operating cash flow is
 * −$211.8bn — a trading-book artefact, not a quality signal. Those companies are ranked on the
 * signals that apply to them, never given a neutral score on the ones that do not.
 */
export function sectorGroupOf(sic) {
  const n = Number(sic);
  if (!Number.isFinite(n) || n <= 0) return 'operating';
  if (n >= 6000 && n <= 6999) return 'finance';
  if (n >= 4900 && n <= 4999) return 'utilities';
  if ((n >= 1200 && n <= 1399) || (n >= 2900 && n <= 2999)) return 'energy';
  return 'operating';
}

/** The SEC's own SIC divisions, used for the "at most three open positions per division" cap. */
export function sicDivision(sic) {
  const n = Number(sic);
  if (!Number.isFinite(n) || n <= 0) return 'Unclassified';
  if (n < 1000) return 'Agriculture, Forestry and Fishing';
  if (n < 1500) return 'Mining';
  if (n < 1800) return 'Construction';
  if (n < 2000) return 'Unclassified';
  if (n < 4000) return 'Manufacturing';
  if (n < 5000) return 'Transportation, Communications and Utilities';
  if (n < 5200) return 'Wholesale Trade';
  if (n < 6000) return 'Retail Trade';
  if (n < 6800) return 'Finance, Insurance and Real Estate';
  if (n < 7000) return 'Unclassified';
  if (n < 9000) return 'Services';
  return 'Public Administration';
}

/** The two-digit SIC major group — the peer set valuation is compared within. */
export function sicMajorGroup(sic) {
  const s = String(sic ?? '').trim();
  if (!/^\d{3,4}$/.test(s)) return null;
  return s.padStart(4, '0').slice(0, 2);
}

/**
 * The most recent 10-Q or 10-K on file at `asOf`, or null.
 *
 * Stage A needs two separate things from this: that a filing exists at all, and that its period end
 * is recent. A company whose last filing covers a period 300 days old is not analysable on current
 * fundamentals, however punctually it filed.
 */
export function latestFinancialFiling(subs, asOf) {
  const cutoff = asOfIso(asOf);
  let best = null;
  for (const s of subs ?? []) {
    if (!FINANCIAL_FORMS.has(s.form)) continue;
    if (s.accepted > cutoff) continue;
    if (!best || s.accepted > best.accepted) best = s;
  }
  return best;
}
