/**
 * The prompt-row hint words ("Ask Lucid...").
 *
 * Rules (Gary, 2026-11-12 ~10:00–10:05 PST, screenshot of the
 * prompt bar + follow-ups; WORDING changed Gary, 2026-11-13
 * ~02:58 PST: "real shell still clearly obstructing everything
 * you input unlick the correct ask lucid in ai chat" — the
 * composer ghost words are "Ask Lucid...", the same text as the
 * AI chat, in both Terminal and Agent modes):
 *
 * - The words sit IN FRONT OF the cursor until you type, and
 *   VANISH ENTIRELY once you type — normal ghost words, like
 *   any other prompt on earth (Gary, 2026-11-12 ~15:12 PST:
 *   "make them normal fucking ghost words ... that disappear
 *   when you type"). This REVERSES the ~10:00 rule (words drop
 *   behind the cursor, faded, once you type) — there is no
 *   behind span anymore. (The in-front / gone placement is the
 *   caller's job — this function only picks WHICH words show.)
 * - Terminal mode: the words appear ONLY when the LuciferAI icon
 *   is enabled; when LuciferAI is off, the cursor repositions
 *   without the words there at all (zero residue, plain terminal).
 * - When the drop is grey (silenced): the words are the same
 *   "Ask Lucid..." — the point is NOT to mention that something
 *   is off (Gary, ~10:05 PST, correcting the "LuciferAI
 *   silenced" proposal). Lit and grey show the same words now;
 *   only off hides them.
 * - Agent mode words do NOT depend on LuciferAI at all: Agent
 *   has literally nothing to do with LuciferAI (Gary, ~10:05
 *   PST), so the Agent words are the same in all three
 *   LuciferAI states.
 *
 * The words are "Ask Lucid..." in both modes. The old wordings
 * ("Real shell — type /help for Lucid commands" / "Real shell"
 * / "Agent — describe the task; Lucid plans, acts, and reports")
 * are gone — the "Real shell" words obstructed everything typed,
 * unlike the correct "Ask Lucid" in the AI chat.
 *
 * Pure function — no React, no stores — so the table is unit
 * testable on its own (tests/promptHintWords.test.ts).
 */

export type PromptMode = 'terminal' | 'agent';

/**
 * Which hint words show in the prompt row, or null for no words.
 *
 * @param mode — 'terminal' (Lucid's shell) or 'agent' (the driving
 *   agent base). There is no mode state in the code yet (the mode
 *   dropdown pill is designed, not built) — callers pass
 *   'terminal' until the pill lands and owns the mode.
 */
export function getPromptHintWords(
  mode: PromptMode,
  luciferAiEnabled: boolean,
  luciferAiSilenced: boolean,
): string | null {
  if (mode === 'agent') {
    // Agent has literally nothing to do with LuciferAI — its
    // words do not change with LuciferAI state.
    return 'Ask Lucid...';
  }
  // Terminal mode: the words appear ONLY when the LuciferAI icon
  // is enabled. LuciferAI off → no words at all (zero residue).
  if (!luciferAiEnabled) return null;
  // Grey (silenced) → the same words as lit. Never mention that
  // anything is off.
  if (luciferAiSilenced) return 'Ask Lucid...';
  // Lit → the same words.
  return 'Ask Lucid...';
}
