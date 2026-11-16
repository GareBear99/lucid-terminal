/**
 * Terminal rendering performance.
 *
 * What Ghostty actually does (official source: ghostty.org docs and
 * the ghostty-org/ghostty repo, `src/renderer/` + `src/font/`):
 *
 * - GPU-accelerated rendering: Metal on macOS, OpenGL on Linux
 *   (ghostty.org/docs/features: "Ghostty uses Metal on macOS and
 *   OpenGL on Linux to render the terminal screen"). The Metal
 *   backend (`src/renderer/Metal.zig`) is triple-buffered
 *   (`swap_chain_count = 3`) on an `IOSurfaceLayer`, with the
 *   glyph atlas uploaded as a GPU texture (`initAtlasTexture`).
 * - The shared renderer (`src/renderer/generic.zig`) is paced by
 *   the display link ("The display link used to pace drawing to
 *   the display's refresh rate") and rebuilds only dirty/damaged
 *   cells: Ghostty 1.3 "lower[ed] the time the renderer holds the
 *   terminal lock by 2x to 5x. And in most frames, the renderer
 *   doesn't hold the lock at all thanks to improved dirty/damage
 *   tracking" (ghostty.org/docs/install/release-notes/1-3-0).
 *   Ghostty 1.4 cut that lock hold a further 2.7x to 11x per
 *   frame, and the display link now sleeps when there is nothing
 *   to draw (release-notes/1-4-0).
 * - Font shaping is HarfBuzz/CoreText into a cached glyph atlas
 *   (`src/font/main.zig`: `Atlas`, `Shaper`, `ShaperCache`);
 *   glyphs are rasterised once and then drawn as textured quads.
 * - I/O is decoupled from rendering: Ghostty 1.4 "drains the pty
 *   on one thread while parsing on another, raising end-to-end
 *   I/O throughput by 25% to 55% on macOS".
 * - Scrollback is bounded but generous: Ghostty 1.4 "transparently
 *   compresses scrollback that isn't visible, reducing the physical
 *   memory those pages use by 70% to 90% … the default scrollback
 *   limit has been raised from 10 MB to 50 MB per terminal"
 *   (release-notes/1-4-0). Hidden tabs release their GPU
 *   resources (385 MiB -> 18 MiB with 20 hidden tabs).
 *
 * The Lucid equivalent, on the existing xterm.js terminal
 * (replacing xterm.js with a native terminal is out of scope):
 *
 * 1. GPU renderer when available: `@xterm/addon-webgl` is the
 *    WebGL2 renderer for xterm.js — the same glyph-atlas idea as
 *    Ghostty's `TextureAtlas` (its typings expose the atlas as
 *    `textureAtlas` / `onChangeTextureAtlas`): glyphs are drawn
 *    once into a texture page and then blitted as quads, instead
 *    of the DOM renderer building HTML spans per row. It is
 *    loaded after `term.open()` and, per its README, the browser
 *    may drop the WebGL context (OOM, suspend) — `onContextLoss`
 *    fires and the addon is disposed.
 * 2. Frame-paced write coalescing: PTY chunks arriving between
 *    frames are joined into ONE `term.write` per animation frame
 *    (plus a 100 ms timeout so output can never stall while the
 *    window is occluded and rAF is throttled) — the closest
 *    xterm.js analogue to Ghostty draining the pty separately
 *    from the render loop, and to xterm's own per-frame
 *    RenderDebouncer, which already coalesces *renders* per
 *    frame. A burst over the flush threshold is written at once
 *    so a `cat` of a huge file cannot pile up unboundedly.
 * 3. Bounded scrollback, wired to the setting: the Settings UI
 *    already offers scrollback 1000–100000 (default 10000) but
 *    the surface hardcoded 5000 and never read it. The setting
 *    is now honoured, clamped to the UI's own range. xterm.js
 *    has no scrollback compression (Ghostty 1.4's 70–90%), so
 *    the line-count cap is the memory bound — see REPORT.
 *
 * Gary's constraint (2026-11-16): GPU rendering is ONLY an
 * enhancement when a GPU is available — it is never required.
 * When WebGL cannot be created the surface keeps the current
 * CPU rendering (xterm.js's built-in DOM renderer) and the
 * terminal works exactly as before. And GPU vs CPU usage is
 * ALWAYS tracked separately: the metrics below have a `gpu`
 * section and a `cpu` section and deliberately NO combined
 * total — the two are never mixed into one number.
 *
 * Profiles and tabs (Gary, 2026-11-16, correction): the bar is
 * NOT "preserve profiles/tabs exactly as they are" — they are
 * broken as they are. The renderer choice is therefore stored
 * NOWHERE: it is detected per surface instance at mount time
 * and never written to any profile, setting, or store, so it
 * cannot corrupt profile data. All renderer/coalescer state
 * lives in refs inside one XtermSurface instance — one per
 * tab/split surface — and touches no tab, split, or profile
 * store. The coalescer flushes pending output on dispose, so
 * a remount never silently drops output that arrived between
 * frames.
 */
