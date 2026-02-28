/**
 * Help Grammar System - Deterministic Command Definitions
 * 
 * This is the source of truth for all commands supported by Lucid Terminal.
 * NO LLM DEPENDENCY - completely deterministic and testable.
 */

export interface CommandParam {
  name: string;
  type: 'string' | 'number' | 'path' | 'flag' | 'optional';
  description: string;
  required: boolean;
}

export interface CommandDefinition {
  name: string;
  aliases: string[];
  category: 'system' | 'file' | 'navigation' | 'process' | 'help' | 'script' | 'model' | 'fixnet' | 'session' | 'environment' | 'github' | 'package' | 'build';
  description: string;
  usage: string;
  params: CommandParam[];
  examples: string[];
  handler: string; // Handler function name
  requiresPath?: boolean;
  dangerous?: boolean;
  requiresInternet?: boolean;
  requiresLLM?: boolean;
}

/**
 * Complete command registry - all supported commands
 * This is what makes the terminal work WITHOUT LLM
 */
export const COMMAND_REGISTRY: CommandDefinition[] = [
  // ════════════════════════════════════════════════════════════════
  // SYSTEM COMMANDS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'help',
    aliases: ['?', 'man'],
    category: 'help',
    description: 'Show help for commands',
    usage: 'help [command]',
    params: [
      {
        name: 'command',
        type: 'optional',
        description: 'Specific command to get help for',
        required: false
      }
    ],
    examples: [
      'help',
      'help cd',
      'help ls'
    ],
    handler: 'handleHelp'
  },
  
  {
    name: 'clear',
    aliases: ['cls'],
    category: 'system',
    description: 'Clear the terminal screen',
    usage: 'clear',
    params: [],
    examples: ['clear'],
    handler: 'handleClear'
  },
  
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    category: 'system',
    description: 'Exit the terminal',
    usage: 'exit',
    params: [],
    examples: ['exit'],
    handler: 'handleExit'
  },
  
  {
    name: 'version',
    aliases: ['ver', 'v'],
    category: 'system',
    description: 'Show Lucid Terminal version',
    usage: 'version',
    params: [],
    examples: ['version'],
    handler: 'handleVersion'
  },
  
  // ════════════════════════════════════════════════════════════════
  // NAVIGATION COMMANDS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'cd',
    aliases: ['chdir'],
    category: 'navigation',
    description: 'Change current directory',
    usage: 'cd <path>',
    params: [
      {
        name: 'path',
        type: 'path',
        description: 'Directory to navigate to',
        required: true
      }
    ],
    examples: [
      'cd /Users',
      'cd ..',
      'cd ~',
      'cd ~/Documents'
    ],
    handler: 'handleCd',
    requiresPath: true
  },
  
  {
    name: 'pwd',
    aliases: [],
    category: 'navigation',
    description: 'Print working directory',
    usage: 'pwd',
    params: [],
    examples: ['pwd'],
    handler: 'handlePwd'
  },
  
  // ════════════════════════════════════════════════════════════════
  // FILE COMMANDS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'ls',
    aliases: ['dir', 'list'],
    category: 'file',
    description: 'List directory contents',
    usage: 'ls [path] [flags]',
    params: [
      {
        name: 'path',
        type: 'optional',
        description: 'Directory to list (defaults to current)',
        required: false
      },
      {
        name: '-a',
        type: 'flag',
        description: 'Show hidden files',
        required: false
      },
      {
        name: '-l',
        type: 'flag',
        description: 'Long format',
        required: false
      }
    ],
    examples: [
      'ls',
      'ls -a',
      'ls -l',
      'ls /Users',
      'ls -la ~'
    ],
    handler: 'handleLs'
  },
  
  {
    name: 'cat',
    aliases: ['type', 'read'],
    category: 'file',
    description: 'Display file contents',
    usage: 'cat <file>',
    params: [
      {
        name: 'file',
        type: 'path',
        description: 'File to display',
        required: true
      }
    ],
    examples: [
      'cat README.md',
      'cat package.json'
    ],
    handler: 'handleCat',
    requiresPath: true
  },
  
  {
    name: 'mkdir',
    aliases: ['md'],
    category: 'file',
    description: 'Create a new directory',
    usage: 'mkdir <name>',
    params: [
      {
        name: 'name',
        type: 'string',
        description: 'Name of directory to create',
        required: true
      }
    ],
    examples: [
      'mkdir newfolder',
      'mkdir "my folder"'
    ],
    handler: 'handleMkdir'
  },
  
  {
    name: 'touch',
    aliases: ['create'],
    category: 'file',
    description: 'Create a new file',
    usage: 'touch <filename>',
    params: [
      {
        name: 'filename',
        type: 'string',
        description: 'Name of file to create',
        required: true
      }
    ],
    examples: [
      'touch newfile.txt',
      'touch script.py'
    ],
    handler: 'handleTouch'
  },
  
  {
    name: 'rm',
    aliases: ['del', 'delete'],
    category: 'file',
    description: 'Remove a file or directory',
    usage: 'rm <path> [-r]',
    params: [
      {
        name: 'path',
        type: 'path',
        description: 'File or directory to remove',
        required: true
      },
      {
        name: '-r',
        type: 'flag',
        description: 'Recursive (for directories)',
        required: false
      }
    ],
    examples: [
      'rm file.txt',
      'rm -r folder'
    ],
    handler: 'handleRm',
    requiresPath: true,
    dangerous: true
  },
  
  {
    name: 'cp',
    aliases: ['copy'],
    category: 'file',
    description: 'Copy a file or directory',
    usage: 'cp <source> <destination>',
    params: [
      {
        name: 'source',
        type: 'path',
        description: 'Source file or directory',
        required: true
      },
      {
        name: 'destination',
        type: 'path',
        description: 'Destination path',
        required: true
      }
    ],
    examples: [
      'cp file.txt backup.txt',
      'cp -r folder newfolder'
    ],
    handler: 'handleCp',
    requiresPath: true
  },
  
  {
    name: 'mv',
    aliases: ['move', 'rename'],
    category: 'file',
    description: 'Move or rename a file/directory',
    usage: 'mv <source> <destination>',
    params: [
      {
        name: 'source',
        type: 'path',
        description: 'Source file or directory',
        required: true
      },
      {
        name: 'destination',
        type: 'path',
        description: 'Destination path',
        required: true
      }
    ],
    examples: [
      'mv oldname.txt newname.txt',
      'mv file.txt /Users/Documents/'
    ],
    handler: 'handleMv',
    requiresPath: true
  },
  
  // ════════════════════════════════════════════════════════════════
  // PROCESS COMMANDS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'ps',
    aliases: ['processes'],
    category: 'process',
    description: 'List running processes',
    usage: 'ps',
    params: [],
    examples: ['ps'],
    handler: 'handlePs'
  },
  
  {
    name: 'kill',
    aliases: ['stop'],
    category: 'process',
    description: 'Kill a process by PID',
    usage: 'kill <pid>',
    params: [
      {
        name: 'pid',
        type: 'number',
        description: 'Process ID to kill',
        required: true
      }
    ],
    examples: [
      'kill 1234'
    ],
    handler: 'handleKill',
    dangerous: true
  },
  
  // ════════════════════════════════════════════════════════════════
  // ADDITIONAL FILE OPERATIONS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'find',
    aliases: ['search'],
    category: 'file',
    description: 'Search for files matching a pattern',
    usage: 'find <pattern>',
    params: [
      {
        name: 'pattern',
        type: 'string',
        description: 'File pattern to search (supports wildcards)',
        required: true
      }
    ],
    examples: [
      'find *.py',
      'find test*.js',
      'find README*'
    ],
    handler: 'handleFind'
  },
  
  {
    name: 'open',
    aliases: [],
    category: 'file',
    description: 'Open file with default application',
    usage: 'open <file>',
    params: [
      {
        name: 'file',
        type: 'path',
        description: 'File to open',
        required: true
      }
    ],
    examples: [
      'open document.pdf',
      'open image.png'
    ],
    handler: 'handleOpen',
    requiresPath: true
  },
  
  // ════════════════════════════════════════════════════════════════
  // SCRIPT OPERATIONS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'run',
    aliases: ['execute'],
    category: 'script',
    description: 'Execute a script file',
    usage: 'run <script>',
    params: [
      {
        name: 'script',
        type: 'path',
        description: 'Script file to execute',
        required: true
      }
    ],
    examples: [
      'run test.py',
      'run script.js'
    ],
    handler: 'handleRun',
    requiresPath: true
  },
  
  {
    name: 'fix',
    aliases: [],
    category: 'script',
    description: 'Auto-fix errors in a script',
    usage: 'fix <script>',
    params: [
      {
        name: 'script',
        type: 'path',
        description: 'Script file to fix',
        required: true
      }
    ],
    examples: [
      'fix broken.py',
      'fix script.js'
    ],
    handler: 'handleFix',
    requiresPath: true
  },
  
  {
    name: 'autofix',
    aliases: [],
    category: 'script',
    description: 'Apply consensus fixes automatically',
    usage: 'autofix <target>',
    params: [
      {
        name: 'target',
        type: 'path',
        description: 'File or directory to autofix',
        required: true
      }
    ],
    examples: [
      'autofix myproject/',
      'autofix script.py'
    ],
    handler: 'handleAutofix',
    requiresPath: true
  },
  
  // ════════════════════════════════════════════════════════════════
  // MODEL MANAGEMENT
  // ════════════════════════════════════════════════════════════════
  {
    name: 'llm',
    aliases: ['model'],
    category: 'model',
    description: 'Manage LLM models',
    usage: 'llm <subcommand> [args]',
    params: [
      {
        name: 'subcommand',
        type: 'string',
        description: 'list | enable | disable | info',
        required: true
      }
    ],
    examples: [
      'llm list',
      'llm enable mistral',
      'llm disable tinyllama',
      'llm info'
    ],
    handler: 'handleLLM'
  },
  
  {
    name: 'install',
    aliases: [],
    category: 'model',
    description: 'Install models or packages',
    usage: 'install <target>',
    params: [
      {
        name: 'target',
        type: 'string',
        description: 'Model name, tier, or package',
        required: true
      }
    ],
    examples: [
      'install mistral',
      'install tier 2',
      'install core models',
      'install requests'
    ],
    handler: 'handleInstall',
    requiresInternet: true
  },
  
  {
    name: 'models',
    aliases: [],
    category: 'model',
    description: 'Show model information',
    usage: 'models <subcommand>',
    params: [
      {
        name: 'subcommand',
        type: 'string',
        description: 'info | backup',
        required: false
      }
    ],
    examples: [
      'models info',
      'models backup'
    ],
    handler: 'handleModels'
  },
  
  // ════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ════════════════════════════════════════════════════════════════
  {
    name: 'session',
    aliases: [],
    category: 'session',
    description: 'Manage terminal sessions',
    usage: 'session <subcommand> [args]',
    params: [
      {
        name: 'subcommand',
        type: 'string',
        description: 'list | open | info | stats',
        required: true
      }
    ],
    examples: [
      'session list',
      'session open 123',
      'session info',
      'session stats'
    ],
    handler: 'handleSession'
  },
  
  // ════════════════════════════════════════════════════════════════
  // ENVIRONMENT MANAGEMENT
  // ════════════════════════════════════════════════════════════════
  {
    name: 'environments',
    aliases: ['envs', 'env'],
    category: 'environment',
    description: 'List all virtual environments',
    usage: 'environments',
    params: [],
    examples: [
      'environments',
      'envs'
    ],
    handler: 'handleEnvironments'
  },
  
  {
    name: 'activate',
    aliases: [],
    category: 'environment',
    description: 'Activate a virtual environment',
    usage: 'activate <env>',
    params: [
      {
        name: 'env',
        type: 'string',
        description: 'Environment name',
        required: true
      }
    ],
    examples: [
      'activate myproject'
    ],
    handler: 'handleActivate'
  },
  
  // ════════════════════════════════════════════════════════════════
  // GITHUB INTEGRATION
  // ════════════════════════════════════════════════════════════════
  {
    name: 'github',
    aliases: ['gh'],
    category: 'github',
    description: 'GitHub integration commands',
    usage: 'github <subcommand> [args]',
    params: [
      {
        name: 'subcommand',
        type: 'string',
        description: 'link | status | projects | upload | update | sync',
        required: true
      }
    ],
    examples: [
      'github link',
      'github status',
      'github projects',
      'github upload myproject'
    ],
    handler: 'handleGithub',
    requiresInternet: true
  },
  
  // ════════════════════════════════════════════════════════════════
  // BUILD & CREATE COMMANDS
  // ════════════════════════════════════════════════════════════════
  {
    name: 'create',
    aliases: ['new'],
    category: 'build',
    description: 'Create new files/folders',
    usage: 'create <type> <name>',
    params: [
      {
        name: 'type',
        type: 'string',
        description: 'file | folder',
        required: true
      },
      {
        name: 'name',
        type: 'string',
        description: 'Name of file/folder',
        required: true
      }
    ],
    examples: [
      'create file script.py',
      'create folder myproject'
    ],
    handler: 'handleCreate'
  },
  
  {
    name: 'generate',
    aliases: [],
    category: 'build',
    description: 'Generate code from templates',
    usage: 'generate <type>',
    params: [
      {
        name: 'type',
        type: 'string',
        description: 'Template type',
        required: true
      }
    ],
    examples: [
      'generate flask app',
      'generate react component'
    ],
    handler: 'handleGenerate',
    requiresLLM: true
  },
  
  // ════════════════════════════════════════════════════════════════
  // TESTING & VALIDATION
  // ════════════════════════════════════════════════════════════════
  {
    name: 'test',
    aliases: [],
    category: 'system',
    description: 'Run tests on models or system',
    usage: 'test [model]',
    params: [
      {
        name: 'model',
        type: 'optional',
        description: 'Model to test (optional)',
        required: false
      }
    ],
    examples: [
      'test',
      'test mistral',
      'test all'
    ],
    handler: 'handleTest'
  },
  
  // ════════════════════════════════════════════════════════════════
  // SYSTEM INFO
  // ════════════════════════════════════════════════════════════════
  {
    name: 'info',
    aliases: ['system'],
    category: 'system',
    description: 'Show system diagnostics',
    usage: 'info',
    params: [],
    examples: ['info', 'system'],
    handler: 'handleInfo'
  },
  
  {
    name: 'memory',
    aliases: [],
    category: 'system',
    description: 'Show conversation memory',
    usage: 'memory',
    params: [],
    examples: ['memory'],
    handler: 'handleMemory'
  }
];

