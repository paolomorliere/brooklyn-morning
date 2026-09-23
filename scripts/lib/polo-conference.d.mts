export type ConferenceId = 'MAWPC' | 'NWPC';
export interface ConferenceFixture {
  key: string;
  conference: ConferenceId;
  url: string;
  date: string;
  time: string | null;
  teams: string[];
  names: string[];
  cwpaScores: Record<string, number | null> | null;
}
export interface ParsedConferenceSchedule {
  conference: ConferenceId;
  url: string;
  fixtures: ConferenceFixture[];
  skipped: { row: string; why: string }[];
  ambiguous: string[];
  error?: string;
}
export function parseMatchup(raw: string): { names: string[]; slugs: string[] } | null;
export function fixtureKey(date: string, a: string, b: string): string;
export function parseConferenceSchedule(
  html: string,
  ctx: { conference: ConferenceId; url: string; seasonYear: number },
): ParsedConferenceSchedule;
export function indexFixtures(schedules: ParsedConferenceSchedule[]): { index: Map<string, ConferenceFixture>; dropped: string[] };
export function classifyGame(
  game: { date: string; teams: string[] },
  index: Map<string, ConferenceFixture>,
): { conference: ConferenceId; conferenceSource: string } | null;
