/**
 * LuciferAI Help Data - Warp-Style Compartmentalized Structure
 * Organized, searchable, and visually hierarchical
 */

import { MODEL_TIERS } from './tiers';

export interface HelpCommand {
  name: string;
  syntax: string;
  description: string;
  examples: string[];
  aliases?: string[];
  tags: string[];
}

export interface HelpCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  commands: HelpCommand[];
  stats?: {
    label: string;
    value: string;
  };
}

export const helpCategories: HelpCategory[] = [
  {
    id: 'direct',
    title: 'Direct Commands',
    description: 'Instant execution - no LLM needed',
    icon: '⚡',
    color: '#58a6ff',
    commands: [
      {
        name: 'ls',
        syntax: 'ls [path]',
        description: 'List files and directories',
        examples: [
          'ls',
          'ls /home/user',
          'ls -la'
        ],
        tags: ['filesystem', 'navigation', 'instant']
      },
      {
        name: 'cd',
        syntax: 'cd <path>',
        description: 'Change current directory',
        examples: [
          'cd /home/user',
          'cd ..',
          'cd ~'
        ],
        tags: ['filesystem', 'navigation', 'instant']
      },
      {
        name: 'pwd',
        syntax: 'pwd',
        description: 'Print working directory',
        examples: ['pwd'],
        tags: ['filesystem', 'instant']
      },
      {
        name: 'cat',
        syntax: 'cat <file>',
        description: 'Display file contents',
        examples: [
          'cat README.md',
          'cat package.json'
        ],
        tags: ['filesystem', 'file', 'instant']
      },
      {
        name: 'clear',
        syntax: 'clear',
        description: 'Clear terminal screen',
        examples: ['clear'],
        aliases: ['cls'],
        tags: ['terminal', 'instant']
      },
      {
        name: 'help',
        syntax: 'help',
        description: 'Show this help panel',
        examples: ['help'],
        tags: ['info', 'instant']
      },
      {
        name: 'exit',
        syntax: 'exit',
        description: 'Exit terminal session',
        examples: ['exit'],
        aliases: ['quit'],
        tags: ['terminal', 'instant']
      }
    ]
  },
  {
    id: 'planning',
    title: 'Planning',
    description: 'Create and track implementation plans',
    icon: '📋',
    color: '#58a6ff',
    commands: [
      {
        name: 'plan',
        syntax: '/plan',
        description: 'Open planning panel to manage implementation plans',
        examples: ['/plan', 'plan'],
        aliases: ['p'],
        tags: ['planning', 'project', 'track']
      }
    ]
  },
  {
    id: 'fixnet',
    title: 'FixNet Commands',
    description: 'Offline-first error fixing, local-only (no sync yet)',
    icon: '🔧',
    color: '#d29922',
    stats: {
      label: 'Offline Coverage',
      value: 'unmeasured'
    },
    commands: [
      {
        name: 'fix',
        syntax: 'fix <file|error>',
        description: 'Auto-fix a file or an error: offline lookup first, then the model (Tier 2) for new fixes',
        examples: [
          'fix broken_script.py',
          'fix ModuleNotFoundError',
          'fix TypeError: cannot read property',
          'fix EACCES permission denied',
          'fix npm ERR! code ENOENT'
        ],
        tags: ['error', 'debugging', 'offline', 'auto-fix']
      },
      {
        name: 'fixnet stats',
        syntax: 'fixnet stats',
        description: 'Show FixNet statistics and coverage',
        examples: ['fixnet stats'],
        tags: ['info', 'stats', 'offline']
      },
      {
        name: 'fixnet search',
        syntax: 'fixnet search <query>',
        description: 'Search offline fix dictionary',
        examples: [
          'fixnet search module',
          'fixnet search permission',
          'fixnet search npm'
        ],
        tags: ['search', 'offline', 'dictionary']
      },
      {
        name: 'fixnet report',
        syntax: 'fixnet report <fix_hash> <success|failure>',
        description: 'Record whether a served fix actually worked',
        examples: ['fixnet report abc123 success'],
        tags: ['info', 'stats', 'offline']
      },
      {
        name: 'fixnet apply',
        syntax: 'fixnet apply <fix_hash> [file]',
        description: 'Apply a stored fix to a file and verify it by re-running',
        examples: ['fixnet apply abc123 script.py'],
        tags: ['error', 'debugging', 'offline', 'auto-fix']
      },
      {
        name: 'fixnet delete',
        syntax: 'fixnet delete <fix_hash>',
        description: 'Delete a stored fix from the local dictionary',
        examples: ['fixnet delete abc123'],
        tags: ['info', 'offline', 'dictionary']
      }
    ]
  },
  {
    id: 'models',
    title: 'Model Management',
    description: 'Control AI backend models',
    icon: '🧠',
    color: '#79c0ff',
    commands: [
      {
        name: 'llm list',
        syntax: 'llm list',
        description: 'List all available models and their status',
        examples: ['llm list'],
        tags: ['models', 'info', 'ai']
      },
      {
        name: 'llm status',
        syntax: 'llm status',
        description: 'Show detailed status of all models',
        examples: ['llm status'],
        tags: ['models', 'info', 'ai', 'status']
      },
      {
        name: 'llm enable',
        syntax: 'llm enable <model>',
        description: 'Enable a specific model',
        examples: [
          'llm enable tinyllama',
          'llm enable mistral',
          'llm enable llama3.1:8b'
        ],
        tags: ['models', 'config', 'ai']
      },
      {
        name: 'llm disable',
        syntax: 'llm disable <model>',
        description: 'Disable a specific model',
        examples: [
          'llm disable tinyllama',
          'llm disable deepseek-coder:33b'
        ],
        tags: ['models', 'config', 'ai']
      }
    ]
  },
  {
    id: 'ai',
    title: 'AI Code Generation',
    description: 'Build scripts and code with AI',
    icon: '✨',
    color: '#3fb950',
    commands: [
      {
        name: 'build',
        syntax: 'build <description>',
        description: 'Generate a script from natural language',
        examples: [
          'build a Python script that sorts a CSV file',
          'build a bash script to backup my photos',
          'build a JavaScript function to validate emails'
        ],
        tags: ['ai', 'code-gen', 'script']
      },
      {
        name: 'create',
        syntax: 'create <description>',
        description: 'Create code, files, or projects',
        examples: [
          'create a Node.js API with Express',
          'create a React component for a user profile',
          'create a Dockerfile for a Python app'
        ],
        tags: ['ai', 'code-gen', 'project']
      }
    ]
  },
  {
    id: 'workflow',
    title: 'Workflow & System',
    description: 'Monitor and manage system state',
    icon: '⚙️',
    color: '#bc8cff',
    commands: [
      {
        name: 'workflow status',
        syntax: 'workflow status',
        description: 'Show complete workflow health and stats',
        examples: ['workflow status'],
        tags: ['info', 'stats', 'system']
      },
      {
        name: 'tokens',
        syntax: 'tokens',
        description: 'Display token usage statistics',
        examples: ['tokens'],
        tags: ['info', 'stats', 'ai', 'tokens']
      },
      {
        name: 'history',
        syntax: 'history',
        description: 'Show conversation history',
        examples: ['history'],
        tags: ['info', 'history']
      },
      {
        name: 'clear history',
        syntax: 'clear history',
        description: 'Clear conversation history',
        examples: ['clear history'],
        tags: ['history', 'clear']
      }
    ]
  },
  {
    id: 'github',
    title: 'GitHub Integration',
    description: 'Sync fixes and link your GitHub account',
    icon: '🐙',
    color: '#39c5cf',
    commands: [
      {
        name: 'github link',
        syntax: 'github link',
        description: 'Link your GitHub account for permanent ID',
        examples: ['github link'],
        tags: ['github', 'sync', 'account']
      },
      {
        name: 'github upload',
        syntax: 'github upload',
        description: 'Upload fixes to your GitHub repository',
        examples: ['github upload'],
        tags: ['github', 'upload', 'sync']
      },
      {
        name: 'github update',
        syntax: 'github update',
        description: 'Update fixes on GitHub',
        examples: ['github update'],
        tags: ['github', 'update', 'sync']
      },
      {
        name: 'github status',
        syntax: 'github status',
        description: 'Show GitHub sync status',
        examples: ['github status'],
        tags: ['github', 'status', 'info']
      },
      {
        name: 'github projects',
        syntax: 'github projects',
        description: 'List your GitHub projects',
        examples: ['github projects'],
        tags: ['github', 'projects', 'list']
      }
    ]
  },
  {
    id: 'environment',
    title: 'Environment Management',
    description: 'Manage development environments',
    icon: '🌍',
    color: '#84cc16',
    commands: [
      {
        name: 'environments',
        syntax: 'environments',
        description: 'List all available environments',
        examples: ['environments', 'envs'],
        aliases: ['envs'],
        tags: ['env', 'list', 'management']
      },
      {
        name: 'env search',
        syntax: 'env search <query>',
        description: 'Search for environments',
        examples: [
          'env search python',
          'env search node'
        ],
        tags: ['env', 'search']
      },
      {
        name: 'env activate',
        syntax: 'env activate <name>',
        description: 'Activate a specific environment',
        examples: [
          'env activate myproject',
          'activate python-3.11'
        ],
        aliases: ['activate'],
        tags: ['env', 'activate']
      }
    ]
  },
  {
    id: 'install',
    title: 'Model Installation',
    description: 'Install AI models by tier or name',
    icon: '📦',
    color: '#fbbf24',
    stats: {
      label: 'Available Tiers',
      value: '0-4'
    },
    commands: [
      {
        name: 'install',
        syntax: 'install <model>',
        description: 'Install a specific model by name',
        examples: [
          'install mistral',
          'install llama3.1',
          'install deepseek-coder'
        ],
        tags: ['install', 'models', 'download']
      },
      {
        name: 'install tier',
        syntax: 'install tier <0-4>',
        description: 'Install all models in a tier',
        examples: [
          'install tier 0',
          'install tier 2',
          'install tier 4'
        ],
        tags: ['install', 'models', 'tier']
      },
      {
        name: 'install core models',
        syntax: 'install core models',
        description: 'Install essential core models',
        examples: ['install core models'],
        tags: ['install', 'models', 'core']
      },
      {
        name: 'install all models',
        syntax: 'install all models',
        description: 'Install all available models',
        examples: ['install all models'],
        tags: ['install', 'models', 'all']
      },
      {
        name: 'backup models',
        syntax: 'backup models',
        description: 'Backup installed models',
        examples: ['backup models'],
        tags: ['backup', 'models']
      },
      {
        name: 'show backup models',
        syntax: 'show backup models',
        description: 'List backed up models',
        examples: ['show backup models'],
        tags: ['backup', 'models', 'list']
      }
    ]
  },
  {
    id: 'tiers',
    title: 'Model Tiers',
    description: 'Six tiers, 0–5. Tier 0 needs no model at all; Tiers 1–4 are local models of increasing size; Tier 5 is an external API instead of a local model. Note: Settings › Models groups models by size and numbers those groups differently (there, TinyLlama is Tier 0).',
    icon: '🎚️',
    color: '#bc8cff',
    stats: {
      label: 'Tiers',
      value: '0–5'
    },
    commands: MODEL_TIERS.map((t) => ({
      name: `Tier ${t.tier} — ${t.name}`,
      syntax: `tier ${t.tier}`,
      description: t.line,
      examples: t.tier === 5 ? [] : [`install tier ${t.tier}`],
      tags: ['tier', 'models', `tier-${t.tier}`],
    })),
  },
  {
    id: 'system',
    title: 'System Information',
    description: 'System stats and information',
    icon: '💻',
    color: '#a78bfa',
    commands: [
      {
        name: 'info',
        syntax: 'info',
        description: 'Show system information',
        examples: ['info'],
        tags: ['system', 'info']
      },
      {
        name: 'memory',
        syntax: 'memory',
        description: 'Show memory usage statistics',
        examples: ['memory'],
        tags: ['system', 'memory', 'stats']
      },
      {
        name: 'mainmenu',
        syntax: 'mainmenu',
        description: 'Show main menu',
        examples: ['mainmenu', 'main menu'],
        aliases: ['main menu'],
        tags: ['system', 'menu']
      }
    ]
  },
  {
    id: 'dev',
    title: 'Developer Tools',
    description: 'File watching, testing, and execution',
    icon: '🛠️',
    color: '#f472b6',
    commands: [
      {
        name: 'daemon',
        syntax: 'daemon',
        description: 'Start file watcher daemon',
        examples: ['daemon', 'watch', 'daemon watch'],
        aliases: ['watch', 'daemon watch'],
        tags: ['dev', 'watch', 'daemon']
      },
      {
        name: 'run',
        syntax: 'run <script>',
        description: 'Execute a script or command',
        examples: [
          'run test.py',
          'run build.sh'
        ],
        tags: ['dev', 'execute', 'run']
      },
      {
        name: 'test suite',
        syntax: 'test suite',
        description: 'Run full test suite',
        examples: ['test suite'],
        tags: ['dev', 'test', 'suite']
      }
    ]
  },
  {
    id: 'modes',
    title: 'Special Modes',
    description: 'Enhanced operational modes',
    icon: '😈',
    color: '#dc2626',
    commands: [
      {
        name: 'diabolical mode',
        syntax: 'diabolical mode',
        description: 'Enter enhanced diabolical mode',
        examples: ['diabolical mode'],
        tags: ['mode', 'enhanced']
      },
      {
        name: 'diabolical exit',
        syntax: 'diabolical exit',
        description: 'Exit diabolical mode',
        examples: ['diabolical exit'],
        tags: ['mode', 'exit']
      }
    ]
  },
  {
    id: 'natural',
    title: 'Natural Language',
    description: 'Ask questions naturally - AI powered',
    icon: '💬',
    color: '#ff7b72',
    commands: [
      {
        name: 'Question',
        syntax: '<ask anything>',
        description: 'Ask questions in plain English',
        examples: [
          'How do I install Node.js packages?',
          'What is the difference between let and const?',
          'Explain Docker containers'
        ],
        tags: ['ai', 'question', 'nlp']
      },
      {
        name: 'Action',
        syntax: '<describe action>',
        description: 'Describe what you want to do',
        examples: [
          'Deploy my app to production',
          'Set up a new Git repository',
          'Configure TypeScript for my project'
        ],
        tags: ['ai', 'action', 'nlp']
      }
    ]
  }
];

/**
 * Get all commands across all categories
 */
export function getAllCommands(): HelpCommand[] {
  return helpCategories.flatMap(cat => cat.commands);
}

/**
 * Search commands by query
 */
export function searchCommands(query: string): HelpCommand[] {
  const lowerQuery = query.toLowerCase();
  return getAllCommands().filter(cmd => 
    cmd.name.toLowerCase().includes(lowerQuery) ||
    cmd.description.toLowerCase().includes(lowerQuery) ||
    cmd.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    cmd.examples.some(ex => ex.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get category by ID
 */
export function getCategoryById(id: string): HelpCategory | undefined {
  return helpCategories.find(cat => cat.id === id);
}

/**
 * System statistics.
 *
 * Only measured numbers live here. `totalTemplates` used to be a
 * hardcoded 17 — the dictionary starts empty and nothing is synced,
 * so the claim was removed rather than replaced with another number.
 */
export const systemStats = {
  offlineCoverage: 'unmeasured',
  modelTiers: 6,
  features: [
    'Smart bypass routing',
    'Fuzzy command matching',
    'Offline-first operation',
    'Auto-fix capabilities'
  ]
};
