/**
 * SplitDivider — the draggable boundary between two split panes.
 *
 * The drag mirrors the AI panel's resize handle (App.tsx): mousedown
 * captures the start, moves track on the document, mouseup cleans
 * up. Each move recomputes from the sizes captured at mousedown
 * plus the total pointer delta as a percentage of the container
 * width — never incrementally, so there is no drift. The math
 * (conserve the pair's combined width, clamp each pane to 15–85%)
 * lives in computePaneSizesAfterDrag (splitPaneStore.ts).
 *
 * Keyboard resize is not built: the divider is mouse-only for now,
 * like the AI panel handle. The panes are still fully usable
 * without it — equal widths until dragged.
 */
import { useSplitPaneStore, computePaneSizesAfterDrag } from '../../stores/splitPaneStore';

interface SplitDividerProps {
  /** The split group this divider belongs to. */
  groupId: string;
  /** The boundary index: the divider sits between pane `boundary`
   *  and pane `boundary + 1` in the group's left-to-right order. */
  boundary: number;
}

export function SplitDivider({ groupId, boundary }: SplitDividerProps) {
  const group = useSplitPaneStore((s) => s.groups[groupId]);

  return (
    <div
      data-testid={`split-divider-${groupId}-${boundary}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split panes"
      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[rgba(88,166,255,0.85)] active:bg-[rgba(88,166,255,0.85)] transition-colors"
      onMouseDown={(e) => {
        if (!group) return;
        e.preventDefault();
        const container = (e.currentTarget as HTMLElement).parentElement;
        const startX = e.clientX;
        const startSizes = group.sizes;
        const width = container?.getBoundingClientRect().width ?? 0;
        if (width <= 0) return;

        const onMouseMove = (ev: MouseEvent) => {
          const deltaPct = ((ev.clientX - startX) / width) * 100;
          useSplitPaneStore
            .getState()
            .setPaneSizes(groupId, computePaneSizesAfterDrag(startSizes, boundary, deltaPct));
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
