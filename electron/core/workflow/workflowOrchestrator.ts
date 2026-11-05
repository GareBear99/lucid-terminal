/**
 * Workflow Orchestrator
 * 
 * Makes Lucid Terminal work like an AI assistant (Claude-style)
 * Handles the complete flow from user input to response
 */

import { IntentParser, ParsedIntent } from '../parser/intentParser';
import { BypassRouter, BypassRoute } from '../llm/bypassRouter';
import { FixNetRouter, FixRequest, FixResponse, FixNetStats } from '../fixnet/fixnetRouter';
import { CommandDisplay } from '../display/commandDisplay';
import { TokenTracker, TokenStats } from '../tracking/tokenTracker';
import { ToolRegistry } from '../tools/toolRegistry';
import { ModelBackend, GenerationRequest } from '../llm/modelBackend';
import { WorkflowValidator, ValidationPhase } from '../validation/workflowValidator';
import { getModelTier } from '../models/modelTiers';
import { ScriptExecutor, ExecutionStep } from '../executor/scriptExecutor';
import { SegmentedDisplay, SearchSegment } from '../display/segmentedDisplay';
import * as fs from 'fs';
import * as path from 'path';
import { FIXNET_SYNC_UNAVAILABLE } from '../commands/fixnetCommands';
import { AUTO_APPLY_THRESHOLD } from '../fixnet/consensusEngine';
import {
  patternFixForError,
  validateFixForError,
} from '../fixnet/patternFix';
import { hashFix } from '../fixnet/fixDictionary';
import {
  runFile,
  applyImportFix,
  extractImportLine,
  revertFile,
} from '../fixnet/fileFixer';

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
  /**
   * True ONLY when a fix was actually written to a file and the file
   * then re-ran clean. Presenting a solution, or generating one, is
   * not applying it — those paths leave this false/undefined.
   */
  fixApplied?: boolean;
  /** How many files a fix was applied to and verified in (0 or 1). */
  fixCount?: number;
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
   * Handle direct commands (no LLM)
   */
  private async _handleDirectCommand(
    intent: ParsedIntent,
    startTime: number
  ): Promise<WorkflowResult> {
    const command = (intent.normalized || '').trim().toLowerCase();

    // Arguments keep their original case: `command` is lowercased for
    // matching, and slicing arguments out of it would mangle any
    // uppercase letter in a file path (case-sensitive filesystems) or
    // a hash. The command name has the same length in both, so slice
    // the original by name length.
    const original = (intent.original || '').trim();
    const restAfter = (name: string): string =>
      original.slice(0, name.length).toLowerCase() === name
        ? original.slice(name.length).trim()
        : '';

    // 'help' — show the command reference. Local-only: no LLM, no tool call.
    // (IntentParser leaves `action` unset for direct commands, so a bare
    // toolRegistry lookup would fail with "Tool not found".)
    if (command === 'help') {
      return {
        success: true,
        output: CommandDisplay.formatHelp(),
        executionTimeMs: Date.now() - startTime
      };
    }

    // 'fixnet stats' — real stats from the local FixNet dictionary.
    // Local-only: no LLM. (Previously misclassified as a fix_request
    // because 'fixnet' contains 'fix', and sent to the model backends.)
    if (command === 'fixnet stats') {
      const stats = await this.fixnetRouter.getStats();
      return {
        success: true,
        output: this._formatFixNetStats(stats),
        executionTimeMs: Date.now() - startTime
      };
    }

    // 'fixnet search <query>' — search the local FixNet dictionary.
    // Local-only: no LLM. (Previously misrouted: the intent parser's
    // synonym map rewrote 'search' -> 'find', so this never matched a
    // direct command and fell through to the fix-request/LLM path.)
    if (command === 'fixnet search' || command.startsWith('fixnet search ')) {
      const query = restAfter('fixnet search');
      if (!query) {
        return {
          success: false,
          output: 'Usage: fixnet search <query>',
          executionTimeMs: Date.now() - startTime
        };
      }
      const results = await this.fixnetRouter.searchDictionary(query);
      return {
        success: true,
        output: this._formatFixNetSearchResults(query, results),
        executionTimeMs: Date.now() - startTime
      };
    }

    // 'fixnet sync' — recognised but unavailable. FixNet is local-only
    // until the causal cloud sync; there is no sync to run. Answer
    // honestly instead of misreading it as a fix request for an empty
    // error (which used to store a phantom entry).
    if (command === 'fixnet sync' || command.startsWith('fixnet sync ')) {
      return {
        success: false,
        output: FIXNET_SYNC_UNAVAILABLE,
        executionTimeMs: Date.now() - startTime
      };
    }

    // 'fixnet report <hash> <success|failure>' — record whether a
    // served fix actually worked. This is what moves the consensus:
    // with no outcomes a fix grades Experimental on the neutral 0.5,
    // and each recorded outcome moves its success rate — and so its
    // trust band — up or down.
    if (command === 'fixnet report' || command.startsWith('fixnet report ')) {
      return await this._handleFixNetReport(
        restAfter('fixnet report'),
        startTime
      );
    }

    // 'fixnet apply <hash> [file]' — apply a stored fix to a file and
    // verify it by re-running. Records the outcome.
    if (command === 'fixnet apply' || command.startsWith('fixnet apply ')) {
      return await this._handleFixNetApply(
        restAfter('fixnet apply'),
        startTime
      );
    }

    // 'fixnet delete <hash>' — remove a stored fix.
    if (command === 'fixnet delete' || command.startsWith('fixnet delete ')) {
      const fixHash = restAfter('fixnet delete').split(/\s+/)[0] || '';
      if (!fixHash) {
        return {
          success: false,
          output: 'Usage: fixnet delete <fix_hash>',
          executionTimeMs: Date.now() - startTime
        };
      }
      const deleted = this.fixnetRouter.deleteByHash(fixHash);
      return {
        success: deleted,
        output: deleted
          ? `🗑️ Deleted fix ${fixHash} from the local dictionary.`
          : `❌ No fix with hash ${fixHash} in the local dictionary.`,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Any other 'fixnet ...' — unknown subcommand. Say so plainly
    // instead of falling through to a tool lookup that fabricates a
    // result. (Known commands: stats, search, report, apply, delete.)
    if (command === 'fixnet' || command.startsWith('fixnet ')) {
      return {
        success: false,
        output:
          `❌ Unknown FixNet command: '${command}'\n\n` +
          'Available: fixnet stats, fixnet search <query>, ' +
          'fixnet report <hash> <success|failure>, ' +
          'fixnet apply <hash> [file], fixnet delete <hash>\n' +
          'FixNet is local-only — there is no sync command.',
        executionTimeMs: Date.now() - startTime
      };
    }

    const action = intent.action ?? '';
    // Execute tool directly
    const toolResult = await this.toolRegistry.executeTool(
      action,
      intent.target
    );
    
    if (!toolResult.success) {
      // Command failed - check if we need to fix
      if (toolResult.error && this._looksLikeError(toolResult.error)) {
        return await this._tryFixAndRetry(
          action,
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
   * Handle fix requests (FixNet-first, dual-form).
   *
   * Dual-form (Gary, 2026-11-04): the argument is a FILE PATH or an
   * ERROR MESSAGE. A file path is resolved against the working
   * directory; anything else is treated as error text.
   *
   * File mode: run the file to get the real error, look it up offline,
   * apply a matching fix only when consensus is ≥90% (auto-apply
   * threshold) AND the fix is a single import line, verify by
   * re-running, and record the outcome. The file on disk only changes
   * when the fix is applied and the re-run passes; on failure the
   * file is reverted and the failure is recorded against the fix.
   *
   * Error mode: look the error up offline and present the fix, or
   * generate one. No file is involved, so fixApplied stays false.
   *
   * `fixApplied` is true ONLY when a file was written and verified.
   * Presenting or generating a solution never sets it.
   */
  private async _handleFixRequest(
    intent: ParsedIntent,
    startTime: number
  ): Promise<WorkflowResult> {
    const arg = (intent.target ?? '').trim();

    if (!arg) {
      return {
        success: false,
        output:
          'Usage: fix <file|error>\n' +
          '  fix broken_script.py — run the file, find the error, apply a verified fix\n' +
          '  fix ModuleNotFoundError: No module named requests — look up or generate a fix',
        executionTimeMs: Date.now() - startTime
      };
    }

    // File mode: the argument is an existing file path.
    const filePath = this._resolveFixFile(arg);
    if (filePath) {
      return await this._handleFixFile(filePath, intent, startTime);
    }
    if (this._looksLikeFilePath(arg)) {
      return {
        success: false,
        output: `❌ No such file: ${arg}`,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Error mode: the argument is an error message.
    return await this._handleFixErrorText(arg, intent, startTime);
  }

  /** Resolve `arg` to an existing file path, or null when it is not a file. */
  private _resolveFixFile(arg: string): string | null {
    const candidates = [arg, path.resolve(this.context.workingDirectory, arg)];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return path.resolve(candidate);
        }
      } catch {
        // Not a readable path — treat as error text below.
      }
    }
    return null;
  }

  /**
   * True when the argument looks like a bare file path (but does not
   * exist). An error message can contain '/' (a traceback) or end in
   * '.py', so a path must ALSO have no spaces — a bare path almost
   * never has one, an error message almost always does. A path with
   * spaces is the known edge case: it is treated as error text.
   */
  private _looksLikeFilePath(arg: string): boolean {
    if (/\s/.test(arg)) return false;
    return (
      arg.includes('/') ||
      arg.includes('\\') ||
      /\.(py|js|ts|sh|bash|json|md|txt)$/i.test(arg)
    );
  }

  /**
   * File mode: run the file, get the real error, look it up, and apply
   * a verified fix when one is safe to apply.
   */
  private async _handleFixFile(
    filePath: string,
    intent: ParsedIntent,
    startTime: number
  ): Promise<WorkflowResult> {
    const loadId = this.display.addLoading('Running file to find the error...');
    const run = await runFile(filePath);
    this.display.removeLoading(loadId);

    if (run.ok) {
      return {
        success: true,
        output: `✅ ${filePath} runs clean — nothing to fix.`,
        executionTimeMs: Date.now() - startTime
      };
    }

    const error = run.error || 'Unknown error';
    const fixResult = await this.fixnetRouter.findFix({ error });

    if (fixResult.success && !fixResult.needs_llm && fixResult.fix) {
      const grade = fixResult.quality;
      const score =
        grade && typeof grade.score === 'number' ? grade.score : 0;
      // Auto-apply only at ≥90% consensus. Below that the fix is
      // presented and the user applies it explicitly with
      // `fixnet apply <hash> <file>`.
      if (score >= AUTO_APPLY_THRESHOLD) {
        const applied = await this._applyImportFixToFile(
          filePath,
          fixResult.fix.solution,
          fixResult.fix.fix_hash,
          startTime
        );
        if (applied) return applied;
      }
      return {
        success: true,
        output:
          this._formatFixOutput(fixResult) +
          `\n\nFixNet found a fix (consensus ${Math.round(score * 100)}%, ` +
          `below the ${Math.round(AUTO_APPLY_THRESHOLD * 100)}% auto-apply bar). ` +
          `The file was not modified.\n` +
          `Apply it explicitly: fixnet apply ${fixResult.fix.fix_hash} ${filePath}`,
        executionTimeMs: Date.now() - startTime,
        fixApplied: false
      };
    }

    // No stored fix — pattern fast path (missing import / known name).
    const pattern = patternFixForError(error);
    if (pattern) {
      const original = fs.readFileSync(filePath, 'utf-8');
      const apply = applyImportFix(filePath, pattern);
      if (apply.applied) {
        const verify = await runFile(filePath);
        if (verify.ok) {
          await this.fixnetRouter.storeFix('pattern_fix', error, pattern, {
            file: filePath,
          });
          this.fixnetRouter.recordOutcome(hashFix(error, pattern), true);
          return {
            success: true,
            output:
              `🔧 Applied pattern fix to ${filePath}:\n${pattern}\n\n` +
              `✅ Verified: the file now runs clean.`,
            executionTimeMs: Date.now() - startTime,
            fixApplied: true,
            fixCount: 1,
            filePath
          };
        }
        revertFile(filePath, original);
        return {
          success: false,
          output:
            `❌ Pattern fix '${pattern}' did not resolve the error — the file was reverted.\n\n` +
            `Error after fix:\n${verify.error}`,
          executionTimeMs: Date.now() - startTime,
          fixApplied: false
        };
      }
      // The import is already present but the file still errors: the
      // pattern fix cannot help. Fall through to the LLM below.
    }

    // No offline fix and no pattern fix — LLM fallback (Tier 2).
    if (this.validator) {
      this.validator.startPhase('execute', 'Generating fix with LLM');
    }
    let result: { solution: string; tokenStats?: TokenStats } | undefined;
    let route: BypassRoute | undefined;
    try {
      ({ result, route } = await this.bypassRouter.executeQueued(
        async (model) => {
          return await this._generateFixWithModel(model, error);
        },
        'fix_generation'
      ));
    } catch (err) {
      // Same guard as the error-text path: a failed generation returns
      // a failure result instead of throwing out of processRequest.
      return {
        success: false,
        output:
          `❌ Could not generate a fix for this error — the model backend failed: ${(err as Error).message}. ` +
          'No fix was stored.',
        executionTimeMs: Date.now() - startTime,
        fixApplied: false
      };
    }

    if (result) {
      // V2 name-based validation: a fix for `name 'X' is not defined`
      // must import or define exactly X. An invalid fix is not stored
      // and is not presented as a fix.
      if (!validateFixForError(error, result.solution)) {
        return {
          success: false,
          output:
            '❌ The generated fix did not pass validation (it does not ' +
            'import or define the missing name) and was not stored.',
          bypassRoute: route,
          executionTimeMs: Date.now() - startTime
        };
      }
      await this.fixnetRouter.storeFix(
        'generated_fix',
        error,
        result.solution,
        { model: route.selected_model, tier: route.selected_tier }
      );
      const thinkingSteps = route.selected_tier >= 2
        ? this._generateThinkingSteps(error, intent, route.selected_tier)
        : undefined;
      if (this.validator) {
        this.validator.completePhase('execute', 'Fix generated successfully');
      }
      return {
        success: true,
        output:
          `${result.solution}\n\n` +
          `The file was not modified — this is a generated solution, not ` +
          `a verified file edit. Apply it by hand, or store it for later ` +
          `with 'fixnet search'.`,
        bypassRoute: route,
        executionTimeMs: Date.now() - startTime,
        fixApplied: false,
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
   * Error mode: look an error message up offline, then the pattern
   * fast path, then the LLM. No file is involved, so nothing is ever
   * written and fixApplied stays false.
   */
  private async _handleFixErrorText(
    error: string,
    intent: ParsedIntent,
    startTime: number
  ): Promise<WorkflowResult> {
    const loadId = this.display.addLoading('Searching FixNet...');
    const fixResult = await this.fixnetRouter.findFix({ error });
    this.display.removeLoading(loadId);

    if (fixResult.success && !fixResult.needs_llm && fixResult.fix) {
      return {
        success: true,
        output: this._formatFixOutput(fixResult),
        executionTimeMs: Date.now() - startTime,
        fixApplied: false,
        searchSegments: this.display.getSegments()
      };
    }

    const pattern = patternFixForError(error);
    if (pattern) {
      await this.fixnetRouter.storeFix('pattern_fix', error, pattern, {});
      return {
        success: true,
        output: `🔧 Pattern fix:\n${pattern}`,
        executionTimeMs: Date.now() - startTime,
        fixApplied: false
      };
    }

    if (this.validator) {
      this.validator.startPhase('execute', 'Generating fix with LLM');
    }
    let result: { solution: string; tokenStats?: TokenStats } | undefined;
    let route: BypassRoute | undefined;
    try {
      ({ result, route } = await this.bypassRouter.executeQueued(
        async (model) => {
          return await this._generateFixWithModel(model, error);
        },
        'fix_generation'
      ));
    } catch (err) {
      // A failed generation is a failed fix, not a crash: processRequest
      // must still return a result (its catch calls _handleError, which
      // would try the same failing router again and throw a second time).
      return {
        success: false,
        output:
          `❌ Could not generate a fix for this error — the model backend failed: ${(err as Error).message}. ` +
          'No fix was stored.',
        executionTimeMs: Date.now() - startTime
      };
    }

    if (result) {
      if (!validateFixForError(error, result.solution)) {
        return {
          success: false,
          output:
            '❌ The generated fix did not pass validation (it does not ' +
            'import or define the missing name) and was not stored.',
          bypassRoute: route,
          executionTimeMs: Date.now() - startTime
        };
      }
      await this.fixnetRouter.storeFix(
        'generated_fix',
        error,
        result.solution,
        { model: route.selected_model, tier: route.selected_tier }
      );
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
        fixApplied: false,
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
   * Apply a stored fix's solution to a file, verify by re-running, and
   * record the outcome. Returns null when the solution is not a single
   * import line — such a fix cannot be applied automatically, so the
   * caller presents it instead. The file is reverted when the re-run
   * still fails, and the failure is recorded against the fix.
   */
  private async _applyImportFixToFile(
    filePath: string,
    solution: string,
    fixHash: string,
    startTime: number
  ): Promise<WorkflowResult | null> {
    const importLine = extractImportLine(solution);
    if (!importLine) return null;

    let original: string;
    try {
      original = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      return {
        success: false,
        output: `❌ Could not read ${filePath}: ${(error as Error).message}`,
        executionTimeMs: Date.now() - startTime,
        fixApplied: false
      };
    }

    const apply = applyImportFix(filePath, importLine);
    if (!apply.applied) {
      // The import is already present but the file still errors: the
      // stored fix does not resolve this error. Record the failure.
      this.fixnetRouter.recordOutcome(fixHash, false);
      return {
        success: false,
        output:
          `❌ The stored fix '${importLine}' is already present in ` +
          `${filePath}, but the file still fails. The failure was ` +
          `recorded against the fix.`,
        executionTimeMs: Date.now() - startTime,
        fixApplied: false
      };
    }

    const verify = await runFile(filePath);
    if (verify.ok) {
      this.fixnetRouter.recordOutcome(fixHash, true);
      return {
        success: true,
        output:
          `🔧 Applied fix to ${filePath}:\n${importLine}\n\n` +
          `✅ Verified: the file now runs clean.`,
        executionTimeMs: Date.now() - startTime,
        fixApplied: true,
        fixCount: 1,
        filePath
      };
    }
    revertFile(filePath, original);
    this.fixnetRouter.recordOutcome(fixHash, false);
    return {
      success: false,
      output:
        `❌ Applied '${importLine}' but the file still fails — the file ` +
        `was reverted and the failure was recorded against the fix.\n\n` +
        `Error after fix:\n${verify.error}`,
      executionTimeMs: Date.now() - startTime,
      fixApplied: false
    };
  }

  /**
   * `fixnet report <hash> <success|failure>` — record whether a served
   * fix actually worked. Drives the consensus success factor, the
   * trust level, and the outcome-based success rate in stats.
   */
  private async _handleFixNetReport(
    rest: string,
    startTime: number
  ): Promise<WorkflowResult> {
    const parts = rest.split(/\s+/).filter(Boolean);
    const fixHash = parts[0] || '';
    const outcome = (parts[1] || '').toLowerCase();
    if (!fixHash || (outcome !== 'success' && outcome !== 'failure')) {
      return {
        success: false,
        output: 'Usage: fixnet report <fix_hash> <success|failure>',
        executionTimeMs: Date.now() - startTime
      };
    }
    const recorded = this.fixnetRouter.recordOutcome(
      fixHash,
      outcome === 'success'
    );
    if (!recorded) {
      return {
        success: false,
        output: `❌ No fix with hash ${fixHash} in the local dictionary.`,
        executionTimeMs: Date.now() - startTime
      };
    }
    const entry = this.fixnetRouter.getEntry(fixHash);
    const grade = this.fixnetRouter.gradeEntry(fixHash);
    const attempts =
      (entry?.success_count ?? 0) + (entry?.failure_count ?? 0);
    const lines = [
      `✅ Recorded ${outcome} for fix ${fixHash}.`,
      `Successes: ${entry?.success_count ?? 0}, failures: ${entry?.failure_count ?? 0} (${attempts} recorded outcome${attempts === 1 ? '' : 's'}).`,
    ];
    if (entry) {
      const relevance = Math.round(entry.relevance_score * 100);
      lines.push(`Relevance: ${relevance}%`);
    }
    if (grade) {
      lines.push(
        `Consensus: ${(grade.score * 100).toFixed(0)}% — ${grade.trust_level.replace('_', ' ')}.`
      );
    }
    return {
      success: true,
      output: lines.join('\n'),
      executionTimeMs: Date.now() - startTime
    };
  }

  /**
   * `fixnet apply <hash> [file]` — apply a stored fix to a file and
   * verify it by re-running. Records the outcome. A quarantined fix
   * is refused. A solution that is not a single import line is
   * presented, not written.
   */
  private async _handleFixNetApply(
    rest: string,
    startTime: number
  ): Promise<WorkflowResult> {
    const parts = rest.split(/\s+/).filter(Boolean);
    const fixHash = parts[0] || '';
    if (!fixHash) {
      return {
        success: false,
        output: 'Usage: fixnet apply <fix_hash> [file]',
        executionTimeMs: Date.now() - startTime
      };
    }
    const entry = this.fixnetRouter.getEntry(fixHash);
    if (!entry) {
      return {
        success: false,
        output: `❌ No fix with hash ${fixHash} in the local dictionary.`,
        executionTimeMs: Date.now() - startTime
      };
    }
    const grade = this.fixnetRouter.gradeEntry(fixHash);
    if (grade && !grade.safe_to_use) {
      return {
        success: false,
        output:
          `❌ Fix ${fixHash} is quarantined (consensus ` +
          `${(grade.score * 100).toFixed(0)}%) and will not be applied.`,
        executionTimeMs: Date.now() - startTime
      };
    }
    const fileArg = parts.slice(1).join(' ');
    const storedFile =
      typeof entry.meta?.filename === 'string' ? entry.meta.filename : '';
    const filePath = this._resolveFixFile(fileArg || storedFile);
    if (!filePath) {
      return {
        success: false,
        output:
          `❌ No file to apply fix ${fixHash} to.\n` +
          `Usage: fixnet apply <fix_hash> [file]` +
          (storedFile ? `\n(The fix was stored without a file.)` : ''),
        executionTimeMs: Date.now() - startTime
      };
    }
    const applied = await this._applyImportFixToFile(
      filePath,
      entry.solution,
      fixHash,
      startTime
    );
    if (applied) return applied;
    // Not an automatic file edit — present the solution instead.
    return {
      success: true,
      output:
        `🔧 Fix ${fixHash} for ${filePath}:\n\n${entry.solution}\n\n` +
        `This fix is a text solution, not a single import line, so it ` +
        `was not written to the file. Apply it by hand.`,
      executionTimeMs: Date.now() - startTime,
      fixApplied: false
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
    const { result, route } = await this.bypassRouter.executeQueued(
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
        filename: 'script.py',
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
    const { result, route } = await this.bypassRouter.executeQueued(
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
   * Handle errors during execution.
   *
   * NOTE: this handler only ever PRESENTS a fix — it never writes one
   * to a file. `fixApplied` therefore stays false here. (It used to
   * claim `fixApplied: true` on both success paths while only printing
   * the solution text.)
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
      // Found fix - present it (not applied: no file is involved here)
      return {
        success: true,
        output: `🔧 Found fix for error:\n\n${errorMessage}\n\nSuggested fix:\n${fixResult.fix?.solution}`,
        fixApplied: false,
        executionTimeMs: Date.now() - startTime
      };
    }
    
    // No fix found - generate with LLM. This is the last resort, so
    // it must not throw: a failing router returns the honest failure
    // below instead of crashing processRequest a second time.
    let result: { solution: string; tokenStats?: TokenStats } | undefined;
    let route: BypassRoute | undefined;
    try {
      ({ result, route } = await this.bypassRouter.executeQueued(
        async (model) => {
          return await this._generateFixWithModel(model, errorMessage);
        },
        'error_fix'
      ));
    } catch {
      return {
        success: false,
        output: `❌ Error occurred and no fix could be generated:\n${errorMessage}`,
        executionTimeMs: Date.now() - startTime
      };
    }

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
        fixApplied: false,
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
   * Format FixNet statistics as human-readable terminal output.
   * Same fields as LucidCore.getFixNetStats() (fixes/scripts/rates).
   *
   * Labels are honest about what each number measures:
   *   - "Dictionary hit rate" is offline lookups that found a stored
   *     fix (NOT a fix success rate — a hit only means an entry
   *     matched).
   *   - "Fix success rate" is recorded outcomes only (null until any
   *     outcome is recorded — no invented percentage).
   */
  private _formatFixNetStats(stats: FixNetStats): string {
    const hitRate = Math.round((stats.performance.offline_success_rate ?? 0) * 100);
    const outcomeRate = stats.performance.outcome_success_rate;
    const lines = [];
    lines.push('🔧 FixNet Statistics (local-only)');
    lines.push('');
    lines.push(`Fixes in dictionary: ${stats.dictionary.total_fixes}`);
    lines.push(`Scripts stored: ${stats.dictionary.total_scripts}`);
    lines.push(`Dictionary hit rate: ${hitRate}%`);
    lines.push(
      outcomeRate === null
        ? 'Fix success rate: no outcomes recorded yet'
        : `Fix success rate: ${Math.round(outcomeRate * 100)}% (${stats.performance.total_attempts} recorded outcome${stats.performance.total_attempts === 1 ? '' : 's'})`
    );
    return lines.join('\n');
  }

  /**
   * Format FixNet dictionary search results as human-readable output.
   * Each result carries the stored entry fields plus `match_score`.
   */
  private _formatFixNetSearchResults(query: string, results: any[]): string {
    const lines = [];
    lines.push(`🔧 FixNet Search: "${query}"`);
    lines.push('');
    if (results.length === 0) {
      lines.push('No fixes found.');
      return lines.join('\n');
    }
    lines.push(`Found ${results.length} fix${results.length === 1 ? '' : 'es'}:`);
    results.forEach((result, index) => {
      lines.push('');
      lines.push(`${index + 1}. ${result.error_signature || '(no error signature)'}`);
      if (typeof result.match_score === 'number') {
        lines.push(`   Match score: ${result.match_score.toFixed(2)}`);
      }
      if (result.solution) {
        lines.push(`   Solution: ${result.solution}`);
      }
    });
    return lines.join('\n');
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
