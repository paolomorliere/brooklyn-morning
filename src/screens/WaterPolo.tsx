import { useEffect, useMemo, useState } from 'preact/hooks';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Info, Loader2, RefreshCw, Trophy, X } from 'lucide-preact';
import type { PoloFeed, PoloGame, PoloTeam } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Sheet } from '@/ui/Sheet';
import { navigate } from '@/ui/router';
import { onResume } from '@/state/store';
import { waterPoloActions, waterPoloRefresh, waterPoloStore, type RefreshState } from '@/state/waterpolo';
import {
  CONFERENCE_ORDER,
  awaitingResult,
  datesWithResults,
  fixtureTime,
  fixturesBetween,
  groupUpcoming,
  isFinal,
  weekendOf,
  formatClock,
  formatDateChip,
  formatDayHeading,
  freshnessOf,
  groupByDate,
  initials,
  stepDate,
  winnerOf,
} from '@/lib/polo';
import { Standings } from '@/ui/Standings';

const base = () => import.meta.env.BASE_URL;

export type ConferenceFilter = 'all' | 'MAWPC' | 'NWPC';

interface Placement {
  team: string | null;
  conference: ConferenceFilter;
  day: string | null;
  scrollY: number;
}

const PLACE_KEY = 'waterpolo:place';

/**
 * Remember where Paolo was before a team screen opened, so Back lands on the same filters and the
 * same scroll position rather than at the top of an unfiltered list. sessionStorage, because this
 * is about one visit to the app and should not outlive it.
 */
function savePlacement(p: Placement) {
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify(p));
  } catch {
    /* private browsing, or storage disabled — the screen still works, it just does not restore */
  }
}

function readPlacement(): Placement | null {
  try {
    const raw = sessionStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Placement>;
    return {
      team: typeof p.team === 'string' ? p.team : null,
      conference: p.conference === 'MAWPC' || p.conference === 'NWPC' ? p.conference : 'all',
      day: typeof p.day === 'string' ? p.day : null,
      scrollY: typeof p.scrollY === 'number' ? p.scrollY : 0,
    };
  } catch {
    return null;
  }
}

