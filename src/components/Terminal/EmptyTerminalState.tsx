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
 * The blood drop (Gary, 2026-11-07 ~09:01 PST) is the third option,
 * shown ONLY when LuciferAI is enabled: JUST the blood drop icon, no
 * "LuciferAI" words anywhere on it. Clicking it creates/opens a
 * terminal, like the current implementation, under the blood drop
 * terminal tab — a plain terminal, not labelled a "LuciferAI terminal
 * tab". It does NOT go to the Help page (that is the toolbar blood
 * drop's job). The strip blood drop tab is a terminal tab and stays
 * as it is. When LuciferAI is off, App passes no handler and the
 * drop is not rendered at all — not in the strip, not here.
 *
 * Split out of App.tsx as a pure presentational component so it is
 * renderable in tests (see tests/emptyTerminalState.test.tsx).
 */
import { BloodDropIcon } from '../Layout/BloodDropIcon';

export interface EmptyTerminalStateProps {
  onCreateTerminal: () => void;
  onCreateEditor: () => void;
  /** Opens the blood drop terminal tab. Omitted when LuciferAI is off. */
  onOpenBloodDrop?: () => void;
}

export function EmptyTerminalState({ onCreateTerminal, onCreateEditor, onOpenBloodDrop }: EmptyTerminalStateProps) {
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
          {onOpenBloodDrop && (
            <button
              onClick={onOpenBloodDrop}
              className="btn btn-secondary inline-flex items-center gap-2"
              data-testid="empty-state-blood-drop"
              title="Blood drop terminal"
              aria-label="Blood drop terminal"
            >
              <BloodDropIcon size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmptyTerminalState;
