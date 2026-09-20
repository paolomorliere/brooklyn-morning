// "Stock in focus": a transparent, rules-based screen over the S&P 100. Not a recommendation.
// Data: Yahoo Finance's public chart endpoint (no key). It is unofficial and may break; the builder then records
// { kind: 'unavailable' } and the app says so instead of showing stale or invented numbers.

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

const UA = 'Mozilla/5.0 (compatible; BrooklynMorning/0.1; personal RSS reader)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Daily bars for one symbol: [{date:'YYYY-MM-DD', open, close, volume}], oldest first. */
export async function fetchBars(symbol, range = '3mo', attempt = 0) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const res = j.chart?.result?.[0];
    if (!res) throw new Error(j.chart?.error?.description ?? 'empty result');
    const q = res.indicators.quote[0];
    const tz = res.meta.exchangeTimezoneName ?? 'America/New_York';
    const bars = [];
    res.timestamp.forEach((t, i) => {
      if (q.close[i] == null || q.open[i] == null) return;
      bars.push({ date: new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: tz }), open: q.open[i], close: q.close[i], volume: q.volume[i] ?? 0 });
    });
    return bars;
  } catch (e) {
    if (attempt < 1) {
      await sleep(1500);
      return fetchBars(symbol, range, attempt + 1);
    }
    throw e;
  }
}

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
