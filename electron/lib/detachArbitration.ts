/**
 * Pure drop-target arbitration for tab detach + remount (Gary,
 * 2026-11-09 — only ONE bar detects at a time, no stacking).
 *
 * Dependency-free: the main process imports this, and the unit
 * tests import it directly. No Electron, no DOM, no React — just
 * rect math, so the single-detection rule is provable without a
 * window.
 *
 * Screen coords throughout: the caller adds each window's live
 * bounds origin to the viewport rects the renderers report.
 */

export interface ScreenBar {
  /** WebContents id of the window that owns this bar. */
  windowId: number;
  /** Screen rect of the bar. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tab slots in strip order (screen coords). */
  tabs: { id: string; x: number; width: number }[];
  /** False for minimized / hidden windows — their bars can never
   *  be a target (Q6: built as excluded, Gary's call to change). */
  visible: boolean;
  /** Last focus time (ms since epoch) — the most recently focused
   *  window wins among several bars the pointer is inside. */
  focusedAt: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Euclidean distance from a point to a rect (0 when inside). */
export function distanceToRect(p: ScreenPoint, r: { x: number; y: number; width: number; height: number }): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

function isInside(p: ScreenPoint, r: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/**
 * Pick the single drop target for a pointer position.
 *
 * - The tab's current owner window is never a candidate (a drop
 *   onto its own bar is a no-op, not a remount).
 * - Minimized / hidden windows are never candidates.
 * - A bar the pointer is actually INSIDE beats a merely-near bar;
 *   among several inside, the most recently focused wins;
 *   among several merely-near, the nearest wins.
 * - Returns null when no bar is a candidate.
 */
export function pickDropTarget(
  point: ScreenPoint,
  bars: ScreenBar[],
  ownerWindowId: number,
  proximityPx: number,
): { windowId: number; inside: boolean } | null {
  let bestInside: ScreenBar | null = null;
  let bestNear: ScreenBar | null = null;
  let bestNearDistance = Infinity;
  for (const bar of bars) {
    if (bar.windowId === ownerWindowId) continue;
    if (!bar.visible) continue;
    if (isInside(point, bar)) {
      if (!bestInside || bar.focusedAt > bestInside.focusedAt) bestInside = bar;
      continue;
    }
    const d = distanceToRect(point, bar);
    if (d <= proximityPx && d < bestNearDistance) {
      bestNear = bar;
      bestNearDistance = d;
    }
  }
  if (bestInside) return { windowId: bestInside.windowId, inside: true };
  if (bestNear) return { windowId: bestNear.windowId, inside: false };
  return null;
}

/**
 * Where the tab lands in a bar: the tab slot nearest the pointer's
 * x — the count of tabs whose centre is left of the pointer,
 * clamped to 0..tabs.length. The marker shows BEFORE the drop.
 */
export function insertionIndexFor(pointX: number, bar: ScreenBar): number {
  let index = 0;
  for (const tab of bar.tabs) {
    if (pointX >= tab.x + tab.width / 2) index++;
    else break;
  }
  return Math.max(0, Math.min(bar.tabs.length, index));
}

/**
 * How far outside a window's bounds a point is (0 when inside).
 * The detach threshold compares this against DETACH_THRESHOLD_PX:
 * the pointer must leave the source window by more than the
 * threshold before the tab pulls out.
 */
export function outsideDistance(p: ScreenPoint, bounds: { x: number; y: number; width: number; height: number }): number {
  return distanceToRect(p, bounds);
}

export interface DetachSpawnInput {
  /** Last persisted bounds for this tab/file, if any. */
  stored: { x: number; y: number; width: number; height: number } | null;
  /** The drop point in screen coords (the drag-out point), or null
   *  when this is a restore rather than a drag-out. */
  dropPoint: ScreenPoint | null;
  /** Offset from the drop point to the window's top-left — the
   *  grab offset, so the tab stays under the pointer. Defaults
   *  to centring the window on the drop point. */
  spawnOffset?: ScreenPoint | null;
  /** Default bounds when nothing is stored and there is no drop point. */
  defaultBounds: { x: number; y: number; width: number; height: number };
}

/**
 * Where a detached window spawns (Gary, 2026-11-14 — the
 * drag-out glitch: a tab pulled out must appear under the
 * cursor, not at a remembered spot).
 *
 * A drag-out ALWAYS spawns at the drop point — stored bounds
 * never override it. Stored bounds are only a fallback for a
 * restore with no drop point (no caller passes null today;
 * both terminal and files detaches always carry the point).
 * The caller clamps the result onto the display and enforces
 * the minimum size; this function is pure rect math.
 */
export function resolveDetachSpawnBounds(input: DetachSpawnInput): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { stored, dropPoint, defaultBounds } = input;
  if (dropPoint) {
    const w = defaultBounds.width;
    const h = defaultBounds.height;
    const off = input.spawnOffset ?? { x: w / 2, y: h / 2 };
    return {
      x: Math.round(dropPoint.x - off.x),
      y: Math.round(dropPoint.y - off.y),
      width: w,
      height: h,
    };
  }
  if (stored) return { ...stored };
  return { ...defaultBounds };
}

/**
 * Where a detached window goes while the drag is still running:
 * the same offset from the pointer it had at detach, so the tab
 * stays under the pointer until the drop. The caller clamps the
 * result onto the display.
 */
export function followOrigin(point: ScreenPoint, followOffset: ScreenPoint): ScreenPoint {
  return { x: Math.round(point.x - followOffset.x), y: Math.round(point.y - followOffset.y) };
}

/**
 * Whether a main-side poll point may drive a drag session
 * (Gary, 2026-11-14 — round 2: the poll reads the REAL cursor,
 * which is only the drag pointer when the renderer is silent).
 *
 * The incident: a test drag was live while Gary moved his real
 * mouse, and the poll fed his cursor into the session while the
 * renderer's drag-move stream fed the dispatched pointer — the
 * detached window teleported between two pointers thousands of
 * pixels apart. One stream must win:
 *
 * - While the renderer reports moves (silentMs at or under the
 *   threshold), the poll is redundant and must not drive
 *   anything — the drag-move stream is the pointer.
 * - Once the renderer has been silent past the threshold, the
 *   poll is the only signal left (the edge-crossing fallback:
 *   capture failed, the renderer went quiet, the real cursor is
 *   the pointer) — but a poll point is only accepted when it
 *   agrees with the last authoritative point within the
 *   tolerance. A far jump means the real cursor is NOT the drag
 *   pointer (a leaked session while Gary works elsewhere), so
 *   the point is dropped and the window never chases it. A null
 *   last point means no move ever arrived — the poll is the only
 *   signal there is, so it is accepted.
 *
 * The tolerance covers a fast flick during the silence gap
 * (4500 px/s × ~130 ms ≈ 600 px) with margin, and still
 * rejects incident-scale jumps (~2400 px).
 */
export function shouldAcceptPollPoint(input: {
  /** ms since the renderer's last drag event. */
  silentMs: number;
  /** Renderer silence that hands the poll the wheel. */
  silenceThresholdMs: number;
  /** The poll's screen point (the real cursor). */
  point: ScreenPoint;
  /** The last point the authoritative stream drove, or null. */
  lastPoint: ScreenPoint | null;
  /** Max jump from the last authoritative point a poll point may make. */
  tolerancePx: number;
}): boolean {
  if (input.silentMs <= input.silenceThresholdMs) return false;
  if (!input.lastPoint) return true;
  const dx = input.point.x - input.lastPoint.x;
  const dy = input.point.y - input.lastPoint.y;
  return Math.hypot(dx, dy) <= input.tolerancePx;
}

/**
 * Where a dragged detached window goes while the drag is still
 * running (Gary, 2026-11-14 — round 2: the old workArea clamp
 * forced the WHOLE window on-screen, so at the bottom/left edge
 * the window jumped to the middle of the screen instead of
 * staying under the cursor — the tab was hundreds of pixels from
 * the pointer at the very moment it detached).
 *
 * The tab must stay under the pointer: only keep a visible strip
 * of the window on-screen (so it stays grabbable and the drop
 * lands where the cursor is), never shove the whole window in.
 * Mid-screen this is a no-op — the window moves 1:1 with the
 * pointer exactly as before.
 */
export function clampDragFollowOrigin(
  origin: ScreenPoint,
  size: { width: number; height: number },
  area: { x: number; y: number; width: number; height: number },
  minVisiblePx: number,
): ScreenPoint {
  const minX = area.x - (size.width - minVisiblePx);
  const maxX = area.x + area.width - minVisiblePx;
  const minY = area.y - (size.height - minVisiblePx);
  const maxY = area.y + area.height - minVisiblePx;
  return {
    x: Math.round(Math.min(Math.max(origin.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(origin.y, minY), maxY)),
  };
}
