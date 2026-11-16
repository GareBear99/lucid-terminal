import { useEffect, useRef, useState } from 'react';
import { X, Save } from 'lucide-react';
import { Tooltip } from '../Tooltip/Tooltip';
import { ViewHeader } from '../Layout/ViewHeader';
import Editor, { loader } from '@monaco-editor/react';
import '../../lib/monacoLoader';
import { MONACO_LOAD_TIMEOUT_MS } from '../../lib/monacoLoader';
import {
  formatBytes,
  LARGE_FILE_PREVIEW_BYTES,
  useFileStore,
} from '../../stores/fileStore';
import { useFileTabDrag } from '../../lib/tabDrag';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToastStore } from '../../stores/toastStore';
import {
  dropFileTreesExcept,
  updateFileTree,
} from '../../lib/treeSitter';
import { registerEditorLspProviders } from '../../lib/editorLspProvider';
import { getEngineClient } from '../../lib/engineClient';
import { publishDocsCursor, republishDocsCursor, scheduleDocsCursorRefresh } from '../../lib/docsCursor';
import { requestDocsPanel } from '../../lib/docsPanelRequest';
import {
  consumePendingEditorJump,
  getPendingEditorJump,
  requestEditorJump,
  subscribeEditorJump,
  type EditorJump,
} from '../../lib/editorJump';
import {
  MarkerLayer,
} from '../../lib/markerDecorations';
import { gutterRangesForDiff } from '../../lib/gitLineDiff';
import { FindReplacePanel } from '../Search/FindReplacePanel';
import { lspDiagnosticToMonacoMarker, monacoToLsp } from '../../lib/tsLspContract';
import { EditorStatusBar } from './EditorStatusBar';
import { FileTypeIcon } from './FileTypeIcon';
import { editorOptionsForSettings } from '../../lib/whitespace';
import { useEditorStatusStore } from '../../stores/editorStatusStore';
import { useScopeStore } from '../../stores/scopeStore';
import { getScopeDescriptorAtPosition } from '../../lib/treeSitter';
import { setActiveMonacoEditor } from '../../lib/editorHandle';
import { detectEol } from '../../lib/editorStatus';

/** Atom's git-diff skips buffers at or above 2 MB
 *  (`git-diff-view.js:6` MAX_BUFFER_LENGTH_TO_DIFF). */
