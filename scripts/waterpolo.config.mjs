// Source registry for the Water Polo screen: NCAA men's varsity water polo, 2026 season only.
//
// Every school on the watchlist runs Sidearm Sports in one of two generations. Both server-render the
// whole season and both accept an explicit season-pinned URL, so we never rely on a site's default season.
//   classic  – jQuery/Knockout markup, `li.sidearm-schedule-game[data-game-id]`
//   nextgen  – Vue SSR markup, `[data-test-id="s-game-card-standard__root"]`
//
// Verified 2026-09-22: all 13 URLs return HTTP 200 and parse. Re-verify with `node scripts/build-waterpolo.mjs --dry-run`.

/** The season this screen is pinned to. Rolling forward is a deliberate edit, never automatic. */
export const SEASON = 2026;
export const SPORT_LABEL = "Men's Water Polo";

/** A 2026 men's water polo game can only fall inside this window. Used to validate a page's season. */
export const SEASON_START = '2026-08-01';
export const SEASON_END = '2027-01-31';

/**
 * The watchlist. `id` is the canonical team slug and must match a key produced by `teamSlug()`.
 * `sportNote` records a deliberate exception to the sport-title check, with the reason.
 */
export const SCHOOLS = [
  {
    id: 'liu',
    school: 'Long Island University',
    display: 'LIU',
    site: 'https://liuathletics.com',
    url: 'https://liuathletics.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
    // LIU's schedule page title is just "Long Island University Athletics" — no season, no sport.
    // Season is validated from the game dates instead; sport from the URL path and the page's own nav.
    seasonNote: 'title carries no year; validated from game dates',
  },
  {
    id: 'harvard',
    school: 'Harvard University',
    display: 'Harvard',
    site: 'https://gocrimson.com',
    url: 'https://gocrimson.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
  },
  {
    id: 'princeton',
    school: 'Princeton University',
    display: 'Princeton',
    site: 'https://goprincetontigers.com',
    url: 'https://goprincetontigers.com/sports/mens-water-polo/schedule/2026',
    generation: 'nextgen',
  },
  {
    id: 'mit',
    school: 'Massachusetts Institute of Technology',
    display: 'MIT',
    site: 'https://mitathletics.com',
    url: 'https://mitathletics.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
  },
  {
    id: 'brown',
    school: 'Brown University',
    display: 'Brown',
    site: 'https://brownbears.com',
    url: 'https://brownbears.com/sports/mens-water-polo/schedule/2026',
    generation: 'nextgen',
  },
  {
    id: 'iona',
    school: 'Iona University',
    display: 'Iona',
    site: 'https://ionagaels.com',
    url: 'https://ionagaels.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
  },
  {
    id: 'wagner',
    school: 'Wagner College',
    display: 'Wagner',
    site: 'https://wagnerathletics.com',
    // Wagner's sport slug is "mens-polo", not "mens-water-polo".
    url: 'https://wagnerathletics.com/sports/mens-polo/schedule/2026',
    generation: 'classic',
    sportSlug: 'mens-polo',
  },
  {
    id: 'fordham',
    school: 'Fordham University',
    display: 'Fordham',
    site: 'https://fordhamsports.com',
    url: 'https://fordhamsports.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
  },
  {
    id: 'bucknell',
    school: 'Bucknell University',
    display: 'Bucknell',
    site: 'https://bucknellbison.com',
    url: 'https://bucknellbison.com/sports/mens-water-polo/schedule/2026',
    generation: 'nextgen',
  },
  {
    id: 'air-force',
    school: 'United States Air Force Academy',
    display: 'Air Force',
    site: 'https://goairforcefalcons.com',
    url: 'https://goairforcefalcons.com/sports/mens-water-polo/schedule/2026',
    generation: 'nextgen',
  },
  {
    id: 'navy',
    school: 'United States Naval Academy',
    display: 'Navy',
    site: 'https://navysports.com',
    url: 'https://navysports.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
  },
  {
    id: 'mount-st-marys',
    school: "Mount St. Mary's University",
    display: "Mount St. Mary's",
    site: 'https://mountathletics.com',
    url: 'https://mountathletics.com/sports/mens-water-polo/schedule/2026',
    generation: 'classic',
  },
  {
    id: 'george-washington',
    school: 'George Washington University',
    display: 'George Washington',
    site: 'https://gwsports.com',
    url: 'https://gwsports.com/sports/mens-water-polo/schedule/2026',
    generation: 'nextgen',
    // GW titles the page "2026 Water Polo Schedule" with no "Men's". The URL path is /sports/mens-water-polo/,
    // the opponents are men's programs (UC Irvine, LMU, Princeton, LIU, Iona, Chapman), and gwsports.com serves
    // women's water polo from a separate path that currently defaults to 2020. Verified 2026-09-22.
    sportNote: 'page title omits "Men\'s"; sport confirmed from URL path and men\'s-only opponents',
  },
];

