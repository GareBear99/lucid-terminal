/**
 * Permissions store — the live snapshot of everything the user
 * allows (Gary, 2026-11-07 ~02:47 PST). One source of truth for
 * the UI: the Permissions tab, the computer-control segment's
 * availability line, and any feature that needs to know whether
 * a permission is granted before it acts.
 *
 * The standard (Gary, 2026-11-07 ~02:48 PST — "like you"): the
 * snapshot is the LIVE probe — the truth. The persisted grants
 * in Settings are only a memory of what the user once allowed.
 * refresh() probes, then writes the grants back to Settings so
 * the record exists; the UI resolves what to show with
 * resolvePermissionDisplayState (live wins, recorded is marked
 * stale, nothing is ever presented as current unless a probe
 * just ran).
 *
 * The store never assumes: before any refresh, the snapshot is
 * null and every gate refuses (see gatePermission in
 * src/lib/permissions.ts) — no verification, no action.
 */
import { create } from 'zustand';
import type {
  PermissionDisplayState,
  PermissionGrant,
  PermissionGrants,
  PermissionId,
  PermissionSnapshot,
} from '../lib/permissions';
import { PERMISSION_IDS, resolvePermissionDisplayState } from '../lib/permissions';
import { useSettingsStore } from './settingsStore';

interface PermissionsState {
  /** Live probe result, or null before the first refresh. */
  snapshot: PermissionSnapshot[] | null;
  lastCheckedAt: number | null;
  checking: boolean;
  error: string | null;

  /** Probe now (force bypasses the 30s main-process cache —
   *  e.g. right after the user grants something in System
   *  Settings and hits Refresh) and persist the grants. */
  refresh: (force?: boolean) => Promise<void>;
  /** The live snapshot for one permission, or null. */
  getSnapshot: (id: PermissionId) => PermissionSnapshot | null;
  /** What the UI shows for one permission — live when probed,
   *  last-known marked stale when not, honestly 'unknown' when
   *  neither exists. */
  displayState: (id: PermissionId) => PermissionDisplayState;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  snapshot: null,
  lastCheckedAt: null,
  checking: false,
  error: null,

  refresh: async (force = false) => {
    const api = (window as unknown as { lucidAPI?: { permissions?: {
      getSnapshot: (force?: boolean) => Promise<PermissionSnapshot[]>;
    } } }).lucidAPI?.permissions;
    if (!api) {
      set({ error: 'Permissions are not available in this view.' });
      return;
    }
    set({ checking: true, error: null });
    try {
      const snapshots = await api.getSnapshot(force);
      const now = Date.now();
      const grants: PermissionGrants = {};
      for (const s of snapshots) {
        grants[s.id] = { status: s.status, checkedAt: s.checkedAt } satisfies PermissionGrant;
      }
      // Persist the record (memory, not truth) so the grants
      // survive a restart and the UI can show last-known states.
      await useSettingsStore.getState().updateSetting('permissionGrants', grants);
      set({ snapshot: snapshots, lastCheckedAt: now, checking: false, error: null });
    } catch (e) {
      set({
        checking: false,
        error: e instanceof Error ? e.message : 'Could not check permissions.',
      });
    }
  },

  getSnapshot: (id) => {
    return get().snapshot?.find((s) => s.id === id) ?? null;
  },

  displayState: (id) => {
    const live = get().getSnapshot(id);
    const recorded = useSettingsStore.getState().settings.permissionGrants?.[id] ?? null;
    return resolvePermissionDisplayState(id, live, recorded);
  },
}));

/** All display states, in definition order — for the Permissions
 *  tab list. */
export function allPermissionDisplayStates(): PermissionDisplayState[] {
  const store = usePermissionsStore.getState();
  return PERMISSION_IDS.map((id) => store.displayState(id));
}
