// Talking to the SEC, and keeping a compact copy of what it said.
//
// The SEC is the one source in this project with an explicit, published policy for programmatic
// access: declare a user agent that identifies you, and stay at or under ten requests a second. Both
// are honoured here. Nothing is scraped, nothing is fetched that an interface does not offer, and
// every path used is documented by the SEC itself.
//
// Three interfaces, each for a different reason:
//
//   * **Financial Statement Data Sets** (one 60 MB ZIP a quarter) are the only place that publishes
//     `accepted` — the moment EDGAR took a document — and `prevrpt`. Without those, "what was knowable
//     on day T" is guesswork. These are the authoritative record.
//   * **`companyfacts`** fills the gap at the near end. A quarterly data set appears a month or two
//     after the quarter closes, so the most recent filings are in no ZIP yet. For the few hundred
//     names that survive the price screen, `companyfacts` supplies those. It publishes `filed` but not
//     `accepted`, so acceptance is taken as the end of the filing day: later than the truth, which is
//     the direction that cannot leak information backwards.
//   * **`submissions`** gives the filing index, including the 8-K item numbers that identify an
//     earnings release.

import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { collectFacts, daysBetween, digestSubmissions, ymdToIso } from './fundamentals.mjs';
import { readZipEntry } from './zip.mjs';

/**
 * The user agent the SEC requires, assembled from a contact it never stores in this repository.
 *
 * The SEC's access policy asks every automated client to declare a working contact, and it enforces
 * it: a request without one is refused with a 403, and so is one that carries a URL instead of an
 * address. Both were measured. That leaves exactly two options — declare a real contact, or declare a
 * false one. A false contact would be a misrepresentation to a government service, so the contact is
 * required and comes from the environment: `SEC_CONTACT`, kept as a repository Actions secret
 * alongside the price key. Nothing personal is committed, and it never reaches the browser.
 */
export function secUserAgent() {
  const contact = (process.env.SEC_CONTACT ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    throw new Error(
      'SEC_CONTACT must be set to a working email address. The SEC refuses automated requests that do not declare a contact, and declaring a false one would misrepresent who is asking.',
    );
  }
  return `BrooklynMorning/0.2 ${contact}`;
}

/** Nasdaq Trader asks for nothing in particular, so this one names the project and no person. */
export const CLIENT_UA = 'BrooklynMorning/0.2 (personal morning edition)';

/** The SEC's documented ceiling is ten requests a second. This stays comfortably under it. */
const MIN_GAP_MS = 150;
let nextAt = 0;

