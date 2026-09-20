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
import { FEEDS, TOPICS, BOOSTS, MATCH_REPORT, MATCH_REPORT_PENALTY, MAX_AGE_HOURS, HALF_LIFE_HOURS, PER_TOPIC, SLOT_RULES, SUBJECTS } from './feeds.config.mjs';
import { canonicalUrl, scoreItem, selectPerTopic, tagGlossary, titleSimilarity } from './lib/rank.mjs';
import { UNIVERSE, RULE_TEXT, fetchBars, metricsFor, pickStock, countMentions, scoreboard } from './lib/stocks.mjs';

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

/** Best image URL from common RSS/Atom media fields, or from an <img> inside the description. */
function imageFrom(it) {
  const cands = [];
  for (const k of ['media:content', 'media:thumbnail', 'enclosure']) {
    for (const m of [].concat(it[k] ?? [])) {
      const url = m?.['@_url'];
      const type = m?.['@_type'] ?? '';
      const medium = m?.['@_medium'] ?? '';
      if (url && (type.startsWith('image/') || medium === 'image' || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) cands.push({ url, w: Number(m['@_width'] ?? 0) });
    }
  }
  if (!cands.length) {
    const html = text(cd(it.description)) + text(cd(it['content:encoded']));
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (m) cands.push({ url: m[1], w: 0 });
  }
  cands.sort((a, b) => b.w - a.w);
  const u = cands[0]?.url;
  return u && /^https?:\/\//.test(u) ? u : null;
}

function parseFeed(xml) {
  const x = parser.parse(xml);
  if (x.rss?.channel) {
    const items = [].concat(x.rss.channel.item ?? []);
    return items.map((it) => ({
      title: clean(text(cd(it.title))),
      url: text(cd(it.link)) || text(it.guid),
      publishedAt: it.pubDate ?? it['dc:date'] ?? null,
      excerpt: clean(text(cd(it.description)) || text(cd(it['content:encoded'])) || text(cd(it.summary))),
      imageUrl: imageFrom(it),
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
        imageUrl: imageFrom({ ...e, description: e.content }),
      };
    });
  }
  if (x['rdf:RDF']) {
    return [].concat(x['rdf:RDF'].item ?? []).map((it) => ({ title: clean(text(it.title)), url: text(it.link), publishedAt: it['dc:date'] ?? null, excerpt: clean(text(it.description)) }));
  }
  throw new Error('Unrecognized feed format');
}

/** Drop lead paragraphs the excerpt already covers, so "Opening" never just repeats "From publisher". */
function dropDuplicateParagraphs(lead, excerpt) {
  if (!lead) return null;
  const norm = (t) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  const ex = norm(excerpt.replace(/…$/, ''));
  const kept = lead.split('\n\n').filter((p) => {
    const pl = norm(p);
    if (/^[a-z]/.test(p)) return false; // sentence fragment (usually a byline stripped of the author's name)
    if (/<[a-z]+[\s>]|^embed\b/i.test(p)) return false; // leaked markup / audio embeds
    if ((p.match(/\d/g) ?? []).length / p.length > 0.12) return false; // results tables, not prose
    if (/\b(editor|reporter|correspondent|writer|journalist)\b.*\b(covers|covered|has been|joined|based in)\b/i.test(p)) return false;
    if (ex.length > 40 && (pl.startsWith(ex.slice(0, 60)) || ex.startsWith(pl.slice(0, 60)))) return false;
    return titleSimilarity(p, excerpt) < 0.7;
  });
  return kept.length ? kept.join('\n\n') : null;
}

async function extractLead(url) {
  const html = await fetchText(url, 10_000);
  const { document } = parseHTML(html);
  const og = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.getAttribute('content') ?? null;
  const article = new Readability(document, { charThreshold: 200 }).parse();
  if (!article?.content) return { lead: null, og };
  const { document: doc } = parseHTML(`<div>${article.content}</div>`);
  const paras = [...doc.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 50 && !/^(advertisement|image source|getty images|reuters|afp|listen|share|read more|sign up)/i.test(t) && !/hide caption|\/(AP|AFP|Getty|Reuters)\b|Getty Images|toggle caption|photograph:/i.test(t));
  if (!paras.length) return { lead: null, og };
  const out = [];
  let total = 0;
  for (const p of paras.slice(0, 3)) {
    if (total + p.length > LEAD_MAX_CHARS && out.length) break;
    out.push(total + p.length > LEAD_MAX_CHARS ? truncate(p, LEAD_MAX_CHARS - total) : p);
    total += p.length;
  }
  return { lead: out.join('\n\n'), og };
}

/** Daily quote: cycles through the curated file by day number, so it changes every day and repeats only after a full cycle. */
async function quoteFor(dateYMD) {
  try {
    const { quotes } = JSON.parse(await readFile('public/data/quotes.json', 'utf8'));
    const dayNumber = Math.floor(Date.parse(`${dateYMD}T12:00:00Z`) / 86400e3);
    return quotes[dayNumber % quotes.length];
  } catch {
    return null;
  }
}

/** Stock in focus (Mon–Fri) or the week's scoreboard (Sat–Sun). Never throws; returns { kind: 'unavailable' } on failure. */
async function stockBlock(dateYMD, headlines) {
  let log = { picks: [] };
  try { log = JSON.parse(await readFile('state/stocks.json', 'utf8')); } catch { /* first run */ }
  const dow = new Date(`${dateYMD}T12:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  const isWeekend = dow === 0 || dow === 6;
  try {
    if (isWeekend) {
      const monday = new Date(`${dateYMD}T12:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7));
      const weekOf = monday.toISOString().slice(0, 10);
      const picks = log.picks.filter((p) => p.date >= weekOf && p.date <= dateYMD);
      if (!picks.length) return { kind: 'scoreboard', weekOf, rows: [], combinedPct: null, counted: 0, note: 'No picks were recorded this week.', rule: RULE_TEXT };
      const barsByTicker = {};
      for (const p of picks) {
        barsByTicker[p.ticker] = await fetchBars(p.ticker, '1mo');
        await sleep(200);
      }
      const sb = scoreboard(picks, barsByTicker);
      const best = [...sb.rows].filter((r) => r.changePct != null).sort((a, b) => b.changePct - a.changePct);
      return { kind: 'scoreboard', weekOf, ...sb, best: best[0]?.ticker ?? null, worst: best[best.length - 1]?.ticker ?? null, rule: RULE_TEXT,
        note: 'Hypothetical: buy at the open on the day featured, hold to the latest close, equal amounts, no fees or taxes. Five stocks over one week is mostly noise; judge the rule over months, not days.' };
    }
    if (log.picks.some((p) => p.date === dateYMD)) {
      const p = log.picks.find((x) => x.date === dateYMD);
      return { kind: 'pick', ...p, rule: RULE_TEXT };
    }
    const rows = [];
    for (const [ticker, name] of UNIVERSE) {
      try {
        rows.push({ ticker, name, m: metricsFor(await fetchBars(ticker)) });
      } catch { rows.push({ ticker, name, m: null }); }
      await sleep(120);
    }
    const ok = rows.filter((r) => r.m).length;
    if (ok < UNIVERSE.length * 0.7) return { kind: 'unavailable', reason: `Only ${ok} of ${UNIVERSE.length} stocks returned data`, rule: RULE_TEXT };
    const recent = new Set(log.picks.slice(-10).map((p) => p.ticker));
    const mentions = countMentions(headlines);
    const pick = pickStock(rows, { recent, mentions });
    if (!pick) return { kind: 'unavailable', reason: 'No stock met the rule today', rule: RULE_TEXT };
    const rec = { date: dateYMD, ticker: pick.ticker, name: pick.name, lastClose: pick.m.last, asOf: pick.m.lastDate, r5: pick.m.r5, r20: pick.m.r20, volRatio: pick.m.volRatio, pctOfHigh60: pick.m.pctOfHigh60, mentions: mentions[pick.ticker] ?? 0 };
    log.picks.push(rec);
    log.picks = log.picks.slice(-120);
    await writeFile('state/stocks.json', JSON.stringify(log, null, 1));
    return { kind: 'pick', ...rec, rule: RULE_TEXT, scanned: ok };
  } catch (e) {
    return { kind: 'unavailable', reason: String(e.message ?? e).slice(0, 120), rule: RULE_TEXT };
  }
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
          if (feed.requireKeyword && !feed.requireKeyword.test(`${raw.title} ${raw.excerpt}`)) continue;
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
            sub: feed.sub ?? null,
            imageUrl: raw.imageUrl ?? null,
          };
          if (item.excerpt.toLowerCase() === item.title.toLowerCase()) item.excerpt = '';
          item.score = scoreItem(item, feed, { boosts: BOOSTS[feed.topic] ?? [], matchReport: MATCH_REPORT, matchReportPenalty: MATCH_REPORT_PENALTY[feed.topic] ?? MATCH_REPORT_PENALTY.default, halfLifeHours: HALF_LIFE_HOURS[feed.topic] ?? 18, now });
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
  const perTopic = selectPerTopic(items, { perTopic: PER_TOPIC, maxAgeHours: MAX_AGE_HOURS, seen, now, topics: TOPICS, slotRules: SLOT_RULES, subjects: SUBJECTS });
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
        const { lead, og } = await extractLead(s.url);
        s.lead = dropDuplicateParagraphs(lead, s.excerpt);
        if (!s.imageUrl && og && /^https?:\/\//.test(og)) s.imageUrl = og;
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
    sub: s.sub,
    imageUrl: s.imageUrl ?? null,
    glossaryTerms: s.topic === 'finance' || s.topic === 'world' ? tagGlossary(s, glossary) : [],
  }));

  const quote = await quoteFor(today);
  const stock = args.includes('--no-stock') ? { kind: 'unavailable', reason: 'skipped', rule: RULE_TEXT } : await stockBlock(today, items.filter((i) => i.topic === 'finance' || i.topic === 'ai').map((i) => i.title));

  const edition = {
    schemaVersion: 1,
    date: today,
    preparedAt: new Date().toISOString(),
    quote,
    stock,
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
  console.log(`Edition ${today}: ${stories.length} stories`, edition.counts, `| leads ${leadsGot}/${leadsTried} | images ${stories.filter((x) => x.imageUrl).length} | feeds ok ${sources.length - failed.length}/${sources.length} | stock: ${stock.kind}${stock.ticker ? ' ' + stock.ticker : ''}${stock.reason ? ' (' + stock.reason + ')' : ''}`);
  for (const f of failed) console.log(`  FAILED ${f.name} (${f.id}): ${f.error}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
