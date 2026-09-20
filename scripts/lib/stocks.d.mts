export const UNIVERSE: [string, string][];
export const RULE_TEXT: string;
export interface Bar { date: string; open: number; close: number; volume: number }
export interface Metrics { last: number; r5: number; r20: number; aboveAvg20: boolean; volRatio: number; pctOfHigh60: number; lastDate: string }
export function fetchBars(symbol: string, range?: string): Promise<Bar[]>;
export function metricsFor(bars: Bar[]): Metrics | null;
export function pickStock<T extends { ticker: string; m: Metrics | null }>(rows: T[], opts?: { recent?: Set<string>; mentions?: Record<string, number> }): (T & { score: number }) | null;
export function countMentions(headlines: string[], universe?: [string, string][]): Record<string, number>;
export function scoreboard<P extends { date: string; ticker: string }>(picks: P[], barsByTicker: Record<string, Bar[]>): { rows: (P & { openAtPick: number | null; latestClose: number | null; changePct: number | null; asOf: string | null })[]; combinedPct: number | null; counted: number };
