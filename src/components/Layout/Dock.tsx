/**
 * Dock (Atom steal #12 — 2026-11-14).
 *
 * One edge of the window (left, right, bottom): a mask that
 * animates 0↔N px, a chevron toggle at the window edge, and a
 * resize handle. The dock's visibility + size live in the
 * dock store; this component renders one edge around its
 * children.
 *
 * Behaviour, Atom's rules in Lucid's shape:
 * - Open animates: the content mounts at 0 and grows to the
 *   store size on the next frame, so the CSS transition runs.
 * - Close animates the other way, then unmounts the children
 *   after the transition (150 ms) — the panel's lifecycle is
 *   exactly as before (unmounted while hidden, like the AI
 *   panel's old `{showAI && ...}` gate), only the close is
 *   150 ms later.
 * - The resize handle drags like the AI panel's old handle
 *   and the split divider: mousedown captures the start,
 *   moves track on the document, mouseup cleans up; each move
 *   recomputes from the captured start size plus the total
 *   pointer delta, never incrementally. During a drag the
 *   transition is off, so the dock follows the pointer.
 * - Hiding while focused returns focus to the center: the
 *   focused element inside the dock is blurred on hide.
 * - Empty auto-hide: with no children the dock renders only
 *   its edge toggle — the dock never eats space for nothing.
 *
 * The toggle strip is a slim always-visible chevron, not
 * Atom's hover-revealed one: Lucid's panels already have
 * their own toggles (StatusBar AI button, toolbar icons), so
 * the strip is a third affordance, kept visible so it can be
 * found. The panel's own close button (the AI panel's X)
 * still hides it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useDockStore,
  DOCK_ANIMATION_MS,
  DOCK_MIN_SIZE,
  type DockEdge,
} from '../../stores/dockStore';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

interface DockProps {
  /** Which edge of the window this dock sits on. */
  edge: DockEdge;
  /** The panel inside the dock. */
  children: ReactNode;
  /** Accessible label for the edge toggle (e.g. 'AI Panel'). */
  label: string;
}

const EDGE_CHEVRON = {
  left: { show: ChevronRight, hide: ChevronLeft },
  right: { show: ChevronLeft, hide: ChevronRight },
  bottom: { show: ChevronUp, hide: ChevronDown },
} as const;

export function Dock({ edge, children, label }: DockProps) {
  const dock = useDockStore((s) => s.docks[edge]);
  const showDock = useDockStore((s) => s.showDock);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderChildren, setRenderChildren] = useState(dock.visible);
  const [size, setSize] = useState(dock.visible ? dock.size : 0);
  const [dragging, setDragging] = useState(false);

  // Open/close animation + lifecycle: mount at 0 and grow on
  // the next frame; on close, shrink and unmount after the
  // transition. A resize while open follows the store size.
  useEffect(() => {
    if (dock.visible) {
      setRenderChildren(true);
      setSize(0);
      const raf = requestAnimationFrame(() => setSize(dock.size));
      return () => cancelAnimationFrame(raf);
    }
    // Hiding while focused returns focus to the center.
    if (containerRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    setSize(0);
    const timer = setTimeout(() => setRenderChildren(false), DOCK_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [dock.visible]);

  useEffect(() => {
    if (dock.visible) setSize(dock.size);
  }, [dock.size, dock.visible]);

  const horizontal = edge !== 'bottom';
  const hasChildren = children !== null && children !== undefined;
  const ShowIcon = EDGE_CHEVRON[edge].show;

  // The drag: capture the start size + pointer, recompute from
  // the total delta each move (never incrementally), clamp to
  // [100, container - 200] so the center always keeps room.
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current?.parentElement;
    const rect = container?.getBoundingClientRect();
    // jsdom (and a dock whose parent has no size yet) reports a
    // 0 rect — fall back to the window so the handle never goes
    // dead for want of layout.
    const rectLength = horizontal ? rect?.width ?? 0 : rect?.height ?? 0;
    const length = rectLength > 0 ? rectLength : horizontal ? window.innerWidth : window.innerHeight;
    if (length <= 0) return;
    const startClient = horizontal ? e.clientX : e.clientY;
    const startSize = dock.size;
    const max = Math.max(DOCK_MIN_SIZE, length - 200);
    // Right/bottom docks grow toward the pointer's negative
    // direction (dragging left/up grows them); the left dock
    // grows the other way.
    const sign = edge === 'left' ? 1 : -1;
    setDragging(true);
    const onMouseMove = (ev: MouseEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - startClient) * sign;
      const next = Math.min(max, Math.max(DOCK_MIN_SIZE, startSize + delta));
      useDockStore.getState().setDockSize(edge, next);
    };
    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // No children: only the edge toggle, never an empty dock.
  if (!hasChildren) {
    return (
      <div
        data-testid={`dock-${edge}`}
        className={`shrink-0 flex ${horizontal ? 'flex-col justify-center' : 'flex-row justify-center'}`}
      >
        <button
          data-testid={`dock-toggle-${edge}`}
          title={`Show ${label}`}
          aria-label={`Show ${label}`}
          onClick={() => showDock(edge)}
          className="flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded p-0.5"
        >
          <ShowIcon size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid={`dock-${edge}`}
      className={`shrink-0 flex ${horizontal ? 'flex-row' : 'flex-col'}`}
    >
      {edge === 'bottom' && renderChildren && (
        <div
          data-testid={`dock-resize-${edge}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize ${label}`}
          className="h-1 w-full shrink-0 cursor-row-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors"
          onMouseDown={onResizeMouseDown}
        />
      )}
      {edge === 'left' && renderChildren && (
        <div
          data-testid={`dock-resize-${edge}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
          className="order-2 w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors"
          onMouseDown={onResizeMouseDown}
        />
      )}
      {edge === 'right' && renderChildren && (
        <div
          data-testid={`dock-resize-${edge}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors"
          onMouseDown={onResizeMouseDown}
        />
      )}
      <div
        className="overflow-hidden"
        style={{
          ...(horizontal
            ? { width: renderChildren ? size : 0, height: '100%' }
            : { height: renderChildren ? size : 0, width: '100%' }),
          transition: dragging
            ? 'none'
            : horizontal
              ? `width ${DOCK_ANIMATION_MS}ms ease`
              : `height ${DOCK_ANIMATION_MS}ms ease`,
        }}
      >
        {renderChildren && (
          <div
            className={`h-full ${edge === 'left' ? 'border-r' : edge === 'right' ? 'border-l' : 'border-t'} border-[var(--border)]`}
            style={horizontal ? { width: dock.size } : { height: dock.size }}
          >
            {children}
          </div>
        )}
      </div>
      {!dock.visible && (
        <div className={`shrink-0 flex ${horizontal ? 'flex-col justify-center' : 'flex-row justify-center'}`}>
          <button
            data-testid={`dock-toggle-${edge}`}
            title={`Show ${label}`}
            aria-label={`Show ${label}`}
            onClick={() => showDock(edge)}
            className="flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded p-0.5"
          >
            <ShowIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
