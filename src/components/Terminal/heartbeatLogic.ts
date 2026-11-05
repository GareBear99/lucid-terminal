/**
 * Idle heartbeat — the "awaiting commands" animation from LuciferAI.
 *
 * The original (LuciferAI `lucifer.py` `heartbeat_animation()`, documented
 * in `docs/HEARTBEAT_UPDATE.md`, 2025-10-23) was a background-thread status
 * line that pulsed while the terminal was idle:
 *
 *   Idle • Awaiting Commands... ☠️  (Red — no blood drop)
 *   🩸 Idle • Awaiting Commands... 💀  (Purple)
 *
 * Colour cycled Red ↔ Purple every 1 second, the skull alternated
 * ☠️ (skull & bones) ↔ 💀 (skull), and it paused while the user was
 * typing (`USER_TYPING`) and while the agent was busy (`HEART_STATE`).
 * The canonical text lives in `core/lucifer_colors.py` `IdleState.STATES[0]`.
 *
 * NOTE — deliberate departure from the original, per Gary (2026-11-04):
 * the original had the 🩸 blood drop on BOTH frames (canonical text
 * `🩸 Idle • Awaiting Commands... ☠️`). Gary moved the drop off the ☠️
 * "demon face" frame onto the 💀 "alternate skull" frame, so it now
 * appears only on the odd (purple) frame. The blood DRIP (fang-tip
 * pixels during AI chat / plugin tasks, `src/components/Synth/blood.ts`)
 * is a different feature and is untouched by this change.
 *
 * Restored here as a status line above the prompt in the Terminal view,
 * shown when the LuciferAI plugin is active and idle. When a task starts
 * it gives way to the busy state (the blood drip / the loading swirl /
 * the generation indicator); when the task finishes and the plugin is
 * idle again, the heartbeat returns.
 */

/** The original's 1-second colour/emoji cycle. */
export const HEARTBEAT_INTERVAL_MS = 1000;

/** How long after the last keystroke the heartbeat stays paused. */
export const HEARTBEAT_TYPING_PAUSE_MS = 1500;

/** Bright red — the original's ANSI `\033[91m`. */
export const HEARTBEAT_RED = '#ff5555';

/** Bright purple — the original's ANSI `\033[95m`, the app's light purple. */
export const HEARTBEAT_PURPLE = '#d7a0ff';

export interface HeartbeatFrame {
  /** The frame's colour (red or purple). */
  color: string;
  /** The frame's skull (☠️ or 💀). */
  skull: string;
  /** The full line text for this frame. */
  text: string;
}

/**
 * The heartbeat frame for a tick index. Even frames are red with the
 * skull & bones; odd frames are purple with the skull — the original's
 * alternation, except the 🩸 blood drop now sits ONLY on the odd
 * (purple, 💀 "alternate skull") frame: Gary moved it off the ☠️
 * "demon face" frame (2026-11-04). The original had 🩸 on both frames.
 */
export function heartbeatFrameFor(index: number): HeartbeatFrame {
  const even = index % 2 === 0;
  const color = even ? HEARTBEAT_RED : HEARTBEAT_PURPLE;
  const skull = even ? '☠️' : '💀';
  const text = even
    ? `Idle • Awaiting Commands... ${skull}`
    : `🩸 Idle • Awaiting Commands... ${skull}`;
  return { color, skull, text };
}

/** The heartbeat shows only while the plugin is active and not busy. */
export function shouldShowHeartbeat(active: boolean, busy: boolean): boolean {
  return active && !busy;
}

/**
 * Whether the heartbeat is paused for typing — a keystroke within the
 * pause window. The original's smart pausing (`USER_TYPING`): the
 * heartbeat stopped while the user was typing.
 */
export function isTypingPaused(lastKeystrokeAt: number, now: number): boolean {
  return now - lastKeystrokeAt < HEARTBEAT_TYPING_PAUSE_MS;
}
