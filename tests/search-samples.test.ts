import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildIndex } from '@/lib/catalog';
import type { Product } from '@/types';

const products = (JSON.parse(readFileSync('public/data/catalog.json', 'utf8')) as { products: Product[] }).products;
const idx = buildIndex(products);
const top = (q: string, n = 6) => idx.search(q, n).map((p) => p.name);

describe('search against the real catalog', () => {
  it('prints samples', () => {
    for (const q of ['butter', 'cheddr', 'peanut buter', 'sardines', 'sparkling water', 'chip', 'tortilla', 'evrything bagel', 'pizza', 'oat milk']) console.log(`"${q}" → ${top(q).join(' · ')}`);
  });
  it('puts plain butter ahead of butternut and peanut butter', () => {
    const r = top('butter', 10);
    const iButter = r.findIndex((n) => /^(salted |unsalted |organic |european style |cultured )*butter\b/i.test(n));
    const iButternut = r.findIndex((n) => /butternut/i.test(n));
    expect(iButter).toBeGreaterThanOrEqual(0);
    expect(iButternut === -1 || iButternut > iButter).toBe(true);
  });
  it('tolerates typos and plurals', () => {
    expect(top('cheddr').some((n) => /cheddar/i.test(n))).toBe(true);
    expect(top('sardine').some((n) => /sardines/i.test(n))).toBe(true);
    expect(top('evrything bagel').some((n) => /everything/i.test(n))).toBe(true);
  });
});
