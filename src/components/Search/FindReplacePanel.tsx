/**
 * Find-and-replace panel (Atom steal #5 — 2026-11-14).
 *
 * Atom's `find-and-replace` bottom panel: a query, a
 * replacement, regex / case / whole-word toggles, a scope
 * (project or current file), results grouped by file, click
 * a match to jump to it, Replace All rewrites the matched
 * spans. Lucid's shape: the search runs in the main process
 * (ripgrep, or the Node fallback — the panel shows which
 * engine ran), the root is the project detected from the
 * active file (the same detection the fuzzy finder uses),
 * and Replace All goes through the main process's
 * root-contained replace.
 *
 * Opt-in: the panel is a card until `projectSearchEnabled`
 * is true in Settings — find-and-replace over the project
 * is a power tool, not a default. Enabling it here flips
 * the setting; the toggle also lives in Settings > Editor.
 *
 * After a replace, open files that changed are re-read from
 * disk so the editor never shows stale content.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Replace } from 'lucide-react';
import { useFindReplaceStore } from '../../stores/findReplaceStore';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToastStore } from '../../stores/toastStore';
import {
  detectProjectRoot,
  dirnameOf,
} from '../../lib/projectFileIndex';
import {
  groupMatchesByFile,
  type SearchMatch,
  type SearchResult,
} from '../../lib/projectSearch';
import { requestEditorJump } from '../../lib/editorJump';
import { openFileInWorkspace } from '../../lib/workspace';

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

export function FindReplacePanel() {
  const { open, initialQuery, closePanel } = useFindReplaceStore();
  const { settings, updateSetting } = useSettingsStore();
  const { currentDir, activeFilePath, updateFileContent } =
    useFileStore();
  const { success } = useToastStore();

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scope, setScope] = useState<'project' | 'file'>('project');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  const groups = useMemo(
    () => (results ? groupMatchesByFile(results.matches) : []),
    [results],
  );
  const matchCount = results?.matches.length ?? 0;

  if (!open) return null;

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Type something to search for.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const seed = activeFilePath ? dirnameOf(activeFilePath) : currentDir;
      const root = await detectProjectRoot(seed || currentDir);
      const api = window.lucidAPI?.search;
      if (!api || typeof api.search !== 'function') {
        setError('Search is unavailable in this window.');
        return;
      }
      const result = await api.search(root, {
        query: trimmed,
        regex,
        caseSensitive,
        wholeWord,
        scope,
        file: scope === 'file' ? activeFilePath ?? undefined : undefined,
      });
      setResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const jumpToMatch = async (match: SearchMatch) => {
    // The open funnel (Atom steal #14): a search hit outside
    // every known project adds its directory as a project.
    await openFileInWorkspace(match.file);
    requestEditorJump({
      path: match.file,
      lineNumber: match.line,
      column: match.column,
    });
  };

  const replaceAll = async () => {
    if (!results || matchCount === 0) return;
    setReplacing(true);
    try {
      const api = window.lucidAPI?.search;
      if (!api || typeof api.replace !== 'function') {
        setError('Replace is unavailable in this window.');
        return;
      }
      const { filesChanged, replacedCount } = await api.replace(
        results.root,
        replacement,
        results.matches,
      );
      // Re-read open files that changed, so the editor never
      // shows stale content after a replace.
      const openPaths = new Set(
        useFileStore.getState().openFiles.map((f) => f.path),
      );
      for (const group of groups) {
        if (!openPaths.has(group.file)) continue;
        try {
          const content = await window.lucidAPI.fs.readFile(group.file);
          const current = useFileStore
            .getState()
            .openFiles.find((f) => f.path === group.file)?.content;
          if (content !== current) {
            updateFileContent(group.file, content);
          }
        } catch {
          // A file that vanished mid-replace stays as it is.
        }
      }
      success(
        `Replaced ${replacedCount} match${replacedCount === 1 ? '' : 'es'} in ${filesChanged} file${filesChanged === 1 ? '' : 's'}`,
      );
      setResults(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed.');
    } finally {
      setReplacing(false);
    }
  };

  // Opt-in card (Atom steal #5): the feature is off until
  // `projectSearchEnabled` is true.
  if (!settings.projectSearchEnabled) {
    return (
      <div
        data-testid="find-replace-panel"
        className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-primary)]">
            Find in Project
          </span>
          <button
            onClick={closePanel}
            aria-label="Close find in project"
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Project find-and-replace searches the whole project
          with ripgrep and rewrites matched spans. It is
          opt-in — enable it to search.
        </p>
        <button
          onClick={() => void updateSetting('projectSearchEnabled', true)}
          className="mt-2 px-3 py-1.5 rounded bg-[var(--accent)] text-[var(--bg-primary)] text-xs"
        >
          Enable project search
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="find-replace-panel"
      className="border-t border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col max-h-72"
    >
      {/* Query row */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Search size={14} className="text-[var(--text-muted)] shrink-0" />
          <input
            data-testid="find-replace-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
              if (e.key === 'Escape') closePanel();
            }}
            placeholder="Find in project…"
            aria-label="Find in project"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            data-testid="find-replace-regex"
            onClick={() => setRegex((v) => !v)}
            aria-pressed={regex}
            title="Regular expression"
            className={`px-1.5 py-0.5 rounded text-xs ${regex ? 'bg-[var(--accent)] text-[var(--bg-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'}`}
          >
            .*
          </button>
          <button
            data-testid="find-replace-case"
            onClick={() => setCaseSensitive((v) => !v)}
            aria-pressed={caseSensitive}
            title="Case sensitive"
            className={`px-1.5 py-0.5 rounded text-xs ${caseSensitive ? 'bg-[var(--accent)] text-[var(--bg-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'}`}
          >
            Aa
          </button>
          <button
            data-testid="find-replace-word"
            onClick={() => setWholeWord((v) => !v)}
            aria-pressed={wholeWord}
            title="Whole word"
            className={`px-1.5 py-0.5 rounded text-xs ${wholeWord ? 'bg-[var(--accent)] text-[var(--bg-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'}`}
          >
            &ldquo;ab&rdquo;
          </button>
          <select
            data-testid="find-replace-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'project' | 'file')}
            aria-label="Search scope"
            className="bg-[var(--bg-tertiary)] text-xs rounded px-1 py-0.5 text-[var(--text-primary)] outline-none"
          >
            <option value="project">Project</option>
            <option value="file">Current file</option>
          </select>
          <button
            data-testid="find-replace-search"
            onClick={() => void runSearch()}
            disabled={searching}
            className="px-2 py-0.5 rounded bg-[var(--accent)] text-[var(--bg-primary)] text-xs disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
          <button
            onClick={closePanel}
            aria-label="Close find in project"
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <Replace size={14} className="text-[var(--text-muted)] shrink-0" />
        <input
          data-testid="find-replace-replacement"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replace with…"
          aria-label="Replace with"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          data-testid="find-replace-replace-all"
          onClick={() => void replaceAll()}
          disabled={replacing || matchCount === 0}
          className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs disabled:opacity-50"
        >
          {replacing
            ? 'Replacing…'
            : `Replace all${matchCount > 0 ? ` (${matchCount})` : ''}`}
        </button>
      </div>

      {/* Status + results */}
      <div className="px-3 py-1 text-xs text-[var(--text-muted)]">
        {error ? (
          <span className="text-[var(--error)]">{error}</span>
        ) : results ? (
          <>
            {matchCount} match{matchCount === 1 ? '' : 'es'} in {groups.length}{' '}
            file{groups.length === 1 ? '' : 's'} · {results.engine}
            {results.truncated ? ' · truncated at 1,000' : ''} ·{' '}
            {results.root}
          </>
        ) : (
          'Type a query and press Enter.'
        )}
      </div>
      {results && matchCount > 0 && (
        <div className="overflow-y-auto px-3 pb-2">
          {groups.map((group) => (
            <div key={group.file} className="mb-1">
              <div className="text-xs text-[var(--text-primary)] font-medium truncate">
                {basename(group.file)}
                <span className="text-[var(--text-muted)] font-normal">
                  {' '}
                  — {group.file} · {group.matches.length}
                </span>
              </div>
              {group.matches.map((match, i) => (
                <button
                  key={`${match.line}:${match.column}:${i}`}
                  onClick={() => void jumpToMatch(match)}
                  className="block w-full text-left px-2 py-0.5 rounded hover:bg-[var(--bg-tertiary)] text-xs"
                >
                  <span className="text-[var(--text-muted)]">
                    {match.line}:{match.column}
                  </span>{' '}
                  <span className="text-[var(--text-primary)] font-mono truncate">
                    {match.text}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
