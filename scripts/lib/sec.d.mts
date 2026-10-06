import type { Fact, Submission } from './fundamentals.d.mts';

export function secUserAgent(): string;
export const CLIENT_UA: string;
export function secGet(url: string, opts?: { binary?: boolean; timeoutMs?: number }): Promise<unknown>;
export function fetchNasdaqTraded(): Promise<string>;
export function fetchCompanyTickers(): Promise<unknown>;

export function quarterOf(date: string): { year: number; q: number };
export function quartersBack(n: number, asOf: string): { year: number; q: number }[];
export function fsdsUrl(quarter: { year: number; q: number }): string;
export function fetchQuarterDigest(
  quarter: { year: number; q: number },
  opts?: { tags?: Set<string> | null; ciks?: Set<string> | null },
): Promise<{ year: number; q: number; subs: Submission[]; facts: Fact[]; zipBytes: number }>;

export interface Digest { subs: Submission[]; facts: Fact[]; byAdsh: Map<string, Submission> }
export function encodeDigest(digest: { subs: Submission[]; facts: Fact[] }): string;
export function decodeDigest(text: string): Digest;
export function writeDigest(path: string, digest: { subs: Submission[]; facts: Fact[] }): Promise<string>;
export function readDigest(path: string): Promise<Digest | null>;

export function parseDailyIndex(
  text: string,
  opts?: { forms?: RegExp },
): { form: string; name: string; cik: string; filed: string | null; path: string }[];
export function fetchDailyIndex(
  date: string,
): Promise<{ form: string; name: string; cik: string; filed: string | null; path: string }[] | null>;
export function padCik(cik: string | number): string;
export function fetchSubmissionIndex(cik: string | number): Promise<unknown>;
export function factsFromCompanyFacts(json: unknown, opts?: { tags?: Set<string> | null; cik?: string | null }): Fact[];
export function submissionsFromFacts(facts: Fact[], opts?: { sic?: string }): Submission[];
export function mergeFacts(digestFacts: Fact[], overlayFacts: Fact[]): Fact[];
export function digestHorizon(subs: Submission[] | null | undefined): string | null;
export function sicByCik(subs: Submission[] | null | undefined): Map<string, string>;
export function ymdToIso(ymd: string | number | null | undefined): string | null;
