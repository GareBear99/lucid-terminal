/**
 * Bypass Router - Tier-Based Model Selection
 *
 * Based on LuciferAI's implementation (enhanced_agent.py:11805-11894)
 *
 * CORRECT FLOW (from LuciferAI):
 * For COMPLEX/NATURAL LANGUAGE requests:
 * 1. Start with HIGHEST available tier (Tier 4/3) for quality
 * 2. Try to execute with that model
 * 3. If fails/timeouts → fall back to NEXT tier down
 * 4. Show which models were bypassed
 * 5. Continue until success or reach shell fallback
 *
 * For SIMPLE tasks:
 * 1. Start with LOWEST tier (Tier 0/1) for efficiency
 * 2. Escalate up only if needed
 *
 * See: LuciferAI docs/LLM_ROUTING_FLOW.md line 200-208
 *
 * Three fixes landed here (2026-11-04, bypass-router step):
 *
 * 1. AVAILABLE MODELS ARE REFRESHED FROM DISK BEFORE ROUTING. The old
 *    code snapshotted `availableModels` once at construction from
 *    `backendManager.listModels()`, where every model starts
 *    `validated: false` — so `isModelCorrupted()` (which is just
 *    `!validated`) was true for every model and the router could never
 *    pick one. `refreshAvailableModels()` now scans the model
 *    directories (`~/.lucid/models` and `<app>/LUCID-BACKEND/models`,
 *    GGUF magic-byte checked, via `modelFiles.ts`) and marks each
 *    registered model validated iff a real file for it is on disk. It
 *    runs at construction and at the start of every routing decision,
 *    so the router never routes from a stale construction-time snapshot.
 *
 * 2. SUCCESS-PATH TOKEN TRACKING USES THE REAL API. The old code called
 *    `tokenTracker.recordUsage()`, which does not exist on TokenTracker
 *    (only `trackUsage` / `trackUsageFromText` / private `_recordUsage`),
 *    so every successful generation threw inside the try block and was
 *    recorded as a bypass failure. Success now records via `trackUsage`
 *    with the result's real token stats when present, else a zero-count
 *    entry — and a tracking failure is logged, never thrown, so it can
 *    never flip a success into a bypass again.
 *
 * 3. STALL-BASED TIMEOUT, NOT A FLAT WALL CLOCK. The old code raced the
 *    operation against a flat 30s timer, which kills a model that is
 *    still generating (cold CPU load + generation easily exceeds 30s).
 *    The watchdog now follows Gary's rule and the Python reference
 *    (`LUCID-BACKEND/core/llm_backend.py`: 45s inactivity / 90s loading
 *    / 600s absolute): the attempt is alive while activity flows and
 *    only times out when quiet — 90s to first activity (model load /
 *    first token), 45s of quiet after activity started, 600s hard
 *    ceiling from attempt start. The operation reports activity through
 *    the `reportActivity` callback it receives; a non-streaming
 *    operation simply never reports mid-generation activity, so its
 *    loading window (90s) is the bound until streaming lands in
 *    ModelBackend and can report per-token.
 *
 * 4. ROUTING HANDS OFF TO THE TASK QUEUE (task-manager step,
 *    2026-11-04). `executeQueued()` enqueues the routing decision on
 *    the router's single-worker `TaskQueue` instead of executing
 *    inline, so concurrent terminal commands serialize behind each
 *    other instead of racing the model backends. The orchestrator
 *    calls `executeQueued`; `executeWithBypass` stays for direct
 *    callers and tests. See `electron/core/tasks/taskQueue.ts`.
 */

import * as path from 'path';
import { ModelTierRegistry, getModelTier } from '../models/modelTiers';
import { TokenTracker } from '../tracking/tokenTracker';
import { ModelBackendManager } from './modelBackend';
import { TaskQueue } from '../tasks/taskQueue';
import {
  findInstalledModelFiles,
  isValidGguf,
  InstalledModelFile,
  ModelFileScan,
} from './modelFiles';

export interface BypassRoute {
  selected_model: string;
  selected_tier: number;
  bypassed_models: Array<{
    model: string;
    tier: number;
    reason: string; // 'timeout' | 'failed' | 'corrupted' | 'disabled'
  }>;
  attempt_order: string[];  // Models tried in order
  success: boolean;
}

