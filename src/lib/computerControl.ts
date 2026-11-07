/**
 * Computer-control segment — the pre-installed, agent-only segment
 * (Gary, 2026-11-06 ~11:45 PST): "then thats probably the next
 * important lucid segment that comes pre installed without the ship
 * but just no way to use it without a fairly advance or heavily
 * trained and directed agent".
 *
 * It ships inside Lucid like the terminal does — no starship
 * purchase, no server, fully local. It lets a trained, user-directed
 * agent see the Mac's screen, click and type in apps and browser
 * tabs, and run terminal work, one careful action at a time,
 * verifying every action by reading the screen back afterwards.
 *
 * This module is the PURE core: the observe → plan → act → read-back
 * → decide loop, plus every failsafe, copied 1:1 from the phone
 * setup (see ~/workspace/lucid-computer-control-design.md and
 * ~/workspace/phone-control/server.js). It has NO Electron and NO
 * Node imports — the OS driving is injected as a `ComputerControlDriver`
 * (the real one lives in electron/services/computerControlDriver.ts,
 * AppleScript System Events + screencapture; tests inject a mock).
 * That keeps the loop unit-testable without a Mac.
 *
 * Failsafes (phone setup, mapped 1:1):
 * - SEGMENT LOCK — a kill-switch. When locked, every action is
 *   refused BEFORE anything runs (a 423-style refusal, same as the
 *   phone finger's HTTP 423); observing the screen still works.
 *   The lock is the persisted `computerControlLocked` setting, read
 *   fresh from the settings store on every action by the main
 *   process — the renderer cannot spoof it. The toggle itself is
 *   never blocked: it is always the way back out. When locked, the
 *   closed-loop verification is also off, so the locked machine is
 *   lighter (same latency-softening Gary asked for on the phone).
 * - READ-BACK VERIFICATION — after every action, a fresh observation
 *   is taken and its fingerprint compared with the before-state.
 *   Unchanged = the action did not land (reported as failed, never
 *   hidden). No fresh read-back = UNVERIFIED (never claim success).
 *   Never trust that a sent command worked.
 * - STALE-STATE / RACE GUARDS — every action and observation carries
 *   a sequence number (a causal-order counter, like the Forge's
 *   ritual ticks). A stale observation (older than the action) is
 *   ignored. A lock toggle bumps a lock version; an action whose
 *   lock version changed mid-flight is reported as superseded (only
 *   the latest toggle applies). Focus is re-checked immediately
 *   before typing, so a focus slip cannot send keystrokes to the
 *   wrong window.
 * - ONE WINDOW, ONE TARGET — the segment acts on one verified
 *   target window at a time; switching targets re-verifies focus
 *   from scratch.
 * - TIMEOUT ALWAYS FREES THE SLOT — the driving channel is one
 *   request at a time. A per-action timeout ALWAYS releases the
 *   slot, plus a watchdog that force-releases a stuck action and
 *   records a fault. This is the lesson from 2026-11-06, when one
 *   120s observe timeout never released the channel's single slot
 *   and the channel stayed stuck through two Mac restarts. Lucid's
 *   segment must never fail that way.
 * - PROTECTED TARGETS — a window/tab can be marked off-limits. The
 *   built-in protected target is Gary's ChatGPT tab ("Next Starship
 *   Steps"): never navigated, closed, or typed into. An action on a
 *   protected target is refused before anything runs.
 * - KILL BY EXACT PID ONLY — never by name or pattern. And never
 *   Lucid itself.
 * - NO PASSWORDS, EVER — typing into a focused password field is
 *   refused (the driver reports the focused control's role; a
 *   secure-text / password role refuses the type).
 * - EVERY ACTION TRACES TO A USER DIRECTION — the `direction` field
 *   is required on every action. The segment never acts on its own.
 *
 * The agent-only gate — how "advanced / heavily trained / directed"
 * is enforced in code — is OPEN (Gary's call, 2026-11-06): an
 * allowlist of trained agent identities, a capability check, or
 * user-directed-only. Do NOT present any of those as decided. The
 * local entry point is the IPC bridge
 * (`window.lucidAPI.computerControl`, electron/ipc/computerControl.ts)
 * — an agent running inside Lucid calls it. An EXTERNAL agent
 * (a local MCP server / local API on the Mac) is the open connection
 * step, not built here.
 */

