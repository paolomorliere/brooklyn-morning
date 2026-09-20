// Build the Trader Joe's product catalog from Open Food Facts (open data, ODbL; photos CC BY-SA).
// Usage: node scripts/build-catalog.mjs [--max-pages N] [--dry-run]
// Output: public/data/catalog.json, public/data/catalog.meta.json, state/catalog-report.json
// The previous catalog is replaced only if the new one passes validation (count >= 80% of previous).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sectionFor, tagsFor } from './lib/sections.mjs';

const UA = 'BrooklynMorning/0.1 (personal grocery-list app; contact via GitHub)';
const BASE = 'https://search.openfoodfacts.org/search';
// Trader Joe's house brands share the same shelves. Aldi Nord's German "Trader Joe's" is filtered out separately.
const BRAND_TAGS = ['trader-joe-s', 'trader-joes', 'trader-joe', 'trader-giotto-s', 'trader-jose-s', 'trader-ming-s', 'trader-jacques'];
const FIELDS = 'code,product_name,product_name_en,quantity,categories_tags,image_front_small_url,brands,last_modified_t,lang,countries_tags';
const PAGE_SIZE = 100;
const DELAY_MS = 350;
const args = process.argv.slice(2);
const maxPages = Number(args[args.indexOf('--max-pages') + 1]) || Infinity;
const dryRun = args.includes('--dry-run');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page, brand = 'trader-joe-s', attempt = 0) {
  const url = `${BASE}?q=brands_tags:${brand}&page_size=${PAGE_SIZE}&page=${page}&fields=${FIELDS}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (attempt < 2) {
      await sleep(1500 * (attempt + 1));
      return fetchPage(page, brand, attempt + 1);
    }
    throw new Error(`${brand} page ${page}: ${e.message}`);
  }
}

const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', eacute: 'é' };
function decode(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

function cleanName(raw) {
  let n = decode(String(raw ?? '')).replace(/\s+/g, ' ').trim();
  n = n.replace(/^trader\s*joe[’']?s?[\s,:\-–—]*/i, '').replace(/[\s,\-–—]*trader\s*joe[’']?s?$/i, '');
  n = n.replace(/^[\s,.;:\-–—"']+/, '').replace(/\.(png|jpe?g)$/i, '').trim();
  if (n.length > 3 && n === n.toUpperCase()) n = n.toLowerCase().replace(/(^|\s|-|\/|\()([a-z])/g, (m) => m.toUpperCase());
  else if (n.length > 3 && n === n.toLowerCase()) n = n.replace(/(^|\s)([a-z])/g, (m) => m.toUpperCase());
  return n;
}

function cleanSize(raw) {
  const q = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!q) return '';
  const m = q.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lb|lbs|g|kg|ml|l|ct|count|pk|pack|pieces?)\b/i);
  if (m) {
    const unit = m[2].toLowerCase().replace(/\./g, '').replace(/^fl\s*oz$/, 'fl oz').replace(/^lbs$/, 'lb').replace(/^count$/, 'ct').replace(/^pack$/, 'pk').replace(/^pieces?$/, 'pc');
    return `${m[1]} ${unit}`;
  }
  return q.length <= 20 ? q : '';
}

// Aldi Nord sells its own "Trader Joe's" brand in Germany; keep only US-market, English-named records.
function isUSEnglish(h) {
  const countries = h.countries_tags ?? [];
  if (countries.length && !countries.includes('en:united-states')) return false;
  if (!h.product_name_en && h.lang && h.lang !== 'en') return false;
  if (/aldi/i.test(String(h.brands ?? ''))) return false;
  return true;
}

async function main() {
  const hits = [];
  const seenCodes = new Set();
  for (const brand of BRAND_TAGS) {
    const first = await fetchPage(1, brand);
    const pageCount = Math.min(first.page_count, maxPages);
    console.log(`${brand}: ${first.count} records, ${first.page_count} pages; fetching ${pageCount}.`);
    const pages = [first];
    for (let p = 2; p <= pageCount; p++) {
      await sleep(DELAY_MS);
      pages.push(await fetchPage(p, brand));
      if (p % 10 === 0) console.log(`  page ${p}/${pageCount}`);
    }
    for (const d of pages) for (const h of d.hits) if (!seenCodes.has(h.code)) { seenCodes.add(h.code); hits.push(h); }
    await sleep(DELAY_MS);
  }

  const stats = { raw: hits.length, noName: 0, notTJ: 0, dupes: 0, tooShort: 0, kept: 0, withImage: 0, withSize: 0, withTags: 0, bySection: {} };
  const seen = new Map();
  for (const h of hits) {
    const name = cleanName(h.product_name_en || h.product_name);
    if (!name) { stats.noName++; continue; }
    if (name.length < 3 || !/[a-z]/i.test(name)) { stats.tooShort++; continue; }
    if (!isUSEnglish(h)) { stats.notTJ++; continue; }
    const size = cleanSize(h.quantity);
    const key = `${name.toLowerCase()}|${size.toLowerCase()}`;
    const cand = {
      id: String(h.code),
      name,
      size,
      section: sectionFor(h.categories_tags, name),
      tags: tagsFor(h.categories_tags),
      imageUrl: h.image_front_small_url || null,
      _mod: h.last_modified_t ?? 0,
    };
    const prev = seen.get(key);
    if (prev) {
      stats.dupes++;
      // Prefer the record with an image, then the most recently edited.
      if ((!prev.imageUrl && cand.imageUrl) || (Boolean(prev.imageUrl) === Boolean(cand.imageUrl) && cand._mod > prev._mod)) seen.set(key, cand);
      continue;
    }
    seen.set(key, cand);
  }
  const products = [...seen.values()]
    .map(({ _mod, ...p }) => p)
    .sort((a, b) => a.name.localeCompare(b.name));
  stats.kept = products.length;
  for (const p of products) {
    if (p.imageUrl) stats.withImage++;
    if (p.size) stats.withSize++;
    if (p.tags.length) stats.withTags++;
    stats.bySection[p.section] = (stats.bySection[p.section] ?? 0) + 1;
  }

  // Validation against the previous catalog.
  let previousCount = 0;
  try {
    previousCount = JSON.parse(await readFile('public/data/catalog.meta.json', 'utf8')).count ?? 0;
  } catch { /* first build */ }
  const problems = [];
  if (products.length < 500) problems.push(`Only ${products.length} products; expected at least 500`);
  if (previousCount && products.length < 0.8 * previousCount) problems.push(`New count ${products.length} is below 80% of previous ${previousCount}`);
  for (const p of products.slice(0, 50)) {
    if (!p.id || !p.name || !p.section) problems.push(`Malformed product ${JSON.stringify(p)}`);
  }

  const version = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ schemaVersion: 1, version, count: products.length, products });
  const checksum = createHash('sha256').update(body).digest('hex');
  const meta = {
    schemaVersion: 1,
    version,
    count: products.length,
    checksum,
    generatedAt: new Date().toISOString(),
    source: 'Open Food Facts (https://world.openfoodfacts.org) — brand filter trader-joe-s',
    license: 'Data: Open Database License (ODbL). Photos: CC BY-SA, © individual contributors.',
    note: 'Listed in Open Food Facts does not mean stocked at any particular store. No prices or availability.',
  };
  const report = { ...stats, previousCount, problems, version, checksum, imagePct: Math.round((100 * stats.withImage) / stats.kept), sizePct: Math.round((100 * stats.withSize) / stats.kept), tagsPct: Math.round((100 * stats.withTags) / stats.kept) };
  console.log(JSON.stringify(report, null, 2));

  await mkdir('state', { recursive: true });
  await writeFile('state/catalog-report.json', JSON.stringify(report, null, 2));
  if (problems.length) {
    console.error('Catalog NOT written:', problems.join('; '));
    process.exit(1);
  }
  if (dryRun) return console.log('Dry run: catalog not written.');
  await mkdir('public/data', { recursive: true });
  await writeFile('public/data/catalog.json', body);
  await writeFile('public/data/catalog.meta.json', JSON.stringify(meta, null, 2));
  console.log(`Wrote public/data/catalog.json (${(body.length / 1024).toFixed(0)} KB, ${products.length} products).`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
