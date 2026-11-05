/**
 * FixNet canonical command table — the ONE source of truth for what
 * FixNet commands exist.
 *
 * The three command lists (commandRegistry, helpGrammar, intentParser
 * DIRECT_COMMANDS) used to disagree about FixNet: the registry had
 * sync/stats/search, the help surfaces had fix/stats/search, and the
 * deterministic grammar had no FixNet commands at all. Every surface
 * now reads from this table:
 *   - commandRegistry registers from it,
 *   - intentParser builds its DIRECT_COMMANDS from it,
 *   - the renderer command router matches against it,
 *   - the help surfaces (commandDisplay, helpData) list from it.
 *
 * FixNet is LOCAL until online (Gary, 2026-11-04). There is no
 * `fixnet sync` command: sharing comes later with the causal cloud
 * sync, and its design is open — Gary will explain it when the time
 * comes. Nothing here claims sync exists, and no sync code may claim
 * to implement it.
 *
 * Trust bands (Gary, 2026-11-04): Highly Trusted ≥75%, Trusted 51–74%,
 * Experimental 30–50%, Quarantined <30%. Auto-apply (a fix the system
 * writes to a file without being asked) requires ≥90% consensus.
 */

export interface FixnetCommandDef {
  /** Full command name, e.g. 'fixnet stats'. Matched longest-first. */
  name: string;
  usage: string;
  description: string;
  /** Registry category (the `fix` command lives under Developer Tools). */
  category: 'FixNet Commands' | 'Developer Tools';
  /** True when generating a NEW fix needs a model (Tier 2). Offline
   * lookup never needs one. */
  requiresLLM: boolean;
  tier?: number;
  /** True when the command needs no internet (all FixNet commands are
   * local-only, so all are true). */
  offline: boolean;
  examples: string[];
}

export const FIXNET_COMMANDS: FixnetCommandDef[] = [
  {
    name: 'fix',
    usage: 'fix <file|error>',
    description:
      'Auto-fix errors: offline dictionary lookup first; a missing-import ' +
      'pattern fix next; the model (Tier 2) generates a new fix only when ' +
      'nothing matches. Takes a file path or an error message.',
    category: 'Developer Tools',
    requiresLLM: true,
    tier: 2,
    offline: true,
    examples: [
      'fix broken_script.py',
      'fix ModuleNotFoundError: No module named requests',
    ],
  },
  {
    name: 'fixnet stats',
    usage: 'fixnet stats',
    description: 'Show FixNet statistics (measured from the local dictionary)',
    category: 'FixNet Commands',
    requiresLLM: false,
    offline: true,
    examples: ['fixnet stats'],
  },
  {
    name: 'fixnet search',
    usage: 'fixnet search <query>',
    description: 'Search the local FixNet dictionary for matching fixes',
    category: 'FixNet Commands',
    requiresLLM: false,
    offline: true,
    examples: [
      'fixnet search NameError',
      'fixnet search "import not found"',
    ],
  },
  {
    name: 'fixnet report',
    usage: 'fixnet report <fix_hash> <success|failure>',
    description:
      'Record whether a served fix actually worked; drives the consensus ' +
      'success rate and trust level',
    category: 'FixNet Commands',
    requiresLLM: false,
    offline: true,
    examples: ['fixnet report abc123 success'],
  },
  {
    name: 'fixnet apply',
    usage: 'fixnet apply <fix_hash> [file]',
    description:
      'Apply a stored fix to a file and verify it by re-running; records ' +
      'the outcome. The file defaults to the one stored with the fix.',
    category: 'FixNet Commands',
    requiresLLM: false,
    offline: true,
    examples: ['fixnet apply abc123 script.py'],
  },
  {
    name: 'fixnet delete',
    usage: 'fixnet delete <fix_hash>',
    description: 'Delete a stored fix from the local dictionary',
    category: 'FixNet Commands',
    requiresLLM: false,
    offline: true,
    examples: ['fixnet delete abc123'],
  },
];

/** Command names, longest first (so 'fixnet search' beats 'fixnet'). */
export const FIXNET_COMMAND_NAMES: string[] = FIXNET_COMMANDS.map(
  (c) => c.name
).sort((a, b) => b.length - a.length);

/**
 * FixNet commands that the intent parser treats as direct commands
 * (no LLM, no fix_request routing). `fix` itself is NOT here — it
 * parses as a fix_request so the error text / file path is extracted.
 */
export const FIXNET_DIRECT_COMMANDS: string[] = [
  'fixnet stats',
  'fixnet search',
  'fixnet report',
  'fixnet apply',
  'fixnet delete',
  // Recognised but unavailable: typing it must answer honestly instead
  // of being misread as a fix request for an empty error.
  'fixnet sync',
];

/**
 * Match the longest FixNet command name at the start of `input`
 * (case-insensitive). Returns the matched definition plus the
 * remainder of the input, or null when nothing matches.
 */
export function matchFixnetCommand(input: string): {
  command: FixnetCommandDef;
  rest: string;
} | null {
  const lower = input.trim().toLowerCase();
  for (const command of FIXNET_COMMANDS) {
    const name = command.name;
    if (lower === name) return { command, rest: '' };
    if (lower.startsWith(`${name} `)) {
      return { command, rest: input.trim().slice(name.length).trim() };
    }
  }
  return null;
}

/**
 * What `fixnet sync` answers. FixNet is local-only: fixes never leave
 * this machine. Sharing is the causal cloud sync — Gary's term, design
 * open, to be explained later. This message must stay honest: it
 * promises nothing that does not exist.
 */
export const FIXNET_SYNC_UNAVAILABLE =
  'FixNet is local-only right now — fixes are stored on this machine ' +
  'and never leave it. Sharing comes later with the causal cloud sync. ' +
  "There is no sync to run yet, so 'fixnet sync' does nothing.";
