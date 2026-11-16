/**
 * Completion acceptance log (Tabnine S7 — 2026-11-15):
 * every explicit acceptance logged as an attributable event
 * — the accepted snippet, when, in which session, from
 * which source.
 *
 * Sources: the ghost's own source ('history' | 'slash' |
 * 'file' | 'structure' | 'pattern' from the inline provider,
 * 'ghost' for the parent's overlay ghost) and 'agent' for an
 * accepted agent edit (Keep in the edit-review block).
 *
 * The log PERSISTS (localStorage, capped) so it survives a
 * restart — the attribution is only useful if it is still
 * there to read later. Persistence is best-effort and
 * guarded: corrupt stored values are dropped, never trusted.
 *
 * Guest: session-only. A guest's accepts are recorded in
 * memory for the session and NEVER loaded from or saved to
 * the owner's stored log — the owner's log is the owner's.
 * The load is lazy (on the first accept, when the profile
 * is loaded and the guest check is reliable), so a guest
 * session never sees the owner's entries.
 *
 * There is no viewer UI in this slice — the log is the
 * record; a viewer is follow-up work.
 */
import { create } from 'zustand';
import { isGuestProfile, useProfileStore } from './profileStore';

export type CompletionAcceptanceSource =
  | 'history'
  | 'slash'
  | 'file'
  | 'structure'
  | 'pattern'
  | 'ghost'
  | 'agent';

export interface CompletionAcceptance {
  /** The accepted text (the ghost's full text, or the agent
   *  edit's added lines, capped). */
  snippet: string;
  /** When the accept happened (Date.now()). */
  timestamp: number;
  /** The terminal tab the accept happened in (best effort —
   *  the copilot tab's review card has no terminal tab). */
  sessionId: string;
  /** Where the accepted text came from. */
  source: CompletionAcceptanceSource;
}

export const COMPLETION_ACCEPTANCE_LOG_LIMIT = 200;
export const COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY =
  'lucid:completion-acceptances';
/** Snippets are the user's own code — cap the stored text so
 *  one giant accept cannot bloat the log. */
export const COMPLETION_ACCEPTANCE_SNIPPET_LIMIT = 500;

/** The active profile is a guest (call-time check — the
 *  profile store is loaded by the time a user accepts
 *  anything, so this is reliable here). */
function isGuestNow(): boolean {
  const s = useProfileStore.getState();
  return isGuestProfile(s.profiles.find((p) => p.id === s.activeProfileId));
}

function loadStored(): CompletionAcceptance[] {
  try {
    const raw = localStorage.getItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is CompletionAcceptance =>
          !!e &&
          typeof (e as CompletionAcceptance).snippet === 'string' &&
          typeof (e as CompletionAcceptance).timestamp === 'number' &&
          typeof (e as CompletionAcceptance).sessionId === 'string' &&
          typeof (e as CompletionAcceptance).source === 'string',
      )
      .slice(-COMPLETION_ACCEPTANCE_LOG_LIMIT);
  } catch {
    return [];
  }
}

function saveStored(entries: CompletionAcceptance[]): void {
  try {
    localStorage.setItem(
      COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch {
    // Storage unavailable — the in-memory log still works.
  }
}

interface CompletionAcceptanceLogState {
  entries: CompletionAcceptance[];
  /** Whether the stored log has been loaded (lazy — see the
   *  module doc). */
  loaded: boolean;
  /** Record an acceptance. The timestamp defaults to now. */
  logAcceptance: (
    entry: Omit<CompletionAcceptance, 'timestamp'> & { timestamp?: number },
  ) => void;
  /** Clear the log (and the stored copy, when not a guest). */
  clearLog: () => void;
  /** Test seam: clear the log and the stored copy, reset the
   *  loaded flag. */
  resetForTests: () => void;
}

export const useCompletionAcceptanceLog = create<CompletionAcceptanceLogState>()(
  (set, get) => ({
    entries: [],
    loaded: false,

    logAcceptance: (entry) => {
      const guest = isGuestNow();
      let entries = get().entries;
      if (!get().loaded) {
        // Lazy load (owner only — a guest never sees the
        // owner's stored log).
        entries = guest ? [] : loadStored();
        set({ loaded: true });
      }
      const acceptance: CompletionAcceptance = {
        snippet: entry.snippet.slice(0, COMPLETION_ACCEPTANCE_SNIPPET_LIMIT),
        timestamp: entry.timestamp ?? Date.now(),
        sessionId: entry.sessionId,
        source: entry.source,
      };
      const next = [...entries, acceptance].slice(
        -COMPLETION_ACCEPTANCE_LOG_LIMIT,
      );
      set({ entries: next });
      if (!guest) saveStored(next);
    },

    clearLog: () => {
      set({ entries: [] });
      if (!isGuestNow()) {
        try {
          localStorage.removeItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY);
        } catch {
          // Storage unavailable — nothing to remove.
        }
      }
    },

    resetForTests: () => {
      set({ entries: [], loaded: false });
      try {
        localStorage.removeItem(COMPLETION_ACCEPTANCE_LOG_STORAGE_KEY);
      } catch {
        // Storage unavailable — nothing to remove.
      }
    },
  }),
);
