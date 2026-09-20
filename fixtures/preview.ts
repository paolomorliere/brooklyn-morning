// Representative preview data for design review. Stories are a real snapshot of the
// verified feeds taken on 2026-09-19 (see sample-stories.json); nothing is invented.
// Tasks, list, and library entries are placeholders and never touch real data.
import stories from './sample-stories.json';
import { cleanText, truncate } from '@/lib/text';
import type { Category, Edition, HistoryEvent, Lesson, LibraryEntry, ListItem, Product, Story, Task } from '@/types';

const now = new Date('2026-09-19T09:52:00.000Z'); // 5:52 AM EDT

export const previewEdition: Edition = {
  schemaVersion: 1,
  date: '2026-09-19',
  preparedAt: now.toISOString(),
  stories: (stories as Omit<Story, 'id' | 'excerptSource' | 'lead' | 'leadSource' | 'isBackground' | 'glossaryTerms'>[]).map((s, i) => ({
    ...s,
    title: cleanText(s.title),
    excerpt: truncate(cleanText(s.excerpt), 280),
    id: `s${i}`,
    excerptSource: 'rss',
    lead: null,
    leadSource: null,
    isBackground: now.getTime() - new Date(s.publishedAt).getTime() > 48 * 3600e3,
    glossaryTerms: s.topic === 'finance' && /interest rate|Fed/i.test(s.title) ? ['interest rate', 'the Fed'] : [],
  })) as Story[],
  sources: [
    { id: 'lequipe', name: "L'Équipe", topic: 'soccer', ok: false, items: 0, error: 'timeout' },
  ],
  lessonRef: { week: 1, day: 1 },
};

export const previewLesson: Lesson = {
  id: 'week-01-d1',
  week: 1,
  day: 1,
  theme: 'The stock market, from zero',
  title: 'What a share actually is',
  readMinutes: 3,
  explanation: [
    'A company that wants money to grow has two broad options: borrow it, or sell pieces of itself. A share (also called a stock) is one of those pieces. If a company is split into 1,000,000 shares and you own 10, you own one hundred-thousandth of the business.',
    'Owning a share gives you two things. First, a claim on part of the profits, which the company may pay out as a dividend or keep to reinvest. Second, a vote at the annual meeting, in proportion to how many shares you hold. It does not give you the right to walk in and take a desk.',
    'The price of a share is simply what the last buyer and seller agreed on. Nobody sets it. That is why it moves all day: every trade is a fresh negotiation about what the company is worth.',
  ],
  example: [
    'Suppose Café Brooklyn issues 100 shares at $50 each to raise $5,000 for a second espresso machine. You buy 5 shares for $250. You now own 5% of the café.',
    'Next year the café earns $2,000 profit and pays half of it out. Your dividend is 5% of $1,000 = $50. If other people now think the café is worth more and are willing to pay $70 a share, your 5 shares are worth $350 on paper, but you only lock that in if you sell.',
  ],
  exercise: {
    prompt: 'A company has 2,000,000 shares and you own 4,000. It pays out $500,000 in dividends this year. How much do you receive, and what percentage of the company do you own?',
    answer: 'You own 4,000 ÷ 2,000,000 = 0.2%. Your dividend is 0.2% of $500,000 = $1,000.',
  },
};

export const previewCategories: Category[] = [
  { id: 'inbox', name: 'Inbox', order: 0, system: true },
  { id: 'sfc', name: 'SFC Institutional Research', order: 1 },
  { id: 'liu', name: 'LIU Water Polo', order: 2 },
  { id: 'ms', name: 'MS Coursework', order: 3 },
  { id: 'biz', name: 'Business Ideas', order: 4 },
  { id: 'personal', name: 'Personal', order: 5 },
];