export interface ModelStatus {
  model: string;
  enabled: boolean;
  installed: boolean;
  corrupted: boolean;
  locked: boolean;  // Locked by another instance
}

/**
 * Stall-timeout windows for one model attempt, mirroring
 * `LUCID-BACKEND/core/llm_backend.py` (streaming path): 45s inactivity,
 * 90s loading (before first activity), 600s absolute ceiling.
 */
export interface BypassTimeouts {
  /** Quiet with no activity after the first activity: attempt is dead. */
  inactivityMs: number;
  /** Quiet before the first activity (model load / first token). */
  loadingMs: number;
  /** Hard ceiling from attempt start, however much activity flows. */
  absoluteMs: number;
}

export const DEFAULT_BYPASS_TIMEOUTS: BypassTimeouts = {
  inactivityMs: 45_000,
  loadingMs: 90_000,
  absoluteMs: 600_000,
};

/** Called by an operation whenever it makes progress (a token, a chunk). */
export type ActivityReporter = () => void;

/**
 * A model attempt. Receives the model name and a reporter the operation
 * should call whenever it produces output, so the stall watchdog can
 * tell "slow but alive" from "quiet". Operations that cannot report
 * mid-generation activity (the current non-streaming ModelBackend) just
 * never call it — the loading window then bounds the whole attempt.
 */
export type BypassOperation<T> = (
  model: string,
  reportActivity: ActivityReporter
) => Promise<T>;

export interface BypassRouterOptions {
  /** Explicit app root for model-file scanning (tests; defaults to the
   *  runtime resolution in modelFiles.ts). */
  appRoot?: string;
  /**
   * Called with the full disabled-model list whenever enable/disable
   * changes it. LucidCore supplies this: it writes
   * ~/.lucid/llm_state.json. Without a hook there is nothing to
   * persist to — the old _saveModelState claimed persistence "is
   * managed by backend manager"; it never was, anywhere. A hook that
   * throws makes the toggle fail (the in-memory change is reverted).
   */
  onEnabledChange?: (disabledModels: string[]) => void;
}

/**
 * Canonical form of a model name for file matching: lowercase, only
 * alphanumerics. `llama3.1:8b` → `llama318b`, `phi-2` → `phi2`.
 */
export function canonicalModelName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Map a model file name to a registered model name, or null when no
 * registered model matches. The file stem must start with the
 * canonical registered name, so
 * `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` maps to `tinyllama` and
 * `llama-3.1-8b-instruct-Q4_K_M.gguf` maps to `llama3.1:8b`. The
 * longest registered name wins when several match (so a `llama3.1-70b`
 * file does not map to `llama3.1:8b`).
 */
export function matchFileToRegisteredModel(
  fileName: string,
  registeredNames: string[]
): string | null {
  const stem = path.basename(fileName, path.extname(fileName));
  const canonicalStem = canonicalModelName(stem);
  let best: string | null = null;
  for (const name of registeredNames) {
    const canonical = canonicalModelName(name);
    if (canonical.length === 0) continue;
    if (!canonicalStem.startsWith(canonical)) continue;
    if (!best || canonical.length > canonicalModelName(best).length) {
      best = name;
    }
  }
  return best;
}

export interface TokenCounts {
  prompt_tokens: number;
  generated_tokens: number;
  total_tokens: number;
}

/**
 * Pull token stats off a generation result when it carries them
 * (GenerationResponse.tokenStats). Returns null for anything else —
 * the caller then records a zero-count entry instead of failing.
 */
export function extractTokenStats(result: unknown): TokenCounts | null {
  if (!result || typeof result !== 'object') return null;
  const stats = (result as { tokenStats?: unknown }).tokenStats;
  if (!stats || typeof stats !== 'object') return null;
  const { prompt_tokens, generated_tokens, total_tokens } = stats as Record<
    string,
    unknown
  >;
  if (
    typeof prompt_tokens !== 'number' ||
    typeof generated_tokens !== 'number' ||
    typeof total_tokens !== 'number'
  ) {
    return null;
  }
  return { prompt_tokens, generated_tokens, total_tokens };
}

