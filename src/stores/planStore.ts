import { create } from 'zustand';

/**
 * The plan store — the real store behind the `/plan` Planning panel
 * (platform-sweep audit item 1, 2026-11-14).
 *
 * The panel shipped in the 2026-02-28 mega-commit as a mock: two
 * hardcoded placeholder plans (`PLACEHOLDER_PLANS`), a "Create New
 * Plan" button with no `onClick`, and a detail view that said "Plan
 * details coming soon". The design it was a mock OF is settled and
 * documented in-repo — `PLANNING_PANEL_COMPLETE.md` ("Warp AI-style
 * `/plan` command with dedicated Planning panel for tracking
 * implementation plans", plan cards with status badges
 * draft/in-progress/completed, progress tracking with visual
 * progress bars, a create button, a detail view with metadata and
 * "detailed steps, progress tracking, and notes") and
 * `helpData.ts` ("Create and track implementation plans"). So the
 * panel is wired to a real store here, not deleted: the missing
 * pieces were engineering, not design.
 *
 * SHAPE — the `Plan` type the panel already had, with steps made
 * real: `steps` was a count; it is now the step items themselves
 * (`{ id, title, done }`), and the counts + status are derived
 * from them, so a status can never disagree with its steps. A plan
 * with no steps (or none done) is a draft; some done is
 * in-progress; all done (and at least one step) is completed —
 * exactly the two placeholder examples (0/5 draft, 6/6 completed).
 *
 * PERSISTENCE — one record, keyed by profile id:
 * `localStorage['lucid-plans-v1']` holds
 * `{ [profileId]: Plan[] }` (newest first). The store keeps only
 * the CURRENT profile's plans in memory; `switchProfile` flushes
 * the old profile's plans into the record and loads the new one.
 * Writes are synchronous on each mutation (plans change on user
 * action, not per keystroke — no debounce needed), best-effort,
 * never throwing. Corrupt entries are repaired or dropped, never
 * trusted blindly.
 *
 * GUEST VEIL — copied from commandHistoryStore exactly: entering a
 * guest session stashes the owner's plans in memory (never deleted,
 * never written over) and the visible list goes empty; the guest's
 * own plans live only for the session; while the flag is on,
 * nothing is ever persisted to disk; exiting drops the guest's
 * session plans and restores the stashed owner plans exactly. The
 * veil is driven from the same choke points as the command-history
 * veil (profileStore.selectProfile + the Terminal / MiniTerminal
 * mount effects).
 *
 * CAPS — 100 plans per profile, 200 steps per plan; titles and
 * descriptions are trimmed and length-capped. Empty titles are
 * ignored (create/add return null and change nothing).
 */

/** localStorage key for the persisted per-profile record. */
export const PLANS_STORAGE_KEY = 'lucid-plans-v1';

/** Most plans kept per profile, newest first. */
export const PLANS_MAX_PER_PROFILE = 100;

/** Most steps kept per plan. */
export const PLAN_MAX_STEPS = 200;

/** The implicit profile id (mirrors profileStore.DEFAULT_PROFILE_ID).
 *  Used only as the fallback when the store is used before any
 *  profile has been selected (tests, or an unusual boot path) —
 *  production always calls switchProfile first. */
const FALLBACK_PROFILE_ID = 'default';

export interface PlanStep {
  id: string;
  title: string;
  done: boolean;
}

export type PlanStatus = 'draft' | 'in-progress' | 'completed';

export interface Plan {
  id: string;
  title: string;
  description: string;
  /** ISO date string, set at creation. */
  created: string;
  steps: PlanStep[];
}

/** The persisted record: one plan list per profile id. */
export type PlanRecord = Record<string, Plan[]>;

/** Derive a plan's status from its steps — never stored, so a
 *  status can never disagree with the steps it describes. */
export function planStatus(plan: Plan): PlanStatus {
  const total = plan.steps.length;
  if (total === 0) return 'draft';
  const done = plan.steps.filter((s) => s.done).length;
  if (done === 0) return 'draft';
  if (done === total) return 'completed';
  return 'in-progress';
}

/** Step counts for a plan: { done, total }. */
export function planStepCounts(plan: Plan): { done: number; total: number } {
  return {
    done: plan.steps.filter((s) => s.done).length,
    total: plan.steps.length,
  };
}

/** A stable empty list so selectors never hand out a fresh array. */
export const EMPTY_PLANS: Plan[] = [];

function isPlausibleStep(value: unknown): value is PlanStep {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.title === 'string' &&
    typeof s.done === 'boolean'
  );
}

function isPlausiblePlan(value: unknown): value is Plan {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.title === 'string' &&
    typeof p.description === 'string' &&
    typeof p.created === 'string' &&
    Array.isArray(p.steps) &&
    p.steps.every(isPlausibleStep)
  );
}

/** Repair one stored plan: drop implausible steps, cap the rest.
 *  Returns null when the plan itself is not plausible. */
