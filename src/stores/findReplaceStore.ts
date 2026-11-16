/**
 * Find-and-replace panel state.
 *
 * The panel lives in the editor view (CodeEditor renders it
 * below the editor), but it opens from anywhere the command
 * runs — the palette command, ⌘⇧F in the editor, a future
 * status-bar button. This store is only the open flag and
 * the initial query; the search itself (query, options,
 * results) is the panel's local state, so closing the panel
 * drops a stale result set instead of keeping it.
 */

import { create } from 'zustand';

interface FindReplaceState {
  open: boolean;
  initialQuery: string;
  openPanel: (initialQuery?: string) => void;
  closePanel: () => void;
}

export const useFindReplaceStore = create<FindReplaceState>((set) => ({
  open: false,
  initialQuery: '',
  openPanel: (initialQuery = '') => set({ open: true, initialQuery }),
  closePanel: () => set({ open: false }),
}));
