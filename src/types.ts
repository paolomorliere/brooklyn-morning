// Shared domain types. Personal data lives in the `personal` IndexedDB; the catalog in `catalog`.

export type TopicId = 'ai' | 'world' | 'finance' | 'waterpolo' | 'soccer';

export interface Story {
  id: string;
  topic: TopicId;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string; // ISO
  /** Publisher-supplied excerpt from the feed, HTML stripped. Labeled "From publisher". */
  excerpt: string;
  excerptSource: 'rss';
  /** First paragraphs extracted at build time from the article page, or null. Labeled "Opening of the article". */
  lead: string | null;
  leadSource: 'extracted' | null;
  isBackground: boolean;
  glossaryTerms: string[];
  lang?: string;
  sub?: string | null;
  /** Publisher-supplied image (feed media or og:image). May fail to load if the publisher blocks hotlinking. */
  imageUrl?: string | null;
}

export interface Quote { text: string; who: string }

export interface StockPick {
  kind: 'pick';
  date: string;
  ticker: string;
  name: string;
  lastClose: number;
  asOf: string;
  r5: number;
  r20: number;
  volRatio: number;
  pctOfHigh60: number;
  mentions: number;
  rule: string;
  scanned?: number;
}
export interface StockScoreboard {
  kind: 'scoreboard';
  weekOf: string;
  rows: { date: string; ticker: string; name: string; openAtPick: number | null; latestClose: number | null; changePct: number | null; asOf: string | null }[];
  combinedPct: number | null;
  counted: number;
  best?: string | null;
  worst?: string | null;
  note: string;
  rule: string;
}
export interface StockUnavailable { kind: 'unavailable'; reason: string; rule: string }
export type StockBlock = StockPick | StockScoreboard | StockUnavailable;

export interface SourceStatus {
  id: string;
  name: string;
  topic: TopicId;
  ok: boolean;
  items: number;
  error?: string;
}

export interface Edition {
  schemaVersion: 1;
  date: string; // YYYY-MM-DD in America/New_York
  preparedAt: string; // ISO
  quote?: Quote | null;
  stock?: StockBlock | null;
  stories: Story[];
  sources: SourceStatus[];
  lessonRef: { week: number; day: number } | null;
}

export interface Lesson {
  id: string; // week-01-d1
  week: number;
  day: number; // 1..7
  theme: string;
  title: string;
  explanation: string[]; // paragraphs
  example: string[];
  exercise: { prompt: string; answer: string } | null;
  readMinutes: number;
}

export interface Task {
  id: string;
  text: string;
  notes: string;
  categoryId: string;
  starred: boolean;
  createdAt: string;
  completedAt: string | null;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  system?: boolean; // Inbox
}

export type Section =
  | 'Produce'
  | 'Bakery'
  | 'Dairy & Eggs'
  | 'Meat & Seafood'
  | 'Frozen'
  | 'Pantry'
  | 'Snacks'
  | 'Beverages'
  | 'Cheese & Deli'
  | 'Flowers & Home'
  | 'Other';

export interface Product {
  id: string; // OFF barcode
  name: string;
  size: string;
  section: Section;
  tags: string[];
  imageUrl: string | null;
}

export interface ListItem {
  id: string;
  productId: string | null; // null = "Other item"
  name: string;
  size: string;
  section: Section;
  imageUrl: string | null;
  qty: number;
  addedAt: string;
}

export interface Favorite {
  key: string; // productId, or "other:<lowercase name>" for free-text items
  productId: string | null;
  name: string;
  size: string;
  section: Section;
  imageUrl: string | null;
  addedAt: string;
}

export interface HistoryEvent {
  id: string;
  productId: string | null;
  name: string;
  section: Section;
  imageUrl: string | null;
  kind: 'added' | 'purchased';
  at: string;
}

export interface LibraryEntry {
  id: string;
  kind: 'story' | 'lesson' | 'own';
  title: string;
  url: string | null;
  note: string;
  publisher?: string;
  tags: string[];
  savedAt: string;
}

export interface Prefs {
  storiesPerSection: number;
  topicsEnabled: Record<TopicId, boolean>;
  lastBackupAt: string | null;
  hiddenSuggestions: string[];
}

export interface QuizResult {
  week: number; // sequence week number
  packWeek: number;
  score: number;
  total: number;
  answers: number[]; // chosen index per question
  takenAt: string;
}

export interface LessonProgress {
  startMonday: string; // YYYY-MM-DD
  readLessonIds: string[];
  quizResults?: QuizResult[];
}

export const TOPIC_META: Record<TopicId, { label: string; blurb: string }> = {
  ai: { label: 'AI & Data', blurb: 'Tools, research, and what it means for analysts.' },
  world: { label: 'World, US & France', blurb: 'Top stories from NPR, BBC, Le Monde, France 24.' },
  finance: { label: 'Politics & Finance', blurb: 'Plain-language sources. Tap a term for a definition.' },
  waterpolo: { label: 'Water polo', blurb: 'Whatever the day brings: NCAA, LEN, USA Water Polo.' },
  soccer: { label: 'Soccer', blurb: 'Ligue 1, Les Bleus, Europe. News over scores.' },
};

export const TOPIC_ORDER: TopicId[] = ['ai', 'world', 'finance', 'waterpolo', 'soccer'];

// ---------- Water polo (NCAA men's, 2026) ----------

export interface PoloTeam {
  name: string;
  watched: boolean;
  /** Path relative to the site base, e.g. "logos/liu.webp". Null means draw initials instead. */
  logo: string | null;
}

export interface PoloSource {
  id: string;
  url: string;
  verifiedAt: string;
  /** Official recap or box score for this game, when the school links one. */
  detailUrl: string | null;
  /** What this page said, verbatim, keyed by team slug. */
  reading: Record<string, number> | null;
}

export interface PoloConflict {
  detectedAt: string;
  readings: { source: string; url: string; scores: Record<string, number> }[];
  /** True when no result has ever been verified, so the numbers are not shown at all. */
  withheld?: boolean;
  showing?: Record<string, number>;
  /** Set when an official box score or recap settled the disagreement. */
  resolved?: { evidence: string; note: string };
}

export interface PoloGame {
  id: string;
  /** Date the game was played, not the date it was discovered. */
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, 24-hour, New York
  home: { team: string; score: number | null };
  away: { team: string; score: number | null };
  /** True when nobody hosted; the two sides are then ordered by slug, not by hosting. */
  neutral: boolean;
  /** Slug of the school that hosted, or null at a neutral site. */
  hosted: string | null;
  ot: string | null; // "OT" | "2OT"
  exhibition: boolean;
  tournament: string | null;
  venue: string | null;
  sources: PoloSource[];
  conflict: PoloConflict | null;
  firstSeenAt: string | null;
}

export interface PoloSourceStatus {
  id: string;
  school: string;
  display: string;
  url: string;
  ok: boolean;
  checkedAt: string;
  found: number;
  error: string | null;
  note: string | null;
}

export interface PoloFeed {
  schemaVersion: 1;
  season: number;
  sport: string;
  builtAt: string;
  sources: PoloSourceStatus[];
  teams: Record<string, PoloTeam>;
  games: PoloGame[];
}
