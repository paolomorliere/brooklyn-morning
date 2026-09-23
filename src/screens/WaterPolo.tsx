import { useEffect, useMemo, useState } from 'preact/hooks';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Info, RefreshCw } from 'lucide-preact';
import type { PoloGame, PoloTeam } from '@/types';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Sheet } from '@/ui/Sheet';
import { onResume } from '@/state/store';
import { waterPoloActions, waterPoloStore } from '@/state/waterpolo';
import {
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

const base = () => import.meta.env.BASE_URL;

export function WaterPolo() {
  const { feed, ready, refreshing, lastError } = waterPoloStore.use();
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<PoloGame | null>(null);

  useEffect(() => onResume(() => void waterPoloActions.refresh(false), 60 * 60_000), []);

  const games = feed?.games ?? [];
  const dates = useMemo(() => datesWithResults(games), [games]);
  const days = useMemo(
    () => groupByDate(day ? games.filter((g) => g.date === day) : games),
    [games, day],
  );
  const fresh = useMemo(() => freshnessOf(feed?.sources ?? []), [feed]);
  const teams = feed?.teams ?? {};

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

      {dates.length > 0 && (
        <DateStrip dates={dates} day={day} onPick={setDay} />
      )}

      {ready && games.length === 0 && !refreshing && (
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

      {ready && games.length > 0 && days.length === 0 && (
        <div class="empty">
          <h3>No games on this date</h3>
          <p>{day ? formatDayHeading(day) : ''}</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => setDay(null)}>
            Back to all results
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
              <GameRow key={g.id} game={g} teams={teams} onOpen={() => setOpen(g)} />
            ))}
          </ul>
        </section>
      ))}

      {open && <GameSheet game={open} teams={teams} sources={feed?.sources ?? []} onClose={() => setOpen(null)} />}
    </main>
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
function TeamCrest({ team, name }: { team: PoloTeam | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!team?.logo || failed) {
    return (
      <span class="polo-crest polo-crest--initials" aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  return (
    <span class="polo-crest">
      <img src={`${base()}${team.logo}`} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

function GameRow({ game, teams, onOpen }: { game: PoloGame; teams: Record<string, PoloTeam>; onOpen: () => void }) {
  const homeName = teams[game.home.team]?.name ?? game.home.team;
  const awayName = teams[game.away.team]?.name ?? game.away.team;
  const win = winnerOf(game);
  const withheld = game.home.score === null || game.away.score === null;
  const label = withheld
    ? `${homeName} against ${awayName}, result not confirmed`
    : `${homeName} ${game.home.score}, ${awayName} ${game.away.score}`;

  return (
    <li>
      <button class="polo-row" onClick={onOpen} aria-label={`${label}. Show details.`}>
        <TeamCrest team={teams[game.home.team]} name={homeName} />
        <span class={`polo-team ${win === 'home' ? 'polo-team--win' : ''}`}>{homeName}</span>
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
        <span class={`polo-team polo-team--right ${win === 'away' ? 'polo-team--win' : ''}`}>{awayName}</span>
        <TeamCrest team={teams[game.away.team]} name={awayName} />
      </button>
    </li>
  );
}

function GameSheet({
  game,
  teams,
  sources,
  onClose,
}: {
  game: PoloGame;
  teams: Record<string, PoloTeam>;
  sources: { id: string; display: string }[];
  onClose: () => void;
}) {
  const name = (slug: string) => teams[slug]?.name ?? slug;
  const school = (id: string) => sources.find((s) => s.id === id)?.display ?? id;
  const scoreLine =
    game.home.score === null || game.away.score === null
      ? 'Result not confirmed'
      : `${name(game.home.team)} ${game.home.score} – ${game.away.score} ${name(game.away.team)}`;

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
    `${scores[game.home.team] ?? '?'} \u2013 ${scores[game.away.team] ?? '?'}`;
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
