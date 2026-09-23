export const PRIMARY: { weekday: string; from: string };
export const BACKUP: { weekday: string; from: string };
export interface PollDueVerdict { action: 'run' | 'skip'; slot: 'primary' | 'backup' | null; key: string | null; why: string }
export interface PollRunRecord { week: number; at: string }
export function nyParts(now: Date, tz?: string): { date: string; time: string; weekday: string };
export function shiftDate(date: string, days: number): string;
export function decide(
  now: Date,
  runs?: Record<string, PollRunRecord>,
  opts?: { seasonStart?: string; seasonEnd?: string; tz?: string },
): PollDueVerdict;
export function claim(key: string, week: number | string, at: string): Promise<void>;
