/**
 * Terminal GPU rendering
 * (src/lib/terminalRenderer.ts).
 *
 * Covers the pure lib only, so these run in the node test env
 * with no canvas, no WebGL and no GPU — the same way the real
 * surface behaves when there is no GPU: the attach falls back
 * to CPU and the terminal keeps working.
 *
 * - resolveScrollback honours the Settings range (1000–100000,
 *   default 10000) and never returns NaN/0.
 * - GPU and CPU metrics are tracked separately: recording GPU
 *   writes never moves a CPU counter, and a snapshot carries
 *   no combined/total field.
 * - The write coalescer joins PTY chunks arriving inside one
 *   frame into a single term.write, flushes immediately past
 *   the threshold, and drains on dispose.
 * - attachTerminalRenderer returns a 'webgl' handle when the
 *   loader succeeds and a 'cpu' handle — with the failure
 *   counted — when it throws; a later context loss disposes
 *   the addon and flips the kind back to 'cpu'.
 *
 * On unmodified cea360f this file fails at import: the module
 * under test does not exist there.
 *
 * Run with: npx vitest run tests/terminalGpuRenderer.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import {
  attachTerminalRenderer,
  createRendererMetrics,
  createWriteCoalescer,
  resolveScrollback,
  DEFAULT_SCROLLBACK,
  SCROLLBACK_MAX,
  SCROLLBACK_MIN,
  WRITE_FLUSH_THRESHOLD_BYTES,
  type TerminalRendererKind,
} from '../src/lib/terminalRenderer';

/** Fake terminal: records writes and addon loads. */
function fakeTerminal() {
  return {
    writes: [] as string[],
    addons: [] as { dispose(): void }[],
    write(data: string) {
      this.writes.push(data);
    },
    loadAddon(addon: { dispose(): void }) {
      this.addons.push(addon);
    },
  };
}

/** Manual frame scheduler: nothing runs until run() is called. */
function manualScheduler() {
  let pending: (() => void) | null = null;
  return {
    schedule(cb: () => void) {
      pending = cb;
      return () => {
        pending = null;
      };
    },
    run() {
      const cb = pending;
      pending = null;
      cb?.();
    },
    get hasPending() {
      return pending !== null;
    },
  };
}

/** Fake WebGL addon class: captures the context-loss listener. */
function fakeWebglAddonClass() {
  interface FakeInstance {
    disposed: boolean;
    lossListener: (() => void) | null;
    options?: { customGlyphs?: boolean };
  }
  const instances: FakeInstance[] = [];
  class FakeWebglAddon implements FakeInstance {
    disposed = false;
    lossListener: (() => void) | null = null;
    constructor(public options?: { customGlyphs?: boolean }) {
      instances.push(this);
    }
    dispose() {
      this.disposed = true;
    }
    onContextLoss(listener: () => void) {
      this.lossListener = listener;
      return { dispose: () => undefined };
    }
  }
  return { FakeWebglAddon, instances };
}

describe('resolveScrollback', () => {
  it('defaults to 10000 when the setting is missing or not a number', () => {
    expect(resolveScrollback(undefined)).toBe(DEFAULT_SCROLLBACK);
    expect(resolveScrollback(NaN)).toBe(DEFAULT_SCROLLBACK);
    expect(resolveScrollback('not a number')).toBe(DEFAULT_SCROLLBACK);
  });

  it('passes a valid setting through unchanged', () => {
    expect(resolveScrollback(5000)).toBe(5000);
    expect(resolveScrollback(10000)).toBe(10000);
  });

  it('clamps to the Settings UI range (1000–100000)', () => {
    expect(resolveScrollback(0)).toBe(SCROLLBACK_MIN);
    expect(resolveScrollback(500)).toBe(SCROLLBACK_MIN);
    expect(resolveScrollback(1000)).toBe(SCROLLBACK_MIN);
    expect(resolveScrollback(100000)).toBe(SCROLLBACK_MAX);
    expect(resolveScrollback(250000)).toBe(SCROLLBACK_MAX);
  });
});

