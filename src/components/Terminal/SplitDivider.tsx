/**
 * SplitDivider — the draggable boundary between two split panes.
 *
 * The drag mirrors the AI panel's resize handle (App.tsx): mousedown
 * captures the start, moves track on the document, mouseup cleans
 * up. Each move recomputes from the sizes captured at mousedown
 * plus the total pointer delta as a percentage of the NODE's size
 * — never incrementally, so there is no drift. The math
 * (conserve the pair's combined width, clamp each pane to 15–85%)
 * lives in computePaneSizesAfterDrag (splitPaneStore.ts).
 *
 * PaneAxis tree: a divider belongs to
 * ONE split node, not to a flat group position — it carries the
 * node's id and the node's direction. A vertical node (side by
 * side) drags on the pointer's X against the node's width; a
 * horizontal node (stacked) drags on Y against the node's height.
 * The drag always moves boundary 0 of the node's pair.
 *
 * STABLE PANE HOMES (2026-11-16, audit item i): the divider is
 * an absolutely-positioned sibling of the pane homes, anchored
 * to the terminal container (its parentElement). It carries the
 * split node's own rect (fractions of the container, from
 * computeSplitLayout) and the boundary within it, so it can
 * position itself at the boundary and measure the drag against
 * the NODE's pixel size (node rect × container size) — not the
 * container's size, which would be wrong for nested nodes.
 *
 * Keyboard resize is not built: the divider is mouse-only for now,
 * like the AI panel handle. The panes are still fully usable
 * without it — equal widths until dragged.
 */
import { useSplitPaneStore, computePaneSizesAfterDrag, findSplitNode } from '../../stores/splitPaneStore';
import type { SplitDirection, SplitLayoutRect } from '../../stores/splitPaneStore';

interface SplitDividerProps {
  /** The split group this divider belongs to. */
  groupId: string;
  /** The split node this divider is the boundary of. */
  nodeId: string;
  /** The node's direction: 'vertical' drags on X, 'horizontal' on Y. */
  direction: SplitDirection;
  /** The split node's own rect, as fractions of the terminal
   *  container (from computeSplitLayout). Positions the divider
   *  and sizes the drag. */
  nodeRect: SplitLayoutRect;
  /** The boundary within the node rect (0..1) — the first child's
   *  share (sizes[0] / 100). */
  boundary: number;
}

export function SplitDivider({ groupId, nodeId, direction, nodeRect, boundary }: SplitDividerProps) {
  const group = useSplitPaneStore((s) => s.groups[groupId]);

  const horizontal = direction === 'horizontal';
  // Absolute position at the boundary, centred on it (4 px thick,
  // 2 px each side — the same thickness as the old flex divider).
  const style: React.CSSProperties = horizontal
    ? {
        position: 'absolute',
        left: `${nodeRect.left * 100}%`,
        top: `calc(${(nodeRect.top + nodeRect.height * boundary) * 100}% - 2px)`,
        width: `${nodeRect.width * 100}%`,
        height: 4,
      }
    : {
        position: 'absolute',
        left: `calc(${(nodeRect.left + nodeRect.width * boundary) * 100}% - 2px)`,
        top: `${nodeRect.top * 100}%`,
        width: 4,
        height: `${nodeRect.height * 100}%`,
      };

  return (
    <div
      data-testid={`split-divider-${groupId}-${nodeId}`}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label="Resize split panes"
      style={style}
      className={
        horizontal
          ? 'shrink-0 cursor-row-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors'
          : 'shrink-0 cursor-col-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors'
      }
      onMouseDown={(e) => {
        if (!group) return;
        const node = findSplitNode(group, nodeId);
        if (!node || node.type !== 'split') return;
        e.preventDefault();
        // The parent is the terminal container (relative). The
        // node's pixel size is its fractional size × the
        // container's — a nested node's drag is against ITS size,
        // not the container's.
        const container = (e.currentTarget as HTMLElement).parentElement;
        const startClient = horizontal ? e.clientY : e.clientX;
        const startSizes = node.sizes;
        const rect = container?.getBoundingClientRect();
        const containerLength = horizontal ? rect?.height ?? 0 : rect?.width ?? 0;
        const nodeFraction = horizontal ? nodeRect.height : nodeRect.width;
        const length = containerLength * nodeFraction;
        if (length <= 0) return;

        const onMouseMove = (ev: MouseEvent) => {
          const deltaPct = (((horizontal ? ev.clientY : ev.clientX) - startClient) / length) * 100;
          useSplitPaneStore
            .getState()
            .setSplitSizes(groupId, nodeId, computePaneSizesAfterDrag(startSizes, 0, deltaPct) as [number, number]);
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }}
    />
  );
}
