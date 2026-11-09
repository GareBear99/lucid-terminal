/**
 * Warp-Style Command Router for LuciferAI
 *
 * REAL TERMINAL (Gary, 2026-11-07: "terminal is not a terminal at
 * all"): bare words typed at the prompt go to the SHELL, always.
 * The router no longer intercepts them — `history` is zsh history,
 * `help` is the shell's help, `clear` clears the screen. Lucid
 * commands are EXPLICIT slash commands (`/fix`, `/llm`, `/help`,
 * ...) or nothing at all. The old dispatcher — which parsed every
 * submission, routed LuciferAI words to the plugin, and sent only
 * the leftovers to the shell — is retired as gatekeeper.
 *
 * parseCommand therefore has exactly two outcomes:
 * - input starts with '/' -> a Lucid slash command (or an agent
 *   query for an unknown slash word);
 * - anything else -> type 'shell', the whole line verbatim.
 */

export type CommandType =
  | 'help'
  | 'plan'
  | 'fix'
  | 'fixnet'
  | 'llm'
  | 'browser'
  | 'build'
  | 'create'
  | 'workflow'
  | 'tokens'
  | 'history'
  | 'install'
  | 'github'
  | 'env'
  | 'daemon'
  | 'agent'
  | 'devmode'
  | 'defcon'
  | 'shell'
  | 'unknown';

export interface ParsedCommand {
  type: CommandType;
  command: string;
  args: string[];
  raw: string;
  isSlashCommand: boolean;
  shouldShowHelp: boolean;
  suggestion?: string; // For typo correction
  requiresLLM?: boolean; // True if command needs LuciferAI
  canFallbackToShell?: boolean; // True if can try shell as fallback
}

// Shell commands that should be executed directly (not routed to agent).
// Kept for the Settings catalogue (src/data/commands.ts), which lists
// them as the shell surface — the router itself no longer needs the
// set, because EVERY bare word is a shell command now.
export const SHELL_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'touch',
  'grep', 'find', 'which', 'whoami', 'date', 'clear', 'exit', 'git',
  'npm', 'node', 'python', 'python3', 'pip', 'pip3', 'cargo', 'go',
  'docker', 'kubectl', 'make', 'curl', 'wget', 'ssh', 'scp', 'tar',
  'zip', 'unzip', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du'
]);

// Lucid slash commands (the words after the '/'). Bare words are
// NEVER these: typing `llm` at the prompt runs the shell's `llm`
// (command not found), and only `/llm` reaches Lucid. This set is
// the catalogue's LuciferAI surface and the slash parser's dispatch
// table — it is not a bare-word intercept list any more.
export const LUCIFERAI_COMMANDS = new Set([
  'help', 'plan', 'fix', 'fixnet', 'llm', 'build', 'create',
  'workflow', 'tokens', 'history', 'agent'
]);

/**
 * Multi-word slash commands, matched as a phrase BEFORE the
 * single-word dispatch: the old code checked the single first word
 * first, so 'fixnet stats' returned command='fixnet' (the first
 * word only) and the Terminal's `parsed.command === 'fixnet stats'`
 * branch could never match — every direct-IPC branch in the
 * Terminal was dead. The full matched phrase is the command now.
 *
 * `command` / `args` override the defaults (command = the phrase,
 * args = the words after it) for the two phrases whose Terminal
 * branch expects a fixed shape.
 *
 * These phrases are matched WITHOUT the leading slash (the slash
 * parser strips it first) and are invoked WITH it: `/fixnet stats`,
 * `/llm list`, `/browser diagnose`, `/workflow status`,
 * `/history clear`.
 */
export interface MultiWordCommand {
  phrase: string;
  type: CommandType;
  command?: string;
  args?: string[];
}

export const MULTI_WORD_COMMANDS: MultiWordCommand[] = [
  { phrase: 'fixnet stats', type: 'fixnet' },
  { phrase: 'fixnet search', type: 'fixnet' },
  { phrase: 'fixnet report', type: 'fixnet' },
  { phrase: 'fixnet apply', type: 'fixnet' },
  { phrase: 'fixnet delete', type: 'fixnet' },
  { phrase: 'fixnet sync', type: 'fixnet' },
  { phrase: 'llm list', type: 'llm' },
  { phrase: 'llm status', type: 'llm' },
  { phrase: 'llm enable', type: 'llm' },
  { phrase: 'llm disable', type: 'llm' },
  // `browser diagnose` — where the active BrowserView is attached,
  // its bounds, and a screenshot of what the page actually renders.
  { phrase: 'browser diagnose', type: 'browser' },
  { phrase: 'workflow status', type: 'workflow', command: 'workflow', args: ['status'] },
  { phrase: 'clear history', type: 'history', command: 'history', args: ['clear'] },
];