function repairPlan(value: unknown): Plan | null {
  if (!isPlausiblePlan(value)) return null;
  return {
    id: value.id,
    title: value.title.slice(0, 200),
    description: value.description.slice(0, 2000),
    created: value.created,
    steps: value.steps.slice(0, PLAN_MAX_STEPS).map((s) => ({
      id: s.id,
      title: s.title.slice(0, 500),
      done: s.done,
    })),
  };
}

/**
 * Read the persisted record, or {} when there is none / it is
 * corrupt / storage is unavailable. Never throws.
 */
export function readPersistedPlans(): PlanRecord {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(PLANS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: PlanRecord = {};
    for (const [profileId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const plans = value
        .map(repairPlan)
        .filter((p): p is Plan => p !== null)
        .slice(0, PLANS_MAX_PER_PROFILE);
      if (plans.length > 0) out[profileId] = plans;
    }
    return out;
  } catch {
    // Corrupt or unreadable storage: start empty, never crash.
    return {};
  }
}

/** Serialize one record snapshot for storage (capped per profile). */
function serializePlans(record: PlanRecord): string {
  const capped: PlanRecord = {};
  for (const [profileId, plans] of Object.entries(record)) {
    if (plans.length > 0) capped[profileId] = plans.slice(0, PLANS_MAX_PER_PROFILE);
  }
  return JSON.stringify(capped);
}

/** Write the current state to storage now. Never throws. */
export function flushPlansPersistence(): void {
  try {
    // A guest session never writes plans to disk: the guest's
    // session plans are dropped when the guest session ends, and
    // the owner's persisted record must never be overwritten
    // with the guest's view.
    if (usePlanStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const state = usePlanStore.getState();
    // Re-read the record so other profiles' plans (possibly
    // written by the detached window since our last read) are
    // preserved; only this profile's key is overwritten.
    const record = readPersistedPlans();
    if (state.loaded && state.profileId) {
      record[state.profileId] = state.plans.slice(0, PLANS_MAX_PER_PROFILE);
    }
    localStorage.setItem(PLANS_STORAGE_KEY, serializePlans(record));
  } catch {
    // Private mode / quota: plans just don't persist this session.
  }
}

/**
 * Remove one profile's plans from the persisted record (profile
 * wipe — the profile's memory goes with the profile). If it is
 * the currently loaded profile, the in-memory list goes too.
 * Never during a guest session: the key holds the OWNER's
 * record, and a guest must never delete it.
 */
export function clearProfilePlans(profileId: string): void {
  try {
    if (usePlanStore.getState().guestSessionActive) return;
    if (typeof localStorage === 'undefined') return;
    const record = readPersistedPlans();
    delete record[profileId];
    localStorage.setItem(PLANS_STORAGE_KEY, serializePlans(record));
  } catch {
    // Unavailable storage: nothing to clear.
  }
  const state = usePlanStore.getState();
  if (state.loaded && state.profileId === profileId) {
    usePlanStore.setState({ plans: [] });
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface PlanState {
  /** The visible plan list, newest first: the current profile's
   *  plans, or the guest's session-only plans while a guest
   *  session is veiled in. */
  plans: Plan[];
  /** The profile whose plans are loaded ('' until switchProfile
   *  or the first mutation has run). */
  profileId: string;
  /** Whether a profile's plans have been loaded yet. */
  loaded: boolean;

  /**
   * Create a plan (title + optional description). Returns the new
   * plan's id, or null when the title is empty (nothing created).
   * New plans start with no steps, so they start as drafts.
   */
  createPlan: (title: string, description?: string) => string | null;
  /** Delete a plan by id (a no-op when absent). Its steps go
   *  with it. */
  deletePlan: (planId: string) => void;
  /**
   * Add a step to a plan. Returns the new step's id, or null when
   * the title is empty or the plan is absent / at the step cap
   * (nothing added).
   */
  addStep: (planId: string, title: string) => string | null;
  /** Flip one step's done flag (a no-op when the plan or the step
   *  is absent). */
  toggleStep: (planId: string, stepId: string) => void;
  /** Delete one step from a plan (a no-op when absent). */
  deleteStep: (planId: string, stepId: string) => void;

  /**
   * Load another profile's plans: flush the current profile's
   * plans into the persisted record, then load the new one.
   * No-op while a guest session is veiled in (profile switches
   * never touch plans under the veil) and no-op when the
   * profile is already loaded. The first call (loaded=false)
   * loads without flushing anything.
   */
  switchProfile: (profileId: string) => void;

  /** Whether a guest session is veiled in: the visible list is
   *  the guest's own session plans; the owner's plans are
   *  stashed (see guestStash) and untouched on disk. */
  guestSessionActive: boolean;
  /** The owner's plans, stashed when a guest session starts and
   *  restored when it ends. Null outside a guest session.
   *  Never persisted — it only ever lives in memory. */
  guestStash: Plan[] | null;
  /** The profile the stashed plans belong to. Null outside a
   *  guest session. */
  guestStashProfileId: string | null;
  /**
   * Start a guest session (Gary, 2026-11-12 ~17:59 PST): no
   * history in any guest build. The owner's plans are stashed
   * in memory — never deleted, never written over — and the
   * visible list goes empty; while the flag is on, no plans
   * are ever persisted to disk. The guest's own plans live
   * only in the visible list and are dropped on exit — they
   * are NOT history.
   */
  enterGuestSession: () => void;
  /** End a guest session: drop the guest's session plans and
   *  restore the stashed owner plans exactly, flushing them
   *  back to disk. */
  exitGuestSession: () => void;
  /** Drop the current guest's session plans (a fresh guest
   *  replaces the old one — "always a new guest") without
   *  touching the stashed owner plans. No-op outside a guest
   *  session. */
  resetGuestSession: () => void;
  /** Test reset: forget the in-memory state (the next load
   *  re-reads localStorage). */
  resetPlanStoreForTests: () => void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  profileId: '',
  loaded: false,

  createPlan: (title, description = '') => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;
    const state = get();
    // Before any profile has been selected (tests, or an unusual
    // boot path), the implicit profile owns the list — the
    // production path always calls switchProfile first.
    const profileId = state.loaded && state.profileId ? state.profileId : FALLBACK_PROFILE_ID;
    if (!state.loaded) {
      set({ profileId, loaded: true });
    }
    if (state.plans.length >= PLANS_MAX_PER_PROFILE) return null;
    const plan: Plan = {
      id: newId('plan'),
      title: trimmedTitle.slice(0, 200),
      description: description.trim().slice(0, 2000),
      created: new Date().toISOString(),
      steps: [],
    };
    set({ plans: [plan, ...get().plans] });
    flushPlansPersistence();
    return plan.id;
  },

  deletePlan: (planId) => {
    const state = get();
    if (!state.plans.some((p) => p.id === planId)) return;
    set({ plans: state.plans.filter((p) => p.id !== planId) });
    flushPlansPersistence();
  },

  addStep: (planId, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;
    const state = get();
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan || plan.steps.length >= PLAN_MAX_STEPS) return null;
    const step: PlanStep = {
      id: newId('step'),
      title: trimmedTitle.slice(0, 500),
      done: false,
    };
    set({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, steps: [...p.steps, step] } : p,
      ),
    });
    flushPlansPersistence();
    return step.id;
  },

  toggleStep: (planId, stepId) => {
    const state = get();
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan || !plan.steps.some((s) => s.id === stepId)) return;
    set({
      plans: state.plans.map((p) =>
        p.id === planId
          ? {
              ...p,
              steps: p.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)),
            }
          : p,
      ),
    });
    flushPlansPersistence();
  },

  deleteStep: (planId, stepId) => {
    const state = get();
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan || !plan.steps.some((s) => s.id === stepId)) return;
    set({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, steps: p.steps.filter((s) => s.id !== stepId) } : p,
      ),
    });
    flushPlansPersistence();
  },

  switchProfile: (nextProfileId) => {
    const state = get();
    if (state.guestSessionActive) return;
    if (state.loaded && state.profileId === nextProfileId) return;
    // Flush the outgoing profile's plans first (the first load
    // has nothing to flush).
    if (state.loaded && state.profileId) {
      flushPlansPersistence();
    }
    const plans = readPersistedPlans()[nextProfileId] ?? [];
    set({ plans, profileId: nextProfileId, loaded: true });
  },

  guestSessionActive: false,
  guestStash: null,
  guestStashProfileId: null,

  enterGuestSession: () => {
    const state = get();
    if (state.guestSessionActive) return;
    // Flush the owner's plans BEFORE veiling: a write pending
    // from an action seconds ago must land on disk now — the
    // guest guard would drop it, and quitting during the guest
    // session would otherwise lose those plans.
    flushPlansPersistence();
    set({
      guestSessionActive: true,
      guestStash: state.plans,
      guestStashProfileId: state.loaded ? state.profileId : null,
      plans: [],
    });
  },

  exitGuestSession: () => {
    const state = get();
    if (!state.guestSessionActive) return;
    const stash = state.guestStash;
    const stashProfileId = state.guestStashProfileId;
    set({
      guestSessionActive: false,
      guestStash: null,
      guestStashProfileId: null,
      plans: stash ?? [],
      // The stash belongs to the profile that was active when
      // the guest veiled in; restoring it restores the profile
      // binding too. (A selectProfile after exit calls
      // switchProfile for the target profile when it differs.)
      profileId: stashProfileId ?? state.profileId,
      loaded: true,
    });
    // Write the restored owner plans back to disk now (the
    // guest guard paused persistence for the whole guest
    // session, and the key still holds the owner's pre-guest
    // copy — this just makes the restore durable immediately).
    flushPlansPersistence();
  },

  resetGuestSession: () => {
    const state = get();
    // Outside a guest session the visible list IS the owner's —
    // nothing to reset.
    if (!state.guestSessionActive) return;
    set({ plans: [] });
  },

  resetPlanStoreForTests: () => {
    set({
      plans: [],
      profileId: '',
      loaded: false,
      guestSessionActive: false,
      guestStash: null,
      guestStashProfileId: null,
    });
  },
}));
