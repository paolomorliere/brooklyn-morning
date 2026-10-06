export interface StrategyRules {
  strategyVersion: number;
  name: string;
  frozenAt: string;
  horizonSessions: number;
  positionsPerSession: number;
  capitalPerPosition: string;
  costBasisPoints: { stock: number; benchmark: number };
  benchmarks: string[];
  eligibility: {
    minClose: number;
    minMedianDollarVolume: number;
    minSessions: number;
    maxFinancialsAgeDays: number;
    volatilityPercentile: number;
    maxLeverage: number;
    maxOpenPositions: number;
    maxPerDivision: number;
    announcementQuietSessions: number;
    trendFilter: string;
  };
  ranking: {
    weighting: string;
    zScoreCohort: string;
    winsorisation: number;
    signals: string[];
    candidateSignalsAdopted: string[];
    candidateSignalsUnderTest: string[];
    overextendedRankedLast: number;
  };
  sources: Record<string, string>;
  validation: { status: string; developmentWindow: string | null; heldOutWindow: string | null; note: string };
}
export function loadStrategy(): Promise<{ rules: StrategyRules; hash: string }>;
export function ruleText(rules: StrategyRules): string;
export function validationNote(rules: StrategyRules): string;
export function stockCardFor(feed: unknown, date: string): Record<string, unknown>;