import type { Terminal } from '@xterm/xterm';
// Type-only: the addon itself is loaded lazily (dynamic import
// in attachTerminalRenderer) so importing this module never
// touches WebGL — jsdom / no-GPU environments are safe.
import type { WebglAddon } from '@xterm/addon-webgl';

/** Which renderer is actually drawing the terminal right now. */
export type TerminalRendererKind = 'webgl' | 'cpu';

/** Scrollback bounds — the Settings UI's own range
 *  (SettingsPanel: min 1000, max 100000, step 1000). */
export const SCROLLBACK_MIN = 1000;
export const SCROLLBACK_MAX = 100000;
export const DEFAULT_SCROLLBACK = 10000;

/** A coalesced write larger than this is flushed at once
 *  instead of waiting for the next frame. */
export const WRITE_FLUSH_THRESHOLD_BYTES = 65536;

/** How long a pending coalesced write may wait for the next
 *  animation frame before the timeout flushes it anyway (the
 *  window may be occluded/minimised, where rAF is throttled). */
export const WRITE_FLUSH_TIMEOUT_MS = 100;

/**
 * Per-renderer usage counters. GPU and CPU are separate
 * sections by construction — there is intentionally no
 * combined/total field anywhere in this shape.
 */
export interface RendererMetricsSnapshot {
  /** The renderer drawing right now. */
  activeKind: TerminalRendererKind;
  gpu: {
    /** WebGL attach attempts (a GPU was present to try). */
    attachAttempts: number;
    /** Attempts that produced a live WebGL renderer. */
    attachSuccesses: number;
    /** Attempts that fell back to CPU (no GPU / no WebGL2 /
     *  context creation failed). */
    attachFailures: number;
    /** Times a live WebGL context was lost after attach. */
    contextLosses: number;
    /** term.write calls flushed while the GPU renderer was active. */
    writes: number;
    /** Bytes flushed while the GPU renderer was active. */
    bytes: number;
  };
  cpu: {
    /** term.write calls flushed while the CPU renderer was active. */
    writes: number;
    /** Bytes flushed while the CPU renderer was active. */
    bytes: number;
  };
}

/** Mutable counters behind a snapshot. */
export interface RendererMetrics {
  recordGpuAttachAttempt(): void;
  recordGpuAttachSuccess(): void;
  recordGpuAttachFailure(): void;
  recordContextLoss(): void;
  recordWrite(kind: TerminalRendererKind, bytes: number): void;
  snapshot(activeKind: TerminalRendererKind): RendererMetricsSnapshot;
}

export function createRendererMetrics(): RendererMetrics {
  const gpu = {
    attachAttempts: 0,
    attachSuccesses: 0,
    attachFailures: 0,
    contextLosses: 0,
    writes: 0,
    bytes: 0,
  };
  const cpu = { writes: 0, bytes: 0 };
  return {
    recordGpuAttachAttempt() {
      gpu.attachAttempts += 1;
    },
    recordGpuAttachSuccess() {
      gpu.attachSuccesses += 1;
    },
    recordGpuAttachFailure() {
      gpu.attachFailures += 1;
    },
    recordContextLoss() {
      gpu.contextLosses += 1;
    },
    recordWrite(kind, bytes) {
      if (kind === 'webgl') {
        gpu.writes += 1;
        gpu.bytes += bytes;
      } else {
        cpu.writes += 1;
        cpu.bytes += bytes;
      }
    },
    snapshot(activeKind) {
      // Fresh objects every time: callers cannot mutate the
      // counters through a snapshot, and gpu/cpu stay separate.
      return { activeKind, gpu: { ...gpu }, cpu: { ...cpu } };
    },
  };
}

