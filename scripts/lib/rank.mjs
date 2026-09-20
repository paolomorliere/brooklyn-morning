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
export function scoreItem(item, feed, { boosts = [], matchReport = [], matchReportPenalty = 0.35, halfLifeHours = 18, now = Date.now() } = {}) {
  const text = `${item.title} ${item.excerpt ?? ''}`;
  let s = feed.weight * recencyFactor(item.publishedAt, now, halfLifeHours);
  for (const [re, mult] of boosts) if (re.test(text)) s *= mult;
  if (matchReport.some((re) => re.test(item.title))) s *= matchReportPenalty;
  if (feed.lang === 'fr') s *= 0.85;
  if (item.excerpt && item.excerpt.length > 60) s *= 1.05;
  return s;
}

/** Remove duplicates by canonical URL and by near-identical titles, keeping the higher-scored item. */
export function dedupe(items, threshold = 0.5) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out = [];
  const urls = new Set();
  for (const it of sorted) {
    const cu = canonicalUrl(it.url);
    if (urls.has(cu)) continue;
    if (out.some((o) => titleSimilarity(o.title, it.title) > threshold)) continue;
    urls.add(cu);
    out.push(it);
  }
  return out;
}

/**
 * Pick the top N per topic, dropping items seen in earlier editions (unless the URL is new) and items past max age.
 * Water polo is thin, so `minKeep` lets very old items through when nothing fresh exists.
 */
/** First matching subject key for a story, or null. Used to keep the top three about different things. */
export function subjectOf(item, subjects = []) {
  const text = `${item.title} ${item.excerpt ?? ''}`;
  for (const [key, re] of subjects) if (re.test(text)) return key;
  return null;
}

const matchesSlot = (it, rule) => (Array.isArray(rule.sub) ? rule.sub.includes(it.sub) : it.sub === rule.sub) && (!rule.match || rule.match.test(`${it.title} ${it.excerpt ?? ''}`));

/**
 * Pick the top N per topic:
 *  1. drop items seen in earlier editions (unless the URL is new) and items past max age; dedupe across sources;
 *  2. fill slot rules in order (e.g. politics, finance, markets) with the best qualifying candidate;
 *  3. fill the rest by score, honoring: publisher cap, foreign-language share, and subject diversity
 *     (the first `diverseTop` picks must be about different subjects);
 *  4. if slots remain, relax the publisher cap (thin topics).
 * For slot rules whose sub values are ordered (e.g. ['ncaa-east','ncaa-west']), earlier values are preferred.
 */
export function selectPerTopic(items, { perTopic, maxAgeHours, seen = {}, now = Date.now(), topics, maxPerPublisher = 2, maxForeignShare = 0.5, slotRules = {}, subjects = {}, diverseTop = 3 }) {
  const result = {};
  const takenUrls = new Set(); // across topics: the same story never appears in two sections
  const takenTitles = [];
  for (const topic of topics) {
    const fresh = items.filter((it) => it.topic === topic && !seen[canonicalUrl(it.url)] && (now - new Date(it.publishedAt).getTime()) / 3.6e6 <= (maxAgeHours[topic] ?? 36));
    const ranked = dedupe(fresh).filter((it) => !takenUrls.has(canonicalUrl(it.url)) && !takenTitles.some((t) => titleSimilarity(t, it.title) > 0.5));
    const picked = [];
    const perPub = {};
    const usedSubjects = new Set();
    let foreign = 0;
    const maxForeign = Math.ceil(perTopic * maxForeignShare);
    const subj = (it) => subjectOf(it, subjects[topic] ?? []);
    const canTake = (it, relaxPub) => {
      const isForeign = it.lang && it.lang !== 'en';
      const inTop = picked.length < diverseTop;
      if (isForeign && foreign >= maxForeign) return false;
      if (inTop && isForeign && foreign >= Math.max(1, Math.floor(diverseTop / 2))) return false; // the top three lead in English
      if (!relaxPub && (perPub[it.publisher] ?? 0) >= (inTop ? 1 : maxPerPublisher)) return false; // top three: different publishers when possible
      const k = subj(it);
      if (inTop && k && usedSubjects.has(k)) return false; // top three: different subjects
      return true;
    };
    const take = (it) => {
      picked.push(it);
      perPub[it.publisher] = (perPub[it.publisher] ?? 0) + 1;
      if (it.lang && it.lang !== 'en') foreign++;
      const k = subj(it);
      if (k) usedSubjects.add(k);
    };
    // 2) slot rules
    for (const rule of slotRules[topic] ?? []) {
      if (picked.length >= perTopic) break;
      const subs = Array.isArray(rule.sub) ? rule.sub : [rule.sub];
      let chosen = null;
      for (const sub of subs) {
        chosen = ranked.find((it) => !picked.includes(it) && matchesSlot(it, { sub, match: rule.match }) && canTake(it, false)) ?? ranked.find((it) => !picked.includes(it) && matchesSlot(it, { sub, match: rule.match }) && canTake(it, true));
        if (chosen) break;
      }
      if (chosen) take(chosen);
    }
    // 3) + 4) fill by score
    for (const relaxPub of [false, true]) {
      for (const it of ranked) {
        if (picked.length >= perTopic) break;
        if (picked.includes(it)) continue;
        if (canTake(it, relaxPub)) take(it);
      }
    }
    for (const it of picked) {
      takenUrls.add(canonicalUrl(it.url));
      takenTitles.push(it.title);
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
