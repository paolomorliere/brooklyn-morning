// Prices from Massive (Polygon.io), on the free "Stocks Basic" plan.
//
// **Why this source and not the one that was here.** The previous screen read Yahoo Finance's
// undocumented `v8/finance/chart` endpoint. Yahoo's robots.txt is `User-agent: * / Disallow: /` — it
// disallows every automated client, with no exception for this path — and Yahoo has already closed
// `quoteSummary` behind a crumb check. The old screen made ~104 requests a day; the universe this
// strategy needs would have made ~4,700. That is not a thing to scale up, so it is gone. Massive
// publishes terms for programmatic use, needs no payment method, and blocks rather than bills when
// the free allowance runs out — which is the only kind of limit this project accepts.
//
// **What the free plan gives, and what that costs the design.** End-of-day data, two years of
// history, and **five requests a minute**. Five a minute is the binding constraint, and it is why
// nothing here is fetched per ticker:
//
//   * One *grouped daily bars* call returns every US ticker's bar for one session. One call a day
//     covers the whole universe. Backfilling two years is ~502 calls, which paces out to about an
//     hour and forty minutes and happens once.
//   * Splits and dividends are fetched market-wide and filtered by date, not by ticker. Per-ticker
//     corporate-action calls for 4,700 names would take sixteen hours at this rate.
//
// **Grouped bars are split-adjusted and not dividend-adjusted.** Every return in this project
// therefore adds dividends back explicitly (see `signals.mjs`), and dividends declared before a split
// are restated into current share terms. Mixing an unadjusted price with an adjusted one is the kind
// of error that produces a plausible wrong answer, which is worse than a missing one.
//
// **The cache is append-only.** Each session's bars are written once to their own gzipped file and
// never rewritten, so git stores one small object per trading day instead of a new copy of the whole
// history. If the free plan ever ends, the history already in the repo is still there and the app says
// the feed stopped — it never activates a paid plan to keep going.

import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Overridable so a host change needs one environment variable, not a code change. */
export const API_BASE = process.env.MASSIVE_BASE_URL ?? 'https://api.polygon.io';

/** The free plan's documented ceiling. One spare request a minute, deliberately. */
export const FREE_REQUESTS_PER_MINUTE = 5;

/**
 * How far back the free plan will answer for.
 *
 * "Stocks Basic" includes two years of history. Asking for a session older than that is refused, and the
 * refusal looks exactly like a refusal for any other reason — so the start of a backfill is computed from
 * this rather than written down as a date. 720 days keeps a fortnight of margin inside the entitlement,
 * which matters because the boundary moves every day.
 */
export const FREE_HISTORY_DAYS = 720;

const USER_AGENT = 'BrooklynMorning/0.2 (personal morning edition; contact via repository)';

/**
 * A plain request pacer.
 *
 * Not a token bucket and not a retry-on-429 loop: the free plan's limit is known in advance, so the
 * honest thing is to stay under it rather than to discover it by being refused. `wait()` resolves when
 * the next request may be sent.
 */
export class RateLimiter {
  constructor({ perMinute = FREE_REQUESTS_PER_MINUTE } = {}) {
    this.intervalMs = Math.ceil(60_000 / perMinute);
    this.next = 0;
  }

  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.intervalMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

/** Thrown when the plan's allowance is exhausted, so the caller can stop rather than degrade. */
export class AllowanceExhausted extends Error {
  constructor(message) {
    super(message);
    this.name = 'AllowanceExhausted';
  }
}

/** Thrown when the feed will not accept the key at all. A setup problem, not a usage one. */
export class KeyRejected extends Error {
  constructor(message) {
    super(message);
    this.name = 'KeyRejected';
  }
}

/** Thrown when the plan will not serve that particular date. The caller stops reaching further back. */
export class OutsideEntitlement extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutsideEntitlement';
  }
}

/**
 * One GET, paced, with the key in the header rather than the query string.
 *
 * The key never appears in a URL: URLs reach logs, error messages and `Referer` headers. A 429 or a
 * 403 mentioning the plan is treated as "the free allowance is finished", which stops the run — the
 * build then publishes nothing rather than republishing yesterday's pick as if it were fresh.
 */
