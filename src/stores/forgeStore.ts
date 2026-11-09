/**
 * Forge store — the Forge view's state (zustand, same pattern as the
 * other stores).
 *
 * Owns the Homunculi roster, the current training run (stages + log),
 * the scoreboard, setup status, and the low-memory flag. All IPC goes
 * through src/lib/llmbuilderApi.ts — the single place the renderer
 * touches the Forge IPC. The roster is persisted via the IPC
 * (llmbuilder:getRoster / llmbuilder:saveRoster), never via the
 * settings store.
 *
 * Roster seeding: on first load with an empty roster, ONE Homunculus
 * is seeded from the stored colour choice — read (read-only) from the
 * settings store, correct key `homunculusColor` first, falling back to
 * the old misspelled `hommunculusColor` (the Homunculus agent is
 * mid-correction). If NO colour is stored, nothing is seeded — the
 * roster starts empty with an empty-state message ("Choose your
 * Homunculus color in the Synth view first"). A Homunculus is never
 * invented.
 *
 * This store is pure state plus guarded IPC calls (no window access at
 * module load) so it can be imported by tests in a node environment.
 * When the preload has not exposed the Forge IPC yet, actions set
 * lastError instead of crashing.
 */

import { create } from 'zustand';
import {
  appendLineageEntry,
  emptyHomunculus,
  parseHomunculusColorValue,
  PIPELINE_STAGES,
  type GateDecision,
  type Homunculus,
  type HomunculusBiography,
  type HomunculusColor,
  type HomunculusLineageEntry,
  type PipelineStageId,
  type ScoreboardRow,
  type StageStatus,
} from '../lib/homunculi';
import {
  buildKnowledgeRecords,
  type CorpusSummary,
} from '../lib/homunculusKnowledge';
import {
  getLlmbuilderApi,
  type BrainAnswer,
  type DemoCheckSummary,
  type ImportDatasetResult,
  type LlmbuilderRunInfo,
  type LlmbuilderStatus,
  type PromotionDecision,
  type RunTier,
} from '../lib/llmbuilderApi';
import {
  allowedNewHomunculusColors,
  oppositeHomunculusColor,
} from '../lib/homunculusColor';
import { SUMMONS, isSummonUnlocked } from '../lib/summons';
import {
  appendTailEntry,
  canDetectStopAction,
  canInputStopAction,
  canVerifyStopAction,
  detectDualUnison,
  freshDualUnisonState,
  isTailPageFullyUnlocked,
  parseStopColorDurationSeconds,
  type DualUnisonState,
  type StopColorDuration,
} from '../lib/dualUnison';
import { useSettingsStore } from './settingsStore';

/**
 * The pending stop-face-colour timer (seconds duration only). A
 * module-level handle, not store state — it is a runtime timer, not
 * data. Cleared when the colour regresses, when a new stop is hit,
 * and by resetForTests, so it can never fire into a dead store.
 */
let stopFaceTimer: ReturnType<typeof setTimeout> | null = null;

function clearStopFaceTimer(): void {
  if (stopFaceTimer !== null) {
    clearTimeout(stopFaceTimer);
    stopFaceTimer = null;
  }
}

/**
 * A stop colour showing "until the next action" clears on the next
 * action (an activation, a creation, rooting a united action) — the
 * face regresses to the last validated solid. A seconds duration is
 * governed by its timer instead and is left alone. Returns the
 * (possibly unchanged) unison state.
 */
function withNextActionClear(unison: DualUnisonState): DualUnisonState {
  if (!unison.stopFaceColorActive) return unison;
  if (unison.stopDuration?.kind !== 'until-next-action') return unison;
  clearStopFaceTimer();
  return { ...unison, stopFaceColorActive: false };
}

export interface RunStageState {
  status: StageStatus | 'pending';
  message: string;
}

export interface ForgeRun {
  runId: string;
  homunculusId: string;
  candidate: string;
  tier: RunTier;
  stages: Record<PipelineStageId, RunStageState>;
  /** Streamed stdout from the Python job, newest last. */
  logLines: string[];
  done: boolean;
  /**
   * The run-level verdict, read from the run manifest (listRuns) —
   * NEVER from the last progress event's stage status. A demo-proof
   * run can have every stage 'completed' and still be a failed run
   * (failed checks), and no single progress event carries the verdict
   * without mislabelling a stage.
   */
  outcome: {
    status: LlmbuilderRunInfo['status'];
    decision?: string;
    score?: number | null;
    demoChecks?: DemoCheckSummary;
    error?: string;
  } | null;
}