/**
 * Honour the scrollback setting, clamped to the range the
 * Settings UI itself offers. Non-finite / missing values read
 * as the default instead of ever storing NaN or 0.
 */
export function resolveScrollback(
  value: unknown,
  fallback: number = DEFAULT_SCROLLBACK,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return resolveScrollback(fallback);
  return Math.min(
    SCROLLBACK_MAX,
    Math.max(SCROLLBACK_MIN, Math.round(n)),
  );
}

/** Minimal shape of what attach needs from a Terminal. */
export interface AttachableTerminal {
  loadAddon(addon: { dispose(): void }): void;
}

export interface GpuRendererHandle {
  /** The renderer drawing right now ('cpu' until a WebGL
   *  attach succeeds, and again after a context loss). */
  readonly kind: TerminalRendererKind;
  /** Separate GPU/CPU usage counters (see module header). */
  readonly metrics: RendererMetrics;
  /** Current metrics snapshot (gpu/cpu separate, no total). */
  snapshot(): RendererMetricsSnapshot;
  /** Dispose the WebGL addon if one is live. Safe to call twice. */
  dispose(): void;
}

export interface AttachTerminalRendererOptions {
  /** Override the WebGL loader (tests inject a fake; the
   *  default is the real `@xterm/addon-webgl`). */
  loadWebglAddon?: () => Promise<{
    WebglAddon: new (options?: { customGlyphs?: boolean }) => {
      dispose(): void;
      onContextLoss: (listener: () => void) => unknown;
    };
  }>;
  /** Pre-made metrics (the surface shares one instance with
   *  its write coalescer so writes are counted under the
   *  renderer that was active when they flushed). */
  metrics?: RendererMetrics;
  /** Fires on every kind change: 'webgl' on attach success,
   *  'cpu' on attach failure or context loss. */
  onKindChange?: (kind: TerminalRendererKind) => void;
}

/**
 * Try the GPU renderer; fall back to the CPU renderer on ANY
 * failure. Never throws, never requires a GPU: when WebGL is
 * unavailable the terminal keeps its current CPU rendering
 * and this returns a 'cpu' handle.
 *
 * Ghostty parallel: the glyph atlas + GPU draw path, with the
 * context-loss handling from the addon's own README (dispose
 * the addon when the browser drops the context) — the Lucid
 * version of Ghostty releasing a hidden tab's GPU resources.
 */
export async function attachTerminalRenderer(
  term: Terminal | AttachableTerminal,
  options: AttachTerminalRendererOptions = {},
): Promise<GpuRendererHandle> {
  const metrics = options.metrics ?? createRendererMetrics();
  let kind: TerminalRendererKind = 'cpu';
  let addon: { dispose(): void } | null = null;

  const handle: GpuRendererHandle = {
    get kind() {
      return kind;
    },
    metrics,
    snapshot() {
      return metrics.snapshot(kind);
    },
    dispose() {
      if (addon) {
        try {
          addon.dispose();
        } catch {
          // Disposal is best-effort; the terminal is going away.
        }
        addon = null;
      }
      if (kind !== 'cpu') {
        kind = 'cpu';
      }
    },
  };

  metrics.recordGpuAttachAttempt();
  try {
    const loader =
      options.loadWebglAddon ??
      (async () => {
        // Dynamic import: the addon is only loaded when a
        // surface actually mounts, and a missing/broken WebGL
        // implementation fails here — inside the try — instead
        // of at module load.
        const mod = (await import('@xterm/addon-webgl')) as unknown as {
          WebglAddon: new (options?: {
            customGlyphs?: boolean;
          }) => {
            dispose(): void;
            onContextLoss: (listener: () => void) => unknown;
          };
        };
        return mod;
      });
    const { WebglAddon: WebglAddonCtor } = await loader();
    // customGlyphs draws box-drawing / block / powerline glyphs
    // as geometry instead of through the font — the same class
    // of glyph Ghostty renders from its built-in sprite font
    // (src/font/sprite.zig). It is also why the WebGL path
    // renders continuous lines where the DOM renderer cannot
    // (xterm.js typings: "this doesn't work with the DOM
    // renderer").
    const created = new WebglAddonCtor({ customGlyphs: true });
    // loadAddon throws when the browser cannot create a WebGL2
    // context (no GPU, headless, driver blocklist) — that throw
    // is the CPU fallback, caught below.
    (term as AttachableTerminal).loadAddon(
      created as unknown as { dispose(): void },
    );
    addon = created;
    kind = 'webgl';
    metrics.recordGpuAttachSuccess();
    options.onKindChange?.('webgl');
    created.onContextLoss(() => {
      // The browser dropped the context (OOM, suspend — see the
      // addon's README). Release the GPU resources and fall
      // back to CPU rendering; the terminal keeps working.
      try {
        created.dispose();
      } catch {
        // Best-effort, as above.
      }
      if (addon === created) addon = null;
      metrics.recordContextLoss();
      kind = 'cpu';
      options.onKindChange?.('cpu');
    });
  } catch {
    metrics.recordGpuAttachFailure();
    kind = 'cpu';
    options.onKindChange?.('cpu');
  }
  return handle;
}

