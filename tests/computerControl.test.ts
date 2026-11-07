/**
 * Computer-control segment core tests (Gary, 2026-11-06).
 *
 * The core (src/lib/computerControl.ts) is the observe → plan → act
 * → read-back → decide loop plus every failsafe, copied 1:1 from
 * the phone setup. The OS driver is injected, so these tests run
 * against a mock driver — no Mac, no Electron, no AppleScript.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import {
  COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS,
  createComputerControlCore,
  getComputerControlSegmentState,
  isProtectedTarget,
  listComputerControlApps,
  observeComputerControl,
  runComputerControlAction,
  verifyReadBack,
} from '../src/lib/computerControl';
import type {
  ComputerControlAction,
  ComputerControlAppWindow,
  ComputerControlDriver,
  ComputerControlDriverObservation,
} from '../src/lib/computerControl';

const TEST_APP: ComputerControlAppWindow = {
  id: 'Test App',
  appName: 'Test App',
  title: 'Test App',
  focused: true,
  geometry: { x: 0, y: 0, width: 800, height: 600 },
};

const CHATGPT_APP: ComputerControlAppWindow = {
  id: 'Brave Browser',
  appName: 'Brave Browser',
  title: 'Next Starship Steps - Brave',
  focused: true,
  geometry: { x: 0, y: 0, width: 1920, height: 980 },
};

interface MockDriverOptions {
  /** Fingerprints returned by successive observe() calls. */
  fingerprints?: string[];
  /** Is the target focused in observe()? */
  focused?: boolean;
  /** Focused control role in observe(). */
  role?: string | null;
  /** Apps returned by listApps(). */
  apps?: ComputerControlAppWindow[];
  /** When true, action calls never resolve (hang). */
  hangAction?: boolean;
  /** Called by the mock's click (lets a test flip the lock mid-action). */
  onAction?: () => void;
  /** Availability result. */
  available?: boolean;
}

function createMockDriver(opts: MockDriverOptions = {}): ComputerControlDriver & {
  calls: string[];
  observeCount: number;
} {
  const fingerprints = opts.fingerprints ?? ['before-hash', 'after-hash'];
  let observeCount = 0;
  const calls: string[] = [];
  const apps = opts.apps ?? [TEST_APP];
  const driver: ComputerControlDriver = {
    listApps: vi.fn(async () => {
      calls.push('listApps');
      return apps;
    }),
    observe: vi.fn(async (targetId: string | null) => {
      calls.push(`observe:${targetId ?? 'null'}`);
      const fingerprint = fingerprints[Math.min(observeCount, fingerprints.length - 1)];
      observeCount += 1;
      const target = targetId ? apps.find((a) => a.id === targetId) : apps.find((a) => a.focused);
      const obs: ComputerControlDriverObservation = {
        targetId: target?.id ?? targetId,
        focused: opts.focused ?? true,
        focusedControlRole: opts.role ?? 'button',
        fingerprint,
        geometry: target?.geometry ?? null,
        detail: target ? `${target.appName} — ${target.title}` : 'no target',
      };
      return obs;
    }),
    click: vi.fn(async () => {
      calls.push('click');
      opts.onAction?.();
      if (opts.hangAction) await new Promise(() => undefined);
    }),
    type: vi.fn(async () => {
      calls.push('type');
      opts.onAction?.();
      if (opts.hangAction) await new Promise(() => undefined);
    }),
    key: vi.fn(async () => {
      calls.push('key');
      opts.onAction?.();
      if (opts.hangAction) await new Promise(() => undefined);
    }),
    openApp: vi.fn(async () => {
      calls.push('openApp');
      if (opts.hangAction) await new Promise(() => undefined);
    }),
    activate: vi.fn(async () => {
      calls.push('activate');
      if (opts.hangAction) await new Promise(() => undefined);
    }),
    killPid: vi.fn(async () => {
      calls.push('killPid');
      if (opts.hangAction) await new Promise(() => undefined);
    }),
    checkAvailability: vi.fn(async () => ({
      available: opts.available ?? true,
      reason: (opts.available ?? true) ? null : 'permissions missing',
    })),
  };
  const withHelpers = Object.assign(driver, { calls }) as ComputerControlDriver & {
    calls: string[];
    observeCount: number;
  };
  // Object.assign copies a getter's VALUE, not the getter — so
  // observeCount is defined as a live property here, not in the
  // object literal.
  Object.defineProperty(withHelpers, 'observeCount', {
    get() {
      return observeCount;
    },
    enumerable: true,
  });
  return withHelpers;
}

