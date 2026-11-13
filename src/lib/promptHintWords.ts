/**
 * The prompt-row hint words.
 *
 * Rules (Gary, 2026-11-12 ~10:00–10:05 PST, screenshot of the
 * prompt bar + follow-ups; PER-MODE wording Gary, 2026-11-13
 * ~08:59 PST: "agent should be ask lucid and terminal should be
 * some terminal spiel commond or to switch to agent for driving
 * intelligence" — then ~09:07 PST: "idk just look how warp does
 * theirs"):
 *
 * - Agent mode: "Ask Lucid..." — the same text as the AI chat.
 * - Terminal mode: "Type a command e.g. ls" — Warp's pattern.
 *   Warp's terminal placeholder is "Warp anything e.g. Help me
 *   debug why my Python tests are failing in CI" (Gary's
 *   screenshot, Image_2026-11-10_at_6.50_PM.jpg): the same
 *   example-pattern in both of Warp's views, with the example
 *   showing what to type in that mode. Lucid's terminal takes
 *   commands (auto-detect is suggest-only, never auto-route),
 *   so the terminal example is a command. This SUPERSEDES the
 *   ~02:58 PST rule that the terminal ghost should also say
 *   "Ask Lucid" — that rule made both modes identical, which
 *   is not what Warp does and not what Gary wants.
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
 *   "Type a command e.g. ls" — the point is NOT to mention that something
 *   is off (Gary, ~10:05 PST, correcting the "LuciferAI
 *   silenced" proposal). Lit and grey show the same words now;
 *   only off hides them.
 * - Agent mode words do NOT depend on LuciferAI at all: Agent
 *   has literally nothing to do with LuciferAI (Gary, ~10:05
 *   PST), so the Agent words are the same in all three
 *   LuciferAI states.
 *
 * The words are "Ask Lucid..." in Agent mode and
 * "Type a command e.g. ls" in Terminal mode. The old wordings
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
  if (luciferAiSilenced) return 'Type a command e.g. ls';
  // Lit → the same words.
  return 'Type a command e.g. ls';
}
