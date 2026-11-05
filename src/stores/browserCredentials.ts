import { create } from 'zustand';
import type { BrowserLoginOffer, BrowserSavedLogin } from '../types';

/**
 * Saved-logins state for the in-panel browser (Area 3).
 *
 * The main process owns the vault and pushes a `browser:login-detected`
 * offer when Gary signs in somewhere; this store is the renderer's
 * mirror of the offer and of the saved-login list (origin + username
 * only). It never holds a password: the save call carries origin +
 * username, and main looks the candidate up in its own memory.
 *
 * In node (vitest) there is no window.lucidAPI, so the IPC calls are
 * no-ops there and the state updates are still testable.
 */

function browserApi() {
  if (typeof window === 'undefined') return undefined;
  return window.lucidAPI?.browser;
}

/** Fire-and-forget IPC: a rejected invoke must never surface as an
 * unhandled rejection in the renderer. */
function fire(p: unknown): void {
  if (p && typeof (p as Promise<unknown>).catch === 'function') {
    (p as Promise<unknown>).catch(() => undefined);
  }
}

interface BrowserCredentialsState {
  /** The current save offer from main, or null when there is none.
   * The latest offer replaces any earlier one. */
  offer: BrowserLoginOffer | null;
  /** Saved logins (origin + username only), as listed by main. */
  savedLogins: BrowserSavedLogin[];

  /** Show a save offer from main. */
  setOffer: (offer: BrowserLoginOffer) => void;
  /** Clear the offer (after Gary answers it, either way). */
  clearOffer: () => void;
  /** Load the saved-login list from main. */
  load: () => void;
  /** Confirm the save for the offered login; reloads the list. */
  saveLogin: (origin: string, username: string) => void;
  /** Turn the offer down (main drops its in-memory candidate). */
  dismissOffer: (origin: string) => void;
  /** Delete a saved login. */
  deleteLogin: (origin: string) => void;
  /** Fill the active tab's page from the vault. */
  fillSavedLogin: () => void;
}

export const useBrowserCredentials = create<BrowserCredentialsState>()(
  (set, get) => ({
    offer: null,
    savedLogins: [],

    setOffer: (offer) => set({ offer }),

    clearOffer: () => set({ offer: null }),

    load: () => {
      void browserApi()
        ?.listSavedLogins()
        ?.then((savedLogins) =>
          set({ savedLogins: savedLogins ?? [] }),
        )
        .catch(() => undefined);
    },

    saveLogin: (origin, username) => {
      void browserApi()
        ?.saveLogin(origin, username)
        ?.then((saved) => {
          if (saved) get().load();
          get().clearOffer();
        })
        .catch(() => get().clearOffer());
    },

    dismissOffer: (origin) => {
      fire(browserApi()?.dismissLoginOffer(origin));
      get().clearOffer();
    },

    deleteLogin: (origin) => {
      void browserApi()
        ?.deleteSavedLogin(origin)
        ?.then((deleted) => {
          if (deleted) get().load();
        })
        .catch(() => undefined);
    },

    fillSavedLogin: () => {
      fire(browserApi()?.fillSavedLogin());
    },
  }),
);