export async function getJson(path, { apiKey, limiter, attempt = 0, timeoutMs = 20_000 } = {}) {
  if (!apiKey) throw new Error('MASSIVE_API_KEY is not set, so no price data can be fetched');
  if (limiter) await limiter.wait();
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (attempt < 2) return getJson(path, { apiKey, limiter, attempt: attempt + 1, timeoutMs });
    throw new Error(`${path}: ${err.message}`);
  }
  // Whatever went wrong, say what the feed actually said. A bare status code in a build log is a
  // guessing game, and the three ways this can fail need three different responses.
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 400);
    const where = `${path}: HTTP ${res.status}${body ? ` — ${body}` : ''}`;
    if (res.status === 401) throw new KeyRejected(where);
    if (res.status === 403) {
      // Massive answers 403 both for "this key is not valid" and for "your plan does not cover that".
      // The body distinguishes them, and getting it wrong means either giving up on a working key or
      // hammering a feed that will never answer.
      if (/not entitled|entitlement|upgrade|plan|subscription|date/i.test(body)) throw new OutsideEntitlement(where);
      throw new KeyRejected(where);
    }
    if (res.status === 429) throw new AllowanceExhausted(where);
    if (res.status >= 500 && attempt < 2) return getJson(path, { apiKey, limiter, attempt: attempt + 1, timeoutMs });
    throw new Error(where);
  }
  return res.json();
}

/* ------------------------------------------------------------------ parsing */

/**
 * Pure: one session's grouped bars.
 *
 * Polygon's single-letter keys are expanded once here so nothing downstream has to remember that `v`
 * is volume and `vw` is the volume-weighted price. A row without a usable open, close or ticker is
 * dropped: a zero would be a price, and there was no price.
 */
export function parseGroupedBars(json) {
  const out = [];
  for (const r of json?.results ?? []) {
    const ticker = String(r.T ?? '').trim().toUpperCase();
    const open = Number(r.o);
    const close = Number(r.c);
    if (!ticker || !(open > 0) || !(close > 0)) continue;
    out.push({
      ticker,
      open,
      high: Number.isFinite(Number(r.h)) ? Number(r.h) : close,
      low: Number.isFinite(Number(r.l)) ? Number(r.l) : close,
      close,
      volume: Number.isFinite(Number(r.v)) ? Number(r.v) : 0,
    });
  }
  out.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  return out;
}

/** Pure: splits, as `{ ticker, execution_date, split_from, split_to }`. */
export function parseSplits(json) {
  const out = [];
  for (const r of json?.results ?? []) {
    const ticker = String(r.ticker ?? '').trim().toUpperCase();
    const date = String(r.execution_date ?? '').trim();
    const from = Number(r.split_from);
    const to = Number(r.split_to);
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(from > 0) || !(to > 0)) continue;
    out.push({ ticker, execution_date: date, split_from: from, split_to: to });
  }
  return out;
}

/** Pure: cash dividends, as `{ ticker, ex_dividend_date, cash_amount }`. */
export function parseDividends(json) {
  const out = [];
  for (const r of json?.results ?? []) {
    const ticker = String(r.ticker ?? '').trim().toUpperCase();
    const date = String(r.ex_dividend_date ?? '').trim();
    const amount = Number(r.cash_amount);
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) continue;
    out.push({ ticker, ex_dividend_date: date, cash_amount: amount });
  }
  return out;
}

/* ------------------------------------------------------------------ the cache */

/**
 * The cache path for one session. Sharded by year so no directory grows without bound, and named by
 * the session date so a file is written exactly once and never rewritten.
 */
export function barsPath(date, root = 'state/bars') {
  return `${root}/${date.slice(0, 4)}/${date}.csv.gz`;
}

/**
 * Pure: one session as CSV.
 *
 * CSV rather than JSON because this is the one file that exists 500 times over: the same data costs
 * about a third as much, and gzipped it is around 20 KB a session. Prices are written to four decimal
 * places, which is finer than any US equity quotes.
 */
