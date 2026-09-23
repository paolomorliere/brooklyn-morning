import type { SchoolConfig } from '../waterpolo.config.d.mts';
import type { PoloRow } from './polo-parse.d.mts';
export interface Candidate { id: string; slot: number; bucket: string; date: string; time: string | null; teams: string[]; scores: Record<string, number>; [k: string]: unknown }
export interface InternalGame { id: string; date: string; time: string | null; teams: string[]; scores: Record<string, number> | null; homeTeam: string | null; neutral: boolean | null; ot: string | null; exhibition: boolean; tournament: string | null; venue: string | null; sources: Record<string, unknown>[]; conflict: Record<string, unknown> | null; firstSeenAt: string | null; [k: string]: unknown }
export interface MergeStats { added: number; corrected: number; unchanged: number; conflicts: number; resolved: number }
export function teamPair(a: string, b: string): string[];
export function gameKey(season: number, slugA: string, slugB: string, date: string, slot?: number): string;
export function toCandidates(rows: PoloRow[], cfg: SchoolConfig, verifiedAt: string, season?: number): Candidate[];
export function mergeGames(archive: InternalGame[], candidates: Candidate[]): { games: InternalGame[]; stats: MergeStats };
export function toFeedGames(games: InternalGame[]): import('../../src/types').PoloGame[];
export function fromFeedGames(feedGames: import('../../src/types').PoloGame[]): InternalGame[];
export function buildTeams(games: import('../../src/types').PoloGame[], names: Map<string, string>, logos: Map<string, string>): Record<string, import('../../src/types').PoloTeam>;
export function involvesWatched(game: { home: { team: string }; away: { team: string } }): boolean;
