// Auto-detection: draft looks like an agent prompt, not a shell
// command (heavy terminal work, 2026-11-13; UPGRADED
// 2026-11-14 to the Warp-like classifier — a true here drives
// the hint line AND the auto-flip, gated by inputClassifier:
// the terminal lock, the 250 ms post-manual suppression, and
// the unsure case all stop a flip).
import { describe, test, expect } from 'vitest';
import { detectAgentPrompt } from '../src/lib/agentPromptDetect';

describe('detectAgentPrompt', () => {
  test('empty / slash / multi-line are not prompts', () => {
    expect(detectAgentPrompt('').isPrompt).toBe(false);
    expect(detectAgentPrompt('   ').isPrompt).toBe(false);
    expect(detectAgentPrompt('/fix the build').isPrompt).toBe(false);
    expect(detectAgentPrompt('line one\nline two').isPrompt).toBe(false);
  });

  test('known shell commands are not prompts', () => {
    for (const line of [
      'ls -la',
      'git status',
      'npm run build',
      'cd ~/lucid-terminal',
      'echo hello',
      'sudo apt update',
      'python3 -m pytest tests/',
      'docker ps',
      'vim README.md',
    ]) {
      expect(detectAgentPrompt(line).isPrompt).toBe(false);
    }
  });

  test('shell metacharacters are not prompts', () => {
    for (const line of [
      'cat file | grep foo',
      'npm run build > out.log',
      'make && make test',
      'export FOO=bar',
      'echo $HOME',
      './run.sh --watch',
      'git commit -m "fix it"',
    ]) {
      expect(detectAgentPrompt(line).isPrompt).toBe(false);
    }
  });

  test('paths are not prompts', () => {
    expect(detectAgentPrompt('/Users/gary/lucid-terminal').isPrompt).toBe(false);
    expect(detectAgentPrompt('~/Downloads/file.zip').isPrompt).toBe(false);
  });

  test('questions are prompts', () => {
    expect(detectAgentPrompt('why is the build failing?').isPrompt).toBe(true);
    expect(detectAgentPrompt('how do I fix this?').isPrompt).toBe(true);
  });

  test('multi-word requests with ask-verbs are prompts', () => {
    expect(detectAgentPrompt('please fix the failing build').isPrompt).toBe(true);
    expect(detectAgentPrompt('explain how the snapshot works').isPrompt).toBe(true);
    expect(detectAgentPrompt('create a new agent conversation for this').isPrompt).toBe(true);
  });

  test('long bare lines read as sentences', () => {
    expect(detectAgentPrompt('run the tests and report back what broke').isPrompt).toBe(true);
  });

  test('one-off greetings are prompts (the NL one-off rule)', () => {
    expect(detectAgentPrompt('hello').isPrompt).toBe(true);
    expect(detectAgentPrompt('hi').isPrompt).toBe(true);
    // Ghostty merge: single-letter one-off 'h' flips too, by the same rule.
    expect(detectAgentPrompt('h').isPrompt).toBe(true);
  });

  test('short plain words are not prompts', () => {
    expect(detectAgentPrompt('build now').isPrompt).toBe(false);
  });
});
