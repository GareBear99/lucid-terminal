/**
 * Reactive in-flight signal for terminal agent runs, per tab
 * (Zed Stop button, 2026-11-15 — mirrors copilotStore's
 * `runningCopilotId`, which is what the copilot tab's Stop
 * button reads).
 *
 * Why a store at all: the run's in-flight state in
 * agentSession.ts is a module-level `Map<string,
 * AbortController>` — set on run start, deleted on run end —
 * and a module-level map is not reactive, so no UI could
 * read it. The AbortController itself stays module-level
 * (like copilotStore's `runControllers`); this store carries
 * only the boolean signal, set by runAgentTurnForTab on
 * start and cleared in its finally on end/abort, so the
 * signal and the controller can never disagree about a run
 * being live.
 *
 * In-memory only, never persisted: a run never survives a
 * session, and in guest no run can be in flight at all (the
 * terminal guard refuses agent mode there), so the button
 * the signal drives never shows in guest.
 */
import { create } from 'zustand';

interface AgentRunState {
  /** Tabs with an agent run in flight right now. */
  inFlightByTab: Record<string, boolean>;
  /** Set (or clear) the signal for a tab. */
  setAgentRunInFlight: (tabId: string, inFlight: boolean) => void;
  /** Test-only reset: forget every in-flight tab. */
  resetAgentRunStoreForTests: () => void;
}

export const useAgentRunStore = create<AgentRunState>()((set) => ({
  inFlightByTab: {},
  setAgentRunInFlight: (tabId, inFlight) =>
    set((s) => {
      if (inFlight) {
        if (s.inFlightByTab[tabId]) return s;
        return { inFlightByTab: { ...s.inFlightByTab, [tabId]: true } };
      }
      if (!s.inFlightByTab[tabId]) return s;
      const next = { ...s.inFlightByTab };
      delete next[tabId];
      return { inFlightByTab: next };
    }),
  resetAgentRunStoreForTests: () => set({ inFlightByTab: {} }),
}));
