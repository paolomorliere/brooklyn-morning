export interface TradedRow {
  symbol: string;
  name: string;
  exchange: string;
  etf: string;
  testIssue: string;
  financialStatus: string;
  nextShares: string;
}
export interface Universe {
  symbols: string[];
  names: Record<string, string>;
  byReason: Record<string, number>;
  total: number;
}
export function parseNasdaqTraded(text: string): { rows: TradedRow[]; createdAt: string | null };
export function ineligibleReason(row: Partial<TradedRow>): string | null;
export function issuerName(name: string): string;
export function buildUniverse(rows: TradedRow[]): Universe;
export function parseCompanyTickers(json: unknown): Record<string, { cik: string; title: string }>;
export function tapeSymbol(symbol: string): string;
