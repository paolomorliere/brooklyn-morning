export interface IdentityRow { opponentRaw: string; opponentSite?: string | null; selfSlug?: string; selfSite?: string | null }
export interface IdentityMerge { host: string | null; slugs: string[]; merged: boolean; winner?: string; why: string }
export function hostOf(url: string | null | undefined): string | null;
export function namesCompatible(a: string, b: string): boolean;
export function buildIdentity(rows: IdentityRow[]): { canonical: Map<string, string>; merges: IdentityMerge[] };
export function canonicalize(slug: string, canonical: Map<string, string>): string;
