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
  getIdentifiersAtPosition,
  updateFileTree,
} from '../../lib/treeSitter';
import { registerEditorStructureCompletions } from '../../lib/editorInlineProvider';

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
  // The structure feeds the editor's completion provider (in-scope
  // identifiers at the cursor) and the composer's ghost. All
  // in-memory, dropped when the file closes; a dead engine just
  // means no structure, never an error.
  const structureDisposers = useRef<Array<() => void>>([]);

  // Build the tree when the active file changes (open / switch);
  // edits go through onChange below. A no-op when the engine is
  // not ready yet or the file is not TS/JS.
  useEffect(() => {
    const file = useFileStore.getState().openFiles.find((f) => f.path === activeFilePath);
    if (file) void updateFileTree(file.path, file.content || '');
  }, [activeFilePath]);

  // Drop trees for files that closed (guest: parse in memory,
  // persist nothing).
  useEffect(() => {
    dropFileTreesExcept(openFiles.map((f) => f.path));
  }, [openFiles]);

  // Dispose the structure providers on unmount.
  useEffect(() => {
    const disposers = structureDisposers.current;
    return () => {
      for (const dispose of disposers) dispose();
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
  // the tree-sitter structure provider (steal #2): in-scope
  // identifiers at the cursor for TS/JS. Disposed on unmount.
  const handleEditorDidMount = (_editor: any, monaco: any) => {
    monacoReady.current = true;
    const registerFor = (languageId: string) =>
      registerEditorStructureCompletions(monaco, languageId, {
        getIdentifiersAtPosition: (lineNumber, column) => {
          const activeFilePath = useFileStore.getState().activeFilePath;
          return activeFilePath
            ? getIdentifiersAtPosition(activeFilePath, lineNumber, column)
            : [];
        },
      });
    structureDisposers.current.push(registerFor('typescript'), registerFor('javascript'));
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
