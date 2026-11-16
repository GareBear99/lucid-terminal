// @vitest-environment jsdom
/**
 * Completion acceptance log (Tabnine S7 — 2026-11-15).
 *
 * Every explicit acceptance is an attributable event:
 * the snippet, when, in which session, from which source.
 * The log persists (localStorage, capped) so it survives a
 * restart; a guest's accepts are session-only — never loaded
 * from or saved to the owner's stored log.
 *
 * Run with: npx vitest run tests/completionAcceptanceLog.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useCompletionAcceptanceLog,
  COMPLETION_ACCEPTANCE_LOG_LIMIT,
  COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY,
  COMPLETION_ACCEPTANCE_SNIPPET_LIMIT,
} from '../src/stores/completionAcceptanceLog';
import { useProfileStore } from '../src/stores/profileStore';

const OWNER = { id: 'default', name: 'Default', status: 'active' as const };
const GUEST = { id: 'guest-1', name: 'Guest', status: 'guest' as const };

function setProfile(profile: typeof OWNER | typeof GUEST) {
  useProfileStore.setState({
    profiles: [profile as never],
    activeProfileId: profile.id,
  });
}

beforeEach(() => {
  useCompletionAcceptanceLog.getState().resetForTests();
  setProfile(OWNER);
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  vi.restoreAllMocks();
  useCompletionAcceptanceLog.getState().resetForTests();
});

describe('completion acceptance log — the record', () => {
  it('records snippet + timestamp + session + source', () => {
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'echo hello',
      sessionId: 'tab-1',
      source: 'history',
    });
    const entries = useCompletionAcceptanceLog.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      snippet: 'echo hello',
      timestamp: 1_700_000_000_000,
      sessionId: 'tab-1',
      source: 'history',
    });
  });

  it('persists to localStorage and reloads on the next accept (survives a session)', () => {
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'echo hi',
      sessionId: 'tab-1',
      source: 'ghost',
    });
    const stored = JSON.parse(
      localStorage.getItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY) ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].snippet).toBe('echo hi');

    // A fresh store state (as after a restart) reloads the
    // stored entries on the next accept.
    useCompletionAcceptanceLog.setState({ entries: [], loaded: false });
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'ls',
      sessionId: 'tab-1',
      source: 'file',
    });
    const entries = useCompletionAcceptanceLog.getState().entries;
    expect(entries.map((e) => e.snippet)).toEqual(['echo hi', 'ls']);
  });

  it('caps the log at the limit, oldest first', () => {
    for (let i = 0; i < COMPLETION_ACCEPTANCE_LOG_LIMIT + 5; i++) {
      useCompletionAcceptanceLog.getState().logAcceptance({
        snippet: `cmd-${i}`,
        sessionId: 'tab-1',
        source: 'history',
      });
    }
    const entries = useCompletionAcceptanceLog.getState().entries;
    expect(entries).toHaveLength(COMPLETION_ACCEPTANCE_LOG_LIMIT);
    expect(entries[0].snippet).toBe('cmd-5');
    expect(entries[entries.length - 1].snippet).toBe(
      `cmd-${COMPLETION_ACCEPTANCE_LOG_LIMIT + 4}`,
    );
  });

  it('caps a snippet at the snippet limit', () => {
    const long = 'x'.repeat(COMPLETION_ACCEPTANCE_SNIPPET_LIMIT + 100);
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: long,
      sessionId: 'tab-1',
      source: 'agent',
    });
    expect(useCompletionAcceptanceLog.getState().entries[0].snippet).toHaveLength(
      COMPLETION_ACCEPTANCE_SNIPPET_LIMIT,
    );
  });

  it('drops a corrupt stored value instead of trusting it', () => {
    localStorage.setItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY, 'not-json{');
    useCompletionAcceptanceLog.setState({ entries: [], loaded: false });
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'ls',
      sessionId: 'tab-1',
      source: 'history',
    });
    expect(useCompletionAcceptanceLog.getState().entries).toHaveLength(1);
  });

  it('clearLog empties the log and the stored copy', () => {
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'ls',
      sessionId: 'tab-1',
      source: 'history',
    });
    useCompletionAcceptanceLog.getState().clearLog();
    expect(useCompletionAcceptanceLog.getState().entries).toHaveLength(0);
    expect(localStorage.getItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY)).toBeNull();
  });
});

describe('completion acceptance log — guest is session-only', () => {
  it('a guest accept is recorded in memory but never persisted', () => {
    setProfile(GUEST);
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'echo guest',
      sessionId: 'tab-1',
      source: 'history',
    });
    expect(useCompletionAcceptanceLog.getState().entries).toHaveLength(1);
    expect(localStorage.getItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY)).toBeNull();
  });

  it('a guest never sees the owner\u2019s stored log', () => {
    // Owner accepts first (persisted).
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'echo owner',
      sessionId: 'tab-1',
      source: 'history',
    });
    expect(
      JSON.parse(localStorage.getItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY) ?? '[]'),
    ).toHaveLength(1);

    // Guest session: a fresh store state loads nothing.
    useCompletionAcceptanceLog.setState({ entries: [], loaded: false });
    setProfile(GUEST);
    useCompletionAcceptanceLog.getState().logAcceptance({
      snippet: 'echo guest',
      sessionId: 'tab-1',
      source: 'history',
    });
    expect(useCompletionAcceptanceLog.getState().entries.map((e) => e.snippet)).toEqual([
      'echo guest',
    ]);
    // And the owner's stored log is untouched.
    expect(
      JSON.parse(localStorage.getItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY) ?? '[]').map(
        (e: { snippet: string }) => e.snippet,
      ),
    ).toEqual(['echo owner']);
  });
});
