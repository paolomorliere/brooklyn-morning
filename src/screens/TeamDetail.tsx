import { useEffect, useMemo, useState } from 'preact/hooks';
import { ChevronLeft, ExternalLink, Info } from 'lucide-preact';
import type { PoloGame } from '@/types';
import { navigate, useRouteParam } from '@/ui/router';
import { onResume } from '@/state/store';
import { waterPoloActions, waterPoloStore } from '@/state/waterpolo';
import { formatDayHeading, formatRecord, groupByDate, groupUpcoming, isFinal, recordOf, scheduleFor } from '@/lib/polo';
import { FixtureRow, GameRow, GameSheet, TeamCrest } from './WaterPolo';
import { nyDate } from '@/lib/lessons';

/** Which half of a team's season is on screen. Kept per team so Back returns to the same view. */
type TeamView = 'results' | 'schedule';
const VIEW_KEY = 'team:view';

/**
 * One team's 2026 season: its record, its official pages, and every completed game it played.
 *
 * A secondary screen with a Back button rather than a tab — it is somewhere you go from a result,
 * not one of the five places the app is about.
 */
export function TeamDetail() {
  const slug = useRouteParam();
  const { feed, ready, refreshing } = waterPoloStore.use();
  const [open, setOpen] = useState<PoloGame | null>(null);
  const [view, setView] = useState<TeamView>(() => (sessionStorage.getItem(VIEW_KEY) === 'schedule' ? 'schedule' : 'results'));

  useEffect(() => onResume(() => void waterPoloActions.refresh(false), 60 * 60_000), []);
  useEffect(() => {
    try { sessionStorage.setItem(VIEW_KEY, view); } catch { /* storage disabled; the view just does not persist */ }
  }, [view]);
  useEffect(() => {
    setOpen(null);
    // A hash change does not reset the scroll position, so without this a team opened from halfway
    // down the results list starts halfway down its own season.
    scrollTo({ top: 0 });
  }, [slug]);

  const team = slug ? feed?.teams?.[slug] : undefined;
  const games = useMemo(
    () => (slug ? (feed?.games ?? []).filter((g) => g.home.team === slug || g.away.team === slug) : []),
    [feed, slug],
  );
  // The record is computed from this team's own completed games and from nothing else — no filter
  // on any other screen can change it, and a fixture never counts toward it.
  const record = useMemo(() => (slug ? recordOf(games, slug) : null), [games, slug]);
  const days = useMemo(() => groupByDate(games.filter(isFinal)), [games]);
  // Everything still to play, from today onward in New York, earliest first.
  const fixtures = useMemo(
    () => (slug ? groupUpcoming(scheduleFor(feed?.games ?? [], slug, nyDate())) : []),
    [feed, slug],
  );
  const fixtureCount = fixtures.reduce((n, d) => n + d.games.length, 0);

  const partial = team?.coverage === 'partial';
  const name = team?.name ?? slug ?? 'Team';
  const conference = team?.conference ?? null;
  const conferenceName = conference ? feed?.conference?.members?.[conference]?.name : null;

  return (
    <main class="screen">
      <header class="screen-header" style="align-items:center;padding-top:calc(var(--safe-top) + 8px)">
        <button
          class="icon-btn"
          aria-label="Back"
          onClick={() => (history.length > 1 ? history.back() : navigate('waterpolo'))}
          style="margin-left:-12px"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 style="flex:1;font-size:var(--fs-18);font-family:var(--font-ui);font-weight:600">Team</h1>
      </header>

      {!ready || (!feed && refreshing) ? (
        <p class="small faint">Loading…</p>
      ) : !team ? (
        <div class="empty">
          <h3>Not in this season&rsquo;s results</h3>
          <p>No 2026 game involving this team has been collected.</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => navigate('waterpolo')}>
            Back to results
          </button>
        </div>
      ) : (
        <>
          <div class="polo-team-head">
            <TeamCrest team={team} name={name} />
            <div class="grow">
              <h2 class="polo-team-name">{name}</h2>
              <p class="small muted polo-team-sub">
                {feed?.season ?? 2026} season
                {conference && ` · ${conference}`}
                {team.watched && ' · on your watchlist'}
              </p>
            </div>
            <div class="polo-record">
              <b>{record ? formatRecord(record) : '—'}</b>
              <span class="small faint">{record?.played ?? 0} {record?.played === 1 ? 'game' : 'games'}</span>
            </div>
          </div>

          {partial ? (
            <p class="small polo-partial">
              <Info size={14} strokeWidth={2} aria-hidden="true" />
              <span>
                From the results collected so far. This school&rsquo;s own 2026 schedule page could not be read
                {team.coverageNote ? ` (${team.coverageNote.split(' | ')[0]})` : ''}, so these are only the games other
                schools reported.
                {team.scheduleUrl && (
                  <>
                    {' '}
                    <a href={team.scheduleUrl} target="_blank" rel="noopener noreferrer">
                      Official site
                    </a>
                  </>
                )}
              </span>
            </p>
          ) : (
            <p class="small faint polo-team-note">
              Record from completed 2026 games, conference and non-conference alike. Exhibitions and games with no
              confirmed score are not counted.
            </p>
          )}

          <ul class="polo-links">
            {team.rosterUrl && (
              <li>
                <a class="row-btn" href={team.rosterUrl} target="_blank" rel="noopener noreferrer">
                  <span class="grow">
                    Roster
                    <span class="small muted" style="display:block">Official {feed?.season ?? 2026} roster</span>
                  </span>
                  <ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </li>
            )}
            {team.scheduleUrl && (
              <li>
                <a class="row-btn polo-link--quiet" href={team.scheduleUrl} target="_blank" rel="noopener noreferrer">
                  <span class="grow small">Official schedule</span>
                  <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </li>
            )}
            {conference && feed?.conference?.members?.[conference]?.scheduleUrl && (
              <li>
                <a
                  class="row-btn polo-link--quiet"
                  href={feed.conference.members[conference].scheduleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="grow small">{conferenceName ?? conference} schedule</span>
                  <ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </li>
            )}
          </ul>

          <div class="chip-row polo-chip-row polo-views" role="group" aria-label="Results or schedule">
            <button class="chip" aria-pressed={view === 'results'} onClick={() => setView('results')}>
              Results{record ? ` · ${record.played}` : ''}
            </button>
            <button class="chip" aria-pressed={view === 'schedule'} onClick={() => setView('schedule')}>
              Schedule{fixtureCount ? ` · ${fixtureCount}` : ''}
            </button>
          </div>

          {view === 'results' && days.length === 0 && (
            <div class="empty">
              <h3>No completed games yet</h3>
              <p>Results will appear here as they are played.</p>
            </div>
          )}

          {view === 'results' &&
            days.map((d) => (
              <section key={d.date} aria-labelledby={`t-${d.date}`}>
                <div class="section-title">
                  <h2 id={`t-${d.date}`}>{formatDayHeading(d.date)}</h2>
                  <span class="count">{d.games.length}</span>
                </div>
                <ul class="polo-list">
                  {d.games.map((g) => (
                    <GameRow
                      key={g.id}
                      game={g}
                      teams={feed?.teams ?? {}}
                      onOpen={() => setOpen(g)}
                      onTeam={(s) => s !== slug && navigate('team', s)}
                    />
                  ))}
                </ul>
              </section>
            ))}

          {view === 'schedule' && (
            <>
              <p class="small faint polo-team-note">
                Every remaining {feed?.season ?? 2026} game, weekdays included, earliest first. A start time is shown in
                New York only where a source states the zone; otherwise it is the venue&rsquo;s local time, and a game
                with no published time says so.
              </p>
              {fixtureCount === 0 ? (
                <div class="empty">
                  <h3>Nothing left on the schedule</h3>
                  <p>
                    {partial
                      ? 'This school’s own page could not be read, so its remaining fixtures are not known.'
                      : 'No further 2026 game is listed for this team.'}
                  </p>
                </div>
              ) : (
                fixtures.map((d) => (
                  <section key={d.date} aria-labelledby={`s-${d.date}`}>
                    <div class="section-title">
                      <h2 id={`s-${d.date}`}>{formatDayHeading(d.date)}</h2>
                      <span class="count">{d.games.length}</span>
                    </div>
                    <ul class="polo-list">
                      {d.games.map((g) => (
                        <FixtureRow
                          key={g.id}
                          game={g}
                          teams={feed?.teams ?? {}}
                          onOpen={() => setOpen(g)}
                          onTeam={(s) => s !== slug && navigate('team', s)}
                        />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </>
      )}

      {open && <GameSheet game={open} teams={feed?.teams ?? {}} feed={feed} onClose={() => setOpen(null)} />}
    </main>
  );
}
