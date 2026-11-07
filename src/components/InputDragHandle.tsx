import type { PointerEvent as ReactPointerEvent } from 'react';

interface InputDragHandleProps {
  isDragging: boolean;
  onDragHandlePointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Drag handle for the prompt input. Sits on the input's top edge;
 * dragging it up grows the bubble, dragging it down shrinks it.
 * Pointer events cover mouse and touch; touch-action: none stops
 * the browser from scrolling while dragging. The grip brightens
 * while dragging so the grab is visible; at rest it carries the
 * shared .lucid-color-shift accent (index.css) instead of the flat
 * border color, so it reads as a sleek futuristic accent.
 */
export function InputDragHandle({
  isDragging,
  onDragHandlePointerDown,
}: InputDragHandleProps) {
  return (
    <div
      data-testid="input-drag-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to resize input"
      title="Drag to resize input"
      onPointerDown={onDragHandlePointerDown}
      className={`absolute top-0 left-0 right-0 z-10 flex h-[10px] cursor-ns-resize items-start justify-center ${
        isDragging ? 'opacity-100' : 'opacity-60 hover:opacity-100'
      }`}
      style={{ touchAction: 'none' }}
    >
      <div
        className={`mt-[3px] h-[4px] w-10 rounded-full ${
          isDragging ? 'bg-[var(--accent)]' : 'lucid-color-shift'
        }`}
      />
    </div>
  );
}
