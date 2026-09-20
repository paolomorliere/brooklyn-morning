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

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface SearchIndex { search(query: string, limit?: number): Product[] }

export function buildIndex(products: Product[]): SearchIndex {
  const rows = products.map((p) => ({ p, name: norm(p.name), size: norm(p.size), tokens: norm(p.name).split(' ') }));
  return {
    search(query, limit = 30) {
      const q = norm(query);
      if (q.length < 2) return [];
      const qTokens = q.split(' ');
      const scored: { p: Product; score: number }[] = [];
      for (const r of rows) {
        let score = 0;
        for (const qt of qTokens) {
          if (r.tokens.includes(qt)) score += 3;
          else if (r.tokens.some((t) => t.startsWith(qt))) score += 2;
          else if (r.name.includes(qt) || r.size.includes(qt)) score += 1;
          else { score = 0; break; } // every query token must match somewhere
        }
        if (!score) continue;
        if (r.name.startsWith(q)) score += 4;
        if (r.p.imageUrl) score += 0.5;
        score -= r.tokens.length * 0.05; // prefer shorter, more specific names
        scored.push({ p: r.p, score });
      }
      return scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((s) => s.p);
    },
  };
}