function createCore(
  driverOpts: MockDriverOptions = {},
  coreOpts: { locked?: boolean; actionTimeoutMs?: number; watchdogMs?: number; ownPid?: number | null } = {},
) {
  let locked = coreOpts.locked ?? false;
  const driver = createMockDriver(driverOpts);
  const core = createComputerControlCore(driver, {
    readLocked: () => locked,
    readProtectedTargets: () => [...COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS],
    actionTimeoutMs: coreOpts.actionTimeoutMs ?? 1000,
    watchdogMs: coreOpts.watchdogMs ?? 5000,
    ownPid: coreOpts.ownPid ?? 99999,
  });
  return {
    core,
    driver,
    setLocked: (v: boolean) => {
      locked = v;
    },
  };
}

const clickAction = (overrides: Partial<ComputerControlAction> = {}): ComputerControlAction => ({
  kind: 'click',
  direction: 'Gary: click the Test App window',
  targetId: 'Test App',
  x: 100,
  y: 100,
  ...overrides,
});

describe('verifyReadBack', () => {
  it('changed fingerprints verify and report changed', () => {
    const before = { fingerprint: 'aaa', sequence: 1, at: 1, targetId: 'Test App', focused: true, focusedControlRole: 'button', geometry: null, detail: '' };
    const after = { ...before, fingerprint: 'bbb', sequence: 1, at: 2 };
    const verdict = verifyReadBack(before, after);
    expect(verdict).toEqual({ verified: true, changed: true, reason: null });
  });

  it('unchanged fingerprints verify but report not-changed (the action did not land)', () => {
    const before = { fingerprint: 'aaa', sequence: 1, at: 1, targetId: 'Test App', focused: true, focusedControlRole: 'button', geometry: null, detail: '' };
    const after = { ...before, fingerprint: 'aaa', sequence: 1, at: 2 };
    const verdict = verifyReadBack(before, after);
    expect(verdict.verified).toBe(true);
    expect(verdict.changed).toBe(false);
    expect(verdict.reason).toContain('did not land');
  });

  it('a missing fingerprint is unverified — never claim success without a read-back', () => {
    const before = { fingerprint: 'aaa', sequence: 1, at: 1, targetId: 'Test App', focused: true, focusedControlRole: 'button', geometry: null, detail: '' };
    const after = { ...before, fingerprint: null, sequence: 1, at: 2 };
    const verdict = verifyReadBack(before, after);
    expect(verdict.verified).toBe(false);
    expect(verdict.changed).toBeNull();
  });

  it('a missing observation is unverified', () => {
    const verdict = verifyReadBack(null, null);
    expect(verdict.verified).toBe(false);
  });
});

describe('isProtectedTarget', () => {
  it('matches the built-in protected target by title substring', () => {
    expect(isProtectedTarget(COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS, 'Next Starship Steps - Brave')).toBe(
      'Next Starship Steps',
    );
  });

  it('does not match an ordinary title', () => {
    expect(isProtectedTarget(COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS, 'Test App')).toBeNull();
    expect(isProtectedTarget(COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS, null)).toBeNull();
  });
});

