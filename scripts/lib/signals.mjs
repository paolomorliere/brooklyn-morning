// The price side of the selection: total return, trend, volatility, and the z-scores that turn a
// mixed bag of ratios into one comparable number.
//
// Two things here are easy to get wrong and expensive when you do.
//
// **Returns must be total returns.** Grouped daily bars are split-adjusted but not dividend-adjusted,
// so a stock that paid 3% in dividends over a year shows a 3% smaller price return than an investor
// actually earned. Comparing an unadjusted stock return against a dividend-paying benchmark silently
// penalises income stocks and flatters the benchmark. Every return in this module adds back the
// dividends whose ex-date falls inside the window, and the dividends themselves are split-adjusted
// first, because a $1 dividend paid before a 4-for-1 split is $0.25 in today's share terms.
//
// **Z-scores are comparisons, not forecasts.** A z-score says where a company sits among the
// candidates that were eligible on the same day. It is not a probability, and the composite is
// explicitly a rank. Inputs are winsorised before scoring because one filer with a 400× cash
// conversion ratio would otherwise compress every other candidate to the same number — the trimming
// is recorded on the pick rather than applied quietly.

/** Trading days in a year, used only to annualise a volatility figure for display. */
export const SESSIONS_PER_YEAR = 252;

/** Default winsorisation, applied symmetrically before any z-score. */
export const WINSOR_P = 0.02;

/* ------------------------------------------------------------------ small statistics */

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The p-quantile by linear interpolation, the same convention Excel's PERCENTILE.INC uses. */
export function quantile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Sample standard deviation (n−1), which is the right one for a sample of candidates. */
export function stdev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

export function clip(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/** Pull the extremes in to the p and 1−p quantiles, so one outlier cannot flatten the rest. */
export function winsorize(values, p = WINSOR_P) {
  if (values.length < 5 || p <= 0) return { values: [...values], lo: null, hi: null, trimmed: 0 };
  const lo = quantile(values, p);
  const hi = quantile(values, 1 - p);
  let trimmed = 0;
  const out = values.map((v) => {
    if (v < lo) {
      trimmed++;
      return lo;
    }
    if (v > hi) {
      trimmed++;
      return hi;
    }
    return v;
  });
  return { values: out, lo, hi, trimmed };
}

/**
 * Z-scores for a list of finite numbers, winsorised first.
 *
 * When every candidate has the same value the spread is zero and there is nothing to compare, so
 * every score is 0 — which here means "no information", and the signal contributes nothing rather
 * than dividing by zero.
 */
export function zScores(values, { p = WINSOR_P } = {}) {
  const w = winsorize(values, p);
  const m = mean(w.values);
  const sd = stdev(w.values);
  if (m == null) return { z: [], mean: null, sd: null, trimmed: 0 };
  if (!sd) return { z: w.values.map(() => 0), mean: m, sd: 0, trimmed: w.trimmed };
  return { z: w.values.map((v) => (v - m) / sd), mean: m, sd, trimmed: w.trimmed };
}

/**
 * The share of `values` at or below `x`, as a number in [0, 1].
 *
 * Used for the peer-valuation percentile, where the question is "how cheap is this relative to its
 * own industry", not "how cheap is it in absolute terms".
 */
export function percentileOf(values, x) {
  if (!values.length) return null;
  let n = 0;
  for (const v of values) if (v <= x) n++;
  return n / values.length;
}

/* ------------------------------------------------------------------ bars */

/** The index of the bar dated `date`, or −1. Bars are oldest first throughout. */
export function indexOfDate(bars, date) {
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].date === date) return i;
  return -1;
}

/** The bar at `date`, or the latest one before it. Null when the series starts later. */
export function barAtOrBefore(bars, date) {
  let best = null;
  for (const b of bars) {
    if (b.date > date) break;
    best = b;
  }
  return best;
}

/** The simple average of the last `n` closes ending at index `end`, or null if the history is short. */
export function sma(bars, n, end = bars.length - 1) {
  if (end < n - 1 || n <= 0) return null;
  let sum = 0;
  for (let i = end - n + 1; i <= end; i++) sum += bars[i].close;
  return sum / n;
}

/** Median dollar volume over the last `n` sessions — the liquidity test's measure. */
export function medianDollarVolume(bars, n, end = bars.length - 1) {
  if (end < n - 1) return null;
  const vals = [];
  for (let i = end - n + 1; i <= end; i++) vals.push(bars[i].close * bars[i].volume);
  return median(vals);
}

/**
 * Realised volatility from `n` daily log returns: the standard deviation per session, and the same
 * figure annualised for display. `n` returns need `n + 1` bars.
 */