export function encodeBarsCsv(rows, { date } = {}) {
  const lines = [`# ${date ?? ''} ticker,open,high,low,close,volume`];
  for (const r of rows) {
    lines.push(
      [r.ticker, r.open.toFixed(4), r.high.toFixed(4), r.low.toFixed(4), r.close.toFixed(4), Math.round(r.volume)].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Pure: read back what `encodeBarsCsv` wrote. */
export function parseBarsCsv(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [ticker, open, high, low, close, volume] = line.split(',');
    const o = Number(open);
    const c = Number(close);
    if (!ticker || !(o > 0) || !(c > 0)) continue;
    out.push({
      ticker,
      open: o,
      high: Number(high) || c,
      low: Number(low) || c,
      close: c,
      volume: Number(volume) || 0,
    });
  }
  return out;
}

/** Write one session's bars, creating the year directory on first use. */
export async function writeBars(date, rows, { root = 'state/bars' } = {}) {
  const path = barsPath(date, root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, gzipSync(Buffer.from(encodeBarsCsv(rows, { date }), 'utf8'), { level: 9 }));
  return path;
}

/** Read one session's bars, or null when that session is not cached. */
export async function readBars(date, { root = 'state/bars' } = {}) {
  try {
    const buf = await readFile(barsPath(date, root));
    return parseBarsCsv(gunzipSync(buf).toString('utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Pure: turn a run of cached sessions into per-ticker series.
 *
 * `sessions` is `[{ date, rows }]`, oldest first. A ticker that has no bar on a session simply has no
 * bar in its series — the gap is never filled with the previous close, which would invent a trade that
 * did not happen and flatter every volatility measure.
 */
export function seriesByTicker(sessions, { tickers = null } = {}) {
  const want = tickers ? new Set(tickers) : null;
  const out = new Map();
  for (const { date, rows } of sessions) {
    for (const r of rows) {
      if (want && !want.has(r.ticker)) continue;
      const list = out.get(r.ticker);
      const bar = { date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume };
      if (list) list.push(bar);
      else out.set(r.ticker, [bar]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ endpoints */

/** The oldest session the free plan will answer for, as at `today`. */
export function earliestAvailableSession(today, days = FREE_HISTORY_DAYS) {
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The newest session that can possibly have closed: the last weekday strictly before `today`.
 *
 * The free plan is end of day, and this build runs before six in the morning. Asking for today's bar
 * gets `NOT_AUTHORIZED — "Attempted to request today's data before end of day"`, which is not a problem
 * with the key or the plan's history; it is a question that cannot have an answer yet. Weekends are
 * skipped here; a public holiday simply comes back with no rows, which is information the trading
 * calendar is built from.
 */
export function lastCompletedSession(today) {
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  let d = new Date(t - 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Pure: is this refusal just "the session has not closed yet"? */
export function isBeforeEndOfDay(message) {
  return /today's data before end of day/i.test(String(message ?? ''));
}

/** One session's bars for every US ticker — the call that makes a 5,000-name universe affordable. */
export async function fetchGroupedBars(date, opts) {
  const json = await getJson(`/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true`, opts);
  // The endpoint answers 200 with no results on a day the market was shut, which is information, not
  // an error: the trading calendar is built from the sessions that did return bars.
  return { date, traded: (json?.resultsCount ?? json?.results?.length ?? 0) > 0, rows: parseGroupedBars(json) };
}

/** Follow `next_url` until the listing ends, capped so a runaway cursor cannot spend the allowance. */
async function pageThrough(path, parse, opts, { maxPages = 20 } = {}) {
  const out = [];
  let next = path;
  for (let page = 0; page < maxPages && next; page++) {
    const json = await getJson(next, opts);
    for (const row of parse(json)) out.push(row);
    const url = json?.next_url ? new URL(json.next_url) : null;
    next = url ? `${url.pathname}${url.search}` : null;
  }
  return out;
}

/** Every split executed on or after `since`, market-wide. */
export function fetchSplits(since, opts) {
  return pageThrough(`/v3/reference/splits?execution_date.gte=${since}&limit=1000&order=asc&sort=execution_date`, parseSplits, opts);
}

/** Every cash dividend that went ex on or after `since`, market-wide. */
export function fetchDividends(since, opts) {
  return pageThrough(
    `/v3/reference/dividends?ex_dividend_date.gte=${since}&limit=1000&order=asc&sort=ex_dividend_date`,
    parseDividends,
    opts,
  );
}