export const WATCHED_IDS = new Set(SCHOOLS.map((s) => s.id));

/**
 * Ranking prefixes and decorations sites put in front of an opponent name.
 * "No. 13", "#13", "(RV)" (receiving votes), "(T)" (tied), "(D-III)" division tags.
 */
const DECORATIONS = [
  /^no\.\s*\d+\s*/i,
  /^#\s*\d+\s*/,
  /^\(rv\)\s*/i,
  // Some pages print the receiving-votes marker without brackets: "RV Wagner College".
  /^rv\s+(?=[a-z])/i,
  /^\(t\)\s*/i,
  /^\(d-?i{1,3}\)\s*/i,
  /^\(rv\/\d+\)\s*/i,
  /^\(\d+\)\s*/,
  // A trailing exhibition marker is part of the row's status, not part of the team's name.
  /\s*\((?:exhib?|exh|scrimmage)\.?\)\s*$/i,
];

/** Parenthetical state qualifiers: "Biola (Calif.)", "Mount St. Mary's (Md.)". */
const STATE_QUALIFIER =
  /\s*\((?:ala|alaska|ariz|ark|calif|colo|conn|del|fla|ga|hawaii|idaho|ill|ind|iowa|kan|ky|la|maine|md|mass|mich|minn|miss|mo|mont|neb|nev|n\.h|n\.j|n\.m|n\.y|n\.c|n\.d|ohio|okla|ore|pa|r\.i|s\.c|s\.d|tenn|texas|utah|vt|va|wash|w\.va|wis|wyo)\.?\)\s*$/i;

/** Rows that are page furniture, not games. */
export const NON_TEAM_PATTERNS = [
  /tournament$/i,
  /^tba$/i,
  /^opponent$/i,
  /championship$/i,
  /invitational$/i,
  /^bye$/i,
];

/**
 * Canonical slug per team name, with the aliases each source actually prints.
 * Keys are normalized names (lower case, decorations and state qualifiers stripped).
 */
