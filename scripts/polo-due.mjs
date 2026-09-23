// Decides whether a water polo source check is due, WITHOUT installing dependencies.
//
// The checking times Paolo asked for, in New York wall-clock:
//
//   Saturday  09:00  11:30  14:00  16:30
//   Sunday    09:00  11:30  14:00  16:30  22:00
//   Monday    09:00
//
// The Sunday-night and Monday-morning checks deliberately replace the earlier rule that no check
// ever ran on a weekday: a Sunday evening game finishes after the 16:30 check, and some schools post
// a weekend result only on Monday morning.
//
// GitHub cron only speaks UTC, so the workflow requests every one of these times under both
// daylight-saving offsets and this script decides which of them is a real check.
//
//   now is not Sat/Sun/Mon in New York    -> skip
//   now is outside the 2026 season        -> skip
//   now is before the day's first slot    -> skip
//   the slot now falls in was already run -> skip
//   otherwise                             -> run, and claim that slot
//
// Claiming the most recent slot at or before now, rather than the slot whose cron fired, is what
// makes this survive GitHub's delay: this repository's scheduled runs have started 3.5-6 hours late,
// and a run that arrives at 2 p.m. should do the 2 p.m. check rather than skip as "too late for 9".
// Either way a day can produce at most as many checks as it has slots.

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SEASON_END, SEASON_START } from './waterpolo.config.mjs';

const TZ = 'America/New_York';
const RUNS_PATH = 'state/waterpolo-runs.json';

/** Wall-clock date, time and weekday in New York, whatever the runner's own clock is set to. */
export function nyParts(now, tz = TZ) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return { date, time, weekday };
}

/** Slots per New York weekday. A day absent from this table is never checked. */
export const SLOTS_BY_DAY = {
  Sat: ['09:00', '11:30', '14:00', '16:30'],
  Sun: ['09:00', '11:30', '14:00', '16:30', '22:00'],
  Mon: ['09:00'],
};

/** The days that have any slot at all, for error messages. */
export const CHECK_DAYS = Object.keys(SLOTS_BY_DAY);

/**
 * How long after a slot a delayed run may still claim it.
 *
 * This matters because two of the slots sit near midnight in New York. The Sunday 22:00 check is
 * requested by a Monday 02:00 UTC cron; GitHub starting that 3.5 hours late makes it Monday 01:30
 * in New York, a day on which the only slot is 09:00. Without a look-back the Sunday night check
 * would be dropped precisely when it is delayed. Eight hours covers the 3.5-6 hour delays this
 * repository has actually seen, and is still short enough that a Monday morning run can never
 * reach back to Sunday afternoon.
 */
const GRACE_HOURS = 8;

/** Calendar arithmetic on a YYYY-MM-DD string. No timezone is involved either way. */
function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekday of a calendar date, as the same three-letter abbreviation `nyParts` returns. */
function weekdayOf(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${date}T12:00:00Z`));
}

/** Minutes between two `YYYY-MM-DDTHH:MM` wall-clock stamps. Both are New York local time. */
function minutesBetween(from, to) {
  return (Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000;
}

/**
 * Pure decision. `runs` maps a claimed slot key to when it ran.
 * Returns `{ action: 'run' | 'skip', slot, key, why }`.
 */
export function decide(now, runs = {}, opts = {}) {
  const table = opts.slotsByDay ?? SLOTS_BY_DAY;
  const season = { start: opts.seasonStart ?? SEASON_START, end: opts.seasonEnd ?? SEASON_END };
  const grace = (opts.graceHours ?? GRACE_HOURS) * 60;
  const { date, time, weekday } = nyParts(now, opts.tz ?? TZ);

  if (date < season.start || date > season.end) {
    return { action: 'skip', slot: null, key: null, why: `${date} is outside the ${season.start}…${season.end} season` };
  }

  // Today's slots, plus yesterday's, so a run that GitHub delayed across midnight still does the
  // check it was scheduled for rather than being thrown away.
  const nowStamp = `${date}T${time}`;
  const candidates = [];
  for (const d of [shiftDate(date, -1), date]) {
    for (const slot of table[weekdayOf(d)] ?? []) {
      const stamp = `${d}T${slot}`;
      if (stamp > nowStamp) continue;
      if (minutesBetween(stamp, nowStamp) > grace) continue;
      candidates.push({ date: d, slot, stamp });
    }
  }

  if (candidates.length === 0) {
    const todays = table[weekday] ?? [];
    if (todays.length === 0) {
      return {
        action: 'skip',
        slot: null,
        key: null,
        why: `${weekday} in New York; checks run on ${Object.keys(table).join(', ')} only`,
      };
    }
    return {
      action: 'skip',
      slot: null,
      key: null,
      why: `it is ${time} in New York, before the first slot (${todays[0]})`,
    };
  }

  const pick = candidates[candidates.length - 1];
  const key = `${pick.date}|${pick.slot}`;
  if (runs[key]) {
    return { action: 'skip', slot: pick.slot, key, why: `the ${pick.slot} check already ran (${runs[key]})` };
  }
  const late = Math.round(minutesBetween(pick.stamp, nowStamp));
  return {
    action: 'run',
    slot: pick.slot,
    key,
    why:
      `it is ${time} in New York on ${weekday}; the ${pick.slot} check` +
      (pick.date === date ? '' : ` for ${pick.date}`) +
      ` is due${late > 20 ? ` (${late} min after the slot)` : ''}`,
  };
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

// `file://${process.argv[1]}` is not a valid comparison: a path containing a space (or any character
// that needs escaping) percent-encodes in `import.meta.url` but not in the raw path, so the check
// silently fails and the script does nothing. pathToFileURL encodes both sides the same way.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
