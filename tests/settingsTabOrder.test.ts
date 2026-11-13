/**
 * Settings tab order tests (Gary, 2026-11-06; proper order
 * 2026-11-09 ~15:02 PST).
 *
 * Covers:
 * - resolveSettingsTabOrder: the default order (Appearance,
 *   Security, Permissions, Profile, then the rest in relative
 *   order), a stored order respected, a missing default tab placed
 *   at its DEFAULT position (not appended at the end), stale ids
 *   dropped, duplicates deduped.
 * - moveSettingsTab: move before a target, after a target (the
 *   pointer's lower half — dragging DOWN one slot swaps instead of
 *   silently doing nothing), to the very end, and the no-ops
 *   (self-drop, an unknown id; an unknown target appends instead of
 *   losing the tab).
 * - Persistence round-trip: a stored order reloads to the same order.
 */
import { describe, test, expect } from 'vitest';
import {
  resolveSettingsTabOrder,
  moveSettingsTab,
  DEFAULT_SETTINGS_TAB_ORDER,
} from '../src/lib/settingsTabOrder';

describe('resolveSettingsTabOrder', () => {
  test('no stored order -> the default order', () => {
    expect(resolveSettingsTabOrder([])).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
    expect(resolveSettingsTabOrder(null)).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
    expect(resolveSettingsTabOrder(undefined)).toEqual([...DEFAULT_SETTINGS_TAB_ORDER]);
  });

  test('the default order is Appearance, Security, Permissions, Profile, then the rest', () => {
    expect([...DEFAULT_SETTINGS_TAB_ORDER]).toEqual([
      'appearance', 'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general',
    ]);
  });

  test('a stored order is respected as-is, except a new default tab takes its default place', () => {
    const stored = ['general', 'appearance', 'security', 'permissions', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon'];
    // 'profile' is a default tab missing from the stored order —
    // it lands at its default position (after Permissions), not
    // appended at the end. The stored relative order is untouched.
    expect(resolveSettingsTabOrder(stored)).toEqual([
      'general', 'appearance', 'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon',
    ]);
  });

  test('a default tab missing from the stored order lands at its default position', () => {
    const stored = ['appearance', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general'];
    // 'security', 'permissions', 'profile' and 'customization' are
    // in the defaults but not stored. They land where the default
    // puts them — Security second (after Appearance), Permissions
    // third, Profile fourth, Customization after Profile — not
    // appended at the end. The stored relative order is untouched.
    expect(resolveSettingsTabOrder(stored)).toEqual([
      'appearance', 'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general',
    ]);
  });

  test('a stored order from before Security existed gains it second', () => {
    // Gary's order (2026-11-09 ~15:02 PST): a stored order
    // saved before the Security tab existed gets Security
    // second (after Appearance). Permissions stays where the
    // stored order has it (last here — the stored relative
    // order is respected; the drag feature's contract is that
    // a stored order is not rewritten). Profile, also missing,
    // lands at its default position — right after Permissions,
    // last here. The PROPER order (Appearance, Security,
    // Permissions, Profile, then the rest) is the default
    // order, which is what a user with no stored order
    // (settingsTabOrder: []) sees.
    const stored = ['appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'permissions'];
    expect(resolveSettingsTabOrder(stored)).toEqual([
      'appearance', 'security', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'permissions', 'profile',
    ]);
  });

  test('a stored order with a dragged tab keeps the drag — only the new tab takes its place', () => {
    // The user dragged General to the front; Security still
    // lands second (after Appearance), and General stays first
    // with Permissions where the stored order has it (last).
    // Profile lands after Permissions, last.
    const stored = ['general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'permissions'];
    expect(resolveSettingsTabOrder(stored)).toEqual([
      'general', 'appearance', 'security', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'permissions', 'profile',
    ]);
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
      'general', 'appearance', 'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon',
    ]);
  });

  test('move to the very end (end zone, null target)', () => {
    expect(moveSettingsTab(order, 'appearance', null)).toEqual([
      'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'appearance',
    ]);
  });

  test('move after a target (pointer in its lower half) — dragging DOWN one slot swaps', () => {
    // Appearance is first, security second, permissions third,
    // profile fourth, customization fifth. Dragging appearance
    // DOWN onto customization with insertAfter lands after it —
    // appearance moves below customization, and Security/
    // Permissions/Profile stay put. Without insertAfter that drop
    // was a silent no-op (insert-before the next tab is the order
    // you already have), which reads as "the tabs don't move".
    expect(moveSettingsTab(order, 'appearance', 'customization', true)).toEqual([
      'security', 'permissions', 'profile', 'customization', 'appearance', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general',
    ]);
  });

  test('no-ops: self-drop and an unknown id; an unknown target appends', () => {
    expect(moveSettingsTab(order, 'plugins', 'plugins')).toEqual(order);
    expect(moveSettingsTab(order, 'nope', 'appearance')).toEqual(order);
    expect(moveSettingsTab(order, 'appearance', 'nope')).toEqual([
      'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'appearance',
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
    const stored = ['general', 'appearance', 'security', 'permissions', 'profile', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon'];
    // Resolving the stored order (as a reload would) returns it unchanged.
    expect(resolveSettingsTabOrder(stored)).toEqual(stored);
    // And after a move, the moved order also reloads unchanged.
    const moved = moveSettingsTab(stored, 'daemon', 'appearance');
    expect(resolveSettingsTabOrder(moved)).toEqual(moved);
  });
});
