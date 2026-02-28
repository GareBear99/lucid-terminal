/**
 * Command Display Formatter
 * 
 * Creates Warp-style visual blocks for command execution
 */

import { WorkflowResult } from '../workflow/workflowOrchestrator';
import { TokenStats } from '../tracking/tokenTracker';

export interface CommandBlock {
  type: 'command' | 'response' | 'error' | 'fix' | 'thinking';
  content: string;
  metadata?: {
    model?: string;
    tier?: number;
    executionTime?: number;
    tokenStats?: TokenStats;
  };
  timestamp: string;
}

export class CommandDisplay {
  /**
   * Format workflow result as display block
   */
  static formatResult(result: WorkflowResult, userInput: string): CommandBlock[] {
    const blocks: CommandBlock[] = [];
    const timestamp = new Date().toISOString();
    
    // Add command block
    blocks.push({
      type: 'command',
      content: userInput,
      timestamp
    });
    
    // Add thinking/processing block if LLM was used
    if (result.bypassRoute) {
      blocks.push(this._formatBypassRoute(result.bypassRoute, timestamp));
    }
    
    // Add response block
    if (result.success) {
      blocks.push({
        type: result.fixApplied ? 'fix' : 'response',
        content: result.output,
        metadata: {
          executionTime: result.executionTimeMs,
          tokenStats: result.tokenStats,
          model: result.bypassRoute?.selected_model,
          tier: result.bypassRoute?.selected_tier
        },
        timestamp
      });
      
      // Add token stats block if available
      if (result.tokenStats) {
        blocks.push(this._formatTokenStats(result.tokenStats, timestamp));
      }
    } else {
      // Error block
      blocks.push({
        type: 'error',
        content: result.output,
        metadata: {
          executionTime: result.executionTimeMs
        },
        timestamp
      });
    }
    
    return blocks;
  }
  
  /**
   * Format bypass route display
   */
  private static _formatBypassRoute(route: any, timestamp: string): CommandBlock {
    const lines = [];
    
    if (route.bypassed_models && route.bypassed_models.length > 0) {
      // Show which models were bypassed
      const bypassed = route.bypassed_models
        .map((m: any) => `${m.model} (Tier ${m.tier})`)
        .join(', ');
      lines.push(`💡 Bypassed: ${bypassed}`);
    }
    
    // Show selected model
    lines.push(`🧠 Using ${route.selected_model} (Tier ${route.selected_tier})`);
    
    return {
      type: 'thinking',
      content: lines.join('\n'),
      timestamp
    };
  }
  
  /**
   * Format token statistics
   */
  private static _formatTokenStats(stats: TokenStats, timestamp: string): CommandBlock {
    const lines = [];
    
    lines.push('📊 Token Usage:');
    lines.push(`   Input: ${stats.prompt_tokens} tokens (${stats.prompt_chars} chars, ${stats.prompt_words} words)`);
    lines.push(`   Output: ${stats.generated_tokens} tokens (${stats.generated_chars} chars, ${stats.generated_words} words)`);
    lines.push(`   Total: ${stats.total_tokens} tokens`);
    
    return {
      type: 'response',
      content: lines.join('\n'),
      timestamp
    };
  }
  
  /**
   * Format for terminal output (colored text)
   */
  static formatForTerminal(blocks: CommandBlock[]): string {
    const output: string[] = [];
    
    for (const block of blocks) {
      switch (block.type) {
        case 'command':
          output.push(`\x1b[1;36m$ ${block.content}\x1b[0m`);  // Cyan bold
          break;
          
        case 'thinking':
          output.push(`\x1b[2m${block.content}\x1b[0m`);  // Dim
          break;
          
        case 'response':
          output.push(block.content);
          break;
          
        case 'fix':
          output.push(`\x1b[1;32m${block.content}\x1b[0m`);  // Green bold
          break;
          
        case 'error':
          output.push(`\x1b[1;31m${block.content}\x1b[0m`);  // Red bold
          break;
      }
      
      output.push('');  // Empty line between blocks
    }
    
    return output.join('\n');
  }
  
  /**
   * Format for UI (structured data for React components)
   */
  static formatForUI(blocks: CommandBlock[]): {
    command: string;
    thinking?: string;
    response: string;
    metadata?: any;
  } {
    const command = blocks.find(b => b.type === 'command')?.content || '';
    const thinking = blocks.find(b => b.type === 'thinking')?.content;
    const response = blocks.find(b => ['response', 'fix', 'error'].includes(b.type));
    
    return {
      command,
      thinking,
      response: response?.content || '',
      metadata: response?.metadata
    };
  }
  
  /**
   * Format execution summary
   */
  static formatSummary(result: WorkflowResult): string {
    const lines = [];
    
    if (result.success) {
      lines.push('✅ Success');
    } else {
      lines.push('❌ Failed');
    }
    
    lines.push(`⏱️  ${result.executionTimeMs}ms`);
    
    if (result.bypassRoute) {
      lines.push(`🧠 ${result.bypassRoute.selected_model} (Tier ${result.bypassRoute.selected_tier})`);
    }
    
    if (result.tokenStats) {
      lines.push(`📊 ${result.tokenStats.total_tokens} tokens`);
    }
    
    if (result.fixApplied) {
      lines.push('🔧 Fix applied');
    }
    
    return lines.join(' | ');
  }
  