describe('renderer metrics (GPU vs CPU tracked separately)', () => {
  it('records GPU and CPU writes under their own counters only', () => {
    const metrics = createRendererMetrics();
    metrics.recordWrite('webgl', 100);
    metrics.recordWrite('webgl', 50);
    metrics.recordWrite('cpu', 7);
    const snap = metrics.snapshot('webgl');
    expect(snap.activeKind).toBe('webgl');
    expect(snap.gpu).toEqual({
      attachAttempts: 0,
      attachSuccesses: 0,
      attachFailures: 0,
      contextLosses: 0,
      writes: 2,
      bytes: 150,
    });
    expect(snap.cpu).toEqual({ writes: 1, bytes: 7 });
  });

  it('never merges GPU and CPU into a combined total', () => {
    const metrics = createRendererMetrics();
    metrics.recordWrite('webgl', 10);
    metrics.recordWrite('cpu', 20);
    const snap = metrics.snapshot('cpu');
    expect('total' in snap).toBe(false);
    expect('combined' in snap).toBe(false);
    expect('bytes' in snap).toBe(false);
    expect('writes' in snap).toBe(false);
    // The two sides stay separately readable.
    expect(snap.gpu.bytes).toBe(10);
    expect(snap.cpu.bytes).toBe(20);
  });

  it('snapshots are copies: mutating one does not move the counters', () => {
    const metrics = createRendererMetrics();
    metrics.recordWrite('cpu', 5);
    const snap = metrics.snapshot('cpu');
    snap.cpu.bytes = 999;
    expect(metrics.snapshot('cpu').cpu.bytes).toBe(5);
  });
});

describe('write coalescer', () => {
  it('joins chunks inside one frame into a single term.write', () => {
    const term = fakeTerminal();
    const scheduler = manualScheduler();
    const metrics = createRendererMetrics();
    const coalescer = createWriteCoalescer(
      term as unknown as Pick<Terminal, 'write'>,
      {
        scheduleFrame: scheduler.schedule,
        metrics,
        getKind: () => 'webgl' as TerminalRendererKind,
      },
    );
    coalescer.write('foo');
    coalescer.write('bar');
    coalescer.write('baz');
    expect(term.writes).toEqual([]);
    expect(coalescer.pendingBytes).toBe(9);
    scheduler.run();
    expect(term.writes).toEqual(['foobarbaz']);
    expect(coalescer.pendingBytes).toBe(0);
    // Counted under the renderer active at flush time: GPU.
    const snap = metrics.snapshot('webgl');
    expect(snap.gpu).toMatchObject({ writes: 1, bytes: 9 });
    expect(snap.cpu).toEqual({ writes: 0, bytes: 0 });
  });

  it('flushes immediately once the threshold is passed', () => {
    const term = fakeTerminal();
    const scheduler = manualScheduler();
    const coalescer = createWriteCoalescer(
      term as unknown as Pick<Terminal, 'write'>,
      { scheduleFrame: scheduler.schedule },
    );
    coalescer.write('x'.repeat(WRITE_FLUSH_THRESHOLD_BYTES - 1));
    expect(term.writes).toHaveLength(0);
    coalescer.write('yy');
    expect(term.writes).toHaveLength(1);
    expect(term.writes[0].length).toBe(WRITE_FLUSH_THRESHOLD_BYTES + 1);
    expect(coalescer.pendingBytes).toBe(0);
  });

  it('benchmark note: 1,000 PTY chunks in one frame become 1 term.write (was 1,000)', () => {
    // The number that matters for the renderer: without the
    // coalescer the surface pays one term.write (parse +
    // render debounce) per PTY chunk; with it, one frame of
    // chunks pays one. 1,000 x 64-byte chunks = 64,000 bytes,
    // just under the 64 KiB immediate-flush threshold, so the
    // whole burst rides a single frame.
    const term = fakeTerminal();
    const scheduler = manualScheduler();
    const coalescer = createWriteCoalescer(
      term as unknown as Pick<Terminal, 'write'>,
      { scheduleFrame: scheduler.schedule },
    );
    for (let i = 0; i < 1000; i++) coalescer.write('x'.repeat(64));
    expect(term.writes).toHaveLength(0);
    scheduler.run();
    expect(term.writes).toHaveLength(1);
    expect(term.writes[0].length).toBe(64000);
  });

  it('flush() drains pending output and dispose() flushes before stopping', () => {
    const term = fakeTerminal();
    const scheduler = manualScheduler();
    const coalescer = createWriteCoalescer(
      term as unknown as Pick<Terminal, 'write'>,
      { scheduleFrame: scheduler.schedule },
    );
    coalescer.write('abc');
    coalescer.flush();
    expect(term.writes).toEqual(['abc']);
    coalescer.flush();
    expect(term.writes).toEqual(['abc']);
    coalescer.write('de');
    coalescer.dispose();
    expect(term.writes).toEqual(['abc', 'de']);
    coalescer.write('fg');
    expect(term.writes).toEqual(['abc', 'de']);
    expect(coalescer.pendingBytes).toBe(0);
  });
});