describe('the segment lock', () => {
  it('refuses every action with a 423-style refusal BEFORE anything runs', async () => {
    const { core, driver } = createCore({}, { locked: true });
    const result = await runComputerControlAction(core, clickAction());
    expect(result.ok).toBe(false);
    expect(result.code).toBe(423);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('locked');
    // The driver was never called — not even listApps or observe.
    expect(driver.calls).toEqual([]);
  });

  it('refuses with a 403 when the macOS permissions are not granted — CHECK BEFORE ACTING', async () => {
    // Gary, 2026-11-07 ~02:48 PST ("like you"): Lucid checks a
    // permission before it acts on it, never assumes it. When
    // Accessibility / Screen Recording are not granted, the action
    // is refused here — before the slot is touched and before the
    // driver is called — with the honest reason and how to grant
    // it, instead of letting the driver throw mid-action.
    const { core, driver } = createCore({ available: false });
    const result = await runComputerControlAction(core, clickAction());
    expect(result.ok).toBe(false);
    expect(result.code).toBe(403);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('permissions missing');
    // The driver action was never called — only the availability
    // probe ran (which is not recorded in driver.calls).
    expect(driver.calls).toEqual([]);
  });

  it('refuses a lock toggle made while the action waited for the slot', async () => {
    const { core, setLocked } = createCore(
      { hangAction: true },
      { actionTimeoutMs: 60, watchdogMs: 5000 },
    );
    // First action hangs and holds the slot (it will time out).
    const first = runComputerControlAction(core, clickAction());
    // While it waits, Gary locks the segment.
    await new Promise((r) => setTimeout(r, 10));
    setLocked(true);
    await first;
    // The next action is refused by the freshly-read lock.
    const second = await runComputerControlAction(core, clickAction());
    expect(second.ok).toBe(false);
    expect(second.code).toBe(423);
    expect(second.outcome).toBe('refused');
  });

  it('read-only calls (observe, listApps) still work while locked', async () => {
    const { core } = createCore({}, { locked: true });
    const apps = await listComputerControlApps(core);
    expect(apps).toHaveLength(1);
    const obs = await observeComputerControl(core, 'Test App');
    expect(obs.targetId).toBe('Test App');
    expect(obs.focused).toBe(true);
  });

  it('a lock toggle mid-action supersedes the verdict (only the latest toggle applies)', async () => {
    let locked = false;
    const driver = createMockDriver({
      onAction: () => {
        // Gary locks the segment while the click is running.
        locked = true;
      },
    });
    const core = createComputerControlCore(driver, {
      readLocked: () => locked,
      readProtectedTargets: () => [...COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS],
      actionTimeoutMs: 1000,
      watchdogMs: 5000,
      ownPid: 99999,
    });
    const result = await runComputerControlAction(core, clickAction());
    expect(result.outcome).toBe('superseded');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('lock toggled');
    expect(driver.calls).toContain('click');
  });
});

