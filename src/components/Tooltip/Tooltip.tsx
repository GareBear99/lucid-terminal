/**
 * Shared Lucid tooltip — ONE tooltip for the whole app (Gary, 2026-11-05:
 * "add hover tips for everything everywhere that are sleek and clean and
 * our platforms look").
 *
 * Sleek and clean, Lucid's look: a small opaque dark card (no blur —
 * Lucid panels are solid), a thin `var(--border)` outline, readable text,
 * and the accent used only for a keyboard shortcut. No new dependencies,
 * no network fetches, CSS-driven show/hide, no per-frame JS.
 *
 * Behaviour:
 * - Appears above the trigger by default after TOOLTIP_SHOW_DELAY_MS
 *   (so it never flashes on a casual mouse pass), disappears promptly
 *   on mouse leave, blur, click, or Escape.
 * - Flips to the opposite side when there is no room (near a screen
 *   edge) and clamps inside the viewport — see resolveTooltipPosition.
 * - Keyboard focus shows the tip too (focus = hover for tooltips).
 * - Accessible: role="tooltip", the trigger gets aria-describedby
 *   while the tip is visible. A native `title` on the child is stripped
 *   (so the browser's own tooltip never doubles up); if no `content`
 *   prop is given, the child's own title is used as the tip text.
 * - Disabled buttons never fire mouse events, so a disabled trigger
 *   simply shows no tip — callers should not wrap disabled controls.
 *
 * Usage:
 *   <Tooltip content="Open the synth view">
 *     <button onClick={...}><Icon /></button>
 *   </Tooltip>
 *
 *   <Tooltip content="New terminal tab" shortcut="Ctrl+T" placement="bottom">
 *     <button>…</button>
 *   </Tooltip>
 *
 * Positioning is measured, not guessed: the tip is rendered in a portal
 * on document.body and positioned from the trigger's bounding rect. The
 * placement maths lives in the pure resolveTooltipPosition() below so it
 * can be unit-tested without a browser.
 */
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

/** Hover delay before the tip appears — long enough that a casual mouse pass never flashes one. */
export const TOOLTIP_SHOW_DELAY_MS = 450;
/** Gap in px between the trigger and the tip. */
export const TOOLTIP_GAP_PX = 8;
/** Minimum distance in px the tip keeps from the viewport edge. */
export const TOOLTIP_EDGE_MARGIN_PX = 4;

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface TooltipViewport {
  width: number;
  height: number;
}

export interface TooltipPosition {
  placement: TooltipPlacement;
  top: number;
  left: number;
}

function fits(
  placement: TooltipPlacement,
  trigger: TooltipRect,
  tip: TooltipSize,
  viewport: TooltipViewport,
  gap: number,
): boolean {
  switch (placement) {
    case 'top':
      return trigger.top - gap - tip.height >= TOOLTIP_EDGE_MARGIN_PX;
    case 'bottom':
      return trigger.bottom + gap + tip.height <= viewport.height - TOOLTIP_EDGE_MARGIN_PX;
    case 'left':
      return trigger.left - gap - tip.width >= TOOLTIP_EDGE_MARGIN_PX;
    case 'right':
      return trigger.right + gap + tip.width <= viewport.width - TOOLTIP_EDGE_MARGIN_PX;
  }
}

