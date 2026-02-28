import { X, Save } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';

function CodeEditor() {
  const { openFiles, activeFilePath, setActiveFile, closeFile, updateFileContent, saveFile } =
    useFileStore();
  const { settings, currentTheme } = useSettingsStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

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

  // Monaco editor theme based on current theme
  const getEditorTheme = () => {
    const isDark = currentTheme.colors.bgPrimary.startsWith('#0') ||
      currentTheme.colors.bgPrimary.startsWith('#1') ||
      currentTheme.colors.bgPrimary.startsWith('#2');
    return isDark ? 'vs-dark' : 'light';
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

  if (openFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
        <p>No files open. Select a file from the explorer.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" onKeyDown={handleKeyDown}>
      {/* File Tabs */}
      <div className="h-9 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <div className="flex-1 flex items-center overflow-x-auto">
          {openFiles.map((file) => (
            <div
              key={file.path}
              className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] cursor-pointer transition-colors ${file.path === activeFilePath
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] tab-active'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              onClick={() => setActiveFile(file.path)}
            >
              <span className="text-sm whitespace-nowrap">
                {file.isDirty && <span className="text-[var(--accent)]">● </span>}
                {file.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(file.path);
                }}
                className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Save Button */}
        {activeFile?.isDirty && (
          <button
            onClick={handleSave}
            className="h-9 px-3 flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Save (Ctrl+S)"
          >
            <Save size={14} />
            <span className="text-xs">Save</span>
          </button>
        )}
      </div>

      {/* Editor */}
      {activeFile && (
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language={getLanguage(activeFile.name)}
            value={activeFile.content || ''}
            loading="" // Disable default loading text to see if it's Monaco
            theme={getEditorTheme()}
            onChange={(value) => updateFileContent(activeFile.path, value || '')}
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
        </div>
      )}
    </div>
  );
}

export default CodeEditor;
