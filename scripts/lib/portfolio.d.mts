import type { Bar, Dividend } from './signals.d.mts';

export const HORIZON_SESSIONS: number;
export const STOCK_COST_BPS: number;
export const BENCHMARK_COST_BPS: number;

export interface Position {
  entryDate: string;
  valueDate: string;
  entryPrice: number;
  valuePrice: number;
  dividends: number;
  gross: number;
  net: number;
  costBps: number;
}

export interface MeasuredPick extends Partial<Position> {
  status: 'complete' | 'open' | 'not-entered' | 'unpriced';
  reason?: string;
  entryDate?: string;
  plannedExit?: string | null;
  sessionsHeld?: number;
  horizon?: number;
  complete?: boolean;
  benchmarks?: Record<string, Position | null>;
  excess?: Record<string, number | null>;
  [key: string]: unknown;
}

export interface Summary {
  n: number;
  open: number;
  meanNet: number | null;
  meanGross: number | null;
  meanExcess: number | null;
  benchmark: string;
  wins: number;
  winRate: number | null;
  averageGain: number | null;
  averageLoss: number | null;
  sd: number | null;
  tStat: number | null;
  mixedHorizonMean: number | null;
  mixedHorizonCount: number;
  horizonsSpanned: number[];
}

export function nyParts(iso: string): { date: string; minutes: number } | null;
export function calendarFrom(bars: Bar[] | null | undefined): string[];
export function projectSessions(calendar: string[], n: number): string[];
export function sessionIndexAtOrAfter(calendar: string[], date: string): number;
export function sessionIndexAtOrBefore(calendar: string[], date: string): number;
export function entrySession(calendar: string[], publishedAt: string): string | null;
export function exitSession(calendar: string[], entryDate: string, horizon?: number): string | null;
export function plannedWindow(
  calendar: string[],
  publishedAt: string,
  horizon?: number,
): { entry: string | null; exit: string | null; extended: string[] };
export function sessionsHeld(calendar: string[], entryDate: string, asOf: string): number;
export function positionReturn(opts: {
  bars: Bar[];
  dividends?: Dividend[];
  entryDate: string;
  valueDate: string;
  costBps?: number;
}): Position | null;
export function measurePick(
  pick: { publishedAt?: string; entryDate?: string; [key: string]: unknown },
  ctx: {
    calendar: string[];
    bars: Bar[];
    dividends?: Dividend[];
    benchmarks?: Record<string, { bars: Bar[]; dividends?: Dividend[] }>;
    asOf: string;
    horizon?: number;
  },
): MeasuredPick;
export function tStatistic(values: number[]): number | null;
export function neweyWestTStat(values: number[], lag?: number): number | null;
export function maxDrawdown(equity: number[]): number;
export function summarise(rows: MeasuredPick[], opts?: { benchmark?: string }): Summary;
