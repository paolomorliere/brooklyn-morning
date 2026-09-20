import type { HistoryEvent, ListItem, Product } from '@/types';

/** Which of the three screen states applies. */
export function groceryState(list: ListItem[], history: HistoryEvent[]): 'first' | 'list' | 'suggest' {
  if (list.length > 0) return 'list';
  return history.length > 0 ? 'suggest' : 'first';
}

export interface BuyAgainRow { key: string; productId: string | null; name: string; section: string; imageUrl: string | null; size: string; score: number; times: number; lastAt: string }

const keyOf = (h: { productId: string | null; name: string }) => h.productId ?? `other:${h.name.toLowerCase()}`;

/**
 * Rank items from history for "Buy again": frequency + recency, with confirmed purchases weighing more than plain adds.
 * Hidden keys are excluded. Items currently on the list are excluded by the caller (state 3 means the list is empty anyway).
 */
export function rankBuyAgain(history: HistoryEvent[], hidden: string[] = [], now = Date.now(), limit = 12): BuyAgainRow[] {
  const hide = new Set(hidden);
  const m = new Map<string, BuyAgainRow & { sizes: Record<string, number> }>();
  for (const h of history) {
    const key = keyOf(h);
    if (hide.has(key)) continue;
    const ageDays = Math.max(0, (now - new Date(h.at).getTime()) / 86400e3);
    const recency = Math.exp(-ageDays / 45); // half-life ≈ 31 days
    const weight = (h.kind === 'purchased' ? 1 : 0.4) * (0.4 + 0.6 * recency);
    const row = m.get(key) ?? { key, productId: h.productId, name: h.name, section: h.section, imageUrl: h.imageUrl, size: '', score: 0, times: 0, lastAt: h.at, sizes: {} };
    row.score += weight;
    if (h.kind === 'purchased') row.times += 1;
    if (h.at > row.lastAt) row.lastAt = h.at;
    if (!row.imageUrl && h.imageUrl) row.imageUrl = h.imageUrl;
    m.set(key, row);
  }
  return [...m.values()]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
    .map(({ sizes: _s, ...r }) => r);
}

export interface Suggestion { product: Product; why: string }

const STOP = new Set(['organic', 'the', 'and', 'with', 'style', 'trader', 'joe', 'joes', 'of', 'in', 'a', 'mini', 'original', 'natural', 'free', 'gluten', 'non', 'dairy', 'sweetened', 'unsweetened']);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));

/**
 * Up to `limit` catalog products the user has never added or bought, matched by section, tags, and name tokens from history.
 * Deterministic for a given (history, catalog, dismissed) so suggestions don't flicker between opens.
 */
export function discover(history: HistoryEvent[], catalog: Product[], dismissed: string[] = [], limit = 3): Suggestion[] {
  if (history.length === 0 || catalog.length === 0) return [];
  const known = new Set(history.map((h) => h.productId).filter(Boolean) as string[]);
  const knownNames = new Set(history.map((h) => h.name.toLowerCase()));
  const skip = new Set(dismissed);

  const sectionWeight = new Map<string, number>();
  const tagWeight = new Map<string, number>();
  const tokenWeight = new Map<string, number>();
  const byId = new Map(catalog.map((p) => [p.id, p]));
  for (const h of history) {
    sectionWeight.set(h.section, (sectionWeight.get(h.section) ?? 0) + 1);
    for (const t of tokens(h.name)) tokenWeight.set(t, (tokenWeight.get(t) ?? 0) + 1);
    const p = h.productId ? byId.get(h.productId) : undefined;
    for (const tag of p?.tags ?? []) tagWeight.set(tag, (tagWeight.get(tag) ?? 0) + 1);
  }

  const scored: { p: Product; score: number; why: string }[] = [];
  for (const p of catalog) {
    if (known.has(p.id) || knownNames.has(p.name.toLowerCase()) || skip.has(p.id) || p.section === 'Other') continue;
    let score = 0;
    let why = '';
    const sharedTag = p.tags.find((t) => tagWeight.has(t));
    if (sharedTag) {
      score += 3 * (tagWeight.get(sharedTag) ?? 0);
      why = `Similar to things you buy (${sharedTag.replace(/-/g, ' ')})`;
    }
    const sharedTok = tokens(p.name).find((t) => tokenWeight.has(t));
    if (sharedTok) {
      score += 2 * (tokenWeight.get(sharedTok) ?? 0);
      why ||= `You have bought other “${sharedTok}” items`;
    }
    const sw = sectionWeight.get(p.section) ?? 0;
    if (sw) {
      score += sw;
      why ||= `Because you shop the ${p.section} aisle`;
    }
    if (p.imageUrl) score += 0.5;
    if (score >= 2) scored.push({ p, score, why });
  }
  // Spread across sections so three suggestions aren't all the same aisle.
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  const out: Suggestion[] = [];
  const usedSections = new Set<string>();
  for (const s of scored) {
    if (out.length >= limit) break;
    if (usedSections.has(s.p.section) && scored.length > limit * 2) continue;
    usedSections.add(s.p.section);
    out.push({ product: s.p, why: s.why });
  }
  return out;
}
