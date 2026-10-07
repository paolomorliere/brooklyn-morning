// Replay the edition's content rules over every archived edition and report what they would remove.
//
// Usage: node scripts/replay-rules.mjs [--verbose]
//
// Why this exists: three rules can remove a story the feeds offered — the publisher's `sponsored`
// label, the topic's own vocabulary (TOPIC_KEYWORDS) and the near-duplicate test (sameStory). Each
// one is capable of throwing away something Paolo would have wanted to read, and the only honest way
// to set their thresholds is to run them over stories that really ran and look at what disappears.
//
// It reads nothing but `public/data/editions/*.json`, so it is free, offline and repeatable.
//
// The one approximation. An archived edition holds the six stories per topic that were *selected*, not
// the whole candidate pool the build chose them from, and the near-duplicate test depends on that pool:
// a name is only distinctive if it is rare among the day's candidates. Replaying one edition at a time
// would give a pool of six where the live build has forty, which makes "Men", "Club" and "Division"
// look distinctive and ties unrelated CWPA notices together — 6 false positives, measured.
//
// So each topic is replayed over as many consecutive editions as its own MAX_AGE_HOURS window spans,
// which is the same body of candidates the live build ranks. A story is tested against the ones already
// kept from its own edition, exactly as the builder does it.

import { readFile, readdir } from 'node:fs/promises';
import { MAX_AGE_HOURS, NEAR_DUPLICATE, SPONSORED_CATEGORIES, TOPIC_KEYWORDS } from './feeds.config.mjs';
import { documentFrequency, sharedDistinctive, sameStory, titleSimilarity } from './lib/rank.mjs';

const VERBOSE = process.argv.includes('--verbose');
const DIR = 'public/data/editions';

const files = (await readdir(DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (!files.length) {
  console.error(`No archived editions in ${DIR}.`);
  process.exit(1);
}

let stories = 0;
const drops = { sponsored: [], 'off-topic': [], 'near-duplicate': [] };

/**
 * One topic's candidate pool as it stood for the edition dated `date`: every story that topic carried in
 * the editions inside its own freshness window, de-duplicated by URL.
 */
function poolFor(topic, date) {
  const days = Math.ceil((MAX_AGE_HOURS[topic] ?? 36) / 24);
  const cutoff = new Date(`${date}T00:00:00Z`).getTime() - (days - 1) * 86400e3;
  const seen = new Set();
  const out = [];
  for (const e of all) {
    const t = new Date(`${e.date}T00:00:00Z`).getTime();
    if (t < cutoff || t > new Date(`${date}T00:00:00Z`).getTime()) continue;
    for (const s of e.stories ?? []) {
      if (s.topic !== topic || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
    }
  }
  return out;
}

const all = [];
for (const f of files) all.push(JSON.parse(await readFile(`${DIR}/${f}`, 'utf8')));

for (const ed of all) {
  const byTopic = new Map();
  for (const s of ed.stories ?? []) {
    stories++;
    if (!byTopic.has(s.topic)) byTopic.set(s.topic, []);
    byTopic.get(s.topic).push(s);
  }

  for (const [topic, items] of byTopic) {
    // The archive does not record the publisher's categories — it predates the parser reading them —
    // so the sponsored rule is replayed against whatever category-like text the story does carry.
    for (const it of items) {
      const cats = [].concat(it.categories ?? []).map((c) => String(c).toLowerCase());
      const ad = cats.find((c) => SPONSORED_CATEGORIES.some((re) => re.test(c)));
      if (ad) drops.sponsored.push({ date: ed.date, topic, title: it.title, why: `categorised "${ad}"` });
    }

    const vocabulary = TOPIC_KEYWORDS[topic];
    if (vocabulary) {
      for (const it of items) {
        const text = `${it.title} ${it.excerpt ?? ''} ${[].concat(it.categories ?? []).join(' ')}`;
        if (!vocabulary.some((re) => re.test(text))) {
          drops['off-topic'].push({ date: ed.date, topic, title: it.title, publisher: it.publisher, why: `no ${topic} vocabulary` });
        }
      }
    }

    // The near-duplicate test, applied the way the builder applies it: items in published order, each
    // one compared against those already kept — but with document frequencies taken from the topic's
    // whole freshness window, which is the pool the live build ranks.
    const pool = poolFor(topic, ed.date);
    const df = documentFrequency(pool);
    const kept = [];
    for (const it of items) {
      const twin = kept.find((k) => sameStory(k, it, df, pool.length, NEAR_DUPLICATE));
      if (twin) {
        const { shared, overlap } = sharedDistinctive(twin, it, df, pool.length, NEAR_DUPLICATE);
        drops['near-duplicate'].push({
          date: ed.date, topic, title: it.title, publisher: it.publisher,
          why: `same story as "${twin.title}"`,
          shared, overlap, pool: pool.length, jaccard: titleSimilarity(twin.title, it.title),
        });
      } else kept.push(it);
    }
  }
}

console.log(`Replayed ${stories} stories across ${files.length} archived editions (${files[0].slice(0, 10)} → ${files.at(-1).slice(0, 10)}).`);
console.log(
  'Read the `pool` figure on each near-duplicate: the earliest editions in the archive have no days\n' +
    'before them, so their pool is one edition rather than a week, and a drop measured at a small pool is\n' +
    'the worst case rather than what production would do. The live build always fetches every feed in\n' +
    'full, so its pool does not depend on how much history is on disk.\n',
);

for (const rule of ['sponsored', 'off-topic', 'near-duplicate']) {
  const list = drops[rule];
  console.log(`${rule}: ${list.length} would have been dropped`);
  for (const d of list) {
    console.log(`  ${d.date} [${d.topic}] ${d.title.slice(0, 96)}`);
    console.log(`      ${d.why}`);
    if (d.shared) {
      console.log(`      shared: ${d.shared.join(', ')} · overlap ${d.overlap.toFixed(2)} · title similarity ${d.jaccard.toFixed(2)} · pool ${d.pool}`);
    }
  }
  console.log('');
}

const total = Object.values(drops).reduce((a, l) => a + l.length, 0);
console.log(`${total} of ${stories} archived stories (${((total / stories) * 100).toFixed(1)}%) would have been removed.`);
