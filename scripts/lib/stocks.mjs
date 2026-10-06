// Version 1 of "Stock in Focus". **Frozen on 6 October 2026. It no longer picks anything.**
//
// This file is kept so the eleven picks version 1 published can still be reproduced and explained. Its
// scoring functions are untouched; what has been removed is the network call, because the data source
// was not ours to use. Yahoo Finance's robots.txt is `User-agent: * / Disallow: /`, the chart endpoint
// was undocumented, and version 2's universe would have taken it from 104 requests a day to about
// 5,000. Prices now come from Massive (see `prices.mjs`), and version 1's still-open positions are
// tracked to the end of a uniform five-session hold with that feed.
//
// What version 1 actually did, stated plainly because the record should be readable: it ranked 104
// tickers chosen by hand, mostly on their five-day return, stated no holding period, used unadjusted
// closes, measured itself against no benchmark, and had no tests. Its published −2.85% averaged five
// positions held 5, 4, 3, 2 and 1 sessions as though they were comparable.

export const UNIVERSE = [
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['META', 'Meta Platforms'],
  ['BRK-B', 'Berkshire Hathaway'], ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'], ['LLY', 'Eli Lilly'], ['JPM', 'JPMorgan Chase'], ['V', 'Visa'],
  ['UNH', 'UnitedHealth'], ['XOM', 'ExxonMobil'], ['MA', 'Mastercard'], ['COST', 'Costco'], ['JNJ', 'Johnson & Johnson'], ['PG', 'Procter & Gamble'],
  ['HD', 'Home Depot'], ['WMT', 'Walmart'], ['NFLX', 'Netflix'], ['ABBV', 'AbbVie'], ['BAC', 'Bank of America'], ['CRM', 'Salesforce'],
  ['ORCL', 'Oracle'], ['CVX', 'Chevron'], ['KO', 'Coca-Cola'], ['MRK', 'Merck'], ['AMD', 'AMD'], ['PEP', 'PepsiCo'], ['CSCO', 'Cisco'],
  ['TMO', 'Thermo Fisher'], ['ACN', 'Accenture'], ['LIN', 'Linde'], ['MCD', "McDonald's"], ['ADBE', 'Adobe'], ['ABT', 'Abbott'],
  ['WFC', 'Wells Fargo'], ['IBM', 'IBM'], ['GE', 'GE Aerospace'], ['PM', 'Philip Morris'], ['CAT', 'Caterpillar'], ['TXN', 'Texas Instruments'],
  ['QCOM', 'Qualcomm'], ['INTU', 'Intuit'], ['DIS', 'Disney'], ['ISRG', 'Intuitive Surgical'], ['VZ', 'Verizon'], ['AMGN', 'Amgen'],
  ['GS', 'Goldman Sachs'], ['NOW', 'ServiceNow'], ['DHR', 'Danaher'], ['CMCSA', 'Comcast'], ['BKNG', 'Booking Holdings'], ['MS', 'Morgan Stanley'],
  ['SPGI', 'S&P Global'], ['AXP', 'American Express'], ['PFE', 'Pfizer'], ['RTX', 'RTX'], ['NEE', 'NextEra Energy'], ['UBER', 'Uber'],
  ['T', 'AT&T'], ['LOW', "Lowe's"], ['HON', 'Honeywell'], ['UNP', 'Union Pacific'], ['BLK', 'BlackRock'], ['PGR', 'Progressive'],
  ['ETN', 'Eaton'], ['TJX', 'TJX'], ['COP', 'ConocoPhillips'], ['BSX', 'Boston Scientific'], ['C', 'Citigroup'], ['SCHW', 'Charles Schwab'],
  ['LMT', 'Lockheed Martin'], ['ADP', 'ADP'], ['MDT', 'Medtronic'], ['BMY', 'Bristol Myers Squibb'], ['DE', 'Deere'], ['SBUX', 'Starbucks'],
  ['GILD', 'Gilead'], ['MMM', '3M'], ['CB', 'Chubb'], ['INTC', 'Intel'], ['MDLZ', 'Mondelez'], ['ADI', 'Analog Devices'], ['UPS', 'UPS'],
  ['PLTR', 'Palantir'], ['SO', 'Southern Company'], ['DUK', 'Duke Energy'], ['MO', 'Altria'], ['GD', 'General Dynamics'], ['NKE', 'Nike'],
  ['AMT', 'American Tower'], ['CL', 'Colgate-Palmolive'], ['TGT', 'Target'], ['USB', 'U.S. Bancorp'], ['FDX', 'FedEx'], ['BA', 'Boeing'],
  ['PYPL', 'PayPal'], ['EMR', 'Emerson'], ['AIG', 'AIG'], ['COF', 'Capital One'], ['MET', 'MetLife'], ['CVS', 'CVS Health'],
];