const ALIASES = new Map(
  Object.entries({
    // ---- watched ----
    liu: 'liu',
    'long island university': 'liu',
    'long island': 'liu',
    'liu brooklyn': 'liu',
    'liu sharks': 'liu',
    harvard: 'harvard',
    'harvard university': 'harvard',
    princeton: 'princeton',
    'princeton university': 'princeton',
    mit: 'mit',
    'massachusetts institute of technology': 'mit',
    brown: 'brown',
    'brown university': 'brown',
    iona: 'iona',
    'iona college': 'iona',
    'iona university': 'iona',
    wagner: 'wagner',
    'wagner college': 'wagner',
    fordham: 'fordham',
    'fordham university': 'fordham',
    bucknell: 'bucknell',
    'bucknell university': 'bucknell',
    'air force': 'air-force',
    'air force academy': 'air-force',
    'united states air force academy': 'air-force',
    navy: 'navy',
    'naval academy': 'navy',
    'united states naval academy': 'navy',
    // Mount St. Mary's (Maryland) — a watched team. Never merge with Saint Mary's College of California.
    "mount st. mary's": 'mount-st-marys',
    "mount st mary's": 'mount-st-marys',
    "mt. st. mary's": 'mount-st-marys',
    "mt st mary's": 'mount-st-marys',
    "mount saint mary's": 'mount-st-marys',
    "mount st. mary's university": 'mount-st-marys',
    'george washington': 'george-washington',
    'george washington university': 'george-washington',
    gw: 'george-washington',

    // ---- opponents that print under more than one name ----
    // Saint Mary's College of California — a DIFFERENT school from Mount St. Mary's.
    "saint mary's college of california": 'saint-marys-ca',
    "saint mary's college": 'saint-marys-ca',
    "saint mary's": 'saint-marys-ca',
    "st. mary's college of california": 'saint-marys-ca',
    "st. mary's": 'saint-marys-ca',
    'california baptist': 'california-baptist',
    cbu: 'california-baptist',
    'uc davis': 'uc-davis',
    'california davis': 'uc-davis',
    'uc irvine': 'uc-irvine',
    'california irvine': 'uc-irvine',
    'uc santa barbara': 'uc-santa-barbara',
    'california santa barbara': 'uc-santa-barbara',
    ucsb: 'uc-santa-barbara',
    'uc san diego': 'uc-san-diego',
    'california san diego': 'uc-san-diego',
    'uc merced': 'uc-merced',
    'california merced': 'uc-merced',
    'cal state fullerton': 'cal-state-fullerton',
    'csu fullerton': 'cal-state-fullerton',
    fullerton: 'cal-state-fullerton',
    'cal state northridge': 'cal-state-northridge',
    'csu northridge': 'cal-state-northridge',
    'california lutheran': 'california-lutheran',
    'cal lutheran': 'california-lutheran',
    'cal baptist': 'california-baptist',
    'california baptist university': 'california-baptist',
    'loyola marymount': 'loyola-marymount',
    lmu: 'loyola-marymount',
    'san jose state': 'san-jose-state',
    'san jose st.': 'san-jose-state',
    'santa clara': 'santa-clara',
    pacific: 'pacific',
    'university of the pacific': 'pacific',
    pepperdine: 'pepperdine',
    stanford: 'stanford',
    california: 'california',
    'cal berkeley': 'california',
    usc: 'usc',
    'southern california': 'usc',
    ucla: 'ucla',
    'california los angeles': 'ucla',
    'long beach state': 'long-beach-state',
    'csu long beach': 'long-beach-state',
    'fresno pacific': 'fresno-pacific',
    biola: 'biola',
    chapman: 'chapman',
    redlands: 'redlands',
    'la verne': 'la-verne',
    whittier: 'whittier',
    occidental: 'occidental',
    'claremont-mudd-scripps': 'claremont-mudd-scripps',
    cms: 'claremont-mudd-scripps',
    gannon: 'gannon',
    mercyhurst: 'mercyhurst',
    salem: 'salem',
    'salem university': 'salem',
    'connecticut college': 'connecticut-college',
    'conn college': 'connecticut-college',
    'johns hopkins': 'johns-hopkins',
    'penn state behrend': 'penn-state-behrend',
    'washington & jefferson': 'washington-jefferson',
    'mckendree': 'mckendree',
    'austin college': 'austin-college',
    austin: 'austin-college',
    'austin roos': 'austin-college',
    cal: 'california',
    'california state university fullerton': 'cal-state-fullerton',
    'california state university, fullerton': 'cal-state-fullerton',
    'california state university at fullerton': 'cal-state-fullerton',
    'concordia irvine': 'concordia-irvine',
    'concordia university irvine': 'concordia-irvine',
    cui: 'concordia-irvine',
    pomona: 'pomona-pitzer',
    'pomona pitzer': 'pomona-pitzer',
    'university of redlands': 'redlands',
    'washington and jefferson': 'washington-jefferson',
    'wheaton college': 'wheaton',
    'saddleback college': 'saddleback',
    'austin roos': 'austin-college',
    'monmouth': 'monmouth',
    'saint francis': 'saint-francis-pa',
    'saint francis (pa.)': 'saint-francis-pa',

    // ---- the CWPA's own spellings ----
    // collegiatewaterpolo.org writes formal names where schedules write short ones, and its
    // conference schedule tables carry long-standing typos. Both are mapped rather than corrected
    // in place, so a name we have not seen before still fails loudly instead of being guessed at.
    'uc los angeles': 'ucla',
    'university of california': 'california',
    'university of california-los angeles': 'ucla',
    'university of southern california': 'usc',
    'university of california-san diego': 'uc-san-diego',
    'university of california-santa barbara': 'uc-santa-barbara',
    'university of california-irvine': 'uc-irvine',
    'university of california-davis': 'uc-davis',
    'university of california-berkeley': 'california',
    'california baptist univeristy': 'california-baptist',
    'mercyhurst university': 'mercyhurst',
    'gannon university': 'gannon',
    'johns hopkins university': 'johns-hopkins',
    'salem international university': 'salem',
    'penn state behrend college': 'penn-state-behrend',
    'washington and jefferson college': 'washington-jefferson',
    'washington & jefferson college': 'washington-jefferson',
    'connecticut college (conn. college)': 'connecticut-college',
    // Misspellings printed verbatim by the CWPA conference schedules (verified 2026-09-23).
    'bucknell universtiy': 'bucknell',
    'iona universtiy': 'iona',
    'forhdham universtiy': 'fordham',
    'fordham universtiy': 'fordham',
    'harvard universtiy': 'harvard',
    'princeton universtiy': 'princeton',
    'wagner colllege': 'wagner',
    'navel academy': 'navy',
    'u.s. naval academy': 'navy',
    'us naval academy': 'navy',
    'u.s. air force academy': 'air-force',
    'us air force academy': 'air-force',
  }),
);

