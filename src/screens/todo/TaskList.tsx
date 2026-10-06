import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Star } from 'lucide-preact';
import type { Task } from '@/types';
import { moveTask } from '@/lib/tasks';

/**
 * One category's open tasks, reorderable by press and hold.
 *
 * There is no drag library here on purpose: the app ships no runtime dependency it does not need,
 * and the whole gesture is ~150 lines of pointer events. The rules it has to respect are the awkward
 * part, not the maths:
 *
 *   * A press that moves immediately is a scroll, so nothing is armed until the finger has been
 *     still for {@link LONG_PRESS_MS}, and any real movement before that cancels the arming.
 *   * Once armed the page must not scroll under the finger. `touch-action` is latched by Safari when
 *     the gesture starts, well before the long press completes, so the only thing that reliably
 *     works is preventing default on `touchmove` — which is why there is a touch handler alongside
 *     the pointer ones.
 *   * A long press ends in a `click` on whatever was under the finger. Exactly one click is
 *     swallowed afterwards, or a reorder would also complete, open or star the task it moved.
 *   * Starred tasks stay pinned above the rest, so the drop index is clamped to the block the task
 *     is already in. {@link moveTask} enforces the same rule, so a bad index cannot get through.
 *
 * There is deliberately no drag handle: adding one would change how every row looks for the sake of
 * a gesture, so the whole row is the handle and the task's own sheet carries both the explanation
 * and the pointer-free route — Move up / Move down.
 */

/** How long the finger has to be still before the row lifts. */
const LONG_PRESS_MS = 400;
/** Movement before that which means "I am scrolling, not reordering". */
const CANCEL_SLOP_PX = 8;
/** How close to the top or bottom of the window starts an auto-scroll. */
const EDGE_PX = 96;
const EDGE_SPEED_PX = 12;

interface Gesture {
  pointerId: number;
  id: string;
  fromIndex: number;
  toIndex: number;
  startPageY: number;
  startClientX: number;
  lastClientY: number;
  /** Row geometry captured once, when the drag arms, in page coordinates. */
  rows: { top: number; height: number }[];
  armed: boolean;
  timer: number | null;
  frame: number | null;
}

interface Drag {
  fromIndex: number;
  toIndex: number;
  dy: number;
  height: number;
}

