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

/**
 * Version 1 of "Stock in Focus", kept exactly as it was published.
 *
 * Version 1 ranked mostly on a five-day return over 104 tickers chosen by hand, stated no holding
 * period, used unadjusted closes, and had no tests. It stopped picking on 2026-10-06. Its records are
 * not rewritten — `strategyVersion` is absent from every historical file and is read as 1, so the
 * archived editions stay byte-identical while every pick is still attributable to the rule that made
 * it. v1 and v2 results are reported separately and never merged.
 */
export interface StockPickV1 {
  kind: 'pick';
  strategyVersion?: 1;
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

/** One figure on the card, with the filing it came from. Verified evidence, not interpretation. */
export interface StockEvidence {
  label: string;
  value: string;
  /** What the figure covers: a trailing year, a quarter, or an instant. */
  period?: string | null;
  /** The date the filing it came from was accepted by EDGAR. */
  filed?: string | null;
  /** The XBRL tag used, because `Revenues` and the ASC 606 tags are not the same number. */
  tag?: string | null;
  /** True where this is a comparison or a judgement rather than a figure off a filing. */
  interpretation?: boolean;
}

/** One signal's contribution to the ranking, so the card can show what produced the score. */
export interface StockSignal {
  key: string;
  label: string;
  value: number | null;
  /** The z-score against the cohort, already signed so positive always means "helped". */
  z: number;
  cohort: number;
}

/** A peer in the same SIC major group, measured by the same method from the same source. */
export interface StockPeer {
  ticker: string;
  name?: string | null;
  revenueTtm: number | null;
  revenueGrowth: number | null;
  quarterYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  cashConversion: number | null;
  freeCashFlowTtm: number | null;
}

export interface StockEarningsRisk {
  /** Always an estimate: no free source publishes a confirmed forward date. */
  estimate: string | null;
  basis: string | null;
  spreadDays: number | null;
  confirmed: boolean;
  inWindow: boolean;
  nearWindow: boolean;
}

/**
 * Version 2: one position per session, held 21 sessions, chosen in three stages.
 *
 * Every input value is stored with its source and the timestamp it was known at, so a later change to
 * the rules can never rewrite an earlier selection. `strategyHash` is the hash of the frozen rule
 * file that made this pick.
 */
export interface StockPickV2 {
  kind: 'pick';
  strategyVersion: 2;
  strategyHash: string;
  /** The edition date this pick is for. */
  date: string;
  publishedAt: string;
  /** The last completed session the decision was made on. */
  decisionSession: string;
  ticker: string;
  name: string;
  cik: string | null;
  sic: string | null;
  sector: string;
  industry: string | null;
  /** The latest reference close at the decision session — explicitly not the entry price. */
  referenceClose: number;
  referenceCloseDate: string;
  horizonSessions: number;
  plannedEntry: string | null;
  plannedExit: string | null;
  /** One sentence on which stage decided it and why. */
  thesis: string;
  /** A ranking position among the day's eligible candidates, 0–100. Never a probability. */
  rankScore: number;
  composite: number;
  scoredAgainst: string;
  scanned: number;
  eligible: number;
  signals: StockSignal[];
  /** Signals that do not exist for this company, and why. Never scored as zero. */
  signalsDropped: { key: string; why: string }[];
  evidence: StockEvidence[];
  peers: StockPeer[];
  peerBasis: string | null;
  runnersUp: { ticker: string; name: string; rankScore: number; why: string }[];
  counterargument: string;
  invalidation: string[];
  risks: string[];
  earnings: StockEarningsRisk;
  rule: string;
  validation: string;
  sources: Record<string, string>;
}

/**
 * The record of positions taken: v2's own, and v1's still running to the end of their horizon.
 *
 * Open positions never enter an average. The old recap combined five positions held 5, 4, 3, 2 and 1
 * sessions into one number; `mixedHorizonMean` exists only to reproduce that figure for the v1
 * record, under a name that cannot be mistaken for a return.
 */
export interface StockRecapRow {
  strategyVersion: 1 | 2;
  date: string;
  ticker: string;
  name: string;
  status: 'complete' | 'open' | 'not-entered' | 'unpriced';
  reason?: string | null;
  entryDate?: string | null;
  entryPrice?: number | null;
  valueDate?: string | null;
  valuePrice?: number | null;
  sessionsHeld?: number;
  horizon?: number;
  netPct?: number | null;
  grossPct?: number | null;
  excessSpyPct?: number | null;
  excessRspPct?: number | null;
}

export interface StockRecap {
  kind: 'recap';
  strategyVersion: 1 | 2;
  asOf: string;
  rows: StockRecapRow[];
  completed: number;
  open: number;
  meanNetPct: number | null;
  meanExcessSpyPct: number | null;
  meanExcessRspPct: number | null;
  winRate: number | null;
  mixedHorizonMeanPct: number | null;
  horizonsSpanned: number[];
  note: string;
}

export interface StockUnavailable {
  kind: 'unavailable';
  reason: string;
  rule: string;
  strategyVersion?: 1 | 2;
  /** The decision date of the last pick that was published, so a stale card can say so. */
  lastPublishedFor?: string | null;
}

/** Version 1's weekend scoreboard, as it was published. Not produced any more. */
export interface StockScoreboard {
  kind: 'scoreboard';
  strategyVersion?: 1;
  weekOf: string;
  rows: { date: string; ticker: string; name: string; openAtPick: number | null; latestClose: number | null; changePct: number | null; asOf: string | null }[];
  combinedPct: number | null;
  counted: number;
  best?: string | null;
  worst?: string | null;
  note: string;
  rule: string;
}

/** What the edition carries. `StockPick` stays an alias so v1 readers keep compiling. */
export type StockPick = StockPickV1;
export type StockBlock = StockPickV1 | StockPickV2 | StockScoreboard | StockRecap | StockUnavailable;

/** The published feed the stocks build writes, read by the edition build and by the app. */
export interface StockFeed {
  builtAt: string;
  /** The edition date this file is for. A different date means the card is stale, and says so. */
  decidedFor: string;
  strategyVersion: 2;
  strategyHash: string;
  block: StockBlock;
  recaps: StockRecap[];
}

/** Pure: which rule made a pick. Absent means version 1, which never wrote the field. */
export function strategyVersionOf(block: { strategyVersion?: number } | null | undefined): 1 | 2 {
  return block?.strategyVersion === 2 ? 2 : 1;
}

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
  /**
   * Which lesson this edition carried. Written by the app the first time the edition is re-read,
   * pinning the resolved lesson and the pack version it came from so a later content edit cannot
   * silently change what an archived edition says it contained.
   */
  lessonRef?: { week: number; day: number; lessonId?: string; packVersion?: string | null } | null;
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

/**
 * What a saved item points at, so it can be read and not just listed.
 *
 * Kept separate from the editable fields above it: renaming a saved item or rewriting its note
 * must never break the link to its content.
 */
export type LibraryRef =
  | { kind: 'lesson'; lessonId: string; packWeek: number; day: number; packVersion: string | null }
  | { kind: 'story'; storyId: string | null; editionDate: string | null; url: string };

/**
 * A copy of the content as the app had it when the item was saved.
 *
 * Editions are kept for 14 days, so a story saved five weeks ago has no edition left to resolve
 * against. The snapshot is what keeps it readable. It is the app's own stored summary, never a
 * copy of the publisher's full article.
 */
export interface LibrarySnapshot {
  /** Publisher-supplied excerpt, as shown in the edition. */
  excerpt?: string;
  /** Build-time extracted opening paragraphs, as shown in the edition. */
  lead?: string | null;
  publishedAt?: string;
  imageUrl?: string | null;
  topic?: TopicId;
  /** Which edition this was taken from, for the "from the edition of…" line. */
  editionDate?: string | null;
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
  /** Where the readable content lives. Absent on entries saved before reading existed. */
  ref?: LibraryRef;
  /** The content itself, for items whose source may expire from the archive. */
  snapshot?: LibrarySnapshot;
  /** Set when a repair pass tried to resolve this entry's content and could not. */
  contentMissing?: string;
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
  /**
   * Monday of the Mon–Sun week this quiz belongs to, in New York. The stable identifier: the
   * sequence number shifts if the start date is ever repaired, a date does not.
   */
  weekStart?: string;
  /** Content version of the pack the questions came from. */
  packVersion?: string | null;
  score: number;
  total: number;
  answers: number[]; // chosen index per question
  takenAt: string;
}

/** A quiz started but not submitted. Kept so answers survive navigation and app restarts. */
export interface QuizDraft {
  weekStart: string;
  packWeek: number;
  packVersion: string | null;
  answers: (number | null)[];
  updatedAt: string;
}

export interface LessonProgress {
  startMonday: string; // YYYY-MM-DD
  readLessonIds: string[];
  quizResults?: QuizResult[];
  /** In-progress quizzes, one per week, cleared when that week's quiz is submitted. */
  quizDrafts?: QuizDraft[];
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
  /**
   * `full` means this team's own 2026 schedule page was read; `partial` means the games shown are
   * only the ones other schools reported, so its record and standings row may be incomplete.
   */
  coverage?: 'full' | 'partial';
  /** Why the team's own page could not be read, when it could not. */
  coverageNote?: string;
  /** Official 2026 conference, from the CWPA's membership. Null for a team in neither. */
  conference?: 'MAWPC' | 'NWPC' | null;
  scheduleUrl?: string | null;
  rosterUrl?: string | null;
}

export interface PoloSource {
  id: string;
  url: string;
  verifiedAt: string;
  /** Official recap or box score for this game, when the school links one. */
  detailUrl?: string | null;
  /** What this page said, verbatim, keyed by team slug. Absent when it matched the result shown. */
  reading?: Record<string, number> | null;
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

/**
 * What the sources say has happened to a game.
 * `final` is reached only by a published score — never because the start time has passed.
 */
export type PoloStatus = 'final' | 'scheduled' | 'postponed' | 'cancelled';

export interface PoloGame {
  id: string;
  /** Date the game was played or is due, not the date it was discovered. */
  date: string; // YYYY-MM-DD
  /** Start time as the source printed it, 24-hour. Read together with `timeZone`. */
  time: string | null;
  /**
   * The timezone `time` is printed in, when a source makes it certain — the host school's own zone
   * for a home game, or the venue's state. Null means no source stated one, and the app shows the
   * time as the venue's local time rather than calling it Eastern.
   */
  timeZone?: string | null;
  status: PoloStatus;
  home: { team: string; score: number | null };
  away: { team: string; score: number | null };
  /** True when nobody hosted; the two sides are then ordered by slug, not by hosting. */
  neutral?: boolean;
  /** Slug of the school that hosted, or null at a neutral site. */
  hosted: string | null;
  ot?: string | null; // "OT" | "2OT"
  exhibition?: boolean;
  tournament?: string | null;
  venue?: string | null;
  /** Which meeting of this pair on this date. Absent means the first. */
  slot?: number;
  /**
   * Set only when this exact fixture appears on the CWPA's published conference schedule.
   * Two teams sharing a conference is never enough, so an unlisted game stays null.
   */
  conference?: 'MAWPC' | 'NWPC' | null;
  /** The CWPA page that lists this fixture. */
  conferenceSource?: string | null;
  /** What the school itself printed on the row ("CWPA", "MAWPC"). Corroboration, not proof. */
  conferenceMarker?: string | null;
  sources: PoloSource[];
  conflict: PoloConflict | null;
  firstSeenAt?: string | null;
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

/** One opponent's own schedule page, read so its team screen can show a whole season. */
export interface PoloOpponentSource {
  id: string;
  url: string | null;
  site: string | null;
  ok: boolean;
  checkedAt: string;
  found: number;
  rosterUrl: string | null;
  error: string | null;
  note: string | null;
}

export interface PoloConferenceInfo {
  name: string;
  short: string;
  scheduleUrl: string;
  members: string[];
}

export interface PoloConferenceBlock {
  checkedAt: string;
  sources: { id: string; url: string; ok: boolean; fixtures: number; skipped: number; error: string | null }[];
  classified: number;
  dropped: string[];
  members: Record<string, PoloConferenceInfo>;
}

export interface PoloFeed {
  schemaVersion: 1;
  season: number;
  sport: string;
  builtAt: string;
  sources: PoloSourceStatus[];
  opponentSources?: PoloOpponentSource[];
  conference?: PoloConferenceBlock;
  teams: Record<string, PoloTeam>;
  games: PoloGame[];
}

/** One row of the CWPA national poll, exactly as published. */
export interface PollRow {
  /** Verbatim: "1", "6 (T)", "RV". Never turned into a number. */
  rank: string;
  /** The name the CWPA printed. */
  name: string;
  team: string;
  /** The previous poll's rank for this team, verbatim, or null. */
  previous: string | null;
  /** Copied from the article. Never computed. */
  points: number | null;
  pointsText: string | null;
}

export interface Poll {
  schemaVersion: 1;
  season: number;
  week: number;
  title: string;
  heading: string;
  publishedAt: string | null;
  previous: { week: number; label: string } | null;
  sourceUrl: string;
  indexUrl: string;
  builtAt: string;
  lastAttemptAt: string;
  lastSuccessAt: string;
  /** True when a later check ran and this week's poll was not out yet. */
  awaiting: boolean;
  note: string | null;
  teams: Record<string, PoloTeam>;
  rows: PollRow[];
}
