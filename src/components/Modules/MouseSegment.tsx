/**
 * Mouse segment — every pointer Lucid has, mice and finger
 * pointers alike (Gary, 2026-11-09 ~15:07–15:11 PST): "how was
 * your mouse created exactlyt and how do we make one for lucid"
 * + "another segment" + "and plugin" + "and make a repo for it
 * too" + "yes all the mouses and finger pointers like the
 * android ones go in there so what is there".
 *
 * Pre-installed: no starship, no install step, no server, fully
 * local. The segment REUSES the computer-control driver
 * (src/lib/computerControl.ts + electron/services/
 * computerControlDriver.ts) for the Mac mouse — it does not build
 * a new driver — and reads the live browser mouse from the
 * browser-agent store and the Android finger from adb device
 * list. One lock, one kill switch: the shared
 * `computerControlLocked` setting. The lock itself is toggled in
 * the Computer control section above; this panel shows its state.
 *
 * The panel lists the pointer types the code actually has
 * (src/lib/mouse.ts: POINTER_TYPES) with their live state, and
 * the gaps (POINTER_GAPS) honestly as not built — multi-touch,
 * stylus, trackpad gestures, Windows/Linux drivers, iOS. Nothing
 * here fakes a pointer type.
 */
import { useCallback, useEffect, useState } from 'react';
import { MousePointer2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ComputerControlSegmentState } from '../../lib/computerControl';
import {
  POINTER_TYPES,
  POINTER_GAPS,
  describeAndroidFinger,
  describeMouseStatus,
} from '../../lib/mouse';
import { permissionStatusLabel } from '../../lib/permissions';
import { useBrowserAgentStore } from '../../stores/browserAgentStore';
import { usePermissionsStore } from '../../stores/permissionsStore';
import { useSettingsStore } from '../../stores/settingsStore';

export function MouseSegment() {
  const locked = useSettingsStore((s) => s.settings.computerControlLocked ?? false);
  const browserMouse = useBrowserAgentStore((s) => s.mouse);
  const garyHasControl = useBrowserAgentStore((s) => s.garyHasControl);
  const permSnapshot = usePermissionsStore((s) => s.snapshot);
  const permRefresh = usePermissionsStore((s) => s.refresh);
  const [segmentState, setSegmentState] = useState<ComputerControlSegmentState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [androidDevices, setAndroidDevices] = useState<number | null>(null);

  const refreshState = useCallback(async () => {
    const api = (window as unknown as { lucidAPI?: { computerControl?: { getState: () => Promise<ComputerControlSegmentState> } } }).lucidAPI?.computerControl;
    if (!api) {
      setStateError('Segment state is not available in this view.');
      return;
    }
    try {
      setSegmentState(await api.getState());
      setStateError(null);
    } catch (e) {
      setStateError(e instanceof Error ? e.message : 'Could not read the segment state.');
    }
    await permRefresh(false).catch(() => undefined);
    // Android finger — device count from adb, honestly unknown
    // when the call fails or the bridge is absent.
    const android = (window as unknown as { lucidAPI?: { android?: { listDevices: () => Promise<{ devices?: unknown[]; error?: string }> } } }).lucidAPI?.android;
    if (!android) {
      setAndroidDevices(null);
      return;
    }
    try {
      const result = await android.listDevices();
      setAndroidDevices(Array.isArray(result?.devices) ? result.devices.length : null);
    } catch {
      setAndroidDevices(null);
    }
  }, [permRefresh]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const lastAction = segmentState?.log?.[0] ?? null;
  const status = describeMouseStatus({
    locked,
    browserMouse,
    lastAction: lastAction
      ? { kind: lastAction.kind, outcome: lastAction.outcome, verified: lastAction.verified }
      : null,
    androidDevices,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <MousePointer2 size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Mouse</span>
          <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
            Pre-installed — every pointer Lucid has, mice and finger pointers alike.
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* The mouse state — one line, from the shared driver state. */}
      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">{status.status} — </span>
        {status.detail}
      </p>

      {/* The pointer types — what the code actually has, each with
          its live state. Nothing here is invented. */}
      <div className="space-y-2">
        {POINTER_TYPES.map((pointer) => (
          <div key={pointer.id} className="text-xs leading-[1.5] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-secondary)]">{pointer.name} — </span>
            {pointer.where}. {pointer.driver}.
            {' '}
            {pointer.id === 'mac-mouse' && (
              <span>
                {lastAction
                  ? `Last action: ${lastAction.kind} — ${lastAction.outcome}${lastAction.verified ? ' · verified' : ''}.`
                  : 'No actions yet.'}
              </span>
            )}
            {pointer.id === 'browser-mouse' && (
              <span>
                {browserMouse
                  ? `Live at ${Math.round(browserMouse.x)}, ${Math.round(browserMouse.y)}.`
                  : garyHasControl
                    ? 'Hidden — Gary took control.'
                    : 'Hidden — idle.'}
              </span>
            )}
            {pointer.id === 'android-finger' && <span>{describeAndroidFinger(androidDevices)}</span>}
            {' '}
            <span>{pointer.note}</span>
          </div>
        ))}
      </div>

      {/* The lock — one kill switch, shared with computer control.
          It is toggled in the Computer control section above; this
          panel shows its state and refuses the same way. */}
      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        {locked
          ? 'Locked — the mouse does not move. Unlock it in the Computer control section above.'
          : 'Unlocked — the shared lock with Computer control. Lock it there to refuse all actions instantly.'}
        {stateError ? ` (${stateError})` : ''}
      </p>

      {/* Availability — the macOS permissions gate, read from the
          central permission tracker (Settings → Permissions), the
          same source as the Computer control section. */}
      <div className="flex items-center gap-2 text-xs">
        <ShieldCheck size={14} className="text-[var(--text-muted)] shrink-0" />
        {permSnapshot ? (
          <span className="text-[var(--text-muted)]">
            Accessibility:{' '}
            {permissionStatusLabel(
              permSnapshot.find((s) => s.id === 'accessibility')?.status ?? 'unknown',
            )}
            {' · '}Screen Recording:{' '}
            {permissionStatusLabel(
              permSnapshot.find((s) => s.id === 'screen-recording')?.status ?? 'unknown',
            )}
            {' '}See Settings → Permissions.
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">
            {stateError ?? 'Checking availability…'}
          </span>
        )}
        <button
          type="button"
          onClick={refreshState}
          aria-label="Refresh mouse state"
          className="ml-auto rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Gaps — pointer types that do NOT exist in the code, stated
          as not built, never faked. */}
      <div className="text-xs leading-[1.5] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">Not built yet — </span>
        {POINTER_GAPS.join(' ')}
      </div>
    </div>
  );
}