export class BypassRouter {
  private modelRegistry: ModelTierRegistry;
  private tokenTracker: TokenTracker;
  private modelState: Map<string, boolean>;  // model -> enabled
  private availableModels: string[];
  private backendManager: ModelBackendManager;
  private appRoot?: string;
  /**
   * Persistence hook for enable/disable changes (LucidCore writes
   * ~/.lucid/llm_state.json). Absent for direct router use / tests,
   * where the change stays in memory only.
   */
  private onEnabledChange?: (disabledModels: string[]) => void;
  /**
   * The task queue routing decisions hand off to. One worker: routed
   * LLM work runs one task at a time, so concurrent terminal commands
   * no longer race the model backends. `executeWithBypass` stays
   * available for direct (already-queued or test) callers.
   */
  private taskQueue: TaskQueue;

  constructor(
    modelRegistry: ModelTierRegistry,
    tokenTracker: TokenTracker,
    backendManager: ModelBackendManager,
    options?: BypassRouterOptions
  ) {
    this.modelRegistry = modelRegistry;
    this.tokenTracker = tokenTracker;
    this.modelState = new Map();
    this.availableModels = [];
    this.backendManager = backendManager;
    this.appRoot = options?.appRoot;
    this.onEnabledChange = options?.onEnabledChange;
    this.taskQueue = new TaskQueue(1);

    this._loadModelState();
    // Construction-time snapshot alone is not trusted: validate against
    // the model files actually on disk right away.
    this.refreshAvailableModels();
  }

  private _loadModelState(): void {
    // Load from model backend manager
    const models = this.backendManager.listModels();
    for (const model of models) {
      this.modelState.set(model.name, model.enabled);
      if (!this.isModelCorrupted(model.name)) {
        this.availableModels.push(model.name);
      }
    }
  }

  /**
   * Re-derive the available-model list from the model files actually on
   * disk. Scans `~/.lucid/models` and `<app>/LUCID-BACKEND/models`
   * (modelFiles.ts), checks GGUF magic bytes, maps each valid file to
   * a registered model, and marks every registered model validated iff
   * a real file for it exists. Never throws — a scan failure degrades
   * to "no models validated" and is logged by the scan itself.
   *
   * Router-level enable/disable decisions are preserved: only models
   * the router has never seen get their enabled flag seeded from the
   * manager here; `enableModel`/`disableModel` still own the rest.
   *
   * Runs automatically before every routing decision; also callable
   * directly (e.g. after an install) so callers can force a re-scan.
   */
  refreshAvailableModels(explicitAppRoot?: string): ModelFileScan {
    const scan = findInstalledModelFiles(explicitAppRoot ?? this.appRoot);
    const registeredNames = this.backendManager
      .listModels()
      .map((m) => m.name);

    const validatedByModel = new Map<string, InstalledModelFile>();
    for (const file of scan.files) {
      const ext = path.extname(file.name).toLowerCase();
      // A truncated or HTML-error-page download is not a model.
      if (ext === '.gguf' && !isValidGguf(file.path)) continue;
      const modelName = matchFileToRegisteredModel(file.name, registeredNames);
      if (!modelName) continue;
      if (!validatedByModel.has(modelName)) {
        validatedByModel.set(modelName, file);
      }
    }

    for (const model of this.backendManager.listModels()) {
      this.backendManager.setModelValidated(
        model.name,
        validatedByModel.has(model.name)
      );
      if (!this.modelState.has(model.name)) {
        this.modelState.set(model.name, model.enabled);
      }
    }

    // Installed + validated ONLY — enabled is NOT part of this list.
    // The selection-time filters (getBestAvailableModel /
    // executeWithBypass) apply the enabled check. If a disabled model
    // left this list, enableModel() would refuse to re-enable it
    // ("not installed"), breaking the disable → enable round-trip.
    this.availableModels = this.backendManager
      .listModels()
      .filter((m) => m.validated)
      .map((m) => m.name);

    console.log(
      `[BypassRouter] Refresh: ${this.availableModels.length} available model(s)` +
        (this.availableModels.length > 0
          ? ` — ${this.availableModels.join(', ')}`
          : ' — none validated on disk')
    );
    return scan;
  }

  /**
   * Check if model is enabled
   */
  isModelEnabled(model: string): boolean {
    return this.modelState.get(model) ?? true;
  }

