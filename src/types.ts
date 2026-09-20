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

export interface LessonProgress {
  startMonday: string; // YYYY-MM-DD
  readLessonIds: string[];
}

export const TOPIC_META: Record<TopicId, { label: string; blurb: string }> = {
  ai: { label: 'AI & Data', blurb: 'Tools, research, and what it means for analysts.' },
  world: { label: 'World, US & France', blurb: 'Top stories from NPR, BBC, Le Monde, France 24.' },
  finance: { label: 'Politics & Finance', blurb: 'Plain-language sources. Tap a term for a definition.' },
  waterpolo: { label: 'Water polo', blurb: 'Whatever the day brings: NCAA, LEN, USA Water Polo.' },
  soccer: { label: 'Soccer', blurb: 'Ligue 1, Les Bleus, Europe. News over scores.' },
};

export const TOPIC_ORDER: TopicId[] = ['ai', 'world', 'finance', 'waterpolo', 'soccer'];
