// @vitest-environment jsdom
/**
 * Dual unison model tests (Gary, 2026-11-06).
 *
 * Covers the pure model in src/lib/dualUnison.ts: the unison detect
 * (the pair is the unlock), the stop action's explicit state machine
 * (input -> verified -> detected -> tail page fully unlocked), the
 * stop colour duration (1–9 seconds or until the next action), the
 * append-only hash-chained tail (and its chain check), tri unison
 * acquirability, the binary state, and the stop colour theme.
 *
 * Pure helpers only — no store, no IPC, no window.
 */

import { describe, test, expect } from 'vitest';
import {
  appendTailEntry,
  binaryStateOf,
  canDetectStopAction,
  canInputStopAction,
  canVerifyStopAction,
  detectDualUnison,
  isTailChainIntact,
  isTailPageFullyUnlocked,
  parseStopColorDurationSeconds,
  stopActionStateLabel,
  stopColorDurationLabel,
  tailEntryHash,
  triUnisonFor,
  DUAL_UNISON_OUTLINES,
  type TailEntry,
} from '../src/lib/dualUnison';
import { stopColorTheme } from '../src/lib/homunculusColor';
import type { Homunculus } from '../src/lib/homunculi';

function homunculus(id: string, color: 'pink' | 'purple'): Homunculus {
  return {
    id,
    name: id,
    color,
    biography: null,
    modelPath: null,
    status: 'untrained',
    incumbentScore: null,
    lineage: [],
    createdAt: '2026-11-06T00:00:00.000Z',
  };
}

describe('dual unison detect', () => {
  test('empty roster: nothing detected', () => {
    expect(detectDualUnison([])).toEqual({
      detected: false,
      pinkId: null,
      purpleId: null,
    });
  });

  test('one colour only: not detected', () => {
    expect(detectDualUnison([homunculus('lucifer', 'pink')]).detected).toBe(
      false,
    );
    expect(detectDualUnison([homunculus('lucifer', 'purple')]).detected).toBe(
      false,
    );
  });

  test('the pair: detected, with both ids', () => {
    const roster = [homunculus('lucifer', 'pink'), homunculus('eve', 'purple')];
    expect(detectDualUnison(roster)).toEqual({
      detected: true,
      pinkId: 'lucifer',
      purpleId: 'eve',
    });
  });

  test('the pair plus more singles: still detected', () => {
    const roster = [
      homunculus('lucifer', 'pink'),
      homunculus('eve', 'purple'),
      homunculus('third', 'pink'),
    ];
    expect(detectDualUnison(roster).detected).toBe(true);
  });

  test('binary state: 1 for singles, 2 for the pair', () => {
    expect(binaryStateOf([])).toBe(1);
    expect(binaryStateOf([homunculus('lucifer', 'pink')])).toBe(1);
    expect(
      binaryStateOf([homunculus('lucifer', 'pink'), homunculus('eve', 'purple')]),
    ).toBe(2);
  });
});

describe('stop action state machine', () => {
  test('the states advance in order, never skipping', () => {
    expect(canInputStopAction('not-input')).toBe(true);
    expect(canInputStopAction('input')).toBe(false);
    expect(canVerifyStopAction('input')).toBe(true);
    expect(canVerifyStopAction('not-input')).toBe(false);
    expect(canVerifyStopAction('verified')).toBe(false);
    expect(canDetectStopAction('verified')).toBe(true);
    expect(canDetectStopAction('input')).toBe(false);
    expect(canDetectStopAction('detected')).toBe(false);
  });

  test('the tail page is fully unlocked only at detected', () => {
    expect(isTailPageFullyUnlocked('not-input')).toBe(false);
    expect(isTailPageFullyUnlocked('input')).toBe(false);
    expect(isTailPageFullyUnlocked('verified')).toBe(false);
    expect(isTailPageFullyUnlocked('detected')).toBe(true);
  });

  test('state labels', () => {
    expect(stopActionStateLabel('not-input')).toBe('Not input yet');
    expect(stopActionStateLabel('input')).toBe('Input — awaiting verification');
    expect(stopActionStateLabel('verified')).toBe('Verified — awaiting detection');
    expect(stopActionStateLabel('detected')).toBe('Verified and detected');
  });
});