// Re-export the real addon type for callers that need it.
export type { WebglAddon };

/** A frame scheduler: calls back once, returns a cancel. */
export type FrameScheduler = (cb: () => void) => () => void;

/** Default scheduler: next animation frame, with a timeout
 *  fallback so a pending write can never stall while the
 *  window is occluded and rAF is throttled. */
export function defaultFrameScheduler(cb: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    let done = false;
    const raf = requestAnimationFrame(() => {
      if (!done) {
        done = true;
        cb();
      }
    });
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cancelAnimationFrame(raf);
        cb();
      }
    }, WRITE_FLUSH_TIMEOUT_MS);
    return () => {
      if (!done) {
        done = true;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      }
    };
  }
  const timer = setTimeout(cb, 0);
  return () => clearTimeout(timer);
}

export interface WriteCoalescerOptions {
  /** Bytes buffered before a write flushes immediately. */
  flushThresholdBytes?: number;
  /** Frame scheduler (tests inject a manual one). */
  scheduleFrame?: FrameScheduler;
  /** Shared metrics — writes are counted under the renderer
   *  active when they flush, so a mid-stream GPU->CPU switch
   *  is attributed correctly, per side. */
  metrics?: RendererMetrics;
  /** Renderer active right now (read at flush time). */
  getKind?: () => TerminalRendererKind;
}

export interface WriteCoalescer {
  /** Buffer a PTY chunk; it flushes on the next frame, or
   *  immediately once the threshold is passed. */
  write(data: string): void;
  /** Flush whatever is buffered now (no-op when empty). */
  flush(): void;
  /** Bytes currently buffered. */
  readonly pendingBytes: number;
  /** Flush pending output, then stop scheduling. */
  dispose(): void;
}

/**
 * Coalesce PTY output into one `term.write` per frame.
 *
 * Ghostty drains the pty on one thread while parsing on
 * another; xterm.js runs on one thread, so the closest
 * equivalent is to stop paying the parse + render cost once
 * per PTY chunk: chunks arriving inside a frame are joined
 * and parsed once, and xterm's own RenderDebouncer then
 * renders the dirty rows once. Interactive echo is already
 * frame-paced by that debouncer, so batching writes to the
 * same frame adds no visible latency; the 100 ms timeout
 * bounds the wait when frames are throttled.
 */
export function createWriteCoalescer(
  term: Pick<Terminal, 'write'>,
  options: WriteCoalescerOptions = {},
): WriteCoalescer {
  const threshold =
    options.flushThresholdBytes ?? WRITE_FLUSH_THRESHOLD_BYTES;
  const scheduleFrame = options.scheduleFrame ?? defaultFrameScheduler;
  const metrics = options.metrics;
  const getKind = options.getKind ?? (() => 'cpu' as TerminalRendererKind);
  let buffered = '';
  let cancelScheduled: (() => void) | null = null;
  let disposed = false;

  const flush = () => {
    if (cancelScheduled) {
      cancelScheduled();
      cancelScheduled = null;
    }
    if (buffered.length === 0) return;
    const data = buffered;
    buffered = '';
    term.write(data);
    metrics?.recordWrite(getKind(), data.length);
  };

  const schedule = () => {
    if (cancelScheduled || disposed) return;
    cancelScheduled = scheduleFrame(() => {
      cancelScheduled = null;
      flush();
    });
  };

  return {
    write(data: string) {
      if (disposed || data.length === 0) return;
      buffered += data;
      if (buffered.length >= threshold) {
        flush();
        return;
      }
      schedule();
    },
    flush,
    get pendingBytes() {
      return buffered.length;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      flush();
    },
  };
}
