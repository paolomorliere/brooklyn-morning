// The tradable universe: US-listed common stock, from Nasdaq Trader's own daily file.
//
// Why this file and not a hardcoded list: the previous screen ranked 104 names chosen by hand, so
// "the best stock today" could only ever mean "the best of the 104 I typed in". `nasdaqtraded.txt`
// is published by Nasdaq Trader for exactly this purpose, carries no robots restriction, needs no
// account and names every security currently traded on a US venue — 13,289 rows, of which the
// filters below keep the ~4,700 that are actually common stock.
//
// One bias this cannot fix: the file lists only *current* listings. A company delisted last year is
// absent, so any backtest run over this universe is survivorship-biased upward. That is stated on
// the card and in STATUS.md rather than quietly ignored.

/** Exchanges whose listings we accept: NYSE, Nasdaq, NYSE American. */
const EXCHANGES = new Set(['N', 'Q', 'A']);

/** The share classes we want. One of these phrases must appear in the security name. */
const COMMON = /common stock|ordinary shares|common shares/i;

/**
 * Instruments that are not the underlying equity. Tested against the *descriptor* only (see
 * `descriptorOf`), because "Unit Corporation Common Stock" is a company called Unit, while
 * "... - Units, each consisting of one share of Class A common stock and one-half of one warrant"
 * is a SPAC unit that happens to mention common stock.
 */
const NOT_EQUITY = /\b(warrants?|units?|rights?|preferred|depositary|debenture|notes?|subordinated)\b/i;

/** Where the issuer's name stops and the instrument description starts. */
function descriptorOf(name) {
  const dash = name.search(/\s[-–]\s/);
  const common = name.search(COMMON);
  const marks = [dash, common].filter((i) => i >= 0);
  return marks.length ? name.slice(Math.min(...marks)) : name;
}

/** Pure: split one pipe-delimited line, trimming each field. */
function fields(line) {
  return line.split('|').map((s) => s.trim());
}

/**
 * Pure: parse `nasdaqtraded.txt` into rows.
 *
 * The file is pipe-delimited with a header line and a trailing "File Creation Time:" line, which is
 * returned separately as `createdAt` so the caller can record how old the universe is.
 */
export function parseNasdaqTraded(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], createdAt: null };
  let createdAt = null;
  const header = fields(lines[0]);
  const idx = {};
  header.forEach((h, i) => (idx[h.toLowerCase()] = i));
  const need = ['symbol', 'security name', 'listing exchange', 'etf', 'test issue'];
  for (const k of need) if (idx[k] == null) throw new Error(`nasdaqtraded.txt is missing the "${k}" column`);
  const rows = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith('File Creation Time:')) {
      createdAt = line.slice('File Creation Time:'.length).trim();
      continue;
    }
    const f = fields(line);
    if (f.length < header.length - 1) continue;
    rows.push({
      symbol: f[idx.symbol] ?? '',
      name: f[idx['security name']] ?? '',
      exchange: f[idx['listing exchange']] ?? '',
      etf: f[idx.etf] ?? '',
      testIssue: f[idx['test issue']] ?? '',
      financialStatus: idx['financial status'] != null ? (f[idx['financial status']] ?? '') : '',
      nextShares: idx.nextshares != null ? (f[idx.nextshares] ?? '') : '',
    });
  }
  return { rows, createdAt };
}

/**
 * Pure: why this row is not eligible, or null if it is.
 *
 * Returning the reason rather than a boolean is deliberate — Stage A has to be able to say which
 * test removed a candidate, and a universe that shrinks for an unexplained reason is a bug nobody
 * notices.
 */
export function ineligibleReason(row) {
  const sym = (row.symbol ?? '').trim();
  if (!sym) return 'no symbol';
  if (/[$.]/.test(sym)) return 'symbol carries a class or status suffix';
  if (row.testIssue === 'Y') return 'test issue';
  if (row.etf === 'Y') return 'exchange-traded fund';
  if (row.nextShares === 'Y') return 'NextShares fund';
  if (!EXCHANGES.has(row.exchange)) return `exchange ${row.exchange || '(none)'} not accepted`;
  // Nasdaq populates this only for its own listings; blank means "nothing flagged", D means
  // deficient, E delinquent, Q bankrupt, and so on. Anything but blank or N is a company in trouble.
  if (row.financialStatus && row.financialStatus !== 'N') return `financial status ${row.financialStatus}`;
  const name = row.name ?? '';
  if (!COMMON.test(name)) return 'not described as common or ordinary shares';
  if (NOT_EQUITY.test(descriptorOf(name))) return 'derivative or non-equity instrument';
  return null;
}

/** Pure: the issuer name with the instrument description stripped, for display. */
export function issuerName(name) {
  const cut = name.replace(/\s[-–]\s.*$/, '');
  return (cut === name ? name.replace(/\s+(Class [A-Z]\s+)?(Common Stock|Ordinary Shares|Common Shares)\b.*$/i, '') : cut).trim() || name.trim();
}

/**
 * Pure: the eligible universe, plus a census of what each test removed.
 *
 * `{ symbols, byReason, total }` — `symbols` is sorted, so the same file always produces the same
 * universe in the same order, which is what makes the daily pick reproducible.
 */
export function buildUniverse(rows) {
  const symbols = [];
  const names = {};
  const byReason = {};
  for (const row of rows) {
    const reason = ineligibleReason(row);
    if (reason) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      continue;
    }
    symbols.push(row.symbol);
    names[row.symbol] = issuerName(row.name);
  }
  symbols.sort();
  return { symbols, names, byReason, total: rows.length };
}

/**
 * Pure: SEC `company_tickers.json` → ticker → { cik, title }.
 *
 * The CIK is zero-padded to ten digits because that is the form every `data.sec.gov` path wants,
 * and padding at the point of parsing means no caller has to remember.
 */
export function parseCompanyTickers(json) {
  const out = {};
  const values = Array.isArray(json) ? json : Object.values(json ?? {});
  for (const v of values) {
    const ticker = String(v?.ticker ?? '').trim().toUpperCase();
    const cik = Number(v?.cik_str ?? v?.cik);
    if (!ticker || !Number.isFinite(cik)) continue;
    // SEC lists a handful of tickers twice; the first entry is the primary registrant.
    if (out[ticker]) continue;
    out[ticker] = { cik: String(cik).padStart(10, '0'), title: String(v?.title ?? '').trim() };
  }
  return out;
}

/**
 * Pure: Nasdaq writes class shares as BRK.A while SEC and Polygon both write BRK.A as BRK-A on the
 * tape. Symbols with a dot are excluded from the universe anyway, so this only ever normalises the
 * benchmark tickers and anything a caller passes in by hand.
 */
export function tapeSymbol(symbol) {
  return String(symbol ?? '').trim().toUpperCase().replace(/\./g, '-');
}
