/**
 * The Mouse — every pointer Lucid has, mice and finger pointers
 * alike (Gary, 2026-11-09 ~15:07–15:11 PST): "how was your mouse
 * created exactlyt and how do we make one for lucid" + "another
 * segment" + "and plugin" + "and make a repo for it too" + "yes
 * all the mouses and finger pointers like the android ones go in
 * there so what is there".
 *
 * The inventory below is read from the actual code — nothing is
 * invented here. Three pointer types exist today:
 *
 * - Mac mouse — the computer-control driver
 *   (electron/services/computerControlDriver.ts): AppleScript
 *   System Events `click at`, `keystroke`, `key code`; screencapture
 *   fingerprint for the read-back. macOS only. Core in
 *   src/lib/computerControl.ts: lock (423 refusal before anything
 *   runs), read-back verification, stale/race guards, protected
 *   targets, single-flight slot, 30s timeout + 60s watchdog,
 *   bounded 50-entry log. The Mouse REUSES this driver — it does
 *   not build a new one.
 * - Browser mouse — the live separate mouse locked to the browser
 *   area (src/lib/browserAgent.ts: clampAgentMousePosition;
 *   electron/services/browserCdp.ts: CDP Input.dispatchMouseEvent;
 *   src/components/Browser/AgentMouseCursor.tsx: the DOM cursor
 *   fallback + the CDP-injected in-page cursor; the finger queue in
 *   electron/services/browserFingerQueue.ts: one agent at a time,
 *   queued, lockable). Gary can take control back.
 * - Android finger — the scrcpy touch pointer
 *   (src/phone/streaming.ts: 32-byte INJECT_TOUCH_EVENT — pointer
 *   id, position, pressure; src/components/Phone/PhoneView.tsx:
 *   PointerEvent to window.lucidAPI.android.touch, one finger at a
 *   time; electron/services/scrcpy.ts: the session manager, control
 *   socket carries the 32-byte touch messages). Driven by your own
 *   pointer on the phone view today.
 *
 * What does NOT exist (gaps, stated honestly — POINTER_GAPS):
 * multi-touch (one finger only), stylus, trackpad gestures,
 * Windows/Linux pointer drivers, iOS pointer. The scrcpy server
 * jar is NOT bundled yet — Gary has not answered whether it ships
 * inside Lucid or downloads on first use — so Android touch works
 * only when the jar is present.
 *
 * This module is pure (no Electron, no React) so it is
 * unit-testable: the pointer registry + the status line the Mouse
 * segment panel shows.
 */

/** The pointer types that exist in the code today. */
export type PointerKind = 'mac-mouse' | 'browser-mouse' | 'android-finger';

/** One pointer type in the registry — grounded in the code that drives it. */
export interface PointerTypeInfo {
  /** Stable id. */
  id: PointerKind;
  /** Display name. */
  name: string;
  /** Where it points. */
  where: string;
  /** What drives it — the code, named. */
  driver: string;
  /** True when the pointer is built and working in the code. */
  built: boolean;
  /** The honest caveat, if any. */
  note: string;
}

/** Every pointer Lucid has — the registry the Mouse segment lists. */
export const POINTER_TYPES: readonly PointerTypeInfo[] = [
  {
    id: 'mac-mouse',
    name: 'Mac mouse',
    where: 'On the Mac, in any app window',
    driver:
      'Computer control — AppleScript System Events click at, keystroke, key code; screencapture fingerprint read-back',
    built: true,
    note: 'macOS only. Lock, read-back verification, watchdog, protected targets.',
  },
  {
    id: 'browser-mouse',
    name: 'Browser mouse',
    where: 'Inside the browser area, never outside it',
    driver:
      'CDP Input.dispatchMouseEvent, clamped to the browser view bounds; one agent at a time through the finger queue',
    built: true,
    note: 'A live separate pointer with an Agent tag. Gary can take control back.',
  },
  {
    id: 'android-finger',
    name: 'Android finger',
    where: 'On the Android phone screen, through the phone view',
    driver:
      'scrcpy INJECT_TOUCH_EVENT — pointer id, position, pressure; one finger at a time',
    built: true,
    note: 'The scrcpy server jar is not bundled yet — Gary has not answered whether it ships inside Lucid or downloads on first use. No multi-touch: one finger only.',
  },
];

/** Pointer types that do NOT exist in the code — gaps, not fakes. */
export const POINTER_GAPS: readonly string[] = [
  'Multi-touch — the phone view tracks one finger only (pointer id one).',
  'Stylus — no pen, tilt, or pressure levels beyond touch down and up.',
  'Trackpad gestures — no trackpad-specific pointer in the code.',
  'Windows and Linux — the Mac driver is macOS only; no pointer driver for other systems.',
  'iOS — no iOS pointer in the code.',
];

/** What the Mouse segment panel needs to describe the mouse state. */
export interface MouseStatusInput {
  /** The shared computer-control lock — one kill switch for the Mac mouse. */
  locked: boolean;
  /** The live browser mouse position, null when hidden or idle. */
  browserMouse: { x: number; y: number } | null;
  /** The last computer-control log entry, if any. */
  lastAction: { kind: string; outcome: string; verified: boolean } | null;
  /** Android devices connected (from adb listDevices), null when unknown. */
  androidDevices: number | null;
}

/** One status line for the panel: a short status + the detail under it. */
export interface MouseStatus {
  status: string;
  detail: string;
}

/**
 * Describe the mouse state for the panel. Locked wins over
 * everything (the kill switch); then the live browser mouse; then
 * the last Mac action; then idle. Android device count is reported
 * in the detail line, never invented as a position.
 */
export function describeMouseStatus(input: MouseStatusInput): MouseStatus {
  if (input.locked) {
    return {
      status: 'Locked',
      detail:
        'The mouse does not move — every action is refused before anything runs. Unlock it in the Computer control section.',
    };
  }
  if (input.browserMouse) {
    return {
      status: 'In the browser area',
      detail: `Live pointer at ${Math.round(input.browserMouse.x)}, ${Math.round(input.browserMouse.y)} — locked inside the browser area, never outside it.`,
    };
  }
  if (input.lastAction) {
    return {
      status: `Last action: ${input.lastAction.kind} — ${input.lastAction.outcome}`,
      detail: input.lastAction.verified
        ? 'Verified by reading the screen back afterwards.'
        : 'Not verified — no fresh read-back after the action.',
    };
  }
  return {
    status: 'Idle',
    detail: 'No actions yet — the mouse moves only when it is driven.',
  };
}

/** The Android finger line — device count from adb, honestly unknown when null. */
export function describeAndroidFinger(androidDevices: number | null): string {
  if (androidDevices === null) return 'Android finger — device state unknown.';
  if (androidDevices === 0) return 'Android finger — no Android device connected. See Devices.';
  return `Android finger — ${androidDevices === 1 ? 'one device' : `${androidDevices} devices`} connected. One finger at a time.`;
}
