/**
 * Command Router - Deterministic Command Dispatch
 * 
 * This is the CORE of the terminal. It routes ALL commands deterministically.
 * NO LLM DEPENDENCY - must work with NO_LLM_CORE=1 flag.
 * 
 * Architecture:
 * 1. Raw input → parse
 * 2. Direct command match (O(1) lookup)
 * 3. Fuzzy match if typo detected
 * 4. Intent extraction (deterministic)
 * 5. Dispatch to handler
 * 6. Return result (output + exit code + metadata)
 */

import {
  getCommand,
  formatCommandHelp,
  formatHelpIndex,
  CommandDefinition,
} from './helpGrammar';
import {
  getBestMatch,
  formatSuggestion,
  autoCorrect,
  getCompletions,
  CompletionSuggestion,
} from './fuzzyMatcher';

/**
 * Command parse result
 */
export interface ParsedCommand {
  command: string;        // Original command name
  normalizedCommand: string; // Normalized/corrected command
  args: string[];         // Command arguments
  flags: Record<string, string | boolean>; // Parsed flags
  rawInput: string;       // Original raw input
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
  duration: number;      // Execution time in ms
  metadata?: {
    command: string;
    handler: string;
    timestamp: Date;
    [key: string]: any;
  };
}

/**
 * Route type classification
 */
export type RouteType =
  | 'direct_command'      // Known command, execute directly
  | 'typo_suggestion'     // Likely typo, suggest correction
  | 'passthrough_shell'   // Pass to shell
  | 'ai_assist'           // Optional AI assist (if enabled)
  | 'unknown';            // Unknown, show help

export interface RouteDecision {
  type: RouteType;
  parsed: ParsedCommand;
  suggestion?: string;
  confidence: number;     // 0-1
  requiresConfirmation?: boolean;
}

/**
 * Main command router class
 */
export class CommandRouter {
  private handlers: Map<string, Function>;
  private shellPassthrough: boolean;
  
  constructor(options?: { shellPassthrough?: boolean }) {
    this.handlers = new Map();
    this.shellPassthrough = options?.shellPassthrough !== false;
    this._initializeHandlers();
  }
  
  /**
   * Parse raw input into structured command
   */
  parse(input: string): ParsedCommand {
    const trimmed = input.trim();
    const parts = this._splitCommand(trimmed);
    
    const command = parts[0] || '';
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};
    
