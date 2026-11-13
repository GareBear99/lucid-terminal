/**
 * MiniFiles — a detached editor window (Gary, 2026-11-09:
 * Files gets the same detach natively, with the regular theme).
 *
 * The file's content — including unsaved edits — transfers with
 * it; saving works the same way (fs:writeFile is
 * sender-agnostic). Closing the window (X) pops the file back
 * into the main window — main delivers it on 'closed', so the
 * file (and its dirty state) is never lost.
 *
 * Files remount is OUT of scope (Q3): a detached file only
 * comes back via pop-back-in or window close.
 */
import { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, X } from 'lucide-react';
import CodeEditor from './CodeEditor';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDetachPushListeners } from '../../lib/detachPushListeners';
import { MiniLoadingMist } from '../Splash/MiniLoadingMist';

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export default function MiniFiles() {
  const { openFiles, activeFilePath } = useFileStore();
  const [waiting, setWaiting] = useState(true);
  const hadFilesRef = useRef(false);

  useDetachPushListeners();

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? openFiles[0] ?? null;

  // Theme: same settings as the main window, following later
  // theme flips via the settings:changed push (§6.1).
  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
    const onChanged = window.lucidAPI?.settings?.onChanged?.((key) => {
      if (key === 'theme' || key === 'customTheme') {
        void useSettingsStore.getState().loadSettings();
      }
    });
    return () => {
      onChanged?.();
    };
  }, []);

  // The file this window was created for: main stores it as
  // pending detach state; fetch it on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const api = window.lucidAPI?.filesDetach;
      if (!api) {
        setWaiting(false);
        return;
      }
      try {
        const file = await api.getDetachState();
        if (cancelled) return;
        if (file) {
          useFileStore.getState().addDetachedFile(file);
        }
      } catch {
        // No state — the waiting screen stays.
      }
      setWaiting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close when the last file leaves (pop-in / close): an empty
  // detached window is useless. Gated on having had a file, so
  // the load race (no file yet) never closes the window.
  useEffect(() => {
    if (openFiles.length > 0) hadFilesRef.current = true;
    if (hadFilesRef.current && openFiles.length === 0) {
      window.lucidAPI.window.close();
    }
  }, [openFiles.length]);

  const popInActive = () => {
    if (!activeFile) return;
    const api = window.lucidAPI?.filesDetach;
    if (!api) return;
    void api.popIn({
      path: activeFile.path,
      name: activeFile.name,
      content: activeFile.content,
      originalContent: activeFile.originalContent,
      isDirty: activeFile.isDirty,
    });
  };

  return (
    <div
      data-testid="mini-files"
      className="relative h-screen w-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden"
    >
      {/* Loading mist (Gary, 2026-11-13): the window loads into
          the splash mist and fades out once the detach state has
          settled — never an instant cut to the editor. */}
      <MiniLoadingMist ready={!waiting} />
      {/* Chrome: drag region + pop-back-in + close (mirrors the
          browser mini's chrome). */}
      <div
        data-testid="mini-files-chrome"
        style={dragStyle}
        className="h-9 shrink-0 flex items-center justify-between border-b border-[var(--border)] bg-black/50 backdrop-blur-md px-2"
      >
        <span className="text-sm text-[var(--text-muted)] truncate">
          {activeFile ? activeFile.name : 'Files'}
        </span>
        <span className="flex items-center gap-1" style={noDragStyle}>
          <button
            type="button"
            title="Pop back into the main window"
            aria-label="Pop back into the main window"
            onClick={popInActive}
            disabled={!activeFile}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <CornerUpLeft size={16} />
          </button>
          <button
            type="button"
            title="Close window (file pops back in)"
            aria-label="Close window (file pops back in)"
            onClick={() => window.lucidAPI.window.close()}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
          >
            <X size={16} />
          </button>
        </span>
      </div>

      {waiting && openFiles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">Waiting for the file…</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <CodeEditor />
        </div>
      )}
    </div>
  );
}
