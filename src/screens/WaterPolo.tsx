import { useEffect, useMemo, useState } from 'preact/hooks';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Info, RefreshCw, Trophy, X } from 'lucide-preact';
import type { PoloFeed, PoloGame, PoloTeam } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Sheet } from '@/ui/Sheet';
import { navigate } from '@/ui/router';
import { onResume } from '@/state/store';
import { waterPoloActions, waterPoloRefresh, waterPoloStore } from '@/state/waterpolo';
import {
  CONFERENCE_ORDER,
  datesWithResults,
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
  const { feed, ready, refreshing, lastError, watch, cooldownUntil } = waterPoloStore.use();
  const restored = useMemo(readPlacement, []);
  const [day, setDay] = useState<string | null>(restored?.day ?? null);
  const [team, setTeam] = useState<string | null>(restored?.team ?? null);
  const [conference, setConference] = useState<ConferenceFilter>(restored?.conference ?? 'all');
  const [open, setOpen] = useState<PoloGame | null>(null);

  useEffect(() => onResume(() => void waterPoloActions.refresh(false), 60 * 60_000), []);

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

  const shown = useMemo(() => {
    let list = mine;
    if (conference !== 'all') list = list.filter((g) => g.conference === conference);
    if (team) list = list.filter((g) => g.home.team === team || g.away.team === team);
    if (day) list = list.filter((g) => g.date === day);
    return list;
  }, [mine, conference, team, day]);

  // The date strip offers the dates that exist under the other two filters, so it can never offer
  // a day that would come back empty.
  const dates = useMemo(() => {
    let list = mine;
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

      <div class="polo-actions">
        <RefreshButton watch={watch} cooldownUntil={cooldownUntil} />
        <button class="btn btn--ghost polo-poll-btn" onClick={() => navigate('poll')}>
          <Trophy size={17} strokeWidth={1.9} aria-hidden="true" />
          CWPA Top 20
        </button>
      </div>

      {watch && <WatchBanner watch={watch} />}

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
 * The only way to reach the real sources at zero cost: open the workflow's page, where one tap on
 * GitHub's own Run button starts the job, then watch the published file for the build it produces.
 * Putting a token in the app would make this one tap, and the brief rules that out.
 */
function RefreshButton({ watch, cooldownUntil }: { watch: ReturnType<typeof waterPoloStore.get>['watch']; cooldownUntil: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const left = Math.ceil((cooldownUntil - now) / 1000);
  const cooling = left > 0;
  return (
    <button
      class="btn btn--primary polo-check-btn"
      disabled={cooling}
      onClick={() => waterPoloRefresh.checkNow()}
      aria-label="Check the schools' websites now, on GitHub"
    >
      <RefreshCw size={17} strokeWidth={2} class={watch?.phase === 'waiting' ? 'spin' : undefined} aria-hidden="true" />
      {cooling ? `Check sources now (${left}s)` : 'Check sources now'}
    </button>
  );
}

/** Says what the watcher actually knows, and never more than that. */
function WatchBanner({ watch }: { watch: NonNullable<ReturnType<typeof waterPoloStore.get>['watch']> }) {
  const body = () => {
    switch (watch.phase) {
      case 'waiting':
        return (
          <>
            <b>Waiting for the run.</b>
            <p class="small" style="margin:4px 0 0">
              Tap <b>Run workflow</b> on the page that just opened. This screen checks for the new results every 20
              seconds for up to 12 minutes. You can keep using the app.
            </p>
          </>
        );
      case 'updated':
        return (
          <>
            <b>
              Updated · {watch.added} new {watch.added === 1 ? 'result' : 'results'}
            </b>
            {watch.failed.length > 0 && (
              <p class="small" style="margin:4px 0 0">
                {watch.okCount} of {watch.total} schools were read. Couldn&rsquo;t reach {watch.failed.join(', ')}.
              </p>
            )}
          </>
        );
      case 'unchanged':
        return (
          <>
            <b>Updated · nothing new</b>
            <p class="small" style="margin:4px 0 0">
              The run finished and read {watch.okCount} of {watch.total} schools. No game has been added since the last
              check.
              {watch.failed.length > 0 && ` Couldn't reach ${watch.failed.join(', ')}.`}
            </p>
          </>
        );
      case 'timeout':
        return (
          <>
            <b>No new results yet</b>
            <p class="small" style="margin:4px 0 0">
              The run may still be going — GitHub often starts a job several hours after it is asked to. Nothing has
              been lost; the results will appear the next time this screen refreshes.
            </p>
          </>
        );
      default:
        return null;
    }
  };
  return (
    <div class={`notice polo-watch polo-watch--${watch.phase}`}>
      <Info size={18} strokeWidth={1.9} aria-hidden="true" />
      <div class="grow">{body()}</div>
      <button class="icon-btn" aria-label="Dismiss" onClick={() => waterPoloRefresh.clear()}>
        <X size={18} />
      </button>
    </div>
  );
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
  const when = fresh.checkedAt ? `Checked ${formatClock(fresh.checkedAt)}` : 'Not checked yet';
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
