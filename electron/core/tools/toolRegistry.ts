/**
 * Tool Registry - Unified tool management system
 * 
 * Provides a centralized interface for all tools (file, command, etc.)
 * Similar to Warp AI's tool system
 */

import * as fileTools from './fileTools';
import * as commandTools from './commandTools';
import { ToolResult } from './fileTools';

export interface Tool {
  name: string;
  description: string;
  category: 'file' | 'command' | 'system' | 'environment';
  requiresLLM: boolean;
  isRisky: boolean;
  handler: (...args: any[]) => Promise<ToolResult> | ToolResult;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  description: string;
  default?: any;
}

/**
 * Registry of all available tools
 */
const TOOL_REGISTRY: Record<string, Tool> = {
  // File Tools
  'file.read': {
    name: 'file.read',
    description: 'Read file contents with optional line range',
    category: 'file',
    requiresLLM: false,
    isRisky: false,
    handler: fileTools.readFile,
    parameters: [
      { name: 'filepath', type: 'string', required: true, description: 'Path to file' },
      { name: 'lineRange', type: 'array', required: false, description: '[start, end] line numbers' }
    ]
  },
  
  'file.write': {
    name: 'file.write',
    description: 'Write content to file',
    category: 'file',
    requiresLLM: false,
    isRisky: true,
    handler: fileTools.writeFile,
    parameters: [
      { name: 'filepath', type: 'string', required: true, description: 'Path to file' },
      { name: 'content', type: 'string', required: true, description: 'Content to write' },
      { name: 'createDirs', type: 'boolean', required: false, description: 'Create parent dirs', default: true }
    ]
  },
  
  'file.edit': {
    name: 'file.edit',
    description: 'Search and replace in file',
    category: 'file',
    requiresLLM: false,
    isRisky: true,
    handler: fileTools.editFile,
    parameters: [
      { name: 'filepath', type: 'string', required: true, description: 'Path to file' },
      { name: 'search', type: 'string', required: true, description: 'Text to search for' },
      { name: 'replace', type: 'string', required: true, description: 'Replacement text' }
    ]
  },
  
  'file.find': {
    name: 'file.find',
    description: 'Find files matching glob pattern',
    category: 'file',
    requiresLLM: false,
    isRisky: false,
    handler: fileTools.findFiles,
    parameters: [
      { name: 'pattern', type: 'string', required: true, description: 'Glob pattern' },
      { name: 'searchDir', type: 'string', required: false, description: 'Directory to search', default: '.' },
      { name: 'maxDepth', type: 'number', required: false, description: 'Max recursion depth', default: 10 }
    ]
  },
  
  'file.grep': {
    name: 'file.grep',
    description: 'Search for text within files',
    category: 'file',
    requiresLLM: false,
    isRisky: false,
    handler: fileTools.grepSearch,
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Text to search for' },
      { name: 'searchPath', type: 'string', required: true, description: 'File or directory' },
      { name: 'filePattern', type: 'string', required: false, description: 'File glob filter', default: '*' }
    ]
  },
  
  'file.list': {
    name: 'file.list',
    description: 'List directory contents',
    category: 'file',
    requiresLLM: false,
    isRisky: false,
    handler: fileTools.listDirectory,
    parameters: [
      { name: 'dirPath', type: 'string', required: false, description: 'Directory path', default: '.' },
      { name: 'showHidden', type: 'boolean', required: false, description: 'Show hidden files', default: false }
    ]
  },
  
  'file.move': {
    name: 'file.move',
    description: 'Move or rename file',
    category: 'file',
    requiresLLM: false,
    isRisky: true,
    handler: fileTools.moveFile,
    parameters: [
      { name: 'source', type: 'string', required: true, description: 'Source path' },
      { name: 'destination', type: 'string', required: true, description: 'Destination path' },
      { name: 'overwrite', type: 'boolean', required: false, description: 'Overwrite if exists', default: false }
    ]
  },
  
  'file.copy': {
    name: 'file.copy',
    description: 'Copy file',
    category: 'file',
    requiresLLM: false,
    isRisky: false,
    handler: fileTools.copyFile,
    parameters: [
      { name: 'source', type: 'string', required: true, description: 'Source path' },
      { name: 'destination', type: 'string', required: true, description: 'Destination path' }
    ]
  },
  
  // Command Tools
  'command.run': {
    name: 'command.run',
    description: 'Execute shell command with safety checks',
    category: 'command',
    requiresLLM: false,
    isRisky: true,
    handler: commandTools.runCommand,
    parameters: [
      { name: 'command', type: 'string', required: true, description: 'Command to execute' },
      { name: 'options', type: 'string', required: false, description: 'Execution options (cwd, timeout)' }
    ]
  },
  
  'command.python': {
    name: 'command.python',
    description: 'Execute Python code',
    category: 'command',
    requiresLLM: false,
    isRisky: true,
    handler: commandTools.runPythonCode,
    parameters: [
      { name: 'code', type: 'string', required: true, description: 'Python code to execute' },
      { name: 'timeout', type: 'number', required: false, description: 'Timeout in ms', default: 10000 }
    ]
  },
  
  'command.script': {
    name: 'command.script',
    description: 'Execute script file',
    category: 'command',
    requiresLLM: false,
    isRisky: true,
    handler: commandTools.runScript,
    parameters: [
      { name: 'scriptPath', type: 'string', required: true, description: 'Path to script' },
      { name: 'args', type: 'array', required: false, description: 'Script arguments', default: [] }
    ]
  },
  
  'command.exists': {
    name: 'command.exists',
    description: 'Check if command exists in PATH',
    category: 'command',
    requiresLLM: false,
    isRisky: false,
    handler: async (command: string): Promise<ToolResult> => {
      const exists = await commandTools.checkCommandExists(command);
      return {
        success: true,
        output: exists ? `Command '${command}' exists` : `Command '${command}' not found`,
        metadata: { command, exists }
      };
    },
    parameters: [
      { name: 'command', type: 'string', required: true, description: 'Command name' }
    ]
  },
  
  // System Tools
  'system.info': {
    name: 'system.info',
    description: 'Get system information',
    category: 'system',
    requiresLLM: false,
    isRisky: false,
    handler: commandTools.getSystemInfo,
    parameters: []
  },
  
  'system.env': {
    name: 'system.env',
    description: 'Get environment information',
    category: 'system',
    requiresLLM: false,
    isRisky: false,
    handler: (): ToolResult => {
      const info = commandTools.getEnvInfo();
      const output = [
        `CWD: ${info.cwd}`,
        `Home: ${info.home}`,
        `User: ${info.user}`,
        `Shell: ${info.shell}`,
        `Platform: ${info.platform}`,
        `Arch: ${info.arch}`
      ].join('\n');
      return {
        success: true,
        output,
        metadata: info
      };
    },
    parameters: []
  },
  
  'system.processes': {
    name: 'system.processes',
    description: 'List running processes',
    category: 'system',
    requiresLLM: false,
    isRisky: false,
    handler: commandTools.listProcesses,
    parameters: []
  },
  
  'system.kill': {
    name: 'system.kill',
    description: 'Kill process by PID',
    category: 'system',
    requiresLLM: false,
    isRisky: true,
    handler: commandTools.killProcess,
    parameters: [
      { name: 'pid', type: 'number', required: true, description: 'Process ID' },
      { name: 'signal', type: 'string', required: false, description: 'Signal to send', default: 'SIGTERM' }
    ]
  },
  
  'system.cd': {
    name: 'system.cd',
    description: 'Change working directory',
    category: 'system',
    requiresLLM: false,
    isRisky: false,
    handler: commandTools.changeDirectory,
    parameters: [
      { name: 'dirPath', type: 'string', required: true, description: 'Directory path' }
    ]
  },
  
  'system.pwd': {
    name: 'system.pwd',
    description: 'Get current working directory',
    category: 'system',
    requiresLLM: false,
    isRisky: false,
    handler: commandTools.getCurrentDirectory,
    parameters: []
  },
  
  // Environment Tools
  'env.find': {
    name: 'env.find',
    description: 'Find virtual environments',
    category: 'environment',
    requiresLLM: false,
    isRisky: false,
    handler: commandTools.findVirtualEnvs,
    parameters: [
      { name: 'searchDir', type: 'string', required: false, description: 'Directory to search', default: '.' }
    ]
  },
  
  'env.activate': {
    name: 'env.activate',
    description: 'Activate virtual environment',
    category: 'environment',
    requiresLLM: false,
    isRisky: false,
    handler: commandTools.activateEnvironment,
    parameters: [
      { name: 'envPath', type: 'string', required: true, description: 'Environment path or name' }
    ]
  }
};

