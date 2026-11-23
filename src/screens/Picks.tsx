import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ChevronLeft, ChevronUp, RefreshCw } from 'lucide-preact';
import { navigate } from '@/ui/router';
import { onResume } from '@/state/store';
import { picksActions, picksStore } from '@/state/picks';
import { signed, trackRecord, type FinishedPick, type RunningPick, type TrackRecord } from '@/lib/picks';
import { shortDate } from '@/lib/format';
import type { StockRecap } from '@/types';

/**
 * Track record: how the stock picks have actually done.
 *
 * One question, answered first: would following the picks have beaten simply owning the S&P 500 over
 * the same days? Then one chart of every finished pick against the market, then the same chart, in a
 * lighter wash, for the picks still inside their 21-session hold — kept apart because they are not
 * results yet and are counted in no figure.
 *
 * Every number comes from the measurements the stocks build publishes. The app does no pricing.
 */

const day = (ymd: string | null | undefined) => (ymd ? shortDate(`${ymd}T12:00:00`) : '—');
const money = (v: number | null | undefined) => (v == null ? '—' : `$${v.toFixed(2)}`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${signed(v)}%`);

export function Picks() {
  const { recaps, builtAt, ready, refreshing, lastError } = picksStore.use();
  const [showV1, setShowV1] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    scrollTo({ top: 0 });
    return onResume(() => void picksActions.refresh(false), 60 * 60_000);
  }, []);

  const v2 = recaps.find((r) => r.strategyVersion === 2) ?? null;
  const v1 = recaps.find((r) => r.strategyVersion === 1) ?? null;
  const t = v2 ? trackRecord(v2) : null;
  // One scale for the finished and the running chart, so a bar means the same length in both.
  const scale = t ? scaleOf([...t.finished.map((f) => f.vsSpy), ...t.running.map((r) => r.vsSpy)]) : 5;

  return (
    <main class="screen picks">
      <header class="screen-header" style="align-items:center;padding-top:calc(var(--safe-top) + 8px)">
        <button
          class="icon-btn"
          aria-label="Back"
          onClick={() => (history.length > 1 ? history.back() : navigate('home'))}
          style="margin-left:-12px"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 style="flex:1;font-size:var(--fs-18);font-family:var(--font-ui);font-weight:600">Track record</h1>
        <button class="icon-btn" aria-label="Check for a newer record" disabled={refreshing} onClick={() => void picksActions.refresh(true)}>
          <RefreshCw size={20} strokeWidth={1.9} class={refreshing ? 'spin' : undefined} />
        </button>
      </header>

      {lastError && <p class="small muted" role="status">{lastError}</p>}

      {!ready || (!t && refreshing) ? (
        <p class="small faint">Loading…</p>
      ) : !t ? (
        <div class="empty">
          <h3>No record saved yet</h3>
          <p>Connect to the internet once to download it.</p>
          <button class="btn btn--ghost" style="margin-top:16px" onClick={() => void picksActions.refresh(true)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <p class="small muted tr-asof">
            Stock in focus · prices as of the close on {day(t.asOf)}
            {builtAt ? ` · updated ${shortDate(builtAt)}` : ''}
          </p>

          <Headline t={t} />

          {t.finished.length > 0 && (
            <section class="tr-section" aria-labelledby="tr-finished">
              <h2 id="tr-finished">Every finished pick against the S&P 500</h2>
              <p class="small muted">
                Each bar is how far the pick ended above or below the S&P 500 over the same 21 trading days, in percentage points. Tap one
                for its prices.
              </p>
              <Legend />
              <DivergingList items={t.finished.map((f) => finishedItem(f))} scale={scale} />
            </section>
          )}

          {t.running.length > 0 && (
            <section class="tr-section" aria-labelledby="tr-running">
              <h2 id="tr-running">Still running</h2>
              <p class="small muted">
                {t.running.length} {t.running.length === 1 ? 'pick is' : 'picks are'} inside {t.running.length === 1 ? 'its' : 'their'} 21 trading
                days. These are so far, not results, and are not counted above.
              </p>
              <Legend provisional />
              <DivergingList items={t.running.map(runningItem)} scale={scale} />
            </section>
          )}

          {t.unpriced.length > 0 && (
            <p class="small muted tr-unpriced">
              Not counted, because no price could be found for {t.unpriced.length === 1 ? 'it' : 'them'}:{' '}
              {t.unpriced.map((r) => `${r.ticker} (${day(r.date)})`).join(', ')}.
            </p>
          )}

          <div class="story-actions tr-more">
            <button class="btn btn--quiet" aria-expanded={showMethod} onClick={() => setShowMethod(!showMethod)}>
              {showMethod ? <ChevronUp size={16} /> : <ChevronDown size={16} />} How this is measured
            </button>
            {v1 && (
              <button class="btn btn--quiet" aria-expanded={showV1} onClick={() => setShowV1(!showV1)}>
                {showV1 ? <ChevronUp size={16} /> : <ChevronDown size={16} />} The earlier version
              </button>
            )}
          </div>

          {showMethod && (
            <div class="tr-method small">
              <p>
                Each pick is bought at the open of the first trading session after it was published and sold at the close 21 sessions
                later. Returns include dividends. Costs of 0.10% each way are taken off the stock and 0.02% off the S&P 500, which is
                measured as the SPY fund over exactly the same sessions.
              </p>
              <p>
                "Beat the S&P 500" means the pick ended higher than the index over its own 21 days. "Made money" means its own return was
                above zero. In a falling market a pick can lose money and still beat the index, and in a rising one the opposite.
              </p>
              <p>Only finished picks are in the figures. This is a record of a research process, not investment advice.</p>
            </div>
          )}

          {showV1 && v1 && <VersionOne recap={v1} />}
        </>
      )}
    </main>
  );
}

/** The answer, then the three numbers behind it. */
function Headline({ t }: { t: TrackRecord }) {
  if (t.n === 0) return <p class="tr-verdict">{t.verdict}</p>;
  return (
    <section class="tr-headline" aria-label="Summary">
      <p class="tr-verdict">{t.verdict}</p>
      <div class="tr-hero">
        <div class="tr-hero-v">
          {t.beat} <span class="tr-hero-of">of {t.n}</span>
        </div>
        <div class="tr-hero-k">finished picks beat the S&P 500</div>
        <div class="tr-split" role="img" aria-label={`${t.beat} beat the S&P 500, ${t.n - t.beat} trailed it`}>
          {t.beat > 0 && <span class="tr-split-up" style={{ flexGrow: t.beat }} />}
          {t.n - t.beat > 0 && <span class="tr-split-down" style={{ flexGrow: t.n - t.beat }} />}
        </div>
      </div>
      <div class="tr-tiles">
        <div class="tr-tile">
          <div class="tr-tile-k">Average pick</div>
          <div class="tr-tile-v">{pct(t.meanNet)}</div>
        </div>
        <div class="tr-tile">
          <div class="tr-tile-k">S&P 500, same days</div>
          <div class="tr-tile-v">{pct(t.meanSpy)}</div>
        </div>
        <div class="tr-tile">
          <div class="tr-tile-k">Made money</div>
          <div class="tr-tile-v">
            {t.madeMoney} <span class="tr-tile-of">of {t.n}</span>
          </div>
        </div>
      </div>
      {t.caution && <p class="small muted tr-caution">{t.caution}</p>}
    </section>
  );
}

function Legend({ provisional = false }: { provisional?: boolean }) {
  return (
    <div class={`tr-legend small muted${provisional ? ' is-provisional' : ''}`} aria-hidden="true">
      <span>
        <i class="tr-key tr-key-up" /> {provisional ? 'Ahead so far' : 'Beat the S&P 500'}
      </span>
      <span>
        <i class="tr-key tr-key-down" /> {provisional ? 'Behind so far' : 'Trailed it'}
      </span>
    </div>
  );
}

/** One scale for a chart, rounded up so the longest bar never touches the edge. */
function scaleOf(values: (number | null)[]): number {
  const max = Math.max(1, ...values.filter((v): v is number => v != null).map((v) => Math.abs(v)));
  return Math.ceil(max / 5) * 5;
}

interface BarItem {
  key: string;
  ticker: string;
  /** Second line under the ticker: the pick date, or "day 3 of 21". */
  sub: string;
  /** Points ahead of (+) or behind (−) the S&P 500. Null draws no bar. */
  value: number | null;
  /** A running position: lighter bar, never read as a result. */
  provisional?: boolean;
  label: string;
  detail: ComponentChildren;
}

function finishedItem(f: FinishedPick, prefix = ''): BarItem {
  const up = f.vsSpy >= 0;
  return {
    key: prefix + f.row.date + f.row.ticker,
    ticker: f.row.ticker,
    sub: day(f.row.date),
    value: f.vsSpy,
    label: `${f.row.ticker}, picked ${day(f.row.date)}: ${up ? 'beat' : 'trailed'} the S&P 500 by ${Math.abs(f.vsSpy).toFixed(1)} points`,
    detail: (
      <>
        <div class="tr-detail-name">{f.row.name}</div>
        <div>
          Picked {day(f.row.date)} · bought {day(f.row.entryDate)} at {money(f.row.entryPrice)} · sold {day(f.row.valueDate)} at{' '}
          {money(f.row.valuePrice)}
        </div>
        <div>
          The stock {pct(f.netPct)} · the S&P 500 {pct(f.spyPct)} · {up ? 'ahead' : 'behind'} by {Math.abs(f.vsSpy).toFixed(1)} points
        </div>
      </>
    ),
  };
}

function runningItem(r: RunningPick): BarItem {
  const started = r.day > 0 && r.netPct != null;
  const left = r.of - r.day;
  return {
    key: r.row.date + r.row.ticker,
    ticker: r.row.ticker,
    sub: started ? `day ${r.day}/${r.of}` : 'starting',
    value: started ? r.vsSpy : null,
    provisional: true,
    label:
      started && r.vsSpy != null
        ? `${r.row.ticker}, day ${r.day} of ${r.of}: so far ${r.vsSpy >= 0 ? 'ahead of' : 'behind'} the S&P 500 by ${Math.abs(r.vsSpy).toFixed(1)} points`
        : `${r.row.ticker}: its first session has not closed yet`,
    detail: (
      <>
        <div class="tr-detail-name">{r.row.name}</div>
        <div>
          Picked {day(r.row.date)}
          {r.row.entryDate && r.row.entryPrice != null ? ` · bought ${day(r.row.entryDate)} at ${money(r.row.entryPrice)}` : ''}
          {started ? ` · last valued ${day(r.row.valueDate)} at ${money(r.row.valuePrice)}` : ''}
        </div>
        <div>
          {started
            ? `So far the stock ${pct(r.netPct)} · the S&P 500 ${pct(r.spyPct)} · ${left} trading ${left === 1 ? 'day' : 'days'} to go`
            : 'Bought at the open of its first session. The first figure comes after that session closes.'}
        </div>
      </>
    ),
  };
}

function DivergingList({ items, scale }: { items: BarItem[]; scale: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul class="tr-bars">
      <li class="tr-axis small faint" aria-hidden="true">
        <span />
        <span class="tr-axis-scale">
          <span>−{scale}</span>
          <span>S&P 500</span>
          <span>+{scale}</span>
        </span>
        <span />
      </li>
      {items.map((it) => {
        const up = (it.value ?? 0) >= 0;
        // Never thinner than 3px, so a small result is still visibly a result.
        const width = it.value == null ? null : `max(3px, ${Math.min(100, (Math.abs(it.value) / scale) * 100) / 2}%)`;
        const isOpen = open === it.key;
        return (
          <li key={it.key} class={`tr-bar-row${isOpen ? ' is-open' : ''}${it.provisional ? ' is-provisional' : ''}`}>
            <button class="tr-bar-btn" aria-expanded={isOpen} aria-label={it.label} onClick={() => setOpen(isOpen ? null : it.key)}>
              <span class="tr-label">
                <strong>{it.ticker}</strong>
                <span class="faint">{it.sub}</span>
              </span>
              <span class="tr-plot" aria-hidden="true">
                <span class="tr-mid" />
                {width && (
                  <span class={`tr-bar ${up ? 'tr-bar-up' : 'tr-bar-down'}`} style={up ? { left: '50%', width } : { right: '50%', width }} />
                )}
              </span>
              <span class="tr-value">{it.value == null ? '—' : signed(it.value)}</span>
            </button>
            {isOpen && <div class="tr-detail small">{it.detail}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Version 1, on its own and never added to version 2's figures. */
function VersionOne({ recap }: { recap: StockRecap }) {
  const t = trackRecord(recap);
  return (
    <section class="tr-section tr-v1" aria-labelledby="tr-v1">
      <h2 id="tr-v1">The earlier version, kept separate</h2>
      <p class="small muted">
        Version 1 picked from 21 September to 6 October 2026 with a different rule and a five-day hold. Its picks are measured to the end of
        that hold and are never added to the figures above.
      </p>
      <p class="tr-verdict small">{t.verdict}</p>
      <p class="small">
        {t.beat} of {t.n} beat the S&P 500 · average pick {pct(t.meanNet)} · the S&P 500 {pct(t.meanSpy)} · made money {t.madeMoney} of{' '}
        {t.n}
      </p>
      <Legend />
      <DivergingList items={t.finished.map((f) => finishedItem(f, 'v1'))} scale={scaleOf(t.finished.map((f) => f.vsSpy))} />
    </section>
  );
}
