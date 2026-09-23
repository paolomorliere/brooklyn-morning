import type { PoloFeed } from '@/types';
import { Info } from 'lucide-preact';
import { standingsOf } from '@/lib/polo';
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

  return (
    <section class="polo-standings" aria-labelledby={`st-${conference}`}>
      <div class="section-title">
        <h2 id={`st-${conference}`}>{info?.short ?? conference} table</h2>
        <span class="count">{played}</span>
      </div>

      <table class="polo-table">
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
                <>
                  <td class="polo-num polo-dash" colSpan={4} title="This team's own schedule page could not be read">
                    &mdash;
                  </td>
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