function freshStages(): Record<PipelineStageId, RunStageState> {
  const stages = {} as Record<PipelineStageId, RunStageState>;
  for (const stage of PIPELINE_STAGES) {
    stages[stage] = { status: 'pending', message: '' };
  }
  return stages;
}

export interface StartRunOptions {
  tier: RunTier;
  steps: number;
  batchSize: number;
  /** Corpus id: 'repo-text' (default) or an imported dataset id. */
  corpus: string;
  /** True for the demo-proof workflow (demo_proof_workflow.py). */
  demoProof?: boolean;
}

interface ForgeState {
  roster: Homunculus[];
  selectedId: string | null;
  currentRun: ForgeRun | null;
  scoreboard: ScoreboardRow[];
  /** Raw scoreboard JSON, as carried on the array by getScoreboard (.raw). */
  scoreboardRaw: Record<string, unknown> | null;
  setupStatus: LlmbuilderStatus | null;
  /** Live first-run setup progress (runId 'setup', stage 'data'). */
  setupProgress: { status: StageStatus; message: string } | null;
  lowMemory: boolean;
  /** Imported datasets (ChatGPT JSONL) available as corpora. */
  datasets: ImportDatasetResult[];
  askResult: BrainAnswer | null;
  askError: string | null;
  lastError: string | null;

  loadRoster: () => Promise<void>;
  saveRoster: () => Promise<void>;
  selectHomunculus: (id: string | null) => void;
  /**
   * DOUBLE-CLICK activation, IN THE FORGE specifically (Gary,
   * 2026-11-06). Activates the Homunculus: it becomes the selected
   * one, the face on the main terminal pages swaps to its colour
   * (the `homunculusColor` setting is the face's colour — activation
   * sets it), and the activation validates a new solid face colour
   * (a ritual tick, for the stop-colour regression). Swappable on
   * the go, quick — no restart, no deep menu. Single click still
   * only selects (see selectHomunculus); activation is the
   * double-click.
   *
   * LIVE REPORTING BUDDY — PLACEHOLDER, explicitly not built. The
   * active Homunculus is a potential live reporting buddy (the face
   * reports live once the display messages are finished). The
   * display messages were started workshopping and are NOT finished
   * — do not invent them. The hook point is here: activation is
   * where the reporting buddy attaches, and the action message on a
   * stop (assignStopActionMessage) is what it will report. Until the
   * display messages exist, activation only swaps the face.
   */
  activateHomunculus: (id: string) => void;
  /**
   * Summons (Gary, 2026-11-09) — the Summons section of the Forge,
   * SEPARATE from the Homunculi roster. Summons state lives here,
   * in the Forge store — never in the roster file (the roster is
   * Homunculi only, via llmbuilder:getRoster / saveRoster).
   * Selection mirrors the roster pattern: single click selects,
   * double-click activates (see selectSummon / activateSummon).
   */
  /** The selected summon (single click), or null when none is selected. */
  selectedSummonId: string | null;
  /** The active summon — swapped into the summon slot — or null. */
  activeSummonId: string | null;
  /** Bumped by requestSummonsScroll; the Forge view scrolls to the
   * Summons section when it changes (the top-bar Summons entry). */
  summonsScrollRequest: number;
  /** Select a summon (single click). Selection is allowed while
   * locked — selection is not activation. */
  selectSummon: (id: string | null) => void;
  /**
   * Activate a summon (double-click): swap it into the summon slot
   * as the active summon. A LOCKED summon is rejected — lastError
   * says why and the active summon does not change. Today every
   * summon is locked (nobody owns a Living Golem yet; detection is
   * open — see isSummonUnlocked), so activation always rejects
   * until detection lands.
   */
  activateSummon: (id: string) => void;
  /** Ask the Forge view to scroll to the Summons section. */
  requestSummonsScroll: () => void;
  /**
   * Dual unison (binary 2 / the third type), the stop, the tail, and
   * tri unison — Gary's design, 2026-11-06 (see
   * src/lib/dualUnison.ts for the model). Detection is derived from
   * the roster (a pink AND a purple Homunculus) — it is never stored
   * separately, so it can never disagree with the roster.
   */
  unison: DualUnisonState;
  /**
   * Input the FIRST stop action — setting up the third type in the
   * dual unison tab. Requires dual unison detected and the stop
   * action never input. The colour is assigned to the stop (for
   * now); the duration is how long the stop colour shows on the
   * action face when the stop is hit (1–9 seconds, or until the
   * next action). A violation is a rejection (lastError + throw),
   * like the opposite-colour rule.
   */
  inputStopAction: (color: string, duration: StopColorDuration) => void;
  /** Verify the input stop action, within the unison detect. */
  verifyStopAction: () => void;
  /**
   * Detect the verified stop action, within the unison detect. This
   * is what FULLY unlocks the tail page. Requires 'verified'.
   */
  detectStopAction: () => void;
  /** Assign an action message to the stop, from the face. */
  assignStopActionMessage: (message: string) => void;
  /**
   * Hit the stop: the action face colours to the stop's colour. For
   * a seconds duration the colour shows for that long, then the face
   * regresses to the last validated solid (see
   * regressStopFaceColor). For "until next action" it stays until
   * the next action (an activation, a creation, rooting an action).
   */
  hitStop: () => void;
  /**
   * Regress the face from a stop colour to the last validated solid
   * (the active Homunculus's colour, at the highest face tick).
   * Called when a seconds duration expires; also the explicit
   * regression action for tests.
   */
  regressStopFaceColor: () => void;
  /**
   * Root a united action in binary 2 — append it to the tail.
   * Requires dual unison detected AND the tail page fully unlocked
   * (stop action verified and detected). The tail is append-only;
   * this never rewrites history.
   */
  rootUnitedAction: (action: string) => void;
  /**
   * Acquire the tri unison buff on the account. Requires dual unison
   * detected. The buff's effect and the intelligence gauging are
   * OPEN (see TriUnisonState) — acquiring records only that the
   * account has it.
   */
  acquireTriUnison: () => void;
  createHomunculus: (
    name: string,
    color: HomunculusColor,
    biography?: HomunculusBiography | null,
  ) => Promise<Homunculus>;
  updateBiography: (
    id: string,
    patch: { name?: string; biography: HomunculusBiography | null },
  ) => Promise<void>;
  loadScoreboard: () => Promise<void>;
  loadStatus: () => Promise<void>;
  startRun: (homunculusId: string, options: StartRunOptions) => Promise<string | null>;
  cancelRun: () => Promise<void>;
  /**
   * Read the run-level verdict from the run manifest (listRuns) and
   * apply it to the current run. The manifest is the only source of
   * the verdict — progress events carry stage statuses, not the
   * run outcome.
   */
  refreshRunOutcome: (runId: string) => Promise<void>;
  /** Fetch a candidate's Gate decision and, on promote, grow the lineage. */
  applyPromotionDecision: (
    homunculusId: string,
    decision: PromotionDecision,
  ) => Promise<void>;
  refreshPromotionDecision: (
    homunculusId: string,
    candidate: string,
  ) => Promise<PromotionDecision | null>;
  installBrain: (homunculusId: string, candidate: string) => Promise<void>;
  rollback: (homunculusId: string) => Promise<void>;
  importDataset: (name: string, jsonl: string) => Promise<ImportDatasetResult | null>;
  /** Ask the installed brain — verification only, not a chat surface. */
  askBrain: (homunculusId: string, prompt: string) => Promise<BrainAnswer | null>;
  /** Subscribe to run progress events; returns an unsubscribe function. */
  subscribeProgress: () => () => void;
  clearRun: () => void;
  resetForTests: () => void;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'homunculus';
}