/**
 * Command lookup map for O(1) access
 */
export const COMMAND_MAP = new Map<string, CommandDefinition>();

// Build command map (including aliases)
for (const cmd of COMMAND_REGISTRY) {
  COMMAND_MAP.set(cmd.name, cmd);
  for (const alias of cmd.aliases) {
    COMMAND_MAP.set(alias, cmd);
  }
}

/**
 * Get command definition by name or alias
 */
export function getCommand(name: string): CommandDefinition | undefined {
  return COMMAND_MAP.get(name.toLowerCase());
}

/**
 * Get all commands in a category
 */
export function getCommandsByCategory(category: string): CommandDefinition[] {
  return COMMAND_REGISTRY.filter(cmd => cmd.category === category);
}

/**
 * Get all command names (including aliases)
 */
export function getAllCommandNames(): string[] {
  const names: string[] = [];
  for (const cmd of COMMAND_REGISTRY) {
    names.push(cmd.name);
    names.push(...cmd.aliases);
  }
  return names;
}

/**
 * Format help text for a command
 */
export function formatCommandHelp(cmd: CommandDefinition): string {
  let help = `\n${cmd.name}`;
  
  if (cmd.aliases.length > 0) {
    help += ` (aliases: ${cmd.aliases.join(', ')})`;
  }
  
  help += `\n  ${cmd.description}\n`;
  help += `\n  Usage: ${cmd.usage}\n`;
  
  if (cmd.params.length > 0) {
    help += `\n  Parameters:\n`;
    for (const param of cmd.params) {
      const req = param.required ? 'required' : 'optional';
      help += `    ${param.name} (${param.type}, ${req}): ${param.description}\n`;
    }
  }
  
  if (cmd.examples.length > 0) {
    help += `\n  Examples:\n`;
    for (const example of cmd.examples) {
      help += `    $ ${example}\n`;
    }
  }
  
  if (cmd.dangerous) {
    help += `\n  ⚠️  WARNING: This command can be destructive\n`;
  }
  
  return help;
}

/**
 * Format help index (all commands)
 */
export function formatHelpIndex(): string {
  let help = '\nLucid Terminal - Available Commands\n';
  help += '═══════════════════════════════════════\n\n';
  
  const categories = [
    'system', 'navigation', 'file', 'process', 'script',
    'model', 'session', 'environment', 'github', 'build', 'help'
  ];
  
  for (const category of categories) {
    const cmds = getCommandsByCategory(category);
    if (cmds.length === 0) continue;
    
    help += `${category.toUpperCase()}:\n`;
    for (const cmd of cmds) {
      const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      help += `  ${cmd.name}${aliases} - ${cmd.description}\n`;
    }
    help += '\n';
  }
  
  help += 'Type "help <command>" for more information on a specific command.\n';
  
  return help;
}
