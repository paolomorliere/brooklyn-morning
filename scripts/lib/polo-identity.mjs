// One school, one identity — decided on evidence, before any game is matched or de-duplicated.
// Pure: rows in, a canonical mapping out. No network, no clock, no filesystem.
//
// The problem this solves, from real data: Harvard's page prints its 26 September opponent as
// "Concordia" while every other school prints "Concordia Irvine", so the same game arrived under
// two team identities and appeared twice. Both rows linked the opponent to the same athletics
// site, cuigoldeneagles.com, which is what settles it.
//
// Two rules, both conservative:
//
//   1. HOST EVIDENCE. Two identities that link to the same athletics hostname are the same school —
//      an athletics domain serves exactly one school's programme. Because schools do mislink each
//      other (one page links "UC San Diego" to usdtoreros.com, the University of San Diego), the
//      host alone is not enough: the two printed names must also be compatible, meaning one is the
//      start of the other. "Concordia" and "Concordia Irvine" are; "San Diego" and "UC San Diego"
//      are not, so a mislink cannot rename a team.
//
//   2. NEVER BY RESULT. Nothing here looks at scores, dates or logos. Two teams are not merged
//      because they played the same opponent on the same day with the same score — that is exactly
//      what a genuine doubleheader looks like.
//
// Anything not settled by these rules keeps the identity its name gives it.

import { normalizeTeamName, teamSlug } from '../waterpolo.config.mjs';

/** Hostname of a site URL, without `www.`, or null. */
export function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

const words = (name) => normalizeTeamName(name).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Is one printed name the start of the other?
 *
 * Compared word by word, so "Concordia" matches "Concordia Irvine" but "San Diego" does not match
 * "UC San Diego" — the shorter name has to be a leading run of the longer one, not a fragment of it.
 */
export function namesCompatible(a, b) {
  const x = words(a).split(' ');
  const y = words(b).split(' ');
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w, i) => w === long[i]);
}

/**
 * Build the canonical mapping from every parsed row across every source.
 *
 * `rows` is a flat list of `{ opponentRaw, opponentSite }`, plus `{ selfSlug, selfSite }` for the
 * school whose page it is. Returns `{ canonical, merges }`, where `canonical` maps a slug to the
 * slug it should become and `merges` records why, for the build log.
 */
export function buildIdentity(rows) {
  // slug -> hostname -> how many rows said so
  const hosts = new Map();
  // slug -> the names printed for it, most specific first
  const names = new Map();

  const note = (slug, host, name) => {
    if (!slug) return;
    if (!names.has(slug)) names.set(slug, new Set());
    if (name) names.get(slug).add(normalizeTeamName(name));
    if (!host) return;
    if (!hosts.has(slug)) hosts.set(slug, new Map());
    const m = hosts.get(slug);
    m.set(host, (m.get(host) ?? 0) + 1);
  };

  for (const r of rows) {
    note(teamSlug(r.opponentRaw), hostOf(r.opponentSite), r.opponentRaw);
    if (r.selfSlug) note(r.selfSlug, hostOf(r.selfSite), null);
  }

  // host -> the slugs that claim it
  const byHost = new Map();
  for (const [slug, m] of hosts) {
    for (const host of m.keys()) {
      if (!byHost.has(host)) byHost.set(host, new Set());
      byHost.get(host).add(slug);
    }
  }

  const canonical = new Map();
  const merges = [];
  for (const [host, slugs] of byHost) {
    if (slugs.size < 2) continue;
    const list = [...slugs].sort();
    // Every pair has to be name-compatible before any of them merge, so a host claimed by two
    // genuinely different schools (a mislink) is left alone rather than half-merged.
    const nameOf = (s) => [...(names.get(s) ?? [s])].sort((a, b) => b.length - a.length)[0] ?? s;
    const compatible = list.every((a, i) => list.slice(i + 1).every((b) => namesCompatible(nameOf(a), nameOf(b))));
    if (!compatible) {
      merges.push({ host, slugs: list, merged: false, why: 'the names on this host are not compatible; left as separate teams' });
      continue;
    }
    // The most specific printed name wins: more words first, then longer, then alphabetical.
    const winner = [...list].sort((a, b) => {
      const wa = words(nameOf(a)).split(' ').length;
      const wb = words(nameOf(b)).split(' ').length;
      return wb - wa || nameOf(b).length - nameOf(a).length || a.localeCompare(b);
    })[0];
    for (const s of list) if (s !== winner) canonical.set(s, winner);
    if (list.length > 1) {
      merges.push({ host, slugs: list, merged: true, winner, why: `all link to ${host} and their names agree` });
    }
  }
  return { canonical, merges };
}

/** Follow the mapping to its end, so a chain of merges lands on one slug. */
export function canonicalize(slug, canonical) {
  let s = slug;
  for (let i = 0; i < 8 && canonical.has(s); i++) s = canonical.get(s);
  return s;
}
