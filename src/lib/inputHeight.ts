import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Prompt / AI-chat input sizing.
 *
 * Default cap: one-third of the page (33.33vh). The bubble grows
 * upward with the content up to this cap, then scrolls — so long
 * input stays readable without swallowing the terminal.
 *
 * Drag: a handle on the bubble's top edge lets the user drag it
 * taller or shorter, up to the drag max of half the page (50vh).
 * The dragged height is a cap: it sets how tall the bubble is
 * allowed to grow. The bubble hugs the content in both directions —
 * it grows with the content up to the dragged cap, then scrolls, and
 * it regresses to fit the content when the content shrinks, so it is
 * never stuck tall after deleting text. Dragging shorter than the
 * 33.33vh default lowers the cap accordingly. During an active drag
 * the bubble follows the pointer directly.
 */
export const INPUT_DEFAULT_HEIGHT_VH = 33.33;
export const INPUT_DRAG_MAX_HEIGHT_VH = 50;
export const INPUT_MIN_HEIGHT_PX = 40;

/** Whole-pixel cap for a vh fraction of the viewport. */
export function inputCapPx(viewportHeightPx: number, capVh: number): number {
  return Math.floor(viewportHeightPx * (capVh / 100));
}

/** Clamp a dragged height between the one-line floor and the 50vh drag max. */
export function clampDraggedHeightPx(
  px: number,
  viewportHeightPx: number,
): number {
  const maxPx = inputCapPx(viewportHeightPx, INPUT_DRAG_MAX_HEIGHT_VH);
  return Math.max(INPUT_MIN_HEIGHT_PX, Math.min(px, maxPx));
}

/**
 * Resolve the bubble height in pixels.
 *
 * - Never dragged: grow with the content up to the 33.33vh default cap.
 * - Dragged: the dragged height is a cap (ceiling) — the bubble fits
 *   the content up to it, and regresses to fit the content when the
 *   content shrinks, so it is never stuck tall. Dragging sets how tall
 *   it may grow (up to the 50vh drag max); dragging shorter than the
 *   default cap lowers the cap. Then scroll past the cap.
 * - While dragging: the bubble follows the pointer directly (clamped).
 */
export function resolveInputHeightPx(
  contentHeightPx: number,
  draggedHeightPx: number | null,
  viewportHeightPx: number,
  isDragging = false,
): number {
  if (isDragging && draggedHeightPx !== null) {
    return clampDraggedHeightPx(draggedHeightPx, viewportHeightPx);
  }
  if (draggedHeightPx !== null) {
    // Dragged height is a cap, not a floor: fit the content up to it,
    // and regress to the content when the content shrinks, so the
    // bubble is never stuck tall after deleting text.
    const draggedCapPx = clampDraggedHeightPx(
      draggedHeightPx,
      viewportHeightPx,
    );
    return Math.max(
      INPUT_MIN_HEIGHT_PX,
      Math.min(contentHeightPx, draggedCapPx),
    );
  }
  const defaultCapPx = inputCapPx(
    viewportHeightPx,
    INPUT_DEFAULT_HEIGHT_VH,
  );
  return Math.max(
    INPUT_MIN_HEIGHT_PX,
    Math.min(contentHeightPx, defaultCapPx),
  );
}

/**
 * Drag state for an input bubble. The handle's pointerdown starts a
 * drag; pointermove resizes (dragging up grows the bubble, dragging
 * down shrinks it); pointerup ends it. The dragged height persists
 * as a cap after the drag ends. Pointer events cover mouse and
 * touch; the handle sets touch-action: none so the browser does not
 * scroll while dragging.
 *
 * No flash to the old cap (Gary, 2026-11-09 — "the drag to extend
 * also flashes full extend"): the height WHILE dragging is a
 * separate in-drag value, seeded from the CURRENT on-screen height
 * at pointerdown — never the persisted dragged cap. The old code
 * exposed the persisted cap during the drag, so the pointerdown
 * re-render (isDragging=true, no move yet) jumped the bubble
 * straight to the old cap — up to the 50vh max — for a frame (or
 * until the first pointermove). The in-drag height is committed as
 * the new cap on pointerup ONLY if the pointer actually moved, so
 * a grab-and-release without moving changes nothing.
 */
export function useDraggableInputHeight() {
  const [draggedHeightPx, setDraggedHeightPx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Height the bubble is at WHILE dragging — seeded from the current
  // on-screen height at drag start, then following the pointer.
  const [activeDragHeightPx, setActiveDragHeightPx] = useState<
    number | null
  >(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  // Ref mirror of the in-drag height (state may not have flushed by
  // pointerup) + whether the pointer moved at all this drag.
  const activeDragHeightRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const heightRef = useRef(INPUT_MIN_HEIGHT_PX);

  // Keep the current on-screen height so a drag starts from it.
  const noteHeight = useCallback((px: number) => {
    heightRef.current = px;
  }, []);

  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: heightRef.current };
      // Seed the in-drag height from the CURRENT on-screen height, so
      // the first dragged frame shows where the bubble already is —
      // never a jump to the old dragged cap.
      const startHeight = clampDraggedHeightPx(
        heightRef.current,
        window.innerHeight,
      );
      activeDragHeightRef.current = startHeight;
      setActiveDragHeightPx(startHeight);
      dragMovedRef.current = false;
      setIsDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom and some browsers lack setPointerCapture; the window
        // listeners below still receive the moves.
      }
      const onMove = (ev: PointerEvent) => {
        const st = dragRef.current;
        if (!st) return;
        dragMovedRef.current = true;
        const next = clampDraggedHeightPx(
          st.startHeight + (st.startY - ev.clientY),
          window.innerHeight,
        );
        activeDragHeightRef.current = next;
        setActiveDragHeightPx(next);
      };
      const onUp = () => {
        // Commit the dragged height as the new cap ONLY if the
        // pointer actually moved — a grab-and-release without moving
        // leaves the old cap untouched.
        if (dragMovedRef.current && activeDragHeightRef.current !== null) {
          setDraggedHeightPx(activeDragHeightRef.current);
        }
        dragRef.current = null;
        activeDragHeightRef.current = null;
        setActiveDragHeightPx(null);
        setIsDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [],
  );

  return {
    // While dragging, the exposed height is the in-drag height
    // (seeded from the on-screen height); at rest it is the
    // persisted dragged cap.
    draggedHeightPx: isDragging ? activeDragHeightPx : draggedHeightPx,
    isDragging,
    onDragHandlePointerDown,
    noteHeight,
  };
}
