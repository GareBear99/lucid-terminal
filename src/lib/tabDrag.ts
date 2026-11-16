/**
 * Tab detach + remount — renderer-side drag machinery (Gary,
 * 2026-11-09: drag a terminal tab outside the main window and
 * it becomes its own terminal-only screen; drag a tab near
 * another window's tab hotbar and it remounts into the detected
 * one — only ONE bar detects at a time).
 *
 * The pointer sessions on the tab strips
 * (`useTerminalTabDrag` / `useFileTabDrag`). Pointer capture
 * goes on the BAR element, not the tab element: the tab
 * unmounts at detach, and removing the capturing element
 * releases capture — the bar stays mounted for the whole drag,
 * so the session survives the detach. (The plan said the tab
 * element; the bar is the element that lives. Observable
 * behaviour is identical.)
 *
 * Main's push subscriptions live in detachPushListeners.ts
 * (kept separate: fileStore reads localStorage at module
 * level, and the TerminalTabs tests run in a node environment
 * where that crashes the import).
 *
 * The terminal drag reports moves to main, which owns the
 * session, the 16px threshold, the 300ms hold and the volley
 * arbitration. The files drag is local — Files remount is out
 * of scope (Q3) — so its threshold is checked here and the
 * detach is invoked on drop.
 */
import { useEffect, useRef, useState } from 'react';
import type { TerminalTab } from '../types';
import type { OpenFile } from '../stores/fileStore';
import { toDetachedTab, toDetachedFile, type DetachedTab, type DetachedFile } from '../types/detach';

/** Local detach threshold for the files strip (Q1, proposed 16px). */
export const FILE_DETACH_THRESHOLD_PX = 16;

/**
 * Drag-engage threshold, both strips (2026-11-16): a press
 * is a click until the pointer moves this far from the press
 * point. Past click jitter, far below the 16px detach
 * threshold — a real drag-out still fires exactly as before.
 */
export const TAB_DRAG_START_THRESHOLD_PX = 5;

/**
 * Where the drag ghost's top-left goes for a pointer position:
 * the pointer stays at the same spot within the ghost it had
 * within the tab when grabbed, so the tab lifts out from
 * under the pointer instead of jumping. Pure, so the
 * drag-out geometry is testable without a window.
 */
export function dragGhostTopLeft(
  clientX: number,
  clientY: number,
  grabOffset: { x: number; y: number },
): { x: number; y: number } {
  return { x: clientX - grabOffset.x, y: clientY - grabOffset.y };
}

/** A screen point (window.screenX/Y + client coords). */
export function screenPoint(clientX: number, clientY: number): { x: number; y: number } {
  return { x: window.screenX + clientX, y: window.screenY + clientY };
}

/** Distance a screen point is outside the window's bounds (0 inside). */
export function outsideWindowDistance(point: { x: number; y: number }): number {
  const left = window.screenX;
  const top = window.screenY;
  const right = left + window.innerWidth;
  const bottom = top + window.innerHeight;
  const dx = Math.max(left - point.x, 0, point.x - right);
  const dy = Math.max(top - point.y, 0, point.y - bottom);
  return Math.hypot(dx, dy);
}

export interface TerminalTabDrag {
  onTabPointerDown: (tab: TerminalTab, index: number, e: React.PointerEvent) => void;
  /** Bar-level handlers — spread onto the strip element. */
  barHandlers: {
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onLostPointerCapture: (e: React.PointerEvent) => void;
  };
  draggingTabId: string | null;
  /** The drag ghost: the tab lifted out of the strip, following
   *  the pointer at its grabbed spot (client coords, top-left).
   *  Null when no drag is running. The view renders it only
   *  while the tab is still in this strip — once main detaches
   *  it, the tab leaves the strip and the real window takes
   *  over following the pointer. */
  dragGhost: { tab: DetachedTab; x: number; y: number } | null;
  /** The landing spot main detected, or null. */
  dropIndicator: { index: number } | null;
}

