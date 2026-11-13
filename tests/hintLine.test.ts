// The hint line (heavy terminal work, 2026-11-13): one
// context-sensitive line above the prompt. It never promises a
// key that does nothing in the current context.
import { describe, test, expect } from 'vitest';
import { computeHintLine } from '../src/lib/hintLine';

describe('computeHintLine', () => {
  test('agent sessions offer only the way back', () => {
    expect(
      computeHintLine({ sessionKind: 'agent', prompterActive: true, devMode: false, draft: '', agentPromptDetected: false }),
    ).toBe('esc back to terminal · ↑ past prompts');
    expect(
      computeHintLine({ sessionKind: 'agent', prompterActive: false, devMode: false, draft: 'hello', agentPromptDetected: false }),
    ).toBe('esc back to terminal · ↑ past prompts');
  });

  test('terminal + composer input offers the hand-off + history', () => {
    expect(
      computeHintLine({ sessionKind: 'terminal', prompterActive: true, devMode: false, draft: '', agentPromptDetected: false }),
    ).toBe('⌘⏎ new agent conversation · ↑ past commands');
  });

  test('terminal + draft + auto-detection offers sending it to the agent', () => {
    expect(
      computeHintLine({ sessionKind: 'terminal', prompterActive: true, devMode: false, draft: 'why is the build failing?', agentPromptDetected: true }),
    ).toBe('looks like a prompt — ⌘⏎ send to agent');
  });

  test('terminal + draft without detection offers only history', () => {
    expect(
      computeHintLine({ sessionKind: 'terminal', prompterActive: true, devMode: false, draft: 'ls', agentPromptDetected: false }),
    ).toBe('↑ past commands');
  });

  test('terminal + dev bar below level 3 offers the hand-off', () => {
    expect(
      computeHintLine({ sessionKind: 'terminal', prompterActive: false, devMode: true, draft: '', agentPromptDetected: false }),
    ).toBe('⌘⏎ new agent conversation · ↑ past commands');
  });

  test('terminal + xterm below level 3 offers only the hand-off (no composer history)', () => {
    expect(
      computeHintLine({ sessionKind: 'terminal', prompterActive: false, devMode: false, draft: '', agentPromptDetected: false }),
    ).toBe('⌘⏎ new agent conversation');
  });
});
