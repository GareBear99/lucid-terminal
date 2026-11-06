/**
 * Unit tests for the shared input-height logic (src/lib/inputHeight.ts).
 *
 * Gary's sizing (2026-11-05): the default cap is one-third of the page
 * (33.33vh); a drag handle on the bubble's top edge lets the user drag
 * it taller or shorter, up to the 50vh drag max. The dragged height is
 * a cap, not a floor — it sets how tall the bubble may grow; the bubble
 * hugs the content in both directions and regresses to fit it when the
 * content shrinks, so it is never stuck tall after deleting text.
 * During an active drag the bubble follows the pointer directly
 * (clamped to the one-line floor / 50vh max).
 *
 * All values below are hand-checked against a 768px viewport (jsdom).
 */

import { describe, test, expect } from 'vitest';
import {
  INPUT_DEFAULT_HEIGHT_VH,
  INPUT_DRAG_MAX_HEIGHT_VH,
  INPUT_MIN_HEIGHT_PX,
  inputCapPx,
  clampDraggedHeightPx,
  resolveInputHeightPx,
} from '../src/lib/inputHeight';

const VH = 768;

describe('input height constants', () => {
  test('default cap is one-third of the page, drag max is half', () => {
    expect(INPUT_DEFAULT_HEIGHT_VH).toBe(33.33);
    expect(INPUT_DRAG_MAX_HEIGHT_VH).toBe(50);
    expect(INPUT_MIN_HEIGHT_PX).toBe(40);
  });

  test('vh caps in pixels (768px viewport)', () => {
    expect(inputCapPx(VH, INPUT_DEFAULT_HEIGHT_VH)).toBe(255);
    expect(inputCapPx(VH, INPUT_DRAG_MAX_HEIGHT_VH)).toBe(384);
  });
});

describe('clampDraggedHeightPx', () => {
  test('clamps a drag to the one-line floor and the 50vh max', () => {
    expect(clampDraggedHeightPx(200, VH)).toBe(200);
    expect(clampDraggedHeightPx(500, VH)).toBe(384);
    expect(clampDraggedHeightPx(20, VH)).toBe(40);
  });
});

describe('resolveInputHeightPx — never dragged', () => {
  test('grows with content up to the 33.33vh default cap, then caps', () => {
    expect(resolveInputHeightPx(40, null, VH)).toBe(40);
    expect(resolveInputHeightPx(200, null, VH)).toBe(200);
    expect(resolveInputHeightPx(2000, null, VH)).toBe(255);
  });
});

describe('resolveInputHeightPx — dragged cap + regress', () => {
  test('content shorter than the dragged cap regresses to fit it', () => {
    expect(resolveInputHeightPx(100, 200, VH)).toBe(100);
  });

  test('content taller than the dragged cap caps at the dragged height', () => {
    expect(resolveInputHeightPx(300, 200, VH)).toBe(200);
  });

  test('very long content caps at the dragged height, then scrolls', () => {
    expect(resolveInputHeightPx(2000, 200, VH)).toBe(200);
  });

  test('dragged to the 50vh max + content shrinks → regresses to fit content', () => {
    expect(resolveInputHeightPx(100, 384, VH)).toBe(100);
    expect(resolveInputHeightPx(40, 384, VH)).toBe(40);
  });

  test('deleting never leaves the bubble stuck tall', () => {
    expect(resolveInputHeightPx(40, 200, VH)).toBe(40);
  });

  test('dragging shorter than the content lowers the cap', () => {
    // A drag down to 100px with 300px of content: the cap is 100,
    // so the bubble sits at 100 and scrolls.
    expect(resolveInputHeightPx(300, 100, VH)).toBe(100);
  });

  test('a dragged cap past the 50vh max still clamps at 50vh', () => {
    expect(resolveInputHeightPx(2000, 500, VH)).toBe(384);
  });
});

describe('resolveInputHeightPx — while dragging', () => {
  test('follows the pointer directly, clamped to floor / 50vh max', () => {
    expect(resolveInputHeightPx(2000, 300, VH, true)).toBe(300);
    expect(resolveInputHeightPx(2000, 500, VH, true)).toBe(384);
    expect(resolveInputHeightPx(200, 30, VH, true)).toBe(40);
  });
});