/** One action the segment can perform. `direction` is required —
//  every action traces to a user instruction; the segment never
 *  acts on its own. */
export type ComputerControlActionKind =
  | 'click'
  | 'type'
  | 'key'
  | 'openApp'
  | 'activate'
  | 'killPid';

export interface ComputerControlAction {
  kind: ComputerControlActionKind;
  /** The user instruction this action traces to. Required. */
  direction: string;
  /** App/window id for click / type / key / activate. */
  targetId?: string;
  /** Click coordinates (screen pixels). */
  x?: number;
  y?: number;
  /** Text to type. */
  text?: string;
  /** Key names to press, e.g. ['cmd', 'l'] or ['return']. */
  keys?: string[];
  /** App name to open (openApp). */
  appName?: string;
  /** EXACT pid to kill (killPid) — a number, never a name or pattern. */
  pid?: number;
}

/** One app window the driver can see. */
export interface ComputerControlAppWindow {
  /** Stable id — the app name for its frontmost window. */
  id: string;
  appName: string;
  title: string;
  focused: boolean;
  geometry: { x: number; y: number; width: number; height: number } | null;
}

/** What the driver reports for one observation (before the core
 *  stamps it with a sequence number and a timestamp). */
export interface ComputerControlDriverObservation {
  targetId: string | null;
  /** Is the target the focused / frontmost window right now. */
  focused: boolean;
  /** Role of the focused control, e.g. 'button', 'text field',
   *  'secure text field'. null when it cannot be determined. */
  focusedControlRole: string | null;
  /** Hash of the observed screen state (the target window's
   *  capture). null when no fresh capture could be taken. */
  fingerprint: string | null;
  geometry: { x: number; y: number; width: number; height: number } | null;
  detail: string;
}

/** A stamped observation — the core adds the sequence + time. */
export interface ComputerControlObservation extends ComputerControlDriverObservation {
  /** The core sequence at which this observation was taken. */
  sequence: number;
  /** Date.now() when it was taken. */
  at: number;
}

/** The OS driver — injected so the core stays testable. The real
 *  one is electron/services/computerControlDriver.ts (AppleScript
 *  System Events + screencapture, macOS only). */
export interface ComputerControlDriver {
  listApps(): Promise<ComputerControlAppWindow[]>;
  observe(targetId: string | null): Promise<ComputerControlDriverObservation>;
  click(targetId: string, x: number, y: number): Promise<void>;
  type(targetId: string, text: string): Promise<void>;
  key(targetId: string, keys: string[]): Promise<void>;
  openApp(appName: string): Promise<void>;
  activate(targetId: string): Promise<void>;
  killPid(pid: number): Promise<void>;
  checkAvailability(): Promise<{ available: boolean; reason: string | null }>;
}

/** One entry in the segment's action log (bounded — see below). */
export interface ComputerControlLogEntry {
  sequence: number;
  at: number;
  kind: string;
  targetId: string | null;
  direction: string;
  outcome: 'landed' | 'failed' | 'refused' | 'unverified' | 'superseded' | 'timeout';
  verified: boolean;
  changed: boolean | null;
  reason: string | null;
}

/** A fault the watchdog / timeout recorded — surfaced, never silent. */
export interface ComputerControlFault {
  at: number;
  kind: 'timeout' | 'watchdog' | 'stale' | 'unverified';
  detail: string;
}

/** The segment's state — owned by one core instance (the main
 *  process). The lock itself is the persisted `computerControlLocked`
 *  setting, read fresh on every action; `lockVersion` tracks
 *  toggles so a mid-action toggle is detected. */
export interface ComputerControlState {
  /** Whether the segment lock is on (read fresh from settings). */
  locked: boolean;
  /** Bumps on every lock toggle — out-of-order protection. */
  lockVersion: number;
  /** Last lock value seen — a change bumps lockVersion. */
  lastSeenLocked: boolean;
  /** Causal-order counter — increments on every action. */
  sequence: number;
  /** The current verified target window, if any. */
  targetId: string | null;
  lastObservation: ComputerControlObservation | null;
  log: ComputerControlLogEntry[];
  faults: ComputerControlFault[];
  /** Sequence of the action holding the single-flight slot, if any. */
  slotHeldBy: number | null;
  watchdogTrips: number;
  /** Title substrings that are off-limits (protected targets). */
  protectedTargets: string[];
}

