import { describe, test, expect, beforeEach } from 'vitest';
import {
  requestEditorJump,
  getPendingEditorJump,
  consumePendingEditorJump,
  subscribeEditorJump,
  resetEditorJumpForTests,
} from '../src/lib/editorJump';

describe('editorJump', () => {
  beforeEach(() => {
    resetEditorJumpForTests();
  });

  test('a request is pending until consumed', () => {
    requestEditorJump({ path: '/a.ts', lineNumber: 10, column: 1 });
    expect(getPendingEditorJump()).toEqual({
      path: '/a.ts',
      lineNumber: 10,
      column: 1,
    });
    expect(consumePendingEditorJump()).toEqual({
      path: '/a.ts',
      lineNumber: 10,
      column: 1,
    });
    expect(getPendingEditorJump()).toBeNull();
    expect(consumePendingEditorJump()).toBeNull();
  });

  test('a newer request replaces an unconsumed one', () => {
    requestEditorJump({ path: '/a.ts', lineNumber: 1, column: 1 });
    requestEditorJump({ path: '/b.ts', lineNumber: 2, column: 3 });
    expect(getPendingEditorJump()).toEqual({
      path: '/b.ts',
      lineNumber: 2,
      column: 3,
    });
  });

  test('subscribers are notified of each request', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeEditorJump((jump) => seen.push(jump.path));
    requestEditorJump({ path: '/a.ts', lineNumber: 1, column: 1 });
    requestEditorJump({ path: '/b.ts', lineNumber: 1, column: 1 });
    unsubscribe();
    requestEditorJump({ path: '/c.ts', lineNumber: 1, column: 1 });
    expect(seen).toEqual(['/a.ts', '/b.ts']);
  });
});
