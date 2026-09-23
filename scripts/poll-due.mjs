// Decides whether a CWPA poll fetch is due, WITHOUT installing dependencies.
//
// Paolo asked for Wednesday 6:00 p.m. New York as the primary check, with Thursday 6:00 a.m. as a
// backup that only runs if Wednesday did not actually produce a new poll.
//
// "Did not actually produce a new poll" is the whole point of this file. A run that fetched the page
// successfully and found last week's poll again has NOT succeeded, so the backup must still fire.
// Only `--claim`, called after a newer week has been written to disk, counts as success.
//
// GitHub's schedule is best effort and this repository's runs have started 3.5-6 hours late, so the
// windows are generous rather than exact:
//
//   Wed 18:00 -> Thu 05:59 New York   the Wednesday check, keyed to that Wednesday's date
//   Thu 06:00 -> Thu 23:59 New York   the Thursday backup for the same Wednesday, skipped on success
//   anything else                     skip
//
// A delayed Wednesday run therefore still does the Wednesday job instead of being discarded, and it
// can never be mistaken for the Thursday backup.

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SEASON_END, SEASON_START } from './waterpolo.config.mjs';

const TZ = 'America/New_York';
const RUNS_PATH = 'state/poll-runs.json';

export const PRIMARY = { weekday: 'Wed', from: '18:00' };
export const BACKUP = { weekday: 'Thu', from: '06:00' };

/** Wall-clock date, time and weekday in New York, whatever the runner's own clock is set to. */
export function nyParts(now, tz = TZ) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return { date, time, weekday };
}

/** Calendar arithmetic on a YYYY-MM-DD string, with no timezone involved either way. */
export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure decision. `runs` maps a Wednesday's date to the run that saved a poll for it.
 * Returns `{ action: 'run' | 'skip', slot, key, why }`.
 */
export function decide(now, runs = {}, opts = {}) {
  const season = { start: opts.seasonStart ?? SEASON_START, end: opts.seasonEnd ?? SEASON_END };
  const { date, time, weekday } = nyParts(now, opts.tz ?? TZ);

  if (date < season.start || date > season.end) {
    return { action: 'skip', slot: null, key: null, why: `${date} is outside the ${season.start}…${season.end} season` };
  }

  let slot = null;
  let key = null;
  if (weekday === PRIMARY.weekday && time >= PRIMARY.from) {
    slot = 'primary';
    key = date;
  } else if (weekday === BACKUP.weekday && time < BACKUP.from) {
    // A Wednesday run that GitHub started late. It is still the Wednesday check.
    slot = 'primary';
    key = shiftDate(date, -1);
  } else if (weekday === BACKUP.weekday) {
    slot = 'backup';
    key = shiftDate(date, -1);
  } else {
    return {
      action: 'skip',
      slot: null,
      key: null,
      why: `${weekday} ${time} in New York; the poll is checked Wednesday from ${PRIMARY.from} and Thursday from ${BACKUP.from}`,
    };
  }

  const done = runs[key];
  if (done) {
    return {
      action: 'skip',
      slot,
      key,
      why: `week ${done.week ?? '?'} was already saved for ${key} (${done.at ?? 'earlier'})`,
    };
  }
  return {
    action: 'run',
    slot,
    key,
    why:
      slot === 'primary'
        ? `it is ${weekday} ${time} in New York; the Wednesday poll check for ${key} is due`
        : `it is ${weekday} ${time} in New York and no new poll was saved on ${key}; the backup check is due`,
  };
}

async function readRuns() {
  try {
    return JSON.parse(await readFile(RUNS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Record that a run actually saved a new poll. Called by the workflow only when the build wrote a
 * newer week than the one already published — never on a bare HTTP 200.
 */
export async function claim(key, week, at) {
  const runs = await readRuns();
  runs[key] = { week: Number(week), at };
  const keep = Object.entries(runs).sort((a, b) => a[0].localeCompare(b[0])).slice(-20);
  await writeFile(RUNS_PATH, JSON.stringify(Object.fromEntries(keep), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === '--claim') {
    const [, , , key, week] = process.argv;
    if (!key || !week) {
      console.error('--claim needs a key and the week that was saved');
      process.exit(1);
    }
    await claim(key, week, new Date().toISOString());
    console.log(`claimed ${key} (week ${week})`);
  } else {
    const verdict = decide(new Date(), await readRuns());
    console.log(`${verdict.action}: ${verdict.why}`);
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `action=${verdict.action}\nslot=${verdict.key ?? ''}\n`);
    }
  }
}
