export const TOPICS: string[];
export const FEEDS: { id: string; name: string; topic: string; url: string; weight: number; lead: boolean; lang?: string }[];
export const BOOSTS: Record<string, [RegExp, number][]>;
export const MATCH_REPORT: RegExp[];
export const MAX_AGE_HOURS: Record<string, number>;
export const PER_TOPIC: number;