export function WaterPolo() {
  const { feed, ready, refreshing, lastError, refresh } = waterPoloStore.use();
  const restored = useMemo(readPlacement, []);
  const [day, setDay] = useState<string | null>(restored?.day ?? null);
  const [team, setTeam] = useState<string | null>(restored?.team ?? null);
  const [conference, setConference] = useState<ConferenceFilter>(restored?.conference ?? 'all');
  const [open, setOpen] = useState<PoloGame | null>(null);

  useEffect(() => onResume(() => void waterPoloActions.refresh(false), 60 * 60_000), []);
  // Coming back to the app must show the real state of a refresh that was running when it was left.
  useEffect(() => { void waterPoloRefresh.resume(); }, []);

  // Restore the scroll position once the rows that make the page that tall have rendered.
  useEffect(() => {
    if (!restored?.scrollY || !ready || !feed) return;
    const id = requestAnimationFrame(() => scrollTo({ top: restored.scrollY }));
    return () => cancelAnimationFrame(id);
  }, [ready, feed]);

  const allGames = feed?.games ?? [];
  const teams = feed?.teams ?? {};

  // Only games involving a watched team belong on this screen. The feed also carries each
  // opponent's own season so a team screen can show it, and those extra games are not results
  // Paolo asked to follow.
  const mine = useMemo(
    () => allGames.filter((g) => teams[g.home.team]?.watched || teams[g.away.team]?.watched),
    [allGames, teams],
  );

  // Results and fixtures are the same events in two states, so they are filtered the same way and
  // only ever separated at the point of display.
  const weekend = useMemo(() => weekendOf(), []);
  const upcoming = useMemo(() => {
    let list = mine;
    if (conference !== 'all') list = list.filter((g) => g.conference === conference);
    if (team) list = list.filter((g) => g.home.team === team || g.away.team === team);
    return groupUpcoming(fixturesBetween(list, weekend.from, weekend.to));
  }, [mine, conference, team, weekend]);

  const shown = useMemo(() => {
    let list = mine.filter(isFinal);
    if (conference !== 'all') list = list.filter((g) => g.conference === conference);
    if (team) list = list.filter((g) => g.home.team === team || g.away.team === team);
    if (day) list = list.filter((g) => g.date === day);
    return list;
  }, [mine, conference, team, day]);

  // The date strip offers the dates that exist under the other two filters, so it can never offer
  // a day that would come back empty.
  const dates = useMemo(() => {
    let list = mine.filter(isFinal);
    if (conference !== 'all') list = list.filter((g) => g.conference === conference);
    if (team) list = list.filter((g) => g.home.team === team || g.away.team === team);
    return datesWithResults(list);
  }, [mine, conference, team]);

  const days = useMemo(() => groupByDate(shown), [shown]);
  const fresh = useMemo(() => freshnessOf(feed?.sources ?? []), [feed]);
  const watched = useMemo(
    () => Object.entries(teams).filter(([, t]) => t.watched).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [teams],
  );

  const filtered = team !== null || conference !== 'all' || day !== null;
  const place = () => savePlacement({ team, conference, day, scrollY: scrollY });
  const goTeam = (slug: string) => {
    place();
    navigate('team', slug);
  };

  return (
    <main class="screen">
      <ScreenHeader
        title="Water Polo"
        sub={feed ? `${feed.sport} · ${feed.season}` : ' '}
        right={
          <button
            class="icon-btn"
            aria-label="Check for new results"
            disabled={refreshing}
            onClick={() => void waterPoloActions.refresh(true)}
          >
            <RefreshCw size={20} strokeWidth={1.9} class={refreshing ? 'spin' : undefined} />
          </button>
        }
      />

      <FreshnessLine fresh={fresh} ready={ready} refreshing={refreshing} />
      {lastError && <p class="small muted" style="margin-top:6px">{lastError}</p>}

      <RefreshPanel refresh={refresh} />

      {watched.length > 0 && (
        <Filters
          teams={teams}
          watched={watched}
          team={team}
          conference={conference}
          onTeam={(slug) => {
            // Picking a team shows its whole season, so a day filter would immediately contradict it.
            setTeam(slug);
            setDay(null);
          }}
          onConference={(c) => {
            setConference(c);
            setDay(null);
          }}
        />
      )}

      {dates.length > 0 && <DateStrip dates={dates} day={day} onPick={setDay} />}

      {filtered && (
        <div class="polo-active">
          <span class="small muted">
            {shown.length} {shown.length === 1 ? 'result' : 'results'}
            {conference !== 'all' && ` · ${conference}`}
            {team && ` · ${teams[team]?.name ?? team}`}
            {day && ` · ${formatDateChip(day)}`}
          </span>
          <button
            class="chip polo-reset"
            onClick={() => {
              setTeam(null);
              setConference('all');
              setDay(null);
            }}
          >
            <X size={13} strokeWidth={2.4} aria-hidden="true" /> Reset
          </button>
        </div>
      )}

      {conference !== 'all' && feed && (
        <Standings feed={feed} conference={conference} onTeam={goTeam} />
      )}

      {ready && feed && (
        <section class="polo-weekend" aria-labelledby="polo-weekend-h">
          <div class="section-title">
            <h2 id="polo-weekend-h">This weekend</h2>
            <span class="count">{upcoming.reduce((n, d) => n + d.games.length, 0)}</span>
          </div>
          <p class="small faint polo-weekend-range">{weekend.label} · times in New York where the source states a zone</p>
          {upcoming.length === 0 ? (
            <p class="small muted polo-weekend-empty">
              No fixture for {team ? `${teams[team]?.name ?? team} ` : ''}
              {conference !== 'all' ? `in ${conference} ` : ''}this Friday to Sunday.
            </p>
          ) : (
            upcoming.map((d) => (
              <div key={d.date}>
                <h3 class="polo-weekend-day">{formatDayHeading(d.date)}</h3>
                <ul class="polo-list">
                  {d.games.map((g) => (
                    <FixtureRow key={g.id} game={g} teams={teams} onOpen={() => setOpen(g)} onTeam={goTeam} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {ready && allGames.length === 0 && !refreshing && (
        <div class="empty">
          <h3>No results yet</h3>
          <p>
            {lastError
              ? 'Connect to the internet once to download the results.'
              : 'Completed games will appear here once the sources have been read.'}
          </p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => void waterPoloActions.refresh(true)}>
            Try again
          </button>
        </div>
      )}

      {ready && allGames.length > 0 && days.length === 0 && (
        <div class="empty">
          <h3>No results match</h3>
          <p>
            {conference !== 'all' && team
              ? `${teams[team]?.name ?? team} has no ${conference} result yet.`
              : conference !== 'all'
                ? `No ${conference} conference game has been played yet.`
                : day
                  ? formatDayHeading(day)
                  : 'Nothing under these filters.'}
          </p>
          <button
            class="btn btn--ghost"
            style="margin-top:16px"
            onClick={() => {
              setTeam(null);
              setConference('all');
              setDay(null);
            }}
          >
            Show all results
          </button>
        </div>
      )}

      {days.map((d) => (
        <section key={d.date} aria-labelledby={`d-${d.date}`}>
          <div class="section-title">
            <h2 id={`d-${d.date}`}>{formatDayHeading(d.date)}</h2>
            <span class="count">{d.games.length}</span>
          </div>
          <ul class="polo-list">
            {d.games.map((g) => (
              <GameRow key={g.id} game={g} teams={teams} onOpen={() => setOpen(g)} onTeam={goTeam} />
            ))}
          </ul>
        </section>
      ))}

      {open && <GameSheet game={open} teams={teams} feed={feed} onClose={() => setOpen(null)} />}
    </main>
  );
}

/**
 * The manual refresh, start to finish.
 *
 * Every state here is something the app actually knows. "Complete" is only ever shown once the new
 * file has been downloaded, validated, saved and put on screen — a run that merely started, or a
 * job that reported success without committing anything, is not success. The run's own queued /
 * running / failed status comes from GitHub's public API; the published file decides the rest.
 */
function RefreshPanel({ refresh }: { refresh: RefreshState }) {
  const busy = refresh.phase === 'queued' || refresh.phase === 'running';

  return (
    <div class="polo-refresh">
      <div class="polo-actions">
        <button
          class="btn btn--primary polo-check-btn"
          disabled={busy}
          onClick={() => void waterPoloRefresh.checkNow()}
          aria-label="Refresh scores and fixtures from the official schedules"
        >
          <RefreshCw size={17} strokeWidth={2} class={busy ? 'spin' : undefined} aria-hidden="true" />
          {busy ? 'Refreshing…' : 'Refresh scores & fixtures'}
        </button>
        <button class="btn btn--ghost polo-poll-btn" onClick={() => navigate('poll')}>
          <Trophy size={17} strokeWidth={1.9} aria-hidden="true" />
          Top 20
        </button>
      </div>

      {/*
        One sentence about Paolo's own last refresh, which is a different fact from the freshness
        line above it. Two timestamps labelled "checked" and "last successful refresh" sitting a
        centimetre apart, one of which could advance without anything being read, was the confusing
        part; each line now names what its time is the time of.
      */}
      <p class="small faint polo-last">{lastRefreshLine(refresh)}</p>

      {refresh.phase !== 'idle' && !refresh.dismissed && <RefreshBanner refresh={refresh} />}
    </div>
  );
}

function RefreshBanner({ refresh }: { refresh: RefreshState }) {
  const tone =
    refresh.phase === 'success' || refresh.phase === 'unchanged'
      ? 'ok'
      : refresh.phase === 'failed'
        ? 'bad'
        : refresh.phase === 'partial' || refresh.phase === 'timeout' || refresh.phase === 'nothing'
          ? 'warn'
          : 'busy';

  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'bad' ? AlertTriangle : tone === 'warn' ? Info : Loader2;

  const body = () => {
    switch (refresh.phase) {
      case 'queued': {
        // GitHub not having seen a run after a minute almost always means the green confirm button
        // was never tapped. Saying so beats a spinner that never resolves.
        const waited = refresh.startedAt ? Date.now() - Date.parse(refresh.startedAt) : 0;
        if (!refresh.sawRun && waited > 60_000) {
          return (
            <>
              <b>No run has started yet</b>
              <p class="small" style="margin:4px 0 0">
                GitHub has not received a run. On the page that opened, tap <b>Run workflow</b> to open the little
                panel, then tap the green <b>Run workflow</b> button inside it. Both taps are needed.
              </p>
            </>
          );
        }
        return (
          <>
            <b>Waiting for the run to start</b>
            <p class="small" style="margin:4px 0 0">
              On the GitHub page that just opened, tap <b>Run workflow</b>, then the green <b>Run workflow</b> button in
              the panel that appears. This screen checks every 30 seconds for up to 12 minutes, and you can keep using
              the app meanwhile.
            </p>
          </>
        );
      }
      case 'running':
        return (
          <>
            <b>Checking official schedules…</b>
            <p class="small" style="margin:4px 0 0">
              Reading all 13 schools, every opponent&rsquo;s season and both conference schedules. This usually takes a
              minute or two.
            </p>
          </>
        );
      case 'success':
        return (
          <>
            <b>Refresh complete &mdash; new results or schedule changes found</b>
            <p class="small" style="margin:4px 0 0">
              {refresh.added > 0 && `${refresh.added} new ${refresh.added === 1 ? 'result' : 'results'}`}
              {refresh.added > 0 && refresh.fixturesChanged > 0 && ' · '}
              {refresh.fixturesChanged > 0 &&
                `${refresh.fixturesChanged} ${refresh.fixturesChanged === 1 ? 'fixture' : 'fixtures'} added or moved`}
              {` · all ${refresh.total} schools read · ${formatNyStamp(refresh.endedAt)}`}
            </p>
          </>
        );
      case 'unchanged':
        return (
          <>
            <b>Refresh complete &mdash; no changes found</b>
            <p class="small" style="margin:4px 0 0">
              All {refresh.total} schools were read again just now and none of them had posted anything new.{' '}
              {formatNyStamp(refresh.endedAt)}
            </p>
          </>
        );
      case 'partial':
        return (
          <>
            <b>Refresh complete &mdash; some sources could not be read</b>
            <p class="small" style="margin:4px 0 0">
              {refresh.okCount} of {refresh.total} schools were read.{' '}
              {refresh.failed.length > 0 && `Couldn't reach ${refresh.failed.join(', ')}. `}
              {refresh.added + refresh.fixturesChanged > 0
                ? `${refresh.added} new ${refresh.added === 1 ? 'result' : 'results'}, ${refresh.fixturesChanged} fixture change${refresh.fixturesChanged === 1 ? '' : 's'}.`
                : 'Nothing changed in what was read.'}{' '}
              {formatNyStamp(refresh.endedAt)}
            </p>
          </>
        );
      case 'nothing':
        return (
          <>
            <b>The run finished without reading anything</b>
            <p class="small" style="margin:4px 0 0">
              It published no new file, so the schools were not re-read and nothing above has changed. Your saved
              results and fixtures are untouched. Tap <b>Retry</b> — and if it happens again, open the run on GitHub and
              look at whether the <i>Collect results</i> step was skipped. {formatNyStamp(refresh.endedAt)}
            </p>
          </>
        );
      case 'failed':
        return (
          <>
            <b>Refresh failed</b>
            <p class="small" style="margin:4px 0 0">
              {refresh.error ?? 'The run did not finish.'} Your saved results and fixtures are unchanged.
            </p>
          </>
        );
      case 'timeout':
        return (
          <>
            <b>Still waiting after 12 minutes</b>
            <p class="small" style="margin:4px 0 0">
              The run may still be going — GitHub often starts a job later than it is asked to. Nothing has been lost;
              new results will appear on the next check.
            </p>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div class={`notice polo-watch polo-watch--${tone}`} role="status" aria-live="polite">
      <Icon size={18} strokeWidth={1.9} class={tone === 'busy' ? 'spin' : undefined} aria-hidden="true" />
      <div class="grow">{body()}</div>
      <div class="polo-watch-actions">
        {(refresh.phase === 'failed' || refresh.phase === 'timeout' || refresh.phase === 'nothing') && (
          <button class="btn btn--ghost polo-retry" onClick={() => void waterPoloRefresh.retry()}>Retry</button>
        )}
        {refresh.runUrl && (
          <a class="icon-btn" href={refresh.runUrl} target="_blank" rel="noopener noreferrer" aria-label="Open this run on GitHub">
            <ExternalLink size={17} />
          </a>
        )}
        <button class="icon-btn" aria-label="Dismiss" onClick={() => void waterPoloRefresh.dismiss()}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

/**
 * The line under the button: what Paolo's own last refresh did, in one sentence.
 *
 * It deliberately never says "successful" about an attempt that published nothing, and it keeps the
 * last genuine read visible once the banner has been dismissed.
 */
function lastRefreshLine(refresh: RefreshState): string {
  if (refresh.phase === 'queued' || refresh.phase === 'running') {
    return `Your refresh started ${formatNyStamp(refresh.startedAt)} — still going`;
  }
  const at = refresh.endedAt ? formatNyStamp(refresh.endedAt) : null;
  if (at) {
    const outcome =
      refresh.phase === 'success'
        ? 'new results or changes saved'
        : refresh.phase === 'unchanged'
          ? 'everything read, nothing new'
          : refresh.phase === 'partial'
            ? `${refresh.okCount} of ${refresh.total} schools read`
            : refresh.phase === 'nothing'
              ? 'nothing was published'
              : refresh.phase === 'failed'
                ? 'it failed'
                : 'still unknown';
    return `Your last refresh ${at} — ${outcome}`;
  }
  // Deliberately no timestamp here. The line above the button already says when the schools were
  // last read, and a second time under a different name is what made this panel confusing.
  return 'You have not run a manual refresh yet';
}

/** "12:41 PM ET · Sun 27 Sep" — a completion time stated in New York, where the season lives. */
function formatNyStamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  return `${time} ET · ${day}`;
}

function Filters({
  teams,
  watched,
  team,
  conference,
  onTeam,
  onConference,
}: {
  teams: Record<string, PoloTeam>;
  watched: [string, PoloTeam][];
  team: string | null;
  conference: ConferenceFilter;
  onTeam: (slug: string | null) => void;
  onConference: (c: ConferenceFilter) => void;
}) {
  return (
    <div class="polo-filters">
      <div class="chip-row polo-chip-row" role="group" aria-label="Conference">
        <button class="chip" aria-pressed={conference === 'all'} onClick={() => onConference('all')}>
          All games
        </button>
        {CONFERENCE_ORDER.map((c) => (
          <button key={c} class="chip" aria-pressed={conference === c} onClick={() => onConference(c)}>
            {c}
          </button>
        ))}
      </div>
      <div class="chip-row polo-chip-row" role="group" aria-label="Team">
        <button class="chip" aria-pressed={team === null} onClick={() => onTeam(null)}>
          All teams
        </button>
        {watched.map(([slug, t]) => (
          <button key={slug} class="chip" aria-pressed={team === slug} onClick={() => onTeam(team === slug ? null : slug)}>
            {teams[slug]?.name ?? t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function FreshnessLine({ fresh, ready, refreshing }: { fresh: ReturnType<typeof freshnessOf>; ready: boolean; refreshing: boolean }) {
  if (refreshing) return <p class="small faint polo-fresh">Checking…</p>;
  if (!ready || fresh.total === 0) return <p class="small faint polo-fresh">&nbsp;</p>;
  // "Checked" was ambiguous: this is when the schools' own pages were last read by the workflow,
  // which is a different thing from when Paolo last tapped refresh.
  const when = fresh.checkedAt ? `Scores read from the schools ${formatClock(fresh.checkedAt)}` : 'Not read yet';
  if (fresh.complete) {
    return <p class="small faint polo-fresh">{when} · all {fresh.total} schools</p>;
  }
  return (
    <p class="small polo-fresh polo-partial">
      <Info size={14} strokeWidth={2} aria-hidden="true" />
      <span>
        {when} · {fresh.okCount} of {fresh.total} schools. Couldn&rsquo;t reach {fresh.failed.join(', ')} — their
        results may be missing.
      </span>
    </p>
  );
}

function DateStrip({ dates, day, onPick }: { dates: string[]; day: string | null; onPick: (d: string | null) => void }) {
  const older = day ? stepDate(dates, day, -1) : null;
  const newer = day ? stepDate(dates, day, 1) : null;
  return (
    <div class="polo-dates">
      <div class="polo-dates-nav">
        <button
          class="icon-btn"
          aria-label="Previous day with results"
          disabled={!day || !older}
          onClick={() => older && onPick(older)}
        >
          <ChevronLeft size={20} />
        </button>
        <div class="chip-row polo-dates-chips">
          <button class="chip" aria-pressed={day === null} onClick={() => onPick(null)}>
            All results
          </button>
          {dates.map((d) => (
            <button key={d} class="chip" aria-pressed={day === d} onClick={() => onPick(day === d ? null : d)}>
              {formatDateChip(d)}
            </button>
          ))}
        </div>
        <button
          class="icon-btn"
          aria-label="Next day with results"
          disabled={!day || !newer}
          onClick={() => newer && onPick(newer)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

/** A logo, or the team's initials when there is no file or the image fails to load. */
export function TeamCrest({ team, name, size }: { team: PoloTeam | undefined; name: string; size?: 'sm' }) {
  const [failed, setFailed] = useState(false);
  const cls = size === 'sm' ? 'polo-crest polo-crest--sm' : 'polo-crest';
  if (!team?.logo || failed) {
    return (
      <span class={`${cls} polo-crest--initials`} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  return (
    <span class={cls}>
      <img src={`${base()}${team.logo}`} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

/**
 * The row holds three separate targets: each team name opens that team's season, and everything
 * else opens the game details. The details button fills the row and sits behind the names, so a
 * tap on a name can never fall through to the sheet.
 *
 * Tab order follows the row left to right: home name, details, away name.
 */
export function GameRow({
  game,
  teams,
  onOpen,
  onTeam,
}: {
  game: PoloGame;
  teams: Record<string, PoloTeam>;
  onOpen: () => void;
  onTeam: (slug: string) => void;
}) {
  const homeName = teams[game.home.team]?.name ?? game.home.team;
  const awayName = teams[game.away.team]?.name ?? game.away.team;
  const win = winnerOf(game);
  const withheld = game.home.score === null || game.away.score === null;
  const label = withheld
    ? `${homeName} against ${awayName}, result not confirmed`
    : `${homeName} ${game.home.score}, ${awayName} ${game.away.score}`;

  return (
    <li class="polo-row">
      <TeamCrest team={teams[game.home.team]} name={homeName} />
      <button
        class={`polo-name polo-team ${win === 'home' ? 'polo-team--win' : ''}`}
        onClick={() => onTeam(game.home.team)}
        aria-label={`${homeName}, 2026 season`}
      >
        {homeName}
      </button>
      <button class="polo-open" onClick={onOpen} aria-label={`${label}. Game details.`} />
      <span class="polo-score">
        {withheld ? (
          <span class="polo-unconfirmed">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> —
          </span>
        ) : (
          <>
            <b class={win === 'home' ? 'polo-team--win' : ''}>{game.home.score}</b>
            <i aria-hidden="true">–</i>
            <b class={win === 'away' ? 'polo-team--win' : ''}>{game.away.score}</b>
          </>
        )}
        {game.ot && <em class="polo-ot">{game.ot}</em>}
      </span>
      <button
        class={`polo-name polo-name--right polo-team polo-team--right ${win === 'away' ? 'polo-team--win' : ''}`}
        onClick={() => onTeam(game.away.team)}
        aria-label={`${awayName}, 2026 season`}
      >
        {awayName}
      </button>
      <TeamCrest team={teams[game.away.team]} name={awayName} />
    </li>
  );
}

export function GameSheet({
  game,
  teams,
  feed,
  onClose,
}: {
  game: PoloGame;
  teams: Record<string, PoloTeam>;
  feed: PoloFeed | null;
  onClose: () => void;
}) {
  const name = (slug: string) => teams[slug]?.name ?? slug;
  const school = (id: string) =>
    feed?.sources.find((s) => s.id === id)?.display ?? teams[id]?.name ?? id;
  const scoreLine =
    game.home.score === null || game.away.score === null
      ? 'Result not confirmed'
      : `${name(game.home.team)} ${game.home.score} – ${game.away.score} ${name(game.away.team)}`;
  const conferenceName = game.conference ? feed?.conference?.members?.[game.conference]?.name : null;

  return (
    <Sheet title={formatDayHeading(game.date)} onClose={onClose}>
      <p class="polo-sheet-score">{scoreLine}</p>
      <dl class="polo-facts">
        {game.time && (
          <>
            <dt>Start</dt>
            <dd>{new Date(`${game.date}T${game.time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET</dd>
          </>
        )}
        {game.ot && (
          <>
            <dt>Finish</dt>
            <dd>{game.ot === 'OT' ? 'Overtime' : `${game.ot.replace('OT', '')} overtimes`}</dd>
          </>
        )}
        <dt>Site</dt>
        <dd>{game.neutral ? 'Neutral site' : game.hosted ? `${name(game.hosted)} hosted` : 'Not recorded'}</dd>
        {game.venue && (
          <>
            <dt>Venue</dt>
            <dd>{game.venue}</dd>
          </>
        )}
        {game.tournament && (
          <>
            <dt>Event</dt>
            <dd>{game.tournament}</dd>
          </>
        )}
        {game.conference && (
          <>
            <dt>Conference</dt>
            <dd class="polo-conf-fact">
              {conferenceName ?? game.conference} game
              {game.conferenceSource && (
                <a href={game.conferenceSource} target="_blank" rel="noopener noreferrer">
                  {' '}
                  CWPA schedule
                </a>
              )}
            </dd>
          </>
        )}
        {game.exhibition && (
          <>
            <dt>Status</dt>
            <dd>Exhibition — does not count toward either team&rsquo;s record.</dd>
          </>
        )}
      </dl>

      {game.conflict && <ConflictNote game={game} name={name} school={school} />}

      <div class="section-title" style="margin-top:20px">
        <h2>Source</h2>
      </div>
      <ul class="polo-sources">
        {game.sources.map((s) => (
          <li key={s.id}>
            <a class="row-btn" href={s.detailUrl ?? s.url} target="_blank" rel="noopener noreferrer">
              <span class="grow">
                {school(s.id)}
                <span class="small muted" style="display:block">
                  {s.detailUrl ? 'Official recap' : 'Official schedule'} · verified {formatClock(s.verifiedAt)}
                </span>
              </span>
              <ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function ConflictNote({
  game,
  name,
  school,
}: {
  game: PoloGame;
  name: (s: string) => string;
  school: (s: string) => string;
}) {
  const c = game.conflict!;
  // Print every reading in the same team order as the row, so the one number that differs is
  // obvious instead of being buried in two differently-ordered sentences.
  const reading = (scores: Record<string, number>) =>
    `${scores[game.home.team] ?? '?'} – ${scores[game.away.team] ?? '?'}`;
  return (
    <div class="notice polo-conflict">
      <AlertTriangle size={18} strokeWidth={1.9} aria-hidden="true" />
      <div>
        <b>The schools&rsquo; pages disagree.</b>
        <p class="small" style="margin:4px 0 0">
          {name(game.home.team)} &ndash; {name(game.away.team)}
        </p>
        <ul class="small polo-readings">
          {c.readings.map((r) => (
            <li key={r.source}>
              <span>{school(r.source)}&rsquo;s page</span>
              <b>{reading(r.scores)}</b>
            </li>
          ))}
        </ul>
        {c.withheld ? (
          <p class="small" style="margin:8px 0 0">
            No official box score settles it, so the score is not shown rather than guessed.
          </p>
        ) : c.resolved ? (
          <p class="small" style="margin:8px 0 0">
            {c.resolved.note}{' '}
            <a href={c.resolved.evidence} target="_blank" rel="noopener noreferrer">
              Read it
            </a>
            .
          </p>
        ) : (
          <p class="small" style="margin:8px 0 0">
            Showing the result that was verified first.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One upcoming fixture.
 *
 * Built from the same row as a result, with the same two team-name targets, so the event reads the
 * same before and after it is played. The start time is only labelled ET when a source made its
 * zone certain; otherwise it says "local", and with no published time it says "Time TBD" rather
 * than inventing one. A fixture whose start has passed says "Awaiting result" — the clock never
 * turns a fixture into a result.
 */
export function FixtureRow({
  game,
  teams,
  onOpen,
  onTeam,
}: {
  game: PoloGame;
  teams: Record<string, PoloTeam>;
  onOpen: () => void;
  onTeam: (slug: string) => void;
}) {
  const homeName = teams[game.home.team]?.name ?? game.home.team;
  const awayName = teams[game.away.team]?.name ?? game.away.team;
  const when = fixtureTime(game);
  const waiting = awaitingResult(game);
  const status = game.status === 'postponed' ? 'Postponed' : game.status === 'cancelled' ? 'Cancelled' : waiting ? 'Awaiting result' : null;

  return (
    <li class="polo-row polo-row--fixture">
      <TeamCrest team={teams[game.home.team]} name={homeName} />
      <button class="polo-name polo-team" onClick={() => onTeam(game.home.team)} aria-label={`${homeName}, 2026 season`}>
        {homeName}
      </button>
      <button class="polo-open" onClick={onOpen} aria-label={`${homeName} against ${awayName}, ${when.label}. Game details.`} />
      <span class={`polo-when polo-when--${when.kind}`}>
        <b>{when.text ?? 'TBD'}</b>
        <em>{when.kind === 'et' ? 'ET' : when.kind === 'local' ? 'local' : 'no time yet'}</em>
      </span>
      <button
        class="polo-name polo-name--right polo-team polo-team--right"
        onClick={() => onTeam(game.away.team)}
        aria-label={`${awayName}, 2026 season`}
      >
        {awayName}
      </button>
      <TeamCrest team={teams[game.away.team]} name={awayName} />
      {status && <span class="polo-status">{status}</span>}
    </li>
  );
}
