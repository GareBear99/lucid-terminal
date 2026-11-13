/**
 * Detach push listeners (Gary, 2026-11-09 — tab detach +
 * remount): every window (main + detached) subscribes to main's
 * tab/file pushes and applies them to its stores. Mounted once
 * per window by App, MiniTerminal, and MiniFiles.
 *
 * Lives in its own module — NOT in tabDrag.ts — because
 * fileStore reads localStorage at module level, and the
 * TerminalTabs tests run in a node environment where that
 * crashes the import. tabDrag.ts stays fileStore-free so the
 * tab strip can render anywhere.
 *
 * Adds are idempotent, so a push + a pending fetch delivering
 * the same tab/file twice lands once.
 */
import { useEffect } from 'react';
import { useTerminalStore } from '../stores/terminalStore';
import { useFileStore } from '../stores/fileStore';

export function useDetachPushListeners(): void {
  useEffect(() => {
    const api = window.lucidAPI;
    const cleanups: Array<() => void> = [];
    const detach = api?.terminal?.detach;
    if (detach) {
      cleanups.push(
        detach.onTabAdded((tab, index) => {
          useTerminalStore.getState().addDetachedTab({ ...tab, isActive: true }, index);
          detach.claimTab(tab.id);
        }),
        detach.onTabRemoved((id) => {
          useTerminalStore.getState().detachTab(id);
        }),
        detach.onTabDetached((id) => {
          useTerminalStore.getState().detachTab(id);
        }),
        detach.onReleaseNumber((id) => {
          useTerminalStore.getState().releaseTabNumber(id);
        }),
        detach.onReserveNumber((id) => {
          useTerminalStore.getState().reserveTabNumber(id);
        }),
      );
    }
    // Cross-window number registry (Gary, 2026-11-13): seed
    // this window's reserved numbers from main, so a fresh tab
    // here can never take a number whose PTY already lives in
    // another window. The listeners above are registered first,
    // so a broadcast sent while this fetch is in flight is
    // still caught (reserving twice is a no-op).
    if (detach?.getReservedNumbers) {
      void detach.getReservedNumbers().then((ids) => {
        for (const id of ids ?? []) useTerminalStore.getState().reserveTabNumber(id);
      }).catch(() => {
        // Main predates the registry (or the fetch failed):
        // this window just doesn't know other windows'
        // numbers, same as before the registry existed.
      });
    }
    const filesDetach = api?.filesDetach;
    if (filesDetach) {
      cleanups.push(
        filesDetach.onFileAdded((file) => {
          useFileStore.getState().addDetachedFile(file);
        }),
        filesDetach.onFileRemoved((path) => {
          useFileStore.getState().detachFile(path);
        }),
      );
    }
    return () => {
      for (const fn of cleanups) fn();
    };
  }, []);
}
