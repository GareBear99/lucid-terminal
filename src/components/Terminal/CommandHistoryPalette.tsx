/**
 * Command history palette (sweep item 5) — Ctrl+R over the
 * command history, Warp's reverse-search shape.
 *
 * The list is the global command history (commandHistoryStore
 * — Gary, 2026-11-13 ~15:05 PST: up-arrow history is global,
 * not per tab), newest first, deduplicated (the most recent
 * occurrence wins). Selecting a command puts it back into the
 * composer (the Re-input pattern — it fills the input, it
 * does not run), so the user can edit before submitting.
 * The palette is the FuzzyModal — the same list chrome as
 * ⌘⇧P / ⌘P, with live filtering and arrow-key navigation.
 *
 * The Ctrl+R binding lives in Terminal.tsx and only fires
 * while the composer owns typing (level 3+ terminal mode):
 * below 3 Ctrl+R is the shell's readline reverse-search and
 * must not be hijacked, and in agent mode the composer takes
 * prompts, not shell commands.
 */

import { useMemo } from 'react';
import { FuzzyModal, type FuzzyModalItem } from '../FuzzyModal/FuzzyModal';
import { useCommandHistoryStore } from '../../stores/commandHistoryStore';

interface CommandHistoryPaletteProps {
  open: boolean;
  /** Put the chosen command back into the composer. */
  onReinput: (command: string) => void;
  onClose: () => void;
}

export function CommandHistoryPalette({ open, onReinput, onClose }: CommandHistoryPaletteProps) {
  const entries = useCommandHistoryStore((s) => s.entries);
  const items: FuzzyModalItem[] = useMemo(() => {
    // Newest first, deduplicated — the same list Up/Down
    // walks, newest last there.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const cmd = entries[i];
      if (!seen.has(cmd)) {
        seen.add(cmd);
        unique.push(cmd);
      }
    }
    return unique.map((cmd) => ({ id: cmd, label: cmd, filterText: cmd }));
  }, [entries]);
  return (
    <FuzzyModal
      open={open}
      placeholder="Search command history"
      items={items}
      emptyText={entries.length === 0 ? 'No commands yet' : 'No matching commands'}
      onSelect={(item) => {
        onClose();
        onReinput(item.label);
      }}
      onClose={onClose}
    />
  );
}
