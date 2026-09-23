export interface ParseContext { url: string; generation: 'classic' | 'nextgen'; seasonYear: number }
export interface PoloRow {
  sourceGameId: string | null;
  date: string;
  time: string | null;
  opponentRaw: string;
  us: number;
  them: number;
  outcome: 'W' | 'L' | 'T';
  ot: string | null;
  neutral: boolean | null;
  away: boolean;
  exhibition: boolean;
  venue: string | null;
  tournament: string | null;
  opponentLogo: string | null;
  opponentSite: string | null;
  conferenceMarker: string | null;
  detailUrl: string | null;
}
export function normalizeOvertime(raw: string | null | undefined): string | null;
export function parseGameDate(raw: string, seasonStartYear: number): { date: string; time: string | null } | null;
export function parseTime(raw: string): string | null;
export function parseResult(raw: string): { outcome: 'W' | 'L' | 'T'; us: number; them: number; ot: string | null } | null;
export function parseClassic(html: string, ctx: ParseContext): PoloRow[];
export function parseNextgen(html: string, ctx: ParseContext): PoloRow[];
export function parseSchedule(html: string, ctx: ParseContext): PoloRow[];
