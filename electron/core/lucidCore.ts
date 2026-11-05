/**
 * Lucid Core - Main System Integration
 * 
 * Wires together all components: FixNet, BypassRouter, Workflow, Display
 * Provides simple API for processing user commands
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Core components
import { IntentParser } from './parser/intentParser';
import { BypassRouter } from './llm/bypassRouter';
import { FixNetRouter } from './fixnet/fixnetRouter';
import { TokenTracker } from './tracking/tokenTracker';
import { ToolRegistry } from './tools/toolRegistry';
import { WorkflowOrchestrator, WorkflowContext, WorkflowResult } from './workflow/workflowOrchestrator';
import { ModelBackendManager } from './llm/modelBackend';
import { loadDisabledModels, saveDisabledModels } from './llm/modelEnabledState';
import { ModelTierRegistry } from './models/modelTiers';
import { CommandDisplay, CommandBlock } from './display/commandDisplay';
import { LlamafileManager } from './llm/llamafileManager';

export interface LucidConfig {
  userHomeDir?: string;
  workingDirectory?: string;
  userId?: string;
  sessionId?: string;
}

export class LucidCore {
  private intentParser: IntentParser;
  private bypassRouter: BypassRouter;
  private fixnetRouter: FixNetRouter;
  private tokenTracker: TokenTracker;
  private toolRegistry: ToolRegistry;
  private workflow: WorkflowOrchestrator;
  private backendManager: ModelBackendManager;
  private llamafileManager: LlamafileManager;
  private context: WorkflowContext;
  /** ~/.lucid (or the test override) — where llm_state.json lives. */
  private lucidDir: string;
  /**
   * Set when FixNet started degraded (corrupt dictionary quarantined,
   * or the dictionary unusable): getFixNetStats() reports it so the
   * UI can say so instead of silently showing an empty dictionary.
   */
  private fixnetDegraded: string | null;

  private constructor(
    intentParser: IntentParser,
    bypassRouter: BypassRouter,
    fixnetRouter: FixNetRouter,
    tokenTracker: TokenTracker,
    toolRegistry: ToolRegistry,
    workflow: WorkflowOrchestrator,
    backendManager: ModelBackendManager,
    llamafileManager: LlamafileManager,
    context: WorkflowContext,
    fixnetDegraded: string | null = null,
    lucidDir: string = ''
  ) {
    this.intentParser = intentParser;
    this.bypassRouter = bypassRouter;
    this.fixnetRouter = fixnetRouter;
    this.tokenTracker = tokenTracker;
    this.toolRegistry = toolRegistry;
    this.workflow = workflow;
    this.backendManager = backendManager;
    this.llamafileManager = llamafileManager;
    this.context = context;
    this.fixnetDegraded = fixnetDegraded;
    this.lucidDir = lucidDir;
  }
  
  /**
   * Initialize Lucid Terminal system
   */
  static async initialize(config: LucidConfig = {}): Promise<LucidCore> {
    const userHomeDir = config.userHomeDir || os.homedir();
    const lucidDir = path.join(userHomeDir, '.lucid');
    
    console.log('[LucidCore] Initializing...');
    
    // Initialize llamafile manager (like LuciferAI_Local)
    const llamafileManager = new LlamafileManager(lucidDir);
    try {
      await llamafileManager.initialize();
      console.log('[LucidCore] ✅ Llamafile manager initialized');
    } catch (error: any) {
      console.warn('[LucidCore] ⚠️ Llamafile initialization failed:', error.message);
      console.warn('[LucidCore] Terminal will work with limited LLM capabilities');
    }
    
    // Initialize components
    const modelRegistry = new ModelTierRegistry();
    const tokenTracker = new TokenTracker(lucidDir);
    const backendManager = new ModelBackendManager();
    
    // Register model backends (llamafile - local binaries)
    // These use llamafile binaries like LuciferAI_Local
    backendManager.register('tinyllama', {
      name: 'tinyllama',
      tier: 0,
      provider: 'llamafile',
      endpoint: 'http://localhost:8080' // llamafile default port
    });
    
    backendManager.register('phi-2', {
      name: 'phi-2',
      tier: 1,
      provider: 'llamafile',
      endpoint: 'http://localhost:8081'
    });
    
    backendManager.register('mistral', {
      name: 'mistral',
      tier: 2,
      provider: 'llamafile',
      endpoint: 'http://localhost:8082'
    });
    
    backendManager.register('llama3.1:8b', {
      name: 'llama3.1:8b',
      tier: 2,
      provider: 'llamafile',
      endpoint: 'http://localhost:8083'
    });
    
    backendManager.register('deepseek-coder:33b', {
      name: 'deepseek-coder:33b',
      tier: 3,
      provider: 'llamafile',
      endpoint: 'http://localhost:8084'
    });
    
    backendManager.register('llama3.1:70b', {
      name: 'llama3.1:70b',
      tier: 4,
      provider: 'llamafile',
      endpoint: 'http://localhost:8085'
    });
    
    // Initialize bypass router. Its onEnabledChange hook persists
    // every enable/disable to ~/.lucid/llm_state.json, and the router
    // is seeded from that file right after construction — so a disable
    // survives a restart instead of reverting to "all enabled".
    const bypassRouter = new BypassRouter(
      modelRegistry,
      tokenTracker,
      backendManager,
      {
        onEnabledChange: (disabled) =>
          saveDisabledModels(lucidDir, disabled),
      }
    );
    const persistedDisabled = loadDisabledModels(lucidDir);
    if (persistedDisabled.length > 0) {
      bypassRouter.applyPersistedDisabledModels(persistedDisabled);
      console.log(
        `[LucidCore] Restored ${persistedDisabled.length} disabled model(s) from llm_state.json: ${persistedDisabled.join(', ')}`
      );
    }
    
    // Initialize FixNet. A corrupt dictionary degrades FixNet only
    // (F9) — it must never kill app startup the way it used to (the
    // constructor throws on corrupt JSON, and initialize() had no
    // try/catch, so one bad file killed `lucid:init`).
    //   1. Try the normal construction.
    //   2. On failure, quarantine the corrupt file aside (timestamped,
    //      preserved for inspection) and retry with a fresh dictionary.
    //   3. If even that fails, fall back to a temporary empty dictionary
    //      under the OS temp dir so the app still starts.
    // Either fallback records the reason, which getFixNetStats()
    // reports; the app never pretends the dictionary is fine.
    let fixnetRouter: FixNetRouter;
    let fixnetDegraded: string | null = null;
    try {
      fixnetRouter = new FixNetRouter(lucidDir);
    } catch (firstError: any) {
      console.warn(
        `[LucidCore] ⚠️ FixNet dictionary unusable: ${firstError.message}`
      );
      try {
        const dictPath = path.join(lucidDir, 'fix_dictionary.json');
        if (fs.existsSync(dictPath)) {
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-');
          const quarantinePath = `${dictPath}.corrupt-${stamp}`;
          fs.renameSync(dictPath, quarantinePath);
          console.warn(
            `[LucidCore] ⚠️ Quarantined corrupt dictionary to ${quarantinePath}`
          );
        }
        fixnetRouter = new FixNetRouter(lucidDir);
        fixnetDegraded =
          `dictionary was corrupt and was quarantined: ${firstError.message}`;
      } catch (secondError: any) {
        const tmpDir = path.join(
          os.tmpdir(),
          `lucid-fixnet-degraded-${Date.now()}`
        );
        console.warn(
          `[LucidCore] ⚠️ FixNet still unusable after quarantine ` +
            `(${secondError.message}); using a temporary empty dictionary at ${tmpDir}`
        );
        fixnetRouter = new FixNetRouter(tmpDir);
        fixnetDegraded =
          `dictionary unusable (${secondError.message}); using a temporary empty dictionary`;
      }
    }
    
    // Initialize intent parser
    const intentParser = new IntentParser();
    
    // Initialize tool registry
    const toolRegistry = new ToolRegistry();
    
    // Create workflow context
    const context: WorkflowContext = {
      userId: config.userId || 'default',
      sessionId: config.sessionId || Date.now().toString(),
      workingDirectory: config.workingDirectory || process.cwd(),
      conversationHistory: []
    };
    
    // Initialize workflow orchestrator
    const workflow = new WorkflowOrchestrator(
      intentParser,
      bypassRouter,
      fixnetRouter,
      tokenTracker,
      toolRegistry,
      context
    );
    
    console.log('[LucidCore] ✅ Initialization complete');
    
    return new LucidCore(
      intentParser,
      bypassRouter,
      fixnetRouter,
      tokenTracker,
      toolRegistry,
      workflow,
      backendManager,
      llamafileManager,
      context,
      fixnetDegraded,
      lucidDir
    );
  }
  
  /**
   * Process user command
   */
  async processCommand(userInput: string): Promise<{
    result: WorkflowResult;
    display: CommandBlock[];
    terminalOutput: string;
  }> {
    try {
      // Process through workflow
      const result = await this.workflow.processRequest(userInput);
      
      // Format for display
      const display = CommandDisplay.formatResult(result, userInput);
      const terminalOutput = CommandDisplay.formatForTerminal(display);
      
      return {
        result,
        display,
        terminalOutput
      };
      
    } catch (error: any) {
      // Handle errors
      const errorBlock = CommandDisplay.formatError(error);
      const result: WorkflowResult = {
        success: false,
        output: error.message,
        executionTimeMs: 0
      };
      
      return {
        result,
        display: [errorBlock],
        terminalOutput: errorBlock.content
      };
    }
  }
  
  /**
   * Get welcome message
   */
  getWelcome(): string {
    return CommandDisplay.formatWelcome();
  }
  
  /**
   * Get help message
   */
  getHelp(): string {
    return CommandDisplay.formatHelp();
  }
  
  /**
   * Get conversation history
   */
  getConversationHistory(): WorkflowContext['conversationHistory'] {
    return this.workflow.getConversationHistory();
  }
  
  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.workflow.clearHistory();
  }
  
  /**
   * Get FixNet statistics.
   *
   * `last_sync` is always null: FixNet is local-only and has never
   * synced (sharing comes later with the causal cloud sync). The old
   * `// TODO: Implement sync tracking` comment implied sync was coming
   * as a small job; it is not — it is the causal cloud sync follow-on.
   * `offline_percentage` is the dictionary HIT rate (lookups that
   * found a stored fix), not a fix success rate; the outcome-based
   * rate is reported separately and is null until any outcome exists.
   */
  async getFixNetStats(): Promise<any> {
    const stats = await this.fixnetRouter.getStats();

    // Transform to match frontend interface
    return {
      success: true,
      fixes_count: stats.dictionary.total_fixes || 0,
      scripts_count: stats.dictionary.total_scripts || 0,
      last_sync: null,
      offline_percentage: Math.round((stats.performance.offline_success_rate ?? 0) * 100),
      outcome_success_rate: stats.performance.outcome_success_rate,
      total_attempts: stats.performance.total_attempts,
      degraded: this.fixnetDegraded !== null,
      degrade_reason: this.fixnetDegraded,
    };
  }
  
  /**
   * Get model statuses
   */
  async getModelStatuses(): Promise<Map<string, boolean>> {
    return await this.backendManager.testAll();
  }
  
  /**
   * Enable/disable a model — the canonical path. The router owns the
   * flag (routing consults it via isModelEnabled), the backend
   * manager mirrors it, and the change is persisted to
   * ~/.lucid/llm_state.json by the router's onEnabledChange hook.
   * Returns success:false — never throws for a bad model — when the
   * model is unknown, not installed (enable only), or the state file
   * cannot be written; in those cases the in-memory state is
   * unchanged and the caller must report the failure, not success.
   */
  setModelEnabled(model: string, enabled: boolean): {
    success: boolean;
    model: string;
    enabled: boolean;
    message: string;
  } {
    const result = this.bypassRouter.setModelEnabled(model, enabled);
    return {
      success: result.success,
      model,
      enabled: this.bypassRouter.isModelEnabled(model),
      message: result.message,
    };
  }

  /**
   * Whether the router will route to this model — the canonical
   * enabled flag. (Unknown models default to true, as the router
   * has never seen them; setModelEnabled rejects them instead.)
   */
  isModelEnabled(model: string): boolean {
    return this.bypassRouter.isModelEnabled(model);
  }

  /**
   * Full model list for the UI. `enabled` is the REAL enable flag —
   * not the server-up flag getModelStatuses() reports. The two were
   * conflated before: llmList used to surface "server answering" as
   * `enabled`, so the Settings toggle showed running state, not the
   * enable state the toggle itself was supposed to control.
   */
  getModelList(): Array<{
    name: string;
    tier: number;
    enabled: boolean;
    running: boolean;
    installed: boolean;
    corrupted: boolean;
  }> {
    this.bypassRouter.refreshAvailableModels();
    return this.backendManager.listModels().map((info) => {
      const status = this.bypassRouter.getModelStatus(info.name);
      return {
        name: info.name,
        tier: info.tier,
        enabled: status.enabled,
        running: info.running,
        installed: status.installed,
        corrupted: status.corrupted,
      };
    });
  }
  
  /**
   * Get session token stats
   */
  getSessionTokenStats(): any {
    return this.tokenTracker.getSessionSummary();
  }
  
  /**
   * Change working directory
   */
  changeDirectory(newDir: string): void {
    this.context.workingDirectory = path.resolve(this.context.workingDirectory, newDir);
  }
  
  /**
   * Get current working directory
   */
  getWorkingDirectory(): string {
    return this.context.workingDirectory;
  }
  
  /**
   * Search FixNet dictionary
   */
  async searchFixNet(query: string): Promise<any[]> {
    return await this.fixnetRouter.searchDictionary(query);
  }
}

/**
 * Simple CLI interface for testing
 */
export async function createCLI(): Promise<void> {
  const core = await LucidCore.initialize();
  
  console.log(core.getWelcome());
  console.log();
  
  // Simple REPL
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[1;36m$\x1b[0m '
  });
  
  rl.prompt();
  
  rl.on('line', async (line: string) => {
    const input = line.trim();
    
    if (!input) {
      rl.prompt();
      return;
    }
    
    if (input === 'exit' || input === 'quit') {
      console.log('Goodbye!');
      process.exit(0);
    }
    
    try {
      const { terminalOutput } = await core.processCommand(input);
      console.log(terminalOutput);
    } catch (error: any) {
      console.error(`\x1b[1;31mError: ${error.message}\x1b[0m`);
    }
    
    rl.prompt();
  });
  
  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}

// Export for use in Electron main process
export default LucidCore;