/** The stored colour choice, correct key first, misspelled key as fallback. */
export function readStoredHomunculusColor(): HomunculusColor | null {
  const settings = useSettingsStore.getState().settings as unknown as Record<
    string,
    unknown
  >;
  return (
    parseHomunculusColorValue(settings?.homunculusColor) ??
    parseHomunculusColorValue(settings?.hommunculusColor)
  );
}

/**
 * The active Homunculus's colour — the colour the opposite-colour
 * rule (Gary, 2026-11-06) is measured against. The selected
 * Homunculus's colour when one is selected; when the roster is
 * non-empty but nothing is selected, roster[0]'s colour (the same
 * fallback loadRoster uses for the selection); null when the roster
 * is empty — no colour chosen anywhere, the black / unformed state,
 * free choice. See the Forge rules block in
 * src/lib/homunculusColor.ts.
 */
export function activeHomunculusColor(
  roster: Homunculus[],
  selectedId: string | null,
): HomunculusColor | null {
  const selected = selectedId
    ? roster.find((h) => h.id === selectedId)
    : undefined;
  return selected?.color ?? roster[0]?.color ?? null;
}

/** The colours a new Homunculus may take right now (single source of truth). */
export function allowedNewHomunculusColorsFor(
  roster: Homunculus[],
  selectedId: string | null,
): HomunculusColor[] {
  return allowedNewHomunculusColors(activeHomunculusColor(roster, selectedId));
}

function corpusSummaryFor(
  datasets: ImportDatasetResult[],
  corpus: string,
): CorpusSummary {
  const match = datasets.find((d) => d.datasetId === corpus);
  if (!match) return { domains: [], recordCount: 0 };
  return { domains: match.domains, recordCount: match.recordCount };
}

