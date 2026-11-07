/**
 * The browser's OWN LIVE MOUSE (Phase B, Gary 2026-11-07): "Its a
 * live seperate mouse exactly like yours but locked to the browser
 * area" / "mouse is siumilar to fingers but different obviously".
 *
 * A real, live agent-driven pointer — not decorative. Main
 * dispatches the matching CDP `mouseMoved` event to the page
 * (`electron/services/browserCdp.ts`) and pushes the position here;
 * this draws the cursor at the same point, clamped to the browser
 * view bounds, in the mini window and in the panel. It is similar
 * to a finger (it points and touches) but different (a pointer,
 * not touch) — so it renders as a pointer with an "Agent" tag,
 * distinct from any touch UI.
 *
 * Hidden when there is no mouse position (idle, or Gary took
 * control — his mouse is the real one then).
 */

import { MousePointer2 } from 'lucide-react';
import type { BrowserAgentMousePosition } from '../../lib/browserAgent';

export function AgentMouseCursor({
  mouse,
  label = 'Agent',
}: {
  mouse: BrowserAgentMousePosition | null;
  label?: string;
}) {
  if (!mouse) return null;
  return (
    <div
      data-testid="agent-mouse-cursor"
      aria-label={`Agent mouse at ${Math.round(mouse.x)}, ${Math.round(mouse.y)}`}
      className="pointer-events-none absolute z-50"
      style={{
        left: mouse.x,
        top: mouse.y,
        transform: 'translate(-2px, -2px)',
      }}
    >
      <span className="relative flex items-start">
        <MousePointer2
          size={20}
          className="text-[var(--accent)] drop-shadow-[0_0_6px_var(--accent)]"
          fill="var(--accent)"
        />
        <span className="ml-1 rounded-full border border-[var(--accent)] bg-black/70 px-1.5 py-px text-[10px] font-semibold leading-4 text-[var(--accent)] backdrop-blur-sm">
          {label}
        </span>
      </span>
    </div>
  );
}
