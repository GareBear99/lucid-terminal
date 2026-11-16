// @vitest-environment jsdom
/**
 * Per-profile history isolation — the profile fix the tmux steal
 * is built on (src/stores/historyStore.ts).
 *
 * Before this slice, history was one global record
 * `{ [tabId]: blocks }` under `lucid-terminal-history-v1` with no
 * profile dimension, and `profileStore.selectProfile` never
 * switched it: profile B saw profile A's blocks live AND on
 * disk, and a newly created profile inherited the previous
 * profile's history. Gary's rule (2026-11-14): history is
 * profile-only — it survives a relaunch scoped to its profile
 * and is never shared across profiles.
 *
 * These tests fail on unmodified cea360f (no switchProfile, no
 * per-profile record) and pass with the slice.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  useHistoryStore,
  HISTORY_STORAGE_KEY,
  HISTORY_FALLBACK_PROFILE_ID,
  readPersistedHistory,
  readPersistedHistoryRecord,
  flushHistoryPersistence,
  clearProfileHistory,
} from '../src/stores/historyStore';
import { GUEST_VEIL_STORAGE_KEY, isGuestVeilPersisted } from '../src/lib/guestVeil';
import type { TerminalBlock } from '../src/types';

function block(id: string, command: string): TerminalBlock {
  return { id, command, output: 'ok', timestamp: 1, isComplete: true };
}

function reset() {
  useHistoryStore.setState({
    blocksByTab: {},
    profileId: HISTORY_FALLBACK_PROFILE_ID,
    loaded: true,
    guestSessionActive: false,
    guestStash: null,
    selectedBlockIdsByTab: {},
    selectionAnchorByTab: {},
  });
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    localStorage.removeItem(GUEST_VEIL_STORAGE_KEY);
  } catch {
    // No storage in this environment — the store must still work.
  }
  flushHistoryPersistence();
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}

beforeEach(() => reset());
afterEach(() => reset());

describe('per-profile history isolation', () => {
  test('switchProfile isolates blocks: profile B does not see profile A blocks', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo a')]);
    flushHistoryPersistence();
    useHistoryStore.getState().switchProfile('alice');
    expect(useHistoryStore.getState().blocksByTab).toEqual({});
    expect(useHistoryStore.getState().profileId).toBe('alice');
    useHistoryStore.getState().setBlocks('terminal-1', [block('b2', 'echo alice')]);
    flushHistoryPersistence();
    useHistoryStore.getState().switchProfile('default');
    expect(useHistoryStore.getState().blocksByTab['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
    useHistoryStore.getState().switchProfile('alice');
    expect(useHistoryStore.getState().blocksByTab['terminal-1']?.map((b) => b.id)).toEqual(['b2']);
  });

  test('a newly created profile starts with no history (no inheritance)', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo a')]);
    flushHistoryPersistence();
    useHistoryStore.getState().switchProfile('brand-new');
    expect(useHistoryStore.getState().blocksByTab).toEqual({});
  });

  test('the stored record keeps one slot per profile', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo a')]);
    flushHistoryPersistence();
    useHistoryStore.getState().switchProfile('alice');
    useHistoryStore.getState().setBlocks('terminal-1', [block('b2', 'echo alice')]);
    flushHistoryPersistence();
    const record = readPersistedHistoryRecord();
    expect(Object.keys(record).sort()).toEqual(['alice', 'default']);
    expect(record.default['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
    expect(record.alice['terminal-1']?.map((b) => b.id)).toEqual(['b2']);
  });

  test('legacy flat history (pre-scoping) migrates once into the default slot', () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({ 'terminal-1': [block('b1', 'echo legacy')] }),
    );
    const parsed = readPersistedHistory();
    expect(parsed['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
    const record = readPersistedHistoryRecord();
    expect(Object.keys(record)).toEqual(['default']);
  });

  test('clearProfileHistory removes only that profile slot', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo a')]);
    flushHistoryPersistence();
    useHistoryStore.getState().switchProfile('alice');
    useHistoryStore.getState().setBlocks('terminal-1', [block('b2', 'echo alice')]);
    flushHistoryPersistence();
    clearProfileHistory('alice');
    const record = readPersistedHistoryRecord();
    expect(record.alice).toBeUndefined();
    expect(record.default['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
  });

  test('switchProfile to the same profile is a no-op (no reload, no loss)', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo a')]);
    useHistoryStore.getState().switchProfile('default');
    expect(useHistoryStore.getState().blocksByTab['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
  });
});

describe('guest history never persists (the guest hole)', () => {
  test('enterGuestSession veils the owner blocks; exit restores them', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo owner')]);
    flushHistoryPersistence();
    useHistoryStore.getState().enterGuestSession();
    expect(useHistoryStore.getState().guestSessionActive).toBe(true);
    expect(useHistoryStore.getState().blocksByTab).toEqual({});
    expect(isGuestVeilPersisted()).toBe(true);
    useHistoryStore.getState().exitGuestSession();
    expect(useHistoryStore.getState().guestSessionActive).toBe(false);
    expect(useHistoryStore.getState().blocksByTab['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
    expect(isGuestVeilPersisted()).toBe(false);
  });

  test('commands run as a guest never reach the owner history on disk', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo owner')]);
    flushHistoryPersistence();
    const before = localStorage.getItem(HISTORY_STORAGE_KEY);
    expect(before).toBeTruthy();
    useHistoryStore.getState().enterGuestSession();
    useHistoryStore.getState().setBlocks('terminal-1', [block('g1', 'echo guest')]);
    flushHistoryPersistence();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(before);
    useHistoryStore.getState().exitGuestSession();
    const record = readPersistedHistoryRecord();
    expect(record.default['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
  });

  test('a storage event for the veil key veils/unveils a window that was already open', () => {
    useHistoryStore.getState().setBlocks('terminal-1', [block('b1', 'echo owner')]);
    // Another window entered a guest session: the flag appears in
    // storage and the storage event fires in this window.
    localStorage.setItem(GUEST_VEIL_STORAGE_KEY, '1');
    window.dispatchEvent(new StorageEvent('storage', { key: GUEST_VEIL_STORAGE_KEY }));
    expect(useHistoryStore.getState().guestSessionActive).toBe(true);
    expect(useHistoryStore.getState().blocksByTab).toEqual({});
    // The guest ended in the other window: flag removed, event fires.
    localStorage.removeItem(GUEST_VEIL_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: GUEST_VEIL_STORAGE_KEY }));
    expect(useHistoryStore.getState().guestSessionActive).toBe(false);
    expect(useHistoryStore.getState().blocksByTab['terminal-1']?.map((b) => b.id)).toEqual(['b1']);
  });
});
