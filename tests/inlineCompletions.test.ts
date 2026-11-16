/**
 * Pure-engine tests for the Monaco inline completions (ghost
 * answers, steal #1 — 2026-11-14). No Monaco, no React: the
 * engine is `computeInlineCompletion` + `completeOpenFile`.
 */

import { describe, expect, it } from 'vitest';
import {
  completeOpenFile,
  computeInlineCompletion,
  type InlineCompletionContext,
} from '../src/lib/inlineCompletions';

function ctx(partial: Partial<InlineCompletionContext> = {}): InlineCompletionContext {
  return {
    history: [],
    openFiles: [],
    mode: 'terminal',
    parentGhost: null,
    ...partial,
  };
}

const FILES = [
  { path: '/Users/gary/README.md', name: 'README.md' },
  { path: 'src/components/Terminal.tsx', name: 'Terminal.tsx' },
];

describe('computeInlineCompletion — history', () => {
  it('completes from the most recent history entry that starts with the draft', () => {
    expect(
      computeInlineCompletion('echo h', ctx({ history: ['echo hello', 'echo hi'] })),
    ).toEqual({ text: 'echo hi', source: 'history' });
  });

  it('returns null for an empty draft', () => {
    expect(computeInlineCompletion('', ctx({ history: ['echo hello'] }))).toBeNull();
  });

  it('returns null for a multi-line draft', () => {
    expect(
      computeInlineCompletion('echo hi\nls', ctx({ history: ['echo hi\nls more'] })),
    ).toBeNull();
  });

  it('returns null when the draft exactly matches the only history entry', () => {
    expect(
      computeInlineCompletion('echo hello', ctx({ history: ['echo hello'] })),
    ).toBeNull();
  });

  it('returns null when no history entry starts with the draft', () => {
    expect(
      computeInlineCompletion('zzz', ctx({ history: ['echo hello'] })),
    ).toBeNull();
  });

  it('is case-sensitive, like the shell', () => {
    expect(
      computeInlineCompletion('Echo h', ctx({ history: ['echo hello'] })),
    ).toBeNull();
  });
});

describe('computeInlineCompletion — paused (Tabnine S7)', () => {
  it('returns null while paused, for every source', () => {
    expect(
      computeInlineCompletion('echo h', ctx({ history: ['echo hello'], paused: true })),
    ).toBeNull();
    expect(computeInlineCompletion('/def', ctx({ paused: true }))).toBeNull();
    expect(
      computeInlineCompletion('cd src/com', ctx({ openFiles: FILES, paused: true })),
    ).toBeNull();
  });

  it('offers again when resumed', () => {
    expect(
      computeInlineCompletion('echo h', ctx({ history: ['echo hello'], paused: false })),
    ).toEqual({ text: 'echo hello', source: 'history' });
  });
});

describe('computeInlineCompletion — slash', () => {
  it('completes the slash command word only', () => {
    expect(computeInlineCompletion('/def', ctx())).toEqual({
      text: '/defcon',
      source: 'slash',
    });
  });

  it('completes /fi to /file (the first matching command word)', () => {
    // '/file' sorts before '/fix' in the alphabetically-sorted
    // SLASH_COMMAND_NAMES (sweep fix 2 follow-on, 2026-11-14).
    expect(computeInlineCompletion('/fi', ctx())).toEqual({ text: '/file', source: 'slash' });
  });

  it('returns null for an exact slash match', () => {
    expect(computeInlineCompletion('/defcon', ctx())).toBeNull();
  });

  it('returns null once the slash line has a space (arguments are never completed)', () => {
    expect(computeInlineCompletion('/defcon 3', ctx())).toBeNull();
  });

  it('returns null for an unknown slash word', () => {
    expect(computeInlineCompletion('/zzz', ctx())).toBeNull();
  });
});

describe('computeInlineCompletion — files', () => {
  it('completes a bare token to an open file basename', () => {
    expect(
      computeInlineCompletion('cat READ', ctx({ openFiles: FILES })),
    ).toEqual({ text: 'cat README.md', source: 'file' });
  });

  it('completes a path token to an open file path', () => {
    expect(
      computeInlineCompletion('cd src/com', ctx({ openFiles: FILES })),
    ).toEqual({ text: 'cd src/components/Terminal.tsx', source: 'file' });
  });

  it('returns null when no open file matches the token', () => {
    expect(
      computeInlineCompletion('cat ZZZ', ctx({ openFiles: FILES })),
    ).toBeNull();
  });

  it('returns null when there are no open files', () => {
    expect(computeInlineCompletion('cat READ', ctx({ openFiles: [] }))).toBeNull();
  });

  it('returns null for a single-character token', () => {
    expect(completeOpenFile('cat R', FILES)).toBeNull();
  });

  it('returns null when the token is already a complete path', () => {
    expect(
      completeOpenFile('cd src/components/Terminal.tsx', FILES),
    ).toBeNull();
  });

  it('returns null when the token is already a complete basename', () => {
    expect(completeOpenFile('cat README.md', FILES)).toBeNull();
  });

  it('returns null when the draft ends in whitespace (no token)', () => {
    expect(completeOpenFile('cat ', FILES)).toBeNull();
  });

  it('is case-sensitive on the token', () => {
    expect(completeOpenFile('cat read', FILES)).toBeNull();
  });
});

describe('computeInlineCompletion — priority and silence', () => {
  it('history beats file when both match the draft', () => {
    expect(
      computeInlineCompletion('cat READ', ctx({
        history: ['cat README.txt'],
        openFiles: FILES,
      })),
    ).toEqual({ text: 'cat README.txt', source: 'history' });
  });

  it('falls through to file when history has nothing', () => {
    expect(
      computeInlineCompletion('cat READ', ctx({
        history: ['ls'],
        openFiles: FILES,
      })),
    ).toEqual({ text: 'cat README.md', source: 'file' });
  });

  it('is silent in agent mode, even with a history match', () => {
    expect(
      computeInlineCompletion('echo h', ctx({
        history: ['echo hello'],
        mode: 'agent',
      })),
    ).toBeNull();
  });

  it('is silent while the parent overlay has a ghost', () => {
    expect(
      computeInlineCompletion('echo h', ctx({
        history: ['echo hello'],
        parentGhost: 'echo hi',
      })),
    ).toBeNull();
  });

  it('is silent in agent mode even when the parent has no ghost', () => {
    expect(
      computeInlineCompletion('cat READ', ctx({
        openFiles: FILES,
        mode: 'agent',
      })),
    ).toBeNull();
  });
});
