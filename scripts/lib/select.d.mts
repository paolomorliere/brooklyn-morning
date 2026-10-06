import type { Fact, SectorGroup, Submission } from './fundamentals.d.mts';
import type { Announcement, EarningsEstimate } from './earnings.d.mts';
import type { Bar, Dividend, Vol } from './signals.d.mts';

export interface Signal {
  key: string;
  label: string;
  direction: 1 | -1;
  groups: string[] | null;
}

export const LIMITS: {
  minClose: number;
  minMedianDollarVolume: number;
  minSessions: number;
  maxFinancialsAgeDays: number;
  volatilityPercentile: number;
  maxLeverage: number;
  maxOpenPositions: number;
  maxPerDivision: number;
  announcementQuietSessions: number;
  maxExtension: number;
  minPeerGroup: number;
};
export const SIGNALS: Signal[];
export const CANDIDATE_SIGNALS: Signal[];
export function signalsForGroup(group: string, opts?: { include?: string[] }): Signal[];

export interface Candidate {
  ticker: string;
  name?: string;
  cik?: string;
  sic?: string;
  bars: Bar[];
  dividends?: Dividend[];
  facts: Fact[];
  submissions?: Submission[];
  announcements?: Announcement[];
  earningsEstimate?: EarningsEstimate | null;
}

export interface Figures {
  revenueGrowth: number | null;
  growthAcceleration: number | null;
  quarterYoY: number | null;
  quarterYoYPrior: number | null;
  revenueTtm: number | null;
  revenueTtmPrior: number | null;
  grossMargin: number | null;
  grossMarginPrior: number | null;
  grossMarginTrend: number | null;
  operatingMargin: number | null;
  operatingMarginPrior: number | null;
  operatingMarginTrend: number | null;
  netIncomeTtm: number | null;
  operatingCashFlowTtm: number | null;
  capexTtm: number | null;
  grossProfitTtm: number | null;
  freeCashFlowTtm: number | null;
  assets: number | null;
  equity: number | null;
  shares: number | null;
  sharesAsOf: string | null;
  totalDebt: number | null;
  cash: number | null;
  netDebt: number | null;
  balanceSheetAsOf: string | null;
  marketCap: number | null;
  cashConversion: number | null;
  grossProfitability: number | null;
  returnOnEquity: number | null;
  equityToAssets: number | null;
  leverage: number | null;
  netLeverage: number | null;
  fcfYield: number | null;
  earningsYield: number | null;
  peerPercentile?: number | null;
}

export interface CompanyFigures {
  ok: boolean;
  reason?: string;
  group: SectorGroup;
  division?: string;
  majorGroup?: string | null;
  periodEnd?: string;
  yearAgoEnd?: string;
  tags?: Record<string, string>;
  dropped?: { key: string; why: string }[];
  figures?: Figures;
  provenance?: unknown;
}

export interface ScreenedRow {
  ticker: string;
  name?: string;
  cik?: string;
  sic?: string;
  eligible: boolean;
  /** The Stage A test that removed this candidate, or null when it passed. */
  test: string | null;
  reason: string | null;
  group?: SectorGroup;
  division?: string;
  majorGroup?: string | null;
  periodEnd?: string;
  tags?: Record<string, string>;
  dropped?: { key: string; why: string }[];
  figures?: Figures;
  provenance?: unknown;
  filing?: { adsh: string; form: string; period: string | null; filed: string | null; accepted: string };
  earnings?: { inWindow: boolean; nearWindow: boolean; confirmed?: boolean; estimate: EarningsEstimate | null };
  metrics?: {
    close: number;
    asOf: string;
    liquidity: number;
    sessions: number;
    sma50: number | null;
    sma200: number | null;
    volatility: Vol | null;
    extension: number | null;
    momentum12_1: number | null;
    return5: number | null;
    return126: number | null;
    spy126: number | null;
    sector126: number | null;
    relativeStrengthSpy: number | null;
    relativeStrengthSector: number | null;
  };
  peerBasis?: { measure: string; against: string; widened: boolean; peers: number } | null;
}

export interface RankedRow extends ScreenedRow {
  contributions: { key: string; label: string; value: number | null; z: number; direction: number; cohort: number; trimmed: number }[];
  signalsUsed: string[];
  signalsDropped: { key: string; why: string }[];
  scoredAgainst: string | null;
  composite: number | null;
  rankScore?: number;
  stretched: boolean;
  stretchedNote: string | null;
}

export interface ScreenContext {
  T: string;
  asOf: string;
  calendar?: string[];
  spy?: { return126: number | null } | null;
  sectorReturns?: Record<string, number>;
  openPositions?: { ticker: string; division: string }[];
  horizonWindow?: { entry: string; exit: string };
}

export function companyFigures(candidate: Candidate, opts: { asOf: string; close: number }): CompanyFigures;
export function screenCandidate(candidate: Candidate, ctx: ScreenContext): ScreenedRow;
export function applyVolatilityCap(rows: ScreenedRow[], opts?: { percentile?: number }): { rows: ScreenedRow[]; cutoff: number | null };
export function peerPercentiles(rows: ScreenedRow[], opts?: { minPeerGroup?: number }): ScreenedRow[];
export function rankCandidates(rows: ScreenedRow[], opts?: { include?: string[]; minPeerGroup?: number }): RankedRow[];
export function decide(
  rows: ScreenedRow[],
  opts?: { include?: string[]; T?: string; scanned?: number },
): {
  pick: RankedRow | null;
  runnersUp: RankedRow[];
  T?: string;
  scanned: number;
  eligible: number;
  reason: string | null;
  binding: { test: string; reason: string; count: number } | null;
};
