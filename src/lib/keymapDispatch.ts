/**
 * Keymap dispatch (Atom steal #13 — keymaps, 2026-11-14).
 *
 * This is the one place a keyboard event becomes a command.
 * The keymap (src/lib/keymap.ts) is data — it says which
 * keystroke names which command in which context — and the
 * registry (src/lib/commandRegistry.ts) owns what the command
 * does and where it is valid. Dispatch is the bridge:
 *
 *   keydown → commandForKeyEvent (keymap `when`) → registry
 *   lookup → registry `when` → run.
 *
 * Both gates matter, and they catch different conflicts:
 * - The keymap's `when` is coarse (inEditor = the editor view
 *   with a file open): Ctrl+G in the terminal falls through
 *   to readline, because the keymap never names go-to-line
 *   there.
 * - The registry's `when` is the command's own validity:
 *   ⌘D names `terminal:split` everywhere in the keymap, but
 *   the registry's `inTerminal` gate blocks it in the editor —
 *   so Monaco keeps its ⌘D (add selection to next find match)
 *   and the editor never splits by accident. A blocked command
 *   returns null WITHOUT preventDefault, so the focused
 *   control keeps the key.
 *
 * A command that runs returns its id; null means "no Lucid
 * command owns this keystroke — let it fall through". The
 * caller (AtomModals' window keydown) preventDefaults only
 * when a command actually ran. The menu accelerators are the
 * other dispatch path (the packaged app): the menu intercepts
 * its keys before the renderer ever sees them, so a menu key
 * never double-fires through here.
 */
import {
  commandForKeyEvent,
  type KeymapBinding,
  type KeymapContext,
} from './keymap';
import { commandRegistry, type CommandContext, type CommandRegistry } from './commandRegistry';
import type { ScopeDescriptor } from './scopeDescriptor';
import { useFileStore } from '../stores/fileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { isLuciferAiEnabled, isLuciferAiSilenced } from './luciferAi';
import type { View } from '../types';

/** The registry context for a keydown: the view showing, the
 *  file state, the LuciferAI flags — read from the stores at
 *  dispatch time, never cached. */
export function buildCommandContext(
  view: View,
  hasActiveFile: boolean,
): CommandContext {
  const settings = useSettingsStore.getState().settings;
  return {
    view,
    hasActiveFile,
    hasOpenFiles: useFileStore.getState().openFiles.length > 0,
    luciferAiEnabled: isLuciferAiEnabled(settings),
    luciferAiSilenced: isLuciferAiSilenced(settings),
  };
}

export interface DispatchKeyEventOptions {
  /** The registry to run against (the singleton by default;
   *  tests pass their own). */
  registry?: CommandRegistry;
  /** User keybinding overrides (settings.customKeybindings). */
  overrides?: KeymapBinding[];
  /** Platform for the cmd/ctrl mapping (the running one by default). */
  platform?: NodeJS.Platform;
  /** The cursor's scope descriptor (Atom steal #18): scoped
   *  bindings only fire when it matches their selector.
   *  Null (no tree / engine down) means no scoped binding
   *  fires, except `*`. */
  scope?: ScopeDescriptor | null;
}

/**
 * Dispatch one keyboard event through the keymap + registry.
 * Returns the id of the command that ran, or null when no
 * Lucid command owns this keystroke in this context (or the
 * command exists but is not valid here — the key falls
 * through to the focused control untouched).
 */
export function dispatchKeyEvent(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  view: View,
  hasActiveFile: boolean,
  options: DispatchKeyEventOptions = {},
): string | null {
  const { registry = commandRegistry, overrides = [], platform, scope = null } = options;
  const keymapContext: KeymapContext = { view, hasActiveFile };
  const commandId = commandForKeyEvent(event, keymapContext, overrides, platform, scope);
  if (!commandId) return null;
  const def = registry.get(commandId);
  if (!def) return null;
  const context = buildCommandContext(view, hasActiveFile);
  if (def.when && !def.when(context)) return null;
  void def.run(context);
  return commandId;
}
