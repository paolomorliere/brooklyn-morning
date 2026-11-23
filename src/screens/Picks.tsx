import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ChevronLeft, ChevronUp, RefreshCw } from 'lucide-preact';
import { navigate } from '@/ui/router';
import { onResume } from '@/state/store';
import { picksActions, picksStore } from '@/state/picks';
import { STAKE, signed, trackRecord, usd, type CardFollow, type FinishedPick, type RunningPick, type TrackRecord } from '@/lib/picks';
import { shortDate } from '@/lib/format';
import type { StockRecap, StockRecapRow } from '@/types';

/**
 * Track record: how the stock picks have actually done.
 *
 * Two questions, in the order Paolo asked them.
 *   1. If I had done exactly what each card said — bought at the open on its buy day, sold at the close
 *      on its sell day — would I have made money, and how much? $1,000 into each pick. Picks still open
 *      are valued at the last close, and are a separate figure that is never added to the finished one.
 *   2. Would following the picks have beaten simply owning the S&P 500 over the same days?
 *
 * Every number comes from the measurements the stocks build publishes. The app does no pricing.
 */

type Mode = 'money' | 'market';

const day = (ymd: string | null | undefined) => (ymd ? shortDate(`${ymd}T12:00:00`) : '—');
/** "Tue, Oct 6": the weekday matters when the question is "what was I told to do, and when". */
const dayW = (ymd: string | null | undefined) =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '—';
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const money = (v: number | null | undefined) => (v == null ? '—' : `$${v.toFixed(2)}`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${signed(v)}%`);
const whole = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

export function Picks() {
  const { recaps, builtAt, ready, refreshing, lastError } = picksStore.use();
  const [mode, setMode] = useState<Mode>('money');
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
  const scale = t
    ? scaleOf(mode === 'money' ? [...t.finished.map((f) => f.netPct), ...t.running.map((r) => r.netPct)] : [...t.finished.map((f) => f.vsSpy), ...t.running.map((r) => r.vsSpy)])
    : 5;

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
            Stock in focus · prices as of the close on {dayW(t.asOf)}
            {builtAt ? ` · updated ${shortDate(builtAt)}` : ''}
          </p>

          <MoneyPanel t={t} />
          <MarketPanel t={t} />

          {(t.finished.length > 0 || t.running.length > 0) && (
            <div class="tr-switch" role="group" aria-label="What the bars show">
              <button class={mode === 'money' ? 'is-on' : ''} aria-pressed={mode === 'money'} onClick={() => setMode('money')}>
                Money
              </button>
              <button class={mode === 'market' ? 'is-on' : ''} aria-pressed={mode === 'market'} onClick={() => setMode('market')}>
                vs S&P 500
              </button>
            </div>
          )}

          {t.finished.length > 0 && (
            <section class="tr-section" aria-labelledby="tr-finished">
              <h2 id="tr-finished">Finished picks</h2>
              <p class="small muted">
                {mode === 'money'
                  ? `What $${STAKE.toLocaleString('en-US')} in each would have made or lost, bought and sold on the days the card said. Tap one for the details.`
                  : 'How far each pick ended above or below the S&P 500 over the same days, in percentage points. Tap one for the details.'}
              </p>
              <Legend mode={mode} />
              <DivergingList items={t.finished.map((f) => finishedItem(f, mode))} scale={scale} mode={mode} />
            </section>
          )}

          {t.running.length > 0 && (
            <section class="tr-section" aria-labelledby="tr-running">
              <h2 id="tr-running">Still open</h2>
              <p class="small muted">
                {t.running.length} {t.running.length === 1 ? 'pick has' : 'picks have'} not reached the sell day on {t.running.length === 1 ? 'its' : 'their'} card.
                Valued at the close on {dayW(t.asOf)}, so these will still move, and they are not in the finished figures.
              </p>
              <Legend mode={mode} provisional />
              <DivergingList items={t.running.map((r) => runningItem(r, mode, t.asOf))} scale={scale} mode={mode} />
            </section>
          )}

          {t.unpriced.length > 0 && (
            <p class="small muted tr-unpriced">
              No answer for {t.unpriced.map((r) => `${r.ticker} (${day(r.date)})`).join(', ')}: no price could be found for{' '}
              {t.unpriced.length === 1 ? 'it' : 'them'}, so {t.unpriced.length === 1 ? 'it is' : 'they are'} not counted.
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
                Every figure assumes ${STAKE.toLocaleString('en-US')} put into each pick at the open on the buy day its card gave, and taken out at
                the close on the sell day its card gave — 21 trading sessions later. Returns include dividends. Trading costs of 0.10% each way
                are taken off.
              </p>
              <p>
                One card could not be followed as written: it was published after its own buy day's open had passed. That pick is measured from
                the next open instead, and says so. Every other finished pick was bought and sold on exactly the card's days.
              </p>
              <p>
                Picks still open are valued at the last close. They are kept apart from the finished picks and never added to them, because they
                have not been sold.
              </p>
              <p>
                "Beat the S&P 500" compares each pick with the SPY fund over exactly the same sessions, with 0.02% costs. In a falling market a pick
                can lose money and still beat the index. This is a record of a research process, not investment advice.
              </p>
            </div>
          )}

          {showV1 && v1 && <VersionOne recap={v1} />}
        </>
      )}
    </main>
  );
}

/** The first answer: what doing what the cards said would have made, finished and open kept apart. */
function MoneyPanel({ t }: { t: TrackRecord }) {
  const f = t.money.finished;
  const r = t.money.running;
  const waiting = t.running.filter((x) => x.dollars == null);
  return (
    <section class="tr-money" aria-labelledby="tr-money-h">
      <h2 id="tr-money-h" class="tr-money-h">
        If you'd done what the cards said
      </h2>
      <p class="small muted">
        ${STAKE.toLocaleString('en-US')} into each pick, bought and sold on the card's days, after trading costs, dividends included.
      </p>

      {f.n > 0 ? (
        <div class="tr-money-block">
          <div class="tr-money-k">Finished · sold on the card's sell day</div>
          <div class="tr-money-v">
            {f.total >= 0 ? 'Up' : 'Down'} {whole(Math.abs(f.total))}
          </div>
          <div class="small muted">
            {f.n} {f.n === 1 ? 'pick' : 'picks'} · {whole(f.n * STAKE)} in, {whole(f.n * STAKE + f.total)} back · made money on {f.made}, lost on {f.lost}
            {f.n - f.made - f.lost > 0 ? `, broke even on ${f.n - f.made - f.lost}` : ''}
          </div>
        </div>
      ) : (
        <p class="small">No pick has reached the sell day on its card yet.</p>
      )}

      {(r.n > 0 || waiting.length > 0) && (
        <div class="tr-money-block tr-money-open">
          <div class="tr-money-k">Still open · at the close on {dayW(t.asOf)}</div>
          {r.n > 0 && (
            <>
              <div class="tr-money-v">
                {r.total >= 0 ? 'Up' : 'Down'} {whole(Math.abs(r.total))} so far
              </div>
              <div class="small muted">
                {r.n} {r.n === 1 ? 'pick' : 'picks'} · {whole(r.n * STAKE)} in, worth {whole(r.n * STAKE + r.total)} now · up on {r.up}, down on {r.down}
              </div>
            </>
          )}
          {waiting.length > 0 && (
            <div class="small muted">
              {waiting.map((w) => w.row.ticker).join(', ')}: bought at the open on {dayW(waiting[0].row.cardBuy ?? waiting[0].row.date)}, no closing price for{' '}
              {waiting.length === 1 ? 'it' : 'them'} yet.
            </div>
          )}
        </div>
      )}

      {f.n > 0 && r.n > 0 && <p class="small faint">The two are kept apart: the open picks haven't been sold, so their figure will still move.</p>}
    </section>
  );
}

/** The second answer: against simply owning the S&P 500. */
function MarketPanel({ t }: { t: TrackRecord }) {
  if (t.n === 0) return null;
  return (
    <section class="tr-headline" aria-label="Against the S&P 500">
      <div class="tr-money-k">Against the S&P 500</div>
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

function Legend({ mode, provisional = false }: { mode: Mode; provisional?: boolean }) {
  const [up, down] =
    mode === 'money'
      ? provisional
        ? ['Up so far', 'Down so far']
        : ['Made money', 'Lost money']
      : provisional
        ? ['Ahead of the S&P so far', 'Behind so far']
        : ['Beat the S&P 500', 'Trailed it'];
  return (
    <div class={`tr-legend small muted${provisional ? ' is-provisional' : ''}`} aria-hidden="true">
      <span>
        <i class="tr-key tr-key-up" /> {up}
      </span>
      <span>
        <i class="tr-key tr-key-down" /> {down}
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
  /** Second line under the ticker: the pick date, or "day 3/21". */
  sub: string;
  /** Drives the bar: the pick's own return in money mode, points against the S&P 500 in market mode. */
  value: number | null;
  /** What is printed at the end of the row. */
  text: string;
  /** A pick still open: lighter bar, never read as a result. */
  provisional?: boolean;
  label: string;
  detail: ComponentChildren;
}

/** What the card told Paolo to do, and whether the record did exactly that. */
function CardLine({ row, follow, open }: { row: StockRecapRow; follow: CardFollow; open?: boolean }) {
  if (follow.kind === 'no-dates') return null;
  const said = (
    <div>
      <strong>The card {open ? 'says' : 'said'}:</strong> buy at the open {dayW(row.cardBuy)} · sell at the close {dayW(row.cardSell)}
    </div>
  );
  if (follow.kind === 'late') {
    return (
      <>
        {said}
        <div class="tr-note">
          It was published at {clock(follow.publishedAt)} on {dayW(new Date(follow.publishedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))}, after
          that day's open, so it couldn't be bought as written. Measured from the next open instead, {dayW(row.entryDate)}
          {row.status === 'complete' ? `, to the close ${dayW(row.valueDate)}` : ''}.
        </div>
      </>
    );
  }
  if (follow.kind === 'differs') {
    return (
      <>
        {said}
        <div class="tr-note">
          The record measured it from {dayW(row.entryDate)}
          {row.status === 'complete' ? ` to ${dayW(row.valueDate)}` : ''} instead, which is not what the card said.
        </div>
      </>
    );
  }
  return said;
}

function finishedItem(f: FinishedPick, mode: Mode, prefix = ''): BarItem {
  const made = f.dollars >= 0;
  const ahead = f.vsSpy >= 0;
  return {
    key: prefix + f.row.date + f.row.ticker,
    ticker: f.row.ticker,
    sub: day(f.row.date),
    value: mode === 'money' ? f.netPct : f.vsSpy,
    text: mode === 'money' ? usd(f.dollars) : signed(f.vsSpy),
    label:
      mode === 'money'
        ? `${f.row.ticker}, picked ${day(f.row.date)}: $${STAKE} would have ${made ? 'made' : 'lost'} ${whole(Math.abs(f.dollars))}`
        : `${f.row.ticker}, picked ${day(f.row.date)}: ${ahead ? 'beat' : 'trailed'} the S&P 500 by ${Math.abs(f.vsSpy).toFixed(1)} points`,
    detail: (
      <>
        <div class="tr-detail-name">{f.row.name}</div>
        <CardLine row={f.row} follow={f.card} />
        <div>
          Bought {dayW(f.row.entryDate)} at {money(f.row.entryPrice)} · sold {dayW(f.row.valueDate)} at {money(f.row.valuePrice)}
        </div>
        <div class="tr-answer">
          On ${STAKE.toLocaleString('en-US')}: {made ? 'made' : 'lost'} {whole(Math.abs(f.dollars))} ({pct(f.netPct)})
        </div>
        <div>
          The S&P 500 over the same days: {pct(f.spyPct)} · {ahead ? 'ahead' : 'behind'} by {Math.abs(f.vsSpy).toFixed(1)} points
        </div>
      </>
    ),
  };
}

function runningItem(r: RunningPick, mode: Mode, asOf: string): BarItem {
  const started = r.day > 0 && r.netPct != null && r.dollars != null;
  const left = r.of - r.day;
  const value = !started ? null : mode === 'money' ? r.netPct : r.vsSpy;
  return {
    key: r.row.date + r.row.ticker,
    ticker: r.row.ticker,
    sub: started ? `day ${r.day}/${r.of}` : 'starting',
    value,
    text: !started ? '—' : mode === 'money' ? usd(r.dollars as number) : r.vsSpy == null ? '—' : signed(r.vsSpy),
    provisional: true,
    label: !started
      ? `${r.row.ticker}: bought at the open, no closing price yet`
      : mode === 'money'
        ? `${r.row.ticker}, day ${r.day} of ${r.of}: $${STAKE} would be ${(r.dollars as number) >= 0 ? 'up' : 'down'} ${whole(Math.abs(r.dollars as number))} so far`
        : `${r.row.ticker}, day ${r.day} of ${r.of}: so far ${(r.vsSpy ?? 0) >= 0 ? 'ahead of' : 'behind'} the S&P 500 by ${Math.abs(r.vsSpy ?? 0).toFixed(1)} points`,
    detail: (
      <>
        <div class="tr-detail-name">{r.row.name}</div>
        <CardLine row={r.row} follow={r.card} open />
        {started ? (
          <>
            <div>
              Bought {dayW(r.row.entryDate)} at {money(r.row.entryPrice)} · last close {dayW(r.row.valueDate ?? asOf)} at {money(r.row.valuePrice)}
            </div>
            <div class="tr-answer">
              On ${STAKE.toLocaleString('en-US')}: {(r.dollars as number) >= 0 ? 'up' : 'down'} {whole(Math.abs(r.dollars as number))} so far ({pct(r.netPct)}),
              with {left} trading {left === 1 ? 'day' : 'days'} to go
            </div>
            <div>The S&P 500 over the same days: {pct(r.spyPct)}</div>
          </>
        ) : (
          <div>Bought at the open on its buy day. No closing price has been published for it yet.</div>
        )}
      </>
    ),
  };
}

function DivergingList({ items, scale, mode = 'money' }: { items: BarItem[]; scale: number; mode?: Mode }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul class="tr-bars">
      <li class="tr-axis small faint" aria-hidden="true">
        <span />
        <span class="tr-axis-scale">
          {mode === 'money' ? (
            <>
              <span>−{scale}%</span>
              <span>0</span>
              <span>+{scale}%</span>
            </>
          ) : (
            <>
              <span>−{scale}</span>
              <span>S&P 500</span>
              <span>+{scale}</span>
            </>
          )}
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
              <span class="tr-value">{it.text}</span>
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
  const f = t.money.finished;
  return (
    <section class="tr-section tr-v1" aria-labelledby="tr-v1">
      <h2 id="tr-v1">The earlier version, kept separate</h2>
      <p class="small muted">
        Version 1 picked from 21 September to 6 October 2026 with a different rule. Its cards never said when to sell, so there is no "as the
        card said" answer for these: each is measured over five trading days from the first open after it was published, and never added to
        the figures above.
      </p>
      {f.n > 0 && (
        <p class="small">
          <strong>
            ${STAKE.toLocaleString('en-US')} in each, held five days: {f.total >= 0 ? 'up' : 'down'} {whole(Math.abs(f.total))}
          </strong>{' '}
          · made money on {f.made}, lost on {f.lost} · {t.beat} of {t.n} beat the S&P 500
        </p>
      )}
      <Legend mode="money" />
      <DivergingList items={t.finished.map((x) => finishedItem(x, 'money', 'v1'))} scale={scaleOf(t.finished.map((x) => x.netPct))} />
    </section>
  );
}
