/**
 * Warp-Style Command Router for LuciferAI
 * Routes /commands and auto-routes unrecognized input to /agent
 */

export type CommandType = 
  | 'help'
  | 'plan'
  | 'fix'
  | 'fixnet'
  | 'llm'
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

// Shell commands that should be executed directly (not routed to agent)
const SHELL_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'touch',
  'grep', 'find', 'which', 'whoami', 'date', 'clear', 'exit', 'git',
  'npm', 'node', 'python', 'python3', 'pip', 'pip3', 'cargo', 'go',
  'docker', 'kubectl', 'make', 'curl', 'wget', 'ssh', 'scp', 'tar',
  'zip', 'unzip', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du'
]);

// LuciferAI /commands (slash commands)
const LUCIFERAI_COMMANDS = new Set([
  'help', 'plan', 'fix', 'fixnet', 'llm', 'build', 'create', 
  'workflow', 'tokens', 'history', 'agent'
]);

/**
 * Parse user input and determine command type
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

  // Check for slash command (/command)
  if (trimmed.startsWith('/')) {
    return parseSlashCommand(trimmed);
  }

  // Check for direct LuciferAI commands (without slash)
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  
  // Check if it's a shell command
  if (SHELL_COMMANDS.has(firstWord)) {
    return {
      type: 'shell',
      command: firstWord,
      args: trimmed.split(/\s+/).slice(1),
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }

  // Check if it's a LuciferAI command (without slash)
  if (LUCIFERAI_COMMANDS.has(firstWord)) {
    const args = trimmed.split(/\s+/).slice(1);
    
    // Special case: "help" command shows help panel
    if (firstWord === 'help') {
      return {
        type: 'help',
        command: 'help',
        args: [],
        raw: input,
        isSlashCommand: false,
        shouldShowHelp: true
      };
    }
    
    return {
      type: firstWord as CommandType,
      command: firstWord,
      args,
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }

  // Check for multi-word LuciferAI commands
  const twoWords = trimmed.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
  if (twoWords === 'fixnet stats' || twoWords === 'fixnet search') {
    return {
      type: 'fixnet',
      command: 'fixnet',
      args: trimmed.split(/\s+/).slice(1),
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }
  
  if (twoWords === 'llm list' || twoWords === 'llm status' || 
      twoWords === 'llm enable' || twoWords === 'llm disable') {
    return {
      type: 'llm',
      command: 'llm',
      args: trimmed.split(/\s+/).slice(1),
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }
  
  if (twoWords === 'workflow status') {
    return {
      type: 'workflow',
      command: 'workflow',
      args: ['status'],
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }
  
  if (twoWords === 'clear history') {
    return {
      type: 'history',
      command: 'history',
      args: ['clear'],
      raw: input,
      isSlashCommand: false,
      shouldShowHelp: false
    };
  }

  // Default: route to agent (natural language)
  return {
    type: 'agent',
    command: 'agent',
    args: [trimmed],
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
      return `❓ Unknown command: "${parsed.raw}"\n\n💡 Did you mean: ${suggestion}\n\nTry: help for available commands`;
    }
    return `❓ Unknown command: "${parsed.raw}"\n\n💡 This might be a natural language query that requires the LuciferAI plugin.\n\nWithout LuciferAI, try shell commands like: ls, pwd, git, npm, etc.\n\nTry: help for available commands`;
  }
  
  return `⚠️  LuciferAI Plugin Required\n\nThe "${parsed.command}" command requires the LuciferAI backend.\n\nTo enable AI features:\n1. Start: python3 LUCID-BACKEND/core/stdio_agent.py\n2. Terminal will auto-reconnect in 30 seconds\n\nThe terminal works in standalone mode with shell commands.`;
}
