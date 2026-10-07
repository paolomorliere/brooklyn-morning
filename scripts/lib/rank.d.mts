export interface RankFeed { id: string; weight: number; lang?: string }
export interface RankItem { title: string; excerpt?: string | null; lead?: string | null; url: string; publishedAt: string; topic: string; score: number; [k: string]: unknown }
export function normalizeTitle(t: string): string;
export function canonicalUrl(u: string): string;
export function titleSimilarity(a: string, b: string): number;
export function recencyFactor(publishedAt: string, now: number, halfLifeHours?: number): number;
export function scoreItem(item: Omit<RankItem, 'score'>, feed: RankFeed, opts?: { boosts?: [RegExp, number][]; matchReport?: RegExp[]; matchReportPenalty?: number; halfLifeHours?: number; now?: number }): number;
export function subjectOf(item: { title: string; excerpt?: string | null }, subjects?: [string, RegExp][]): string | null;
export interface NearDuplicateOptions { maxShare?: number; minLimit?: number; minShared?: number; minOverlap?: number }
export interface DropRecord { rule: string; topic?: string; title: string; publisher?: string; detail: string }
export function properNouns(item: { title?: string | null; excerpt?: string | null; publisher?: string | null }): Set<string>;
export function documentFrequency(items: { title?: string | null; excerpt?: string | null; publisher?: string | null }[]): Map<string, number>;
export function distinctiveTokens(item: { title?: string | null; excerpt?: string | null; publisher?: string | null }, df: Map<string, number>, poolSize: number, opts?: NearDuplicateOptions): Set<string>;
export function sharedDistinctive(a: { title?: string | null; excerpt?: string | null; publisher?: string | null }, b: { title?: string | null; excerpt?: string | null; publisher?: string | null }, df: Map<string, number>, poolSize: number, opts?: NearDuplicateOptions): { shared: string[]; overlap: number; sizes: [number, number] };
export function sameStory(a: { title?: string | null; excerpt?: string | null; publisher?: string | null }, b: { title?: string | null; excerpt?: string | null; publisher?: string | null }, df: Map<string, number>, poolSize: number, opts?: NearDuplicateOptions): boolean;
export function dedupe<T extends RankItem>(items: T[], threshold?: number): T[];
export function selectPerTopic<T extends RankItem>(items: T[], opts: { perTopic: number; maxAgeHours: Record<string, number>; seen?: Record<string, string>; now?: number; topics: string[]; maxPerPublisher?: number; maxForeignShare?: number; slotRules?: Record<string, { sub: string | string[]; match?: RegExp }[]>; subjects?: Record<string, [string, RegExp][]>; diverseTop?: number; nearDuplicate?: NearDuplicateOptions; onDrop?: ((d: DropRecord) => void) | null }): Record<string, (T & { isBackground: boolean })[]>;
export function tagGlossary(item: { title: string; excerpt?: string | null; lead?: string | null }, glossary: { id: string; pattern: RegExp }[]): string[];
