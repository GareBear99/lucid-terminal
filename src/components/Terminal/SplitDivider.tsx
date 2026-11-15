/**
 * SplitDivider — the draggable boundary between two split panes.
 *
 * The drag mirrors the AI panel's resize handle (App.tsx): mousedown
 * captures the start, moves track on the document, mouseup cleans
 * up. Each move recomputes from the sizes captured at mousedown
 * plus the total pointer delta as a percentage of the container
 * size — never incrementally, so there is no drift. The math
 * (conserve the pair's combined width, clamp each pane to 15–85%)
 * lives in computePaneSizesAfterDrag (splitPaneStore.ts).
 *
 * PaneAxis tree (Atom steal #9, 2026-11-14): a divider belongs to
 * ONE split node, not to a flat group position — it carries the
 * node's id and the node's direction. A vertical node (side by
 * side) drags on the pointer's X against the container width; a
 * horizontal node (stacked) drags on Y against the container
 * height. The drag always moves boundary 0 of the node's pair.
 *
 * Keyboard resize is not built: the divider is mouse-only for now,
 * like the AI panel handle. The panes are still fully usable
 * without it — equal widths until dragged.
 */
import { useSplitPaneStore, computePaneSizesAfterDrag, findSplitNode } from '../../stores/splitPaneStore';
import type { SplitDirection } from '../../stores/splitPaneStore';

interface SplitDividerProps {
  /** The split group this divider belongs to. */
  groupId: string;
  /** The split node this divider is the boundary of. */
  nodeId: string;
  /** The node's direction: 'vertical' drags on X, 'horizontal' on Y. */
  direction: SplitDirection;
}

export function SplitDivider({ groupId, nodeId, direction }: SplitDividerProps) {
  const group = useSplitPaneStore((s) => s.groups[groupId]);

  const horizontal = direction === 'horizontal';

  return (
    <div
      data-testid={`split-divider-${groupId}-${nodeId}`}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label="Resize split panes"
      className={
        horizontal
          ? 'h-1 w-full shrink-0 cursor-row-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors'
          : 'w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors'
      }
      onMouseDown={(e) => {
        if (!group) return;
        const node = findSplitNode(group, nodeId);
        if (!node || node.type !== 'split') return;
        e.preventDefault();
        const container = (e.currentTarget as HTMLElement).parentElement;
        const startClient = horizontal ? e.clientY : e.clientX;
        const startSizes = node.sizes;
        const rect = container?.getBoundingClientRect();
        const length = horizontal ? rect?.height ?? 0 : rect?.width ?? 0;
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
