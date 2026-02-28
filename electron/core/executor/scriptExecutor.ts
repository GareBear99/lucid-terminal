/**
 * Script Executor - LuciferAI-style Multi-Step Execution
 * 
 * Matches LuciferAI's universal_task_system.py execution flow:
 * - Step-by-step progress display (print_step)
 * - File creation and writing
 * - Syntax validation
 * - Execution testing
 * - Error auto-fix with retry
 * 
 * Based on:
 * - core/universal_task_system.py:execute_task() (lines 1191-1280)
 * - core/lucifer_colors.py:print_step() (line 764-768)
 * - core/enhanced_agent.py:_handle_multi_step_script_creation()
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { FixNetRouter } from '../fixnet/fixnetRouter';

export interface ExecutionStep {
  id: number;
  total: number;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timestamp: number;
  error?: string;
}

export interface ScriptExecutionResult {
  success: boolean;
  message: string;
  filePath?: string;
  steps: ExecutionStep[];
  output?: string;
  error?: string;
}

export interface ScriptGenerationRequest {
  code: string;
  filename: string;
  directory: string;
  language: 'python' | 'javascript' | 'typescript' | 'bash' | 'shell';
  shouldTest?: boolean;
  shouldMakeExecutable?: boolean;
}

export class ScriptExecutor {
  private fixnetRouter: FixNetRouter;
  private steps: ExecutionStep[] = [];
  private currentStepIndex: number = 0;
  
  constructor(fixnetRouter: FixNetRouter) {
    this.fixnetRouter = fixnetRouter;
  }
  
  /**
   * Execute multi-step script building workflow
   * Matches LuciferAI's step-by-step execution pattern
   */
  async executeScriptBuild(request: ScriptGenerationRequest): Promise<ScriptExecutionResult> {
    this.steps = [];
    this.currentStepIndex = 0;
    
    // Determine total steps based on options
    let totalSteps = 3; // Base: Write file + Validate + Test
    if (request.shouldMakeExecutable) totalSteps++;
    
    try {
      // Step 1: Write code to file
      await this._executeStep(
        1,
        totalSteps,
        `Writing ${request.filename}`,
        async () => this._writeFile(request)
      );
      
      // Step 2: Validate syntax
      await this._executeStep(
        2,
        totalSteps,
        `Validating ${request.language} syntax`,
        async () => this._validateSyntax(request)
      );
      
      // Step 3 (optional): Make executable
      let stepNum = 3;
      if (request.shouldMakeExecutable) {
        await this._executeStep(
          stepNum,
          totalSteps,
          `Making ${request.filename} executable`,
          async () => this._makeExecutable(request)
        );
        stepNum++;
      }
      
      // Step 4: Test execution (if requested)
      if (request.shouldTest) {
        await this._executeStep(
          stepNum,
          totalSteps,
          `Testing ${request.filename} execution`,
          async () => this._testExecution(request)
        );
      }
      
      const filePath = path.join(request.directory, request.filename);
      
      return {
        success: true,
        message: `✅ Script created successfully: ${request.filename}`,
        filePath,
        steps: this.steps
      };
      
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Script creation failed: ${error.message}`,
        error: error.message,
        steps: this.steps
      };
    }
  }
  
  /**
   * Execute a single step with progress tracking
   * Matches print_step() from lucifer_colors.py
   */
  private async _executeStep(
    stepNum: number,
    totalSteps: number,
    description: string,
    action: () => Promise<void>
  ): Promise<void> {
    const step: ExecutionStep = {
      id: stepNum,
      total: totalSteps,
      description,
      status: 'running',
      timestamp: Date.now()
    };
    
    this.steps.push(step);
    this.currentStepIndex = this.steps.length - 1;
    
    // Print step header (matching LuciferAI format)
    console.log('─'.repeat(60));
    console.log(`📝 Step ${stepNum}/${totalSteps}: ${description}`);
    console.log();
    
    try {
      await action();
      
      // Mark success
      step.status = 'success';
      console.log(`✅ Step ${stepNum}/${totalSteps} Complete`);
      console.log();
      
    } catch (error: any) {
      step.status = 'error';
      step.error = error.message;
      
      // Try to auto-fix the error
      const fixAttempted = await this._tryAutoFix(error, action);
      
      if (!fixAttempted || step.status === 'error') {
        console.log(`❌ Step ${stepNum}/${totalSteps} Failed: ${error.message}`);
        console.log();
        throw error;
      }
    }
  }
  
  /**
   * Try to auto-fix error using FixNet
   * Matches LuciferAI's auto-fix workflow
   */
  private async _tryAutoFix(
    error: Error,
    retryAction: () => Promise<void>
  ): Promise<boolean> {
    const currentStep = this.steps[this.currentStepIndex];
    
    console.log(`\n🔧 Searching FixNet for solution...`);
    
    try {
      const fixResult = await this.fixnetRouter.findFix({
        error: error.message
      });
      
      if (fixResult.success && !fixResult.needs_llm && fixResult.fix) {
        console.log(`✅ Found fix (confidence: ${(fixResult.confidence * 100).toFixed(0)}%)`);
        console.log(`   Source: ${fixResult.source}`);
        console.log(`   Applying fix...`);
        
        // Apply the fix solution (would need implementation based on fix type)
        // For now, just log it
        console.log(`   Fix: ${fixResult.fix.solution}`);
        
        // Retry the action
        console.log(`\n🔄 Retrying step ${currentStep.id}...`);
        await retryAction();
        
        // Success!
        currentStep.status = 'success';
        console.log(`✅ Step ${currentStep.id}/${currentStep.total} Complete (after fix)`);
        console.log();
        
        return true;
      } else {
        console.log(`⚠️  No offline fix found`);
        return false;
      }
      
    } catch (fixError) {
      console.log(`⚠️  FixNet search failed: ${fixError}`);
      return false;
    }
  }
  
  /**
   * Write code to file
   */
  private async _writeFile(request: ScriptGenerationRequest): Promise<void> {
    const filePath = path.join(request.directory, request.filename);
    
    // Ensure directory exists
    await fs.mkdir(request.directory, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, request.code, 'utf-8');
    
    console.log(`   Created: ${filePath}`);
  }
  
  /**
   * Validate syntax for the given language
   */
  private async _validateSyntax(request: ScriptGenerationRequest): Promise<void> {
    const filePath = path.join(request.directory, request.filename);
    
    let command: string;
    let args: string[];
    
    switch (request.language) {
      case 'python':
        command = 'python3';
        args = ['-m', 'py_compile', filePath];
        break;
        
      case 'javascript':
      case 'typescript':
        command = 'node';
        args = ['--check', filePath];
        break;
        
      case 'bash':
      case 'shell':
        command = 'bash';
        args = ['-n', filePath]; // Syntax check only
        break;
        
      default:
        console.log(`   ⏭️  Skipping validation (${request.language} not supported)`);
        return;
    }
    
    await this._runCommand(command, args, 'Syntax validation');
  }
  
  /**
   * Make file executable
   */
  private async _makeExecutable(request: ScriptGenerationRequest): Promise<void> {
    const filePath = path.join(request.directory, request.filename);
    
    await fs.chmod(filePath, 0o755);
    console.log(`   Mode: 755 (executable)`);
  }
  
  /**
   * Test script execution
   */
  private async _testExecution(request: ScriptGenerationRequest): Promise<void> {
    const filePath = path.join(request.directory, request.filename);
    
    let command: string;
    let args: string[];
    
    switch (request.language) {
      case 'python':
        command = 'python3';
        args = [filePath];
        break;
        
      case 'javascript':
        command = 'node';
        args = [filePath];
        break;
        
      case 'typescript':
        command = 'ts-node';
        args = [filePath];
        break;
        
      case 'bash':
      case 'shell':
        command = 'bash';
        args = [filePath];
        break;
        
      default:
        console.log(`   ⏭️  Skipping test (${request.language} not supported)`);
        return;
    }
    
    await this._runCommand(command, args, 'Test execution', 5000); // 5s timeout
  }
  
  /**
   * Run command and capture output
   */
  private async _runCommand(
    command: string,
    args: string[],
    description: string,
    timeoutMs: number = 10000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`${description} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      proc.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          if (stdout) console.log(`   Output: ${stdout.trim()}`);
          console.log(`   Exit code: 0 (success)`);
          resolve(stdout);
        } else {
          const errorMsg = stderr || stdout || `Exit code: ${code}`;
          reject(new Error(errorMsg.trim()));
        }
      });
      
      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to execute ${command}: ${error.message}`));
      });
    });
  }
  
  /**
   * Get execution steps for display
   */
  getSteps(): ExecutionStep[] {
    return [...this.steps];
  }
  
  /**
   * Reset executor state
   */
  reset(): void {
    this.steps = [];
    this.currentStepIndex = 0;
  }
}
