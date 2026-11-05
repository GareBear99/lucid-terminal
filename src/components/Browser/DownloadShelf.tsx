import { Download, FolderOpen, Pause, Play, X } from 'lucide-react';
import { useBrowserDownloads } from '../../stores/browserDownloads';
import { formatDownloadSize } from '../../lib/browserDownloads';
import { Tooltip } from '../Tooltip/Tooltip';
import type { BrowserDownload } from '../../types';

/**
 * Download shelf (Area 2): the list of in-progress and finished
 * downloads at the bottom of the browser panel.
 *
 * Each row shows the file name, received / total size, a progress
 * bar (indeterminate while the total is unknown), and the controls
 * that fit its state: pause / resume / cancel while it runs, reveal
 * in Finder once it finished, dismiss any time. Only rendered while
 * there is at least one download — an empty browser has no shelf.
 *
 * The progress helpers live in the main-process service module
 * (electron/services/browserDownloads.ts) and are imported here
 * because they are pure functions with no Electron dependency —
 * the shelf and the handler agree on what "1.5 MB" means.
 */

function progressOf(d: BrowserDownload): number | null {
  if (!d.totalBytes || d.totalBytes <= 0) return null;
  return Math.min(1, Math.max(0, d.receivedBytes / d.totalBytes));
}

function stateLabel(d: BrowserDownload): string {
  switch (d.state) {
    case 'progressing':
      return d.totalBytes > 0
        ? `${formatDownloadSize(d.receivedBytes)} / ${formatDownloadSize(d.totalBytes)}`
        : `${formatDownloadSize(d.receivedBytes)} downloaded`;
    case 'completed':
      return formatDownloadSize(d.totalBytes > 0 ? d.totalBytes : d.receivedBytes);
    case 'cancelled':
      return 'Cancelled';
    case 'interrupted':
      return 'Interrupted';
  }
}

export function DownloadShelf() {
  const downloads = useBrowserDownloads((s) => s.downloads);
  const dismiss = useBrowserDownloads((s) => s.dismiss);
  const clearCompleted = useBrowserDownloads((s) => s.clearCompleted);
  const cancelDownload = useBrowserDownloads((s) => s.cancelDownload);
  const pauseDownload = useBrowserDownloads((s) => s.pauseDownload);
  const resumeDownload = useBrowserDownloads((s) => s.resumeDownload);
  const showInFolder = useBrowserDownloads((s) => s.showInFolder);

  if (downloads.length === 0) return null;

  const finished = downloads.filter((d) => d.state !== 'progressing').length;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 max-h-40 overflow-y-auto">
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--text-muted)]">
        <Download size={13} className="shrink-0" />
        <span className="font-semibold text-[var(--text-primary)]">
          Downloads
        </span>
        <span>
          {downloads.length} item{downloads.length === 1 ? '' : 's'}
        </span>
        <span className="flex-1" />
        {finished > 0 ? (
          <button
            onClick={clearCompleted}
            className="px-1.5 py-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Clear finished
          </button>
        ) : null}
      </div>
      {downloads.map((d) => {
        const progress = progressOf(d);
        return (
          <div
            key={d.id}
            className="flex items-center gap-2 px-2.5 py-1.5 border-t border-[var(--border)] text-xs"
          >
            <span className="truncate flex-1 min-w-0" title={d.savePath}>
              {d.filename}
            </span>
            <span className="text-[var(--text-muted)] whitespace-nowrap">
              {stateLabel(d)}
            </span>
            {d.state === 'progressing' ? (
              <>
                <div className="w-24 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden shrink-0">
                  {progress !== null ? (
                    <div
                      className="h-full bg-[var(--accent)]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 bg-[var(--accent)] animate-pulse" />
                  )}
                </div>
                <Tooltip content="Pause download">
                  <button
                    onClick={() => pauseDownload(d.id)}
                    className="p-1 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                  >
                    <Pause size={13} />
                  </button>
                </Tooltip>
                <Tooltip content="Cancel download">
                  <button
                    onClick={() => cancelDownload(d.id)}
                    className="p-1 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                  >
                    <X size={13} />
                  </button>
                </Tooltip>
              </>
            ) : d.state === 'interrupted' ? (
              <>
                <Tooltip content="Resume download">
                  <button
                    onClick={() => resumeDownload(d.id)}
                    className="p-1 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                  >
                    <Play size={13} />
                  </button>
                </Tooltip>
                <Tooltip content="Dismiss">
                  <button
                    onClick={() => dismiss(d.id)}
                    className="p-1 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                  >
                    <X size={13} />
                  </button>
                </Tooltip>
              </>
            ) : (
              <>
                {d.state === 'completed' ? (
                  <Tooltip content="Show in folder">
                    <button
                      onClick={() => showInFolder(d.id)}
                      className="p-1 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                    >
                      <FolderOpen size={13} />
                    </button>
                  </Tooltip>
                ) : null}
                <Tooltip content="Dismiss">
                  <button
                    onClick={() => dismiss(d.id)}
                    className="p-1 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
                  >
                    <X size={13} />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default DownloadShelf;
