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
 * NOTE — deliberate departure from the original, per Gary (2026-11-04,
 * corrected 2026-11-04 ~19:57 PST): the original had the 🩸 blood drop
 * on BOTH frames (canonical text `🩸 Idle • Awaiting Commands... ☠️`).
 * Gary had the demon head (☠️) REMOVED and the blood drop put where it
 * was — so the drop now appears ONLY on the even (red) frame, at the
 * end, and the odd (purple, 💀 "alternate skull") frame has no drop.
 * (An earlier 2026-11-04 change kept the ☠️ and moved the drop to the
 * 💀 frame instead — that was wrong; Gary corrected it.) The blood DRIP
 * (fang-tip pixels during AI chat / plugin tasks,
 * `src/components/Synth/blood.ts`) is a different feature and is
 * untouched by this change.
 *
 * Restored here as a status line above the prompt in the Terminal view,
 * shown when the LuciferAI plugin is active and idle. When a task starts
 * it gives way to the busy state (the blood drip / the loading swirl /
 * the generation indicator); when the task finishes and the plugin is
 * idle again, the heartbeat returns.
 *
 * HOLD — per Gary (2026-11-04): while the fangs drip (an AI-chat
 * generation or a LuciferAI plugin task — the exact `shouldDrip(...)`
 * signal from `src/components/Synth/blood.ts`), the heartbeat does NOT
 * hide. It shifts to the blood-drop frame (the even, red 🩸 frame)
 * next and HOLDS it there until the task finishes, in sync with the
 * fang pixel drops by construction: both are driven by the same
 * `shouldDrip(aiChatLoading, luciferTaskActive)` value. When the hold
 * ends, cycling resumes from the held frame (no reset to frame 0).
 * While busy WITHOUT dripping (e.g. a plain shell command) it still
 * hides, as before.
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
  /** The frame's trailing glyph — 🩸 (blood drop) on even frames,
   * 💀 (alternate skull) on odd frames. The ☠️ demon head was
   * removed per Gary (2026-11-04). */
  skull: string;
  /** The full line text for this frame. */
  text: string;
}

/**
 * The heartbeat frame for a tick index. Even frames are red; odd
 * frames are purple with the 💀 "alternate skull" — the original's
 * alternation, except the ☠️ "demon head" is GONE (removed per Gary,
 * 2026-11-04 ~19:57 PST) and the 🩸 blood drop sits ONLY on the even
 * (red) frame, at the end where the head was. The original had 🩸 on
 * both frames and ☠️ on the even frame.
 */
export function heartbeatFrameFor(index: number): HeartbeatFrame {
  const even = index % 2 === 0;
  const color = even ? HEARTBEAT_RED : HEARTBEAT_PURPLE;
  const skull = even ? '🩸' : '💀';
  const text = `Idle • Awaiting Commands... ${skull}`;
  return { color, skull, text };
}

/** The heartbeat shows only while the plugin is active — and while
 *  idle, OR while the fangs drip (see the HOLD note above). It hides
 *  only while busy WITHOUT dripping (a plain shell command sets
 *  neither drip input) or when the plugin is offline. */
export function shouldShowHeartbeat(active: boolean, busy: boolean, dripping = false): boolean {
  return active && (!busy || dripping);
}

/**
 * The frame to hold on while the fangs drip: the next blood-drop
 * (even, red 🩸) frame at or after the current one — "shift to the
 * blood drop next". If the current frame is already a blood-drop
 * frame it stays put (no jump, no reset). (Before Gary's 2026-11-04
 * correction the drop lived on the odd frame, so this targeted odd
 * frames instead.)
 */
export function bloodDropFrameIndex(currentFrame: number): number {
  return currentFrame % 2 === 0 ? currentFrame : currentFrame + 1;
}

/**
 * Whether the 1-second interval may advance the frame on this tick.
 * The frame advances only while cycling — active, idle, not dripping —
 * and not paused for typing. While dripping the frame is held (the
 * interval is torn down, so it cannot advance); while busy without
 * dripping the line is hidden. Pure so tests can drive it with fake
 * timestamps; the component's interval callback calls this.
 */
export function shouldAdvanceFrame(
  active: boolean,
  busy: boolean,
  dripping: boolean,
  lastKeystrokeAt: number,
  now: number,
): boolean {
  if (!active || busy || dripping) return false;
  return !isTypingPaused(lastKeystrokeAt, now);
}

/**
 * Whether the heartbeat is paused for typing — a keystroke within the
 * pause window. The original's smart pausing (`USER_TYPING`): the
 * heartbeat stopped while the user was typing.
 */
export function isTypingPaused(lastKeystrokeAt: number, now: number): boolean {
  return now - lastKeystrokeAt < HEARTBEAT_TYPING_PAUSE_MS;
}
