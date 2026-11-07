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
 * The blood drop (Gary, 2026-11-07) is the third option, shown ONLY
 * when LuciferAI is enabled: it is the LuciferAI tab — a tab you open
 * in the terminal tab strip (the blood drop tab IS the LuciferAI tab).
 * Clicking it selects that tab and shows the LuciferAI panel; it does
 * NOT open the Help modal (that is the toolbar drop's surface). This
 * is the segregation the terminal was missing: the terminal stays a
 * real, regular, usable terminal (plain shell), and LuciferAI's
 * commands are reached through the blood drop tab, never typed into
 * the terminal. When LuciferAI is off, App passes no handler and the
 * drop is not rendered at all — not in the strip, not here. No
 * splash screen on the blood drop screen — it is just the plugin.
 *
 * Split out of App.tsx as a pure presentational component so it is
 * renderable in tests (see tests/emptyTerminalState.test.tsx).
 */
import { BloodDropIcon } from '../Layout/BloodDropIcon';

export interface EmptyTerminalStateProps {
  onCreateTerminal: () => void;
  onCreateEditor: () => void;
  /** Opens the blood drop tab (the LuciferAI tab). Omitted when LuciferAI is off. */
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
              title="LuciferAI prompt commands"
              aria-label="LuciferAI prompt commands"
            >
              <BloodDropIcon size={18} />
              LuciferAI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmptyTerminalState;
