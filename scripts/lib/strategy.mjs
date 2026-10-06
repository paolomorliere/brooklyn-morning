// The frozen rules, and the sentence the app shows about them.
//
// `strategy-v2.json` is the specification as a file rather than as code spread across modules, and it
// is hashed on every build. The hash goes onto every pick. That is the only mechanism that makes a
// later claim checkable: if the rules change, the hash changes, and a pick made under the old rules
// still says which rules made it. A backtest result quoted against one hash cannot quietly be
// re-presented as evidence for a different set of rules.
//
// `candidateSignalsAdopted` is empty and stays empty until the development window says otherwise. The
// field exists so that adopting 12−1 momentum or the five-session return is a visible edit to a
// committed file with a new hash, not a quiet change of behaviour.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Where the rule file is.
 *
 * Resolved from this module's own location when that is a real file path, which it is under Node. The
 * test runner transforms modules and `import.meta.url` is not a `file:` URL there, so the repository
 * path is the fallback — the file is at a fixed place either way.
 */
const PATHS = [
  import.meta.url.startsWith('file:') ? new URL('../strategy-v2.json', import.meta.url) : null,
  'scripts/strategy-v2.json',
].filter(Boolean);

let cached = null;

/** The rules, with the hash of the exact bytes that were read. */
export async function loadStrategy() {
  if (cached) return cached;
  let raw = null;
  let lastError = null;
  for (const path of PATHS) {
    try {
      raw = await readFile(path, 'utf8');
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (raw == null) throw new Error(`the frozen rule file could not be read: ${lastError?.message ?? 'unknown error'}`);
  cached = { rules: JSON.parse(raw), hash: createHash('sha256').update(raw).digest('hex').slice(0, 16) };
  return cached;
}

/**
 * The sentence shown under the card.
 *
 * Every clause in it is a thing the build actually does, and the last one is the most important: the
 * score is a ranking position among the day's eligible candidates, not a probability of anything.
 */
export function ruleText(rules) {
  const e = rules.eligibility;
  return [
    `Universe: every US-listed common stock on NYSE, Nasdaq or NYSE American — about 4,700 names from Nasdaq Trader's own file.`,
    `Eligible means: priced at $${e.minClose} or more, median daily turnover of $${e.minMedianDollarVolume / 1e6}M or more over 60 sessions,`,
    `at least ${e.minSessions} sessions of history, a 10-Q or 10-K whose period ended within ${e.maxFinancialsAgeDays} days,`,
    `${e.trendFilter}, volatility inside the day's ${Math.round(e.volatilityPercentile * 100)}th percentile,`,
    `debt no more than ${e.maxLeverage}× operating cash flow, no results announced in the last ${e.announcementQuietSessions} sessions,`,
    `and no position already open in the stock or a fourth in the same SIC division.`,
    `Eligible candidates are then ranked on equally weighted z-scores within their sector group, over the signals that are defined for that group.`,
    `One position per session, held ${rules.horizonSessions} sessions, a twenty-first of capital each, ${rules.costBasisPoints.stock} basis points of cost each way.`,
    `Fundamentals are read as they stood on the decision date, never as they read today.`,
    `The score is a ranking position among that day's eligible candidates. It is not a probability, a price target, or a forecast of any return.`,
  ].join(' ');
}

/** The honest one-line statement of how much evidence there is. Shown on the card, every day. */
export function validationNote(rules) {
  if (rules.validation?.status === 'not-enough-evidence') {
    return (
      rules.validation.note ??
      'There is not yet enough evidence to say whether this process works. Forward tracking starts the day it goes live.'
    );
  }
  return rules.validation?.note ?? 'No validation statement is recorded.';
}

/**
 * Pure: the stock card an edition dated `date` should carry, given the published feed.
 *
 * The rule this exists to enforce: **a pick belongs to the session it was made in.** If the stocks
 * build last published for yesterday, yesterday's pick is not shown as today's — the card says there
 * is nothing for today and names the date of the last one. A feed that silently repeats itself is how
 * a broken price source produces weeks of confident, wrong cards without anything failing.
 */
export function stockCardFor(feed, date) {
  const rule = typeof feed?.block?.rule === 'string' ? feed.block.rule : '';
  if (!feed || typeof feed !== 'object') {
    return { kind: 'unavailable', strategyVersion: 2, reason: 'The stock build has not published anything yet.', rule: '', lastPublishedFor: null };
  }
  if (feed.decidedFor === date && feed.block) return feed.block;
  return {
    kind: 'unavailable',
    strategyVersion: 2,
    reason: feed.decidedFor
      ? `The stock build last published for ${feed.decidedFor}, not today. A pick belongs to the session it was made in, so it is not repeated here.`
      : 'The stock build has not published a dated card.',
    rule,
    lastPublishedFor: feed.decidedFor ?? null,
  };
}
