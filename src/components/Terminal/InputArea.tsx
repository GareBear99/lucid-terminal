import { useRef, useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import '../../lib/monacoLoader'; // Bundle Monaco locally instead of the CDN
import { ProcessingGlow } from './ProcessingGlow';
import { InputDragHandle } from '../InputDragHandle';
import {
  INPUT_DRAG_MAX_HEIGHT_VH,
  INPUT_MIN_HEIGHT_PX,
  resolveInputHeightPx,
  useDraggableInputHeight,
} from '../../lib/inputHeight';
import { useToastStore } from '../../stores/toastStore';

// How long to wait for Monaco (bundled locally with the app) before giving
// up and rendering a plain textarea. Without this the prompt sits on
// "Loading..." forever if Monaco fails to load, and the user cannot type
// a command at all.
const MONACO_LOAD_TIMEOUT_MS = 8000;

// The default cap lives in src/lib/inputHeight.ts (INPUT_DEFAULT_HEIGHT_VH,
// one-third of the page) and the drag max there (INPUT_DRAG_MAX_HEIGHT_VH,
// half the page). The input grows upward with the content up to the
// default cap, then scrolls — and a drag handle on its top edge lets the
// user drag it taller or shorter, up to the drag max (Gary, 2026-11-05,
// c236ab3; the dragged height is a CAP, not a floor, so the input
// regresses to fit the content when it shrinks and is never stuck tall,
// 988a9a1). The drag was removed by ec33aa9 (Gary, 2026-11-07: "dont
// allow drag to extend") and is RESTORED here by Gary's 2026-11-08
// "recover it all" — that order overrides the no-drag order for this
// recovery. The squared glass backwall behind the prompt lives on the
// prompt panel in Terminal.tsx (prompt-input-wrap) — Warp-AI-terminal
// style, squared corners, in both the LuciferAI-on and flat states.

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
    /** Flat prompt (LuciferAI disabled): no bubble chrome — but the
     *  cursor/text padding stays (Gary, 2026-11-05): the input sits
     *  12px in from the edge in BOTH states, flat or not, so the
     *  cursor never hugs the edge. The drag handle keeps working
     *  too: resizing the input is not bubbling. The rainbow
     *  processing glow is NOT bubble chrome — it is a platform
     *  appearance trait (Gary, 2026-11-08), governed only by its
     *  own settings (processingGlowColor / Intensity / Speed), so
     *  flat does not suppress it. The squared glass backwall is
     *  the prompt panel itself (Terminal.tsx), not bubble
     *  chrome, so it shows in both states. */
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
  const { draggedHeightPx, isDragging, onDragHandlePointerDown, noteHeight } =
    useDraggableInputHeight();
  // The input height: default cap 33.33vh; the dragged height is a
  // cap — the input regresses to fit the content and is never stuck
  // tall — direct pointer follow while dragging.
  const editorHeight = resolveInputHeightPx(
    contentHeightPx,
    draggedHeightPx,
    viewportHeightPx,
    isDragging,
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

    // Keep the drag's start height current, and track viewport resizes
    // so the vh caps stay right when the window changes size.
    useEffect(() => {
        noteHeight(editorHeight);
    }, [editorHeight, noteHeight]);

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
    // The dragged height caps how tall the input may grow; the
    // input regresses to fit the content when it shrinks.
    useEffect(() => {
        const el = fallbackRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const heightPx = resolveInputHeightPx(
            el.scrollHeight,
            draggedHeightPx,
            window.innerHeight,
            isDragging,
        );
        el.style.height = `${heightPx}px`;
        noteHeight(heightPx);
    }, [input, monacoFailed, draggedHeightPx, isDragging, noteHeight]);

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
        
        // Record the content height; the bubble height derives from it
        // (default cap, dragged cap, drag follow). Window
        // resizes are tracked by the viewport effect above.
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
        // Prompt shape (Gary, 2026-11-08): when LuciferAI is ON,
        // the squared bottom-drop section (rounded-none). When it
        // is OFF, the ORIGINAL Lucid terminal prompt (pre-ec33aa9,
        // 4d8ef4e) — flat, bare: no rounding, no box — BUT with the
        // 12px side padding back (Gary, 2026-11-05 + 2026-11-08
        // "recover it all"): the cursor/text sits 12px in from the
        // edge in BOTH states, so it never hugs the bubble edge.
        // The rainbow glow inherits this (it is a platform trait
        // and still shows, flat or not).
        <div className={flat ? 'w-full h-auto min-h-[40px] flex items-center relative px-3' : 'w-full h-auto min-h-[40px] flex items-center relative rounded-none px-3'}>
            {/* Rainbow swirl processing glow — a platform appearance
                trait, not a LuciferAI trait (Gary, 2026-11-08): it
                shows while a command is processing in ALL modes,
                flat or not, devmode or not. Governed only by its
                own appearance settings. Processing-only, not
                always-on. */}
            <ProcessingGlow isProcessing={isProcessing} />
            {/* Drag handle on the input's top edge: drag up to grow,
                down to shrink, up to half the page (Gary, 2026-11-08:
                "recover it all" — restored from c236ab3). */}
            <InputDragHandle
                isDragging={isDragging}
                onDragHandlePointerDown={onDragHandlePointerDown}
            />
            
            {monacoFailed ? (
                <textarea
                    ref={fallbackRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleFallbackKeyDown}
                    rows={1}
                    wrap="off"
                    autoFocus
                    placeholder="Type a command… (plain input — Monaco unavailable)"
                    title="Monaco editor unavailable — using plain input"
                    className="w-full bg-transparent text-[var(--text-primary)] font-mono text-[13px] leading-5 px-0 py-[10px] outline-none resize-none overflow-y-auto overflow-x-auto whitespace-nowrap"
                    style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace", maxHeight: `${INPUT_DRAG_MAX_HEIGHT_VH}vh` }}
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
                        horizontal: 'auto',
                        handleMouseWheel: true
                    },
                    scrollBeyondLastLine: false,
                    // Long text scrolls RIGHT (Gary, 2026-11-08): no wrap,
                    // horizontal scroll on — typing past the edge scrolls
                    // the line right so the cursor stays visible, instead
                    // of the line wrapping (and growing the bar tall).
                    wordWrap: 'off',
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