/** What an action returns — never a bare "ok" without proof. */
export interface ComputerControlActionResult {
  ok: boolean;
  /** 423 when the segment lock refused the action (before anything ran). */
  code?: number;
  sequence: number;
  outcome: ComputerControlLogEntry['outcome'];
  /** True only when the read-back proved the action landed. */
  verified: boolean;
  /** Did the screen change? null when there was no read-back. */
  changed: boolean | null;
  reason: string | null;
  before: ComputerControlObservation | null;
  after: ComputerControlObservation | null;
}

/** The segment's state as the UI reads it. */
export interface ComputerControlSegmentState {
  locked: boolean;
  available: boolean;
  availabilityReason: string | null;
  targetId: string | null;
  sequence: number;
  log: ComputerControlLogEntry[];
  faults: ComputerControlFault[];
  watchdogTrips: number;
  protectedTargets: string[];
}

/** Per-action timeout — the slot is ALWAYS freed when this fires,
 *  even if the underlying driver call is still hung (the 2026-11-06
 *  stuck-channel lesson). */
export const COMPUTER_CONTROL_ACTION_TIMEOUT_MS = 30_000;
/** Watchdog deadline — if the slot is still held past this, the
 *  watchdog force-releases it and records a fault. */
export const COMPUTER_CONTROL_WATCHDOG_MS = 60_000;
/** The action log is bounded — old entries drop off the front. */
export const COMPUTER_CONTROL_MAX_LOG_ENTRIES = 50;
/** The built-in protected target — Gary's ChatGPT tab. Never
 *  navigated, closed, or typed into. */
export const COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS: readonly string[] = [
  'Next Starship Steps',
];
/** Focused-control roles that refuse typing — a password field. */
export const COMPUTER_CONTROL_PASSWORD_ROLES: readonly string[] = [
  'secure text field',
  'password',
];

export interface ComputerControlCoreOptions {
  /** How the core reads the lock — the main process reads the
   *  persisted `computerControlLocked` setting (authoritative; the
   *  renderer cannot spoof it). Tests inject a fake. */
  readLocked: () => boolean;
  /** How the core reads the protected targets — the persisted
   *  `computerControlProtectedTargets` setting. */
  readProtectedTargets: () => string[];
  /** Per-action timeout (ms). Default COMPUTER_CONTROL_ACTION_TIMEOUT_MS. */
  actionTimeoutMs?: number;
  /** Watchdog deadline (ms). Default COMPUTER_CONTROL_WATCHDOG_MS. */
  watchdogMs?: number;
  /** The core's own pid — killPid refuses it (never kill Lucid
   *  itself). null when unknown (the pure core never kills). */
  ownPid?: number | null;
}

export interface ComputerControlCore {
  state: ComputerControlState;
  driver: ComputerControlDriver;
  options: Required<Pick<ComputerControlCoreOptions, 'readLocked' | 'readProtectedTargets'>> &
    Pick<ComputerControlCoreOptions, 'actionTimeoutMs' | 'watchdogMs' | 'ownPid'>;
  /** The single-flight slot — a promise chain; each action appends. */
  queue: Promise<void>;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
}

export function createComputerControlState(
  protectedTargets: readonly string[] = COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS,
): ComputerControlState {
  return {
    locked: false,
    lockVersion: 0,
    lastSeenLocked: false,
    sequence: 0,
    targetId: null,
    lastObservation: null,
    log: [],
    faults: [],
    slotHeldBy: null,
    watchdogTrips: 0,
    protectedTargets: [...protectedTargets],
  };
}

export function createComputerControlCore(
  driver: ComputerControlDriver,
  options: ComputerControlCoreOptions,
): ComputerControlCore {
  return {
    state: createComputerControlState(options.readProtectedTargets()),
    driver,
    options: {
      readLocked: options.readLocked,
      readProtectedTargets: options.readProtectedTargets,
      actionTimeoutMs: options.actionTimeoutMs ?? COMPUTER_CONTROL_ACTION_TIMEOUT_MS,
      watchdogMs: options.watchdogMs ?? COMPUTER_CONTROL_WATCHDOG_MS,
      ownPid: options.ownPid ?? null,
    },
    queue: Promise.resolve(),
    watchdogTimer: null,
  };
}

/** Read the lock fresh and bump the lock version when it toggled.
 *  The lock is settled the moment the settings write lands (the
 *  settings store writes synchronously), so there is no settle
 *  delay — the version bump is what catches a mid-action toggle. */
