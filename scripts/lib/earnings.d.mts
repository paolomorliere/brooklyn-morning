export interface IndexedFiling {
  accession: string;
  form: string;
  filed: string;
  reportDate: string | null;
  accepted: string;
  items: string[];
}
export interface Announcement {
  date: string;
  accepted: string;
  accession: string;
  reportDate: string | null;
}
export interface EarningsEstimate {
  date: string;
  basis: string;
  spreadDays: number;
  gaps: number[];
  confirmed: false;
}
export const EARNINGS_ITEM: string;
export const MATERIAL_ITEMS: Set<string>;
export function parseItems(items: string | null | undefined): string[];
export function parseSubmissionIndex(json: unknown): IndexedFiling[];
export function isEarningsRelease(filing: Partial<IndexedFiling> | null | undefined): boolean;
export function isMaterialEvent(filing: Partial<IndexedFiling> | null | undefined): boolean;
export function earningsAnnouncements(filings: IndexedFiling[], opts?: { asOf?: string }): Announcement[];
export function announcementGaps(announcements: Announcement[]): number[];
export function estimateNextEarnings(
  announcements: Announcement[] | null | undefined,
  opts?: { asOf?: string; maxGaps?: number },
): EarningsEstimate | null;
export function announcedBetween(announcements: Announcement[], from: string, to: string): Announcement[];
export function materialEventsBetween(
  filings: IndexedFiling[],
  from: string,
  to: string,
): { date: string; items: string[]; accession: string }[];
export function earningsRiskInWindow(
  estimate: EarningsEstimate | null | undefined,
  window: { entry: string; exit: string },
): { inWindow: boolean; nearWindow: boolean; confirmed?: boolean; estimate: EarningsEstimate | null };
