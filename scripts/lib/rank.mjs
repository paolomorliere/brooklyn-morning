// Pure ranking helpers for the edition builder. No I/O so they can be unit-tested from Vitest.

export function normalizeTitle(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function canonicalUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref|source|cmp|ns_|at_)/i.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(u ?? '');
  }
}

function tokenSet(title) {
  return new Set(normalizeTitle(title).split(' ').filter((w) => w.length > 2));
}

/** Jaccard similarity of title tokens; > 0.6 is treated as the same story. */
export function titleSimilarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Recency decay: 1 at publish time, ~0.5 after `halfLifeHours`. */
export function recencyFactor(publishedAt, now, halfLifeHours = 18) {
  const ageH = Math.max(0, (now - new Date(publishedAt).getTime()) / 3.6e6);
  return Math.pow(0.5, ageH / halfLifeHours);
}

/**
 * Score one item. `feed` supplies weight/lang; `boosts` and `matchReport` come from the config.
 */
export function scoreItem(item, feed, { boosts = [], matchReport = [], now = Date.now() } = {}) {
  const text = `${item.title} ${item.excerpt ?? ''}`;
  let s = feed.weight * recencyFactor(item.publishedAt, now);
  for (const [re, mult] of boosts) if (re.test(text)) s *= mult;
  if (matchReport.some((re) => re.test(item.title))) s *= 0.35;
  if (feed.lang === 'fr') s *= 0.85;
  if (item.excerpt && item.excerpt.length > 60) s *= 1.05;
  return s;
}

/** Remove duplicates by canonical URL and by near-identical titles, keeping the higher-scored item. */
export function dedupe(items) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out = [];
  const urls = new Set();
  for (const it of sorted) {
    const cu = canonicalUrl(it.url);
    if (urls.has(cu)) continue;
    if (out.some((o) => titleSimilarity(o.title, it.title) > 0.6)) continue;
    urls.add(cu);
    out.push(it);
  }
  return out;
}

/**
 * Pick the top N per topic, dropping items seen in earlier editions (unless the URL is new) and items past max age.
 * Water polo is thin, so `minKeep` lets very old items through when nothing fresh exists.
 */
export function selectPerTopic(items, { perTopic, maxAgeHours, seen = {}, now = Date.now(), topics, maxPerPublisher = 2, maxForeignShare = 0.5 }) {
  const result = {};
  for (const topic of topics) {
    const fresh = items.filter((it) => it.topic === topic && !seen[canonicalUrl(it.url)] && (now - new Date(it.publishedAt).getTime()) / 3.6e6 <= (maxAgeHours[topic] ?? 36));
    const ranked = dedupe(fresh);
    const picked = [];
    const perPub = {};
    let foreign = 0;
    const maxForeign = Math.ceil(perTopic * maxForeignShare);
    // First pass: honor caps. Second pass: fill remaining slots ignoring the publisher cap (thin topics).
    for (const pass of [0, 1]) {
      for (const it of ranked) {
        if (picked.length >= perTopic) break;
        if (picked.includes(it)) continue;
        const isForeign = it.lang && it.lang !== 'en';
        if (isForeign && foreign >= maxForeign) continue;
        if (pass === 0 && (perPub[it.publisher] ?? 0) >= maxPerPublisher) continue;
        picked.push(it);
        perPub[it.publisher] = (perPub[it.publisher] ?? 0) + 1;
        if (isForeign) foreign++;
      }
    }
    result[topic] = picked.map((it) => ({ ...it, isBackground: now - new Date(it.publishedAt).getTime() > 48 * 3.6e6 }));
  }
  return result;
}

/** Attach up to 3 glossary term ids whose patterns appear in the story text. */
export function tagGlossary(item, glossary) {
  const text = `${item.title} ${item.excerpt ?? ''} ${item.lead ?? ''}`;
  const hits = [];
  for (const g of glossary) {
    if (g.pattern.test(text)) hits.push(g.id);
    if (hits.length >= 3) break;
  }
  return hits;
}
