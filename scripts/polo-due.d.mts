export const SLOTS: string[];
export interface DueVerdict { action: 'run' | 'skip'; slot: string | null; key: string | null; why: string }
export function nyParts(now: Date, tz?: string): { date: string; time: string; weekday: string };
export function decide(now: Date, runs?: Record<string, string>, opts?: { slots?: string[]; seasonStart?: string; seasonEnd?: string; tz?: string }): DueVerdict;
export function claim(key: string, at: string): Promise<void>;
