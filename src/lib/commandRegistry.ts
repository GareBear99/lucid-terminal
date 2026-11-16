/**
 * The command registry.
 *
 * Atom's `atom.commands` (`atom/src/command-registry.js`, MIT):
 * commands are `namespace:action` names bound to a CSS selector,
 * dispatched as bubbling CustomEvents, listeners firing in
 * CSS-specificity order, and `findCommands({target})` walks up the
 * DOM collecting every command valid at the focus point — that is
 * what powers the palette.
 *
 * Lucid's shape keeps the naming rule and the palette contract
 * and drops the DOM half: Lucid's surfaces are not
 * selector-stable, so context-sensitivity is a small `when`
 * predicate over a `CommandContext` (which view is showing,
 * whether a file is active, whether LuciferAI is on) instead of
 * a CSS selector. The registry itself is DOM-free and pure —
 * the palette reads it, the shortcuts dispatch through it.
 *
 * A command's `run` receives the same context the palette
 * filtered on, so a handler never has to re-ask "where am I".
 * `hiddenInCommandPalette` is Atom's flag verbatim: hidden
 * commands run fine, they just do not list (unless the palette
 * is asked to show them).
 */

import type { View } from '../types';

/** What the palette filters on — the focus point, Lucid-shaped. */
export interface CommandContext {
  /** The view currently showing in the main panel. */
  view: View;
  /** An editor file is active (the editor view has a file open). */
  hasActiveFile: boolean;
  /** At least one editor file is open. */
  hasOpenFiles: boolean;
  /** The LuciferAI plugin is enabled (Settings → Plugins). */
  luciferAiEnabled: boolean;
  /** LuciferAI is silenced (blood drop grey). */
  luciferAiSilenced: boolean;
}

export interface CommandDefinition {
  /** `namespace:action`, lowercase, hyphenated words (Atom's rule). */
  id: string;
  /** The palette row. */
  title: string;
  /** Shown under the title on the selected row. */
  description?: string;
  /** Extra words the palette's fuzzy filter matches on. */
  tags?: string[];
  /** The keystroke shown on the right of the palette row. */
  keybinding?: string;
  /** True → runs fine, never lists in the palette. */
  hiddenInCommandPalette?: boolean;
  /** Context-sensitivity: false (or absent) means "not valid here". */
  when?: (ctx: CommandContext) => boolean;
  /** The work. Receives the context the palette filtered on. */
  run: (ctx: CommandContext) => void | Promise<void>;
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  /** Register (or replace) a command. */
  register(def: CommandDefinition): void {
    this.commands.set(def.id, def);
  }

  /** Remove a command. Returns true when one was registered. */
  unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  /** One command by id, or undefined. */
  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  /** Every registered command, in registration order. */
  all(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  /**
   * The commands valid at this focus point — Atom's
   * `findCommands`, Lucid-shaped. Hidden commands are excluded
   * unless `includeHidden` is set (the palette's "show hidden"
   * escape hatch).
   */
  findCommands(
    ctx: CommandContext,
    includeHidden = false,
  ): CommandDefinition[] {
    return this.all().filter((def) => {
      if (def.hiddenInCommandPalette && !includeHidden) return false;
      return def.when ? def.when(ctx) : true;
    });
  }

  /**
   * Run a command by id. Returns false when the id is unknown
   * or the command is not valid in this context — the caller
   * shows nothing; an unknown command is never an error in the
   * user's face.
   */
  async dispatch(id: string, ctx: CommandContext): Promise<boolean> {
    const def = this.commands.get(id);
    if (!def) return false;
    if (def.when && !def.when(ctx)) return false;
    await def.run(ctx);
    return true;
  }

  /** Test seam: drop every command. */
  clear(): void {
    this.commands.clear();
  }
}

/** The shared registry — Atom's `atom.commands`. */
export const commandRegistry = new CommandRegistry();