  /**
   * Canonical enable/disable entry point — the ONE enable system.
   * The router's modelState is the flag routing consults
   * (isModelEnabled); the backend manager's info.enabled is kept in
   * sync as a mirror, never a second source of truth; and the change
   * is persisted via onEnabledChange (LucidCore → llm_state.json).
   * Returns success:false — and leaves state untouched — when the
   * model is unknown, not installed (enable only), or the state file
   * cannot be written.
   */
  setModelEnabled(
    model: string,
    enabled: boolean
  ): { success: boolean; message: string } {
    return enabled ? this.enableModel(model) : this.disableModel(model);
  }

  /** Models currently disabled — the set that gets persisted. */
  getDisabledModels(): string[] {
    const disabled: string[] = [];
    // forEach, not for..of: the node tsconfig has no target set, so
    // iterating a Map is a type error there (pre-existing config gap —
    // the rest of electron/ iterates Maps the same way and errors the
    // same way; this method does not add to it).
    this.modelState.forEach((enabled, model) => {
      if (!enabled) disabled.push(model);
    });
    return disabled.sort();
  }

  /**
   * Seed enabled state from the persisted disabled list (startup:
   * LucidCore loads ~/.lucid/llm_state.json and calls this before
   * anything routes). Only known models are applied; stale names in
   * the file are ignored. This does NOT persist — it IS the persisted
   * state being restored.
   */
  applyPersistedDisabledModels(disabled: Iterable<string>): void {
    // Array.from first: for..of over a bare Iterable is a type error
    // under the node tsconfig (see getDisabledModels).
    for (const model of Array.from(disabled)) {
      if (!this.backendManager.getModel(model)) continue;
      this.modelState.set(model, false);
      this.backendManager.setModelEnabled(model, false);
    }
  }

  /**
   * Check if model is corrupted (size mismatch >5%)
   */
  isModelCorrupted(model: string): boolean {
    const modelInfo = this.backendManager.getModel(model);
    if (!modelInfo) return false;

    // Check if model is validated
    return !modelInfo.validated;
  }

  /**
   * Get best available model (HIGHEST tier first)
   * For complex/natural language requests, prefer quality over speed
   * This matches LuciferAI's behavior: Tier 4→3→2→1→0
   */
  getBestAvailableModel(): string | null {
    // The list is re-validated against disk on every routing decision —
    // a model installed since construction must be pickable, and a
    // model whose file vanished must stop being picked.
    this.refreshAvailableModels();

    // Filter: enabled + not corrupted
    const enabled = this.availableModels.filter(m => this.isModelEnabled(m));
    const valid = enabled.filter(m => !this.isModelCorrupted(m));

    if (valid.length === 0) return null;

    // Sort by tier DESCENDING (highest first) - matches LuciferAI
    const sorted = valid.sort((a, b) => {
      return getModelTier(b) - getModelTier(a);
    });

    // Return HIGHEST tier model as starting point
    return sorted[0];
  }

  /**
   * Route through the task queue instead of executing inline.
   *
   * The routing decision (model selection + attempt loop) is handed
   * to the router's single-worker queue and runs when its turn comes
   * — concurrent terminal commands serialize behind each other
   * instead of racing the model backends. Same return shape as
   * `executeWithBypass`; a queued task cancelled before it runs
   * rejects with `TaskCancelledError` and never touches a model.
   */
  executeQueued<T>(
    operation: BypassOperation<T>,
    operationType: string,
    timeoutOverrides?: Partial<BypassTimeouts>
  ): Promise<{
    result: T | null;
    route: BypassRoute;
  }> {
    const { promise } = this.taskQueue.enqueue(
      'command',
      { operationType },
      () => this.executeWithBypass(operation, operationType, timeoutOverrides)
    );
    return promise;
  }

  /** The queue routing decisions hand off to (inspection / tests). */
  getTaskQueue(): TaskQueue {
    return this.taskQueue;
  }

  /** Cancel a queued routing task by id (see TaskQueue.cancel). */
  cancelTask(id: string): boolean {
    return this.taskQueue.cancel(id);
  }

