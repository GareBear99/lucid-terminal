import * as fs from 'fs';
import { shell } from 'electron';
import type { DownloadItem, Session } from 'electron';
import {
  sanitizeDownloadFilename,
  uniqueDownloadPath,
} from '../../src/lib/browserDownloads';
import type { BrowserDownload } from '../../src/types';

export type { BrowserDownload, BrowserDownloadState } from '../../src/types';

export {
  sanitizeDownloadFilename,
  uniqueDownloadPath,
  downloadProgress,
  formatDownloadSize,
} from '../../src/lib/browserDownloads';

/**
 * Downloads for the in-panel browser (Area 2).
 *
 * A `will-download` handler on the `persist:lucid-browser` session
 * saves every download straight into a Lucid downloads folder —
 * no OS save dialog, no record of what was downloaded anywhere else.
 * Progress is pushed to the renderer as `browser:download-updated`
 * events; the shelf (BrowserPanel) renders them and offers pause /
 * resume / cancel / show-in-folder.
 *
 * Default folder is the OS Downloads folder
 * (`app.getPath('downloads')`); Gary can override it with the
 * `browserDownloadsFolder` setting (generic settings store — no
 * Settings UI for it yet, that is the Settings deep-dive's job).
 * A custom folder is created on first use; if creating it fails
 * the download falls back to the OS Downloads folder rather than
 * failing the download.
 *
 * Security notes: the filename comes from the site, so it is
 * sanitised (basename only, no separators or control characters)
 * before it ever touches the disk — a page cannot smuggle a
 * `../../` path through a download. `showItemInFolder` is only
 * ever called for a completed download the user clicks in the
 * shelf; nothing opens Finder on its own.
 *
 * The pure functions (`sanitizeDownloadFilename`,
 * `uniqueDownloadPath`, `downloadProgress`, `formatDownloadSize`)
 * live in `src/lib/browserDownloads.ts` (no Electron dependency,
 * so the renderer shelf can use them too) and are re-exported
 * here; `setupBrowserDownloads` is the thin Electron wiring
 * around them.
 */

export interface BrowserDownloadsOptions {
  /** Folder downloads go to (called per download, so a settings
   * change takes effect on the next download). */
  downloadsFolder: () => string;
  /** Folder to fall back to when the chosen one cannot be created. */
  fallbackFolder: () => string;
  /** Push one download's current state to the renderer. */
  send: (update: BrowserDownload) => void;
  /** Injected for tests; defaults to the real disk. */
  exists?: (p: string) => boolean;
  /** Injected for tests; defaults to the real disk. */
  mkdir?: (dir: string) => void;
}

export interface BrowserDownloads {
  listDownloads: () => BrowserDownload[];
  cancelDownload: (id: string) => boolean;
  pauseDownload: (id: string) => boolean;
  resumeDownload: (id: string) => boolean;
  /** Reveal a completed download in Finder/Explorer. False when
   * there is no such completed download (or its file is gone). */
  showDownloadInFolder: (id: string) => boolean;
}

/**
 * Register the `will-download` handler on the browser session and
 * return the controls the IPC layer exposes. One handler covers
 * every tab — the session is shared by all views.
 */
export function setupBrowserDownloads(
  browserSession: Session,
  options: BrowserDownloadsOptions,
): BrowserDownloads {
  const exists = options.exists ?? ((p: string) => fs.existsSync(p));
  const mkdir =
    options.mkdir ?? ((dir: string) => fs.mkdirSync(dir, { recursive: true }));
  const downloads = new Map<string, DownloadItem>();
  const states = new Map<string, BrowserDownload>();
  let counter = 0;

  const push = (id: string) => {
    const state = states.get(id);
    if (state) options.send({ ...state });
  };

  const resolveFolder = (): string => {
    const chosen = options.downloadsFolder();
    try {
      mkdir(chosen);
      return chosen;
    } catch {
      return options.fallbackFolder();
    }
  };

  browserSession.on('will-download', (_event, item) => {
    counter += 1;
    const id = `browser-download-${counter}`;
    const folder = resolveFolder();
    const filename = sanitizeDownloadFilename(item.getFilename());
    const savePath = uniqueDownloadPath(folder, filename, exists);
    item.setSavePath(savePath);
    const url = item.getURL();
    downloads.set(id, item);
    states.set(id, {
      id,
      url,
      filename,
      savePath,
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
    });
    push(id);

    item.on('updated', (_e, state) => {
      const current = states.get(id);
      if (!current) return;
      // 'interrupted' arrives here when the network drops; the
      // 'done' event below carries the final state either way.
      if (state === 'interrupted') {
        current.state = 'interrupted';
      }
      current.receivedBytes = item.getReceivedBytes();
      current.totalBytes = item.getTotalBytes();
      push(id);
    });

    item.on('done', (_e, state) => {
      const current = states.get(id);
      if (!current) return;
      current.receivedBytes = item.getReceivedBytes();
      current.totalBytes = item.getTotalBytes();
      current.state =
        state === 'completed'
          ? 'completed'
          : state === 'cancelled'
            ? 'cancelled'
            : 'interrupted';
      push(id);
    });
  });

  return {
    listDownloads: () => [...states.values()].map((s) => ({ ...s })),
    cancelDownload: (id) => {
      const item = downloads.get(id);
      if (!item) return false;
      item.cancel();
      return true;
    },
    pauseDownload: (id) => {
      const item = downloads.get(id);
      if (!item) return false;
      item.pause();
      return true;
    },
    resumeDownload: (id) => {
      const item = downloads.get(id);
      if (!item) return false;
      item.resume();
      return true;
    },
    showDownloadInFolder: (id) => {
      const state = states.get(id);
      if (!state || state.state !== 'completed') return false;
      if (!exists(state.savePath)) return false;
      shell.showItemInFolder(state.savePath);
      return true;
    },
  };
}
