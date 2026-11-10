import type { SchoolConfig } from '../waterpolo.config.d.mts';
import type { PoloRow } from './polo-parse.d.mts';
export interface Headings { title: string; h1: string; ogTitle: string }
export interface Verdict { ok: boolean; why?: string; how?: string }
export function pageHeadings(html: string): Headings;
export function checkSeason(headings: Headings, rows: PoloRow[], season?: number, window?: { start: string; end: string }): Verdict;
export function checkSport(url: string, headings: Headings, cfg: Partial<SchoolConfig>): Verdict;
export function validateSource(html: string, rows: PoloRow[], cfg: SchoolConfig, season?: number): Verdict & { headings: Headings };
export function validateFeed(feed: unknown): string[];
export function feedProblems(feed: any): string[];
export function gameProblems(game: any, feed: any, seen?: Set<string>): string[];
export function partitionProblems(feed: any): { fatal: string[]; rows: { game: any; problems: string[] }[] };
export function quarantineRows(
  feed: any,
  previous?: any,
  limit?: number | null,
): {
  games: any[];
  rescued: { game: any; problems: string[] }[];
  discarded: { game: any; problems: string[] }[];
  fatal: string[];
  rows: { game: any; problems: string[] }[];
  systemic: boolean;
  limit: number;
  write: boolean;
};