describe('attachTerminalRenderer', () => {
  it('attaches WebGL when a GPU is available and counts the success', async () => {
    const { FakeWebglAddon, instances } = fakeWebglAddonClass();
    const term = fakeTerminal();
    const kinds: TerminalRendererKind[] = [];
    const metrics = createRendererMetrics();
    const handle = await attachTerminalRenderer(
      term as unknown as Terminal,
      {
        loadWebglAddon: async () => ({ WebglAddon: FakeWebglAddon }),
        metrics,
        onKindChange: (k) => kinds.push(k),
      },
    );
    expect(handle.kind).toBe('webgl');
    expect(term.addons).toHaveLength(1);
    expect(instances).toHaveLength(1);
    expect(kinds).toEqual(['webgl']);
    const snap = handle.snapshot();
    expect(snap.gpu.attachAttempts).toBe(1);
    expect(snap.gpu.attachSuccesses).toBe(1);
    expect(snap.gpu.attachFailures).toBe(0);
    handle.dispose();
    expect((term.addons[0] as unknown as { disposed: boolean }).disposed).toBe(
      true,
    );
    expect(handle.kind).toBe('cpu');
  });

  it('falls back to CPU — and counts the failure — when WebGL cannot load', async () => {
    const term = fakeTerminal();
    const kinds: TerminalRendererKind[] = [];
    const metrics = createRendererMetrics();
    const handle = await attachTerminalRenderer(
      term as unknown as Terminal,
      {
        loadWebglAddon: async () => {
          throw new Error('no WebGL2 context');
        },
        metrics,
        onKindChange: (k) => kinds.push(k),
      },
    );
    expect(handle.kind).toBe('cpu');
    expect(term.addons).toHaveLength(0);
    expect(kinds).toEqual(['cpu']);
    const snap = handle.snapshot();
    expect(snap.gpu.attachAttempts).toBe(1);
    expect(snap.gpu.attachSuccesses).toBe(0);
    expect(snap.gpu.attachFailures).toBe(1);
    // The terminal is still usable on CPU: nothing threw.
    handle.dispose();
    expect(handle.kind).toBe('cpu');
  });

  it('falls back to CPU when loadAddon itself throws (no GPU at open time)', async () => {
    const { FakeWebglAddon } = fakeWebglAddonClass();
    const term = fakeTerminal();
    term.loadAddon = () => {
      throw new Error('WebGL context creation failed');
    };
    const handle = await attachTerminalRenderer(
      term as unknown as Terminal,
      { loadWebglAddon: async () => ({ WebglAddon: FakeWebglAddon }) },
    );
    expect(handle.kind).toBe('cpu');
    expect(handle.snapshot().gpu.attachFailures).toBe(1);
  });

  it('on context loss disposes the addon and flips back to CPU', async () => {
    const { FakeWebglAddon, instances } = fakeWebglAddonClass();
    const term = fakeTerminal();
    const kinds: TerminalRendererKind[] = [];
    const metrics = createRendererMetrics();
    const handle = await attachTerminalRenderer(
      term as unknown as Terminal,
      {
        loadWebglAddon: async () => ({ WebglAddon: FakeWebglAddon }),
        metrics,
        onKindChange: (k) => kinds.push(k),
      },
    );
    expect(handle.kind).toBe('webgl');
    const instance = instances[0];
    expect(instance.lossListener).not.toBeNull();
    instance.lossListener?.();
    expect(instance.disposed).toBe(true);
    expect(handle.kind).toBe('cpu');
    expect(kinds).toEqual(['webgl', 'cpu']);
    expect(handle.snapshot().gpu.contextLosses).toBe(1);
    // Writes after the loss are counted on the CPU side.
    metrics.recordWrite(handle.kind, 4);
    expect(handle.snapshot().cpu.bytes).toBe(4);
    expect(handle.snapshot().gpu.bytes).toBe(0);
  });
});
