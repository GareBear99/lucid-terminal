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
import type { PermissionProbeOrigin } from '../lib/eventLog';
import { useEventLogStore } from './eventLogStore';
import { useSettingsStore } from './settingsStore';

interface PermissionsState {
  /** Live probe result, or null before the first refresh. */
  snapshot: PermissionSnapshot[] | null;
  lastCheckedAt: number | null;
  checking: boolean;
  error: string | null;

  /** Probe now (force bypasses the 30s main-process cache —
   *  e.g. right after the user grants something in System
   *  Settings and hits Refresh) and persist the grants.
   *  `origin` says WHY the probe ran — 'startup' when the
   *  Permissions tab opens (an initial event), 'user-refresh'
   *  when the user hits Refresh, 'after-request' after a
   *  permission request — so the event log can diagnose it.
   *  (Gary, 2026-11-08 — track when + why.) */
  refresh: (force?: boolean, origin?: PermissionProbeOrigin) => Promise<void>;
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

  refresh: async (force = false, origin: PermissionProbeOrigin = 'user-refresh') => {
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
      const prev = get().snapshot;
      set({ snapshot: snapshots, lastCheckedAt: now, checking: false, error: null });
      // Track + diagnose the probe: WHEN it ran and WHY
      // (startup open vs user Refresh vs after a request).
      useEventLogStore.getState().logPermissionProbe(origin, 'completed');
      // Track any state that changed since the last probe —
      // a permission moving granted ↔ denied is an event of
      // its own, diagnosed by the probe that found it. The
      // very first probe has no previous snapshot, so there
      // is nothing to compare — the probe event itself is
      // the record.
      if (prev) {
        for (const s of snapshots) {
          const old = prev.find((p) => p.id === s.id);
          if (old && old.status !== s.status) {
            useEventLogStore.getState().logPermissionStateChange(s.id, old.status, s.status);
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not check permissions.';
      set({
        checking: false,
        error: message,
      });
      useEventLogStore.getState().logPermissionProbe(origin, 'failed', message);
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
