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

/**
 * The capitalised words in a story, other than the ones that open a sentence.
 *
 * Proper nouns are what tell two reports of the same fixture apart from two reports of different ones.
 * A word is kept when it is at least four characters, starts with a capital, and is not the first word
 * of the title or of a sentence in the excerpt — because an opening word is capitalised whatever it is.
 * Returned lower-cased, so matching is case-insensitive from here on.
 */
export function properNouns(item) {
  const out = new Set();
  const title = String(item?.title ?? '');
  const excerpt = String(item?.excerpt ?? '');
  // The publisher's own name is not part of the story. Several feeds sign their excerpts
  // ("...Total Waterpolo"), which made every pair of items from one publisher look related.
  const byline = new Set(
    String(item?.publisher ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  // A sentence start is the very beginning, or anything after `.`/`!`/`?`/`—`/a newline.
  for (const text of [title, excerpt]) {
    let sentenceStart = true;
    for (const m of text.matchAll(/([A-Za-zÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ'’-]*)|([.!?\n—])|(\S)/gu)) {
      if (m[2]) { sentenceStart = true; continue; }
      if (m[3]) continue;
      const word = m[1];
      const first = sentenceStart;
      sentenceStart = false;
      if (first) continue;
      if (word.length < 4) continue;
      if (!/^[A-ZÀ-Ö]/u.test(word)) continue;
      const w = word.toLowerCase().replace(/[’']s$/, '');
      if (byline.has(w)) continue;
      out.add(w);
    }
  }
  return out;
}

/**
 * How many items in a pool each proper noun appears in. The pool is one topic's candidates for one
 * edition, so "Championship" is common and "Sabadell" is not — which is the whole point.
 */
export function documentFrequency(items) {
  const df = new Map();
  for (const it of items) for (const w of properNouns(it)) df.set(w, (df.get(w) ?? 0) + 1);
  return df;
}

/**
 * The proper nouns in one item that are rare in its pool. Common ones ("University", "Water", "Polo",
 * "Championship") identify a section, not a story, so they are dropped.
 */
export function distinctiveTokens(item, df, poolSize, { maxShare = 0.15, minLimit = 2 } = {}) {
  // The floor is 2, not 3. A shared word necessarily appears in at least two items, so 2 is the
  // smallest floor that lets anything match at all — and the smallest that works. A floor of 3 let a
  // word appearing in half of a six-item pool count as distinctive, which is how "water", "polo",
  // "collegiate" and "association" came to tie together completely unrelated CWPA notices.
  const limit = Math.max(minLimit, Math.floor(poolSize * maxShare));
  const out = new Set();
  for (const w of properNouns(item)) if ((df.get(w) ?? 1) <= limit) out.add(w);
  return out;
}

/**
 * Two items that are the same story told twice.
 *
 * Why the title Jaccard in `titleSimilarity` is not enough: on 7 October 2026 the edition ran
 * "Sabadell earns three points in Montenegro; Recco struggles in Italian derby" next to
 * "Champions League Men: Sabadell, Recco, Olympiacos and Radnicki all head home with three points".
 * Those are the same four results written up by two publishers, and their title similarity is 0.211 —
 * nowhere near the 0.5 dedupe threshold, because every word the two headlines do not share dilutes it.
 * The words that give it away are *Sabadell* and *Recco*: rare in the day's pool, and weighted no more
 * heavily than "the" by a uniform Jaccard.
 *
 * The test is deliberately two-sided, because sharing two rare names is not on its own enough. A long
 * roster announcement naming a dozen schools will share "Harvard" and "Brown" with a report of one
 * Harvard–Brown game without being the same story. So the shared names must also make up a real share
 * of the *shorter* item's distinctive vocabulary: `minShared` names **and** `minOverlap` of the smaller
 * set. Both thresholds were calibrated against every archived edition, not chosen by eye —
 * see `scripts/replay-rules.mjs`.
 */
export function sharedDistinctive(a, b, df, poolSize, opts = {}) {
  const A = distinctiveTokens(a, df, poolSize, opts);
  const B = distinctiveTokens(b, df, poolSize, opts);
  const shared = [...A].filter((w) => B.has(w));
  const smaller = Math.min(A.size, B.size);
  return { shared, overlap: smaller ? shared.length / smaller : 0, sizes: [A.size, B.size] };
}

export function sameStory(a, b, df, poolSize, { minShared = 2, minOverlap = 0.25, ...opts } = {}) {
  const { shared, overlap } = sharedDistinctive(a, b, df, poolSize, opts);
  return shared.length >= minShared && overlap >= minOverlap;
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
export function selectPerTopic(items, { perTopic, maxAgeHours, seen = {}, now = Date.now(), topics, maxPerPublisher = 2, maxForeignShare = 0.5, slotRules = {}, subjects = {}, diverseTop = 3, nearDuplicate = {}, onDrop = null }) {
  const result = {};
  const takenUrls = new Set(); // across topics: the same story never appears in two sections
  const takenTitles = [];
  for (const topic of topics) {
    const fresh = items.filter((it) => it.topic === topic && !seen[canonicalUrl(it.url)] && (now - new Date(it.publishedAt).getTime()) / 3.6e6 <= (maxAgeHours[topic] ?? 36));
    // Document frequencies come from the whole candidate pool for the topic, not from the handful that
    // end up selected. That is what makes "Collegiate" and "Association" common and "Sabadell" rare:
    // water polo's pool is a week of CWPA notices, so the section's own vocabulary is everywhere in it.
    const df = documentFrequency(fresh);
    const poolSize = fresh.length;
    const ranked = dedupe(fresh).filter((it) => !takenUrls.has(canonicalUrl(it.url)) && !takenTitles.some((t) => titleSimilarity(t, it.title) > 0.5));
    const picked = [];
    const perPub = {};
    const usedSubjects = new Set();
    // `canTake` is asked about the same item up to four times — once per slot rule pass, then twice in
    // the fill loop as the publisher cap relaxes — so without this the drop log would repeat itself.
    const loggedTwins = new Set();
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
      // The same story told twice, caught by its proper nouns. Checked against every pick in the
      // section, not just the top three: a second write-up of the same fixture is no more welcome at
      // position five than at position two.
      const twin = picked.find((p) => sameStory(p, it, df, poolSize, nearDuplicate));
      if (twin) {
        if (onDrop && !loggedTwins.has(it.url)) {
          loggedTwins.add(it.url);
          onDrop({
            rule: 'near-duplicate',
            topic,
            title: it.title,
            publisher: it.publisher,
            detail: `the same story as "${twin.title}" — both mention ${sharedDistinctive(twin, it, df, poolSize, nearDuplicate).shared.join(', ')}`,
          });
        }
        return false;
      }
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
