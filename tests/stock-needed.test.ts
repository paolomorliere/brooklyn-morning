import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/stock-needed.mjs');

/** Run the pre-check in a throwaway directory holding just a stock.json and, optionally, an edition. */
function run(feed: unknown | null, now: string, edition?: unknown): { action: string; why: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bm-stock-'));
  try {
    mkdirSync(join(dir, 'public/data'), { recursive: true });
    if (feed) writeFileSync(join(dir, 'public/data/stock.json'), JSON.stringify(feed));
    if (edition) writeFileSync(join(dir, 'public/data/edition.json'), JSON.stringify(edition));
    const out = execFileSync(process.execPath, [script], { cwd: dir, env: { ...process.env, NOW: now }, encoding: 'utf8' }).trim();
    const i = out.indexOf(':');
    return { action: out.slice(0, i), why: out.slice(i + 1).trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 2026-10-07 is a Wednesday; 10-08 Thursday, 10-09 Friday, 10-10 Saturday, 10-11 Sunday, 10-12 Monday.
// 14:00Z is 10:00 in New York, well inside the morning the workflow covers.
const WED = '2026-10-07T14:00:00Z';
const THU = '2026-10-08T14:00:00Z';
const SAT = '2026-10-10T14:00:00Z';
const SUN = '2026-10-11T14:00:00Z';
const MON = '2026-10-12T14:00:00Z';

const feedFor = (date: string, outcome: string, decisionSession: string, kind = 'pick') => ({
  builtAt: `${date}T11:00:00.000Z`,
  decidedFor: date,
  outcome,
  strategyVersion: 2,
  block: { kind, ticker: 'VCTR', decisionSession },
});

describe('stock pre-check (one pick per trading day, cheaply)', () => {
  it('picks when nothing has ever been published', () => {
    expect(run(null, WED).action).toBe('pick');
  });

  it('skips once today’s pick exists and nothing says the card is behind', () => {
    expect(run(feedFor('2026-10-08', 'pick', '2026-10-07'), THU).action).toBe('skip');
  });

  it('skips when the card already shows today’s pick', () => {
    const edition = { date: '2026-10-08', stock: { kind: 'pick', ticker: 'VCTR' } };
    const r = run(feedFor('2026-10-08', 'pick', '2026-10-07'), THU, edition);
    expect(r.action).toBe('skip');
    expect(r.why).toMatch(/the card shows it/);
  });

  it('patches — not re-decides — when the pick is published but the card is not showing it', () => {
    // This is the 7 October 2026 failure, and the slot that now repairs it. Nothing is fetched and no
    // threshold is touched: the decision already exists, the card just has to catch up.
    const edition = { date: '2026-10-08', stock: { kind: 'unavailable', reason: 'nothing for today' } };
    const r = run(feedFor('2026-10-08', 'pick', '2026-10-07'), THU, edition);
    expect(r.action).toBe('patch');
    expect(r.why).toMatch(/not showing it/);
  });

  it('patches when the card is holding an open position instead of today’s pick', () => {
    const edition = { date: '2026-10-08', stock: { kind: 'open-position', heldSince: '2026-10-07' } };
    expect(run(feedFor('2026-10-08', 'pick', '2026-10-07'), THU, edition).action).toBe('patch');
  });

  it('patches when the card shows a different ticker than the one published', () => {
    const edition = { date: '2026-10-08', stock: { kind: 'pick', ticker: 'ATEX' } };
    expect(run(feedFor('2026-10-08', 'pick', '2026-10-07'), THU, edition).action).toBe('patch');
  });

  it('does not ask for a patch when the screen found nothing — there is nothing to show', () => {
    const edition = { date: '2026-10-08', stock: { kind: 'unavailable', reason: 'nothing qualified' } };
    expect(run(feedFor('2026-10-08', 'none-qualified', '2026-10-07', 'unavailable'), THU, edition).action).toBe('skip');
  });

  it('does not ask for a patch over an edition from another day', () => {
    const edition = { date: '2026-10-07', stock: { kind: 'unavailable', reason: 'x' } };
    expect(run(feedFor('2026-10-08', 'pick', '2026-10-07'), THU, edition).action).toBe('skip');
  });

  it('retries a run that could not reach a decision', () => {
    const feed = { ...feedFor('2026-10-08', 'incomplete', '2026-10-07', 'unavailable') };
    const r = run(feed, THU);
    expect(r.action).toBe('pick');
    expect(r.why).toMatch(/did not reach a decision/);
  });

  it('does not retry a screen that ran to the end and found nothing', () => {
    // The thresholds are published and are never relaxed to fill a card, so running again would only
    // reach the same answer with the same data.
    const r = run(feedFor('2026-10-08', 'none-qualified', '2026-10-07', 'unavailable'), THU);
    expect(r.action).toBe('skip');
    expect(r.why).toMatch(/nothing qualified/);
  });

  it('picks on a trading day when the last decision was an earlier day', () => {
    expect(run(feedFor('2026-10-07', 'pick', '2026-10-06'), THU).action).toBe('pick');
  });

  it('skips on Saturday and Sunday', () => {
    for (const day of [SAT, SUN]) {
      const r = run(feedFor('2026-10-09', 'pick', '2026-10-08'), day);
      expect(r.action).toBe('skip');
      expect(r.why).toMatch(/no session will close today/);
    }
  });

  it('still picks on the Monday after a weekend of skipping', () => {
    // This is the case that decided the weekend rule. If a pick were made on the Saturday, it would have
    // used Friday's close — and then Monday would have no new session to decide on and would inherit
    // Saturday's answer. Skipping the weekend keeps Monday a real decision.
    const r = run(feedFor('2026-10-09', 'pick', '2026-10-08'), MON);
    expect(r.action).toBe('pick');
  });

  it('skips when no session has closed since the last decision — the market-holiday case', () => {
    // Thursday was a holiday: the run that day decided on Wednesday's close. On Friday the last weekday
    // is Thursday, but the decision already used... Wednesday. Here the last decision session equals the
    // previous weekday, so nothing new has closed and the slot costs a checkout.
    const r = run(feedFor('2026-10-07', 'pick', '2026-10-07'), THU);
    expect(r.action).toBe('skip');
    expect(r.why).toMatch(/no session has closed since/);
  });

  it('treats a file written before `outcome` existed as retryable unless it carries a pick', () => {
    const legacyPick = { decidedFor: '2026-10-08', block: { kind: 'pick', ticker: 'ATEX', decisionSession: '2026-10-07' } };
    expect(run(legacyPick, THU).action).toBe('skip');
    const legacyEmpty = { decidedFor: '2026-10-08', block: { kind: 'unavailable', decisionSession: '2026-10-07' } };
    expect(run(legacyEmpty, THU).action).toBe('pick');
  });
});