export function useTerminalTabDrag({
  tabs,
  barRef,
}: {
  tabs: TerminalTab[];
  barRef: React.RefObject<HTMLDivElement | null>;
}): TerminalTabDrag {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ index: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ tab: DetachedTab; x: number; y: number } | null>(null);
  /**
   * A press is a CLICK until the pointer moves past this
   * (2026-11-16 — tab clicks were dead: pointer capture on
   * pointerdown retargeted pointerup, so the click fired on
   * the bar, never on the tab — "when split you cant go to
   * any other tabs". Only a press that moves past this
   * engages the drag, sets capture, and tells main. 5px is
   * past click jitter and far below main's 16px detach
   * threshold, so a real drag-out still fires exactly as
   * before — and a plain click never touches the drag
   * machinery at all, so the tab's onClick fires on the tab.
   */
  const dragRef = useRef<{
    tab: DetachedTab;
    index: number;
    pointerId: number;
    /** Press point (client coords) — the drag engages when
     *  the pointer moves past the threshold from here. */
    startX: number;
    startY: number;
    /** True once the drag engaged (capture set, main told). */
    started: boolean;
  } | null>(null);
  /** The pending-press window listeners (added on
   *  pointerdown, removed on pointerup / cancel / drag
   *  start) — they watch for the threshold crossing even
   *  when the pointer leaves the bar before capture is set
   *  (the bar's React handlers only see moves over the bar).
   *  Removed at drag start: the draggingTabId-driven window
   *  listeners + bar handlers take over from there (the
   *  dedupe would catch doubles, but a handoff is cleaner
   *  than three live move paths). */
  const pendingListenersRef = useRef<(() => void) | null>(null);
  /** Pointer position within the dragged tab at grab (the ghost
   *  and main's follow both anchor on this, so the tab stays
   *  under the pointer from lift to drop). */
  const grabOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** DIAGNOSTIC: count of pointermove reports in this drag. */
  const moveCountRef = useRef(0);
  /** Dedupe: the same native pointer event reaches both the
   *  bar's React handler and the window listener (bubble) —
   *  process it once. Keyed on type + timeStamp + coords so a
   *  zero timeStamp cannot collapse distinct moves. */
  const lastHandledKeyRef = useRef<string | null>(null);
  const alreadyHandled = (key: string): boolean => {
    if (lastHandledKeyRef.current === key) return true;
    lastHandledKeyRef.current = key;
    return false;
  };

  // Main's volley feedback: the single winning bar lights up and
  // shows the landing spot. Ignore a detect for a tab this
  // window is not dragging (a stale detect from another drag).
  useEffect(() => {
    const detach = window.lucidAPI?.terminal?.detach;
    if (!detach) return;
    const cleanups = [
      detach.onDragDetect((payload) => {
        if (dragRef.current && payload.tabId === dragRef.current.tab.id) {
          setDropIndicator({ index: payload.insertionIndex });
        }
      }),
      detach.onDragDetectClear(() => {
        setDropIndicator(null);
      }),
    ];
    return () => {
      for (const fn of cleanups) fn();
    };
  }, []);

  // Report the bar rect + tab slots to main (viewport coords;
  // main adds the window's live bounds origin). Re-reported on
  // mount, on tab changes, and whenever the bar resizes — main's
  // arbitration is only as fresh as the last report, and a stale
  // rect degrades to a plain detach, never a crash (§9).
  useEffect(() => {
    const detach = window.lucidAPI?.terminal?.detach;
    if (!detach) return;
    const bar = barRef.current;
    if (!bar) return;
    const report = () => {
      const el = barRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const slots: { id: string; x: number; width: number }[] = [];
      for (const node of el.querySelectorAll('[data-tab-id]')) {
        const r = (node as HTMLElement).getBoundingClientRect();
        const id = (node as HTMLElement).dataset.tabId;
        if (id) slots.push({ id, x: r.left, width: r.width });
      }
      detach.reportBarRect({
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        tabs: slots,
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(bar);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
    // Tabs change shape the strip; the bar element itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, barRef]);

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingTabId(null);
    setDropIndicator(null);
    setDragGhost(null);
    // The pending listeners are gone at drag start (the
    // handoff); remove them here too, so a press that ends
    // without engaging leaves nothing behind.
    pendingListenersRef.current?.();
    pendingListenersRef.current = null;
    if (drag) {
      try {
        barRef.current?.releasePointerCapture?.(drag.pointerId);
      } catch {
        // The capture was already released (tab unmounted, window moved).
      }
    }
  };

  /** Drop a press that never became a drag (a click): remove
   *  the pending listeners and forget the press. No call to
   *  main — no session was ever started, so there is nothing
   *  to end, and the click event fires normally on the tab. */
  const clearPending = () => {
    pendingListenersRef.current?.();
    pendingListenersRef.current = null;
    dragRef.current = null;
  };

  /**
   * Engage the drag (the press moved past the threshold):
   * mark the tab dragging (the opacity + the window
   * listeners), capture the pointer on the bar, and tell
   * main a session started — exactly what pointerdown used
   * to do eagerly, now only for a real drag. The pending
   * listeners hand off to the draggingTabId-driven window
   * listeners + bar handlers from here.
   */
  const startDrag = () => {
    const drag = dragRef.current;
    if (!drag || drag.started) return;
    drag.started = true;
    pendingListenersRef.current?.();
    pendingListenersRef.current = null;
    setDraggingTabId(drag.tab.id);
    let captureOk = false;
    let captureError = '';
    try {
      barRef.current?.setPointerCapture?.(drag.pointerId);
      captureOk = true;
    } catch (err) {
      // No capture (jsdom / exotic pointer): the drag still
      // reports moves while the pointer is over the bar.
      captureError = err instanceof Error ? err.name : String(err);
    }
    // DIAGNOSTIC: capture success/failure decides whether moves
    // survive past the bar/viewport edge. Sent to main's log.
    window.lucidAPI?.terminal?.detach?.dragDiag?.(
      `drag-start tab=${drag.tab.id} pointerId=${drag.pointerId} capture=${captureOk ? 'ok' : `FAILED:${captureError}`} grab=(${grabOffsetRef.current.x},${grabOffsetRef.current.y})`,
    );
    moveCountRef.current = 0;
    window.lucidAPI?.terminal?.detach?.dragStart(
      drag.tab,
      drag.index,
      grabOffsetRef.current,
    );
  };

  // Escape cancels the drag and rolls the tab back (plan §4.6).
  // Capture-phase + stopImmediatePropagation so the Terminal's
  // own Escape (agent-mode flip) does not fire mid-drag.
  useEffect(() => {
    if (!draggingTabId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      window.lucidAPI?.terminal?.detach?.dragCancel();
      endDrag();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingTabId]);

  // Window-level move/up/cancel (2026-11-13 — the leaked
  // session): the bar unmounts when the last tab detaches, which
  // releases capture and takes the bar's React handlers with
  // it — the drag then goes silent, no pointerup ever reaches
  // main, and main's poll runs forever on every cursor move.
  // Listeners on `window` survive the bar unmount: while
  // capture is held the events retarget to the bar and bubble
  // to window; after the release they target the element under
  // the cursor and still bubble to window (for a release over
  // this window). A release over another window/desktop never
  // reaches this renderer at all — main's stale-session
  // watchdog ends that session, the tab staying safely in its
  // detached window. The dedupe keeps the bar handler and the
  // window listener from double-reporting the same event.
  useEffect(() => {
    if (!draggingTabId) return;
    const onMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY, e.timeStamp);
    const onUp = (e: PointerEvent) => handleUp(e.clientX, e.clientY, e.timeStamp);
    const onCancel = (e: PointerEvent) => handleCancel(e.timeStamp);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingTabId]);

  /** Shared move/up/cancel core — the bar's React handlers and
   *  the window listeners above both feed it (dedupe by event).
   *  A press is a click until it moves past the threshold:
   *  handleMove engages the drag on the first move past it
   *  (and only then reports to main / shows the ghost), and
   *  handleUp/handleCancel silently drop a press that never
   *  engaged — no session was started, so main is never told,
   *  and the click event fires normally on the tab. */
  const handleMove = (clientX: number, clientY: number, timeStamp: number) => {
    if (!dragRef.current) return;
    if (!dragRef.current.started) {
      // Not a drag yet: engage only past the threshold, so a
      // plain click never touches the drag machinery.
      const dx = clientX - dragRef.current.startX;
      const dy = clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) <= TAB_DRAG_START_THRESHOLD_PX) return;
      startDrag();
      if (!dragRef.current) return;
    }
    if (alreadyHandled(`move:${timeStamp}:${clientX}:${clientY}`)) return;
    moveCountRef.current += 1;
    // DIAGNOSTIC: first move only — proves the handler fires
    // at all; main's log carries every move it receives.
    if (moveCountRef.current === 1) {
      window.lucidAPI?.terminal?.detach?.dragDiag?.(
        `first-move client=(${clientX},${clientY})`,
      );
    }
    window.lucidAPI?.terminal?.detach?.dragMove(clientX, clientY);
    // The ghost lifts with the first move (a plain click has no
    // move, so it never flashes) and follows the pointer at the
    // grabbed spot until the drop or the cancel.
    const topLeft = dragGhostTopLeft(clientX, clientY, grabOffsetRef.current);
    setDragGhost({ tab: dragRef.current.tab, x: topLeft.x, y: topLeft.y });
  };

  const handleUp = (clientX: number, clientY: number, timeStamp: number) => {
    if (!dragRef.current) return;
    if (!dragRef.current.started) {
      // A click, not a drag: forget the press silently — no
      // session was started, so main gets no drag-end, and the
      // click event fires normally on the tab.
      clearPending();
      return;
    }
    if (alreadyHandled(`up:${timeStamp}:${clientX}:${clientY}`)) return;
    // DIAGNOSTIC: move count + last point — if this line never
    // lands in main's log, pointerup never reached the renderer
    // (released outside the window) and the session hangs.
    window.lucidAPI?.terminal?.detach?.dragDiag?.(
      `pointerup moves=${moveCountRef.current} last=(${clientX},${clientY})`,
    );
    window.lucidAPI?.terminal?.detach?.dragEnd(clientX, clientY);
    endDrag();
  };

  const handleCancel = (timeStamp: number) => {
    if (!dragRef.current) return;
    if (!dragRef.current.started) {
      // A cancelled press that never became a drag: same as a
      // click — forget it silently.
      clearPending();
      return;
    }
    if (alreadyHandled(`cancel:${timeStamp}`)) return;
    window.lucidAPI?.terminal?.detach?.dragDiag?.(
      `pointercancel moves=${moveCountRef.current}`,
    );
    window.lucidAPI?.terminal?.detach?.dragCancel();
    endDrag();
  };

  const onTabPointerDown = (tab: TerminalTab, index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // The close X, the rename input, the + button: not drags.
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select')) return;
    const detach = window.lucidAPI?.terminal?.detach;
    if (!detach) {
      // DIAGNOSTIC (2026-11-13): the detach API is missing in
      // this renderer — the drag cannot start at all.
      return;
    }
    const bar = barRef.current;
    if (!bar) return;
    const detachedTab = toDetachedTab(tab);
    // Record the press — DO NOT engage the drag yet (2026-11-16:
    // engaging here set pointer capture on the bar, which
    // retargeted pointerup, so the click fired on the bar and
    // the tab's onClick never ran — every tab click was dead).
    // A press is a click until it moves past the threshold;
    // handleMove engages it then. The grab offset: the
    // pointer's spot within the tab. The ghost anchors on it,
    // and main anchors the detached window on it, so the tab
    // stays under the pointer from lift to drop.
    // currentTarget is the tab element (the handler is attached
    // to it); in jsdom the rect is zeros, so the offset is just
    // the pointer position there.
    const rect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    grabOffsetRef.current = rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : { x: 0, y: 0 };
    dragRef.current = {
      tab: detachedTab,
      index,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    };
    // Pending-press window listeners: they watch for the
    // threshold crossing even when the pointer leaves the bar
    // before capture is set (the bar's React handlers only see
    // moves over the bar). They hand off at drag start (the
    // draggingTabId-driven listeners + bar handlers take over)
    // and are removed on pointerup / cancel. The dedupe in
    // handleMove/handleUp keeps the bar handler and these
    // listeners from double-reporting the same event.
    const onMove = (ev: PointerEvent) => handleMove(ev.clientX, ev.clientY, ev.timeStamp);
    const onUp = (ev: PointerEvent) => handleUp(ev.clientX, ev.clientY, ev.timeStamp);
    const onCancel = (ev: PointerEvent) => handleCancel(ev.timeStamp);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    pendingListenersRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    moveCountRef.current = 0;
  };

  const barHandlers = {
    onPointerMove: (e: React.PointerEvent) => handleMove(e.clientX, e.clientY, e.timeStamp),
    onPointerUp: (e: React.PointerEvent) => handleUp(e.clientX, e.clientY, e.timeStamp),
    onPointerCancel: (e: React.PointerEvent) => handleCancel(e.timeStamp),
    onLostPointerCapture: () => {
      if (!dragRef.current) return;
      // 2026-11-13: capture is lost when the bar unmounts (last
      // tab detached) — the drag is NOT over. The window
      // listeners keep reporting until pointerup, so this no
      // longer cancels the drag; main's stale-session watchdog
      // is the backstop if they fail too.
      window.lucidAPI?.terminal?.detach?.dragDiag?.(
        `lostpointercapture moves=${moveCountRef.current} (drag continues)`,
      );
    },
  };

  return { onTabPointerDown, barHandlers, draggingTabId, dragGhost, dropIndicator };
}

export interface FileTabDrag {
  onFileTabPointerDown: (file: OpenFile, e: React.PointerEvent) => void;
  barHandlers: {
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onLostPointerCapture: (e: React.PointerEvent) => void;
  };
  draggingPath: string | null;
}

/**
 * Files detach (Gary, 2026-11-09 — Files gets the same detach
 * natively, with the regular theme). The threshold is checked
 * HERE (no remount arbitration for files — Q3): on drop, if the
 * pointer left the window by more than the threshold, the caller
 * invokes files:detach and, only on ok, drops the file locally.
 * A refused detach keeps the file exactly where it was.
 */
export function useFileTabDrag({
  onDetach,
  barRef,
}: {
  onDetach: (file: DetachedFile, dropPoint: { x: number; y: number }) => void;
  barRef: React.RefObject<HTMLDivElement | null>;
}): FileTabDrag {
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const dragRef = useRef<{
    file: DetachedFile;
    armed: boolean;
    pointerId: number;
    /** Press point (client coords) — the drag engages when
     *  the pointer moves past the threshold from here. */
    startX: number;
    startY: number;
    /** True once the drag engaged (capture set). */
    started: boolean;
  } | null>(null);
  /** The pending-press window listeners (same pattern as the
   *  terminal drag: the bar's React handlers only see moves
   *  over the bar, so the threshold crossing needs window
   *  listeners until capture is set). */
  const pendingListenersRef = useRef<(() => void) | null>(null);

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingPath(null);
    pendingListenersRef.current?.();
    pendingListenersRef.current = null;
    if (drag) {
      try {
        barRef.current?.releasePointerCapture?.(drag.pointerId);
      } catch {
        // Already released.
      }
    }
  };

  /** Drop a press that never became a drag (a click): forget
   *  it silently, so the file tab's onClick fires on the tab
   *  (the same pointer-capture bug as the terminal strip —
   *  2026-11-16 — broke file-tab clicks too). */
  const clearPending = () => {
    pendingListenersRef.current?.();
    pendingListenersRef.current = null;
    dragRef.current = null;
  };

  /** Engage the drag (the press moved past the threshold):
   *  mark the file dragging and capture the pointer on the
   *  strip — exactly what pointerdown used to do eagerly,
   *  now only for a real drag. */
  const startDrag = () => {
    const drag = dragRef.current;
    if (!drag || drag.started) return;
    drag.started = true;
    pendingListenersRef.current?.();
    pendingListenersRef.current = null;
    setDraggingPath(drag.file.path);
    try {
      // Capture on the strip (set by the view via barRef below).
      barRef.current?.setPointerCapture?.(drag.pointerId);
    } catch {
      // No capture: moves still report while over the strip.
    }
  };

  /** The move core shared by the bar handler and the pending
   *  window listener: engage past the threshold, then arm the
   *  detach once the pointer leaves the window by the detach
   *  threshold. */
  const handleMove = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.started) {
      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;
      if (Math.hypot(dx, dy) <= TAB_DRAG_START_THRESHOLD_PX) return;
      startDrag();
    }
    // startDrag never clears the ref, but re-read it (the
    // narrowing above does not survive the block).
    const current = dragRef.current;
    if (!current) return;
    if (
      !current.armed &&
      outsideWindowDistance(screenPoint(clientX, clientY)) > FILE_DETACH_THRESHOLD_PX
    ) {
      current.armed = true;
    }
  };

  const onFileTabPointerDown = (file: OpenFile, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select')) return;
    if (!window.lucidAPI?.filesDetach) return;
    // Record the press — DO NOT engage the drag yet (same
    // 2026-11-16 pointer-capture bug as the terminal strip:
    // capture on pointerdown retargeted the click to the bar,
    // so the file tab's onClick never ran). A press is a click
    // until it moves past the threshold.
    dragRef.current = {
      file: toDetachedFile(file),
      armed: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    };
    const onMove = (ev: PointerEvent) => handleMove(ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.started) {
        clearPending();
        return;
      }
      const armed = drag.armed;
      const f = drag.file;
      const point = screenPoint(ev.clientX, ev.clientY);
      endDrag();
      if (armed) onDetach(f, point);
    };
    const onCancel = () => {
      if (!dragRef.current) return;
      if (!dragRef.current.started) {
        clearPending();
        return;
      }
      endDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    pendingListenersRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  };

  const barHandlers = {
    onPointerMove: (e: React.PointerEvent) => {
      handleMove(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.started) {
        // A click, not a drag: forget the press silently.
        clearPending();
        return;
      }
      const armed = drag.armed;
      const file = drag.file;
      const point = screenPoint(e.clientX, e.clientY);
      endDrag();
      if (armed) onDetach(file, point);
    },
    onPointerCancel: () => {
      if (!dragRef.current) return;
      if (!dragRef.current.started) {
        clearPending();
        return;
      }
      endDrag();
    },
    onLostPointerCapture: () => {
      if (!dragRef.current) return;
      if (!dragRef.current.started) {
        clearPending();
        return;
      }
      endDrag();
    },
  };

  return { onFileTabPointerDown, barHandlers, draggingPath };
}