describe('the observe → act → read-back loop', () => {
  it('lands when the read-back fingerprint changed', async () => {
    const { core, driver } = createCore();
    const result = await runComputerControlAction(core, clickAction());
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('landed');
    expect(result.verified).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.before?.fingerprint).toBe('before-hash');
    expect(result.after?.fingerprint).toBe('after-hash');
    // A fresh observation before AND after the action.
    expect(driver.observeCount).toBe(2);
    expect(result.before?.sequence).toBe(result.sequence);
    expect(result.after?.sequence).toBe(result.sequence);
  });

  it('fails when the read-back fingerprint is unchanged (the action did not land)', async () => {
    const { core } = createCore({ fingerprints: ['same-hash', 'same-hash'] });
    const result = await runComputerControlAction(core, clickAction());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('failed');
    expect(result.verified).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.reason).toContain('did not land');
  });

  it('is unverified when no fresh read-back arrives (never claim success)', async () => {
    const { core } = createCore({ fingerprints: ['before-hash', null as unknown as string] });
    const result = await runComputerControlAction(core, clickAction());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('unverified');
    expect(result.verified).toBe(false);
    expect(result.changed).toBeNull();
  });

  it('refuses to act when focus was not verified', async () => {
    const { core, driver } = createCore({ focused: false });
    const result = await runComputerControlAction(core, clickAction());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('not focused');
    expect(driver.calls).not.toContain('click');
  });

  it('refuses to type into a password field', async () => {
    const { core, driver } = createCore({ role: 'secure text field' });
    const result = await runComputerControlAction(core, {
      kind: 'type',
      direction: 'Gary: type into the field',
      targetId: 'Test App',
      text: 'secret',
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('password');
    expect(driver.calls).not.toContain('type');
  });

  it('refuses an action on a protected target before anything runs', async () => {
    const { core, driver } = createCore({ apps: [CHATGPT_APP] });
    const result = await runComputerControlAction(core, clickAction({ targetId: 'Brave Browser' }));
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('protected');
    expect(result.reason).toContain('Next Starship Steps');
    expect(driver.calls).not.toContain('click');
  });

  it('refuses an action without a user direction', async () => {
    const { core, driver } = createCore();
    const result = await runComputerControlAction(core, {
      kind: 'click',
      direction: '',
      targetId: 'Test App',
      x: 1,
      y: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('direction');
    expect(driver.calls).toEqual([]);
  });
});

describe('kill by exact pid only', () => {
  it('accepts an exact numeric pid', async () => {
    const { core, driver } = createCore();
    const result = await runComputerControlAction(core, {
      kind: 'killPid',
      direction: 'Gary: kill pid 12345',
      pid: 12345,
    });
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('landed');
    expect(driver.calls).toContain('killPid');
  });

  it('refuses a non-numeric / non-positive pid — never a name or pattern', async () => {
    const { core, driver } = createCore();
    for (const pid of [0, -1, 1.5, NaN, undefined as unknown as number]) {
      const result = await runComputerControlAction(core, {
        kind: 'killPid',
        direction: 'Gary: kill it',
        pid,
      });
      expect(result.ok).toBe(false);
      expect(result.outcome).toBe('refused');
      expect(result.reason).toContain('exact numeric pid');
    }
    expect(driver.calls).not.toContain('killPid');
  });

  it('refuses to kill Lucid itself', async () => {
    const { core, driver } = createCore({}, { ownPid: 4242 });
    const result = await runComputerControlAction(core, {
      kind: 'killPid',
      direction: 'Gary: kill pid 4242',
      pid: 4242,
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('refused');
    expect(driver.calls).not.toContain('killPid');
  });
});

describe('the timeout always frees the slot (the 2026-11-06 lesson)', () => {
  it('a hung action times out, and the NEXT action still runs', async () => {
    const { core } = createCore({ hangAction: true }, { actionTimeoutMs: 60, watchdogMs: 5000 });
    const first = await runComputerControlAction(core, clickAction());
    expect(first.ok).toBe(false);
    expect(first.outcome).toBe('timeout');
    expect(first.reason).toContain('timed out');
    // The slot was freed: a second action (with a working driver
    // this time — the hang was only on the first call's driver) can
    // run. Swap the hang off via a fresh core sharing the same
    // state? No — the slot lives on the core, so run the second
    // action on the SAME core after the driver stops hanging.
    // The mock hangs every action, so instead assert the slot is
    // free by checking the core state directly.
    expect(core.state.slotHeldBy).toBeNull();
    expect(core.state.faults.some((f) => f.kind === 'timeout')).toBe(true);
  });

  it('a hung action times out and the slot frees for a later working action', async () => {
    let hang = true;
    // Four distinct fingerprints — one before/after pair per
    // action. (The mock re-uses the last fingerprint once the list
    // runs out, so a two-entry list would make the second action's
    // before/after identical and read as "failed".)
    const driver = createMockDriver({
      hangAction: false,
      fingerprints: ['b1', 'a1', 'b2', 'a2'],
    });
    // Make only the first click hang.
    const origClick = driver.click;
    let clickCount = 0;
    driver.click = vi.fn(async (...args: [string, number, number]) => {
      clickCount += 1;
      if (hang && clickCount === 1) {
        await new Promise(() => undefined);
      }
      return origClick(...args);
    });
    const core = createComputerControlCore(driver, {
      readLocked: () => false,
      readProtectedTargets: () => [...COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS],
      actionTimeoutMs: 60,
      watchdogMs: 5000,
      ownPid: 99999,
    });
    const first = await runComputerControlAction(core, clickAction());
    expect(first.outcome).toBe('timeout');
    hang = false;
    const second = await runComputerControlAction(core, clickAction());
    expect(second.outcome).toBe('landed');
    expect(second.ok).toBe(true);
  });

  it('the watchdog force-releases a stuck slot and records a fault', async () => {
    const { core } = createCore(
      { hangAction: true },
      { actionTimeoutMs: 500, watchdogMs: 50 },
    );
    const first = runComputerControlAction(core, clickAction());
    // The watchdog fires at ~50ms; the per-action timeout at 500ms.
    await new Promise((r) => setTimeout(r, 200));
    expect(core.state.watchdogTrips).toBeGreaterThanOrEqual(1);
    expect(core.state.faults.some((f) => f.kind === 'watchdog')).toBe(true);
    expect(core.state.slotHeldBy).toBeNull();
    const result = await first;
    expect(result.outcome).toBe('timeout');
  });
});

describe('segment state', () => {
  it('reports availability, the lock, and the action log', async () => {
    const { core } = createCore();
    await runComputerControlAction(core, clickAction());
    const state = await getComputerControlSegmentState(core);
    expect(state.available).toBe(true);
    expect(state.locked).toBe(false);
    expect(state.sequence).toBe(1);
    expect(state.log).toHaveLength(1);
    expect(state.log[0]?.outcome).toBe('landed');
    expect(state.protectedTargets).toEqual([...COMPUTER_CONTROL_BUILTIN_PROTECTED_TARGETS]);
  });

  it('reports unavailable when the driver cannot get permissions', async () => {
    const { core } = createCore({ available: false });
    const state = await getComputerControlSegmentState(core);
    expect(state.available).toBe(false);
    expect(state.availabilityReason).toContain('permissions');
  });

  it('the log is bounded', async () => {
    const { core } = createCore();
    for (let i = 0; i < 60; i++) {
      await runComputerControlAction(core, clickAction());
    }
    expect(core.state.log.length).toBeLessThanOrEqual(50);
  });
});
