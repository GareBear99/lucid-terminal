// The prompt-row hint words table (dissection doc §2.3, Gary
// 2026-11-12 ~10:00–10:05 PST; per-mode wording Gary, 2026-11-13
// ~08:59 PST + Warp reference ~09:07 PST: Agent "Ask Lucid...",
// Terminal "Type a command e.g. ls"). Pure function — the
// gating cells: three LuciferAI states x two modes.
import { describe, test, expect } from 'vitest';
import { getPromptHintWords } from '../src/lib/promptHintWords';

const ASK_LUCID = 'Ask Lucid...';
const TERMINAL_WORDS = 'Type a command e.g. ls';

describe('getPromptHintWords', () => {
  test('Terminal + LuciferAI lit: "Type a command e.g. ls"', () => {
    expect(getPromptHintWords('terminal', true, false)).toBe(TERMINAL_WORDS);
  });

  test('Terminal + LuciferAI grey (silenced): the same words — never mentions anything is off', () => {
    const words = getPromptHintWords('terminal', true, true);
    expect(words).toBe(TERMINAL_WORDS);
    expect(words).not.toMatch(/silenc|off|paused|disabled/i);
  });

  test('Terminal + LuciferAI off: no words at all (zero residue)', () => {
    expect(getPromptHintWords('terminal', false, false)).toBeNull();
    expect(getPromptHintWords('terminal', false, true)).toBeNull();
  });

  test('Agent words do not depend on LuciferAI at all', () => {
    expect(getPromptHintWords('agent', true, false)).toBe(ASK_LUCID);
    expect(getPromptHintWords('agent', true, true)).toBe(ASK_LUCID);
    expect(getPromptHintWords('agent', false, false)).toBe(ASK_LUCID);
    expect(getPromptHintWords('agent', false, true)).toBe(ASK_LUCID);
  });
});