export function realisedVol(bars, n, end = bars.length - 1) {
  if (end < n) return null;
  const rets = [];
  for (let i = end - n + 1; i <= end; i++) {
    const prev = bars[i - 1].close;
    if (!(prev > 0) || !(bars[i].close > 0)) return null;
    rets.push(Math.log(bars[i].close / prev));
  }
  const sd = stdev(rets);
  if (sd == null) return null;
  return { daily: sd, annual: sd * Math.sqrt(SESSIONS_PER_YEAR) };
}

/* ------------------------------------------------------------------ corporate actions */

/** A split's ratio: 4-for-1 is `{ split_from: 1, split_to: 4 }`, a ratio of 4. */
function splitRatio(s) {
  const from = Number(s.split_from ?? s.from ?? 1);
  const to = Number(s.split_to ?? s.to ?? 1);
  if (!(from > 0) || !(to > 0)) return 1;
  return to / from;
}

/**
 * Restate dividends in current share terms.
 *
 * The bars are already split-adjusted, so a cash amount declared before a split has to be divided by
 * every split that happened on or after its ex-date. Skipping this makes a pre-split dividend four
 * times too large, and a 2% yield look like 8%.
 */
export function adjustedDividends(dividends, splits = []) {
  const ratios = (splits ?? [])
    .map((s) => ({ date: String(s.execution_date ?? s.date ?? ''), ratio: splitRatio(s) }))
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.ratio > 0 && s.ratio !== 1);
  return (dividends ?? [])
    .map((d) => {
      const exDate = String(d.ex_dividend_date ?? d.exDate ?? d.date ?? '');
      const amount = Number(d.cash_amount ?? d.amount ?? NaN);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate) || !Number.isFinite(amount)) return null;
      let factor = 1;
      for (const s of ratios) if (s.date >= exDate) factor *= s.ratio;
      return { exDate, amount: amount / factor, gross: amount, splitFactor: factor };
    })
    .filter(Boolean)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
}

/** The dividends whose ex-date falls in `(from, to]` — the ones an owner over that span receives. */
export function dividendsBetween(adjusted, from, to) {
  return (adjusted ?? []).filter((d) => d.exDate > from && d.exDate <= to);
}

/**
 * Total return between two dated prices, dividends included.
 *
 * `from`/`to` are the dates the two prices belong to, so the dividend window is unambiguous: an owner
 * who bought at `from` collects everything that went ex after `from` and up to `to`.
 */
export function totalReturn({ fromPrice, toPrice, from, to, dividends = [] }) {
  if (!(fromPrice > 0) || !Number.isFinite(toPrice)) return null;
  const cash = dividendsBetween(dividends, from, to).reduce((a, d) => a + d.amount, 0);
  return (toPrice + cash) / fromPrice - 1;
}

/** Total return between two bar indices, dividends included. */
export function returnBetween(bars, i, j, dividends = []) {
  if (i < 0 || j < 0 || i >= bars.length || j >= bars.length) return null;
  return totalReturn({
    fromPrice: bars[i].close,
    toPrice: bars[j].close,
    from: bars[i].date,
    to: bars[j].date,
    dividends,
  });
}

/* ------------------------------------------------------------------ price signals */

/**
 * 12−1 momentum: the total return from 252 sessions ago to 21 sessions ago.
 *
 * The most recent month is deliberately excluded. The published evidence for intermediate momentum
 * is for the 12−1 window specifically; including the last month mixes in short-term reversal, which
 * historically works the other way.
 */
export function momentum12_1(bars, dividends = [], end = bars.length - 1) {
  const from = end - 252;
  const to = end - 21;
  if (from < 0) return null;
  return returnBetween(bars, from, to, dividends);
}

/** The total return over the last `n` sessions. */
export function trailingReturn(bars, n, dividends = [], end = bars.length - 1) {
  if (end - n < 0) return null;
  return returnBetween(bars, end - n, end, dividends);
}

/**
 * How stretched the price is above its own 50-session average, measured in daily standard
 * deviations so a quiet stock and a volatile one are on the same scale.
 *
 * Positive means extended. On typical daily volatility of about 1.5%, a close 5% above the average
 * reads as roughly 3.3 — which is where the plan puts the threshold for marking an entry as
 * overextended.
 */
export function extension(bars, end = bars.length - 1) {
  const avg = sma(bars, 50, end);
  const vol = realisedVol(bars, 60, end);
  if (avg == null || !vol?.daily) return null;
  return (bars[end].close / avg - 1) / vol.daily;
}

/** Is the close above its 200-session average? The trend filter, as an eligibility test. */
export function aboveTrend(bars, end = bars.length - 1) {
  const avg = sma(bars, 200, end);
  if (avg == null) return null;
  return bars[end].close > avg;
}
