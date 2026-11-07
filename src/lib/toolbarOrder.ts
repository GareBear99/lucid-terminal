/**
 * Toolbar icon order — the left icon bar's drag-reorderable order
 * (Gary, 2026-11-06): the toolbar icons are drag-interchangeable
 * (any icon to any position) and the order is REMEMBERED LOCALLY —
 * persisted in Settings as `toolbarOrder` and written IMMEDIATELY on
 * drop (updated AND stored, not updated-only), so a drag survives a
 * reload/restart. The stored order is loaded on startup by the
 * settings store and resolved here.
 *
 * The order is an array of icon ids plus one layout entry:
 * - core icons: 'terminal' | 'editor' | 'explorer' | 'chats' | 'settings'
 * - plugin icons: the plugin's stable id — 'synth' | 'help' (the
 *   blood drop, which opens the Help modal) | 'ai-chat' |
 *   'llmbuilder' (the Forge plugin's id; its button action is 'forge') |
 *   'persona-plex' (the Persona Plex add-on's id; its button opens the
 *   Plex setup page — it is available only while the add-on is
 *   installed and LuciferAI is enabled)
 * - 'spacer': the flexible gap that pins the lower group to the
 *   bottom of the bar. It is a layout entry, not an icon — it is
 *   never draggable and never a drag target's icon, but it IS a drop
 *   target (dropping on it puts the icon just after the gap, at the
 *   start of the lower group).
 *
 * Pure functions, so the order logic is unit-testable without a
 * browser: resolveToolbarOrder (stored order + available icons ->
 * render order) and moveToolbarIcon (one drag -> the new order).
 * The Sidebar calls moveToolbarIcon on drop and persists the result
 * with updateSetting('toolbarOrder', newOrder) in the same step.
 * There used to be a 500ms press-and-hold gate at the drop (see
 * TOOLBAR_HOLD_TO_DRAG_MS, removed 2026-11-07): the drop only
 * committed once the press had lasted 500ms, but a natural drag
 * takes ~200-400ms total, so the gate silently rejected the
 * overwhelmingly common gesture and the icons "didn't move" (Gary,
 * 2026-11-07, real mouse). A completed drop on a different slot is
 * already unambiguous — a plain click can never produce a drop on
 * another slot — so the drop commits without a hold. A plain click
 * never reorders; it activates the icon instead.
 * The drop is midpoint-aware: the pointer's half of the target slot
 * decides whether the icon lands before or after it, so dragging
 * DOWN one slot onto the next icon swaps them instead of silently
 * doing nothing (insert-before the next icon is the order you
 * already have, which reads as "the icons don't move").
 */

/** One entry in the toolbar order — an icon id, or the gap. */
export type ToolbarIconId =
  | 'terminal'
  | 'editor'
  | 'explorer'
  | 'chats'
  | 'synth'
  | 'help'
  | 'ai-chat'
  | 'llmbuilder'
  | 'persona-plex'
  | 'settings'
  | 'spacer';

/** The default order — the layout as it was before reordering. */
export const DEFAULT_TOOLBAR_ORDER: ToolbarIconId[] = [
  'terminal',
  'editor',
  'explorer',
  'chats',
  'spacer',
  'synth',
  'help',
  'ai-chat',
  'llmbuilder',
  'persona-plex',
  'settings',
];

/** Plugin icon ids (the ones that come and go with their toggle). */
const PLUGIN_ICON_IDS: readonly string[] = ['synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex'];

/**
 * Resolve the order to render, from the stored order and the icons
 * available right now (core icons are always available; a plugin
 * icon is available only while its button is enabled).
 *
 * - No stored order (null/undefined/empty) -> the default order,
 *   filtered to the available icons.
 * - A stored order is respected as-is, except: unknown/stale ids are
 *   dropped, duplicates keep only their first occurrence, and any
 *   available icon missing from the stored order (a newly enabled
 *   plugin, or one that was off when the order was saved) is
 *   inserted before 'settings' when it is present (Settings stays
 *   last by convention), else appended at the end.
 * - The spacer is always present exactly once — a stored order that
 *   lost it (saved before the spacer existed) gets it back before
 *   the first plugin icon, else before Settings, else at the end.
 */
export function resolveToolbarOrder(
  stored: readonly string[] | null | undefined,
  available: readonly string[],
): ToolbarIconId[] {
  const availableSet = new Set(available);
  const raw: readonly string[] =
    stored && stored.length > 0 ? stored : DEFAULT_TOOLBAR_ORDER;

  // Keep only available icons + the spacer, deduped (first wins).
  const seen = new Set<string>();
  const resolved: ToolbarIconId[] = [];
  for (const id of raw) {
    if (seen.has(id)) continue;
    if (id === 'spacer') {
      seen.add(id);
      resolved.push('spacer');
      continue;
    }
    if (availableSet.has(id)) {
      seen.add(id);
      resolved.push(id as ToolbarIconId);
    }
    // Unknown/stale ids are dropped silently.
  }

  // Append any available icon missing from the stored order, before
  // 'settings' when it is present (Settings stays last), else at the end.
  const missing = available.filter((id) => !seen.has(id));
  for (const id of missing) {
    const settingsIdx = resolved.indexOf('settings');
    if (settingsIdx >= 0) {
      resolved.splice(settingsIdx, 0, id as ToolbarIconId);
    } else {
      resolved.push(id as ToolbarIconId);
    }
    seen.add(id);
  }

  // Ensure the spacer is present exactly once.
  if (!resolved.includes('spacer')) {
    const pluginIdx = resolved.findIndex((id) => PLUGIN_ICON_IDS.includes(id));
    if (pluginIdx >= 0) {
      resolved.splice(pluginIdx, 0, 'spacer');
    } else {
      const settingsIdx = resolved.indexOf('settings');
      if (settingsIdx >= 0) resolved.splice(settingsIdx, 0, 'spacer');
      else resolved.push('spacer');
    }
  }

  return resolved;
}

/**
 * Move one icon in the order — one drag. Returns the new order; the
 * input is never mutated.
 *
 * - `targetId` is the icon the dragged icon is dropped onto, and
 *   `insertAfter` is false (insert immediately BEFORE the target —
 *   the drop-on-an-icon case) or true (insert immediately AFTER the
 *   target — the drop-on-the-spacer case).
 * - `targetId` null means the end zone: append at the very end.
 * - No-ops (returned unchanged): nothing dragged, dropping an icon
 *   on itself, dragging the spacer (it is not an icon), dragging an
 *   id that is not in the order, or an unknown target (appends at the
 *   end instead of losing the icon).
 */
export function moveToolbarIcon(
  order: readonly ToolbarIconId[],
  draggedId: string,
  targetId: string | null,
  insertAfter: boolean,
): ToolbarIconId[] {
  if (!draggedId || draggedId === 'spacer' || draggedId === targetId) {
    return [...order];
  }
  const without = order.filter((id) => id !== draggedId);
  // The dragged id must be in the order to move it.
  if (without.length === order.length) return [...order];
  // No target (end zone) or an unknown target -> append at the end.
  if (targetId === null) return [...without, draggedId as ToolbarIconId];
  const targetIdx = without.indexOf(targetId as ToolbarIconId);
  if (targetIdx < 0) return [...without, draggedId as ToolbarIconId];
  const insertIdx = insertAfter ? targetIdx + 1 : targetIdx;
  const next = [...without];
  next.splice(insertIdx, 0, draggedId as ToolbarIconId);
  return next;
}
