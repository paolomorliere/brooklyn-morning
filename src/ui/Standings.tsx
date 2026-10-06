import type { PoloFeed } from '@/types';
import { AlertTriangle, Info } from 'lucide-preact';
import { conferenceCoverageOf, formatNyStamp, standingsOf } from '@/lib/polo';
import { TeamCrest } from '@/screens/WaterPolo';

/**
 * The conference table.
 *
 * Two things this component has to be plain about, because getting either wrong would be a claim
 * the sources do not support:
 *   * the points are Paolo's own three-for-a-win calculation, not the CWPA's official standings,
 *     which use a different scale and their own tiebreakers;
 *   * only games the CWPA's published conference schedule actually lists are counted.
 *
 * The table is derived from the games on every render and stored nowhere, so a corrected score
 * moves both teams at once.
 */
export function Standings({
  feed,
  conference,
  onTeam,
}: {
  feed: PoloFeed;
  conference: 'MAWPC' | 'NWPC';
  onTeam: (slug: string) => void;
}) {
  const info = feed.conference?.members?.[conference];
  const members = info?.members ?? [];
  if (members.length === 0) return null;
  const rows = standingsOf(feed.games, conference, members, feed.teams);
  const played = rows.reduce((n, r) => n + r.played, 0) / 2;
  const anyTies = rows.some((r) => r.ties > 0);

  // A game only counts here when the CWPA's own conference schedule lists it, so when that page
  // could not be read the results list keeps growing while this table stands still. The build has
  // always recorded that; until now nothing on screen said it, which is why the table could look
  // stale with no explanation.
  const coverage = conferenceCoverageOf(feed.conference);
  const unread = coverage.failed.includes(conference);

  return (
    <section class="polo-standings" aria-labelledby={`st-${conference}`}>
      <div class="section-title">
        <h2 id={`st-${conference}`}>{info?.short ?? conference} table</h2>
        <span class="count">{played}</span>
      </div>

      <table class="polo-table">
        {/*
          Explicit widths, because `table-layout: fixed` ignores anything the cells ask for. Without
          this the four numeric columns were sized by their content, so the header labels and the
          numbers beneath them sat over different boundaries. The name column takes whatever is
          left, which is what lets a long school name wrap instead of widening the table.
        */}
        <colgroup>
          <col class="polo-col-pos" />
          <col class="polo-col-crest" />
          <col class="polo-col-name" />
          <col class="polo-col-pts" />
          <col class="polo-col-wl" />
          <col class="polo-col-wl" />
          <col class="polo-col-gd" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" class="polo-pos">#</th>
            <th scope="col" colSpan={2}>Team</th>
            <th scope="col" class="polo-num">Pts</th>
            <th scope="col" class="polo-num">W</th>
            <th scope="col" class="polo-num">L</th>
            <th scope="col" class="polo-num">GD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team} class={r.partial ? 'polo-tr--partial' : undefined}>
              <td class="polo-pos">{r.position}</td>
              <td class="polo-table-crest">
                <TeamCrest team={feed.teams[r.team]} name={r.name} size="sm" />
              </td>
              <td class="polo-table-name">
                <button class="polo-linkish" onClick={() => onTeam(r.team)}>
                  {r.name}
                </button>
              </td>
              {r.partial && r.played === 0 ? (
                /*
                  Four separate dashes rather than one cell spanning four columns. A colSpan here
                  used to collapse the numeric columns on this row alone, so the row did not line up
                  with the header and — under auto layout — it shifted the column widths for the
                  whole table.
                */
                <>
                  <td class="polo-num polo-dash" title="This team's own schedule page could not be read">&mdash;</td>
                  <td class="polo-num polo-dash">&mdash;</td>
                  <td class="polo-num polo-dash">&mdash;</td>
                  <td class="polo-num polo-dash">&mdash;</td>
                </>
              ) : (
                <>
                  <td class="polo-num polo-pts">{r.points}</td>
                  <td class="polo-num">{r.wins}</td>
                  <td class="polo-num">{r.losses}</td>
                  <td class="polo-num">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {unread ? (
        <p class="small polo-partial polo-coverage-note">
          <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
          <span>
            The {conference} schedule could not be read on the last build
            {coverage.checkedAt ? ` (${formatNyStamp(coverage.checkedAt)})` : ''}, so games that finished since then are
            in the results list but not yet in this table.
          </span>
        </p>
      ) : (
        coverage.checkedAt && (
          <p class="small faint polo-coverage-note">
            {conference} schedule read {formatNyStamp(coverage.checkedAt)}
          </p>
        )
      )}

      <p class="small polo-partial polo-table-note">
        <Info size={14} strokeWidth={2} aria-hidden="true" />
        <span>
          Three points for a win, none for a loss &mdash; my own calculation, not the CWPA&rsquo;s official standings
          or its tiebreakers.{anyTies && ' A game that finished level scores nothing for either side.'} Counts only the{' '}
          {info?.scheduleUrl ? (
            <a href={info.scheduleUrl} target="_blank" rel="noopener noreferrer">
              fixtures the {conference} schedule lists
            </a>
          ) : (
            `fixtures the ${conference} schedule lists`
          )}
          .{rows.some((r) => r.partial) && ' A dash means that school’s own page could not be read.'}
        </span>
      </p>
    </section>
  );
}
