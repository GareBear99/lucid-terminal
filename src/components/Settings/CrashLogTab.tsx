/**
 * Crash log tab — Settings > Crash log (Gary, 2026-11-16:
 * "should make an advanced crash log").
 *
 * Read-only: it shows where the crash log lives
 * (~/.lucid/crash-log/), lists the per-run files, and shows
 * the newest run's log — the file that explains the last
 * crash. Copy puts the text on the clipboard; Export
 * downloads the file. The file itself is the deliverable:
 * this tab is just the easiest way to read it in the app.
 *
 * When lucidAPI.crashLog is absent (an older build, a test
 * without the bridge), the tab says so instead of breaking.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CrashLogFileInfo, CrashLogReadResult } from '../../lib/crashLog';

type CrashLogApi = {
  list: () => Promise<CrashLogFileInfo[]>;
  readLatest: () => Promise<CrashLogReadResult>;
  readFile: (name: string) => Promise<CrashLogReadResult>;
  getPaths: () => Promise<{ dir: string; latestPath: string }>;
};

function crashLogApi(): CrashLogApi | null {
  try {
    const api = (window as unknown as { lucidAPI?: { crashLog?: CrashLogApi } })
      .lucidAPI?.crashLog;
    return api ?? null;
  } catch {
    return null;
  }
}

export function CrashLogTab() {
  const [dir, setDir] = useState<string | null>(null);
  const [files, setFiles] = useState<CrashLogFileInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<CrashLogReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (name: string | null) => {
    const api = crashLogApi();
    if (!api) {
      setError('Crash log unavailable in this build.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [paths, list] = await Promise.all([api.getPaths(), api.list()]);
      setDir(paths.dir);
      setFiles(list);
      const read = name === null ? await api.readLatest() : await api.readFile(name);
      setSelected(read.name);
      setContent(read);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the crash log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const copyText = useCallback(async () => {
    if (!content || content.text.length === 0) return;
    try {
      await navigator.clipboard.writeText(content.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — the Export button still works.
    }
  }, [content]);

  const exportFile = useCallback(() => {
    if (!content || content.text.length === 0) return;
    const blob = new Blob([content.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = content.name ?? 'lucid-crash.log';
    a.click();
    URL.revokeObjectURL(url);
  }, [content]);

  return (
    <div className="space-y-4">
      {/* Where the log lives — the file is the deliverable. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <h3 className="text-sm font-semibold">Where the crash log lives</h3>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Every crash Lucid sees — main-process exceptions,
          renderer crashes, uncaught renderer errors — is written
          here with the time, the version, the profile, the view
          and the stack trace. One file per run, newest first.
        </p>
        {dir !== null && (
          <p className="text-xs font-mono break-all text-[var(--text-secondary)]">
            {dir}
          </p>
        )}
        {loading && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">Reading the crash log…</p>
        )}
        {error !== null && (
          <p className="text-xs leading-[1.5] text-red-500">{error}</p>
        )}
      </div>

      {/* Per-run files. */}
      {files.length > 0 && (
        <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
          <h3 className="text-sm font-semibold">Runs</h3>
          <div className="space-y-1">
            {files.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => void load(f.name)}
                data-testid={`crash-log-file-${f.name}`}
                className="w-full text-left text-xs font-mono break-all rounded px-2 py-1 hover:bg-[var(--hover)]"
              >
                <span className={selected === f.name ? 'font-semibold text-[var(--text-secondary)]' : ''}>
                  {f.name}
                </span>
                <span className="text-[var(--text-muted)]">
                  {' — '}
                  {new Date(f.modifiedAt).toLocaleString()} ({Math.round(f.sizeBytes / 1024)} KB)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The log itself. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex-1">
            {content?.name ?? 'Latest run'}
          </h3>
          <button
            type="button"
            onClick={() => void copyText()}
            disabled={!content || content.text.length === 0}
            data-testid="crash-log-copy"
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => exportFile()}
            disabled={!content || content.text.length === 0}
            data-testid="crash-log-export"
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => void load(selected)}
            data-testid="crash-log-refresh"
            className="btn btn-secondary text-xs"
          >
            Refresh
          </button>
        </div>
        {content !== null && content.text.length === 0 && !loading && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            No crashes recorded yet — the log starts with a
            session entry on every launch, and a crash entry
            appears here the moment one happens.
          </p>
        )}
        {content !== null && content.text.length > 0 && (
          <pre
            data-testid="crash-log-content"
            className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-[11px] leading-[1.5] font-mono"
          >
            {content.text}
          </pre>
        )}
        {content !== null && content.truncated && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Showing the end of a large log — the crash is at the
            end. The full file is at the path above.
          </p>
        )}
      </div>
    </div>
  );
}
