// Build today's morning edition from public RSS/Atom feeds.
// Usage: node scripts/build-edition.mjs [--force] [--no-leads] [--date YYYY-MM-DD]
// Writes public/data/edition.json, public/data/editions/<date>.json, public/data/editions/index.json, state/seen.json.
// Honesty rules: excerpts are the publisher's own text; leads are the article's first paragraphs extracted verbatim;
// nothing is rewritten or generated. A failed feed is recorded in `sources[]`, never papered over.

import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { FEEDS, TOPICS, BOOSTS, MATCH_REPORT, MAX_AGE_HOURS, PER_TOPIC } from './feeds.config.mjs';
import { canonicalUrl, scoreItem, selectPerTopic, tagGlossary } from './lib/rank.mjs';

const UA = 'Mozilla/5.0 (compatible; BrooklynMorning/0.1; personal RSS reader; +https://github.com)';
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const NO_LEADS = args.includes('--no-leads');
const DATE_ARG = args[args.indexOf('--date') + 1];
const TZ = 'America/New_York';
const MAX_LEADS = 20;
const LEAD_MAX_CHARS = 700;
const KEEP_EDITIONS = 14;

const nyDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const today = DATE_ARG && /^\d{4}-\d{2}-\d{2}$/.test(DATE_ARG) ? DATE_ARG : nyDate();
const now = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', ugrave: 'ù', laquo: '«', raquo: '»' };
const decode = (s) => String(s ?? '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = (html) => decode(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const truncate = (s, max) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–-]+$/, '') + '…';
};
const text = (v) => (v == null ? '' : typeof v === 'object' ? v['#text'] ?? v['@_href'] ?? '' : String(v));

async function fetchText(url, timeoutMs, attempt = 0) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if (attempt < 2) {
      await sleep(1000 * (attempt + 1));
      return fetchText(url, timeoutMs, attempt + 1);
    }
    throw e;
  }
}

const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '#cdata', textNodeName: '#text' });
const cd = (v) => (v && typeof v === 'object' && '#cdata' in v ? v['#cdata'] : v);

function parseFeed(xml) {
  const x = parser.parse(xml);
  if (x.rss?.channel) {
    const items = [].concat(x.rss.channel.item ?? []);
    return items.map((it) => ({
      title: clean(text(cd(it.title))),
      url: text(cd(it.link)) || text(it.guid),
      publishedAt: it.pubDate ?? it['dc:date'] ?? null,
      excerpt: clean(text(cd(it.description)) || text(cd(it['content:encoded'])) || text(cd(it.summary))),
    }));
  }
  if (x.feed) {
    const entries = [].concat(x.feed.entry ?? []);
    return entries.map((e) => {
      const links = [].concat(e.link ?? []);
      const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
      return {
        title: clean(text(cd(e.title))),
        url: alt?.['@_href'] ?? text(alt) ?? '',
        publishedAt: e.published ?? e.updated ?? null,
        excerpt: clean(text(cd(e.summary)) || text(cd(e.content))),
      };
    });
  }
  if (x['rdf:RDF']) {
    return [].concat(x['rdf:RDF'].item ?? []).map((it) => ({ title: clean(text(it.title)), url: text(it.link), publishedAt: it['dc:date'] ?? null, excerpt: clean(text(it.description)) }));
  }
  throw new Error('Unrecognized feed format');
}

async function extractLead(url) {
  const html = await fetchText(url, 10_000);
  const { document } = parseHTML(html);
  const article = new Readability(document, { charThreshold: 200 }).parse();
  if (!article?.content) return null;
  const { document: doc } = parseHTML(`<div>${article.content}</div>`);
  const paras = [...doc.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 50 && !/^(advertisement|image source|getty images|reuters|afp|listen|share|read more|sign up)/i.test(t) && !/hide caption|\/(AP|AFP|Getty|Reuters)\b|Getty Images|toggle caption|photograph:/i.test(t));
  if (!paras.length) return null;
  const out = [];
  let total = 0;
  for (const p of paras.slice(0, 3)) {
    if (total + p.length > LEAD_MAX_CHARS && out.length) break;
    out.push(total + p.length > LEAD_MAX_CHARS ? truncate(p, LEAD_MAX_CHARS - total) : p);
    total += p.length;
  }
  return out.join('\n\n');
}