  /**
   * Execute with bypass routing
   *
   * Tries models in order from HIGHEST to LOWEST tier,
   * falling back to next lower tier when models fail/timeout
   * Matches LuciferAI behavior: Tier 4→3→2→1→0
   *
   * Timeout is stall-based, not a flat wall clock: each attempt gets
   * `loadingMs` to first activity, `inactivityMs` of quiet after
   * activity started, and `absoluteMs` as a hard ceiling (defaults:
   * 90s / 45s / 600s, the `llm_backend.py` shape). Pass
   * `timeoutOverrides` to shrink the windows (tests) or tune them.
   */
  async executeWithBypass<T>(
    operation: BypassOperation<T>,
    operationType: string,
    timeoutOverrides?: Partial<BypassTimeouts>
  ): Promise<{
    result: T | null;
    route: BypassRoute;
  }> {
    this.refreshAvailableModels();
    const timeouts: BypassTimeouts = {
      ...DEFAULT_BYPASS_TIMEOUTS,
      ...timeoutOverrides,
    };

    const enabled = this.availableModels.filter(m => this.isModelEnabled(m));
    const valid = enabled.filter(m => !this.isModelCorrupted(m));

    if (valid.length === 0) {
      return {
        result: null,
        route: {
          selected_model: '',
          selected_tier: 0,
          bypassed_models: [],
          attempt_order: [],
          success: false
        }
      };
    }

    // Sort by tier DESCENDING (highest to lowest) - matches LuciferAI
    const sorted = valid.sort((a, b) => getModelTier(b) - getModelTier(a));

    const bypassed: BypassRoute['bypassed_models'] = [];
    const attemptOrder: string[] = [];

    // Try each model in order
    for (let i = 0; i < sorted.length; i++) {
      const model = sorted[i];
      const tier = getModelTier(model);
      attemptOrder.push(model);

      try {
        console.log(`[BypassRouter] 🔄 Attempting ${model} (Tier ${tier})...`);

        // Show thinking for Tier 2+ models (matches LuciferAI behavior)
        if (tier >= 2) {
          console.log(`🤔 ${model} (Tier ${tier}) thinking...`);
        }

        // Validate model is ready
        const modelInfo = this.backendManager.getModel(model);
        if (modelInfo && !modelInfo.running) {
          throw new Error(`Model ${model} not running`);
        }

        // Stall-based timeout: alive while activity flows, dead only
        // when quiet. Replaces the old flat 30s Promise.race, which
        // killed generations still running on a cold CPU.
        const result = await this._runWithStallTimeout(
          (reportActivity) => operation(model, reportActivity),
          timeouts
        );

        // Success! Track token usage (real API — see _trackSuccess).
        this._trackSuccess(model, tier, operationType, result);

        // Show what we bypassed
        const route: BypassRoute = {
          selected_model: model,
          selected_tier: tier,
          bypassed_models: bypassed,
          attempt_order: attemptOrder,
          success: true
        };

        this._displayBypassRoute(route);

        return { result, route };

      } catch (error: any) {
        // Failed - record as bypassed
        let reason: 'timeout' | 'failed' | 'corrupted' | 'disabled' = 'failed';

        if (error.message?.includes('timeout')) {
          reason = 'timeout';
        } else if (error.message?.includes('corrupted') || error.message?.includes('checksum')) {
          reason = 'corrupted';
          // Mark model as corrupted for future queries
          console.error(`[BypassRouter] Model ${model} appears corrupted`);
        } else if (error.message?.includes('not running') || error.message?.includes('connection')) {
          reason = 'failed';
        }

        bypassed.push({
          model,
          tier,
          reason
        });

        console.log(`[BypassRouter] ⚠️  ${model} (Tier ${tier}) ${reason} - bypassing to next tier...`);

        // Continue to next tier
        continue;
      }
    }

    // All models failed
    return {
      result: null,
      route: {
        selected_model: '',
        selected_tier: 0,
        bypassed_models: bypassed,
        attempt_order: attemptOrder,
        success: false
      }
    };
  }

