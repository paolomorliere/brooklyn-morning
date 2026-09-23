export interface PollIndexEntry { week: number; url: string; label: string }
export interface ParsedPollRow {
  rank: string;
  name: string;
  team: string;
  previous: string | null;
  points: number | null;
  pointsText: string | null;
}
export interface ParsedPoll {
  season: number;
  week: number | null;
  title: string;
  heading: string;
  publishedAt: string | null;
  previous: { week: number; label: string } | null;
  sourceUrl: string;
  rows: ParsedPollRow[];
}
export function parsePollIndex(html: string, season: number): PollIndexEntry[];
export function parsePublished(raw: string | null | undefined): string | null;
export function parsePreviousHeader(raw: string | null | undefined): { week: number; label: string } | null;
export function parsePollArticle(
  html: string,
  ctx: { url: string; season: number; week?: number | null },
): { ok: true; poll: ParsedPoll } | { ok: false; error: string };
export function validatePoll(poll: ParsedPoll | null, opts?: { minRows?: number; season?: number }): string[];
export function supersedes(next: { season: number; week: number | null } | null, current: { season: number; week: number } | null): boolean;
