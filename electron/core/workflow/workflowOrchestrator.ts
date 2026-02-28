/**
 * Workflow Orchestrator
 * 
 * Makes Lucid Terminal work like an AI assistant (Claude-style)
 * Handles the complete flow from user input to response
 */

import { IntentParser, ParsedIntent } from '../parser/intentParser';
import { BypassRouter, BypassRoute } from '../llm/bypassRouter';
import { FixNetRouter, FixRequest, FixResponse } from '../fixnet/fixnetRouter';
import { TokenTracker, TokenStats } from '../tracking/tokenTracker';
import { ToolRegistry } from '../tools/toolRegistry';
import { ModelBackend, GenerationRequest } from '../llm/modelBackend';
import { WorkflowValidator, ValidationPhase } from '../validation/workflowValidator';
import { getModelTier } from '../models/modelTiers';
import { ScriptExecutor, ExecutionStep } from '../executor/scriptExecutor';
import { SegmentedDisplay, SearchSegment } from '../display/segmentedDisplay';

export interface WorkflowContext {
  userId: string;
  sessionId: string;
  workingDirectory: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

export interface WorkflowResult {
  success: boolean;
  output: string;
  bypassRoute?: BypassRoute;
  tokenStats?: TokenStats;
  fixApplied?: boolean;
  executionTimeMs: number;
  validationPhases?: Array<{
    phase: ValidationPhase;
    status: 'pending' | 'running' | 'success' | 'error';
    message?: string;
  }>;
  thinkingSteps?: string[];  // For Tier 2+ models
  executionSteps?: ExecutionStep[];  // LuciferAI-style step tracking
  filePath?: string;  // Created file path
  searchSegments?: SearchSegment[];  // Warp AI-style segmented display
}

export class WorkflowOrchestrator {
  private intentParser: IntentParser;
  private bypassRouter: BypassRouter;
  private fixnetRouter: FixNetRouter;
  private tokenTracker: TokenTracker;
  private toolRegistry: ToolRegistry;
  private context: WorkflowContext;
  private validator: WorkflowValidator | null = null;
  private scriptExecutor: ScriptExecutor;
  private display: SegmentedDisplay;
  
  constructor(
    intentParser: IntentParser,
    bypassRouter: BypassRouter,
    fixnetRouter: FixNetRouter,
    tokenTracker: TokenTracker,
    toolRegistry: ToolRegistry,
    context: WorkflowContext
  ) {
    this.intentParser = intentParser;
    this.bypassRouter = bypassRouter;
    this.fixnetRouter = fixnetRouter;
    this.tokenTracker = tokenTracker;
    this.toolRegistry = toolRegistry;
    this.context = context;
    this.scriptExecutor = new ScriptExecutor(fixnetRouter);
    this.display = new SegmentedDisplay();
  }
  
  /**
   * Main entry point - process user input
   * Matches Warp AI workflow: Parse → Route → Execute → Validate → Complete
   */
  async processRequest(userInput: string): Promise<WorkflowResult> {
    const startTime = Date.now();
    
    // Initialize Warp AI-style workflow validator
    this.validator = new WorkflowValidator();
    this.validator.startPhase('parse', 'Parsing command intent');
    
    // Add to conversation history
    this.context.conversationHistory.push({
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    });
    
    try {
      // 1. Parse intent (deterministic, <5ms)
      const intent = await this.intentParser.parseIntent(userInput);
      this.validator.completePhase('parse', `Identified as: ${intent.intent}`);
      
      // 2. Route phase
      this.validator.startPhase('route', 'Selecting handler');
      
      // 2. Route based on intent type
      let result: WorkflowResult;
      
      switch (intent.intent) {
        case 'direct_command':
          this.validator.completePhase('route', 'Direct command execution');
          result = await this._handleDirectCommand(intent, startTime);
          break;
          
        case 'fix_request':
          this.validator.completePhase('route', 'FixNet repair flow');
          result = await this._handleFixRequest(intent, startTime);
          break;
          
        case 'script_build':
          this.validator.completePhase('route', 'Script generation flow');
          result = await this._handleScriptBuild(intent, startTime, userInput);
          break;
          
        case 'question':
        case 'query':
          this.validator.completePhase('route', 'LLM query handler');
          result = await this._handleQuery(intent, startTime, userInput);
          break;
          
        default:
          this.validator.completePhase('route', 'Unknown intent handler');
          result = await this._handleUnknown(intent, startTime, userInput);
      }
      
      // Complete workflow validation
      if (result.success) {
        this.validator.completePhase('validate', 'Output validated');
        this.validator.completeWorkflow();
      } else {
        this.validator.failPhase('validate', result.output);
      }
      
      // Attach validation phases to result
      result.validationPhases = this.validator.getSteps().map(step => ({
        phase: step.id as ValidationPhase,
        status: step.status,
        message: step.message
      }));
      
      // Add assistant response to history
      this.context.conversationHistory.push({
        role: 'assistant',
        content: result.output,
        timestamp: new Date().toISOString()
      });
      
      return result;
      
    } catch (error: any) {
      // Error occurred - try FixNet
      return await this._handleError(error, userInput, startTime);
    }
  }
  
