import { useRef, useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import '../../lib/monacoLoader'; // Bundle Monaco locally instead of the CDN
import { ProcessingGlow } from './ProcessingGlow';
import {
  INPUT_DEFAULT_HEIGHT_VH,
  INPUT_MIN_HEIGHT_PX,
  resolveInputHeightPx,
} from '../../lib/inputHeight';
import { useToastStore } from '../../stores/toastStore';

// How long to wait for Monaco (bundled locally with the app) before giving
// up and rendering a plain textarea. Without this the prompt sits on
// "Loading..." forever if Monaco fails to load, and the user cannot type
// a command at all.
const MONACO_LOAD_TIMEOUT_MS = 8000;

// The default cap lives in src/lib/inputHeight.ts (INPUT_DEFAULT_HEIGHT_VH,
// one-third of the page). The input grows upward with the content up to
// the default cap, then scrolls. There is NO drag handle on the prompt
// (Gary, 2026-11-07): the prompt area must not be drag-extendable.
// The squared glass backwall behind the prompt lives on the prompt
// panel in Terminal.tsx (prompt-input-wrap) — Warp-AI-terminal style,
// squared corners, in both the LuciferAI-on and flat states.

// Monaco types
declare global {
  interface Window {
    monaco: any;
  }
}


interface InputAreaProps {
    onSubmit: (command: string) => void;
    onHistoryUp: () => void;
    onHistoryDown: () => void;
    input: string;
    setInput: (value: string) => void;
    isProcessing?: boolean;
    /** Flat prompt (LuciferAI disabled): no bubble. The rainbow
     *  processing glow is NOT bubble chrome — it is a platform
     *  appearance trait (Gary, 2026-11-08), governed only by its
     *  own settings (processingGlowColor / Intensity / Speed), so
     *  flat does not suppress it. The squared glass backwall is
     *  the prompt panel itself (Terminal.tsx), not bubble chrome,
     *  so it shows in both states. */
    flat?: boolean;
}

export function InputArea({ onSubmit, onHistoryUp, onHistoryDown, input, setInput, isProcessing = false, flat = false }: InputAreaProps) {
  const editorRef = useRef<any>(null);
  // Content height from the editor (Monaco) or the fallback textarea;
  // the input height derives from it plus the dragged cap (below).
  const [contentHeightPx, setContentHeightPx] = useState(INPUT_MIN_HEIGHT_PX);
  const [viewportHeightPx, setViewportHeightPx] = useState(
    () => window.innerHeight,
  );
  // The input height: grow with the content up to the 33.33vh default
  // cap, then scroll. No dragged height — the prompt is not
  // drag-extendable (Gary, 2026-11-07), so the height is always the
  // never-dragged resolution.
  const editorHeight = resolveInputHeightPx(
    contentHeightPx,
    null,
    viewportHeightPx,
  );
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const editorDisposers = useRef<Array<() => void>>([]);

  // Monaco fallback: the editor is bundled locally, but if it still fails
  // to mount the prompt is stuck on "Loading..." with no way to type.
  // Fall back to a plain textarea so the terminal stays usable.
  const [monacoFailed, setMonacoFailed] = useState(false);
  const fallbackToastShown = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fallBack = () => {
      if (cancelled || editorRef.current) return;
      setMonacoFailed(true);
      if (!fallbackToastShown.current) {
        fallbackToastShown.current = true;
        useToastStore.getState().warning(
          'Monaco editor failed to load — using plain input. Commands still work.'
        );
      }
    };
    // Fast path: the loader promise rejects when the Monaco bundle fails to load.
    loader.init().catch(fallBack);
    // Slow path: the Monaco load can hang instead of failing outright.
    const timer = setTimeout(fallBack, MONACO_LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

    // Drop the editor's size/resize listeners when the input unmounts.
    useEffect(() => {
        return () => {
            editorDisposers.current.forEach((dispose) => dispose());
        };
    }, []);

    // Track viewport resizes so the vh cap stays right when the window
    // changes size.
    useEffect(() => {
        const onResize = () => setViewportHeightPx(window.innerHeight);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Sync external input state with editor
    useEffect(() => {
        if (editorRef.current && input !== editorRef.current.getValue()) {
            editorRef.current.setValue(input);
            // Move cursor to end
            const model = editorRef.current.getModel();
            if (model) {
                editorRef.current.setPosition({
                    lineNumber: model.getLineCount(),
                    column: model.getLineMaxColumn(model.getLineCount())
                });
            }
        }
    }, [input]);

    // Plain-textarea fallback: grow with the content up to the cap,
    // then scroll - long input stays readable instead of clipping.
    // The input regresses to fit the content when it shrinks.
    useEffect(() => {
        const el = fallbackRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const heightPx = resolveInputHeightPx(
            el.scrollHeight,
            null,
            window.innerHeight,
        );
        el.style.height = `${heightPx}px`;
    }, [input, monacoFailed]);

    // Handle Monaco Editor mount
    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        
        // Define custom theme with glass effect
        monaco.editor.defineTheme('lucid-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: '', foreground: 'e6edf3', background: '00000000' },
                { token: 'string', foreground: '7ee787' },
                { token: 'keyword', foreground: 'ff7b72' },
                { token: 'number', foreground: '79c0ff' },
                { token: 'comment', foreground: '8b949e' },
            ],
            colors: {
                'editor.background': '#00000000', // Transparent
                'editor.foreground': '#e6edf3',
                'editorCursor.foreground': '#58a6ff',
                'editor.lineHighlightBackground': '#00000000',
                'editorLineNumber.foreground': '#6e7681',
                'editor.selectionBackground': '#58a6ff40',
                'editor.inactiveSelectionBackground': '#58a6ff20',
            }
        });
        
        // Apply theme
        monaco.editor.setTheme('lucid-dark');
        
        // Add keyboard shortcuts
        editor.addCommand(
            monaco.KeyCode.Enter,
            () => {
                const value = editor.getValue().trim();
                if (value) {
                    onSubmit(value);
                }
            }
        );
        
        editor.addCommand(
            monaco.KeyCode.UpArrow,
            () => {
                onHistoryUp();
            }
        );
        
        editor.addCommand(
            monaco.KeyCode.DownArrow,
            () => {
                onHistoryDown();
            }
        );
        
        // Focus editor
        editor.focus();
        
        // Record the content height; the input height derives from it
        // (default cap only — no drag). Window resizes are tracked by
        // the viewport effect above.
        const syncHeight = () => {
            setContentHeightPx(editor.getContentHeight());
        };
        syncHeight();
        const sizeDisposable = editor.onDidContentSizeChange(syncHeight);
        editorDisposers.current.push(() => sizeDisposable.dispose());
    };

    // Plain-textarea fallback: same behaviour as the editor — Enter submits,
    // Up/Down walk command history.
    const handleFallbackKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const value = input.trim();
            if (value) {
                onSubmit(value);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onHistoryUp();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onHistoryDown();
        }
    };

    return (
        // Prompt shape follows LuciferAI (Gary, 2026-11-08): flat
        // (LuciferAI off) = the rounded prompter; LuciferAI on =
        // squared edge, indicating the bottom drop section. The
        // rainbow glow inherits this radius.
        <div className={`w-full h-auto min-h-[40px] flex items-center relative ${flat ? 'rounded-lg' : 'rounded-none'} px-3`}>
            {/* Rainbow swirl processing glow — a platform appearance
                trait, not a LuciferAI trait (Gary, 2026-11-08): it
                shows while a command is processing in ALL modes,
                flat or not, devmode or not. Governed only by its
                own appearance settings. Processing-only, not
                always-on. */}
            <ProcessingGlow isProcessing={isProcessing} />
            {monacoFailed ? (
                <textarea
                    ref={fallbackRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleFallbackKeyDown}
                    rows={1}
                    autoFocus
                    placeholder="Type a command… (plain input — Monaco unavailable)"
                    title="Monaco editor unavailable — using plain input"
                    className="w-full bg-transparent text-[var(--text-primary)] font-mono text-[13px] leading-5 px-0 py-[10px] outline-none resize-none overflow-y-auto"
                    style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace", maxHeight: `${INPUT_DEFAULT_HEIGHT_VH}vh` }}
                />
            ) : (
            <Editor
                height={editorHeight}
                language="shell"
                theme="lucid-dark"
                value={input || ''}
                onChange={(val) => setInput(val || '')}
                onMount={handleEditorDidMount}
                loading={<div className="text-[var(--text-muted)] text-sm">Loading...</div>}
                options={{
                    minimap: { enabled: false },
                    lineNumbers: 'off',
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 0,
                    lineNumbersMinChars: 0,
                    scrollbar: {
                        vertical: 'auto',
                        horizontal: 'hidden',
                        handleMouseWheel: true
                    },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    wrappingIndent: 'none',
                    automaticLayout: true,
                    quickSuggestions: false,
                    suggestOnTriggerCharacters: false,
                    acceptSuggestionOnEnter: 'off',
                    tabCompletion: 'off',
                    wordBasedSuggestions: 'off',
                    contextmenu: false,
                    renderLineHighlight: 'none',
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace",
                    fontSize: 13,
                    fontWeight: '400',
                    lineHeight: 20,
                    letterSpacing: 0,
                    padding: { top: 10, bottom: 10 },
                    renderWhitespace: 'none',
                    renderControlCharacters: false,
                    matchBrackets: 'never',
                    fontLigatures: false,
                }}
            />
            )}
        </div>
    );
}