export const useForgeStore = create<ForgeState>()((set, get) => ({
  roster: [],
  selectedId: null,
  currentRun: null,
  scoreboard: [],
  scoreboardRaw: null,
  setupStatus: null,
  setupProgress: null,
  lowMemory: false,
  datasets: [],
  askResult: null,
  askError: null,
  lastError: null,
  selectedSummonId: null,
  activeSummonId: null,
  summonsScrollRequest: 0,
  unison: freshDualUnisonState(),

  loadRoster: async () => {
    const api = getLlmbuilderApi();
    let roster: Homunculus[] | null = null;
    if (api) {
      try {
        roster = await api.getRoster();
      } catch (error) {
        set({ lastError: `Could not load the roster: ${String(error)}` });
        return;
      }
    }
    if (!roster || roster.length === 0) {
      // First load with an empty roster: seed ONE Homunculus from the
      // stored colour choice. No colour stored = seed nothing — the
      // roster starts empty and the view says to choose a colour in
      // the Synth view first. Never invent a Homunculus.
      const color = readStoredHomunculusColor();
      if (color) {
        const seeded = emptyHomunculus('lucifer', 'Lucifer', color);
        roster = [seeded];
        set({ roster, selectedId: 'lucifer', lastError: null });
        await get().saveRoster();
        return;
      }
      set({ roster: [], selectedId: null, lastError: null });
      return;
    }
    set({
      roster,
      selectedId: get().selectedId ?? roster[0]?.id ?? null,
      lastError: null,
    });
  },

  saveRoster: async () => {
    const api = getLlmbuilderApi();
    if (!api) {
      set({ lastError: 'Forge IPC unavailable — the roster was not saved.' });
      return;
    }
    try {
      await api.saveRoster(get().roster);
      set({ lastError: null });
    } catch (error) {
      set({ lastError: `Could not save the roster: ${String(error)}` });
    }
  },

  selectHomunculus: (id) => set({ selectedId: id, askResult: null, askError: null }),

  activateHomunculus: (id) => {
    const homunculus = get().roster.find((h) => h.id === id);
    if (!homunculus) {
      set({ lastError: 'No such Homunculus to activate.' });
      return;
    }
    // Activating IS an action: a stop colour showing "until the next
    // action" clears, and the face regresses to the solid.
    const unison = withNextActionClear(get().unison);
    const faceTick = unison.faceTick + 1;
    set({
      selectedId: id,
      askResult: null,
      askError: null,
      lastError: null,
      unison: {
        ...unison,
        faceTick,
        solidFace: { tick: faceTick, color: homunculus.color },
      },
    });
    // The face on the main terminal pages wears the `homunculusColor`
    // setting — activation sets it to the activated Homunculus's
    // colour, so the face swaps. (The opposite-colour rule still
    // measures against the roster's active Homunculus, not this
    // setting, so the two never interfere.)
    void useSettingsStore
      .getState()
      .updateSetting('homunculusColor', homunculus.color);
  },

  selectSummon: (id) => set({ selectedSummonId: id }),

  activateSummon: (id) => {
    const summon = SUMMONS.find((s) => s.id === id);
    if (!summon) {
      set({ lastError: 'No such summon to activate.' });
      return;
    }
    // Locked summons cannot be swapped in — the lock is the rule,
    // not a missing asset. Today every summon is locked (see
    // isSummonUnlocked); the rejection is the honest state, and the
    // active summon does not change.
    if (!isSummonUnlocked(summon)) {
      set({ lastError: `${summon.name} is locked: ${summon.lockedText}` });
      return;
    }
    set({ activeSummonId: id, selectedSummonId: id, lastError: null });
  },

  requestSummonsScroll: () =>
    set((s) => ({ summonsScrollRequest: s.summonsScrollRequest + 1 })),

  inputStopAction: (color, duration) => {
    const detection = detectDualUnison(get().roster);
    if (!detection.detected) {
      const message =
        'Dual unison is not unlocked yet — create a pink and a purple Homunculus first.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (!canInputStopAction(get().unison.stopAction)) {
      const message = 'The first stop action has already been input.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (typeof color !== 'string' || color.trim().length === 0) {
      const message = 'Assign a colour to the stop first.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (
      duration.kind === 'seconds' &&
      parseStopColorDurationSeconds(duration.seconds) === null
    ) {
      const message =
        'The stop colour shows for 1–9 seconds — pick a whole number in that range.';
      set({ lastError: message });
      throw new Error(message);
    }
    set({
      unison: {
        ...get().unison,
        stopAction: 'input',
        stopColor: color.trim(),
        stopDuration: duration,
      },
      lastError: null,
    });
  },

  verifyStopAction: () => {
    if (!canVerifyStopAction(get().unison.stopAction)) {
      const message =
        'Nothing to verify — input the first stop action first.';
      set({ lastError: message });
      throw new Error(message);
    }
    set({
      unison: { ...get().unison, stopAction: 'verified' },
      lastError: null,
    });
  },

  detectStopAction: () => {
    if (!canDetectStopAction(get().unison.stopAction)) {
      const message =
        'Nothing to detect — verify the stop action first.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (!detectDualUnison(get().roster).detected) {
      const message =
        'The unison detect no longer sees dual unison — the pair is gone.';
      set({ lastError: message });
      throw new Error(message);
    }
    set({
      unison: { ...get().unison, stopAction: 'detected' },
      lastError: null,
    });
  },

  assignStopActionMessage: (message) => {
    if (get().unison.stopAction === 'not-input') {
      const error = 'Input the first stop action before assigning it a message.';
      set({ lastError: error });
      throw new Error(error);
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      const error = 'The action message is empty — write one first.';
      set({ lastError: error });
      throw new Error(error);
    }
    set({
      unison: { ...get().unison, stopMessage: message.trim() },
      lastError: null,
    });
  },

  hitStop: () => {
    const unison = get().unison;
    if (unison.stopAction === 'not-input' || !unison.stopColor) {
      const message =
        'No stop to hit — set up the third type in the Dual Unison tab first.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (!unison.stopDuration) {
      const message =
        'The stop has no duration — choose 1–9 seconds or until the next action.';
      set({ lastError: message });
      throw new Error(message);
    }
    // A new hit restarts the colour: clear any running seconds timer.
    clearStopFaceTimer();
    set({
      unison: { ...unison, stopFaceColorActive: true },
      lastError: null,
    });
    if (unison.stopDuration.kind === 'seconds') {
      const ms = unison.stopDuration.seconds * 1000;
      stopFaceTimer = setTimeout(() => {
        stopFaceTimer = null;
        get().regressStopFaceColor();
      }, ms);
    }
    // "Until the next action" needs no timer — the next action
    // (activation, creation, rooting) clears it (see
    // withNextActionClear).
  },

  regressStopFaceColor: () => {
    clearStopFaceTimer();
    const unison = get().unison;
    if (!unison.stopFaceColorActive) return;
    // The regression target is the last validated solid — the active
    // Homunculus's colour at the highest face tick. The face reads
    // that solid (via the `homunculusColor` setting, set at
    // activation) once this override clears, so clearing the flag IS
    // the regression: nothing else has to change.
    set({ unison: { ...unison, stopFaceColorActive: false } });
  },

  rootUnitedAction: (action) => {
    const detection = detectDualUnison(get().roster);
    if (!detection.detected) {
      const message =
        'Dual unison is not unlocked — root actions only while united.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (!isTailPageFullyUnlocked(get().unison.stopAction)) {
      const message =
        'The tail page is not fully unlocked yet — the stop action must be verified and detected first.';
      set({ lastError: message });
      throw new Error(message);
    }
    if (typeof action !== 'string' || action.trim().length === 0) {
      const message = 'The united action is empty — write what happened first.';
      set({ lastError: message });
      throw new Error(message);
    }
    // Rooting IS an action: a stop colour showing "until the next
    // action" clears.
    const unison = withNextActionClear(get().unison);
    const tail = appendTailEntry(
      unison.tail,
      unison.tailNextTick,
      action.trim(),
      new Date().toISOString(),
    );
    set({
      unison: {
        ...unison,
        tail,
        tailNextTick: unison.tailNextTick + 1,
      },
      lastError: null,
    });
  },

  acquireTriUnison: () => {
    if (!detectDualUnison(get().roster).detected) {
      const message =
        'Tri unison is not acquirable yet — unlock dual unison first.';
      set({ lastError: message });
      throw new Error(message);
    }
    set({
      unison: { ...get().unison, triUnisonAcquired: true },
      lastError: null,
    });
  },

  createHomunculus: async (name, color, biography = null) => {
    // Forge rule (Gary, 2026-11-06): a new Homunculus must be the
    // opposite colour of the active one — unless no colour is chosen
    // anywhere (black / unformed face), when either colour is
    // allowed. A violation is a rejection, not a silent correction:
    // lastError says why, and the caller keeps its form open. The
    // name is used exactly as given — the EVE naming default lives
    // in the ForgeView creation form, not here.
    const active = activeHomunculusColor(get().roster, get().selectedId);
    if (active !== null && color !== oppositeHomunculusColor(active)) {
      const message =
        `A new Homunculus must be ${oppositeHomunculusColor(active)} — ` +
        `the opposite colour of the active one (${active}).`;
      set({ lastError: message });
      throw new Error(message);
    }
    // STOP (Gary, 2026-11-06), built into the dual unison type: once
    // dual unison is unlocked, no more singles can be created until
    // the FIRST STOP ACTION is input (setting up the third type in
    // the dual unison tab). The pair-forming creation itself is never
    // blocked — dual unison is only detected AFTER the pair exists,
    // so the second Homunculus of the pair is always allowed in.
    // A violation is a rejection, not a silent correction.
    if (
      detectDualUnison(get().roster).detected &&
      get().unison.stopAction === 'not-input'
    ) {
      const message =
        'Dual unison is unlocked — set up the third type in the Dual Unison tab first (the first stop action) before making more singles.';
      set({ lastError: message });
      throw new Error(message);
    }
    const base = slugify(name);
    let id = base;
    let n = 2;
    while (get().roster.some((h) => h.id === id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    const homunculus: Homunculus = {
      ...emptyHomunculus(id, name, color),
      biography,
    };
    // Creating IS an action: a stop colour showing "until the next
    // action" clears.
    const unison = withNextActionClear(get().unison);
    set({
      roster: [...get().roster, homunculus],
      selectedId: id,
      unison,
    });
    await get().saveRoster();
    return homunculus;
  },

  updateBiography: async (id, patch) => {
    const roster = get().roster.map((h) =>
      h.id === id
        ? { ...h, name: patch.name ?? h.name, biography: patch.biography }
        : h,
    );
    set({ roster });
    await get().saveRoster();
  },

  loadScoreboard: async () => {
    const api = getLlmbuilderApi();
    if (!api) return;
    try {
      const scoreboard = await api.getScoreboard();
      // The raw scoreboard JSON rides on the array as .raw (see
      // llmbuilderApi.ts) — keep it for callers that want the file.
      set({ scoreboard, scoreboardRaw: scoreboard.raw ?? null });
    } catch (error) {
      set({ lastError: `Could not load the scoreboard: ${String(error)}` });
    }
  },

  loadStatus: async () => {
    const api = getLlmbuilderApi();
    if (!api) return;
    try {
      const setupStatus = await api.status();
      set({ setupStatus, lowMemory: setupStatus.lowMemory });
    } catch (error) {
      set({ lastError: `Could not read the Forge status: ${String(error)}` });
    }
  },

  startRun: async (homunculusId, options) => {
    const api = getLlmbuilderApi();
    const homunculus = get().roster.find((h) => h.id === homunculusId);
    if (!homunculus) {
      set({ lastError: 'No Homunculus selected for this run.' });
      return null;
    }
    if (!api) {
      set({ lastError: 'Forge IPC unavailable — the run was not started.' });
      return null;
    }
    const candidate = `${homunculus.id}-${homunculus.lineage.length + 1}`;
    const knowledgeRecordsJsonl = buildKnowledgeRecords(
      homunculus,
      corpusSummaryFor(get().datasets, options.corpus),
    );
    try {
      const run = await api.startRun({
        homunculusId,
        candidate,
        tier: options.tier,
        steps: options.steps,
        batchSize: options.batchSize,
        corpus: options.corpus,
        knowledgeRecordsJsonl,
        demoProof: options.demoProof,
      });
      set({
        currentRun: {
          runId: run.runId,
          homunculusId,
          candidate,
          tier: options.tier,
          stages: freshStages(),
          logLines: [`Run ${run.runId} started — candidate ${candidate}.`],
          done: false,
          outcome: null,
        },
        roster: get().roster.map((h) =>
          h.id === homunculusId ? { ...h, status: 'training' } : h,
        ),
        lastError: null,
      });
      return run.runId;
    } catch (error) {
      set({ lastError: `Could not start the run: ${String(error)}` });
      return null;
    }
  },

  refreshRunOutcome: async (runId) => {
    const api = getLlmbuilderApi();
    if (!api) return;
    let runs: LlmbuilderRunInfo[];
    try {
      runs = await api.listRuns();
    } catch (error) {
      set({ lastError: `Could not read the run outcome: ${String(error)}` });
      return;
    }
    const manifest = runs.find((r) => r.runId === runId);
    if (!manifest) return;
    const run = get().currentRun;
    if (!run || run.runId !== runId) return;
    const outcome = {
      status: manifest.status,
      decision: manifest.decision,
      score: manifest.score ?? null,
      demoChecks: manifest.demoChecks,
      error: manifest.error,
    };
    const verdictLine =
      manifest.status === 'completed'
        ? `Run finished — Gate v2: ${manifest.decision ?? 'no decision'}` +
          (manifest.score !== undefined && manifest.score !== null
            ? ` (score ${manifest.score})`
            : '') +
          '.'
        : manifest.status === 'failed'
          ? `Run failed.` +
            (manifest.demoChecks && manifest.demoChecks.failed > 0
              ? ` Demo proof: ${manifest.demoChecks.passed}/${manifest.demoChecks.total} checks passed.`
              : '') +
            (manifest.error ? ` ${manifest.error}` : '')
          : manifest.status === 'cancelled'
            ? 'Run cancelled.'
            : null;
    set((state) => ({
      currentRun: state.currentRun
        ? {
            ...state.currentRun,
            done: manifest.status !== 'running',
            outcome,
            logLines:
              verdictLine &&
              !state.currentRun.logLines.includes(verdictLine)
                ? [...state.currentRun.logLines, verdictLine]
                : state.currentRun.logLines,
          }
        : null,
      // A failed or cancelled run leaves the Homunculus where it was
      // before the run — training is not a state it stays in.
      roster:
        manifest.status === 'failed' || manifest.status === 'cancelled'
          ? state.roster.map((h) =>
              h.id === run.homunculusId && h.status === 'training'
                ? {
                    ...h,
                    status: h.modelPath
                      ? ('installed' as const)
                      : ('untrained' as const),
                  }
                : h,
            )
          : state.roster,
    }));
  },

  cancelRun: async () => {
    const api = getLlmbuilderApi();
    const run = get().currentRun;
    if (!run) return;
    if (api) {
      try {
        await api.cancelRun(run.runId);
      } catch (error) {
        set({ lastError: `Could not cancel the run: ${String(error)}` });
      }
    }
    set((state) => ({
      currentRun: state.currentRun
        ? {
            ...state.currentRun,
            done: true,
            logLines: [
              ...state.currentRun.logLines,
              'Run cancelled.',
            ],
          }
        : null,
      roster: state.roster.map((h) =>
        h.id === run.homunculusId && h.status === 'training'
          ? {
              ...h,
              status: h.modelPath
                ? ('installed' as const)
                : ('untrained' as const),
            }
          : h,
      ),
    }));
    // The manifest is the verdict — read it so the outcome (and any
    // demo-check tally) shows honestly instead of a bare "cancelled".
    await get().refreshRunOutcome(run.runId);
  },

  applyPromotionDecision: async (homunculusId, decision) => {
    const homunculus = get().roster.find((h) => h.id === homunculusId);
    if (!homunculus) return;
    if (decision.decision !== 'promote') {
      // archive_only / reject: no lineage entry, no birth — the
      // candidate is kept on the scoreboard but the Homunculus does
      // not grow from it. Status returns to untrained (or stays
      // installed if it already has a brain).
      set({
        roster: get().roster.map((h) =>
          h.id === homunculusId
            ? {
                ...h,
                status:
                  h.status === 'training' || h.status === 'candidate'
                    ? h.modelPath
                      ? 'installed'
                      : 'untrained'
                    : h.status,
              }
            : h,
        ),
      });
      return;
    }
    const entry: HomunculusLineageEntry = {
      promotion: homunculus.lineage.length + 1,
      candidate: decision.candidate,
      parentBase: 'arc_tiny',
      corpus: 'repo-text',
      gateDecision: 'promote' as GateDecision,
      score: decision.score,
      scoreboardRef: `results/scoreboard.json#${decision.candidate}`,
      receiptRef: decision.receiptRef,
      timestamp: new Date().toISOString(),
    };
    const grown = appendLineageEntry(homunculus, entry);
    const roster = get().roster.map((h) =>
      h.id === homunculusId
        ? {
            ...grown,
            status: 'promoted' as const,
            incumbentScore: decision.score ?? grown.incumbentScore,
          }
        : h,
    );
    set({ roster });
    await get().saveRoster();
  },

  refreshPromotionDecision: async (homunculusId, candidate) => {
    const api = getLlmbuilderApi();
    if (!api) return null;
    try {
      const decision = await api.getPromotionDecision(candidate);
      if (decision) await get().applyPromotionDecision(homunculusId, decision);
      return decision;
    } catch (error) {
      set({
        lastError: `Could not read the promotion decision: ${String(error)}`,
      });
      return null;
    }
  },

  installBrain: async (homunculusId, candidate) => {
    const api = getLlmbuilderApi();
    if (!api) {
      set({ lastError: 'Forge IPC unavailable — the brain was not installed.' });
      return;
    }
    try {
      const result = await api.installBrain(homunculusId, candidate);
      // A failed install must NEVER render as installed: the main
      // process reports { ok, modelPath, previousModelPath, error? }
      // and ok:false means no brain was installed at all.
      if (!result.ok) {
        set({
          lastError: `Could not install the brain: ${result.error ?? 'unknown error'}`,
        });
        return;
      }
      set({
        roster: get().roster.map((h) =>
          h.id === homunculusId
            ? { ...h, modelPath: result.modelPath, status: 'installed' as const }
            : h,
        ),
        lastError: null,
      });
      await get().saveRoster();
    } catch (error) {
      set({ lastError: `Could not install the brain: ${String(error)}` });
    }
  },

  rollback: async (homunculusId) => {
    const api = getLlmbuilderApi();
    if (!api) {
      set({ lastError: 'Forge IPC unavailable — rollback did not run.' });
      return;
    }
    try {
      const result = await api.rollback(homunculusId);
      if (!result.ok) {
        set({
          lastError: `Could not roll back: ${result.error ?? 'unknown error'}`,
        });
        return;
      }
      set({
        roster: get().roster.map((h) =>
          h.id === homunculusId
            ? {
                ...h,
                modelPath: result.modelPath,
                status: 'installed' as const,
              }
            : h,
        ),
        lastError: null,
      });
      await get().saveRoster();
    } catch (error) {
      set({ lastError: `Could not roll back: ${String(error)}` });
    }
  },

  importDataset: async (name, jsonl) => {
    const api = getLlmbuilderApi();
    if (!api) {
      set({ lastError: 'Forge IPC unavailable — the dataset was not imported.' });
      return null;
    }
    try {
      const result = await api.importDataset(name, jsonl);
      set({ datasets: [...get().datasets, result] });
      return result;
    } catch (error) {
      set({ lastError: `Could not import the dataset: ${String(error)}` });
      return null;
    }
  },

  askBrain: async (homunculusId, prompt) => {
    const homunculus = get().roster.find((h) => h.id === homunculusId);
    if (!homunculus || !homunculus.modelPath) {
      set({
        askResult: null,
        askError: 'No brain installed — install a promoted model first.',
      });
      return null;
    }
    const api = getLlmbuilderApi();
    if (!api) {
      set({ askResult: null, askError: 'Forge IPC unavailable.' });
      return null;
    }
    try {
      const answer = await api.askBrain(homunculusId, prompt);
      if (!answer) {
        set({
          askResult: null,
          askError: 'The brain gave no answer.',
        });
        return null;
      }
      set({ askResult: answer, askError: null });
      return answer;
    } catch (error) {
      set({ askResult: null, askError: `Could not ask the brain: ${String(error)}` });
      return null;
    }
  },

  subscribeProgress: () => {
    const api = getLlmbuilderApi();
    if (!api) return () => undefined;
    return api.onProgress((event) => {
      // First-run setup progress rides on runId 'setup' (stage
      // 'data') — it has no current run, so it goes to setupProgress
      // instead of being dropped by the runId check below.
      if (event.runId === 'setup') {
        set({
          setupProgress: { status: event.status, message: event.message },
        });
        return;
      }
      let justDone = false;
      set((state) => {
        const run = state.currentRun;
        if (!run || run.runId !== event.runId) return state;
        const stages = { ...run.stages };
        stages[event.stage] = { status: event.status, message: event.message };
        const done =
          event.stage === 'promote' &&
          (event.status === 'completed' ||
            event.status === 'failed' ||
            event.status === 'cancelled');
        justDone = done && !run.done;
        return {
          currentRun: {
            ...run,
            stages,
            logLines: [...run.logLines, event.message].slice(-500),
            done: run.done || done,
          },
        };
      });
      // The stages are done — but the RUN's verdict lives in the
      // manifest, not in this event. A demo-proof run with failed
      // checks has every stage 'completed' and a failed run: only
      // listRuns says so.
      if (justDone) void get().refreshRunOutcome(event.runId);
    });
  },

  clearRun: () => set({ currentRun: null }),

  resetForTests: () => {
    clearStopFaceTimer();
    set({
      roster: [],
      selectedId: null,
      currentRun: null,
      scoreboard: [],
      scoreboardRaw: null,
      setupStatus: null,
      setupProgress: null,
      lowMemory: false,
      datasets: [],
      askResult: null,
      askError: null,
      lastError: null,
      selectedSummonId: null,
      activeSummonId: null,
      summonsScrollRequest: 0,
      unison: freshDualUnisonState(),
    });
  },
}));
