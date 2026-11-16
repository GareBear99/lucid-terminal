/**
 * Which Atom modal is open.
 *
 * Atom's palette, finder, symbols and go-to-line are all one
 * modal component with different item sources — and only one
 * is ever open. This store holds which one, so the palette
 * commands, the global shortcuts and the App host all agree
 * without prop drilling. Session-only, in-memory (guest-safe).
 */

import { create } from 'zustand';

export type AtomModalKind = 'palette' | 'finder' | 'symbols' | 'goto-line' | 'tutorials' | 'project-symbols';

interface ModalState {
  openModal: AtomModalKind | null;
  open: (kind: AtomModalKind) => void;
  close: () => void;
  toggle: (kind: AtomModalKind) => void;
}

export const useModalStore = create<ModalState>()((set, get) => ({
  openModal: null,
  open: (kind) => set({ openModal: kind }),
  close: () => set({ openModal: null }),
  toggle: (kind) =>
    set({ openModal: get().openModal === kind ? null : kind }),
}));
