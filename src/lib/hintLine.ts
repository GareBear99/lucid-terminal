/**
 * The hint line (heavy terminal work, 2026-11-13 — Warp teaches the
 * flow with one context-sensitive line above the prompt; Lucid had
 * no hint line, only static hint words that label the mode).
 *
 * One line, always visible while learning: it tells the user what
 * the next keystroke does, including what context it carries
 * (Warp §5). It never promises a key that does nothing in the
 * current context — below DEFCON 3 in non-devmode the composer
 * is not the input, so the line only offers the hand-off the
 * window-level ⌘⏎ listener actually provides.
 *
 * Pure function — no React, no stores — unit-testable on its own.
 */

export type HintLineSessionKind = 'terminal' | 'agent';

export interface HintLineInput {
  sessionKind: HintLineSessionKind;
  /** Is the linked composer the input (DEFCON 3+)? */
  prompterActive: boolean;
  /** Dev mode: the detached bar is the input below level 3. */
  devMode: boolean;
  /** The composer's current draft (trimmed by the caller). */
  draft: string;
  /** The auto-detection verdict for the draft (see
   *  src/lib/agentPromptDetect.ts). */
  agentPromptDetected: boolean;
  /** The classifier verdict (see src/lib/inputClassifier.ts).
   *  Optional — when absent, the line behaves as before
   *  (agentPromptDetected only). */
  verdict?: 'shell' | 'agent' | 'unsure';
  /** True when terminal is locked for this tab: the
   *  classifier will not auto-flip to agent, so the hint
   *  says so and points at the explicit switches. */
  locked?: boolean;
}

/** The hint line text for this context, or null when there is
 *  nothing to hint (never happens today — every context has at
 *  least the hand-off or the way back; null is the escape hatch
 *  for a future context with no keys). */
export function computeHintLine(input: HintLineInput): string | null {
  const { sessionKind, prompterActive, devMode, draft, agentPromptDetected, verdict, locked } = input;

  // Agent sessions: the only way out is Esc, and history walks
  // past prompts. The hand-off is meaningless here — you are
  // already in an agent conversation. When the draft looks
  // like a shell command, the classifier is about to flip the
  // tab back to terminal (and lock it) — the hint says so.
  if (sessionKind === 'agent') {
    if (draft && verdict === 'shell') {
      return 'looks like a command — esc back to terminal';
    }
    return 'esc back to terminal · ↑ past prompts';
  }

  // Terminal sessions, draft present: the auto-detection offer
  // replaces the default line — it is the one moment the hint
  // changes with what is typed.
  if (draft && agentPromptDetected) {
    // Locked terminal: the classifier will NOT flip it for
    // you — the hint points at the explicit switches (pill,
    // /agent) instead of promising a flip.
    if (locked) {
      return 'looks like a prompt — pill or /agent to send to agent';
    }
    return 'looks like a prompt — ⌘⏎ send to agent';
  }

  // Terminal sessions, draft present but the classifier is
  // UNSURE: do not flip, show the call, let the user decide
  // (Gary, 2026-11-14 ~03:30 PST).
  if (draft && verdict === 'unsure') {
    return 'not sure yet — ⌘⏎ send to agent, or keep typing';
  }

  // Terminal sessions, composer is the input (DEFCON 3+ in either
  // mode, or the detached dev bar below 3): the hand-off and the
  // composer history are both live.
  if (prompterActive || devMode) {
    return draft ? '↑ past commands' : '⌘⏎ new agent conversation · ↑ past commands';
  }

  // Terminal sessions, below DEFCON 3 in non-devmode: the xterm
  // owns the input. The window-level ⌘⏎ listener still hands
  // the current shell line to a new agent conversation, so the
  // hand-off is a real promise here — but composer history is
  // not (the shell owns it).
  return '⌘⏎ new agent conversation';
}
