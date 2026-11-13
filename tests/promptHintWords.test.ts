// The prompt-row hint words table (dissection doc §2.3, Gary
// 2026-11-12 ~10:00–10:05 PST; wording Gary, 2026-11-13 ~02:58
// PST: "Ask Lucid..." in both modes). Pure function — the
// gating cells: three LuciferAI states x two modes.
import { describe, test, expect } from 'vitest';
import { getPromptHintWords } from '../src/lib/promptHintWords';

const ASK_LUCID = 'Ask Lucid...';

describe('getPromptHintWords', () => {
  test('Terminal + LuciferAI lit: "Ask Lucid..."', () => {
    expect(getPromptHintWords('terminal', true, false)).toBe(ASK_LUCID);
  });

  test('Terminal + LuciferAI grey (silenced): the same words — never mentions anything is off', () => {
    const words = getPromptHintWords('terminal', true, true);
    expect(words).toBe(ASK_LUCID);
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
