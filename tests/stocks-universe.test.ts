import { describe, expect, it } from 'vitest';
import {
  buildUniverse,
  ineligibleReason,
  issuerName,
  parseCompanyTickers,
  parseNasdaqTraded,
  tapeSymbol,
} from '../scripts/lib/universe.mjs';

const HEADER =
  'Nasdaq Traded|Symbol|Security Name|Listing Exchange|Market Category|ETF|Round Lot Size|Test Issue|Financial Status|CQS Symbol|NASDAQ Symbol|NextShares';

const row = (symbol: string, name: string, over: Partial<Record<string, string>> = {}) => {
  const f: Record<string, string> = {
    traded: 'Y',
    symbol,
    name,
    exchange: 'Q',
    category: 'Q',
    etf: 'N',
    lot: '100',
    test: 'N',
    status: 'N',
    cqs: symbol,
    nasdaq: symbol,
    next: 'N',
    ...over,
  };
  return [f.traded, f.symbol, f.name, f.exchange, f.category, f.etf, f.lot, f.test, f.status, f.cqs, f.nasdaq, f.next].join('|');
};

const file = (lines: string[]) => [HEADER, ...lines, 'File Creation Time: 1006202617:30|||||||||||'].join('\n');

describe('universe — the traded file', () => {
  it('reads the rows and the file creation time, ignoring the trailing line', () => {
    const { rows, createdAt } = parseNasdaqTraded(file([row('AAPL', 'Apple Inc. - Common Stock')]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: 'AAPL', exchange: 'Q', etf: 'N', testIssue: 'N' });
    expect(createdAt).toBe('1006202617:30|||||||||||');
  });

  it('throws rather than guessing when a required column is gone', () => {
    expect(() => parseNasdaqTraded('Symbol|Security Name\nAAPL|Apple')).toThrow(/listing exchange/i);
  });
});

describe('universe — eligibility', () => {
  it('keeps common stock on NYSE, Nasdaq and NYSE American', () => {
    for (const ex of ['N', 'Q', 'A']) {
      expect(ineligibleReason({ symbol: 'X', name: 'Example Inc. - Common Stock', exchange: ex, etf: 'N', testIssue: 'N', financialStatus: '', nextShares: 'N' })).toBeNull();
    }
    expect(ineligibleReason({ symbol: 'X', name: 'Example Inc. - Common Stock', exchange: 'P', etf: 'N', testIssue: 'N', financialStatus: '', nextShares: 'N' })).toMatch(/exchange P/);
  });

  it('treats a blank financial status as nothing flagged, and any letter but N as trouble', () => {
    const base = { symbol: 'X', name: 'Example Inc. - Common Stock', exchange: 'Q', etf: 'N', testIssue: 'N', nextShares: 'N' };
    expect(ineligibleReason({ ...base, financialStatus: '' })).toBeNull();
    expect(ineligibleReason({ ...base, financialStatus: 'N' })).toBeNull();
    expect(ineligibleReason({ ...base, financialStatus: 'D' })).toBe('financial status D');
    expect(ineligibleReason({ ...base, financialStatus: 'Q' })).toBe('financial status Q');
  });

  it('removes funds, test issues and class-suffixed symbols', () => {
    const { rows } = parseNasdaqTraded(
      file([
        row('SPY', 'SPDR S&P 500 ETF Trust', { exchange: 'P', etf: 'Y' }),
        row('ZVZZT', 'NASDAQ TEST STOCK - Common Stock', { test: 'Y' }),
        row('BRK.A', 'Berkshire Hathaway Inc. Class A Common Stock', { exchange: 'N' }),
        row('ABC$A', 'Example Inc. - Common Stock'),
        row('FUND', 'Example NextShares - Common Stock', { next: 'Y' }),
      ]),
    );
    expect(buildUniverse(rows).symbols).toEqual([]);
    expect(Object.keys(buildUniverse(rows).byReason).sort()).toEqual([
      'NextShares fund',
      'exchange-traded fund',
      'symbol carries a class or status suffix',
      'test issue',
    ]);
  });

  it('removes warrants, units, rights and preferred stock', () => {
    const names = [
      'Example Acquisition Corp. - Warrants',
      'Example Acquisition Corp. - Units, each consisting of one share of Class A common stock and one-half of one warrant',
      'Example Inc. - Rights',
      'Example Inc. - 7.50% Series A Cumulative Redeemable Preferred Stock',
      'Example Bancorp Depositary Shares',
      'Example Inc. 5.00% Notes due 2031',
    ];
    for (const [i, name] of names.entries()) {
      expect(ineligibleReason({ symbol: `S${i}`, name, exchange: 'Q', etf: 'N', testIssue: 'N', financialStatus: '', nextShares: 'N' })).not.toBeNull();
    }
  });

  it('does not mistake a company called Unit for a SPAC unit', () => {
    // The descriptor test exists for exactly this row: "Unit" is the issuer's name here, and the
    // only instrument description present is "Common Stock".
    expect(ineligibleReason({ symbol: 'UNTC', name: 'Unit Corporation Common Stock', exchange: 'N', etf: 'N', testIssue: 'N', financialStatus: '', nextShares: 'N' })).toBeNull();
  });

  it('keeps a REIT whose charter is named in the security description', () => {
    expect(
      ineligibleReason({
        symbol: 'EXR',
        name: 'Example Realty Trust - Common Shares of Beneficial Interest (Maryland Real Estate Investment Trust)',
        exchange: 'N',
        etf: 'N',
        testIssue: 'N',
        financialStatus: '',
        nextShares: 'N',
      }),
    ).toBeNull();
  });

  it('builds a sorted universe with issuer names and a census of the exclusions', () => {
    const { rows } = parseNasdaqTraded(
      file([
        row('MSFT', 'Microsoft Corporation - Common Stock'),
        row('AAPL', 'Apple Inc. - Common Stock'),
        row('SPY', 'SPDR S&P 500 ETF Trust', { exchange: 'P', etf: 'Y' }),
      ]),
    );
    const u = buildUniverse(rows);
    expect(u.symbols).toEqual(['AAPL', 'MSFT']);
    expect(u.names.AAPL).toBe('Apple Inc.');
    expect(u.total).toBe(3);
    expect(u.byReason['exchange-traded fund']).toBe(1);
  });

  it('strips the instrument description from the issuer name', () => {
    expect(issuerName('Alphabet Inc. - Class A Common Stock')).toBe('Alphabet Inc.');
    expect(issuerName('3M Company Common Stock')).toBe('3M Company');
    expect(issuerName('Unit Corporation Common Stock')).toBe('Unit Corporation');
  });
});

describe('universe — SEC identity', () => {
  it('pads CIKs to ten digits and keeps the first entry for a repeated ticker', () => {
    const map = parseCompanyTickers({
      0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
      1: { cik_str: 6281, ticker: 'ADI', title: 'ANALOG DEVICES INC' },
      2: { cik_str: 999999, ticker: 'ADI', title: 'Impostor Inc.' },
    });
    expect(map.AAPL).toEqual({ cik: '0000320193', title: 'Apple Inc.' });
    expect(map.ADI.cik).toBe('0000006281');
    expect(map.ADI.title).toBe('ANALOG DEVICES INC');
  });

  it('normalises class symbols to the form the price feed uses', () => {
    expect(tapeSymbol('brk.b')).toBe('BRK-B');
    expect(tapeSymbol(' spy ')).toBe('SPY');
  });
});
