/**
 * Settings tab order — the Settings panel's drag-reorderable tab list
 * (Gary, 2026-11-06): the Settings tabs are drag-interchangeable
 * (any tab to any position) and the order is REMEMBERED LOCALLY —
 * persisted in Settings as `settingsTabOrder` and written IMMEDIATELY
 * on drop (updated AND stored, not updated-only), so a drag survives
 * a reload/restart. The stored order is loaded on startup by the
 * settings store and resolved here.
 *
 * There is also a lock (Gary, 2026-11-06): `settingsTabsLocked`
 * (default false — unlocked, so a new user can reorder). When locked
 * the tabs cannot be dragged at all; the lock only prevents
 * accidental reordering — the order itself is ALWAYS persisted
 * whenever it changes, locked or not. The lock lives in Settings
 * (see SettingsPanel.tsx), not here: this file is pure order logic.
 *
 * Pure functions, so the order logic is unit-testable without a
 * browser: resolveSettingsTabOrder (stored order + default order ->
 * render order) and moveSettingsTab (one drag -> the new order).
 * The SettingsPanel calls moveSettingsTab on drop and persists the
 * result with updateSetting('settingsTabOrder', newOrder) in the
 * same step. There used to be a 500ms press-and-hold gate at the
 * drop (removed 2026-11-07): the drop only committed once the tab
 * had been held for 500ms, but a natural drag takes ~200-400ms
 * total, so the gate silently rejected the overwhelmingly common
 * gesture and the tabs "didn't move" — the same root cause as the
 * toolbar icons (Gary, 2026-11-07, real mouse). A completed drop on
 * a different tab is already unambiguous — a plain click can never
 * produce a drop on another tab — so the drop commits without a
 * hold. A plain click never reorders; it switches to the tab. The
 * drop is midpoint-aware: the pointer's half of the target decides
 * whether the tab lands before or after it, so dragging DOWN one
 * slot onto the next tab swaps them instead of silently doing
 * nothing.
 */

/** The default tab order — the layout as it was before reordering.
 *
 * The proper order (Gary, 2026-11-09 ~15:02 PST: "ok and order
 * the setting tabs properly now"):
 * 1. Appearance first — the most-visited, theme/mist settings.
 * 2. Security second — the new platform-wide tab (snapshot,
 *    Living Golem, starship, ping key, SP, allowances,
 *    permissions/denials, ring time + strain).
 * 3. Permissions third — the device permissions (Accessibility,
 *    Screen Recording, Full Disk Access, Microphone, Camera).
 * 4. Everything else keeps its relative order after those three.
 */
export const DEFAULT_SETTINGS_TAB_ORDER: readonly string[] = [
  'appearance',
  // Security (Gary, 2026-11-09 ~14:51–14:52 PST) — the general,
  // platform-wide Security tab in Settings: the snapshot, the
  // Living Golem, starship detection, the ping key, SP, the
  // allowances, and the permissions/denials, all in one place.
  // Second in the default order (Gary, 2026-11-09 ~15:02 PST).
  // A stored order that predates it gains it at this position
  // (see resolveSettingsTabOrder), not appended at the end.
  'security',
  'permissions',
  'customization',
  'plugins',
  'devices',
  'forge',
  'modules',
  'models',
  'terminal',
  'ai',
  'daemon',
  'general',
];

/**
 * Resolve the order to render, from the stored order and the default
 * order (the tabs available right now).
 *
 * - No stored order (null/undefined/empty) -> the default order.
 * - A stored order is respected as-is, except: unknown/stale ids are
 *   dropped, duplicates keep only their first occurrence, and any
 *   default tab missing from the stored order (a tab added after
 *   the order was saved) lands at its DEFAULT position — right
 *   after the nearest preceding default tab already in the order
 *   (or at the start when none precedes it) — instead of being
 *   appended at the end. The user's stored relative order is
 *   untouched; only the new tab takes its proper place. (Gary,
 *   2026-11-09 ~15:02 PST: the tabs are ordered properly now —
 *   a stored order from before Security existed gains it second,
 *   after Appearance, not last.)
 */
export function resolveSettingsTabOrder(
  stored: readonly string[] | null | undefined,
  defaults: readonly string[] = DEFAULT_SETTINGS_TAB_ORDER,
): string[] {
  if (!stored || stored.length === 0) return [...defaults];
  const defaultSet = new Set(defaults);
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const id of stored) {
    if (seen.has(id)) continue;
    if (!defaultSet.has(id)) continue; // Unknown/stale ids dropped silently.
    seen.add(id);
    resolved.push(id);
  }
  // A default tab missing from the stored order lands at its
  // DEFAULT position — right after the nearest preceding
  // default tab already in the order (or at the start when
  // none precedes it). Missing tabs are processed in default
  // order, so an earlier missing tab is already placed when a
  // later one looks for its predecessor.
  for (const id of defaults) {
    if (seen.has(id)) continue;
    seen.add(id);
    const defaultIdx = defaults.indexOf(id);
    let insertAt = 0;
    for (let j = defaultIdx - 1; j >= 0; j--) {
      const prevIdx = resolved.indexOf(defaults[j]);
      if (prevIdx >= 0) {
        insertAt = prevIdx + 1;
        break;
      }
    }
    resolved.splice(insertAt, 0, id);
  }
  return resolved;
}

/**
 * Move one tab in the order — one drag. Returns the new order; the
 * input is never mutated.
 *
 * - `targetId` is the tab the dragged tab is dropped onto, and
 *   `insertAfter` is false (insert immediately BEFORE the target —
 *   the pointer was in the target's upper half) or true (insert
 *   immediately AFTER the target — the pointer was in its lower
 *   half). Dropping DOWN one slot onto the next tab therefore swaps
 *   them instead of silently doing nothing.
 * - `targetId` null means the end zone: append at the very end.
 * - No-ops (returned unchanged): nothing dragged, dropping a tab
 *   on itself, or dragging an id that is not in the order. An
 *   unknown target appends at the end instead of losing the tab.
 */
export function moveSettingsTab(
  order: readonly string[],
  draggedId: string,
  targetId: string | null,
  insertAfter: boolean = false,
): string[] {
  if (!draggedId || draggedId === targetId) return [...order];
  const without = order.filter((id) => id !== draggedId);
  // The dragged id must be in the order to move it.
  if (without.length === order.length) return [...order];
  // No target (end zone) or an unknown target -> append at the end.
  if (targetId === null) return [...without, draggedId];
  const targetIdx = without.indexOf(targetId);
  if (targetIdx < 0) return [...without, draggedId];
  const insertIdx = insertAfter ? targetIdx + 1 : targetIdx;
  const next = [...without];
  next.splice(insertIdx, 0, draggedId);
  return next;
}
