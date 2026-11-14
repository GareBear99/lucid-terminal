import { useEffect, useRef, useState } from 'react';
import { X, Save } from 'lucide-react';
import { Tooltip } from '../Tooltip/Tooltip';
import Editor, { loader } from '@monaco-editor/react';
import '../../lib/monacoLoader';
import { MONACO_LOAD_TIMEOUT_MS } from '../../lib/monacoLoader';
import { useFileStore } from '../../stores/fileStore';
import { useFileTabDrag } from '../../lib/tabDrag';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToastStore } from '../../stores/toastStore';
import {
  dropFileTreesExcept,
  updateFileTree,
} from '../../lib/treeSitter';
import { registerEditorLspProviders } from '../../lib/editorLspProvider';
import { getEngineClient } from '../../lib/engineClient';
import { publishDocsCursor, republishDocsCursor } from '../../lib/docsCursor';
import { lspDiagnosticToMonacoMarker, monacoToLsp } from '../../lib/tsLspContract';

function CodeEditor() {
  const { openFiles, activeFilePath, setActiveFile, closeFileWithConfirm, detachFile, updateFileContent, saveFile } =
    useFileStore();
  const fileStripRef = useRef<HTMLDivElement | null>(null);
  // Files detach (Gary, 2026-11-09): the same drag-out as
  // terminal tabs, natively, with the regular theme. The
  // detach is invoked on drop and the file is only dropped
  // locally when main says ok — a refused detach keeps the
  // file exactly where it was.
  const fileDrag = useFileTabDrag({
    barRef: fileStripRef,
    onDetach: (file, dropPoint) => {
      void (async () => {
        const api = window.lucidAPI?.filesDetach;
        if (!api) return;
        const result = await api.detach(file, dropPoint.x, dropPoint.y);
        if (result.ok) detachFile(file.path);
      })();
    },
  });
  const { settings, currentTheme } = useSettingsStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  // Tree-sitter live structure (steal #2 — 2026-11-14): one live
  // tree per open file, re-parsed incrementally on every edit.
  // The structure feeds the composer's ghost and is the LSP
  // provider's fallback when the engine is dead. All in-memory,
  // dropped when the file closes; a dead engine just means no
  // structure, never an error.
  //
  // TypeScript language service (steal #3 — 2026-11-14): the
  // fact-checker. One in-memory document per open file; the
  // engine loads lazily (typescript-lsp + the lib bundle, ~12
  // MB on first use, never on startup), and every provider
  // falls back to tree-sitter until it is ready. Diagnostics
  // land as Monaco markers 150 ms after the last edit (the
  // clone publishes on a 50 ms debounce and triggers on a
  // 200 ms one; 150 ms is the middle of that range).
  const lspDisposers = useRef<Array<() => void>>([]);
  // The engine client (Kite mapping #2 — the client split):
  // the single surface for the TS language service, the
  // tree-sitter structure and the Tabnine patterns. The
  // editor talks to the engine through it, never directly.
  const engineClient = getEngineClient();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const diagnosticsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Docs panel cursor (Kite mapping #4 — the sidebar
  // pattern): publish the cursor position + the word at it
  // so the docs panel can show the symbol under it.
  // Debounced 150 ms (the diagnostics cadence); the bus
  // dedups (same file + line + word publishes nothing), so
  // moving within a word is silent. The fallback textarea
  // has no word-at-position API, so it does not publish —
  // the panel follows the Monaco cursor only.
  const docsCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishCurrentCursor = () => {
    const editor = editorRef.current;
    const path = useFileStore.getState().activeFilePath;
    if (!editor || !path) return;
    const position = editor.getPosition?.();
    if (!position) return;
    const model = editor.getModel?.();
    const word = model?.getWordAtPosition?.(position)?.word ?? null;
    publishDocsCursor({
      path,
      lineNumber: position.lineNumber,
      column: position.column,
      word,
    });
  };
  const scheduleDocsCursorPublish = () => {
    if (docsCursorTimerRef.current) clearTimeout(docsCursorTimerRef.current);
    docsCursorTimerRef.current = setTimeout(publishCurrentCursor, 150);
  };

  // Diagnostics for the active file, debounced 150 ms after
  // the last edit (or the last file switch). Reads the
  // current active file at fire time, so a switch mid-timer
  // never markers the wrong model.
  const scheduleDiagnostics = () => {
    if (diagnosticsTimerRef.current) clearTimeout(diagnosticsTimerRef.current);
    diagnosticsTimerRef.current = setTimeout(() => {
      const path = useFileStore.getState().activeFilePath;
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!path || !editor || !monaco) return;
      const model = editor.getModel?.();
      if (!model) return;
      const diagnostics = engineClient.getDiagnostics(path);
      monaco.editor.setModelMarkers(
        model,
        'ts-lsp',
        diagnostics.map(lspDiagnosticToMonacoMarker),
      );
    }, 150);
  };

  // Build the tree and open the LSP document when the active
  // file changes (open / switch); edits go through onChange
  // below. A no-op when the engine is not ready yet or the
  // file is not TS/JS.
  useEffect(() => {
    const file = useFileStore.getState().openFiles.find((f) => f.path === activeFilePath);
    if (file) {
      void updateFileTree(file.path, file.content || '');
      engineClient.openDocument(file.path, file.content || '');
      scheduleDiagnostics();
    }
  }, [activeFilePath]);

  // Drop trees and LSP documents for files that closed
  // (guest: parse in memory, persist nothing).
  useEffect(() => {
    dropFileTreesExcept(openFiles.map((f) => f.path));
    engineClient.dropDocumentsExcept(openFiles.map((f) => f.path));
  }, [openFiles]);

  // Dispose the LSP providers on unmount.
  useEffect(() => {
    const disposers = lspDisposers.current;
    return () => {
      for (const dispose of disposers) dispose();
      if (diagnosticsTimerRef.current) clearTimeout(diagnosticsTimerRef.current);
      if (docsCursorTimerRef.current) clearTimeout(docsCursorTimerRef.current);
    };
  }, []);

  // Monaco fallback: if the editor never loads, the view used to sit on
  // "Loading..." forever with no way to type. Fall back to a plain
  // textarea so the file stays editable — same deal as the prompt input.
  const [monacoFailed, setMonacoFailed] = useState(false);
  const monacoReady = useRef(false);
  const fallbackToastShown = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fallBack = () => {
      if (cancelled || monacoReady.current) return;
      setMonacoFailed(true);
      if (!fallbackToastShown.current) {
        fallbackToastShown.current = true;
        useToastStore.getState().warning(
          'Monaco editor failed to load — using plain text editing. Saving still works.'
        );
      }
    };
    // Fast path: the loader promise rejects when the bundle fails to load.
    // Slow path: the load can hang instead of failing outright.
    loader
      .init()
      .then(() => {
        monacoReady.current = true;
      })
      .catch(fallBack);
    const timer = setTimeout(fallBack, MONACO_LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Monaco mounted — the fallback is no longer needed. Register
  // the LSP providers (steal #3): typed completions with docs
  // and auto-imports, hover, and signature help for TS/JS, with
  // the tree-sitter structure as the fallback when the engine
  // is dead. Disposed on unmount. The engine warms in the
  // background — nothing here blocks on it.
  const handleEditorDidMount = (_editor: any, monaco: any) => {
    monacoReady.current = true;
    editorRef.current = _editor;
    monacoRef.current = monaco;
    void engineClient.ensureReady().then(() => {
      scheduleDiagnostics();
      // The engine just became ready — re-publish the cursor
      // so the docs panel re-asks even though the cursor did
      // not move.
      republishDocsCursor();
    });
    const activePath = () => useFileStore.getState().activeFilePath;
    const registerFor = (languageId: string) =>
      registerEditorLspProviders(monaco, languageId, {
        getCompletions: (lineNumber, column) => {
          const path = activePath();
          if (!path) return null;
          return (
            engineClient.getCompletions(path, monacoToLsp({ lineNumber, column }))?.items ?? null
          );
        },
        resolveCompletion: (item) => {
          const path = activePath();
          return path ? engineClient.resolveCompletion(path, item) : null;
        },
        getStructureIdentifiers: (lineNumber, column) => {
          const path = activePath();
          return path ? engineClient.getStructureIdentifiers(path, lineNumber, column) : [];
        },
        // Steal #7 — Tabnine patterns: the repeated lines
        // and identifier chains from the user's own open
        // files, offered for the line prefix typed so far,
        // through the engine client (the shared lazy index
        // syncs from the file store — in-memory only, never
        // persisted, guest-safe). The provider sorts the
        // patterns last and dedupes them against the LSP
        // items, so a verified symbol always wins over a
        // repeated idiom.
        getPatternCompletions: (linePrefix) => {
          return engineClient.getPatternCompletions(
            useFileStore.getState().openFiles.map((f) => ({
              path: f.path,
              content: f.content,
            })),
            linePrefix,
            5,
          );
        },
        getHover: (lineNumber, column) => {
          const path = activePath();
          return path ? engineClient.getHover(path, monacoToLsp({ lineNumber, column })) : null;
        },
        getSignatureHelp: (lineNumber, column, _triggerCharacter) => {
          const path = activePath();
          return path
            ? engineClient.getSignatureHelp(path, monacoToLsp({ lineNumber, column }))
            : null;
        },
      });
    lspDisposers.current.push(registerFor('typescript'), registerFor('javascript'));
    // The docs-panel cursor: every move republishes
    // (debounced), and the mount publishes once for the file
    // the editor just opened. The listener's dispose rides
    // with the provider disposers — same unmount.
    const cursorDisposable = _editor.onDidChangeCursorPosition?.(scheduleDocsCursorPublish);
    if (cursorDisposable) {
      lspDisposers.current.push(() => {
        try {
          cursorDisposable.dispose();
        } catch {
          // Already disposed — not an error.
        }
      });
    }
    publishCurrentCursor();
    scheduleDiagnostics();
  };

  // Determine language from file extension
  const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      php: 'php',
      html: 'html',
      htm: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'scss',
      less: 'less',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
      ps1: 'powershell',
      bat: 'bat',
      cmd: 'bat',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  // Monaco editor theme based on current theme. The bg can be hex (the
  // dark themes, LuciferAI) or translucent rgba (Full Glass), so judge
  // by relative luminance, not by a hex prefix — the old
  // startsWith('#0'|'#1'|'#2') read Full Glass's rgba bg as light and
  // picked the light Monaco theme over the dark mist.
  const getEditorTheme = () => {
    const bg = currentTheme.colors.bgPrimary;
    const rgba = bg.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    const hex = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    // Capture groups only (slice off the full match, index 0).
    const parts = rgba?.slice(1) ?? hex?.slice(1).map((h) => parseInt(h, 16));
    if (!parts) return 'vs-dark';
    const [r, g, b] = parts.map(Number);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum < 128 ? 'vs-dark' : 'light';
  };

  const handleSave = async () => {
    if (activeFilePath) {
      await saveFile(activeFilePath);
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  // Empty state - solid stored theme, not black (Gary, 2026-11-09):
  // the centre used to be transparent over the app root's bg-black,
  // so the Files page read as a black hole between themed panels.
  // bg-primary is the theme token - never a hardcoded colour here.
  if (openFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-muted)]">
        <p>No files open. Select a file from the explorer.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" onKeyDown={handleKeyDown}>
      {/* File Tabs */}
      <div
        ref={fileStripRef}
        data-testid="file-tabs-bar"
        className="h-9 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border)]"
        {...fileDrag.barHandlers}
      >
        <div className="flex-1 flex items-center overflow-x-auto">
          {openFiles.map((file) => (
            <div
              key={file.path}
              className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] cursor-pointer transition-colors ${file.path === activeFilePath
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] tab-active'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              onClick={() => setActiveFile(file.path)}
              onPointerDown={(e) => fileDrag.onFileTabPointerDown(file, e)}
            >
              <span className="text-sm whitespace-nowrap">
                {file.isDirty && <span className="text-[var(--accent)]">● </span>}
                {file.name}
              </span>
              <Tooltip content={`Close ${file.name}`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFileWithConfirm(file.path);
                  }}
                  className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>

        {/* Save Button */}
        {activeFile?.isDirty && (
          <Tooltip content="Save" shortcut="Ctrl+S">
            <button
              onClick={handleSave}
              className="h-9 px-3 flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <Save size={14} />
              <span className="text-xs">Save</span>
            </button>
          </Tooltip>
        )}
      </div>

      {/* Editor */}
      {activeFile && (
        <div className="flex-1 overflow-hidden">
          {monacoFailed ? (
            <Tooltip content="Monaco unavailable — plain text editing">
              <textarea
                aria-label="Plain text editor (Monaco unavailable)"
                value={activeFile.content || ''}
                onChange={(e) => {
                  updateFileContent(activeFile.path, e.target.value);
                  void updateFileTree(activeFile.path, e.target.value);
                  engineClient.changeDocument(activeFile.path, e.target.value);
                  scheduleDiagnostics();
                }}
                spellCheck={false}
                placeholder="Plain text editing — Monaco unavailable"
                className="w-full h-full bg-transparent text-[var(--text-primary)] font-mono text-sm p-3 outline-none resize-none overflow-auto whitespace-pre"
                style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize }}
              />
            </Tooltip>
          ) : (
            <Editor
              height="100%"
              language={getLanguage(activeFile.name)}
              value={activeFile.content || ''}
              loading="" // Disable default loading text to see if it's Monaco
              theme={getEditorTheme()}
              onMount={handleEditorDidMount}
              onChange={(value) => {
                updateFileContent(activeFile.path, value || '');
                void updateFileTree(activeFile.path, value || '');
                engineClient.changeDocument(activeFile.path, value || '');
                scheduleDiagnostics();
              }}
              options={{
                fontFamily: settings.fontFamily,
                fontSize: settings.fontSize,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
                guides: {
                  indentation: true,
                  bracketPairs: true,
                },
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default CodeEditor;