export const MAX_GUTTER_BUFFER_BYTES = 2 * 1024 * 1024;

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
  // The git gutter's marker layer (Atom steal #4/#6): one
  // layer over the editor, re-marked from `git diff HEAD`
  // on edit stop. Created on mount, disposed on unmount.
  const gutterLayerRef = useRef<MarkerLayer | null>(null);
  const gutterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Docs panel cursor (Kite mapping #4 — the sidebar
  // pattern): publish the cursor position + the word at it
  // so the docs panel can show the symbol under it.
  // Debounced 150 ms (the diagnostics cadence); the bus
  // dedups (same file + line + word publishes nothing), so
  // moving within a word is silent. The fallback textarea
  // has no word-at-position API, so it does not publish —
  // the panel follows the Monaco cursor only.
  const docsCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Editor status bar (Atom steal #11): the same debounced
  // publish carries the bar's cheap state — cursor position and
  // selection size (offset math, no text read). The model state
  // (language, endings, line count) publishes on its own timer
  // below: it reads the model text, so it runs on content
  // change and file switch, not on every cursor move.
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const selection = editor.getSelection?.();
    let selectionCount = 0;
    if (selection && model?.getOffsetAt) {
      try {
        selectionCount = Math.max(
          0,
          model.getOffsetAt(selection.getEndPosition()) -
            model.getOffsetAt(selection.getStartPosition()),
        );
      } catch {
        selectionCount = 0;
      }
    }
    useEditorStatusStore.getState().publish({
      filePath: path,
      lineNumber: position.lineNumber,
      column: position.column,
      selectionCount,
    });
    // Scope system (Atom steal #18): the cursor's scope
    // descriptor rides the same debounced publish, so the
    // keymap dispatcher can gate scoped bindings on it. Null
    // when there is no tree for the file — scoped bindings
    // simply do not fire then.
    useScopeStore
      .getState()
      .setCurrentScope(
        getScopeDescriptorAtPosition(path, position.lineNumber, position.column),
      );
  };
  const publishModelStatus = () => {
    const editor = editorRef.current;
    const path = useFileStore.getState().activeFilePath;
    if (!editor || !path) return;
    const model = editor.getModel?.();
    if (!model) return;
    useEditorStatusStore.getState().publish({
      filePath: path,
      languageId: model.getLanguageId?.() ?? null,
      eol: detectEol(model.getValue?.() ?? ''),
      lineCount: model.getLineCount?.() ?? 0,
    });
  };
  const scheduleModelStatus = () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(publishModelStatus, 150);
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

  // The git gutter (Atom steal #6 — 419 LOC, highest
  // feel-per-line): the coloured marks next to the line
  // numbers, recomputed from HEAD on every edit stop, like
  // the diagnostics cadence above. A null diff (not a repo,
  // git missing) clears the gutter silently — never a faked
  // mark. Buffers at or above 2 MB are skipped, Atom's rule.
  // The refresh is async and reads the active file at fire
  // time, so a switch mid-timer never gutters the wrong
  // model.
  const refreshGutter = async () => {
    const path = useFileStore.getState().activeFilePath;
    const layer = gutterLayerRef.current;
    if (!path || !layer) return;
    const file = useFileStore.getState().openFiles.find((f) => f.path === path);
    const content = file?.content ?? '';
    if (content.length >= MAX_GUTTER_BUFFER_BYTES) {
      layer.clear();
      return;
    }
    // A truncated preview must never be diffed against git
    // HEAD: the whole tail would read as deleted lines.
    if (file?.isTruncated) {
      layer.clear();
      return;
    }
    const api = window.lucidAPI?.git;
    if (!api || typeof api.getDiff !== 'function') return;
    const dir = path.split('/').slice(0, -1).join('/') || '/';
    let diff: string | null = null;
    try {
      diff = await api.getDiff(dir, path);
    } catch {
      return;
    }
    // Not a repo (or git failed): no gutter, silently.
    if (diff === null || diff === undefined) {
      layer.clear();
      return;
    }
    // The file may have switched while the diff was in
    // flight — re-read the active path before applying.
    if (useFileStore.getState().activeFilePath !== path) return;
    const ranges = gutterRangesForDiff(diff);
    layer.clear();
    for (const r of ranges) {
      const marker = layer.markRange(
        {
          startLineNumber: r.startLine,
          startColumn: 1,
          endLineNumber: r.endLine,
          endColumn: 1,
        },
        // Atom's git-diff marks with invalidate: 'never'
        // (git-diff-view.js markRange) — the gutter is
        // re-marked from the diff on every refresh anyway.
        { invalidate: 'never' },
      );
      layer.decorateMarker(marker, { type: 'gutter', className: r.className });
    }
  };
  const scheduleGutter = () => {
    if (gutterTimerRef.current) clearTimeout(gutterTimerRef.current);
    gutterTimerRef.current = setTimeout(() => {
      void refreshGutter();
    }, 150);
  };

  // Put the editor on a file + line + column and centre it
  // (Atom steal #8: setCursorBufferPosition +
  // scrollToBufferPosition centre).
  const applyJumpToEditor = (editor: any, jump: EditorJump) => {
    try {
      editor.setPosition?.({ lineNumber: jump.lineNumber, column: jump.column });
      editor.revealLineInCenter?.(jump.lineNumber);
      editor.focus?.();
    } catch {
      // The editor is gone — the jump is dropped, never an error.
    }
  };

  // A jump request from the modal bus. The request is sticky:
  // when the file is not active yet, open it — the
  // active-file effect below consumes the pending jump once
  // the new model is in place. When the editor is not mounted
  // at all, the pending jump waits for the mount handler.
  const handleJumpRequest = async (jump: EditorJump) => {
    const editor = editorRef.current;
    if (!editor) return;
    const active = useFileStore.getState().activeFilePath;
    if (jump.path !== active) {
      await useFileStore.getState().openFile(jump.path);
      return;
    }
    const pending = consumePendingEditorJump();
    if (pending) applyJumpToEditor(editor, pending);
  };

  // Build the tree and open the LSP document when the active
  // file changes (open / switch); edits go through onChange
  // below. A no-op when the engine is not ready yet or the
  // file is not TS/JS.
  useEffect(() => {
    // The status bar follows the active file even when Monaco
    // never mounts (the fallback textarea): publish the path
    // here so the bar never shows a closed file's state.
    useEditorStatusStore.getState().publish({
      filePath: activeFilePath,
      lineNumber: 1,
      column: 1,
      selectionCount: 0,
    });
    const file = useFileStore.getState().openFiles.find((f) => f.path === activeFilePath);
    if (file && !file.isTruncated) {
      void updateFileTree(file.path, file.content || '');
      engineClient.openDocument(file.path, file.content || '');
      scheduleDiagnostics();
      scheduleGutter();
      scheduleModelStatus();
    }
    // A truncated preview is a read-only 1 MB head: no
    // tree-sitter parse, no LSP document, no diagnostics,
    // no gutter, no model status — none of it may
    // run over the preview as if it were the whole file.
    // A jump requested while this file was not active yet —
    // consume it now that the model is in place.
    const pendingJump = getPendingEditorJump();
    if (
      pendingJump &&
      pendingJump.path === activeFilePath &&
      editorRef.current
    ) {
      consumePendingEditorJump();
      applyJumpToEditor(editorRef.current, pendingJump);
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
      if (gutterTimerRef.current) clearTimeout(gutterTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      setActiveMonacoEditor(null);
      gutterLayerRef.current?.dispose();
      gutterLayerRef.current = null;
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
    // The status bar's grammar and line-ending tiles reach the
    // editor through this handle (see editorHandle.ts).
    setActiveMonacoEditor({ editor: _editor, monaco });
    scheduleModelStatus();
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
        // Steal #10 — snippets: user snippets from Settings
        // (customSnippets), merged over the built-in library
        // by the snippet provider; read at request time, so a
        // saved snippet is live without a reload.
        getUserSnippets: () =>
          useSettingsStore.getState().settings.customSnippets ?? [],
        // Kite's settings toggles (Atom steal #15): read live
        // at request time, so flipping a switch in Settings >
        // General > Editor takes effect without a reload or a
        // re-registration. Absent in tests = on.
        isCompletionsEnabled: () =>
          useSettingsStore.getState().settings.editorCompletionsEnabled !== false,
        isHoverEnabled: () =>
          useSettingsStore.getState().settings.editorHoverEnabled !== false,
        isSignatureHelpEnabled: () =>
          useSettingsStore.getState().settings.editorSignatureHelpEnabled !== false,
        getHover: (lineNumber, column) => {
          const path = activePath();
          return path ? engineClient.getHover(path, monacoToLsp({ lineNumber, column })) : null;
        },
        // The hover Docs link (Atom steal #7): `Docs` opens
        // Lucid's docs panel at the hovered symbol, `Def`
        // jumps to its definition when the engine knows one.
        // The links are markdown in the lucid-docs:// /
        // lucid-def:// schemes — the link opener registered
        // on mount handles them. The report call is the same
        // one the docs panel makes on every cursor move.
        hoverLinks: (word, position) => {
          const path = activePath();
          if (!path) return null;
          const docs = `lucid-docs://${encodeURIComponent(
            JSON.stringify({
              path,
              lineNumber: position.lineNumber,
              column: position.column,
              word,
            }),
          )}`;
          let def: string | undefined;
          try {
            const report = engineClient.getSymbolReport(
              path,
              { line: position.lineNumber - 1, character: position.column - 1 },
              word,
            );
            const loc = report?.definition?.[0];
            if (loc) {
              def = `lucid-def://${encodeURIComponent(
                JSON.stringify({ uri: loc.uri, line: loc.range.start.line }),
              )}`;
            }
          } catch {
            // No definition link — Docs still works.
          }
          return { docs, def };
        },
        // Kite signature assist (Atom steal #19): the
        // "How others used this" block — the lines in the
        // user's own open files that call this callee, from
        // the pattern index (steal #7). The prefix is the
        // full dotted chain + `(` (`obj.foo(`), so only
        // real call sites match; capped at 3, Kite's cap.
        // No matches means no block — the signature is
        // unchanged, never invented.
        getCommonInvocations: (callee) => {
          return engineClient.getPatternCompletions(
            useFileStore.getState().openFiles.map((f) => ({
              path: f.path,
              content: f.content,
            })),
            `${callee}(`,
            3,
          );
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
    // The git gutter's layer (Atom steal #4): one layer
    // over this editor, fed by refreshGutter.
    gutterLayerRef.current = new MarkerLayer(_editor);
    // The editor-jump subscription (Atom steal #8): modals
    // request jumps, this editor applies them. Disposed with
    // the providers below.
    const jumpUnsubscribe = subscribeEditorJump((jump) => {
      void handleJumpRequest(jump);
    });
    lspDisposers.current.push(jumpUnsubscribe);
    // The hover link opener (Atom steal #7): the Docs/Def
    // links in the hover markdown land here. Returning false
    // lets any other opener try the link.
    if (monaco.editor?.registerLinkOpener) {
      const linkOpener = monaco.editor.registerLinkOpener({
        open: (resource: { toString: () => string }) => {
          const href = resource.toString();
          if (href.startsWith('lucid-docs://')) {
            try {
              const data = JSON.parse(
                decodeURIComponent(href.slice('lucid-docs://'.length)),
              );
              publishDocsCursor({
                path: data.path,
                lineNumber: data.lineNumber,
                column: data.column,
                word: data.word ?? null,
              });
              requestDocsPanel();
              return true;
            } catch {
              return false;
            }
          }
          if (href.startsWith('lucid-def://')) {
            try {
              const data = JSON.parse(
                decodeURIComponent(href.slice('lucid-def://'.length)),
              );
              const path = String(data.uri ?? '').replace(/^file:\/\//, '');
              if (!path) return false;
              void (async () => {
                await useFileStore.getState().openFile(path);
                requestEditorJump({
                  path,
                  lineNumber: (data.line ?? 0) + 1,
                  column: 1,
                });
              })();
              return true;
            } catch {
              return false;
            }
          }
          return false;
        },
      });
      lspDisposers.current.push(() => linkOpener.dispose());
    }
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
    scheduleGutter();
    // A jump requested before this editor mounted (the view
    // was elsewhere when the modal asked) — apply it now.
    const pendingJump = getPendingEditorJump();
    if (
      pendingJump &&
      pendingJump.path === useFileStore.getState().activeFilePath
    ) {
      consumePendingEditorJump();
      applyJumpToEditor(_editor, pendingJump);
    }
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

  // Keyboard shortcuts: none live here anymore. ⌘S (save) and
  // ⌘⇧F (find in project) used to be handled on this div, but
  // the keymap dispatcher (Atom steal #13, keymapDispatch.ts)
  // owns them now — one handler for the keymap, the menu and
  // the palette, so a user rebind changes all three. Keeping
  // these branches here would save twice (this div's handler
  // AND the window dispatcher fire on the same keydown).
  // Empty state - solid stored theme, not black (Gary, 2026-11-09):
  // the centre used to be transparent over the app root's bg-black,
  // so the Files page read as a black hole between themed panels.
  // bg-primary is the theme token - never a hardcoded colour here.
  if (openFiles.length === 0) {
    return (
      <div className="h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-muted)]">
        {/* View header (sweep item 17) — the empty state is its
            own return, so the header lives here too; the Editor
            view carries it with no files open as well as with. */}
        <div className="px-4 pt-4">
          <ViewHeader
            title="Editor"
          />
        </div>
        <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]">
          <p>No files open. Select a file from the explorer.</p>
        </div>
        <EditorStatusBar />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* View header (sweep item 17): the one pattern — title +
          title only — above the file tabs. The same
          header shows in the detached Files window (MiniFiles
          renders this same CodeEditor): same view, same header. */}
      <div className="px-4 pt-4">
        <ViewHeader
          title="Editor"
        />
      </div>
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
              <FileTypeIcon path={file.path} />
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
          {activeFile.isTruncated && (
            <div
              data-testid="large-file-banner"
              className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)] border-b border-[var(--border)]"
            >
              Large file — showing the first {formatBytes(LARGE_FILE_PREVIEW_BYTES)} of{' '}
              {formatBytes(activeFile.fullSize ?? 0)}. Read-only preview; editing is disabled.
            </div>
          )}
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
                  // Docs panel refresh on edit (Kite
                  // follow-on #2): the edit may have changed
                  // the symbol’s docs without moving the
                  // cursor — re-ask, debounced.
                  scheduleDocsCursorRefresh(activeFile.path);
                }}
                spellCheck={false}
                readOnly={activeFile.isTruncated === true}
                placeholder="Plain text editing — Monaco unavailable"
                className="w-full h-full bg-transparent text-[var(--text-primary)] font-mono text-sm p-3 outline-none resize-none overflow-auto whitespace-pre"
                style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize }}
              />
            </Tooltip>
          ) : (
            <Editor
              height="100%"
              language={getLanguage(activeFile.name)}
              // Real file URI for the model (was auto-generated
              // `inmemory://model/N`): the unusual-line-terminator
              // dialog names the file instead of "The file '2'",
              // and per-file view-state keys on the real path.
              path={activeFile.path}
              value={activeFile.content || ''}
              loading="" // Disable default loading text to see if it's Monaco
              theme={getEditorTheme()}
              onMount={handleEditorDidMount}
              onChange={(value) => {
                updateFileContent(activeFile.path, value || '');
                void updateFileTree(activeFile.path, value || '');
                engineClient.changeDocument(activeFile.path, value || '');
                scheduleDiagnostics();
                scheduleGutter();
                scheduleModelStatus();
                // Docs panel refresh on edit (Kite
                // follow-on #2): the edit may have changed
                // the symbol's docs without moving the
                // cursor — re-ask, debounced.
                scheduleDocsCursorRefresh(activeFile.path);
              }}
              options={{
                fontFamily: settings.fontFamily,
                fontSize: settings.fontSize,
                // Silently strip U+2028/U+2029 on model creation.
                // The default ('prompt') shows Monaco's dialog via
                // a synchronous blocking window.confirm() on the
                // renderer thread — the whole platform freezes
                // until it is dismissed (2026-11-15, 4-line file).
                unusualLineTerminators: 'auto',
                // A truncated preview is read-only; normal
                // files are untouched.
                readOnly: activeFile.isTruncated === true,
                minimap: { enabled: true },
                // The git gutter renders in the glyph margin
                // (Atom steal #6 — `gutter` decorations).
                glyphMargin: true,
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
                // Settings smalls (Atom steal #20): bracket
                // config + wrap-guide rulers, live from
                // Settings > General > Editor.
                ...editorOptionsForSettings(settings),
              }}
            />
          )}
        </div>
      )}

      {/* Find in project (Atom steal #5) — the bottom panel,
          below the editor, above the editor status bar. */}
      <FindReplacePanel />
      {/* Editor status bar (Atom steal #11): the bottom strip
          under the editor — path, cursor, selection, grammar,
          line endings, git. */}
      <EditorStatusBar />
    </div>
  );
}

export default CodeEditor;
