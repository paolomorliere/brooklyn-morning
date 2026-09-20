/**
 * Rough, section-level price ranges for Trader Joe's, written from general knowledge at development time (2026).
 * These are NOT product prices: Trader Joe's publishes none and the crowd database has almost none.
 * Always shown with the "rough estimate for this aisle" label.
 */
export const AISLE_PRICE_ESTIMATE: Record<string, { low: number; high: number }> = {
  Produce: { low: 1, high: 5 },
  Bakery: { low: 2.5, high: 5 },
  'Dairy & Eggs': { low: 2, high: 6 },
  'Meat & Seafood': { low: 4, high: 13 },
  Frozen: { low: 3, high: 8 },
  Pantry: { low: 2, high: 7 },
  Snacks: { low: 2, high: 5 },
  Beverages: { low: 1, high: 7 },
  'Cheese & Deli': { low: 3, high: 10 },
  'Flowers & Home': { low: 3, high: 12 },
  Other: { low: 2, high: 8 },
};

export function aisleEstimate(section: string): string | null {
  const r = AISLE_PRICE_ESTIMATE[section];
  return r ? `$${r.low.toFixed(r.low % 1 ? 2 : 0)}–$${r.high.toFixed(0)}` : null;
}