/** Strip rankings, division tags and trailing state qualifiers; collapse whitespace. */
export function normalizeTeamName(raw) {
  let s = String(raw ?? '')
    .replace(/ /g, ' ')
    .replace(/[‘’ʼ]/g, "'")
    // "San José State" and "San Jose State" are one school. Folding the accents keeps them one
    // identity instead of two rows that can never be reconciled.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of DECORATIONS) {
      const next = s.replace(re, '');
      if (next !== s) {
        s = next.trim();
        changed = true;
      }
    }
  }
  s = s.replace(STATE_QUALIFIER, '').trim();
  return s;
}

/** True when a row's "opponent" is page furniture rather than a team. */
export function isNonTeam(name) {
  const n = normalizeTeamName(name);
  return n.length === 0 || NON_TEAM_PATTERNS.some((re) => re.test(n));
}

/**
 * Preferred short name per slug, for teams whose pages print something long or inconsistent.
 * Keeps the results row readable without inventing a name the school does not use.
 */
const TEAM_NAMES = {
  // The CWPA prints formal names ("University of California-Los Angeles") where the schools' own
  // schedules print short ones. The short form is what fits a phone row and what Paolo would say.
  ucla: 'UCLA',
  usc: 'USC',
  stanford: 'Stanford',
  california: 'California',
  'uc-davis': 'UC Davis',
  'uc-irvine': 'UC Irvine',
  'uc-san-diego': 'UC San Diego',
  pacific: 'Pacific',
  pepperdine: 'Pepperdine',
  'santa-clara': 'Santa Clara',
  'california-baptist': 'Cal Baptist',
  'uc-santa-barbara': 'UC Santa Barbara',
  'saint-marys-ca': "Saint Mary's (Cal.)",
  'connecticut-college': 'Conn. College',
  'cal-state-fullerton': 'CS Fullerton',
  'california-lutheran': 'Cal Lutheran',
  'loyola-marymount': 'LMU',
  mercyhurst: 'Mercyhurst',
  'fresno-pacific': 'Fresno Pacific',
  'long-beach-state': 'Long Beach St.',
  'san-jose-state': 'San Jose St.',
  'saint-francis-pa': 'Saint Francis',
};

/**
 * Progressively simpler spellings of one name, most faithful first.
 * Only used to look up the alias table — a form that matches nothing is discarded, so two
 * genuinely different schools can never be merged by a stripped word.
 */
function* aliasForms(clean) {
  const base = clean.toLowerCase().replace(/\.$/, '');
  yield base;
  // "University of California - Santa Barbara" / "University of California, Davis" -> "uc santa barbara"
  const uc = base.replace(/^university of california\s*[-,]?\s*/, 'uc ').trim();
  if (uc !== base) yield uc;
  // A trailing institutional word, but only where the shorter form is itself a known team.
  const trimmed = base.replace(/\s+(university|college|academy)$/, '');
  if (trimmed !== base) yield trimmed;
  const noThe = base.replace(/^the\s+/, '');
  if (noThe !== base) yield noThe;
}

/**
 * Canonical slug for a team name. Falls back to a slugified form of the full name so an unknown
 * opponent still gets a stable identity instead of being dropped or wrongly merged.
 */
