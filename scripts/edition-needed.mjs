// Cheap pre-check for the Morning edition workflow: decides build / refresh / skip WITHOUT installing dependencies.
// GitHub starts scheduled runs late (observed 3.5–6 h on this repo), so the workflow fires many slots a day and
// most of them must cost only a checkout.
//   build   – no edition for today's New York date
//   refresh – today's edition exists but is stale and we are still inside the morning window
//   skip    – nothing to do
import { readFile, appendFile } from 'node:fs/promises';

const TZ = 'America/New_York';
const REFRESH_FROM_HOUR = Number(process.env.REFRESH_FROM_HOUR ?? 4); // do not churn overnight
const REFRESH_UNTIL_HOUR = Number(process.env.REFRESH_UNTIL_HOUR ?? 9); // Paolo reads around 6 AM
const REFRESH_MIN_AGE_MIN = Number(process.env.REFRESH_MIN_AGE_MIN ?? 150);

const now = new Date();
const today = now.toLocaleDateString('en-CA', { timeZone: TZ });
const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));

let action = 'build';
let why = 'no edition file yet';
try {
  const cur = JSON.parse(await readFile('public/data/edition.json', 'utf8'));
  if (cur.date !== today) {
    why = `latest edition is ${cur.date}, today is ${today}`;
  } else {
    const ageMin = Math.round((now.getTime() - Date.parse(cur.preparedAt)) / 60000);
    const inWindow = hour >= REFRESH_FROM_HOUR && hour < REFRESH_UNTIL_HOUR;
    if (inWindow && ageMin >= REFRESH_MIN_AGE_MIN) {
      action = 'refresh';
      why = `today's edition is ${ageMin} min old and it is ${hour}:00 in New York`;
    } else {
      action = 'skip';
      why = `today's edition is ${ageMin} min old; ${inWindow ? 'still fresh' : `outside the ${REFRESH_FROM_HOUR}:00–${REFRESH_UNTIL_HOUR}:00 refresh window (now ${hour}:00 NY)`}`;
    }
  }
} catch {
  /* no edition file: build */
}

console.log(`${action}: ${why}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `action=${action}\n`);