/**
 * Parse user input and determine command type.
 *
 * Slash input (`/...`) is a Lucid command. Anything else is a shell
 * command — the router does not inspect it, does not rewrite it,
 * and does not route it anywhere else. That is the whole point of
 * the real terminal: the shell decides what a bare word means.
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  // Empty input
  if (!trimmed) {
    return {
      type: 'unknown',
      command: '',
      args: [],
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }

  // Slash command (/command) — the ONLY Lucid invocation.
  if (trimmed.startsWith('/')) {
    return parseSlashCommand(trimmed);
  }

  // Bare words go to the shell, always. No intercept, no rewrite,
  // no agent fallback: `history` is zsh history, `help` is the
  // shell's help, `llm` is "command not found", and a natural
  // sentence is the shell's problem too.
  const words = trimmed.split(/\s+/);
  return {
    type: 'shell',
    command: words[0].toLowerCase(),
    args: words.slice(1),
    raw: input,
    isSlashCommand: false,
    shouldShowHelp: false
  };
}

/**
 * Parse slash command
 */
function parseSlashCommand(input: string): ParsedCommand {
  const withoutSlash = input.slice(1).trim();
  const parts = withoutSlash.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Multi-word slash commands FIRST — matched as a phrase from
  // MULTI_WORD_COMMANDS, before the single-word dispatch.
  // `/fixnet stats`, `/llm list`, `/browser diagnose`,
  // `/workflow status` all land here.
  const twoWords = parts.slice(0, 2).join(' ').toLowerCase();
  const multiWord = MULTI_WORD_COMMANDS.find((m) => m.phrase === twoWords);
  if (multiWord) {
    return {
      type: multiWord.type,
      command: multiWord.command ?? twoWords,
      args: multiWord.args ?? parts.slice(2),
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // `/history clear` — the clear form of the history command. The
  // phrase table holds 'clear history' (the old bare form); the
  // slash form spells it the other way round.
  if (command === 'history' && args[0]?.toLowerCase() === 'clear') {
    return {
      type: 'history',
      command: 'history',
      args: ['clear'],
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Help command
  if (command === 'help' || command === 'h' || command === '?') {
    return {
      type: 'help',
      command: 'help',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: true
    };
  }

  // Plan command
  if (command === 'plan' || command === 'p') {
    return {
      type: 'plan',
      command: 'plan',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Fix command
  if (command === 'fix' || command === 'f') {
    return {
      type: 'fix',
      command: 'fix',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // FixNet commands
  if (command === 'fixnet' || command === 'fn') {
    return {
      type: 'fixnet',
      command: 'fixnet',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // LLM/Model commands
  if (command === 'llm' || command === 'model' || command === 'm') {
    return {
      type: 'llm',
      command: 'llm',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Browser commands
  if (command === 'browser') {
    return {
      type: 'browser',
      command: 'browser',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Build/Create commands
  if (command === 'build' || command === 'b') {
    return {
      type: 'build',
      command: 'build',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  if (command === 'create' || command === 'c') {
    return {
      type: 'create',
      command: 'create',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Workflow commands
  if (command === 'workflow' || command === 'wf' || command === 'w') {
    return {
      type: 'workflow',
      command: 'workflow',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Token stats
  if (command === 'tokens' || command === 't') {
    return {
      type: 'tokens',
      command: 'tokens',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // History
  if (command === 'history' || command === 'hist') {
    return {
      type: 'history',
      command: 'history',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // GitHub / environment / install / daemon — Help-documented Lucid
  // commands that run through LucidCore (the plugin when it needs a
  // model). They used to be bare words parsed as 'agent'; now they
  // are slash-only, like every other Lucid command.
  if (command === 'github') {
    return {
      type: 'github',
      command: 'github',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  if (command === 'env' || command === 'environments') {
    return {
      type: 'env',
      command: 'env',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  if (command === 'install') {
    return {
      type: 'install',
      command: 'install',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  if (command === 'daemon') {
    return {
      type: 'daemon',
      command: 'daemon',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Dev mode (Gary, 2026-11-07) — `/devmode on|off`. Lucid-local,
  // like fix/fixnet/workflow/history: it flips the `devMode`
  // setting, so it runs with LuciferAI on OR off. ON delinks the
  // prompt bar from the terminal screen (detached command bar +
  // dev console); OFF re-syncs them into one input topology.
  if (command === 'devmode') {
    return {
      type: 'devmode',
      command: 'devmode',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // DEFCON (Gary, 2026-11-09) — `/defcon`, `/defcon 1|2|3`,
  // `/defcon merge a|b|c`. Lucid-local, like devmode: it reads
  // and sets the `defconLevel` setting, so it runs with
  // LuciferAI on OR off, in devmode or not. The levels take
  // effect in NON-devmode (the main Warp-style terminal) — that
  // is the point; devmode is where they were understood.
  if (command === 'defcon') {
    return {
      type: 'defcon',
      command: 'defcon',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Agent command (explicit)
  if (command === 'agent' || command === 'ai' || command === 'ask') {
    return {
      type: 'agent',
      command: 'agent',
      args,
      raw: input,
      isSlashCommand: true,
      shouldShowHelp: false
    };
  }

  // Unknown slash command → treat as agent query
  return {
    type: 'agent',
    command: 'agent',
    args: [withoutSlash],
    raw: input,
    isSlashCommand: true,
    shouldShowHelp: false
  };
}

/**
 * Format command for display in terminal
 */
export function formatCommandDisplay(parsed: ParsedCommand): string {
  if (parsed.isSlashCommand) {
    return `/${parsed.command}${parsed.args.length > 0 ? ' ' + parsed.args.join(' ') : ''}`;
  }
  return parsed.raw;
}

/**
 * Get command description for status display
 */
export function getCommandDescription(type: CommandType): string {
  switch (type) {
    case 'help':
      return 'Opening help panel...';
    case 'plan':
      return 'Opening planning panel...';
    case 'fix':
      return 'Searching FixNet for solutions...';
    case 'fixnet':
      return 'Querying offline fix database...';
    case 'llm':
      return 'Managing AI models...';
    case 'build':
      return 'Building script with AI...';
    case 'create':
      return 'Creating code with AI...';
    case 'workflow':
      return 'Checking workflow status...';
    case 'tokens':
      return 'Calculating token usage...';
    case 'history':
      return 'Loading conversation history...';
    case 'agent':
      return 'Routing to LuciferAI agent...';
    case 'devmode':
      return 'Toggling dev mode...';
    case 'defcon':
      return 'Reading or setting the DEFCON level...';
    case 'shell':
      return 'Executing shell command...';
    default:
      return 'Processing...';
  }
}

/**
 * Check if command should stream output
 */
export function shouldStreamOutput(type: CommandType): boolean {
  return type === 'agent' || type === 'build' || type === 'create';
}

/**
 * Get command examples for autocomplete
 */
export function getCommandExamples(prefix: string): string[] {
  const examples = [
    '/help',
    '/plan',
    '/fix ModuleNotFoundError',
    '/fixnet stats',
    '/llm list',
    '/build a Python script to sort CSV',
    '/create a React component',
    '/workflow status',
    '/tokens',
    '/history',
    '/devmode on',
    '/defcon',
    '/agent explain Docker containers'
  ];

  if (!prefix) return examples;

  const lower = prefix.toLowerCase();
  return examples.filter(ex => ex.toLowerCase().startsWith(lower));
}

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find closest command match using fuzzy matching
 */
export function findClosestCommand(input: string): string | null {
  const allCommands = [
    ...Array.from(SHELL_COMMANDS),
    ...Array.from(LUCIFERAI_COMMANDS),
    'fixnet stats', 'fixnet search', 'llm list', 'llm enable', 'llm disable',
    'workflow status', 'clear history', 'install', 'github', 'env', 'daemon'
  ];

  const firstWord = input.trim().split(/\s+/)[0].toLowerCase();
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const command of allCommands) {
    const distance = levenshteinDistance(firstWord, command.split(/\s+/)[0]);

    // Only suggest if distance is 1-2 (minor typo)
    if (distance > 0 && distance <= 2 && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = command;
    }
  }

  return bestMatch;
}

/**
 * Check if command requires LLM (LuciferAI plugin)
 */
export function requiresLLM(type: CommandType): boolean {
  return ['build', 'create', 'agent', 'install', 'github', 'env', 'daemon'].includes(type);
}

/**
 * Get fallback message when LLM not available
 */
export function getFallbackMessage(parsed: ParsedCommand): string {
  if (parsed.type === 'agent' || parsed.type === 'unknown') {
    const suggestion = findClosestCommand(parsed.raw);
    if (suggestion) {
      return `❓ Unknown command: "${parsed.raw}"\n\n💡 Did you mean: ${suggestion}\n\nTry: /help for available commands`;
    }
    return `❓ Unknown command: "${parsed.raw}"\n\n💡 This might be a natural language query that requires the LuciferAI plugin.\n\nWithout LuciferAI, try shell commands like: ls, pwd, git, npm, etc.\n\nTry: /help for available commands`;
  }

  return `⚠️  LuciferAI Plugin Required\n\nThe "${parsed.command}" command requires the LuciferAI backend.\n\nTo enable AI features:\n1. Start: python3 LUCID-BACKEND/core/stdio_agent.py\n2. Terminal will auto-reconnect in 30 seconds\n\nThe terminal works in standalone mode with shell commands.`;
}
