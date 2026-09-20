import type { Product } from '@/types';
import { SECTIONS } from '../../scripts/lib/sections.mjs';

export interface CatalogFile { schemaVersion: 1; version: string; count: number; products: Product[] }
export interface CatalogMeta { schemaVersion: 1; version: string; count: number; checksum: string; generatedAt: string }

const sectionSet = new Set<string>(SECTIONS);

/** Validate a downloaded catalog. `previousCount` guards against a truncated or partial file replacing a good one. */
export function validateCatalog(data: unknown, previousCount = 0): string[] {
  if (!data || typeof data !== 'object') return ['Catalog is not a JSON object'];
  const f = data as Partial<CatalogFile>;
  if (f.schemaVersion !== 1) return ['Catalog has an unsupported schema version'];
  if (!Array.isArray(f.products)) return ['Catalog has no product list'];
  if (typeof f.count === 'number' && f.count !== f.products.length) return [`Catalog says ${f.count} products but contains ${f.products.length}`];
  if (f.products.length < 100) return [`Catalog has only ${f.products.length} products; refusing to replace`];
  if (previousCount && f.products.length < 0.8 * previousCount) return [`New catalog (${f.products.length}) is much smaller than the current one (${previousCount}); keeping the current one`];
  const ids = new Set<string>();
  for (let i = 0; i < f.products.length; i++) {
    const p = f.products[i] as Partial<Product>;
    if (typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name) return [`Product ${i} is malformed`];
    if (typeof p.section !== 'string' || !sectionSet.has(p.section)) return [`Product ${p.name} has an unknown section`];
    if (p.imageUrl !== null && typeof p.imageUrl !== 'string') return [`Product ${p.name} has an invalid image`];
    if (ids.has(p.id)) return [`Duplicate product id ${p.id}`];
    ids.add(p.id);
  }
  return [];
}

/* ---------------- Search ---------------- */

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Optimal-string-alignment edit distance (Levenshtein + adjacent transpositions), capped for speed. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Words that describe a variant of the same thing rather than a different thing; they cost nothing in ranking. */
const NEUTRAL = new Set(['organic', 'salted', 'unsalted', 'original', 'plain', 'classic', 'regular', 'whole', 'fresh', 'natural', 'quarters', 'sticks', 'stick', 'sliced', 'shredded', 'grated', 'large', 'small', 'mini', 'pack', 'cultured', 'european', 'style', 'traditional', 'lightly', 'reduced', 'fat', 'low', 'free', 'gluten', 'wild', 'caught', 'raw', 'roasted', 'unsweetened', 'sweetened', 'the', 'and', 'with', 'in', 'of', 'a']);

const singular = (t: string) => (t.length > 4 && t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.length > 3 && t.endsWith('es') && /(ch|sh|ss|x)es$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

/** How well one query token matches one product token: 0 = no match. */
function tokenScore(qt: string, pt: string): number {
  if (qt === pt) return 3;
  if (singular(qt) === singular(pt)) return 2.8;
  if (qt.length >= 3 && pt.startsWith(qt)) return 2 - Math.min(0.6, (pt.length - qt.length) * 0.08); // "butter" vs "butternut": weaker the longer the tail
  if (qt.length >= 5) {
    const maxD = qt.length >= 8 ? 2 : 1;
    const dist = editDistance(singular(qt), singular(pt), maxD);
    if (dist <= maxD) return 1.6 - dist * 0.3; // typo tolerance: "cheddr" → "cheddar"
  }
  if (qt.length >= 4 && pt.includes(qt)) return 1;
  return 0;
}

export interface SearchIndex { search(query: string, limit?: number): Product[] }

/**
 * Ranked catalog search. Every query word must match some product word (exact, plural/singular, prefix, typo, or substring).
 * Scoring favors: exact whole-word hits, the query being the product's head noun ("Butter" over "Butternut Squash"),
 * names that start with the query, and shorter names. Products with photos get a small nudge.
 */
export function buildIndex(products: Product[]): SearchIndex {
  const rows = products.map((p) => {
    const name = norm(p.name);
    return { p, name, size: norm(p.size), tokens: name.split(' ').filter(Boolean) };
  });
  return {
    search(query, limit = 30) {
      const q = norm(query);
      if (q.length < 2) return [];
      const qTokens = q.split(' ').filter(Boolean);
      const scored: { p: Product; score: number }[] = [];
      for (const r of rows) {
        let score = 0;
        let ok = true;
        for (const qt of qTokens) {
          let best = 0;
          for (let i = 0; i < r.tokens.length; i++) {
            const ts = tokenScore(qt, r.tokens[i]);
            if (ts > best) best = ts + (i === r.tokens.length - 1 && ts >= 2.8 ? 2.5 : 0); // head-noun bonus: the query IS the thing, not a modifier
          }
          if (!best && r.size.includes(qt)) best = 0.8;
          if (!best) { ok = false; break; }
          score += best;
        }
        if (!ok) continue;
        if (r.name === q) score += 6;
        else if (r.name.startsWith(q)) score += 1;
        // Extra words that change what the product is (fig butter vs butter) cost more than neutral modifiers (salted butter).
        const qSet = new Set(qTokens.map(singular));
        for (const t of r.tokens) {
          if (qSet.has(singular(t)) || qTokens.some((qt) => t.startsWith(qt))) continue;
          score -= NEUTRAL.has(t) ? 0.1 : 0.6;
        }
        if (r.p.imageUrl) score += 0.3;
        if (r.p.section === 'Other') score -= 0.2;
        scored.push({ p: r.p, score });
      }
      return scored.sort((a, b) => b.score - a.score || a.p.name.length - b.p.name.length || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((s) => s.p);
    },
  };
}