  /**
   * Format error message
   */
  static formatError(error: Error): CommandBlock {
    return {
      type: 'error',
      content: `❌ Error: ${error.message}`,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Format welcome message
   */
  static formatWelcome(): string {
    return `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀  Lucid Terminal  -  AI-Powered Development Env      ║
║                                                           ║
║   • FixNet: 72% operations work offline                  ║
║   • Smart bypass routing: Tier 0-5 models                ║
║   • Every fix and script stored for reuse                ║
║                                                           ║
║   Type 'help' to get started                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `.trim();
  }
  
  /**
   * Format help message with LuciferAI color coding
   */
  static formatHelp(): string {
    const red = '\x1b[1;31m';      // Bold red
    const cyan = '\x1b[1;36m';     // Bold cyan  
    const yellow = '\x1b[1;33m';   // Bold yellow
    const green = '\x1b[1;32m';    // Bold green
    const blue = '\x1b[1;34m';     // Bold blue
    const magenta = '\x1b[1;35m';  // Bold magenta
    const white = '\x1b[1;37m';    // Bold white
    const dim = '\x1b[2m';         // Dim
    const orange = '\x1b[38;5;208m'; // Orange
    const reset = '\x1b[0m';       // Reset
    
    return `
${red}╔════════════════════════════════════════════════════════════╗${reset}
${red}║${reset}  ${magenta}🩸 LuciferAI Command Reference${reset}                          ${red}║${reset}
${red}╚════════════════════════════════════════════════════════════╝${reset}

${cyan}▶ Direct Commands${reset} ${dim}(no LLM needed - instant execution)${reset}
  ${white}ls${reset} [path]              ${dim}List files in directory${reset}
  ${white}cd${reset} <path>              ${dim}Change directory${reset}
  ${white}cat${reset} <file>             ${dim}Show file contents${reset}
  ${white}pwd${reset}                    ${dim}Show current directory${reset}
  ${white}clear${reset}                  ${dim}Clear screen${reset}
  ${white}help${reset}                   ${dim}Show this help${reset}
  ${white}exit${reset}                   ${dim}Exit terminal${reset}

${yellow}▶ FixNet Commands${reset} ${dim}(72% offline - no internet needed)${reset}
  ${white}fix${reset} <error>            ${dim}Auto-fix error with offline templates${reset}
  ${white}fixnet stats${reset}           ${dim}Show FixNet statistics${reset}
  ${white}fixnet search${reset} <query>  ${dim}Search offline fix dictionary${reset}
  ${dim}Examples:${reset}
    ${dim}fix ModuleNotFoundError${reset}
    ${dim}fix TypeError: cannot read property${reset}

${blue}▶ Model Commands${reset} ${dim}(manage AI backends)${reset}
  ${white}llm list${reset}               ${dim}List available models & status${reset}
  ${white}llm enable${reset} <model>     ${dim}Enable a model${reset}
  ${white}llm disable${reset} <model>    ${dim}Disable a model${reset}
  ${white}llm status${reset}             ${dim}Show all model statuses${reset}
  ${dim}Supported models: tinyllama, phi-2, mistral, llama3.1, deepseek${reset}

${green}▶ Script Building${reset} ${dim}(AI-powered code generation)${reset}
  ${white}build${reset} <description>    ${dim}Build a script from description${reset}
  ${white}create${reset} <description>   ${dim}Create code/files${reset}
  ${dim}Examples:${reset}
    ${dim}build a Python script that sorts a CSV file${reset}
    ${dim}create a Node.js API with Express${reset}

${orange}▶ Workflow & System${reset}
  ${white}workflow status${reset}        ${dim}Show workflow health${reset}
  ${white}tokens${reset}                 ${dim}Show token usage stats${reset}
  ${white}history${reset}                ${dim}Show conversation history${reset}
  ${white}clear history${reset}          ${dim}Clear conversation history${reset}

${magenta}▶ Natural Language Mode${reset}
  ${dim}Just ask questions naturally! The system will:${reset}
  ${dim}• Parse your intent without LLM (fast)${reset}
  ${dim}• Route to appropriate model tier (0-5)${reset}
  ${dim}• Use offline fixes when possible (72%)${reset}
  ${dim}• Fall back to AI only when needed${reset}
  
  ${dim}Examples:${reset}
    ${dim}"How do I install packages?"${reset}
    ${dim}"Create a React component"${reset}
    ${dim}"Fix this ImportError"${reset}

${red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}
${dim}🩸 Powered by LuciferAI • Enhanced AI Workflow System${reset}
${dim}⚡ 72% operations work offline • 6-tier model routing${reset}
${dim}🔧 FixNet: 17 offline templates synced • Fuzzy matching enabled${reset}
    `.trim();
  }
}