function opposite(placement: TooltipPlacement): TooltipPlacement {
  switch (placement) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Pure placement resolution — where the tip goes for a given trigger rect,
 * tip size, viewport, and preferred placement. Flips to the opposite side
 * when the preferred side has no room, then clamps inside the viewport.
 * Unit-tested in tests/tooltip.test.tsx; the component only feeds it rects.
 */
export function resolveTooltipPosition(
  trigger: TooltipRect,
  tip: TooltipSize,
  viewport: TooltipViewport,
  preferred: TooltipPlacement = 'top',
  gap: number = TOOLTIP_GAP_PX,
): TooltipPosition {
  const placement = fits(preferred, trigger, tip, viewport, gap)
    ? preferred
    : fits(opposite(preferred), trigger, tip, viewport, gap)
      ? opposite(preferred)
      : preferred;

  let top: number;
  let left: number;
  switch (placement) {
    case 'top':
      top = trigger.top - gap - tip.height;
      left = trigger.left + trigger.width / 2 - tip.width / 2;
      break;
    case 'bottom':
      top = trigger.bottom + gap;
      left = trigger.left + trigger.width / 2 - tip.width / 2;
      break;
    case 'left':
      top = trigger.top + trigger.height / 2 - tip.height / 2;
      left = trigger.left - gap - tip.width;
      break;
    case 'right':
      top = trigger.top + trigger.height / 2 - tip.height / 2;
      left = trigger.right + gap;
      break;
  }

  // Clamp inside the viewport (with an edge margin). When the tip is
  // wider/taller than the viewport the clamp collapses to the margin.
  left = clamp(left, TOOLTIP_EDGE_MARGIN_PX, viewport.width - tip.width - TOOLTIP_EDGE_MARGIN_PX);
  top = clamp(top, TOOLTIP_EDGE_MARGIN_PX, viewport.height - tip.height - TOOLTIP_EDGE_MARGIN_PX);
  return { placement, top, left };
}

export interface TooltipProps {
  /** Tip text (or node). If omitted, the child's own `title` is used. */
  content?: ReactNode;
  /** Keyboard shortcut, rendered in the accent colour (e.g. "Ctrl+T"). */
  shortcut?: string;
  /** Preferred side; flips when there is no room. Default 'top'. */
  placement?: TooltipPlacement;
  /** Hover delay in ms. Default TOOLTIP_SHOW_DELAY_MS. */
  delay?: number;
  /** Exactly one element — the trigger the tip describes. */
  children: ReactElement;
}

export function Tooltip({ content, shortcut, placement = 'top', delay = TOOLTIP_SHOW_DELAY_MS, children }: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  // The child's own native title, if any, becomes the tip text when no
  // explicit content is given — and is stripped either way, so the
  // browser's own tooltip never doubles up with ours.
  const childTitle = (children.props as { title?: string }).title;
  const tipContent = content ?? childTitle ?? null;

  const clearTimer = useCallback(() => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
    setPosition(null);
  }, [clearTimer]);

  const scheduleShow = useCallback(() => {
    if (!tipContent) return;
    clearTimer();
    showTimer.current = window.setTimeout(() => setVisible(true), delay);
  }, [clearTimer, delay, tipContent]);

  // Measure the tip once it is rendered and place it. Until measured
  // the tip stays hidden (visibility, not display) so it never flashes
  // at the wrong spot.
  useEffect(() => {
    if (!visible) return;
    const triggerEl = triggerRef.current?.firstElementChild as HTMLElement | null;
    const tipEl = tipRef.current;
    if (!triggerEl || !tipEl) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();
    setPosition(
      resolveTooltipPosition(
        triggerRect,
        { width: tipRect.width, height: tipRect.height },
        { width: window.innerWidth, height: window.innerHeight },
        placement,
      ),
    );
  }, [visible, placement]);

  // Hide on Escape anywhere while the tip is up.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, hide]);

  useEffect(() => clearTimer, [clearTimer]);

  if (!tipContent) {
    // Nothing to say — render the child untouched, no wrapper at all.
    return children;
  }

  // Strip the native title (so the browser tooltip never doubles up)
  // and wire aria-describedby while the tip is visible.
  const child = cloneElement(children as ReactElement<Record<string, unknown>>, {
    title: undefined,
    ...(visible ? { 'aria-describedby': tooltipId } : {}),
  });

  return (
    <>
      <span
        ref={triggerRef}
        className="lucid-tooltip-trigger"
        onMouseEnter={scheduleShow}
        onMouseLeave={hide}
        onFocus={scheduleShow}
        onBlur={hide}
        onClick={hide}
      >
        {child}
      </span>
      {visible &&
        createPortal(
          <div
            ref={tipRef}
            id={tooltipId}
            role="tooltip"
            className="lucid-tooltip"
            data-placement={position?.placement ?? placement}
            style={
              position
                ? { top: position.top, left: position.left, visibility: 'visible' }
                : { visibility: 'hidden' }
            }
          >
            <span className="lucid-tooltip-text">{tipContent}</span>
            {shortcut && <kbd className="lucid-tooltip-shortcut">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}

export default Tooltip;
