// Decides whether a water polo source check is due, WITHOUT installing dependencies.
//
// Paolo asked for four checks on Saturday and Sunday: 9:00, 11:30, 2:00 and 4:30 p.m. New York.
// GitHub cron only speaks UTC, so the workflow requests eight weekend slots — the four times under
// both daylight-saving offsets — and this script decides which of them is a real check.
//
//   now is not Sat/Sun in New York        -> skip
//   now is outside the 2026 season        -> skip
//   now is before the day's first slot    -> skip
//   the slot now falls in was already run -> skip
//   otherwise                             -> run, and claim that slot
//
// Claiming the most recent slot at or before now, rather than the slot whose cron fired, is what
// makes this survive GitHub's delay: this repository's scheduled runs have started 3.5-6 hours late,
// and a run that arrives at 2 p.m. should do the 2 p.m. check rather than skip as "too late for 9".
// Either way a weekend day can produce at most four checks, and never a weekday one.

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { SEASON_END, SEASON_START } from './waterpolo.config.mjs';

const TZ = 'America/New_York';
export const SLOTS = ['09:00', '11:30', '14:00', '16:30'];
const RUNS_PATH = 'state/waterpolo-runs.json';

/** Wall-clock date, time and weekday in New York, whatever the runner's own clock is set to. */
export function nyParts(now, tz = TZ) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return { date, time, weekday };
}

/**
 * Pure decision. `runs` maps a claimed slot key to when it ran.
 * Returns `{ action: 'run' | 'skip', slot, key, why }`.
 */
export function decide(now, runs = {}, opts = {}) {
  const slots = opts.slots ?? SLOTS;
  const season = { start: opts.seasonStart ?? SEASON_START, end: opts.seasonEnd ?? SEASON_END };
  const { date, time, weekday } = nyParts(now, opts.tz ?? TZ);

  if (weekday !== 'Sat' && weekday !== 'Sun') {
    return { action: 'skip', slot: null, key: null, why: `${weekday} in New York; checks run on weekends only` };
  }
  if (date < season.start || date > season.end) {
    return { action: 'skip', slot: null, key: null, why: `${date} is outside the ${season.start}…${season.end} season` };
  }

  const due = slots.filter((s) => s <= time);
  if (due.length === 0) {
    return { action: 'skip', slot: null, key: null, why: `it is ${time} in New York, before the first slot (${slots[0]})` };
  }
  const slot = due[due.length - 1];
  const key = `${date}|${slot}`;
  if (runs[key]) {
    return { action: 'skip', slot, key, why: `the ${slot} check already ran (${runs[key]})` };
  }
  return { action: 'run', slot, key, why: `it is ${time} in New York on ${weekday}; the ${slot} check is due` };
}

async function readRuns() {
  try {
    return JSON.parse(await readFile(RUNS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Record a slot as done. Called by the workflow only after the build actually succeeded. */
export async function claim(key, at) {
  const runs = await readRuns();
  runs[key] = at;
  // Keep the log small: the season is short and only recent slots matter for de-duplication.
  const keep = Object.entries(runs).sort((a, b) => a[0].localeCompare(b[0])).slice(-40);
  await writeFile(RUNS_PATH, JSON.stringify(Object.fromEntries(keep), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  if (mode === '--claim') {
    const key = process.argv[3];
    if (!key) {
      console.error('--claim needs a slot key');
      process.exit(1);
    }
    await claim(key, new Date().toISOString());
    console.log(`claimed ${key}`);
  } else {
    const verdict = decide(new Date(), await readRuns());
    console.log(`${verdict.action}: ${verdict.why}`);
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `action=${verdict.action}\nslot=${verdict.key ?? ''}\n`);
    }
  }
}
