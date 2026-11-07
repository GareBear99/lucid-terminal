/**
 * Browser Phase B — the agent browser's own mouse, glass splash,
 * and finger queue (Gary, 2026-11-07): "browser too" / "get that
 * up n our own thing" / "with its own mouse like you" / "Its a live
 * seperate mouse exactly like yours but locked to the browser area
 * also like yours but when its using browser the mini window has to
 * be show full screen while the browser tab is glass splashed."
 *
 * This module is the shared, Electron-free core both sides use:
 * the main-process session (`electron/services/browserAgentSession.ts`)
 * and the renderer (`src/stores/browserAgentStore.ts`,
 * `AgentMouseCursor`, `BrowserGlassSplash`).
 *
 * - The agent mouse is a live, separate pointer — similar to a
 *   finger (it points and touches) but different (a pointer, not
 *   touch). It is LOCKED to the browser area: every position is
 *   clamped to the browser view bounds before it is dispatched
 *   (CDP `Input.dispatchMouseEvent`, mouseMoved) or rendered.
 * - The glass splash reuses the boot splash's rhythm
 *   (smoke → wordmark → hold → fade, ~3.2s — see
 *   `src/components/Splash/SplashScreen.tsx`) with a glass
 *   treatment on the browser tab. It loads first, then fades,
 *   then the mini window goes fullscreen.
 * - The finger queue is one agent at a time, queued, if eligible
 *   — the phone-finger pattern: a finger starts enabled, Gary
 *   locks it explicitly (`browserFingerLocked`).
 */

/** The agent driving the browser tools today (LuciferAI). Other
 * agents request the finger under their own id and queue behind it. */
export const BROWSER_AGENT_HOLDER_ID = 'lucifer-ai';

/** How long the mini window waits with no tool activity before it
 * drops out of fullscreen back to its floating PiP state. */
export const BROWSER_AGENT_IDLE_MS = 2000;

/** Glass-splash timing (ms) — the boot splash's ~3.2s rhythm. */
export const BROWSER_GLASS_SPLASH_SMOKE_MS = 600;
export const BROWSER_GLASS_SPLASH_WORDMARK_MS = 700;
export const BROWSER_GLASS_SPLASH_HOLD_MS = 900;
export const BROWSER_GLASS_SPLASH_FADE_MS = 1000;
/** Total: smoke + wordmark + hold + fade. */
export const BROWSER_GLASS_SPLASH_TOTAL_MS =
  BROWSER_GLASS_SPLASH_SMOKE_MS +
  BROWSER_GLASS_SPLASH_WORDMARK_MS +
  BROWSER_GLASS_SPLASH_HOLD_MS +
  BROWSER_GLASS_SPLASH_FADE_MS;

export type BrowserGlassSplashPhase =
  | 'smoke'
  | 'wordmark'
  | 'hold'
  | 'fade'
  | 'done';

/** Which phase of the glass splash `elapsedMs` after it started
 * falls in — the same schedule the component runs on timers. */
export function getBrowserGlassSplashPhase(
  elapsedMs: number,
): BrowserGlassSplashPhase {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'smoke';
  if (elapsedMs < BROWSER_GLASS_SPLASH_SMOKE_MS) return 'smoke';
  if (
    elapsedMs <
    BROWSER_GLASS_SPLASH_SMOKE_MS + BROWSER_GLASS_SPLASH_WORDMARK_MS
  ) {
    return 'wordmark';
  }
  if (
    elapsedMs <
    BROWSER_GLASS_SPLASH_SMOKE_MS +
      BROWSER_GLASS_SPLASH_WORDMARK_MS +
      BROWSER_GLASS_SPLASH_HOLD_MS
  ) {
    return 'hold';
  }
  if (elapsedMs < BROWSER_GLASS_SPLASH_TOTAL_MS) return 'fade';
  return 'done';
}

/** A point in the browser view's viewport (CSS px). */
export interface BrowserAgentMousePosition {
  x: number;
  y: number;
}

/** The browser view's size (CSS px) the mouse is locked inside. */
export interface BrowserViewSize {
  width: number;
  height: number;
}

/**
 * Clamp an agent-mouse position to the browser area: the mouse can
 * never leave the browser view. Non-finite input clamps to the
 * origin; a missing/degenerate view clamps to (0, 0).
 */
export function clampAgentMousePosition(
  x: number,
  y: number,
  bounds: BrowserViewSize | null | undefined,
): BrowserAgentMousePosition {
  const width =
    bounds && Number.isFinite(bounds.width) && bounds.width > 0
      ? bounds.width
      : 0;
  const height =
    bounds && Number.isFinite(bounds.height) && bounds.height > 0
      ? bounds.height
      : 0;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  return {
    x: Math.min(width, Math.max(0, safeX)),
    y: Math.min(height, Math.max(0, safeY)),
  };
}

/** Is this position inside the browser area (inclusive)? */
export function isAgentMouseInBounds(
  position: BrowserAgentMousePosition,
  bounds: BrowserViewSize | null | undefined,
): boolean {
  if (!bounds) return false;
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x <= bounds.width &&
    position.y <= bounds.height
  );
}

/**
 * The agent-browser state main pushes to both windows
 * (`browser:agent-state`) on every change: who holds the finger,
 * who is queued, whether the browser is in use (mini fullscreen),
 * whether the glass splash is showing, where the live agent mouse
 * is, and whether Gary has taken control.
 */
export interface BrowserAgentStateSnapshot {
  /** The agent holding the browser finger, or null. */
  holder: string | null;
  /** Agent ids queued for the finger, in grant order. */
  queuedHolders: string[];
  /** An agent is actively driving the browser right now. */
  inUse: boolean;
  /** The glass splash is showing on the browser tab. */
  splash: boolean;
  /** The mini window is fullscreen (in use). */
  fullscreen: boolean;
  /** The live agent mouse, in view coordinates — null when hidden. */
  mouse: BrowserAgentMousePosition | null;
  /** Gary has taken the mouse (agent tools are refused until he
   * hands it back). */
  garyHasControl: boolean;
  /** The browser finger is locked — no agent may take it. */
  fingerLocked: boolean;
  /** LuciferAI is enabled. When it is off, the mini window is
   * there for Gary to stop the agent / take control. */
  luciferAiEnabled: boolean;
  /** The tab popped out to the mini window, or null. */
  poppedOutTabId: string | null;
}
