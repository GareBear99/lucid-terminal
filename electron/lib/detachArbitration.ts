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