  /**
   * Run one attempt under a stall watchdog.
   *
   * The attempt is alive while `reportActivity` is called: quiet for
   * longer than `loadingMs` before the first activity, or longer than
   * `inactivityMs` after activity started, rejects with a stall
   * timeout; `absoluteMs` from attempt start rejects regardless of
   * activity. A slow-but-flowing operation (activity at least every
   * `inactivityMs`) never trips the watchdog until the ceiling.
   *
   * A late rejection from the attempt after the watchdog already fired
   * is swallowed, not left as an unhandled rejection (the old flat
   * Promise.race left it dangling).
   */
  private _runWithStallTimeout<T>(
    attempt: (reportActivity: ActivityReporter) => Promise<T>,
    timeouts: BypassTimeouts
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const startedAt = Date.now();
      let lastActivityAt = startedAt;
      let sawActivity = false;
      let settled = false;
      // Declared before settle: a synchronously-throwing attempt settles
      // before the interval below exists, and settle must not hit the TDZ.
      let timer: ReturnType<typeof setInterval> | undefined;

      const reportActivity: ActivityReporter = () => {
        lastActivityAt = Date.now();
        sawActivity = true;
      };

      // Poll often enough to honour small windows (tests) without
      // waking more than once a second on the real 45s/90s windows.
      const pollMs = Math.max(
        10,
        Math.min(
          1000,
          Math.floor(timeouts.inactivityMs / 10),
          Math.floor(timeouts.loadingMs / 10)
        )
      );

      const settle = (err: Error | null, value?: T) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearInterval(timer);
        if (err) reject(err);
        else resolve(value as T);
      };

      timer = setInterval(() => {
        const now = Date.now();
        const quietFor = now - lastActivityAt;
        const limit = sawActivity ? timeouts.inactivityMs : timeouts.loadingMs;
        if (quietFor > limit) {
          settle(
            new Error(
              `stall timeout: no activity for ${Math.round(quietFor / 1000)}s ` +
                `(${sawActivity ? 'generating' : 'loading'})`
            )
          );
        } else if (now - startedAt > timeouts.absoluteMs) {
          settle(
            new Error(
              `absolute timeout: attempt exceeded ${Math.round(timeouts.absoluteMs / 1000)}s`
            )
          );
        }
      }, pollMs);

