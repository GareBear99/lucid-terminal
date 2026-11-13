/**
 * The prompt-row hint words ("Real shell — type /help for Lucid
 * commands" / "Agent — describe the task; ...").
 *
 * Rules (Gary, 2026-11-12 ~10:00–10:05 PST, screenshot of the
 * prompt bar + follow-ups):
 *
 * - The words sit IN FRONT OF the cursor until you type, and
 *   VANISH ENTIRELY once you type — normal ghost words, like
 *   any other prompt on earth (Gary, 2026-11-12 ~15:12 PST:
 *   "make them normal fucking ghost words ... that disappear
 *   when you type"). This REVERSES the ~10:00 rule (words drop
 *   behind the cursor, faded, once you type) — there is no
 *   behind span anymore. (The in-front / gone placement is the
 *   caller's job — this function only picks WHICH words show.)
 * - Terminal mode: the words are the blood drop tab's help entry —
 *   they would only open the icon's help tab of the blood drop
 *   tab, and that tab is closed when the drop is grey (silenced).
 *   So the words appear ONLY when the LuciferAI icon is enabled;
 *   when LuciferAI is off, the cursor repositions without the
 *   words there at all (zero residue, plain terminal).
 * - When the drop is grey (silenced): plain mode words only —
 *   "Real shell" — the point is NOT to mention that something
 *   is off (Gary, ~10:05 PST, correcting the "LuciferAI
 *   silenced" proposal).
 * - Agent mode words do NOT depend on LuciferAI at all: Agent
 *   has literally nothing to do with LuciferAI (Gary, ~10:05
 *   PST), so the Agent words are the same in all three
 *   LuciferAI states.
 *
 * The words switch for Terminal and Agent too (Gary, ~10:02
 * PST). The exact grey words are the proposed table in
 * ~/workspace/lucid-agent-vs-terminal-toggle-dissection.md §2.3
 * (Gary's call on the final wording — the table is labelled
 * PROPOSED there).
 *
 * Pure function — no React, no stores — so the table is unit
 * testable on its own (tests/promptHintWords.test.ts).
 */

export type PromptMode = 'terminal' | 'agent';

/**
 * Which hint words show in the prompt row, or null for no words.
 *
 * @param mode — 'terminal' (the real shell) or 'agent' (the driving
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
    return 'Agent — describe the task; Lucid plans, acts, and reports';
  }
  // Terminal mode: the words are the blood drop's help entry.
  // LuciferAI off → no words at all (zero residue).
  if (!luciferAiEnabled) return null;
  // Grey (silenced) → plain mode words only. Never mention that
  // anything is off.
  if (luciferAiSilenced) return 'Real shell';
  // Lit → the full hint.
  return 'Real shell — type /help for Lucid commands';
}