describe('stop colour duration', () => {
  test('1–9 seconds are valid, anything else is not', () => {
    expect(parseStopColorDurationSeconds(1)).toBe(1);
    expect(parseStopColorDurationSeconds(9)).toBe(9);
    expect(parseStopColorDurationSeconds(0)).toBeNull();
    expect(parseStopColorDurationSeconds(10)).toBeNull();
    expect(parseStopColorDurationSeconds(1.5)).toBeNull();
    expect(parseStopColorDurationSeconds('3')).toBeNull();
    expect(parseStopColorDurationSeconds(null)).toBeNull();
  });

  test('duration labels', () => {
    expect(stopColorDurationLabel({ kind: 'seconds', seconds: 1 })).toBe(
      '1 second',
    );
    expect(stopColorDurationLabel({ kind: 'seconds', seconds: 5 })).toBe(
      '5 seconds',
    );
    expect(stopColorDurationLabel({ kind: 'until-next-action' })).toBe(
      'Until the next action',
    );
  });
});

describe('dual unison outlines', () => {
  test('red, orange, yellow — for the dual one specifically', () => {
    expect([...DUAL_UNISON_OUTLINES]).toEqual(['red', 'orange', 'yellow']);
  });
});

describe('tail — append-only hash chain', () => {
  function buildTail(): TailEntry[] {
    let tail: TailEntry[] = [];
    tail = appendTailEntry(tail, 1, 'first united action', '2026-11-06T00:00:00.000Z');
    tail = appendTailEntry(tail, 2, 'second united action', '2026-11-06T00:01:00.000Z');
    return tail;
  }

  test('entries chain: genesis has no prev, later entries link back', () => {
    const tail = buildTail();
    expect(tail).toHaveLength(2);
    expect(tail[0].prevHash).toBe('');
    expect(tail[1].prevHash).toBe(tail[0].hash);
    expect(tail[0].hash).toBe(
      tailEntryHash('', 1, 'first united action'),
    );
    expect(tail[1].hash).toBe(
      tailEntryHash(tail[0].hash, 2, 'second united action'),
    );
    expect(isTailChainIntact(tail)).toBe(true);
  });

  test('appending never rewrites the entries before it', () => {
    const first = buildTail();
    const grown = appendTailEntry(first, 3, 'third', '2026-11-06T00:02:00.000Z');
    expect(grown.slice(0, 2)).toEqual(first);
    expect(grown).toHaveLength(3);
    expect(isTailChainIntact(grown)).toBe(true);
  });

  test('a rewritten entry breaks the chain', () => {
    const tail = buildTail();
    const tampered = [
      tail[0],
      { ...tail[1], action: 'forged action' },
    ];
    expect(isTailChainIntact(tampered)).toBe(false);
  });

  test('a reordered tail breaks the chain (ticks must increase)', () => {
    const tail = buildTail();
    expect(isTailChainIntact([tail[1], tail[0]])).toBe(false);
  });

  test('an empty tail is intact', () => {
    expect(isTailChainIntact([])).toBe(true);
  });
});

describe('tri unison', () => {
  test('acquirable exactly when dual unison is detected', () => {
    expect(triUnisonFor(false, false)).toEqual({
      acquirable: false,
      acquired: false,
    });
    expect(triUnisonFor(true, false)).toEqual({
      acquirable: true,
      acquired: false,
    });
    expect(triUnisonFor(true, true)).toEqual({
      acquirable: true,
      acquired: true,
    });
  });
});

describe('stop colour theme', () => {
  test('a hex stop colour becomes the face theme', () => {
    const theme = stopColorTheme('#ef4444');
    expect(theme.primary).toBe('#ef4444');
    expect(theme.light).toBe('#ef4444');
    expect(theme.bright).toBe('#ef4444');
    expect(theme.glow).toBe('rgba(239, 68, 68, 0.45)');
  });

  test('a named colour wears as-is, with no derived glow', () => {
    const theme = stopColorTheme('red');
    expect(theme.primary).toBe('red');
    expect(theme.glow).toBe('rgba(0, 0, 0, 0)');
  });
});