async function pace() {
  const now = Date.now();
  const at = Math.max(now, nextAt);
  nextAt = at + MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** One GET against the SEC, paced and retried on a server error only. */
export async function secGet(url, { binary = false, attempt = 0, timeoutMs = 120_000 } = {}) {
  await pace();
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': secUserAgent(), 'accept-encoding': 'gzip, deflate', accept: binary ? '*/*' : 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (attempt < 2) return secGet(url, { binary, attempt: attempt + 1, timeoutMs });
    throw new Error(`${url}: ${err.message}`);
  }
  if (!res.ok) {
    if (res.status >= 500 && attempt < 2) return secGet(url, { binary, attempt: attempt + 1, timeoutMs });
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  if (binary) return Buffer.from(await res.arrayBuffer());
  return res.json();
}

/* ------------------------------------------------------------------ the universe */

/** Nasdaq Trader's own list of everything traded on a US venue. No account, no robots restriction. */
export async function fetchNasdaqTraded() {
  const res = await fetch('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt', {
    headers: { 'user-agent': CLIENT_UA, accept: 'text/plain' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`nasdaqtraded.txt: HTTP ${res.status}`);
  return res.text();
}

/** Ticker → CIK, from the SEC's own mapping. */
export function fetchCompanyTickers() {
  return secGet('https://www.sec.gov/files/company_tickers.json');
}

/* ------------------------------------------------------------------ quarterly data sets */

/** The quarter a date falls in, as `{ year, q }`. */
export function quarterOf(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return { year, q: Math.floor((month - 1) / 3) + 1 };
}

/** `n` quarters ending with the one `asOf` falls in, oldest first. */
export function quartersBack(n, asOf) {
  let { year, q } = quarterOf(asOf);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ year, q });
    q--;
    if (q === 0) {
      q = 4;
      year--;
    }
  }
  return out.reverse();
}

export const fsdsUrl = ({ year, q }) =>
  `https://www.sec.gov/files/dera/data/financial-statement-data-sets/${year}q${q}.zip`;

/**
 * One quarterly data set, reduced to the submissions and facts this project uses.
 *
 * The reduction is the point: `num.txt` holds every tag every filer reported, which is hundreds of
 * megabytes a quarter, and this project reads about twenty tags. Filtering at parse time means the
 * cache that gets committed is a few megabytes rather than a few hundred.
 */
export async function fetchQuarterDigest({ year, q }, { tags, ciks = null } = {}) {
  const buf = await secGet(fsdsUrl({ year, q }), { binary: true });
  // Both members are handed over as Buffers. `num.txt` is over half a gigabyte uncompressed, which is
  // past Node's maximum string length, so converting it to a string throws before any parsing starts.
  const { byAdsh } = digestSubmissions(readZipEntry(buf, 'sub.txt'), { ciks });
  const facts = collectFacts(readZipEntry(buf, 'num.txt'), byAdsh, { tags });
  // A submission whose facts were all filtered away is dropped too: it would only pad the cache.
  const used = new Set(facts.map((f) => f.adsh));
  const subs = [...byAdsh.values()].filter((s) => used.has(s.adsh));
  return { year, q, subs, facts, zipBytes: buf.length };
}

/* ------------------------------------------------------------------ the committed digest */

const SUB_COLS = ['adsh', 'cik', 'sic', 'form', 'period', 'fy', 'fp', 'filed', 'accepted', 'prevrpt'];
const FACT_COLS = ['cik', 'adsh', 'tag', 'ddate', 'qtrs', 'uom', 'value'];

/**
 * Pure: the digest as two CSV tables.
 *
 * Submissions and facts are kept apart rather than denormalised, because `accepted`, `form` and
 * `filed` repeat for every fact in a filing — about twenty-five times each. Joining on read costs
 * nothing and roughly halves the file.
 */
export function encodeDigest({ subs, facts }) {
  const lines = [`#subs ${SUB_COLS.join(',')}`];
  for (const s of subs) {
    lines.push([s.adsh, s.cik, s.sic, s.form, s.period ?? '', s.fy, s.fp, s.filed ?? '', s.accepted, s.prevrpt ? 1 : 0].join(','));
  }
  lines.push(`#facts ${FACT_COLS.join(',')}`);
  for (const f of facts) {
    lines.push([f.cik, f.adsh, f.tag, f.ddate, f.qtrs, f.uom, f.value].join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Pure: read the digest back, re-joining each fact to its submission. */
export function decodeDigest(text) {
  const subs = [];
  const facts = [];
  let section = null;
  for (const line of String(text ?? '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('#subs')) {
      section = 'subs';
      continue;
    }
    if (line.startsWith('#facts')) {
      section = 'facts';
      continue;
    }
    const f = line.split(',');
    if (section === 'subs') {
      subs.push({
        adsh: f[0],
        cik: f[1],
        name: '',
        sic: f[2],
        form: f[3],
        period: f[4] || null,
        fy: f[5],
        fp: f[6],
        filed: f[7] || null,
        accepted: f[8],
        prevrpt: f[9] === '1',
      });
    } else if (section === 'facts') {
      const value = Number(f[6]);
      const qtrs = Number(f[4]);
      if (!Number.isFinite(value) || !Number.isInteger(qtrs)) continue;
      facts.push({ cik: f[0], adsh: f[1], tag: f[2], ddate: f[3], qtrs, uom: f[5], value });
    }
  }
  const byAdsh = new Map(subs.map((s) => [s.adsh, s]));
  const joined = [];
  for (const f of facts) {
    const s = byAdsh.get(f.adsh);
    if (!s) continue;
    joined.push({ ...f, accepted: s.accepted, filed: s.filed, form: s.form, period: s.period, fy: s.fy, fp: s.fp, prevrpt: s.prevrpt });
  }
  return { subs, facts: joined, byAdsh };
}

export async function writeDigest(path, digest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, gzipSync(Buffer.from(encodeDigest(digest), 'utf8'), { level: 9 }));
  return path;
}

export async function readDigest(path) {
  try {
    return decodeDigest(gunzipSync(await readFile(path)).toString('utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/* ------------------------------------------------------------------ who filed today */

/**
 * Pure: the 10-Q and 10-K filings in one day's EDGAR form index.
 *
 * This is what makes the near-end top-up precise rather than speculative. One request a day returns
 * every filing EDGAR disseminated, so instead of guessing which companies might have reported since
 * the last quarterly data set, the build knows: it fetches `companyfacts` for exactly those CIKs that
 * filed, and for nobody else. Off-season that is eight or ten companies a day.
 *
 * The form type is matched explicitly rather than taken as the first token, because plenty of EDGAR
 * form names contain spaces ("SC 13D", "1-A POS") and splitting on whitespace mis-reads them.
 */
export function parseDailyIndex(text, { forms = /^10-[KQ]\S*$/ } = {}) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = /^(\S+)\s{2,}(.+?)\s{2,}(\d{1,10})\s+(\d{8})\s+(\S+)\s*$/.exec(line);
    if (!m) continue;
    const [, form, name, cik, filed, path] = m;
    if (!forms.test(form)) continue;
    out.push({ form, name: name.trim(), cik: String(Number(cik)), filed: ymdToIso(filed), path });
  }
  return out;
}

/** One session's EDGAR form index. Returns null for a day EDGAR published nothing. */
export async function fetchDailyIndex(date) {
  const { year, q } = quarterOf(date);
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${year}/QTR${q}/form.${date.replace(/-/g, '')}.idx`;
  await pace();
  const res = await fetch(url, { headers: { 'user-agent': secUserAgent(), accept: 'text/plain' }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseDailyIndex(await res.text());
}

/* ------------------------------------------------------------------ the near end */

/** `0000320193` from anything CIK-shaped. */
export const padCik = (cik) => String(Number(String(cik ?? '').replace(/\D/g, ''))).padStart(10, '0');

/** EDGAR's filing index for one company — forms, dates and the 8-K item numbers. */
export function fetchSubmissionIndex(cik) {
  return secGet(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);
}

/** How long a reported period ran, mapped to the data sets' `qtrs` convention. */
function qtrsFromSpan(start, end) {
  if (!start) return 0;
  const days = daysBetween(start, end);
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days <= 115) return 1;
  if (days <= 205) return 2;
  if (days <= 295) return 3;
  if (days <= 400) return 4;
  return null;
}

/**
 * Pure: `companyfacts` JSON → facts in the same shape the data sets produce.
 *
 * Two differences are recorded rather than smoothed over. `accepted` is the end of the filing day,
 * because `companyfacts` does not publish an acceptance time — later than the truth, so a figure is
 * never treated as knowable sooner than it was. And `prevrpt` is unknown, so it is false: selection by
 * acceptance already prefers the latest statement of a figure, which is what the flag is for.
 */
export function factsFromCompanyFacts(json, { tags = null, cik = null } = {}) {
  const resolved = cik ? String(Number(cik)) : String(Number(json?.cik ?? NaN));
  const out = [];
  for (const taxonomy of Object.values(json?.facts ?? {})) {
    for (const [tag, entry] of Object.entries(taxonomy ?? {})) {
      if (tags && !tags.has(tag)) continue;
      for (const [uom, rows] of Object.entries(entry?.units ?? {})) {
        for (const r of rows ?? []) {
          const end = String(r.end ?? '');
          const filed = String(r.filed ?? '');
          const value = Number(r.val);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !/^\d{4}-\d{2}-\d{2}$/.test(filed) || !Number.isFinite(value)) continue;
          const qtrs = qtrsFromSpan(r.start ? String(r.start) : null, end);
          if (qtrs == null) continue;
          const form = String(r.form ?? '');
          out.push({
            cik: resolved,
            adsh: String(r.accn ?? ''),
            tag,
            version: 'companyfacts',
            ddate: end,
            qtrs,
            uom,
            value,
            accepted: `${filed}T23:59:59.000Z`,
            filed,
            form,
            period: end,
            fy: String(r.fy ?? ''),
            fp: String(r.fp ?? ''),
            prevrpt: false,
          });
        }
      }
    }
  }
  return out;
}

/** Pure: the 10-Q and 10-K submissions implied by a set of `companyfacts` facts. */
export function submissionsFromFacts(facts, { sic = '' } = {}) {
  const byAdsh = new Map();
  for (const f of facts) {
    if (!f.adsh || byAdsh.has(f.adsh)) continue;
    if (!/^10-[KQ]/.test(f.form)) continue;
    byAdsh.set(f.adsh, {
      adsh: f.adsh,
      cik: f.cik,
      name: '',
      sic,
      form: f.form,
      period: f.period,
      fy: f.fy,
      fp: f.fp,
      filed: f.filed,
      accepted: f.accepted,
      prevrpt: false,
    });
  }
  // A `companyfacts` row's `period` is the period the figure covers, not the filing's own period, so
  // each submission takes the latest period end any of its facts reported.
  for (const f of facts) {
    const s = byAdsh.get(f.adsh);
    if (s && f.ddate > (s.period ?? '')) s.period = f.ddate;
  }
  return [...byAdsh.values()].sort((a, b) => (a.accepted < b.accepted ? -1 : 1));
}

/** Pure: the quarterly digest with anything newer from `companyfacts` laid over it. */
export function mergeFacts(digestFacts, overlayFacts) {
  const seen = new Set(digestFacts.map((f) => `${f.adsh}|${f.tag}|${f.ddate}|${f.qtrs}|${f.uom}`));
  const out = [...digestFacts];
  for (const f of overlayFacts) {
    const key = `${f.adsh}|${f.tag}|${f.ddate}|${f.qtrs}|${f.uom}`;
    // The data sets win on a duplicate: they carry the real acceptance timestamp and the `prevrpt`
    // flag, where the overlay only has a filing date.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** The period-end date the digest reaches, so the build knows how much the overlay has to cover. */
export function digestHorizon(subs) {
  let latest = null;
  for (const s of subs ?? []) if (s.accepted && (!latest || s.accepted > latest)) latest = s.accepted;
  return latest;
}

/** Pure: an SIC code for each CIK, taken from the digest's submissions. */
export function sicByCik(subs) {
  const out = new Map();
  for (const s of subs ?? []) {
    if (!s.sic) continue;
    const seen = out.get(s.cik);
    if (!seen || s.accepted > seen.accepted) out.set(s.cik, { sic: s.sic, accepted: s.accepted });
  }
  return new Map([...out.entries()].map(([cik, v]) => [cik, v.sic]));
}

export { ymdToIso };
