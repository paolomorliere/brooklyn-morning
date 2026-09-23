export interface SchoolConfig {
  id: string;
  school: string;
  display: string;
  site: string;
  url: string;
  generation: 'classic' | 'nextgen';
  sportSlug?: string;
  sportNote?: string;
  seasonNote?: string;
}
export const SEASON: number;
export const SPORT_LABEL: string;
export const SEASON_START: string;
export const SEASON_END: string;
export const SCHOOLS: SchoolConfig[];
export const WATCHED_IDS: Set<string>;
export const NON_TEAM_PATTERNS: RegExp[];
export interface Resolution { scores: Record<string, number>; evidence: string; note: string }
export const RESOLUTIONS: Map<string, Resolution>;
export function resolutionFor(date: string, slugA: string, slugB: string): Resolution | null;
export function normalizeTeamName(raw: unknown): string;
export function isNonTeam(name: unknown): boolean;
export function teamSlug(raw: unknown): string;
export function displayName(slug: string, fallback: string): string;