function syncLock(core: ComputerControlCore): boolean {
  const locked = core.options.readLocked();
  if (locked !== core.state.lastSeenLocked) {
    core.state.lockVersion += 1;
    core.state.lastSeenLocked = locked;
  }
  core.state.locked = locked;
  return locked;
}

/** Refresh the protected targets from settings (they can change
 *  while the core is running). */
function syncProtectedTargets(core: ComputerControlCore): void {
  core.state.protectedTargets = [...core.options.readProtectedTargets()];
}

/** Is this target protected? Substring match on the window title —
 *  the built-in protected target is Gary's ChatGPT tab. */
export function isProtectedTarget(
  protectedTargets: readonly string[],
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  for (const protectedTitle of protectedTargets) {
    if (protectedTitle && title.includes(protectedTitle)) return protectedTitle;
  }
  return null;
}

/** Compare the before/after read-back. Unchanged = the action did
 *  not land (failed, never hidden). No fingerprint on either side =
 *  unverified — never claim success without a read-back. */
export function verifyReadBack(
  before: ComputerControlObservation | null,
  after: ComputerControlObservation | null,
): { verified: boolean; changed: boolean | null; reason: string | null } {
  if (!before || !after) {
    return {
      verified: false,
      changed: null,
      reason: 'no fresh read-back after action — never claim success without one',
    };
  }
  if (!before.fingerprint || !after.fingerprint) {
    return {
      verified: false,
      changed: null,
      reason: 'no fingerprint on the read-back — the action is unverified',
    };
  }
  if (before.fingerprint === after.fingerprint) {
    return {
      verified: true,
      changed: false,
      reason: 'screen did not change — the action did not land',
    };
  }
  return { verified: true, changed: true, reason: null };
}

function appendLog(core: ComputerControlCore, entry: ComputerControlLogEntry): void {
  core.state.log.push(entry);
  while (core.state.log.length > COMPUTER_CONTROL_MAX_LOG_ENTRIES) {
    core.state.log.shift();
  }
}

function appendFault(core: ComputerControlCore, fault: ComputerControlFault): void {
  core.state.faults.push(fault);
  while (core.state.faults.length > COMPUTER_CONTROL_MAX_LOG_ENTRIES) {
    core.state.faults.shift();
  }
}

/** Validate one action before anything runs. Returns a refusal
 *  reason, or null when the action is well-formed. */
function validateAction(action: ComputerControlAction): string | null {
  if (!action || typeof action !== 'object') return 'no action given';
  if (!action.direction || typeof action.direction !== 'string' || !action.direction.trim()) {
    return 'every action must trace to a user direction — direction is required';
  }
  switch (action.kind) {
    case 'click':
      if (!action.targetId) return 'click needs a targetId';
      if (typeof action.x !== 'number' || typeof action.y !== 'number') {
        return 'click needs x and y coordinates';
      }
      return null;
    case 'type':
      if (!action.targetId) return 'type needs a targetId';
      if (typeof action.text !== 'string' || action.text.length === 0) {
        return 'type needs text';
      }
      return null;
    case 'key':
      if (!action.targetId) return 'key needs a targetId';
      if (!action.keys || action.keys.length === 0) return 'key needs at least one key';
      return null;
    case 'openApp':
      if (!action.appName) return 'openApp needs an appName';
      return null;
    case 'activate':
      if (!action.targetId) return 'activate needs a targetId';
      return null;
    case 'killPid':
      if (typeof action.pid !== 'number' || !Number.isInteger(action.pid) || action.pid <= 0) {
        return 'killPid needs an exact numeric pid — never a name or pattern';
      }
      return null;
    default:
      return `unknown action kind: ${(action as { kind?: unknown }).kind}`;
  }
}

/** A promise that rejects after ms — the per-action timeout. The
 *  slot is freed in the caller's finally, so the timeout ALWAYS
 *  releases it even when the driver call is still hung. */