  /**
   * Handle direct commands (72% - no LLM)
   */
  private async _handleDirectCommand(
    intent: ParsedIntent,
    startTime: number
  ): Promise<WorkflowResult> {
    // Execute tool directly
    const toolResult = await this.toolRegistry.executeTool(
      intent.action,
      intent.target
    );
    
    if (!toolResult.success) {
      // Command failed - check if we need to fix
      if (toolResult.error && this._looksLikeError(toolResult.error)) {
        return await this._tryFixAndRetry(
          intent.action,
          intent.target,
          toolResult.error,
          startTime
        );
      }
    }
    
    return {
      success: toolResult.success,
      output: toolResult.output || toolResult.error || '',
      executionTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Handle fix requests (FixNet-first)
   */
  private async _handleFixRequest(
    intent: ParsedIntent,
    startTime: number
  ): Promise<WorkflowResult> {
    const error = intent.target;  // Error message or file with error
    
    // Show loading
    const loadId = this.display.addLoading('Searching FixNet...');
    
    // Search FixNet first
    const fixResult = await this.fixnetRouter.findFix({ error });
    
    this.display.removeLoading(loadId);
    
    if (fixResult.success && !fixResult.needs_llm) {
      // Found offline fix!
      // Show what was found
      if (fixResult.quality) {
        this.display.addResult(
          'FixNet Dictionary',
          ['error pattern'],
          [error],
          1,
          undefined
        );
      }
      
      return {
        success: true,
        output: this._formatFixOutput(fixResult),
        executionTimeMs: Date.now() - startTime,
        fixApplied: true,
        searchSegments: this.display.getSegments()
      };
    }
    
    // Start execute phase
    if (this.validator) {
      this.validator.startPhase('execute', 'Generating fix with LLM');
    }
    
    // Need LLM - use bypass router
    const { result, route } = await this.bypassRouter.executeWithBypass(
      async (model) => {
        return await this._generateFixWithModel(model, error);
      },
      'fix_generation'
    );
    
    if (result) {
      // Store in FixNet for future
      this.fixnetRouter.storeFix(
        'generated_fix',
        error,
        result.solution,
        { model: route.selected_model, tier: route.selected_tier }
      );
      
      // Generate thinking steps for Tier 2+
      const thinkingSteps = route.selected_tier >= 2
        ? this._generateThinkingSteps(error, intent, route.selected_tier)
        : undefined;
      
      if (this.validator) {
        this.validator.completePhase('execute', 'Fix generated successfully');
      }
      
      return {
        success: true,
        output: result.solution,
        bypassRoute: route,
        executionTimeMs: Date.now() - startTime,
        fixApplied: true,
        thinkingSteps
      };
    }
    
    return {
      success: false,
      output: '❌ Could not generate fix - all models failed',
      bypassRoute: route,
      executionTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Handle script building (LLM with FixNet storage)
   */
  private async _handleScriptBuild(
    intent: ParsedIntent,
    startTime: number,
    userInput: string
  ): Promise<WorkflowResult> {
    // Start execute phase
    if (this.validator) {
      this.validator.startPhase('execute', 'Generating script with LLM');
    }
    
    // Show loading indicator
    const loadId = this.display.addLoading('Generating script...');
    
    // Use bypass router to generate script code
    const { result, route } = await this.bypassRouter.executeWithBypass(
      async (model) => {
        return await this._generateScriptWithModel(model, userInput, intent);
      },
      'script_generation'
    );
    
    if (result) {
      this.display.removeLoading(loadId);
      
      // Generate thinking steps for Tier 2+ (matches LuciferAI)
      const thinkingSteps = route.selected_tier >= 2 
        ? this._generateThinkingSteps(userInput, intent, route.selected_tier)
        : undefined;
      
      // Execute multi-step script building (LuciferAI-style)
      const executionResult = await this.scriptExecutor.executeScriptBuild({
        code: result.code,
        filename: result.filename || 'script.py',
        directory: this.context.workingDirectory,
        language: this._detectLanguage(result.type),
        shouldTest: true,
        shouldMakeExecutable: result.type === 'bash' || result.type === 'shell'
      });
      
      // Store script template in FixNet for future reuse
      if (executionResult.success) {
        this.fixnetRouter.storeFix(
          'script_template',
          userInput,  // Query that generated this
          result.code,
          { 
            model: route.selected_model,
            tier: route.selected_tier,
            script_type: result.type,
            filename: executionResult.filePath
          }
        );
        
        // Show file reference
        if (executionResult.filePath) {
          this.display.addFileReference(
            executionResult.filePath,
            1,
            undefined,
            'found'
          );
        }
      }
      
      // Format output like an AI assistant
      const output = this._formatScriptOutput(result, route, executionResult);
      
      if (this.validator) {
        this.validator.completePhase('execute', 'Script created and validated');
      }
      
      return {
        success: executionResult.success,
        output,
        bypassRoute: route,
        tokenStats: result.tokenStats,
        executionTimeMs: Date.now() - startTime,
        thinkingSteps,
        executionSteps: executionResult.steps,
        filePath: executionResult.filePath,
        searchSegments: this.display.getSegments()
      };
    } else {
      this.display.removeLoading(loadId);
    }
    
    return {
      success: false,
      output: '❌ Could not generate script - all models failed',
      bypassRoute: route,
      executionTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Handle queries/questions (conversational)
   */
  private async _handleQuery(
    intent: ParsedIntent,
    startTime: number,
    userInput: string
  ): Promise<WorkflowResult> {
    // Start execute phase
    if (this.validator) {
      this.validator.startPhase('execute', 'Processing query with LLM');
    }
    
    // Use bypass router for conversational response
    const { result, route } = await this.bypassRouter.executeWithBypass(
      async (model) => {
        return await this._generateResponseWithModel(model, userInput);
      },
      'conversational_query'
    );
    
    if (result) {
      // Generate thinking steps for Tier 2+
      const thinkingSteps = route.selected_tier >= 2
        ? this._generateThinkingSteps(userInput, intent, route.selected_tier)
        : undefined;
      
      if (this.validator) {
        this.validator.completePhase('execute', 'Response generated successfully');
      }
      
      return {
        success: true,
        output: result.response,
        bypassRoute: route,
        tokenStats: result.tokenStats,
        executionTimeMs: Date.now() - startTime,
        thinkingSteps
      };
    }
    
    return {
      success: false,
      output: '❌ Could not generate response - all models failed',
      bypassRoute: route,
      executionTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Handle unknown intents
   */
  private async _handleUnknown(
    intent: ParsedIntent,
    startTime: number,
    userInput: string
  ): Promise<WorkflowResult> {
    // Default to conversational query
    return await this._handleQuery(intent, startTime, userInput);
  }
  
  /**
   * Handle errors during execution
   */
  private async _handleError(
    error: Error,
    userInput: string,
    startTime: number
  ): Promise<WorkflowResult> {
    const errorMessage = error.message;
    
    // Search FixNet for this error
    const fixResult = await this.fixnetRouter.findFix({ 
      error: errorMessage 
    });
    
    if (fixResult.success && !fixResult.needs_llm) {
      // Found fix - apply it
      return {
        success: true,
        output: `🔧 Found fix for error:\n\n${errorMessage}\n\nApplying fix:\n${fixResult.fix?.solution}`,
        fixApplied: true,
        executionTimeMs: Date.now() - startTime
      };
    }
    
    // No fix found - generate with LLM
    const { result, route } = await this.bypassRouter.executeWithBypass(
      async (model) => {
        return await this._generateFixWithModel(model, errorMessage);
      },
      'error_fix'
    );
    
    if (result) {
      // Store for future
      this.fixnetRouter.storeFix(
        'error_fix',
        errorMessage,
        result.solution,
        { model: route.selected_model }
      );
      
      return {
        success: true,
        output: `🔧 Generated fix:\n\n${result.solution}`,
        bypassRoute: route,
        fixApplied: true,
        executionTimeMs: Date.now() - startTime
      };
    }
    
    return {
      success: false,
      output: `❌ Error occurred and no fix could be generated:\n${errorMessage}`,
      executionTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Try to fix and retry command
   */
  private async _tryFixAndRetry(
    action: string,
    target: any,
    error: string,
    startTime: number
  ): Promise<WorkflowResult> {
    // Search FixNet
    const fixResult = await this.fixnetRouter.findFix({ error });
    
    if (fixResult.success && fixResult.fix) {
      // Apply fix (would need actual fix application logic here)
      // For now, just report the fix
      return {
        success: true,
        output: `🔧 Found fix: ${fixResult.fix.solution}\n\nPlease apply the fix and try again.`,
        fixApplied: false,
        executionTimeMs: Date.now() - startTime
      };
    }
    
    return {
      success: false,
      output: `❌ ${error}\n\nNo fix found. Use 'fix <error>' to generate a solution.`,
      executionTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Check if string looks like an error
   */
  private _looksLikeError(text: string): boolean {
    const errorKeywords = [
      'error', 'exception', 'failed', 'not found', 'undefined',
      'cannot', 'invalid', 'missing', 'denied'
    ];
    const lower = text.toLowerCase();
    return errorKeywords.some(kw => lower.includes(kw));
  }
  
  /**
   * Generate fix using model
   */
  private async _generateFixWithModel(
    model: string,
    error: string
  ): Promise<{ solution: string; tokenStats?: TokenStats }> {
    const backend = this.bypassRouter['backendManager'].get(model);
    
    if (!backend) {
      throw new Error(`Model backend not found: ${model}`);
    }
    
    const systemPrompt = `You are a helpful coding assistant. Generate a fix for the following error.`;
    const prompt = `Error:\n${error}\n\nProvide a concise fix or solution:`;
    
    const response = await backend.generate({
      prompt,
      systemPrompt,
      maxTokens: 512,
      temperature: 0.3
    });
    
    return {
      solution: response.text,
      tokenStats: response.tokenStats
    };
  }
  
  /**
   * Generate script using model
   */
  private async _generateScriptWithModel(
    model: string,
    userInput: string,
    intent: ParsedIntent
  ): Promise<{ code: string; type: string; tokenStats?: TokenStats }> {
    const backend = this.bypassRouter['backendManager'].get(model);
    
    if (!backend) {
      throw new Error(`Model backend not found: ${model}`);
    }
    
    const systemPrompt = `You are a helpful coding assistant. Generate production-ready code based on user requests. Always include comments explaining the code.`;
    const prompt = `Request: ${userInput}\n\nGenerate ${intent.target || 'a script'} to accomplish this. Include the code only, no explanations.`;
    
    const response = await backend.generate({
      prompt,
      systemPrompt,
      conversationHistory: this.context.conversationHistory.slice(-6),  // Last 3 turns
      maxTokens: 2048,
      temperature: 0.7
    });
    
    // Detect script type from content
    let scriptType = 'text';
    if (response.text.includes('```python')) scriptType = 'python';
    else if (response.text.includes('```javascript') || response.text.includes('```js')) scriptType = 'javascript';
    else if (response.text.includes('```typescript') || response.text.includes('```ts')) scriptType = 'typescript';
    else if (response.text.includes('```bash') || response.text.includes('```sh')) scriptType = 'bash';
    
    return {
      code: response.text,
      type: scriptType,
      tokenStats: response.tokenStats
    };
  }
  
  /**
   * Generate conversational response using model
   */
  private async _generateResponseWithModel(
    model: string,
    userInput: string
  ): Promise<{ response: string; tokenStats?: TokenStats }> {
    const backend = this.bypassRouter['backendManager'].get(model);
    
    if (!backend) {
      throw new Error(`Model backend not found: ${model}`);
    }
    
    const systemPrompt = `You are a helpful AI assistant in a terminal environment. Provide clear, concise, and accurate responses. When discussing code or commands, be specific and actionable.`;
    
    const response = await backend.generate({
      prompt: userInput,
      systemPrompt,
      conversationHistory: this.context.conversationHistory.slice(-10),  // Last 5 turns
      maxTokens: 1024,
      temperature: 0.7
    });
    
    return {
      response: response.text,
      tokenStats: response.tokenStats
    };
  }
  
  /**
   * Format fix output
   */
  private _formatFixOutput(fixResult: FixResponse): string {
    const lines = [];
    lines.push('🔧 Fix Found!');
    lines.push('');
    lines.push(`Source: ${fixResult.source}`);
    lines.push(`Confidence: ${(fixResult.confidence * 100).toFixed(0)}%`);
    lines.push(`Execution: ${fixResult.execution_time_ms}ms`);
    lines.push('');
    lines.push('Solution:');
    lines.push(fixResult.fix?.solution || '');
    return lines.join('\n');
  }
  
  /**
   * Format script output (AI assistant style)
   */
  private _formatScriptOutput(
    result: { code: string; type: string; filename?: string },
    route: BypassRoute,
    executionResult?: { success: boolean; filePath?: string; steps: ExecutionStep[] }
  ): string {
    const lines = [];
    
    if (executionResult && executionResult.success) {
      lines.push(`✅ I've created ${result.filename || 'a script'} for you!\n`);
      lines.push(`📁 Location: ${executionResult.filePath}\n`);
      lines.push(`\n📋 Execution Summary:`);
      
      // Show step summary
      for (const step of executionResult.steps) {
        const icon = step.status === 'success' ? '✅' : step.status === 'error' ? '❌' : '⏳';
        lines.push(`  ${icon} Step ${step.id}/${step.total}: ${step.description}`);
      }
      
      lines.push(`\n🧠 Generated using ${route.selected_model}`);
    } else {
      lines.push(`I've created a ${result.type} script for you:\n`);
      lines.push('```' + result.type);
      lines.push(result.code);
      lines.push('```\n');
      lines.push(`Generated using ${route.selected_model}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Detect language from script type
   */
  private _detectLanguage(type: string): 'python' | 'javascript' | 'typescript' | 'bash' | 'shell' {
    const lowerType = type.toLowerCase();
    
    if (lowerType.includes('python') || lowerType.includes('py')) return 'python';
    if (lowerType.includes('javascript') || lowerType.includes('js')) return 'javascript';
    if (lowerType.includes('typescript') || lowerType.includes('ts')) return 'typescript';
    if (lowerType.includes('bash')) return 'bash';
    if (lowerType.includes('shell') || lowerType.includes('sh')) return 'shell';
    
    // Default to python
    return 'python';
  }
  
  /**
   * Generate thinking steps for Tier 2+ models (LuciferAI style)
   * Matches enhanced_agent.py:3417-3422 behavior
   */
  private _generateThinkingSteps(
    userInput: string,
    intent: ParsedIntent,
    tier: number
  ): string[] {
    const steps: string[] = [];
    const action = intent.action || 'process';
    const target = intent.target || 'task';
    
    // Extract key verbs and objects from user input
    const input = userInput.toLowerCase();
    
    if (intent.intent === 'script_build') {
      // Script generation thinking
      if (input.includes('python') || input.includes('py')) {
        steps.push('1. Choose Python for simplicity');
        steps.push(`2. Identify required modules for ${target}`);
        steps.push(`3. Write script to ${action}`);
        steps.push('4. Verify and test');
      } else if (input.includes('bash') || input.includes('shell')) {
        steps.push('1. Use bash for system tasks');
        steps.push(`2. Determine shell commands needed`);
        steps.push(`3. Create script with error handling`);
        steps.push('4. Test execution');
      } else {
        steps.push('1. Analyze requirements');
        steps.push('2. Select appropriate language/framework');
        steps.push(`3. Generate ${target}`);
        steps.push('4. Validate output');
      }
    } else if (intent.intent === 'fix_request') {
      // Fix generation thinking
      steps.push('1. Analyze error message');
      steps.push('2. Identify root cause');
      steps.push('3. Generate solution');
      steps.push('4. Verify fix applies correctly');
    } else {
      // General query thinking
      steps.push('1. Parse user request');
      steps.push(`2. ${action.charAt(0).toUpperCase() + action.slice(1)} ${target}`);
      steps.push('3. Format response clearly');
    }
    
    return steps;
  }
  
  /**
   * Get conversation history
   */
  getConversationHistory(): WorkflowContext['conversationHistory'] {
    return [...this.context.conversationHistory];
  }
  
  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.context.conversationHistory = [];
  }
}
