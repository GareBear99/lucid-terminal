import { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { ProcessingGlow } from './ProcessingGlow';

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

    return (
        <div className="w-full h-auto min-h-[40px] flex items-center relative">
            {/* Siri-style processing glow */}
            <ProcessingGlow isProcessing={isProcessing} />
            
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
        </div>
    );
}
