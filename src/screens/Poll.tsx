import { useEffect } from 'preact/hooks';
import { ChevronLeft, ExternalLink, Info, RefreshCw } from 'lucide-preact';
import { navigate } from '@/ui/router';
import { onResume } from '@/state/store';
import { POLL_RUN_URL, pollActions, pollStore } from '@/state/poll';
import { formatLongDate } from '@/lib/polo';
import { TeamCrest } from './WaterPolo';

/**
 * The CWPA's national men's varsity Top 20, exactly as the association published it.
 *
 * Every number on this screen is copied from the article. Nothing here is computed — in particular
 * the three-points-per-win rule the conference table uses never touches these points.
 */
export function Poll() {
  const { poll, ready, refreshing, lastError } = pollStore.use();

  useEffect(() => {
    scrollTo({ top: 0 });
    void pollActions.refresh(false);
    return onResume(() => void pollActions.refresh(false), 60 * 60_000);
  }, []);

  const prevLabel = poll?.previous?.label ?? 'Prev';

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
        <h1 style="flex:1;font-size:var(--fs-18);font-family:var(--font-ui);font-weight:600">CWPA Top 20</h1>
        <button
          class="icon-btn"
          aria-label="Check for a new poll"
          disabled={refreshing}
          onClick={() => void pollActions.refresh(true)}
        >
          <RefreshCw size={20} strokeWidth={1.9} class={refreshing ? 'spin' : undefined} />
        </button>
      </header>

      {!ready || (!poll && refreshing) ? (
        <p class="small faint">Loading…</p>
      ) : !poll ? (
        <div class="empty">
          <h3>No poll saved yet</h3>
          <p>
            {lastError ?? 'Connect to the internet once to download the poll.'}
          </p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => void pollActions.refresh(true)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <h2 class="polo-poll-title">
            {poll.season} Men&rsquo;s Varsity Top 20 · Week {poll.week}
          </h2>
          <p class="small muted polo-poll-sub">
            Published by the Collegiate Water Polo Association
            {poll.publishedAt ? ` on ${formatLongDate(poll.publishedAt)}` : ''}.
          </p>

          {poll.awaiting && (
            <p class="small polo-partial">
              <Info size={14} strokeWidth={2} aria-hidden="true" />
              <span>
                Awaiting this week&rsquo;s poll. This is Week {poll.week}, the most recent one the CWPA has published.
                The next check is Wednesday evening, with a backup on Thursday morning.{' '}
                <a href={POLL_RUN_URL} target="_blank" rel="noopener noreferrer">
                  Check now
                </a>
                .
              </span>
            </p>
          )}
          {lastError && <p class="small muted">{lastError}</p>}

          <table class="polo-table polo-poll-table">
            <thead>
              <tr>
                <th scope="col" class="polo-pos">Rank</th>
                <th scope="col" colSpan={2}>Team</th>
                <th scope="col" class="polo-num">{prevLabel}</th>
                <th scope="col" class="polo-num">Points</th>
              </tr>
            </thead>
            <tbody>
              {poll.rows.map((r, i) => (
                <tr key={`${r.team}-${i}`} class={poll.teams[r.team]?.watched ? 'polo-tr--watched' : undefined}>
                  <td class="polo-pos">{r.rank}</td>
                  <td class="polo-table-crest">
                    <TeamCrest team={poll.teams[r.team]} name={poll.teams[r.team]?.name ?? r.name} size="sm" />
                  </td>
                  <td class="polo-table-name">{poll.teams[r.team]?.name ?? r.name}</td>
                  <td class="polo-num polo-prev">{r.previous ?? '—'}</td>
                  <td class="polo-num polo-pts">{r.pointsText ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul class="polo-links" style="margin-top:16px">
            <li>
              <a class="row-btn" href={poll.sourceUrl} target="_blank" rel="noopener noreferrer">
                <span class="grow">
                  {poll.heading || poll.title}
                  <span class="small muted" style="display:block">The published poll on collegiatewaterpolo.org</span>
                </span>
                <ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" />
              </a>
            </li>
          </ul>

          <p class="small faint polo-table-note">
            Ranks, previous ranks and points are copied from the CWPA&rsquo;s table as published, ties and
            &ldquo;RV&rdquo; included. Nothing on this screen is calculated.
          </p>
        </>
      )}
    </main>
  );
}
