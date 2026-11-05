/**
 * Unit tests for the shared input-height logic (src/lib/inputHeight.ts).
 *
 * Gary's sizing (2026-11-05): the default cap is one-third of the page
 * (33.33vh); a drag handle on the bubble's top edge lets the user drag
 * it taller or shorter, up to the 50vh drag max. The dragged height is
 * a persistent floor — it stays put while typing a little or deleting;
 * when the content outgrows it, the bubble resnaps to fit the content
 * (up to 50vh), then scrolls. During an active drag the bubble follows
 * the pointer directly (clamped to the one-line floor / 50vh max).
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

describe('resolveInputHeightPx — dragged floor + resnap', () => {
  test('typing a little stays at the dragged height', () => {
    expect(resolveInputHeightPx(100, 200, VH)).toBe(200);
  });

  test('typing past the dragged height resnaps to fit the content', () => {
    expect(resolveInputHeightPx(300, 200, VH)).toBe(300);
  });

  test('resnap caps at the 50vh drag max, then scrolls', () => {
    expect(resolveInputHeightPx(2000, 200, VH)).toBe(384);
  });

  test('deleting never shrinks below the dragged height', () => {
    expect(resolveInputHeightPx(40, 200, VH)).toBe(200);
  });

  test('dragging smaller than the content still resnaps to the content', () => {
    // A drag down to 100px with 300px of content: the floor is 100,
    // but the content needs 300, so the bubble sits at 300.
    expect(resolveInputHeightPx(300, 100, VH)).toBe(300);
  });
});

describe('resolveInputHeightPx — while dragging', () => {
  test('follows the pointer directly, clamped to floor / 50vh max', () => {
    expect(resolveInputHeightPx(2000, 300, VH, true)).toBe(300);
    expect(resolveInputHeightPx(2000, 500, VH, true)).toBe(384);
    expect(resolveInputHeightPx(200, 30, VH, true)).toBe(40);
  });
});
