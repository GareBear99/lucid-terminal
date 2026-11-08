/**
 * Commands catalogue — everything the terminal accepts, for
 * Settings.
 *
 * Built from three sources, in this order (first source wins on a
 * name clash):
 * 1. The router (src/utils/commandRouter.ts): SHELL_COMMANDS,
 *    LUCIFERAI_COMMANDS, MULTI_WORD_COMMANDS — what the terminal
 *    actually routes. These are the ground truth for what runs.
 * 2. The Help modal's data (src/data/helpData.ts): commands the
 *    Help panel documents that the router does not enumerate
 *    (github, env, install, daemon, ...). They run through
 *    LucidCore, not the router, so they are marked source 'help'
 *    rather than 'router' — the split is visible, not hidden.
 *
 * Two helpData categories are NOT commands and are excluded:
 * 'tiers' (model tiers, not runnable) and 'natural' (plain-English
 * questions, not commands).
 *
 * Descriptions prefer the Help text when a command is documented
 * there; otherwise they fall back to the router's own
 * getCommandDescription, or a plain shell description. Nothing
 * here is invented: an entry exists only because the router routes
 * it or Help documents it.
 */

import {
  getCommandDescription,
  LUCIFERAI_COMMANDS,
  MULTI_WORD_COMMANDS,
  parseCommand,
  SHELL_COMMANDS,
  type CommandType,
} from '../utils/commandRouter';
import { helpCategories } from './helpData';

export type CommandCatalogueKind = 'shell' | 'luciferai' | 'multi-word' | 'lucid';

export interface CommandCatalogueEntry {
  /** Display name, e.g. 'fixnet stats'. */
  name: string;
  /** How to type it, e.g. 'fix <file|error>'. */
  syntax: string;
  /** One line, from Help when documented there. */
  description: string;
  /** Group title, e.g. 'FixNet Commands'. */
  category: string;
  kind: CommandCatalogueKind;
  /** 'router' = the terminal routes it; 'help' = Help documents it
   * (runs through LucidCore, not the router). */
  source: 'router' | 'help';
  aliases?: string[];
}

export interface CommandCategory {
  id: string;
  title: string;
  entries: CommandCatalogueEntry[];
}

/** Help categories that are not commands. */
const EXCLUDED_HELP_CATEGORIES = new Set(['tiers', 'natural']);

/** Fallback group for a Lucid-local single word Help does not document. */
const LUCIFERAI_FALLBACK_CATEGORY: Record<string, string> = {
  fix: 'FixNet Commands',
  fixnet: 'FixNet Commands',
  workflow: 'Workflow & System',
  history: 'Workflow & System',
};

/** Fallback group for a multi-word command Help does not document. */
const MULTI_WORD_FALLBACK_CATEGORY: Record<string, string> = {
  fixnet: 'FixNet Commands',
  llm: 'Model Management',
  browser: 'Browser',
  workflow: 'Workflow & System',
  history: 'Workflow & System',
};

interface HelpLookup {
  name: string;
  syntax: string;
  description: string;
  category: string;
  aliases?: string[];
}

function buildHelpLookup(): Map<string, HelpLookup> {
  const lookup = new Map<string, HelpLookup>();
  for (const category of helpCategories) {
    if (EXCLUDED_HELP_CATEGORIES.has(category.id)) continue;
    for (const command of category.commands) {
      const key = command.name.toLowerCase();
      if (!lookup.has(key)) {
        lookup.set(key, {
          name: command.name,
          syntax: command.syntax,
          description: command.description,
          category: category.title,
          aliases: command.aliases,
        });
      }
    }
  }
  return lookup;
}

