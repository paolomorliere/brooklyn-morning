import { describe, expect, it } from 'vitest';
import type { HistoryEvent, Product } from '@/types';
import { discover, groceryState, rankBuyAgain } from '@/lib/grocery';
import { buildIndex, validateCatalog } from '@/lib/catalog';

const ev = (id: string | null, name: string, kind: HistoryEvent['kind'], at: string, section: Product['section'] = 'Pantry'): HistoryEvent => ({ id: `${id}-${at}-${kind}`, productId: id, name, section, imageUrl: null, kind, at });
const prod = (id: string, name: string, section: Product['section'], tags: string[] = []): Product => ({ id, name, size: '', section, tags, imageUrl: null });

describe('three-state rule', () => {
  it('first → list → suggest', () => {
    expect(groceryState([], [])).toBe('first');
    expect(groceryState([{ id: 'l', productId: null, name: 'Bananas', size: '', section: 'Other', imageUrl: null, qty: 1, addedAt: '' }], [])).toBe('list');
    expect(groceryState([], [ev('p1', 'Bread', 'purchased', '2026-09-01T00:00:00Z')])).toBe('suggest');
  });
});

describe('buy again ranking', () => {
  const now = Date.parse('2026-09-20T00:00:00Z');
  it('ranks confirmed purchases above plain adds and frequency above one-offs', () => {
    const h = [
      ev('a', 'Bread', 'purchased', '2026-09-18T00:00:00Z'),
      ev('a', 'Bread', 'purchased', '2026-09-11T00:00:00Z'),
      ev('b', 'Cheese', 'purchased', '2026-09-19T00:00:00Z'),
      ev('c', 'Cookies', 'added', '2026-09-19T00:00:00Z'),
    ];
    expect(rankBuyAgain(h, [], now).map((r) => r.name)).toEqual(['Bread', 'Cheese', 'Cookies']);
  });
  it('decays old purchases and honors hidden items', () => {
    const h = [ev('old', 'Old', 'purchased', '2025-01-01T00:00:00Z'), ev('new', 'New', 'purchased', '2026-09-19T00:00:00Z')];
    expect(rankBuyAgain(h, [], now)[0].name).toBe('New');
    expect(rankBuyAgain(h, ['old'], now).map((r) => r.name)).toEqual(['New']);
  });
  it('groups "other" items by name', () => {
    const h = [ev(null, 'Bananas', 'purchased', '2026-09-18T00:00:00Z'), ev(null, 'bananas', 'purchased', '2026-09-19T00:00:00Z')];
    expect(rankBuyAgain(h, [], now)).toHaveLength(1);
  });
});

describe('discover', () => {
  const catalog = [
    prod('1', 'Sourdough Bread', 'Bakery', ['breads']),
    prod('2', 'Rye Bread', 'Bakery', ['breads']),
    prod('3', 'Bagels', 'Bakery', ['bagels']),
    prod('4', 'Sparkling Water', 'Beverages', ['waters']),
    prod('5', 'Mystery', 'Other', []),
    prod('6', 'Cheddar', 'Cheese & Deli', ['cheeses']),
  ];
  const history = [ev('1', 'Sourdough Bread', 'purchased', '2026-09-01T00:00:00Z', 'Bakery'), ev(null, 'Bagels', 'purchased', '2026-09-02T00:00:00Z', 'Other')];
  it('never suggests something already added/bought, dismissed, or unclassified', () => {
    const s = discover(history, catalog, ['2']);
    const names = s.map((x) => x.product.name);
    expect(names).not.toContain('Sourdough Bread');
    expect(names).not.toContain('Bagels'); // matched by name even though it was an "other" item
    expect(names).not.toContain('Rye Bread'); // dismissed
    expect(names).not.toContain('Mystery');
    expect(s.length).toBeLessThanOrEqual(3);
  });
  it('returns nothing without history or candidates', () => {
    expect(discover([], catalog)).toEqual([]);
    expect(discover(history, [])).toEqual([]);
  });
  it('explains each suggestion', () => {
    const s = discover(history, catalog);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) expect(x.why.length).toBeGreaterThan(5);
  });
});

describe('catalog validator and search', () => {
  const good = { schemaVersion: 1, version: 'v', count: 120, products: Array.from({ length: 120 }, (_, i) => prod(String(i), `Product ${i}`, 'Pantry')) };
  it('accepts a valid file and rejects malformed or shrunken ones', () => {
    expect(validateCatalog(good)).toEqual([]);
    expect(validateCatalog({ ...good, count: 5 })[0]).toMatch(/says 5/);
    expect(validateCatalog({ ...good, products: good.products.slice(0, 50), count: 50 })[0]).toMatch(/only 50/);
    expect(validateCatalog(good, 1000)[0]).toMatch(/much smaller/);
    expect(validateCatalog({ ...good, products: [...good.products.slice(1), { ...good.products[0], section: 'Weird' }] })[0]).toMatch(/unknown section/);
    expect(validateCatalog('nope')[0]).toMatch(/not a JSON object/);
    expect(validateCatalog({ ...good, products: [...good.products, good.products[0]], count: 121 })[0]).toMatch(/Duplicate/);
  });
  it('searches by prefix, whole token, and size', () => {
    const idx = buildIndex([prod('a', 'Unexpected Cheddar Cheese', 'Cheese & Deli'), prod('b', 'Cheddar Crackers', 'Snacks'), { ...prod('c', 'Sparkling Water', 'Beverages'), size: '1 L' }]);
    expect(idx.search('ched').map((p) => p.id)).toEqual(['b', 'a']);
    expect(idx.search('unexpected cheddar')[0].id).toBe('a');
    expect(idx.search('water 1 l')[0].id).toBe('c');
    expect(idx.search('x')).toEqual([]);
    expect(idx.search('zzz')).toEqual([]);
  });
});
