/**
 * The cursor's scope descriptor.
 *
 * The CodeEditor publishes the descriptor at the active cursor
 * (same 150 ms debounced cadence as the docs-cursor publish)
 * so the keymap dispatcher can gate scoped bindings on it.
 * Session-only, in-memory: null when there is no tree for the
 * active file (a non-TS file, or the engine down) — scoped
 * bindings simply do not fire then.
 */

import { create } from 'zustand';
import type { ScopeDescriptor } from '../lib/scopeDescriptor';

interface ScopeState {
  currentScope: ScopeDescriptor | null;
  setCurrentScope: (scope: ScopeDescriptor | null) => void;
  resetForTests: () => void;
}

export const useScopeStore = create<ScopeState>()((set) => ({
  currentScope: null,
  setCurrentScope: (scope) => set({ currentScope: scope }),
  resetForTests: () => set({ currentScope: null }),
}));
