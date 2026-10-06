export interface Bar { date: string; open: number; high?: number; low?: number; close: number; volume: number }
export interface Dividend { exDate: string; amount: number; gross: number; splitFactor: number }
export interface Vol { daily: number; annual: number }

export const SESSIONS_PER_YEAR: number;
export const WINSOR_P: number;

export function mean(values: number[]): number | null;
export function median(values: number[]): number | null;
export function quantile(values: number[], p: number): number | null;
export function stdev(values: number[]): number | null;
export function clip(x: number, lo: number, hi: number): number;
export function winsorize(values: number[], p?: number): { values: number[]; lo: number | null; hi: number | null; trimmed: number };
export function zScores(values: number[], opts?: { p?: number }): { z: number[]; mean: number | null; sd: number | null; trimmed: number };
export function percentileOf(values: number[], x: number): number | null;

export function indexOfDate(bars: Bar[], date: string): number;
export function barAtOrBefore(bars: Bar[], date: string): Bar | null;
export function sma(bars: Bar[], n: number, end?: number): number | null;
export function medianDollarVolume(bars: Bar[], n: number, end?: number): number | null;
export function realisedVol(bars: Bar[], n: number, end?: number): Vol | null;

export function adjustedDividends(
  dividends: { ex_dividend_date?: string; exDate?: string; date?: string; cash_amount?: number; amount?: number }[] | null | undefined,
  splits?: { execution_date?: string; date?: string; split_from?: number; split_to?: number; from?: number; to?: number }[],
): Dividend[];
export function dividendsBetween(adjusted: Dividend[] | null | undefined, from: string, to: string): Dividend[];
export function totalReturn(opts: { fromPrice: number; toPrice: number; from: string; to: string; dividends?: Dividend[] }): number | null;
export function returnBetween(bars: Bar[], i: number, j: number, dividends?: Dividend[]): number | null;

export function momentum12_1(bars: Bar[], dividends?: Dividend[], end?: number): number | null;
export function trailingReturn(bars: Bar[], n: number, dividends?: Dividend[], end?: number): number | null;
export function extension(bars: Bar[], end?: number): number | null;
export function aboveTrend(bars: Bar[], end?: number): boolean | null;
