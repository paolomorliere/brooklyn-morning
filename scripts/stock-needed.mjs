// Cheap pre-check for the Stock in Focus workflow: decides pick / skip WITHOUT installing dependencies.
//
// Usage: node scripts/stock-needed.mjs
// Prints "<action>: <why>" and sets `action` on $GITHUB_OUTPUT. One of `pick`, `patch` or `skip`.
//
// The problem it solves. GitHub starts scheduled runs late — 3.5 to 6 hours late on this repo — so the
// only way to have a pick ready by the time the edition is built is to ask for a slot every half hour
// from just after New York midnight, and make the slots that have nothing to do cost almost nothing. A
// skipped slot is one checkout and about ten seconds; a real run is minutes and thousands of requests.
//
// The rules, in order:
//   skip  – the market is shut today (Saturday or Sunday in New York). No session will close, so there
//           is no new information to decide on, and the open position is the correct card rather than a
//           fallback. Deciding on a Saturday would also mean Monday had nothing new to decide and
//           Monday's card would inherit Saturday's answer.
//   pick  – stock.json says `incomplete` for today: the last attempt could not reach a decision (a rate
//           limit, a source that did not answer, too little history). **This is the retry that makes a
//           pick every trading day achievable** — it keeps trying, up to one slot every half hour, and
//           it never relaxes a threshold to do it.
//   patch – today's decision is already made, but the edition on disk is not showing it. Nothing needs
//           to be decided and no price or filing is fetched; the card just has to catch up. This is the
//           case that leaves no way for a published pick to stay off the card: if the patch that should
//           have followed the decision did not land, the next slot notices and does it.
//   skip  – stock.json already holds today's decision and the card agrees, whether that decision is a
//           pick or a screen that ran to the end and found nothing. Both are final: a card that changes
//           its mind during the morning is not a record of a decision, and thresholds are never
//           loosened to fill one.
//   skip  – no session has closed since the last decision was made, so a new run would re-screen
//           identical data. This is what covers a market holiday, for which no table is maintained
//           anywhere in this project.
//   pick  – otherwise.
import { readFile, appendFile } from 'node:fs/promises';

const TZ = 'America/New_York';

// `NOW` exists so the weekend and holiday rules can be tested at a fixed instant instead of only on the
// days of the week the suite happens to run. Nothing sets it in CI.
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const today = now.toLocaleDateString('en-CA', { timeZone: TZ });
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);

/**
 * The last weekday before `date`. The exchange's real calendar comes from the sessions the price feed
 * published, which this pre-check deliberately does not read — it has no dependencies and must stay
 * cheap. Weekends are the part it can know, and the holiday case is caught by comparing against the
 * decision session the last run recorded, which did come from the real calendar.
 */
function lastWeekdayBefore(date) {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  let d = new Date(t - 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Is the edition on disk already showing what `stock.json` decided?
 *
 * A decision is "on the card" when the card is a pick for the same day. An `open-position` or
 * `unavailable` card beside a published pick for today means the patch has not landed.
 */
async function cardMatches(feed, date) {
  let edition;
  try {
    edition = JSON.parse(await readFile('public/data/edition.json', 'utf8'));
  } catch {
    return true; // no edition yet; the edition build will read the feed itself
  }
  if (edition?.date !== date) return true; // a different day: not this check's business
  if (feed?.block?.kind !== 'pick') return true; // nothing to show that the card is missing
  return edition?.stock?.kind === 'pick' && edition.stock.ticker === feed.block.ticker;
}

let action = 'pick';
let why = 'nothing has been published yet';

if (weekday === 'Sat' || weekday === 'Sun') {
  action = 'skip';
  why = `it is ${weekday} in New York, so no session will close today`;
} else {
  try {
    const feed = JSON.parse(await readFile('public/data/stock.json', 'utf8'));
    const decidedToday = feed?.decidedFor === today;
    // `outcome` was added on 8 October 2026. A file written before that has to be read from its block:
    // a published pick is a decision, and anything else is treated as retryable rather than final,
    // which is the safe direction — it can waste a slot but it cannot hide a missing card.
    const outcome = feed?.outcome ?? (feed?.block?.kind === 'pick' ? 'pick' : 'incomplete');

    if (decidedToday && outcome === 'incomplete') {
      action = 'pick';
      why = `today's run did not reach a decision (${outcome}); trying again`;
    } else if (decidedToday) {
      if (!(await cardMatches(feed, today))) {
        action = 'patch';
        why = `${feed.block?.ticker ?? 'today\'s pick'} is published for ${today} but the edition card is not showing it`;
      } else {
        action = 'skip';
        why = outcome === 'pick'
          ? `${feed.block?.ticker ?? 'a pick'} is already published for ${today} and the card shows it`
          : `today's screen ran to the end and nothing qualified; thresholds are not relaxed to fill the card`;
      }
    } else {
      const lastDecision = feed?.block?.decisionSession ?? null;
      const expected = lastWeekdayBefore(today);
      if (lastDecision && expected && lastDecision === expected) {
        action = 'skip';
        why = `no session has closed since ${lastDecision}, which the last pick already used`;
      } else {
        action = 'pick';
        why = `the last decision was for ${feed?.decidedFor ?? 'an unknown date'}, and today is ${today}`;
      }
    }
  } catch {
    /* no stock.json: pick */
  }
}

console.log(`${action}: ${why}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `action=${action}\n`);