const t = (id: string, text: string, categoryId: string, extra: Partial<Task> = {}): Task => ({
  id, text, categoryId, notes: '', starred: false, createdAt: now.toISOString(), completedAt: null, order: 0, ...extra,
});
export const previewTasks: Task[] = [
  t('1', 'Send fall census file draft', 'sfc', { starred: true, notes: 'Compare row counts with last year first' }),
  t('2', 'Refresh retention dashboard filters', 'sfc'),
  t('3', 'Plan Thursday practice: press defense', 'liu', { starred: true }),
  t('4', 'Order new caps', 'liu'),
  t('5', 'Read chapter 4 before Tuesday', 'ms'),
  t('6', 'Sketch pricing for the newsletter idea', 'biz', { notes: 'Compare 3 tiers' }),
  t('7', 'Book dentist', 'personal'),
  t('8', 'Call Mom', 'inbox'),
  t('9', 'Submit timesheet', 'sfc', { completedAt: now.toISOString() }),
];

const img = (id: string) => `https://images.openfoodfacts.org/images/products/${id}/front_en.3.200.jpg`;
export const previewProducts: Product[] = [
  { id: '00507836', name: 'Everything but the Bagel Sesame Seasoning Blend', size: '2.3 oz', section: 'Pantry', tags: ['seasoning'], imageUrl: null },
  { id: '00562532', name: 'Unexpected Cheddar Cheese', size: '7 oz', section: 'Cheese & Deli', tags: ['cheese'], imageUrl: null },
  { id: '00519012', name: 'Organic Creamy Salted Peanut Butter', size: '16 oz', section: 'Pantry', tags: ['spread', 'nut'], imageUrl: null },
  { id: '00589631', name: 'Mandarin Orange Chicken', size: '22 oz', section: 'Frozen', tags: ['frozen', 'chicken'], imageUrl: null },
  { id: '00937416', name: 'Cauliflower Gnocchi', size: '12 oz', section: 'Frozen', tags: ['frozen', 'pasta'], imageUrl: null },
  { id: '00542911', name: 'Dark Chocolate Peanut Butter Cups', size: '16 oz', section: 'Snacks', tags: ['chocolate'], imageUrl: null },
  { id: '00545101', name: 'Sparkling Mineral Water, Lime', size: '1 L', section: 'Beverages', tags: ['water'], imageUrl: null },
  { id: '00598712', name: 'Sourdough Bread', size: '24 oz', section: 'Bakery', tags: ['bread'], imageUrl: null },
];
void img;

export const previewList: ListItem[] = [
  { id: 'l1', productId: '00598712', name: 'Sourdough Bread', size: '24 oz', section: 'Bakery', imageUrl: null, qty: 1, addedAt: now.toISOString() },
  { id: 'l2', productId: '00562532', name: 'Unexpected Cheddar Cheese', size: '7 oz', section: 'Cheese & Deli', imageUrl: null, qty: 2, addedAt: now.toISOString() },
  { id: 'l3', productId: '00589631', name: 'Mandarin Orange Chicken', size: '22 oz', section: 'Frozen', imageUrl: null, qty: 1, addedAt: now.toISOString() },
  { id: 'l4', productId: null, name: 'Bananas', size: '', section: 'Other', imageUrl: null, qty: 6, addedAt: now.toISOString() },
];

export const previewHistory: HistoryEvent[] = previewProducts.slice(0, 6).map((p, i) => ({
  id: `h${i}`, productId: p.id, name: p.name, section: p.section, imageUrl: p.imageUrl, kind: 'purchased', at: now.toISOString(),
}));

export const previewDiscover = [
  { product: previewProducts[6], why: 'Because you buy Beverages often' },
  { product: previewProducts[4], why: 'Pairs with your Frozen picks' },
];

export const previewLibrary: LibraryEntry[] = [
  { id: 'e1', kind: 'story', title: "Ever wonder how the Fed's interest rate actually works?", url: 'https://www.npr.org/', publisher: 'NPR', note: '', tags: ['Learning'], savedAt: now.toISOString() },
  { id: 'e2', kind: 'lesson', title: 'What a share actually is', url: null, note: 'Week 1 · Day 1', tags: ['Learning'], savedAt: now.toISOString() },
  { id: 'e3', kind: 'own', title: 'Water polo analytics newsletter — outline', url: null, note: 'Weekly, coaches as audience, free tier first', tags: ['Business idea'], savedAt: now.toISOString() },
  { id: 'e4', kind: 'own', title: 'Lisbon in March', url: 'https://en.wikivoyage.org/wiki/Lisbon', note: 'Check flight prices in January', tags: ['Travel'], savedAt: now.toISOString() },
];
