/**
 * The jump stack: push the position a jump
 * leaves from, pop it on go-back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushJumpPosition,
  popJumpPosition,
  peekJumpPosition,
  resetJumpStackForTests,
} from '../src/lib/jumpStack';

beforeEach(() => {
  resetJumpStackForTests();
});

describe('jumpStack', () => {
  it('pops positions last-in, first-out', () => {
    pushJumpPosition({ path: '/p/a.ts', lineNumber: 1, column: 1 });
    pushJumpPosition({ path: '/p/b.ts', lineNumber: 10, column: 5 });
    expect(popJumpPosition()).toEqual({ path: '/p/b.ts', lineNumber: 10, column: 5 });
    expect(popJumpPosition()).toEqual({ path: '/p/a.ts', lineNumber: 1, column: 1 });
    expect(popJumpPosition()).toBeNull();
  });

  it('peek does not pop', () => {
    pushJumpPosition({ path: '/p/a.ts', lineNumber: 3, column: 2 });
    expect(peekJumpPosition()).toEqual({ path: '/p/a.ts', lineNumber: 3, column: 2 });
    expect(popJumpPosition()).toEqual({ path: '/p/a.ts', lineNumber: 3, column: 2 });
  });

  it('empty stack pops and peeks null', () => {
    expect(popJumpPosition()).toBeNull();
    expect(peekJumpPosition()).toBeNull();
  });

  it('is bounded at 50 — the oldest position drops', () => {
    for (let i = 0; i < 55; i += 1) {
      pushJumpPosition({ path: '/p/a.ts', lineNumber: i + 1, column: 1 });
    }
    expect(peekJumpPosition()?.lineNumber).toBe(55);
    // The first five pushes fell off the bottom.
    let first: number | null = null;
    for (let i = 0; i < 50; i += 1) {
      const popped = popJumpPosition();
      if (i === 49) first = popped?.lineNumber ?? null;
    }
    expect(first).toBe(6);
    expect(popJumpPosition()).toBeNull();
  });
});