      let attemptPromise: Promise<T>;
      try {
        attemptPromise = attempt(reportActivity);
      } catch (err: any) {
        settle(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      attemptPromise.then(
        (value) => settle(null, value),
        (err) => settle(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }

  /**
   * Record a successful generation via the real TokenTracker API.
   *
   * The old code called `tokenTracker.recordUsage()`, which does not
   * exist — every successful generation threw inside the try block and
   * was recorded as a bypass failure. Token stats come from the
   * result when it carries them (GenerationResponse.tokenStats);
   * otherwise a zero-count entry is recorded so the success is still
   * counted (the old code's TODO: extract actual counts). Tracking
   * must never turn a success into a failure, so any error here is
   * logged, not thrown.
   */
  private _trackSuccess<T>(
    model: string,
    tier: number,
    operationType: string,
    result: T
  ): void {
    try {
      const stats = extractTokenStats(result);
      this.tokenTracker.trackUsage(model, tier, operationType, {
        prompt_tokens: stats?.prompt_tokens ?? 0,
        generated_tokens: stats?.generated_tokens ?? 0,
        total_tokens: stats?.total_tokens ?? 0,
      });
    } catch (err) {
      console.error(
        `[BypassRouter] Failed to record token usage for ${model}:`,
        err
      );
    }
  }

  /**
   * Display bypass route (like LuciferAI does)
   * Shows which models were bypassed and which is being used
   */
  private _displayBypassRoute(route: BypassRoute): void {
    const tierNames = {
      0: 'Tier 0',
      1: 'Tier 1',
      2: 'Tier 2',
      3: 'Tier 3',
      4: 'Tier 4',
      5: 'Tier 5'
    };

    // Show bypassed models (if any)
    if (route.bypassed_models.length > 0) {
      const bypassedParts = route.bypassed_models.map(b =>
        `${b.model} (${tierNames[b.tier as keyof typeof tierNames]})`
      );
      console.log(`💡 Bypassed: ${bypassedParts.join(', ')}`);
    }

    // Show selected model
    const tierName = tierNames[route.selected_tier as keyof typeof tierNames] || `Tier ${route.selected_tier}`;
    console.log(`🧠 Using ${route.selected_model} (${tierName})`);
    console.log();
  }

  /**
   * Get models by tier for display
   */
  getModelsByTier(): Map<number, string[]> {
    const byTier = new Map<number, string[]>();

    for (const model of this.availableModels) {
      const tier = getModelTier(model);
      if (!byTier.has(tier)) {
        byTier.set(tier, []);
      }
      byTier.get(tier)!.push(model);
    }

    return byTier;
  }

  /**
   * Get model status for LLM list display
   */
  getModelStatus(model: string): ModelStatus {
    return {
      model,
      enabled: this.isModelEnabled(model),
      installed: this.availableModels.includes(model),
      corrupted: this.isModelCorrupted(model),
      locked: false  // TODO: Implement lock detection
    };
  }

  /**
   * Enable a model. Fails honestly (state untouched) when the model
   * is unknown, when no model file for it is on disk, or when the
   * enabled state cannot be persisted.
   */
  enableModel(model: string): { success: boolean; message: string } {
    if (!this.backendManager.getModel(model)) {
      return {
        success: false,
        message: `Unknown model: ${model}`,
      };
    }

    // A model installed since construction must be enableable without
    // a restart — re-validate against disk first.
    this.refreshAvailableModels();
    if (!this.availableModels.includes(model)) {
      return {
        success: false,
        message: `${model} is not installed`,
      };
    }

    const previous = this.isModelEnabled(model);
    this.modelState.set(model, true);
    this.backendManager.setModelEnabled(model, true);
    try {
      this._saveModelState();
    } catch (error: any) {
      // Persistence failed: revert, so success is never claimed for a
      // change that will not survive a restart.
      this.modelState.set(model, previous);
      this.backendManager.setModelEnabled(model, previous);
      return {
        success: false,
        message: `Could not persist enabled state for ${model}: ${
          error?.message ?? String(error)
        }`,
      };
    }

    return {
      success: true,
      message: `✅ Enabled ${model}`
    };
  }

  /**
   * Disable a model. Fails honestly (state untouched) when the model
   * is unknown or when the enabled state cannot be persisted. Unlike
   * enable, disable does not require a model file on disk — a model
   * disabled before install stays disabled when it arrives.
   */
  disableModel(model: string): { success: boolean; message: string } {
    if (!this.backendManager.getModel(model)) {
      return {
        success: false,
        message: `Unknown model: ${model}`,
      };
    }

    const previous = this.isModelEnabled(model);
    this.modelState.set(model, false);
    this.backendManager.setModelEnabled(model, false);
    try {
      this._saveModelState();
    } catch (error: any) {
      this.modelState.set(model, previous);
      this.backendManager.setModelEnabled(model, previous);
      return {
        success: false,
        message: `Could not persist enabled state for ${model}: ${
          error?.message ?? String(error)
        }`,
      };
    }

    return {
      success: true,
      message: `✅ Disabled ${model}`
    };
  }

  /**
   * Persist the disabled-model list through the hook LucidCore
   * supplies (writes ~/.lucid/llm_state.json). Throws when the hook
   * throws, so enable/disable can revert and report the failure.
   * Without a hook there is nothing to persist to and the change
   * stays in memory only (direct router use, tests).
   */
  private _saveModelState(): void {
    this.onEnabledChange?.(this.getDisabledModels());
  }

  /**
   * Validate router is ready (has at least one enabled model)
   */
  isReady(): boolean {
    this.refreshAvailableModels();
    return this.availableModels.length > 0;
  }

  /**
   * Get validation message explaining why router isn't ready
   */
  getValidationMessage(): string {
    this.refreshAvailableModels();
    if (this.availableModels.length === 0) {
      return 'No models installed. Install at least one model to use LLM features.';
    }

    const enabled = this.availableModels.filter(m => this.isModelEnabled(m));
    if (enabled.length === 0) {
      return 'All models disabled. Enable at least one model in Settings.';
    }

    const valid = enabled.filter(m => !this.isModelCorrupted(m));
    if (valid.length === 0) {
      return 'All enabled models are corrupted. Reinstall models or enable different ones.';
    }

    return 'Router ready';
  }

  /**
   * Get fallback command when no models available
   */
  getFallbackCommand(): string {
    return 'Direct shell execution (no LLM)';
  }
}
