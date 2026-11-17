// The full pipeline (Warp-like parsing, 2026-11-14):
// classify → question guard → parse → pill context → route,
// and the auto-flip gate with the terminal lock.
import { describe, test, expect } from 'vitest';
import {
  classifyInput,
  shouldAutoFlip,
  AUTODETECT_SUPPRESS_MS,
  type ClassifierContext,
} from '../src/lib/inputClassifier';

function ctx(partial: Partial<ClassifierContext> = {}): ClassifierContext {
  return { mode: 'terminal', locked: false, ...partial };
}

describe('classifyInput', () => {
  test('a request flips to agent, with intent and no file candidates', () => {
    const r = classifyInput('how do i list files', ctx());
    expect(r.verdict).toBe('agent');
    expect(r.isPrompt).toBe(true);
    expect(r.shouldAutoFlip).toBe(true);
    expect(r.flipTo).toBe('agent');
    expect(r.pillContext.route).toBe('agent');
    expect(r.parse?.intent).toBe('question-simple');
    expect(r.parse?.fileCandidates).toEqual([]);
  });

  test('a locked terminal never auto-flips, but the verdict still shows', () => {
    const r = classifyInput('how do i list files', ctx({ locked: true }));
    expect(r.verdict).toBe('agent');
    expect(r.shouldAutoFlip).toBe(false);
    expect(r.flipTo).toBeNull();
  });

  test('a firm shell verdict in agent mode flips back to terminal', () => {
    const r = classifyInput('ls -la', ctx({ mode: 'agent' }));
    expect(r.verdict).toBe('shell');
    expect(r.shouldAutoFlip).toBe(true);
    expect(r.flipTo).toBe('terminal');
    expect(r.parse).toBeNull();
  });

  test('a lone first word being typed in agent mode does NOT flip back', () => {
    // Gary, 2026-11-17: "as soon as you input in agent it
    // goes back to terminal". The first keystroke of any
    // prompt ("F", "Fix") scores shell on the ladders'
    // minimum ('too-short-or-plain'), and the flip back
    // locked terminal — so the prompt went to the shell and
    // the agent never ran. A not-enough-input verdict must
    // never drive the flip back.
    for (const draft of ['F', 'Fi', 'Fix', '']) {
      const r = classifyInput(draft, ctx({ mode: 'agent' }));
      expect(r.shouldAutoFlip).toBe(false);
      expect(r.flipTo).toBeNull();
    }
  });

  test('typing Gary\'s typo-fix prompt in agent mode stays in agent mode', () => {
    // The full sequence, lock modeled like the store:
    // setTabMode to terminal locks terminal, which blocks
    // any flip back to agent. Before the fix the first
    // keystroke flipped to terminal and the lock held it
    // there through submit.
    const prompt =
      "Fix the typo in /Users/gary/agent-test-scratch.txt: line 2 says 'wrod', change it to 'word'.";
    let mode: 'agent' | 'terminal' = 'agent';
    let locked = false;
    for (let i = 1; i <= prompt.length; i++) {
      const r = classifyInput(prompt.slice(0, i), {
        mode,
        locked,
        lastManualModeSetAt: 0,
        now: 100000,
        commandHistory: [],
        agentPromptHistory: [],
        lastBlockKind: null,
      });
      if (r.shouldAutoFlip && r.flipTo) {
        mode = r.flipTo;
        locked = r.flipTo === 'terminal';
      }
    }
    expect(mode).toBe('agent');
    expect(locked).toBe(false);
  });

  test('unsure never flips', () => {
    const r = classifyInput('fix the thing in the thing', ctx());
    expect(r.verdict).toBe('unsure');
    expect(r.shouldAutoFlip).toBe(false);
    expect(r.flipTo).toBeNull();
  });

  test('a greeting parses to an instant reply in the pill context', () => {
    const r = classifyInput('hello', ctx());
    expect(r.verdict).toBe('agent');
    expect(r.parse?.route).toBe('instant-reply');
    expect(r.pillContext.intent).toBe('question-simple');
  });

  test('a shell line has no parse', () => {
    const r = classifyInput('git status', ctx());
    expect(r.verdict).toBe('shell');
    expect(r.parse).toBeNull();
    expect(r.pillContext.route).toBe('shell');
  });
});

describe('shouldAutoFlip', () => {
  test('terminal + agent verdict + unlocked flips to agent', () => {
    expect(shouldAutoFlip('agent', 'nl-heuristic', ctx())).toEqual({ flip: true, to: 'agent' });
  });

  test('terminal + agent verdict + locked does not flip', () => {
    expect(shouldAutoFlip('agent', 'nl-heuristic', ctx({ locked: true }))).toEqual({
      flip: false,
      to: null,
    });
  });

  test('a prefix one-off never flips TO agent', () => {
    // "h" → hello keeps agent mode; it must not start a flip
    // from terminal mode.
    expect(shouldAutoFlip('agent', 'nl-one-off-prefix', ctx())).toEqual({
      flip: false,
      to: null,
    });
  });

  test('agent mode + shell verdict flips back to terminal', () => {
    expect(shouldAutoFlip('shell', 'known-shell-command', ctx({ mode: 'agent' }))).toEqual({
      flip: true,
      to: 'terminal',
    });
  });

  test('agent mode + firm shell signals still flip back', () => {
    // The flip back stays for genuine shell lines — only the
    // not-enough-input verdicts stop flipping.
    for (const source of [
      'known-shell-command',
      'shell-heuristic',
      'path',
      'shell-metacharacters',
      'slash-command',
      'history-match',
    ] as const) {
      expect(shouldAutoFlip('shell', source, ctx({ mode: 'agent' }))).toEqual({
        flip: true,
        to: 'terminal',
      });
    }
  });

  test('agent mode + not-enough-input verdicts never flip back', () => {
    // 'too-short-or-plain' (a lone first word being typed)
    // and 'empty' mean "not enough input yet" — flipping on
    // them yanks a manually-entered agent mode away on the
    // first keystroke, and the terminal lock then blocks any
    // return (Gary, 2026-11-17).
    expect(shouldAutoFlip('shell', 'too-short-or-plain', ctx({ mode: 'agent' }))).toEqual({
      flip: false,
      to: null,
    });
    expect(shouldAutoFlip('shell', 'empty', ctx({ mode: 'agent' }))).toEqual({
      flip: false,
      to: null,
    });
  });

  test('agent mode + unsure does not flip back', () => {
    expect(shouldAutoFlip('unsure', 'unsure', ctx({ mode: 'agent' }))).toEqual({
      flip: false,
      to: null,
    });
  });

  test('inside the 250 ms suppression window nothing flips', () => {
    const suppressed = ctx({ lastManualModeSetAt: 1000, now: 1000 + AUTODETECT_SUPPRESS_MS - 1 });
    expect(shouldAutoFlip('agent', 'nl-heuristic', suppressed)).toEqual({
      flip: false,
      to: null,
    });
    const clear = ctx({ lastManualModeSetAt: 1000, now: 1000 + AUTODETECT_SUPPRESS_MS });
    expect(shouldAutoFlip('agent', 'nl-heuristic', clear)).toEqual({ flip: true, to: 'agent' });
  });

  test('a guest never auto-flips', () => {
    expect(shouldAutoFlip('agent', 'nl-heuristic', ctx({ guestActive: true }))).toEqual({
      flip: false,
      to: null,
    });
  });
});
