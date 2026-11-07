/**
 * Empty terminal state — shown when no terminal tab is open.
 *
 * The "Create Terminal" button is the original action, wording and
 * styling untouched. The "Create Editor" button (Gary, 2026-11-06)
 * sits next to it: from this empty state you can open an editor tab
 * for file editing, VS Code-style, instead of a terminal. It switches
 * to the editor view, which renders even with no files open yet — the
 * editor's own empty state points at the Explorer to pick a file.
 *
 * Split out of App.tsx as a pure presentational component so it is
 * renderable in tests (see tests/emptyTerminalState.test.tsx).
 */
export interface EmptyTerminalStateProps {
  onCreateTerminal: () => void;
  onCreateEditor: () => void;
}

export function EmptyTerminalState({ onCreateTerminal, onCreateEditor }: EmptyTerminalStateProps) {
  return (
    <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
      <div className="text-center">
        <p className="text-lg mb-2">No terminal open</p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={onCreateTerminal} className="btn btn-primary">
            Create Terminal
          </button>
          <button onClick={onCreateEditor} className="btn btn-secondary">
            Create Editor
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmptyTerminalState;