async function main() {
  await mkdir('public/data/editions', { recursive: true });
  await mkdir('state', { recursive: true });

  if (!FORCE) {
    try {
      const cur = JSON.parse(await readFile('public/data/edition.json', 'utf8'));
      if (cur.date === today) {
        console.log(`Edition for ${today} already exists (prepared ${cur.preparedAt}); nothing to do.`);
        return;
      }
    } catch { /* no edition yet */ }
  }

  let seen = {};
  try { seen = JSON.parse(await readFile('state/seen.json', 'utf8')); } catch { /* first run */ }
  // Forget URLs older than 14 days.
  for (const [u, d] of Object.entries(seen)) if (now - new Date(d).getTime() > 14 * 86400e3) delete seen[u];

  const glossaryFile = JSON.parse(await readFile('public/data/glossary.json', 'utf8'));
  const glossary = glossaryFile.terms.map((t) => ({ id: t.id, pattern: new RegExp(t.match, 'i') }));

  // 1) Fetch all feeds in parallel (each with its own timeout/retries). Partial success is fine.
  const sources = [];
  const items = [];
  await Promise.all(
    FEEDS.map(async (feed) => {
      const t0 = Date.now();
      try {
        const xml = await fetchText(feed.url, 15_000);
        const parsed = parseFeed(xml);
        let n = 0;
        for (const raw of parsed) {
          if (!raw.title || !raw.url) continue;
          const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : null;
          if (!publishedAt || Number.isNaN(publishedAt.getTime())) continue;
          const item = {
            title: raw.title,
            url: raw.url.trim(),
            publishedAt: publishedAt.toISOString(),
            excerpt: truncate(raw.excerpt.replace(/^\s*(continue reading|read more).*/i, ''), 300),
            publisher: feed.name,
            feedId: feed.id,
            topic: feed.topic,
            lang: feed.lang ?? 'en',
          };
          if (item.excerpt.toLowerCase() === item.title.toLowerCase()) item.excerpt = '';
          item.score = scoreItem(item, feed, { boosts: BOOSTS[feed.topic] ?? [], matchReport: MATCH_REPORT, now });
          items.push(item);
          n++;
        }
        sources.push({ id: feed.id, name: feed.name, topic: feed.topic, ok: true, items: n, ms: Date.now() - t0 });
      } catch (e) {
        sources.push({ id: feed.id, name: feed.name, topic: feed.topic, ok: false, items: 0, error: String(e.message ?? e).slice(0, 120), ms: Date.now() - t0 });
      }
    }),
  );

  // 2) Select per topic.
  const perTopic = selectPerTopic(items, { perTopic: PER_TOPIC, maxAgeHours: MAX_AGE_HOURS, seen, now, topics: TOPICS });
  let stories = TOPICS.flatMap((t) => perTopic[t]);

  // 3) Extract opening paragraphs for allow-listed publishers, best-effort, bounded.
  const leadOK = new Map(FEEDS.map((f) => [f.id, f.lead]));
  let leadsTried = 0, leadsGot = 0;
  if (!NO_LEADS) {
    for (const s of stories) {
      if (leadsTried >= MAX_LEADS) break;
      if (!leadOK.get(s.feedId)) continue;
      leadsTried++;
      try {
        s.lead = await extractLead(s.url);
        if (s.lead) leadsGot++;
      } catch {
        s.lead = null;
      }
      await sleep(250);
    }
  }

  // 4) Finalize story records.
  stories = stories.map((s) => ({
    id: createHash('sha1').update(canonicalUrl(s.url)).digest('hex').slice(0, 12),
    topic: s.topic,
    title: s.title,
    publisher: s.publisher,
    url: s.url,
    publishedAt: s.publishedAt,
    excerpt: s.excerpt,
    excerptSource: 'rss',
    lead: s.lead ?? null,
    leadSource: s.lead ? 'extracted' : null,
    isBackground: s.isBackground,
    lang: s.lang,
    glossaryTerms: s.topic === 'finance' || s.topic === 'world' ? tagGlossary(s, glossary) : [],
  }));

  const edition = {
    schemaVersion: 1,
    date: today,
    preparedAt: new Date().toISOString(),
    stories,
    sources: sources.sort((a, b) => TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic) || a.name.localeCompare(b.name)),
    counts: Object.fromEntries(TOPICS.map((t) => [t, perTopic[t].length])),
  };

  // 5) Write outputs, update state, prune archive.
  for (const s of stories) seen[canonicalUrl(s.url)] = today;
  await writeFile('public/data/edition.json', JSON.stringify(edition));
  await writeFile(`public/data/editions/${today}.json`, JSON.stringify(edition));
  await writeFile('state/seen.json', JSON.stringify(seen, null, 0));
  const files = (await readdir('public/data/editions')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  for (const f of files.slice(KEEP_EDITIONS)) await unlink(`public/data/editions/${f}`);
  await writeFile('public/data/editions/index.json', JSON.stringify({ dates: files.slice(0, KEEP_EDITIONS).map((f) => f.replace('.json', '')) }));

  const failed = sources.filter((s) => !s.ok);
  console.log(`Edition ${today}: ${stories.length} stories`, edition.counts, `| leads ${leadsGot}/${leadsTried} | feeds ok ${sources.length - failed.length}/${sources.length}`);
  for (const f of failed) console.log(`  FAILED ${f.name} (${f.id}): ${f.error}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
