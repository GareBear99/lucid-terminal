import { useRef, useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { ProcessingGlow } from './ProcessingGlow';
import { useToastStore } from '../../stores/toastStore';

// How long to wait for Monaco (loaded from cdn.jsdelivr.net) before giving
// up and rendering a plain textarea. Without this the prompt sits on
// "Loading..." forever when the CDN is unreachable, and the user cannot type
// a command at all.
const MONACO_LOAD_TIMEOUT_MS = 8000;

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
}

export function InputArea({ onSubmit, onHistoryUp, onHistoryDown, input, setInput, isProcessing = false }: InputAreaProps) {
  const editorRef = useRef<any>(null);

  // Monaco fallback: the editor loads from a CDN, so when the network (or
  // the CDN) is down it never mounts and the prompt is stuck on "Loading..."
  // with no way to type. Fall back to a plain textarea so the terminal
  // stays usable.
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
    // Fast path: the loader promise rejects when the CDN script fails.
    loader.init().catch(fallBack);
    // Slow path: the CDN request can hang instead of failing outright.
    const timer = setTimeout(fallBack, MONACO_LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
        <div className="w-full h-auto min-h-[40px] flex items-center relative">
            {/* Rainbow swirl processing glow */}
            <ProcessingGlow isProcessing={isProcessing} />
            
            {monacoFailed ? (
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleFallbackKeyDown}
                    rows={1}
                    autoFocus
                    placeholder="Type a command… (plain input — Monaco unavailable)"
                    title="Monaco editor unavailable — using plain input"
                    className="w-full bg-transparent text-[var(--text-primary)] font-mono text-[13px] leading-5 px-0 py-[10px] outline-none resize-none overflow-hidden"
                    style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace" }}
                />
            ) : (
            <Editor
                height="40px"
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
                        vertical: 'hidden',
                        horizontal: 'hidden',
                        handleMouseWheel: false
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