function timeoutAfter(ms: number, what: string): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${what}`)), ms);
  });
}

/** Run one action through the full loop:
 *  validate → lock → slot → protected → focus → password →
 *  read-back (before) → act (with timeout) → read-back (after) →
 *  verify → log. The slot is freed in a finally, so it is ALWAYS
 *  released — a timeout, a throw, or a watchdog trip can never
 *  leave the channel stuck (the 2026-11-06 lesson). */
export async function runComputerControlAction(
  core: ComputerControlCore,
  action: ComputerControlAction,
): Promise<ComputerControlActionResult> {
  const state = core.state;
  const sequence = state.sequence + 1;
  const at = Date.now();
  const logEntry = (
    outcome: ComputerControlLogEntry['outcome'],
    verified: boolean,
    changed: boolean | null,
    reason: string | null,
  ): ComputerControlLogEntry => ({
    sequence,
    at,
    kind: action?.kind ?? 'unknown',
    targetId: action?.targetId ?? null,
    direction: action?.direction ?? '',
    outcome,
    verified,
    changed,
    reason,
  });
  const refuse = (
    reason: string,
    code?: number,
  ): ComputerControlActionResult => {
    const entry = logEntry('refused', false, null, reason);
    appendLog(core, entry);
    return { ok: false, code, sequence, outcome: 'refused', verified: false, changed: null, reason, before: null, after: null };
  };

  // 1. Validate — before anything runs, before the slot is touched.
  const invalid = validateAction(action);
  if (invalid) return refuse(invalid);

  // 2. Lock — read fresh from settings, before anything runs. A
  //    locked segment refuses with a 423-style refusal and the
  //    driver is never called.
  syncLock(core);
  syncProtectedTargets(core);
  if (state.locked) {
    return refuse('computer-control segment is locked — unlock it to let a trained agent drive', 423);
  }

  // 3. The single-flight slot — one request at a time. The action
  //    waits for the slot; the wait itself times out.
  const slotWait = core.queue.then(() => undefined);
  let slotAcquired = false;
  try {
    await Promise.race([slotWait, timeoutAfter(core.options.actionTimeoutMs ?? COMPUTER_CONTROL_ACTION_TIMEOUT_MS, 'waiting for the computer-control slot')]);
    slotAcquired = true;
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'timed out waiting for the slot';
    appendFault(core, { at: Date.now(), kind: 'timeout', detail: reason });
    const entry = logEntry('timeout', false, null, reason);
    appendLog(core, entry);
    return { ok: false, sequence, outcome: 'timeout', verified: false, changed: null, reason, before: null, after: null };
  }
  // The slot is now held by this action. Chain the queue behind a
  // promise this action resolves in its finally — the next action
  // waits for it.
  let releaseSlot: () => void = () => undefined;
  const slotPromise = new Promise<void>((resolve) => {
    releaseSlot = resolve;
  });
  core.queue = core.queue.then(() => slotPromise);
  state.slotHeldBy = sequence;

  // 4. Watchdog — if the slot is still held past the watchdog
  //    deadline, force-release it and record a fault. The per-action
  //    timeout below is the first layer; this is the second.
  const watchdogMs = core.options.watchdogMs ?? COMPUTER_CONTROL_WATCHDOG_MS;
  if (core.watchdogTimer) clearTimeout(core.watchdogTimer);
  core.watchdogTimer = setTimeout(() => {
    if (state.slotHeldBy === sequence) {
      state.watchdogTrips += 1;
      appendFault(core, {
        at: Date.now(),
        kind: 'watchdog',
        detail: `slot still held by action ${sequence} after ${watchdogMs}ms — force-released`,
      });
      state.slotHeldBy = null;
      releaseSlot();
    }
  }, watchdogMs);

  const lockVersionAtStart = state.lockVersion;
  let before: ComputerControlObservation | null = null;
  let after: ComputerControlObservation | null = null;
  try {
    // 5. Re-check the lock after acquiring the slot — it may have
    //    toggled while this action waited (lock-settle).
    syncLock(core);
    if (state.locked) {
      return refuse('computer-control segment was locked while this action waited for the slot', 423);
    }

    // 6. Protected targets — refuse before anything runs. The
    //    title comes from a fresh listApps read.
    if (action.kind === 'click' || action.kind === 'type' || action.kind === 'key' || action.kind === 'activate') {
      const targetId = action.targetId as string;
      let apps: ComputerControlAppWindow[] = [];
      try {
        apps = await Promise.race([
          core.driver.listApps(),
          timeoutAfter(core.options.actionTimeoutMs ?? COMPUTER_CONTROL_ACTION_TIMEOUT_MS, 'listing apps for the protected-target check'),
        ]);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'could not list apps for the protected-target check';
        appendFault(core, { at: Date.now(), kind: 'timeout', detail: reason });
        const entry = logEntry('timeout', false, null, reason);
        appendLog(core, entry);
        return { ok: false, sequence, outcome: 'timeout', verified: false, changed: null, reason, before: null, after: null };
      }
      const target = apps.find((a) => a.id === targetId);
      const hit = isProtectedTarget(state.protectedTargets, target?.title ?? targetId);
      if (hit) {
        return refuse(`target is protected (${hit}) — never navigated, closed, or typed into`);
      }
    }

    // 7. Kill-by-pid guard — never Lucid itself.
    if (action.kind === 'killPid' && core.options.ownPid != null && action.pid === core.options.ownPid) {
      return refuse('will not kill Lucid itself — kill by exact pid only, never the app');
    }

    // 8. Focus check + read-back (before) — a fresh observation,
    //    immediately before acting. The target must be focused, or
    //    the action is refused (a focus slip cannot send keystrokes
    //    to the wrong window). The observation IS the before-state.
    if (action.kind === 'click' || action.kind === 'type' || action.kind === 'key' || action.kind === 'activate') {
      const targetId = action.targetId as string;
      let raw: ComputerControlDriverObservation;
      try {
        raw = await Promise.race([
          core.driver.observe(targetId),
          timeoutAfter(core.options.actionTimeoutMs ?? COMPUTER_CONTROL_ACTION_TIMEOUT_MS, 'observing the target before acting'),
        ]);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'could not observe the target before acting';
        appendFault(core, { at: Date.now(), kind: 'timeout', detail: reason });
        const entry = logEntry('timeout', false, null, reason);
        appendLog(core, entry);
        return { ok: false, sequence, outcome: 'timeout', verified: false, changed: null, reason, before: null, after: null };
      }
      before = { ...raw, sequence, at: Date.now() };
      state.lastObservation = before;
      state.targetId = targetId;
      if (!before.focused) {
        return refuse('target is not focused — focus was not verified, so nothing was typed or clicked');
      }
      // 9. Password check — never type into a password field.
      if (
        action.kind === 'type' &&
        before.focusedControlRole &&
        COMPUTER_CONTROL_PASSWORD_ROLES.includes(before.focusedControlRole.toLowerCase())
      ) {
        return refuse('will not type into a password field — passwords are never typed by the agent');
      }
    }

    // 10. Act — exactly one action, with the per-action timeout.
    const actionTimeoutMs = core.options.actionTimeoutMs ?? COMPUTER_CONTROL_ACTION_TIMEOUT_MS;
    try {
      const run = (async (): Promise<void> => {
        switch (action.kind) {
          case 'click':
            await core.driver.click(action.targetId as string, action.x as number, action.y as number);
            break;
          case 'type':
            await core.driver.type(action.targetId as string, action.text as string);
            break;
          case 'key':
            await core.driver.key(action.targetId as string, action.keys as string[]);
            break;
          case 'openApp':
            await core.driver.openApp(action.appName as string);
            break;
          case 'activate':
            await core.driver.activate(action.targetId as string);
            break;
          case 'killPid':
            await core.driver.killPid(action.pid as number);
            break;
        }
      })();
      await Promise.race([run, timeoutAfter(actionTimeoutMs, `action ${action.kind}`)]);
    } catch (e) {
      const reason = e instanceof Error ? e.message : `action ${action.kind} failed`;
      appendFault(core, { at: Date.now(), kind: 'timeout', detail: reason });
      const entry = logEntry('timeout', false, null, reason);
      appendLog(core, entry);
      return { ok: false, sequence, outcome: 'timeout', verified: false, changed: null, reason, before, after: null };
    }
    state.sequence = sequence;

    // 11. Read-back (after) — a FRESH observation, forced (never a
    //     cached frame). A stale observation is ignored: the core
    //     stamps it with this action's sequence, so an older one
    //     cannot stand in for it.
    if (action.kind === 'click' || action.kind === 'type' || action.kind === 'key' || action.kind === 'activate' || action.kind === 'openApp') {
      const targetId = action.targetId ?? action.appName ?? null;
      let rawAfter: ComputerControlDriverObservation | null = null;
      try {
        rawAfter = await Promise.race([
          core.driver.observe(targetId),
          timeoutAfter(actionTimeoutMs, 'reading back after the action'),
        ]);
      } catch {
        rawAfter = null;
      }
      after = rawAfter ? { ...rawAfter, sequence, at: Date.now() } : null;
      if (after) state.lastObservation = after;
    }

    // 12. Lock-version check — a toggle mid-action supersedes the
    //     verdict (only the latest toggle applies; the agent must
    //     re-observe and decide).
    syncLock(core);
    if (state.lockVersion !== lockVersionAtStart) {
      const entry = logEntry('superseded', false, null, 'the segment lock toggled while this action ran — the verdict is not trusted, re-observe and decide');
      appendLog(core, entry);
      return { ok: false, sequence, outcome: 'superseded', verified: false, changed: null, reason: 'the segment lock toggled while this action ran — the verdict is not trusted, re-observe and decide', before, after };
    }

    // 13. Verify — the read-back decides. Unchanged = failed (the
    //     action did not land). No read-back = unverified.
    if (action.kind === 'killPid') {
      // A kill has no screen to read back — it is verified by the
      // driver not throwing (the pid is gone). The log says so.
      const entry = logEntry('landed', true, null, 'killed by exact pid — no screen read-back applies');
      appendLog(core, entry);
      return { ok: true, sequence, outcome: 'landed', verified: true, changed: null, reason: null, before, after };
    }
    const verdict = verifyReadBack(before, after);
    if (!verdict.verified) {
      appendFault(core, { at: Date.now(), kind: 'unverified', detail: verdict.reason ?? 'unverified' });
      const entry = logEntry('unverified', false, null, verdict.reason);
      appendLog(core, entry);
      return { ok: false, sequence, outcome: 'unverified', verified: false, changed: null, reason: verdict.reason, before, after };
    }
    if (!verdict.changed) {
      const entry = logEntry('failed', true, false, verdict.reason);
      appendLog(core, entry);
      return { ok: false, sequence, outcome: 'failed', verified: true, changed: false, reason: verdict.reason, before, after };
    }
    const entry = logEntry('landed', true, true, null);
    appendLog(core, entry);
    return { ok: true, sequence, outcome: 'landed', verified: true, changed: true, reason: null, before, after };
  } finally {
    // The slot is ALWAYS freed — timeout, throw, refusal, or
    // watchdog, the finally runs. This is the 2026-11-06 lesson:
    // a stuck slot must never survive the action that held it.
    if (core.watchdogTimer) {
      clearTimeout(core.watchdogTimer);
      core.watchdogTimer = null;
    }
    if (slotAcquired && state.slotHeldBy === sequence) {
      state.slotHeldBy = null;
    }
    releaseSlot();
  }
}

/** Read-only: list the apps/windows. Never blocked by the lock. */
export async function listComputerControlApps(core: ComputerControlCore): Promise<ComputerControlAppWindow[]> {
  return core.driver.listApps();
}

/** Read-only: observe a target. Never blocked by the lock. The
 *  observation is stamped with the next sequence so a stale one
 *  cannot be mistaken for fresh. */
export async function observeComputerControl(
  core: ComputerControlCore,
  targetId: string | null,
): Promise<ComputerControlObservation> {
  const raw = await core.driver.observe(targetId);
  const stamped: ComputerControlObservation = {
    ...raw,
    sequence: core.state.sequence,
    at: Date.now(),
  };
  core.state.lastObservation = stamped;
  if (targetId) core.state.targetId = targetId;
  return stamped;
}

/** A snapshot of the segment for the UI — the lock is read fresh
 *  from settings, availability from the driver. */
export async function getComputerControlSegmentState(
  core: ComputerControlCore,
): Promise<ComputerControlSegmentState> {
  syncLock(core);
  syncProtectedTargets(core);
  let available = false;
  let availabilityReason: string | null = null;
  try {
    const check = await core.driver.checkAvailability();
    available = check.available;
    availabilityReason = check.reason;
  } catch (e) {
    available = false;
    availabilityReason = e instanceof Error ? e.message : 'availability check failed';
  }
  return {
    locked: core.state.locked,
    available,
    availabilityReason,
    targetId: core.state.targetId,
    sequence: core.state.sequence,
    log: [...core.state.log].reverse(),
    faults: [...core.state.faults].reverse(),
    watchdogTrips: core.state.watchdogTrips,
    protectedTargets: [...core.state.protectedTargets],
  };
}