/**
 * Get tool by name
 */
export function getTool(name: string): Tool | undefined {
  return TOOL_REGISTRY[name];
}

/**
 * Get all tools
 */
export function getAllTools(): Tool[] {
  return Object.values(TOOL_REGISTRY);
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: Tool['category']): Tool[] {
  return Object.values(TOOL_REGISTRY).filter(tool => tool.category === category);
}

/**
 * Get tools that don't require LLM
 */
export function getDeterministicTools(): Tool[] {
  return Object.values(TOOL_REGISTRY).filter(tool => !tool.requiresLLM);
}

/**
 * Execute a tool by name with arguments
 * 
 * @param toolName - Name of the tool to execute
 * @param args - Arguments to pass to the tool
 */
export async function executeTool(
  toolName: string,
  ...args: any[]
): Promise<ToolResult> {
  const tool = getTool(toolName);
  
  if (!tool) {
    return {
      success: false,
      error: `Tool not found: ${toolName}`,
      metadata: { toolName, availableTools: Object.keys(TOOL_REGISTRY) }
    };
  }
  
  try {
    const result = await Promise.resolve(tool.handler(...args));
    return {
      ...result,
      metadata: {
        ...result.metadata,
        toolName: tool.name,
        category: tool.category,
        duration: Date.now() // Can be enhanced with proper timing
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Tool execution failed',
      metadata: {
        toolName: tool.name,
        category: tool.category,
        error: error.stack
      }
    };
  }
}

/**
 * Map command to tool execution
 * This is used by the command router to execute commands
 */
export async function executeCommandAsTool(
  command: string,
  args: string[]
): Promise<ToolResult> {
  // Map common commands to tools
  const commandToolMap: Record<string, { tool: string; mapper: (args: string[]) => any[] }> = {
    'ls': {
      tool: 'file.list',
      mapper: (args) => [args[0] || '.', args.includes('-a')]
    },
    'cat': {
      tool: 'file.read',
      mapper: (args) => [args[0]]
    },
    'pwd': {
      tool: 'system.pwd',
      mapper: () => []
    },
    'cd': {
      tool: 'system.cd',
      mapper: (args) => [args[0] || '~']
    },
    'find': {
      tool: 'file.find',
      mapper: (args) => [args[0] || '*', '.', 10]
    },
    'ps': {
      tool: 'system.processes',
      mapper: () => []
    },
    'kill': {
      tool: 'system.kill',
      mapper: (args) => [parseInt(args[0])]
    },
    'mkdir': {
      tool: 'command.run',
      mapper: (args) => [`mkdir -p ${args.join(' ')}`]
    },
    'touch': {
      tool: 'file.write',
      mapper: (args) => [args[0], '']
    },
    'rm': {
      tool: 'command.run',
      mapper: (args) => [`rm ${args.join(' ')}`]
    },
    'cp': {
      tool: 'file.copy',
      mapper: (args) => [args[0], args[1]]
    },
    'mv': {
      tool: 'file.move',
      mapper: (args) => [args[0], args[1]]
    },
    'grep': {
      tool: 'file.grep',
      mapper: (args) => [args[0], args[1] || '.', '*']
    },
    'run': {
      tool: 'command.script',
      mapper: (args) => [args[0], args.slice(1)]
    },
    'environments': {
      tool: 'env.find',
      mapper: () => ['.']
    },
    'activate': {
      tool: 'env.activate',
      mapper: (args) => [args[0]]
    },
    'info': {
      tool: 'system.info',
      mapper: () => []
    }
  };
  
  const mapping = commandToolMap[command];
  
  if (!mapping) {
    // Fallback to running as shell command
    return executeTool('command.run', `${command} ${args.join(' ')}`);
  }
  
  const toolArgs = mapping.mapper(args);
  return executeTool(mapping.tool, ...toolArgs);
}

/**
 * Get tool documentation
 */
export function getToolDocumentation(toolName: string): string {
  const tool = getTool(toolName);
  
  if (!tool) {
    return `Tool not found: ${toolName}`;
  }
  
  const params = tool.parameters
    .map(p => {
      const req = p.required ? 'required' : 'optional';
      const def = p.default !== undefined ? ` (default: ${p.default})` : '';
      return `  - ${p.name} (${p.type}, ${req}): ${p.description}${def}`;
    })
    .join('\n');
  
  return `
${tool.name}
${tool.description}

Category: ${tool.category}
Requires LLM: ${tool.requiresLLM ? 'Yes' : 'No'}
Risky: ${tool.isRisky ? 'Yes ⚠️' : 'No'}

Parameters:
${params || '  (none)'}
`.trim();
}

/**
 * Get all tool documentation
 */
export function getAllToolDocumentation(): string {
  const byCategory = {
    file: getToolsByCategory('file'),
    command: getToolsByCategory('command'),
    system: getToolsByCategory('system'),
    environment: getToolsByCategory('environment')
  };
  
  let output = '# Tool Registry\n\n';
  
  for (const [category, tools] of Object.entries(byCategory)) {
    output += `## ${category.charAt(0).toUpperCase() + category.slice(1)} Tools (${tools.length})\n\n`;
    
    for (const tool of tools) {
      const risk = tool.isRisky ? ' ⚠️' : '';
      output += `- **${tool.name}**${risk}: ${tool.description}\n`;
    }
    
    output += '\n';
  }
  
  return output;
}

/**
 * ToolRegistry class wrapper for dependency injection
 */
export class ToolRegistry {
  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, ...args: any[]): Promise<ToolResult> {
    return executeTool(toolName, ...args);
  }

  /**
   * Execute command as tool
   */
  async executeCommandAsTool(command: string, args: string[]): Promise<ToolResult> {
    return executeCommandAsTool(command, args);
  }

  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    return getTool(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): Tool[] {
    return getAllTools();
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: Tool['category']): Tool[] {
    return getToolsByCategory(category);
  }

  /**
   * Get deterministic tools
   */
  getDeterministicTools(): Tool[] {
    return getDeterministicTools();
  }

  /**
   * Get tool documentation
   */
  getToolDocumentation(toolName: string): string {
    return getToolDocumentation(toolName);
  }

  /**
   * Get all tool documentation
   */
  getAllToolDocumentation(): string {
    return getAllToolDocumentation();
  }
}

/**
 * Export everything for easy access
 */
export {
  fileTools,
  commandTools
};
