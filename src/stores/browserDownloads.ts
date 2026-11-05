import { create } from 'zustand';
import type { BrowserDownload } from '../types';

/**
 * Download shelf state for the in-panel browser (Area 2).
 *
 * The main process owns the downloads (will-download handler) and
 * pushes each one's state as `browser:download-updated` events; this
 * store is the renderer's mirror of that list. It never holds
 * credentials or file contents — just file names, paths, sizes and
 * states. In node (vitest) there is no window.lucidAPI, so the IPC
 * calls are no-ops there and the state updates are still testable.
 *
 * A download stays in the list until Gary dismisses it (or clears
 * finished ones), so a completed file does not vanish the moment it
 * finishes — he can still click it to reveal it in Finder.
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

interface BrowserDownloadsState {
  /** Downloads, in arrival order. */
  downloads: BrowserDownload[];

  /** Merge one pushed update (upsert by id). */
  applyUpdate: (update: BrowserDownload) => void;
  /** Replace the whole list (initial load from main). */
  setDownloads: (downloads: BrowserDownload[]) => void;
  /** Load the current list from main (panel mount). */
  load: () => void;
  /** Remove one download from the shelf. */
  dismiss: (id: string) => void;
  /** Remove every finished download (completed / cancelled /
   * interrupted); in-progress ones stay. */
  clearCompleted: () => void;
  cancelDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  /** Reveal a completed download in Finder/Explorer. */
  showInFolder: (id: string) => void;
}

export const useBrowserDownloads = create<BrowserDownloadsState>()(
  (set, get) => ({
    downloads: [],

    applyUpdate: (update) => {
      set((state) => {
        const index = state.downloads.findIndex((d) => d.id === update.id);
        if (index === -1) {
          return { downloads: [...state.downloads, update] };
        }
        const next = [...state.downloads];
        next[index] = update;
        return { downloads: next };
      });
    },

    setDownloads: (downloads) => set({ downloads: [...downloads] }),

    load: () => {
      void browserApi()
        ?.listDownloads()
        ?.then((downloads) => get().setDownloads(downloads ?? []))
        .catch(() => undefined);
    },

    dismiss: (id) =>
      set((state) => ({
        downloads: state.downloads.filter((d) => d.id !== id),
      })),

    clearCompleted: () =>
      set((state) => ({
        downloads: state.downloads.filter(
          (d) => d.state === 'progressing',
        ),
      })),

    cancelDownload: (id) => {
      fire(browserApi()?.cancelDownload(id));
    },

    pauseDownload: (id) => {
      fire(browserApi()?.pauseDownload(id));
    },

    resumeDownload: (id) => {
      fire(browserApi()?.resumeDownload(id));
    },

    showInFolder: (id) => {
      fire(browserApi()?.showDownloadInFolder(id));
    },
  }),
);
