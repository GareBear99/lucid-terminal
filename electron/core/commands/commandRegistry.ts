/**
 * Command Registry - Complete LuciferAI Command Reference
 * 
 * Organized into categories matching help page:
 * - Direct Commands (instant execution)
 * - FixNet Commands (offline-first fixes)
 * - Model Management (AI backend control)
 * - AI Code Generation (script/code creation)
 * - Workflow & System (state management)
 * - GitHub Integration (repo syncing)
 * - Environment Management (dev environments)
 * - Model Installation (tier-based models)
 * - Developer Tools (testing/debugging)
 * - Special Modes (daemon/watcher)
 * - Natural Language (conversational AI)
 * - System Information (stats/diagnostics)
 */

export interface CommandDefinition {
  name: string;
  category: string;
  description: string;
  usage: string;
  examples: string[];
  aliases?: string[];
  requiresLLM: boolean;
  tier?: number;  // LLM tier required (0-5)
  offline: boolean;  // Works without internet
}

export class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();
  
  constructor() {
    this._registerAllCommands();
  }
  
  private _registerAllCommands(): void {
    // ========================================
    // DIRECT COMMANDS (7 commands)
    // Instant execution, no LLM needed
    // ========================================
    
    this._register({
      name: 'help',
      category: 'Direct Commands',
      description: 'Show command reference and help',
      usage: 'help [command]',
      examples: ['help', 'help fixnet', 'help llm'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'clear',
      category: 'Direct Commands',
      description: 'Clear terminal screen',
      usage: 'clear',
      examples: ['clear', 'cls'],
      aliases: ['cls'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'exit',
      category: 'Direct Commands',
      description: 'Exit Lucid Terminal',
      usage: 'exit',
      examples: ['exit', 'quit'],
      aliases: ['quit', 'q'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'badges',
      category: 'Direct Commands',
      description: 'Show achievement badges earned',
      usage: 'badges',
      examples: ['badges'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'soul',
      category: 'Direct Commands',
      description: 'Display LuciferAI soul ASCII art',
      usage: 'soul',
      examples: ['soul'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'mainmenu',
      category: 'Direct Commands',
      description: 'Return to main menu',
      usage: 'mainmenu',
      examples: ['mainmenu', 'menu'],
      aliases: ['menu'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'history',
      category: 'Direct Commands',
      description: 'Show command history',
      usage: 'history [limit]',
      examples: ['history', 'history 20'],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // FIXNET COMMANDS (3 commands - 72% offline)
    // Offline-first error fixing with local templates
    // ========================================
    
    this._register({
      name: 'fixnet sync',
      category: 'FixNet Commands',
      description: 'Sync with GitHub FixNet repository',
      usage: 'fixnet sync',
      examples: ['fixnet sync'],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'fixnet stats',
      category: 'FixNet Commands',
      description: 'Show FixNet statistics and metrics',
      usage: 'fixnet stats',
      examples: ['fixnet stats'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'fixnet search',
      category: 'FixNet Commands',
      description: 'Search for similar fixes in dictionary',
      usage: 'fixnet search <error>',
      examples: [
        'fixnet search NameError',
        'fixnet search "import not found"'
      ],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // MODEL MANAGEMENT (4 commands)
    // Control AI backend and packaged models
    // ========================================
    
    this._register({
      name: 'llm list',
      category: 'Model Management',
      description: 'List all available LLM models',
      usage: 'llm list',
      examples: ['llm list', 'models'],
      aliases: ['models'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'llm enable',
      category: 'Model Management',
      description: 'Enable a specific model',
      usage: 'llm enable <model>',
      examples: ['llm enable mistral', 'llm enable phi-2'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'llm disable',
      category: 'Model Management',
      description: 'Disable a specific model',
      usage: 'llm disable <model>',
      examples: ['llm disable tinyllama'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'llm test',
      category: 'Model Management',
      description: 'Test model availability and response',
      usage: 'llm test <model>',
      examples: ['llm test mistral', 'llm test all'],
      requiresLLM: true,
      tier: 0,
      offline: true
    });
    
    // ========================================
    // AI CODE GENERATION (2 commands)
    // Build scripts and code with AI
    // ========================================
    
    this._register({
      name: 'create script',
      category: 'AI Code Generation',
      description: 'Generate script from natural language description',
      usage: 'create script that <description>',
      examples: [
        'create script that opens the browser',
        'create a python script that fetches weather data',
        'write a bash script to backup files'
      ],
      requiresLLM: true,
      tier: 2,
      offline: true
    });
    
    this._register({
      name: 'generate',
      category: 'AI Code Generation',
      description: 'Generate code, function, or module',
      usage: 'generate <type> <description>',
      examples: [
        'generate function to parse JSON',
        'generate class for user authentication',
        'generate API endpoint for /users'
      ],
      requiresLLM: true,
      tier: 2,
      offline: true
    });
    
    // ========================================
    // WORKFLOW & SYSTEM (4 commands)
    // Monitor and manage system state
    // ========================================
    
    this._register({
      name: 'session list',
      category: 'Workflow & System',
      description: 'List all sessions',
      usage: 'session list',
      examples: ['session list', 'sessions'],
      aliases: ['sessions'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'session info',
      category: 'Workflow & System',
      description: 'Show current session details',
      usage: 'session info [id]',
      examples: ['session info', 'session info abc123'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'session stats',
      category: 'Workflow & System',
      description: 'Show session statistics',
      usage: 'session stats',
      examples: ['session stats'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'workflow status',
      category: 'Workflow & System',
      description: 'Show current workflow state',
      usage: 'workflow status',
      examples: ['workflow status'],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // GITHUB INTEGRATION (5 commands)
    // Sync fixes and link GitHub account
    // ========================================
    
    this._register({
      name: 'github status',
      category: 'GitHub Integration',
      description: 'Show GitHub connection status',
      usage: 'github status',
      examples: ['github status'],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'github link',
      category: 'GitHub Integration',
      description: 'Link GitHub account',
      usage: 'github link <username>',
      examples: ['github link myusername'],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'github sync',
      category: 'GitHub Integration',
      description: 'Sync with GitHub FixNet repo',
      usage: 'github sync',
      examples: ['github sync'],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'github push',
      category: 'GitHub Integration',
      description: 'Push local fixes to GitHub',
      usage: 'github push',
      examples: ['github push'],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'github pull',
      category: 'GitHub Integration',
      description: 'Pull fixes from GitHub',
      usage: 'github pull',
      examples: ['github pull'],
      requiresLLM: false,
      offline: false
    });
    
    // ========================================
    // ENVIRONMENT MANAGEMENT (3 commands)
    // Manage development environments
    // ========================================
    
    this._register({
      name: 'env list',
      category: 'Environment Management',
      description: 'List all environments',
      usage: 'env list',
      examples: ['env list'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'env create',
      category: 'Environment Management',
      description: 'Create new environment',
      usage: 'env create <name>',
      examples: ['env create dev', 'env create production'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'env activate',
      category: 'Environment Management',
      description: 'Activate environment',
      usage: 'env activate <name>',
      examples: ['env activate dev'],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // MODEL INSTALLATION (6 commands - Tier 0-4)
    // Install AI models by tier or name
    // ========================================
    
    this._register({
      name: 'install model',
      category: 'Model Installation',
      description: 'Install model by name',
      usage: 'install model <name>',
      examples: [
        'install model mistral',
        'install model llama3.1:8b',
        'install model deepseek-coder:33b'
      ],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'install tier',
      category: 'Model Installation',
      description: 'Install all models for a tier',
      usage: 'install tier <number>',
      examples: [
        'install tier 0',
        'install tier 2',
        'install tier 4'
      ],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'install core',
      category: 'Model Installation',
      description: 'Install core models (Tier 0-2)',
      usage: 'install core',
      examples: ['install core'],
      requiresLLM: false,
      offline: false
    });
    
    this._register({
      name: 'uninstall model',
      category: 'Model Installation',
      description: 'Uninstall model',
      usage: 'uninstall model <name>',
      examples: ['uninstall model tinyllama'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'model info',
      category: 'Model Installation',
      description: 'Show model information',
      usage: 'model info <name>',
      examples: ['model info mistral'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'storage info',
      category: 'Model Installation',
      description: 'Show storage usage',
      usage: 'storage info',
      examples: ['storage info', 'storage'],
      aliases: ['storage'],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // DEVELOPER TOOLS (3 commands)
    // File watching, testing, and execution
    // ========================================
    
    this._register({
      name: 'run',
      category: 'Developer Tools',
      description: 'Run script or file',
      usage: 'run <file>',
      examples: ['run script.py', 'run test.sh'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'fix',
      category: 'Developer Tools',
      description: 'Auto-fix script errors',
      usage: 'fix <file>',
      examples: ['fix broken_script.py'],
      requiresLLM: true,
      tier: 2,
      offline: true
    });
    
    this._register({
      name: 'test',
      category: 'Developer Tools',
      description: 'Run tests',
      usage: 'test [file]',
      examples: ['test', 'test unit', 'test integration'],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // SPECIAL MODES (2 commands)
    // Background daemon and file watcher
    // ========================================
    
    this._register({
      name: 'daemon start',
      category: 'Special Modes',
      description: 'Start background daemon',
      usage: 'daemon start',
      examples: ['daemon start'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'watcher start',
      category: 'Special Modes',
      description: 'Start file watcher',
      usage: 'watcher start <directory>',
      examples: ['watcher start .', 'watcher start src/'],
      requiresLLM: false,
      offline: true
    });
    
    // ========================================
    // NATURAL LANGUAGE (2 commands)
    // Ask questions naturally - AI powered
    // ========================================
    
    this._register({
      name: 'ask',
      category: 'Natural Language',
      description: 'Ask a question in natural language',
      usage: 'ask <question>',
      examples: [
        'ask how do I deploy this app?',
        'ask what is the best way to handle errors?'
      ],
      requiresLLM: true,
      tier: 2,
      offline: true
    });
    
    this._register({
      name: 'explain',
      category: 'Natural Language',
      description: 'Explain code or concept',
      usage: 'explain <topic>',
      examples: [
        'explain async functions',
        'explain this error message'
      ],
      requiresLLM: true,
      tier: 1,
      offline: true
    });
    
    // ========================================
    // SYSTEM INFORMATION (3 commands)
    // System stats and diagnostics
    // ========================================
    
    this._register({
      name: 'sysinfo',
      category: 'System Information',
      description: 'Show system information',
      usage: 'sysinfo',
      examples: ['sysinfo', 'info'],
      aliases: ['info'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'version',
      category: 'System Information',
      description: 'Show Lucid Terminal version',
      usage: 'version',
      examples: ['version'],
      requiresLLM: false,
      offline: true
    });
    
    this._register({
      name: 'diagnostics',
      category: 'System Information',
      description: 'Run system diagnostics',
      usage: 'diagnostics',
      examples: ['diagnostics', 'diag'],
      aliases: ['diag'],
      requiresLLM: false,
      offline: true
    });
  }
  
  private _register(cmd: CommandDefinition): void {
    this.commands.set(cmd.name, cmd);
    
    // Register aliases
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.commands.set(alias, { ...cmd, name: alias });
      }
    }
  }
  
  /**
   * Get command by name or alias
   */
  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }
  
  /**
   * Search commands by keyword
   */
  search(query: string): CommandDefinition[] {
    const lowerQuery = query.toLowerCase();
    const results: CommandDefinition[] = [];
    
    for (const cmd of this.commands.values()) {
      if (cmd.name.toLowerCase().includes(lowerQuery) ||
          cmd.description.toLowerCase().includes(lowerQuery) ||
          cmd.category.toLowerCase().includes(lowerQuery)) {
        results.push(cmd);
      }
    }
    
    return results;
  }
  
  /**
   * Get all commands by category
   */
  getByCategory(category: string): CommandDefinition[] {
    return Array.from(this.commands.values())
      .filter(cmd => cmd.category === category)
      .filter((cmd, index, self) => 
        index === self.findIndex(c => c.name === cmd.name)
      );
  }
  
  /**
   * Get all categories with command counts
   */
  getCategories(): Array<{ name: string; count: number; offlinePercent: number }> {
    const categories = new Map<string, { count: number; offline: number }>();
    
    // Count unique commands per category
    const uniqueCommands = Array.from(this.commands.values())
      .filter((cmd, index, self) => 
        index === self.findIndex(c => c.name === cmd.name)
      );
    
    for (const cmd of uniqueCommands) {
      const existing = categories.get(cmd.category) || { count: 0, offline: 0 };
      existing.count++;
      if (cmd.offline) existing.offline++;
      categories.set(cmd.category, existing);
    }
    
    return Array.from(categories.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      offlinePercent: Math.round((stats.offline / stats.count) * 100)
    }));
  }
  
  /**
   * Get total command count
   */
  getTotalCommands(): number {
    return new Set(Array.from(this.commands.values()).map(cmd => cmd.name)).size;
  }
  
  /**
   * Format help output for terminal
   */
  formatHelp(commandName?: string): string {
    if (commandName) {
      // Show specific command help
      const cmd = this.get(commandName);
      if (!cmd) return `❌ Unknown command: ${commandName}`;
      
      const lines = [
        `📘 ${cmd.name}`,
        `   ${cmd.description}`,
        ``,
        `Usage: ${cmd.usage}`,
        ``,
        `Examples:`,
        ...cmd.examples.map(ex => `  $ ${ex}`),
        ``,
        `Category: ${cmd.category}`,
        `Requires LLM: ${cmd.requiresLLM ? `Yes (Tier ${cmd.tier})` : 'No'}`,
        `Offline: ${cmd.offline ? 'Yes' : 'No'}`
      ];
      
      if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push(`Aliases: ${cmd.aliases.join(', ')}`);
      }
      
      return lines.join('\n');
    }
    
    // Show category overview
    const categories = this.getCategories();
    const lines = [
      `🔥 LuciferAI Command Reference`,
      `${Math.round((categories.find(c => c.name === 'FixNet Commands')?.offlinePercent || 72))}% offline • 17 templates • 8 model tiers`,
      ``,
      ``
    ];
    
    for (const cat of categories) {
      const commands = this.getByCategory(cat.name);
      const icon = this._getCategoryIcon(cat.name);
      
      lines.push(`${icon} ${cat.name}`);
      lines.push(`   ${this._getCategoryDescription(cat.name)}`);
      lines.push(`   ${cat.count} commands${cat.offlinePercent < 100 ? ` • ${cat.offlinePercent}% offline` : ''}`);
      lines.push('');
    }
    
    lines.push('Type "help <command>" for detailed information');
    
    return lines.join('\n');
  }
  
  private _getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'Direct Commands': '⚡',
      'FixNet Commands': '🔧',
      'Model Management': '🧠',
      'AI Code Generation': '✨',
      'Workflow & System': '⚙️',
      'GitHub Integration': '🐙',
      'Environment Management': '🌍',
      'Model Installation': '📦',
      'Developer Tools': '🛠️',
      'Special Modes': '🎯',
      'Natural Language': '💬',
      'System Information': '📊'
    };
    return icons[category] || '•';
  }
  
  private _getCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      'Direct Commands': 'Instant execution, no LLM needed',
      'FixNet Commands': 'Offline-first error fixing with local templates',
      'Model Management': 'Control AI backend and packaged models',
      'AI Code Generation': 'Build scripts and code with AI',
      'Workflow & System': 'Monitor and manage system state',
      'GitHub Integration': 'Sync fixes and link your GitHub account',
      'Environment Management': 'Manage development environments',
      'Model Installation': 'Install AI models by tier or name',
      'Developer Tools': 'File watching, testing, and execution',
      'Special Modes': 'Background daemon and operational modes',
      'Natural Language': 'Ask questions naturally - AI powered',
      'System Information': 'System stats and information'
    };
    return descriptions[category] || '';
  }
}