export function TaskList({
  items,
  onComplete,
  onOpen,
  onStar,
  onReorder,
}: {
  items: Task[];
  onComplete: (t: Task) => void;
  onOpen: (t: Task) => void;
  onStar: (t: Task) => void;
  onReorder: (ordered: Task[]) => void;
}) {
  const ulRef = useRef<HTMLUListElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const swallowClick = useRef(false);

  function clear() {
    const g = gesture.current;
    if (!g) return;
    if (g.timer !== null) clearTimeout(g.timer);
    if (g.frame !== null) cancelAnimationFrame(g.frame);
    gesture.current = null;
  }

  // A timer or a frame left running after the screen goes would call setState on a component that
  // no longer exists, and would keep scrolling a page nobody is looking at.
  useEffect(() => () => clear(), []);

  /** Live position: one frame loop handles the auto-scroll and the drop index together. */
  function step() {
    const g = gesture.current;
    if (!g || !g.armed) return;

    if (g.lastClientY < EDGE_PX) scrollBy({ top: -EDGE_SPEED_PX });
    else if (g.lastClientY > innerHeight - EDGE_PX) scrollBy({ top: EDGE_SPEED_PX });

    const dy = g.lastClientY + scrollY - g.startPageY;
    const row = g.rows[g.fromIndex];
    const centre = row.top + row.height / 2 + dy;
    const midOf = (i: number) => g.rows[i].top + g.rows[i].height / 2;
    // Inclusive on purpose: a row dragged exactly onto its neighbour's centre has arrived, and a
    // strict comparison left it one place short of wherever the finger actually stopped.
    let to = g.fromIndex;
    while (to > 0 && centre <= midOf(to - 1)) to--;
    while (to < g.rows.length - 1 && centre >= midOf(to + 1)) to++;

    // Clamp to the star block. `moveTask` clamps as well; doing it here too is what makes the gap
    // on screen stop at the boundary instead of promising a move that will not happen.
    const starredCount = items.filter((t) => t.starred).length;
    const starred = items[g.fromIndex]?.starred ?? false;
    const first = starred ? 0 : starredCount;
    const last = starred ? starredCount - 1 : items.length - 1;
    to = Math.max(first, Math.min(last, to));

    g.toIndex = to;
    setDrag({ fromIndex: g.fromIndex, toIndex: to, dy, height: row.height });
    g.frame = requestAnimationFrame(step);
  }

  function arm(host: HTMLElement) {
    const g = gesture.current;
    const ul = ulRef.current;
    if (!g || !ul) return;
    g.rows = [...ul.querySelectorAll<HTMLLIElement>('li.task')].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + scrollY, height: r.height };
    });
    if (g.rows.length !== items.length) {
      // The list changed under the finger; a stale geometry would move the wrong row.
      clear();
      return;
    }
    g.armed = true;
    g.timer = null;
    try {
      // Capture means the rest of the gesture is delivered here even if the finger leaves the row.
      host.setPointerCapture(g.pointerId);
    } catch {
      /* the pointer has already gone; pointercancel will clean up */
    }
    setDrag({ fromIndex: g.fromIndex, toIndex: g.fromIndex, dy: 0, height: g.rows[g.fromIndex].height });
    g.frame = requestAnimationFrame(step);
  }

  function finish(commit: boolean) {
    const g = gesture.current;
    if (!g) return;
    const { armed, id, fromIndex, toIndex } = g;
    clear();
    setDrag(null);
    if (!armed) return;
    swallowClick.current = true;
    // A touch drag often produces no click at all, so the flag is given a short life of its own
    // rather than waiting for a click that may never come and swallowing the next real tap.
    setTimeout(() => {
      swallowClick.current = false;
    }, 400);
    if (commit && toIndex !== fromIndex) onReorder(moveTask(items, id, toIndex));
  }

  const shiftOf = (i: number): string | undefined => {
    if (!drag) return undefined;
    if (i === drag.fromIndex) return `translateY(${drag.dy}px)`;
    if (i > drag.fromIndex && i <= drag.toIndex) return `translateY(${-drag.height}px)`;
    if (i < drag.fromIndex && i >= drag.toIndex) return `translateY(${drag.height}px)`;
    return undefined;
  };

  return (
    <ul
      ref={ulRef}
      class={drag ? 'task-list task-list--dragging' : 'task-list'}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((t, i) => (
        <li
          key={t.id}
          class={`task${drag?.fromIndex === i ? ' task--lifted' : ''}`}
          style={shiftOf(i) ? `transform:${shiftOf(i)}` : undefined}
          onPointerDown={(e) => {
            if (!e.isPrimary || gesture.current || items.length < 2) return;
            const host = e.currentTarget as HTMLElement;
            gesture.current = {
              pointerId: e.pointerId,
              id: t.id,
              fromIndex: i,
              toIndex: i,
              startPageY: e.clientY + scrollY,
              startClientX: e.clientX,
              lastClientY: e.clientY,
              rows: [],
              armed: false,
              timer: window.setTimeout(() => arm(host), LONG_PRESS_MS),
              frame: null,
            };
          }}
          onPointerMove={(e) => {
            const g = gesture.current;
            if (!g || e.pointerId !== g.pointerId) return;
            g.lastClientY = e.clientY;
            if (g.armed) return;
            // Before the press is long enough, movement — including the page scrolling beneath the
            // finger — means this was never a reorder.
            const moved =
              Math.abs(e.clientY + scrollY - g.startPageY) + Math.abs(e.clientX - g.startClientX);
            if (moved > CANCEL_SLOP_PX) clear();
          }}
          onTouchMove={(e) => {
            // The one thing that actually stops Safari scrolling a page whose gesture has already
            // begun. Preact attaches this directly to the element, where it is not passive.
            if (gesture.current?.armed) e.preventDefault();
          }}
          onPointerUp={() => finish(true)}
          onPointerCancel={() => finish(false)}
          onLostPointerCapture={() => finish(false)}
        >
          <button
            class="task-check"
            role="checkbox"
            aria-checked="false"
            aria-label={`Complete ${t.text}`}
            onClick={() => onComplete(t)}
          >
            <Check size={14} strokeWidth={3} />
          </button>
          <button class="task-body" onClick={() => onOpen(t)} style="text-align:left">
            <div class="task-text">{t.text}</div>
            {t.notes && <div class="task-notes">{t.notes}</div>}
          </button>
          <button
            class="task-star"
            aria-pressed={t.starred}
            aria-label={t.starred ? 'Remove priority' : 'Mark priority'}
            onClick={() => onStar(t)}
          >
            <Star size={18} fill={t.starred ? 'currentColor' : 'none'} />
          </button>
        </li>
      ))}
    </ul>
  );
}
