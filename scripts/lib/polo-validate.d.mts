import type { SchoolConfig } from '../waterpolo.config.d.mts';
import type { PoloRow } from './polo-parse.d.mts';
export interface Headings { title: string; h1: string; ogTitle: string }
export interface Verdict { ok: boolean; why?: string; how?: string }
export function pageHeadings(html: string): Headings;
export function checkSeason(headings: Headings, rows: PoloRow[], season?: number, window?: { start: string; end: string }): Verdict;
export function checkSport(url: string, headings: Headings, cfg: Partial<SchoolConfig>): Verdict;
export function validateSource(html: string, rows: PoloRow[], cfg: SchoolConfig, season?: number): Verdict & { headings: Headings };
export function validateFeed(feed: unknown): string[];
