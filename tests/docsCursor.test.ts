/**
 * The docs-panel cursor bus tests (Kite mapping #4 — the
 * sidebar pattern — 2026-11-14).
 *
 * The bus is dumb on purpose: one cursor, deduped
 * publishes, subscribers notified. The editor publishes,
 * the panel subscribes — nothing here reads a store.
 *
 * Run with: npx vitest run tests/docsCursor.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDocsCursor,
  publishDocsCursor,
  republishDocsCursor,
  resetDocsCursorForTests,
  scheduleDocsCursorRefresh,
  subscribeDocsCursor,
  type DocsCursor,
} from '../src/lib/docsCursor';

const CURSOR_A: DocsCursor = {
  path: '/ws/a.ts',
  lineNumber: 3,
  column: 17,
  word: 'greet',
};

beforeEach(() => {
  resetDocsCursorForTests();
});

describe('docsCursor — the panel context bus', () => {
  it('starts empty and holds the last publish', () => {
    expect(getDocsCursor()).toBeNull();
    publishDocsCursor(CURSOR_A);
    expect(getDocsCursor()).toEqual(CURSOR_A);
    publishDocsCursor(null);
    expect(getDocsCursor()).toBeNull();
  });

  it('notifies subscribers on publish', () => {
    const seen: Array<DocsCursor | null> = [];
    const unsubscribe = subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    publishDocsCursor({ ...CURSOR_A, word: 'answer' });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(CURSOR_A);
    expect(seen[1]?.word).toBe('answer');
    unsubscribe();
    publishDocsCursor({ ...CURSOR_A, word: 'other' });
    expect(seen).toHaveLength(2);
  });

  it('dedups an identical publish — moving within a word is silent', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    publishDocsCursor({ ...CURSOR_A });
    publishDocsCursor(CURSOR_A);
    expect(seen).toHaveLength(1);
  });

  it('a different column in the same word still publishes (the position moved)', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    publishDocsCursor({ ...CURSOR_A, column: 18 });
    expect(seen).toHaveLength(2);
  });

  it('force-republishes the same cursor (the engine just became ready)', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    republishDocsCursor();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(CURSOR_A);
  });

  it('a failing subscriber never breaks the publisher', () => {
    subscribeDocsCursor(() => {
      throw new Error('subscriber down');
    });
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    expect(() => publishDocsCursor(CURSOR_A)).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});

describe('scheduleDocsCursorRefresh — the panel refresh on edit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-notifies for the same cursor after an edit (the word did not move)', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    expect(seen).toHaveLength(1);
    scheduleDocsCursorRefresh(CURSOR_A.path);
    expect(seen).toHaveLength(1); // debounced — nothing yet
    vi.advanceTimersByTime(150);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(CURSOR_A);
  });

  it('does nothing for a different file (the panel follows another file)', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    scheduleDocsCursorRefresh('/ws/other.ts');
    vi.advanceTimersByTime(150);
    expect(seen).toHaveLength(1);
  });

  it('does nothing with no cursor', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    scheduleDocsCursorRefresh('/ws/a.ts');
    vi.advanceTimersByTime(150);
    expect(seen).toHaveLength(0);
  });

  it('debounces rapid edits into one re-notify', () => {
    const seen: Array<DocsCursor | null> = [];
    subscribeDocsCursor((c) => seen.push(c));
    publishDocsCursor(CURSOR_A);
    scheduleDocsCursorRefresh(CURSOR_A.path);
    scheduleDocsCursorRefresh(CURSOR_A.path);
    scheduleDocsCursorRefresh(CURSOR_A.path);
    vi.advanceTimersByTime(150);
    expect(seen).toHaveLength(2);
  });
});