function buildCommandCatalogue(): CommandCatalogueEntry[] {
  const help = buildHelpLookup();
  const byName = new Map<string, CommandCatalogueEntry>();
  const add = (entry: CommandCatalogueEntry) => {
    const key = entry.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, entry);
  };

  // 1. Shell commands — run directly, no AI involved.
  for (const name of [...SHELL_COMMANDS].sort()) {
    const documented = help.get(name);
    add({
      name,
      syntax: documented?.syntax ?? name,
      description:
        documented?.description ??
        'Shell command — runs directly in the terminal, no AI involved.',
      category: documented?.category ?? 'Shell',
      kind: 'shell',
      source: 'router',
      aliases: documented?.aliases,
    });
  }

  // 2. LuciferAI commands — slash-only. Bare words go to the
  // shell now (Gary, 2026-11-07: the real terminal), so the
  // syntax shown here is the slash form.
  for (const name of [...LUCIFERAI_COMMANDS].sort()) {
    const documented = help.get(name);
    add({
      name,
      syntax: documented?.syntax ?? `/${name}`,
      description:
        documented?.description ??
        getCommandDescription(name as CommandType),
      // Undocumented Lucid-local singles belong with their
      // function, not under 'LuciferAI': `/fixnet` is a FixNet
      // command and `/workflow` / `/history` are workflow ones,
      // so they stay listed (under the right heading) while the
      // plugin is off instead of vanishing with it.
      category:
        documented?.category ??
        LUCIFERAI_FALLBACK_CATEGORY[name] ??
        'LuciferAI',
      kind: 'luciferai',
      source: 'router',
      aliases: documented?.aliases,
    });
  }

  // 3. Multi-word commands — matched as a phrase, before the
  // single-word sets (same order as the router).
  for (const multi of MULTI_WORD_COMMANDS) {
    const documented = help.get(multi.phrase);
    add({
      name: multi.phrase,
      // Slash form: `/fixnet stats`, not the bare phrase — the
      // terminal only runs these with the slash now.
      syntax: documented?.syntax ?? `/${multi.phrase}`,
      description:
        documented?.description ?? getCommandDescription(multi.type),
      category:
        documented?.category ??
        MULTI_WORD_FALLBACK_CATEGORY[multi.type] ??
        'LuciferAI',
      kind: 'multi-word',
      source: 'router',
      aliases: documented?.aliases,
    });
  }

  // 4. Help-only commands — documented in Help, run through
  // LucidCore rather than the router.
  for (const [key, documented] of [...help.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (byName.has(key)) continue;
    add({
      name: documented.name,
      syntax: documented.syntax,
      description: documented.description,
      category: documented.category,
      kind: 'lucid',
      source: 'help',
      aliases: documented.aliases,
    });
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The full catalogue, sorted by name. */
export const COMMAND_CATALOGUE: CommandCatalogueEntry[] =
  buildCommandCatalogue();

/** Category order for the Settings list: LuciferAI and Shell
 * first, then the Help categories in Help order, then anything
 * else alphabetically. */
const CATEGORY_ORDER = [
  'LuciferAI',
  'Shell',
  'Direct Commands',
  'Planning',
  'FixNet Commands',
  'Model Management',
  'AI Code Generation',
  'Workflow & System',
  'GitHub Integration',
  'Environment Management',
  'Model Installation',
  'System Information',
  'Developer Tools',
  'Special Modes',
  'Browser',
];

function groupCatalogue(
  entries: readonly CommandCatalogueEntry[],
): CommandCategory[] {
  const groups = new Map<string, CommandCatalogueEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.category) ?? [];
    group.push(entry);
    groups.set(entry.category, group);
  }
  const titles = [...groups.keys()].sort((a, b) => {
    const aOrder = CATEGORY_ORDER.indexOf(a);
    const bOrder = CATEGORY_ORDER.indexOf(b);
    if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder;
    if (aOrder !== -1) return -1;
    if (bOrder !== -1) return 1;
    return a.localeCompare(b);
  });
  return titles.map((title) => ({
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    entries: groups.get(title) ?? [],
  }));
}

/** The catalogue grouped for Settings, in display order. */
export const COMMAND_CATEGORIES: CommandCategory[] = groupCatalogue(
  COMMAND_CATALOGUE,
);

/** Filter the catalogue by substring over name, syntax, and
 * description. An empty query returns everything.
 *
 * `luciferAiEnabled` (default true) is the display gate for the
 * Terminal tab: while LuciferAI is off, entries that need the
 * plugin are left out, so the list shows only what the terminal
 * will actually run. See requiresLuciferAI for the rule. */
export function searchCommandCatalogue(
  query: string,
  luciferAiEnabled = true,
): CommandCatalogueEntry[] {
  const q = query.trim().toLowerCase();
  const base = q
    ? COMMAND_CATALOGUE.filter(
        (entry) =>
          entry.name.toLowerCase().includes(q) ||
          entry.syntax.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q),
      )
    : COMMAND_CATALOGUE;
  if (luciferAiEnabled) return base;
  return base.filter((entry) => !requiresLuciferAI(entry));
}

/**
 * Whether this catalogue entry needs the LuciferAI plugin to run
 * (Gary, 2026-11-07: "when lucifer AI disabled its commands
 * shouldnt be in the terminal setting panel").
 *
 * The rule is the terminal's own behaviour in
 * src/components/Terminal/Terminal.tsx — the panel lists only what
 * the terminal will actually run while the plugin is off. Lucid
 * commands are slash-only now (bare words go to the shell), so
 * this is judged on the SLASH form (`parseCommand('/' + name)`):
 *
 * - Shell commands run in the PTY and never touch the plugin.
 * - Slash LuciferAI commands (kind 'luciferai': help, plan, fix,
 *   fixnet, llm, build, create, workflow, tokens, history, agent)
 *   need the plugin EXCEPT the Lucid-local ones: `fix` / `fixnet`
 *   run the local FixNet orchestrator, `workflow` reads local
 *   workflow status, and `history` reads Lucid's own conversation
 *   history — all main-process, no plugin.
 * - Help-only entries (kind 'lucid': github, env, install,
 *   daemon, ...) are plugin commands documented in Help; typed
 *   as `/github`, `/install`, ... they hit the plugin path.
 * - Multi-word commands stay only when they run locally: the
 *   FixNet phrases run the local orchestrator, `browser diagnose`
 *   reads the local browser service, `workflow status` reads
 *   local workflow state, and `history` / `clear history` read
 *   and clear Lucid's own conversation history. `llm ...` needs
 *   the plugin like bare `/llm` does.
 */
export function requiresLuciferAI(entry: CommandCatalogueEntry): boolean {
  if (entry.kind === 'shell') return false;
  if (entry.kind === 'lucid') return true;
  if (entry.kind === 'luciferai') {
    // The Lucid-local single words run without the plugin.
    return !['fix', 'fixnet', 'workflow', 'history'].includes(entry.name);
  }
  // Multi-word: judge the slash form — only the local ones stay.
  const type = parseCommand(`/${entry.name}`).type;
  return (
    type !== 'fixnet' &&
    type !== 'browser' &&
    type !== 'workflow' &&
    type !== 'history'
  );
}
