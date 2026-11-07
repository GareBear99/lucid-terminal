/**
 * Settings tab order tests (Gary, 2026-11-06).
 *
 * Covers:
 * - resolveSettingsTabOrder: the default order, a stored order
 *   respected, a missing default tab appended, stale ids dropped,
 *   duplicates deduped.
 * - moveSettingsTab: move before a target, after a target (the
 *   pointer's lower half — dragging DOWN one slot swaps instead of
 *   silently doing nothing), to the very end, and the no-ops
 *   (self-drop, an unknown id; an unknown target appends instead of
 *   losing the tab).
 * - Persistence round-trip: a stored order reloads to the same order.
 * - The hold threshold: the Settings tabs share the toolbar's 500ms
 *   click-hold-to-drag threshold (same constant).
 */
import { describe, test, expect } from 'vitest';
import {
  resolveSettingsTabOrder,
  moveSettingsTab,
  DEFAULT_SETTINGS_TAB_ORDER,
  SETTINGS_TAB_HOLD_TO_DRAG_MS,
} from '../src/lib/settingsTabOrder';
import { TOOLBAR_HOLD_TO_DRAG_MS } from '../src/lib/toolbarOrder';

describe('resolveSettingsTabOrder', () => {
  test('no stored order -> the default order', () => {
    expect(resolveSettingsTabOrder([])).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
    expect(resolveSettingsTabOrder(null)).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
    expect(resolveSettingsTabOrder(undefined)).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
  });

  test('a stored order is respected as-is', () => {
    const stored = ['general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon'];
    expect(resolveSettingsTabOrder(stored)).toEqual(stored);
  });

  test('a default tab missing from the stored order is appended at the end', () => {
    const stored = ['appearance', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general'];
    // 'customization' is in the defaults but not stored.
    expect(resolveSettingsTabOrder(stored)).toEqual([...stored, 'customization']);
  });

  test('stale/unknown ids are dropped and duplicates keep the first', () => {
    const stored = ['appearance', 'appearance', 'nope', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general'];
    expect(resolveSettingsTabOrder(stored)).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
  });
});

describe('moveSettingsTab', () => {
  const order = [...DEFAULT_SETTINGS_TAB_ORDER];

  test('move before a target', () => {
    expect(moveSettingsTab(order, 'general', 'appearance')).toEqual([
      'general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon',
    ]);
  });

  test('move to the very end (end zone, null target)', () => {
    expect(moveSettingsTab(order, 'appearance', null)).toEqual([
      'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'appearance',
    ]);
  });

  test('move after a target (pointer in its lower half) — dragging DOWN one slot swaps', () => {
    // Appearance is first, customization second. Dragging appearance
    // DOWN onto customization with insertAfter lands after it — they
    // swap. Without insertAfter that drop was a silent no-op
    // (insert-before the next tab is the order you already have),
    // which reads as "the tabs don't move".
    expect(moveSettingsTab(order, 'appearance', 'customization', true)).toEqual([
      'customization', 'appearance', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general',
    ]);
  });

  test('no-ops: self-drop and an unknown id; an unknown target appends', () => {
    expect(moveSettingsTab(order, 'plugins', 'plugins')).toEqual(order);
    expect(moveSettingsTab(order, 'nope', 'appearance')).toEqual(order);
    expect(moveSettingsTab(order, 'appearance', 'nope')).toEqual([
      'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'appearance',
    ]);
  });

  test('does not mutate the input', () => {
    const before = [...order];
    moveSettingsTab(order, 'general', 'appearance');
    expect(order).toEqual(before);
  });
});

describe('persistence round-trip', () => {
  test('a stored order reloads to the same order', () => {
    const stored = ['general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon'];
    // Resolving the stored order (as a reload would) returns it unchanged.
    expect(resolveSettingsTabOrder(stored)).toEqual(stored);
    // And after a move, the moved order also reloads unchanged.
    const moved = moveSettingsTab(stored, 'daemon', 'appearance');
    expect(resolveSettingsTabOrder(moved)).toEqual(moved);
  });
});

describe('hold threshold', () => {
  test('the Settings tabs share the toolbar 500ms click-hold threshold', () => {
    expect(SETTINGS_TAB_HOLD_TO_DRAG_MS).toBe(500);
    expect(SETTINGS_TAB_HOLD_TO_DRAG_MS).toBe(TOOLBAR_HOLD_TO_DRAG_MS);
  });
});