export const RULE_TEXT =
  'Universe: S&P 100. Keep stocks above their 20-day average with a positive 5-day return. Rank by 5-day return, 20-day return, ' +
  'volume vs. 20-day average, and mentions in today\'s finance and AI headlines. Skip anything featured in the last 10 trading days. ' +
  'Mechanical, backward-looking, and not a recommendation.';

/** Pure: compute screen metrics from bars. Returns null if not enough history. */
export function metricsFor(bars) {
  if (bars.length < 25) return null;
  const c = bars.map((b) => b.close);
  const v = bars.map((b) => b.volume);
  const last = c[c.length - 1];
  const r5 = last / c[c.length - 6] - 1;
  const r20 = last / c[c.length - 21] - 1;
  const avg20 = c.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const vol20 = v.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const volRatio = vol20 ? v[v.length - 1] / vol20 : 1;
  const high60 = Math.max(...c.slice(-60));
  return { last, r5, r20, aboveAvg20: last > avg20, volRatio, pctOfHigh60: last / high60, lastDate: bars[bars.length - 1].date };
}

/** Pure: rank candidates and pick one. `recent` = tickers featured in the last 10 trading days. `mentions` = ticker → count. */
export function pickStock(rows, { recent = new Set(), mentions = {} } = {}) {
  const eligible = rows.filter((r) => r.m && r.m.aboveAvg20 && r.m.r5 > 0 && !recent.has(r.ticker));
  if (!eligible.length) return null;
  const z = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 1;
    return (x) => (x - mean) / sd;
  };
  const z5 = z(eligible.map((r) => r.m.r5)), z20 = z(eligible.map((r) => r.m.r20)), zv = z(eligible.map((r) => r.m.volRatio));
  const scored = eligible.map((r) => ({
    ...r,
    score: 1.0 * z5(r.m.r5) + 0.5 * z20(r.m.r20) + 0.5 * Math.min(2, zv(r.m.volRatio)) + 0.6 * Math.min(2, mentions[r.ticker] ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/** Pure: count mentions of each company in a list of headline strings. */
export function countMentions(headlines, universe = UNIVERSE) {
  const text = headlines.join(' \n ').toLowerCase();
  const out = {};
  for (const [ticker, name] of universe) {
    const needle = name.toLowerCase().replace(/[^a-z0-9& ]/g, '');
    const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|\\b${ticker.toLowerCase().replace('-', '\\.?')}\\b`, 'g');
    const n = (text.match(re) ?? []).length;
    if (n) out[ticker] = n;
  }
  return out;
}

/** Pure: scoreboard for the week's picks given fresh bars per ticker. Buy at the open of the pick day, value at the latest close. */
export function scoreboard(picks, barsByTicker) {
  const rows = picks.map((p) => {
    const bars = barsByTicker[p.ticker] ?? [];
    const start = bars.find((b) => b.date >= p.date);
    const last = bars[bars.length - 1];
    if (!start || !last) return { ...p, openAtPick: null, latestClose: null, changePct: null, asOf: null };
    return { ...p, openAtPick: start.open, latestClose: last.close, changePct: (last.close / start.open - 1) * 100, asOf: last.date };
  });
  const valid = rows.filter((r) => r.changePct != null);
  const combinedPct = valid.length ? valid.reduce((a, r) => a + r.changePct, 0) / valid.length : null;
  return { rows, combinedPct, counted: valid.length };
}
