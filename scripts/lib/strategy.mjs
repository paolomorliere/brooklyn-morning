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
 * The session a 21-session hold that started at `plannedEntry` has not yet passed, by calendar date.
 *
 * Deliberately generous and deliberately approximate. The exact exit is a count of trading sessions and
 * can only be known from the real calendar, which this function does not have — it runs in the edition
 * build and in the browser. All it has to decide is whether a pick is old enough that calling it "open"
 * would be wrong, so it compares against `plannedExit` when the pick recorded one and otherwise allows
 * the longest a 21-session hold can take in calendar days.
 */
function horizonIsLive(pick, date) {
  if (!pick || pick.kind !== 'pick') return false;
  const start = pick.plannedEntry ?? pick.date;
  if (typeof start !== 'string' || typeof date !== 'string' || date < start) return false;
  if (typeof pick.plannedExit === 'string') return date <= pick.plannedExit;
  // 21 sessions is five calendar weeks at worst, with holidays.
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days <= 37;
}

/**
 * Pure: the stock card an edition dated `date` should carry, given the published feed.
 *
 * The rule this exists to enforce: **a pick belongs to the session it was made in.** If the stocks
 * build last published for yesterday, yesterday's pick is not shown as today's — a feed that silently
 * repeats itself is how a broken price source produces weeks of confident, wrong cards without anything
 * failing.
 *
 * What that rule does not require is an empty card. A pick whose 21-session hold is still running is a
 * position Paolo still holds, and saying so is a true statement about today. So an earlier pick inside
 * its horizon comes back as `open-position`: the pick untouched, dated, labelled, and explicitly not
 * presented as today's decision. `unavailable` is kept for the cases where there is genuinely nothing to
 * say — nothing ever published, or every hold expired, or today's screen ran and found nothing.
 */
export function stockCardFor(feed, date, { existing = null } = {}) {
  const rule = typeof feed?.block?.rule === 'string' ? feed.block.rule : '';

  /** The last pick on file, wherever it is: today's block, or the newest recapped one. */
  const lastPick = () => {
    if (feed?.block?.kind === 'pick') return feed.block;
    if (feed?.block?.kind === 'open-position' && feed.block.pick?.kind === 'pick') return feed.block.pick;
    if (existing?.kind === 'pick') return existing;
    if (existing?.kind === 'open-position' && existing.pick?.kind === 'pick') return existing.pick;
    return null;
  };

  /**
   * The open-position card, when there is a hold to show. `reason` is the app's one line about why today
   * has no pick of its own, written for someone looking at an open position — not the longer explanation
   * the empty card gives.
   */
  const openPosition = (reason) => {
    const held = lastPick();
    if (!held || held.date === date || !horizonIsLive(held, date)) return null;
    return { kind: 'open-position', strategyVersion: 2, date, heldSince: held.date, pick: held, reason };
  };

  const nothing = (reason, lastPublishedFor = null, openReason = reason) => {
    // A refresh rebuilds today's edition in place with the latest stories, and must not take away a
    // card the edition already published. Declining to destroy a real card is not the same as inventing
    // one: nothing here ever fabricates a pick, and a kept card carries its own `strategyVersion`, so
    // the app still labels it for the rule that made it.
    if (existing && existing.kind !== 'unavailable') return existing;
    return openPosition(openReason) ?? { kind: 'unavailable', strategyVersion: 2, reason, rule, lastPublishedFor };
  };

  if (!feed || typeof feed !== 'object') return nothing('The stock build has not published anything yet.');
  if (feed.decidedFor === date && feed.block) {
    // Today's own card, from today's own feed — unless it says nothing and the edition already carries
    // something. `existing` is only ever this edition's own card, so a new day never inherits.
    if (feed.block.kind === 'unavailable' && existing && existing.kind !== 'unavailable') return existing;
    if (feed.block.kind === 'unavailable') {
      // Today's screen ran and found nothing, which is today's real answer and is published as written —
      // the card names the test that bound, and that text is not rewritten here. An open hold is still a
      // true thing to show, so it takes the card when there is one; otherwise the block passes through
      // untouched, with every field the build put on it.
      return openPosition(feed.block.reason ?? 'No pick was made today.') ?? feed.block;
    }
    return feed.block;
  }
  return feed.decidedFor
    ? nothing(
        `The stock build last published for ${feed.decidedFor}, not today. A pick belongs to the session it was made in, so it is not repeated here.`,
        feed.decidedFor,
        'Today’s pick has not been published yet.',
      )
    : nothing('The stock build has not published a dated card.');
}