    // Parse arguments and flags
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.startsWith('-')) {
        // Flag parsing
        if (part.startsWith('--')) {
          // Long flag: --key=value or --flag
          const [key, value] = part.slice(2).split('=');
          flags[key] = value || true;
        } else {
          // Short flag: -f or -abc (multiple)
          const flagChars = part.slice(1);
          for (const char of flagChars) {
            flags[char] = true;
          }
        }
      } else {
        args.push(part);
      }
    }
    
    // Try auto-correction
    const corrected = autoCorrect(command);
    const normalizedCommand = corrected || command;
    
    return {
      command,
      normalizedCommand,
      args,
      flags,
      rawInput: input,
    };
  }
  
  /**
   * Route command to appropriate handler
   * This is the CORE routing function - completely deterministic
   */
  route(input: string): RouteDecision {
    const parsed = this.parse(input);
    
    // LAYER 1: Direct command match
    const cmdDef = getCommand(parsed.normalizedCommand);
    if (cmdDef) {
      return {
        type: 'direct_command',
        parsed,
        confidence: 1.0,
      };
    }
    
    // LAYER 2: Fuzzy match for typos
    const bestMatch = getBestMatch(parsed.command);
    if (bestMatch && bestMatch.distance <= 2) {
      return {
        type: 'typo_suggestion',
        parsed,
        suggestion: bestMatch.command,
        confidence: bestMatch.distance === 1 ? 0.9 : 0.7,
        requiresConfirmation: true,
      };
    }
    
    // LAYER 3: Check if it looks like a shell command
    if (this.shellPassthrough && this._looksLikeShellCommand(parsed.command)) {
      return {
        type: 'passthrough_shell',
        parsed,
        confidence: 0.6,
      };
    }
    
    // LAYER 4: Unknown command
    return {
      type: 'unknown',
      parsed,
      confidence: 0,
    };
  }
  
  /**
   * Execute a routed command
   * Returns deterministic result with exit code
   */
  async execute(decision: RouteDecision): Promise<CommandResult> {
    const startTime = Date.now();
    
    try {
      let result: CommandResult;
      
      switch (decision.type) {
        case 'direct_command':
          result = await this._executeDirectCommand(decision.parsed);
          break;
          
        case 'typo_suggestion':
          result = {
            success: false,
            output: `Command not found: '${decision.parsed.command}'\\n${
              formatSuggestion(decision.parsed.command, {
                command: decision.suggestion!,
                distance: 1,
                similarity: 0.9,
                confidence: 'high',
              })
            }`,
            exitCode: 127, // Command not found
            duration: Date.now() - startTime,
          };
          break;
          
        case 'passthrough_shell':
          result = await this._executeShellPassthrough(decision.parsed);
          break;
          
        case 'unknown':
          result = {
            success: false,
            output: `Command not found: '${decision.parsed.command}'\\nType 'help' for available commands.`,
            exitCode: 127,
            duration: Date.now() - startTime,
          };
          break;
          
        default:
          result = {
            success: false,
            output: 'Unknown route type',
            exitCode: 1,
            duration: Date.now() - startTime,
          };
      }
      
      result.duration = Date.now() - startTime;
      return result;
      
    } catch (error: any) {
      return {
        success: false,
        output: `Error: ${error.message}`,
        exitCode: 1,
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Get autocomplete suggestions
   */
  getCompletions(input: string): CompletionSuggestion[] {
    return getCompletions(input);
  }
  
  // ═════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═════════════════════════════════════════════════════════════════
  
  private _splitCommand(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      
      if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== '\\\\')) {
        if (inQuotes && char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        } else if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else {
          current += char;
        }
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current) {
      parts.push(current);
    }
    
    return parts;
  }
  
  private _looksLikeShellCommand(cmd: string): boolean {
    // Common shell commands not in our registry
    const commonShellCommands = [
      'echo', 'grep', 'find', 'which', 'whoami', 'hostname',
      'date', 'time', 'sleep', 'curl', 'wget', 'git', 'npm',
      'node', 'python', 'python3', 'pip', 'cargo', 'rustc',
      'make', 'cmake', 'docker', 'kubectl', 'ssh', 'scp'
    ];
    
    return commonShellCommands.includes(cmd.toLowerCase());
  }
  
  private async _executeDirectCommand(parsed: ParsedCommand): Promise<CommandResult> {
    const cmdDef = getCommand(parsed.normalizedCommand);
    
    if (!cmdDef) {
      return {
        success: false,
        output: 'Command not found',
        exitCode: 127,
        duration: 0,
      };
    }
    
    const handler = this.handlers.get(cmdDef.handler);
    
    if (!handler) {
      return {
        success: false,
        output: `Handler not implemented: ${cmdDef.handler}`,
        exitCode: 1,
        duration: 0,
      };
    }
    
    try {
      const output = await handler(parsed);
      return {
        success: true,
        output: output || '',
        exitCode: 0,
        duration: 0,
        metadata: {
          command: cmdDef.name,
          handler: cmdDef.handler,
          timestamp: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error executing ${cmdDef.name}: ${error.message}`,
        exitCode: 1,
        duration: 0,
      };
    }
  }
  
  private async _executeShellPassthrough(parsed: ParsedCommand): Promise<CommandResult> {
    // This would integrate with the existing PTY/shell system
    // For now, return a placeholder
    return {
      success: true,
      output: `[Shell passthrough] ${parsed.rawInput}`,
      exitCode: 0,
      duration: 0,
      metadata: {
        command: parsed.command,
        handler: 'shell_passthrough',
        timestamp: new Date(),
      },
    };
  }
  
  // ═════════════════════════════════════════════════════════════════
  // COMMAND HANDLERS
  // ═════════════════════════════════════════════════════════════════
  
  private _initializeHandlers() {
    // System commands
    this.handlers.set('handleHelp', async (parsed: ParsedCommand) => {
      if (parsed.args.length > 0) {
        const cmdName = parsed.args[0];
        const cmdDef = getCommand(cmdName);
        if (cmdDef) {
          return formatCommandHelp(cmdDef);
        } else {
          return `Unknown command: ${cmdName}`;
        }
      } else {
        return formatHelpIndex();
      }
    });
    
    this.handlers.set('handleClear', async (parsed: ParsedCommand) => {
      return '\\x1Bc'; // ANSI clear screen
    });
    
    this.handlers.set('handleExit', async (parsed: ParsedCommand) => {
      // This would be handled by the main process
      return 'Exiting...';
    });
    
    this.handlers.set('handleVersion', async (parsed: ParsedCommand) => {
      return 'Lucid Terminal v1.0.0';
    });
    
    // Navigation commands - now using tools
    this.handlers.set('handlePwd', async (parsed: ParsedCommand) => {
      const { executeTool } = await import('./tools/toolRegistry');
      const result = await executeTool('system.pwd');
      return result.output || result.error || 'Error getting directory';
    });
    
    this.handlers.set('handleCd', async (parsed: ParsedCommand) => {
      if (parsed.args.length === 0) {
        return 'Usage: cd <path>';
      }
      const { executeTool } = await import('./tools/toolRegistry');
      const result = await executeTool('system.cd', parsed.args[0]);
      return result.success ? result.output : result.error || 'Failed to change directory';
    });
    
    // File operation handlers using tool system
    this.handlers.set('handleLs', async (parsed: ParsedCommand) => {
      const { executeTool } = await import('./tools/toolRegistry');
      const path = parsed.args[0] || '.';
      const showHidden = parsed.flags.includes('-a');
      const result = await executeTool('file.list', path, showHidden);
      return result.output || result.error || 'Error listing directory';
    });
    
    this.handlers.set('handleCat', async (parsed: ParsedCommand) => {
      if (parsed.args.length === 0) {
        return 'Usage: cat <file>';
      }
      const { executeTool } = await import('./tools/toolRegistry');
      const result = await executeTool('file.read', parsed.args[0]);
      return result.output || result.error || 'Error reading file';
    });
    
    this.handlers.set('handleFind', async (parsed: ParsedCommand) => {
      if (parsed.args.length === 0) {
        return 'Usage: find <pattern>';
      }
      const { executeTool } = await import('./tools/toolRegistry');
      const result = await executeTool('file.find', parsed.args[0], '.', 10);
      return result.output || result.error || 'No matches found';
    });
    
    this.handlers.set('handlePs', async (parsed: ParsedCommand) => {
      const { executeTool } = await import('./tools/toolRegistry');
      const result = await executeTool('system.processes');
      return result.output || result.error || 'Error listing processes';
    });
    
    // Remaining placeholder handlers
    const placeholderCommands = [
      'handleMkdir', 'handleTouch', 'handleRm', 'handleCp', 'handleMv', 'handleKill'
    ];
    
    for (const cmd of placeholderCommands) {
      this.handlers.set(cmd, async (parsed: ParsedCommand) => {
        // These will execute via shell passthrough for now
        const { executeCommandAsTool } = await import('./tools/toolRegistry');
        const result = await executeCommandAsTool(parsed.normalizedCommand, parsed.args);
        return result.output || result.error || 'Command failed';
      });
    }
  }
}

/**
 * Create singleton router instance
 */
let routerInstance: CommandRouter | null = null;

export function getCommandRouter(): CommandRouter {
  if (!routerInstance) {
    routerInstance = new CommandRouter();
  }
  return routerInstance;
}
