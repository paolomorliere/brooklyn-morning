export interface GroupedRow {
  ticker: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface SplitRow { ticker: string; execution_date: string; split_from: number; split_to: number }
export interface DividendRow { ticker: string; ex_dividend_date: string; cash_amount: number }
export interface SessionBars { date: string; rows: GroupedRow[] }

export const API_BASE: string;
export const FREE_REQUESTS_PER_MINUTE: number;
export const SAFE_REQUESTS_PER_MINUTE: number;

export class RateLimiter {
  constructor(opts?: { perMinute?: number });
  intervalMs: number;
  wait(): Promise<void>;
}
export class AllowanceExhausted extends Error {}
export class KeyRejected extends Error {}
export class OutsideEntitlement extends Error {}
export const FREE_HISTORY_DAYS: number;
export function earliestAvailableSession(today: string, days?: number): string | null;
export function lastCompletedSession(today: string): string | null;
export function isBeforeEndOfDay(message: string | null | undefined): boolean;

export interface FetchOpts { apiKey: string; limiter?: RateLimiter; timeoutMs?: number }
export function getJson(path: string, opts: FetchOpts): Promise<unknown>;

export function parseGroupedBars(json: unknown): GroupedRow[];
export function parseSplits(json: unknown): SplitRow[];
export function parseDividends(json: unknown): DividendRow[];

export function barsPath(date: string, root?: string): string;
export function encodeBarsCsv(rows: GroupedRow[], opts?: { date?: string }): string;
export function parseBarsCsv(text: string): GroupedRow[];
export function writeBars(date: string, rows: GroupedRow[], opts?: { root?: string }): Promise<string>;
export function readBars(date: string, opts?: { root?: string }): Promise<GroupedRow[] | null>;
export function seriesByTicker(
  sessions: SessionBars[],
  opts?: { tickers?: string[] | Set<string> | null },
): Map<string, { date: string; open: number; high: number; low: number; close: number; volume: number }[]>;

export function fetchGroupedBars(date: string, opts: FetchOpts): Promise<{ date: string; traded: boolean; rows: GroupedRow[] }>;
export function fetchSplits(since: string, opts: FetchOpts): Promise<SplitRow[]>;
export function fetchDividends(since: string, opts: FetchOpts): Promise<DividendRow[]>;