export function teamSlug(raw) {
  const clean = normalizeTeamName(raw);
  for (const form of aliasForms(clean)) {
    const hit = ALIASES.get(form);
    if (hit) return hit;
  }
  // Guard the one pair Paolo called out: anything starting Mount/Mt. is the Maryland school,
  // anything else named Saint/St. Mary's is the California school.
  if (/^m(?:oun)?t\.?\s+(?:st\.?|saint)\s+mary/i.test(clean)) return 'mount-st-marys';
  if (/^(?:st\.?|saint)\s+mary/i.test(clean)) return 'saint-marys-ca';
  return clean
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Display name for a slug: the watchlist's short name, then a preferred short name, else the page's. */
export function displayName(slug, fallback) {
  const s = SCHOOLS.find((x) => x.id === slug);
  if (s) return s.display;
  return TEAM_NAMES[slug] ?? normalizeTeamName(fallback);
}

/**
 * Conflicts settled against an official box score or recap.
 *
 * Two schools' schedule pages sometimes disagree about a score. The feed never averages them and
 * never shows two rows; by default it withholds the disputed numbers. An entry here overrides that
 * for one specific game, and only with a link to the official page that settles it, so the claim is
 * checkable rather than a judgement call.
 *
 * Keyed by `<date>|<slug>|<slug>` with the two slugs sorted.
 */
export const RESOLUTIONS = new Map([
  [
    '2026-09-04|george-washington|princeton',
    {
      scores: { princeton: 23, 'george-washington': 12 },
      evidence:
        'https://goprincetontigers.com/news/2026/9/4/mens-water-polo-mens-water-polo-open-season-with-win-over-george-washington',
      note: "Princeton's official recap states \"Princeton 23, George Washington 12\". GW's schedule page lists its own score as 11.",
    },
  ],
]);

/** Look up a settled conflict for a game. */
export function resolutionFor(date, slugA, slugB) {
  return RESOLUTIONS.get(`${date}|${[slugA, slugB].sort().join('|')}`) ?? null;
}

/**
 * Official 2026 conference membership, taken from the CWPA's own conference schedule pages
 * (not from a poll, and never inferred from who plays whom):
 *   https://collegiatewaterpolo.org/2026-mid-atlantic-water-polo-conference-schedule/
 *   https://collegiatewaterpolo.org/2026-northeast-water-polo-conference-schedule/
 *
 * Air Force is on the watchlist but is in neither conference. Mercyhurst is in the MAWPC but is
 * not on the watchlist — it still gets a standings row, because a table missing a member would be
 * wrong. Membership decides who appears in a standings table; it never decides whether a game
 * counts as a conference game. Only a fixture listed on the CWPA schedule does that.
 */
export const CONFERENCES = {
  MAWPC: {
    id: 'MAWPC',
    name: 'Mid-Atlantic Water Polo Conference',
    short: 'MAWPC',
    scheduleUrl: 'https://collegiatewaterpolo.org/2026-mid-atlantic-water-polo-conference-schedule/',
    members: ['fordham', 'navy', 'george-washington', 'bucknell', 'mount-st-marys', 'mercyhurst', 'wagner'],
  },
  NWPC: {
    id: 'NWPC',
    name: 'Northeast Water Polo Conference',
    short: 'NWPC',
    scheduleUrl: 'https://collegiatewaterpolo.org/2026-northeast-water-polo-conference-schedule/',
    members: ['princeton', 'brown', 'harvard', 'liu', 'iona', 'mit'],
  },
};

export const CONFERENCE_IDS = Object.keys(CONFERENCES);

/** The conference a team belongs to, or null. Membership only — never a game's classification. */
export function conferenceOf(slug) {
  for (const c of Object.values(CONFERENCES)) if (c.members.includes(slug)) return c.id;
  return null;
}

/** Where the CWPA publishes the men's varsity polls. */
export const POLL_INDEX_URL = 'https://collegiatewaterpolo.org/varsity/polls/men/';

/** Sidearm's sport slug for a school, defaulting to the one 12 of the 13 watched schools use. */
export function sportSlugFor(slug) {
  return SCHOOLS.find((s) => s.id === slug)?.sportSlug ?? 'mens-water-polo';
}

/**
 * Sidearm path helpers. Both are *candidates*: the build verifies every URL it fetches, and a
 * school that does not follow this layout is reported as unreachable rather than linked blindly.
 */
export function schedulePath(sportSlug = 'mens-water-polo', season = SEASON) {
  return `/sports/${sportSlug}/schedule/${season}`;
}

export function rosterPath(sportSlug = 'mens-water-polo', season = SEASON) {
  return `/sports/${sportSlug}/roster/${season}`;
}

/** The watched school record for a slug, if it is one. */
export function schoolFor(slug) {
  return SCHOOLS.find((s) => s.id === slug) ?? null;
}

/**
 * Athletics domains verified by hand, for teams whose site cannot be discovered from the schedules.
 *
 * Schools link each other by hand and get it wrong: one watched school links "UC Santa Barbara" to
 * gostanford.com and another links "UC San Diego" to usdtoreros.com (the University of San Diego).
 * These entries are tried FIRST, ahead of whatever the pages link. Nothing here is trusted on its
 * own — a page fetched from one of these domains still has to pass the season and sport gates and
 * still has to list a game this team is already known to have played.
 *
 * Each was confirmed to return HTTP 200 for the men's water polo schedule on 2026-09-23.
 */
export const ATHLETICS_SITES = {
  'uc-santa-barbara': 'https://ucsbgauchos.com',
  'uc-san-diego': 'https://ucsdtritons.com',
  pepperdine: 'https://pepperdinewaves.com',
  'connecticut-college': 'https://camelathletics.com',
};
