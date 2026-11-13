// The prompt-row hint words table (dissection doc §2.3, Gary
// 2026-11-12 ~10:00–10:05 PST). Pure function — all six cells:
// three LuciferAI states x two modes.
import { describe, test, expect } from 'vitest';
import { getPromptHintWords } from '../src/lib/promptHintWords';

const TERMINAL_FULL = 'Real shell — type /help for Lucid commands';
const TERMINAL_PLAIN = 'Real shell';
const AGENT =
  'Agent — describe the task; Lucid plans, acts, and reports';

describe('getPromptHintWords', () => {
  test('Terminal + LuciferAI lit: the full hint', () => {
    expect(getPromptHintWords('terminal', true, false)).toBe(TERMINAL_FULL);
  });

  test('Terminal + LuciferAI grey (silenced): plain mode words only — never mentions anything is off', () => {
    const words = getPromptHintWords('terminal', true, true);
    expect(words).toBe(TERMINAL_PLAIN);
    expect(words).not.toMatch(/silenc|off|paused|disabled/i);
  });

  test('Terminal + LuciferAI off: no words at all (zero residue)', () => {
    expect(getPromptHintWords('terminal', false, false)).toBeNull();
    expect(getPromptHintWords('terminal', false, true)).toBeNull();
  });

  test('Agent words do not depend on LuciferAI at all', () => {
    expect(getPromptHintWords('agent', true, false)).toBe(AGENT);
    expect(getPromptHintWords('agent', true, true)).toBe(AGENT);
    expect(getPromptHintWords('agent', false, false)).toBe(AGENT);
    expect(getPromptHintWords('agent', false, true)).toBe(AGENT);
  });
});
