export type SectorGroup = 'operating' | 'finance' | 'utilities' | 'energy';

export interface Submission {
  adsh: string;
  cik: string;
  name: string;
  sic: string;
  form: string;
  period: string | null;
  fy: string;
  fp: string;
  filed: string | null;
  accepted: string;
  prevrpt: boolean;
}

export interface Fact {
  cik: string;
  adsh: string;
  tag: string;
  version: string;
  ddate: string;
  qtrs: number;
  uom: string;
  value: number;
  accepted: string;
  filed: string | null;
  form: string;
  period: string | null;
  fy: string;
  fp: string;
  prevrpt: boolean;
}

export interface SeriesPoint {
  ddate: string;
  value: number;
  tag: string;
  qtrs: number;
  uom: string;
  accepted: string;
  filed: string | null;
  adsh: string;
  form: string;
  fy: string;
  fp: string;
  derived: boolean;
  derivedFrom?: { ytd: string; base: string; qtrs: number };
}

export interface Ttm {
  value: number;
  tag: string;
  firstQuarterEnd: string;
  end: string;
  quarters: string[];
  derived: boolean;
  accepted: string;
  filed: string | null;
  adsh: string;
  form: string;
}

export const FINANCIAL_FORMS: Set<string>;
export const TAGS: Record<string, string[]>;
export function allTags(): Set<string>;

export function ymdToIso(ymd: string | number | null | undefined): string | null;
export function acceptedToIso(accepted: string | null | undefined): string | null;
export function daysBetween(a: string, b: string): number;
export function addDays(date: string, n: number): string | null;

export function forEachTsvRow(input: Buffer | string, cb: (row: Record<string, string>) => void): number;
export function parseTsvRows(text: string): Record<string, string>[];
export function digestSubmissions(
  input: Buffer | string,
  opts?: { forms?: Set<string> | null; ciks?: Set<string> | null },
): { byAdsh: Map<string, Submission>; byCik: Map<string, Submission[]> };
export function isConsolidated(row: { segments?: string; coreg?: string }): boolean;
export function collectFacts(input: Buffer | string, byAdsh: Map<string, Submission>, opts?: { tags?: Set<string> | null }): Fact[];

export function seriesFor(
  facts: Fact[],
  opts: { tag: string; qtrs: number; uom?: string | null; asOf: string },
): Map<string, SeriesPoint>;
export function quarterlySeries(facts: Fact[], opts: { tag: string; uom?: string | null; asOf: string }): Map<string, SeriesPoint>;
export function instantSeries(facts: Fact[], opts: { tag: string; uom?: string | null; asOf: string }): Map<string, SeriesPoint>;
export function ttmAt(series: Map<string, SeriesPoint>, ddate: string): Ttm | null;
export function previousQuarterEnd(series: Map<string, SeriesPoint>, ddate: string): string | null;
export function yearAgoEnd(series: Map<string, SeriesPoint>, ddate: string): string | null;
export function latestEnd(series: Map<string, SeriesPoint>, ddate?: string): string | null;
export function chooseQuarterlyTag(
  facts: Fact[],
  preference: string[],
  opts?: { asOf: string; uom?: string | null; quarters?: number; maxAgeDays?: number | null },
): { tag: string; series: Map<string, SeriesPoint>; end: string } | null;
export function chooseInstantTag(
  facts: Fact[],
  preference: string[],
  opts?: { asOf: string; uom?: string | null; maxAgeDays?: number | null },
): { tag: string; series: Map<string, SeriesPoint>; end: string; fact: SeriesPoint } | null;

export function sectorGroupOf(sic: string | number | null | undefined): SectorGroup;
export function sicDivision(sic: string | number | null | undefined): string;
export function sicMajorGroup(sic: string | number | null | undefined): string | null;
export function latestFinancialFiling(subs: Submission[] | null | undefined, asOf: string): Submission | null;
