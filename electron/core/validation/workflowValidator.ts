/**
 * Workflow Validator
 * 
 * Warp AI-style validation flow with complete phase tracking:
 * Parse → Route → Execute → Validate → Complete
 * 
 * Each phase has checkmarks (✓) that appear as work progresses.
 * Provides real-time feedback matching Warp AI's interface.
 */

import { ValidationStep } from '../../../src/types/plugin';

export type ValidationPhase = 'parse' | 'route' | 'execute' | 'validate' | 'complete';

export interface WorkflowValidationState {
  phases: Map<ValidationPhase, ValidationStep>;
  currentPhase: ValidationPhase | null;
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: string;
}

export class WorkflowValidator {
  private state: WorkflowValidationState;
  private callbacks: Array<(state: WorkflowValidationState) => void> = [];
  
  constructor() {
    this.state = {
      phases: new Map(),
      currentPhase: null,
      startTime: Date.now(),
      success: false
    };
    
    this._initializePhases();
  }
  
  private _initializePhases(): void {
    const phases: ValidationPhase[] = ['parse', 'route', 'execute', 'validate', 'complete'];
    
    for (const phase of phases) {
      this.state.phases.set(phase, {
        id: phase,
        label: this._getPhaseLabel(phase),
        status: 'pending',
        timestamp: Date.now()
      });
    }
  }
  
  private _getPhaseLabel(phase: ValidationPhase): string {
    const labels = {
      parse: 'Parse command',
      route: 'Route to handler',
      execute: 'Execute operation',
      validate: 'Validate output',
      complete: 'Complete workflow'
    };
    return labels[phase];
  }
  
  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: WorkflowValidationState) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Notify all subscribers
   */
  private _notify(): void {
    for (const callback of this.callbacks) {
      callback(this.state);
    }
  }
  
  /**
   * Start a validation phase
   */
  startPhase(phase: ValidationPhase, message?: string): void {
    this.state.currentPhase = phase;
    
    const step = this.state.phases.get(phase);
    if (step) {
      step.status = 'running';
      step.timestamp = Date.now();
      if (message) {
        step.message = message;
      }
    }
    
    this._notify();
  }
  
  /**
   * Complete a validation phase successfully
   */
  completePhase(phase: ValidationPhase, message?: string): void {
    const step = this.state.phases.get(phase);
    if (step) {
      step.status = 'success';
      step.timestamp = Date.now();
      if (message) {
        step.message = message;
      }
    }
    
    // Move to next phase automatically
    const phases: ValidationPhase[] = ['parse', 'route', 'execute', 'validate', 'complete'];
    const currentIndex = phases.indexOf(phase);
    if (currentIndex < phases.length - 1) {
      this.state.currentPhase = phases[currentIndex + 1];
    }
    
    this._notify();
  }
  
  /**
   * Fail a validation phase
   */
  failPhase(phase: ValidationPhase, error: string): void {
    const step = this.state.phases.get(phase);
    if (step) {
      step.status = 'error';
      step.timestamp = Date.now();
      step.message = error;
    }
    
    this.state.success = false;
    this.state.error = error;
    this.state.endTime = Date.now();
    this.state.currentPhase = null;
    
    this._notify();
  }
  
  /**
   * Complete entire workflow successfully
   */
  completeWorkflow(): void {
    // Mark complete phase as success
    const completeStep = this.state.phases.get('complete');
    if (completeStep) {
      completeStep.status = 'success';
      completeStep.timestamp = Date.now();
    }
    
    this.state.success = true;
    this.state.endTime = Date.now();
    this.state.currentPhase = null;
    
    this._notify();
  }
  
  /**
   * Get all validation steps for display
   */
  getSteps(): ValidationStep[] {
    return Array.from(this.state.phases.values());
  }
  
  /**
   * Get validation state for reporting
   */
  getState(): WorkflowValidationState {
    return { ...this.state };
  }
  
  /**
   * Check if workflow is complete
   */
  isComplete(): boolean {
    return this.state.endTime !== undefined;
  }
  
  /**
   * Get workflow duration in ms
   */
  getDuration(): number {
    if (this.state.endTime) {
      return this.state.endTime - this.state.startTime;
    }
    return Date.now() - this.state.startTime;
  }
}

/**
 * Validation Flow Templates
 * Pre-built validation flows for common command types
 */

export class ValidationFlowTemplates {
  
  /**
   * Standard LLM command flow (most common)
   * Parse → Route → Execute (with LLM) → Validate → Complete
   */
  static standardLLMCommand(): WorkflowValidator {
    const validator = new WorkflowValidator();
    
    // Start with parsing
    validator.startPhase('parse');
    
    return validator;
  }
  
  /**
   * Direct command flow (no LLM needed)
   * Parse → Route → Execute → Complete
   * Skips LLM validation step
   */
  static directCommand(commandName: string): WorkflowValidator {
    const validator = new WorkflowValidator();
    
    validator.startPhase('parse', `Detected: ${commandName}`);
    
    return validator;
  }
  
  /**
   * FixNet command flow (5-step FixNet workflow)
   * Parse → Route → Execute (FixNet multi-step) → Validate → Complete
   */
  static fixNetCommand(errorType: string): WorkflowValidator {
    const validator = new WorkflowValidator();
    
    validator.startPhase('parse', `Error type: ${errorType}`);
    
    return validator;
  }
  
  /**
   * Model bypass routing flow (shows tier bypass)
   * Parse → Route (with tier info) → Execute → Validate → Complete
   */
  static bypassRoutingCommand(startTier: number): WorkflowValidator {
    const validator = new WorkflowValidator();
    
    validator.startPhase('parse');
    
    return validator;
  }
}

/**
 * Validation Helper Functions
 * Utilities for creating validation steps
 */

export class ValidationHelpers {
  
  /**
   * Create parse phase validation steps
   */
  static createParseSteps(intent: string, confidence: number): void {
    console.log(`[Validation] Parse: ${intent} (confidence: ${(confidence * 100).toFixed(0)}%)`);
  }
  
  /**
   * Create route phase validation steps  
   */
  static createRouteSteps(route: string, category: string): void {
    console.log(`[Validation] Route: ${route} (category: ${category})`);
  }
  
  /**
   * Create execute phase validation steps
   */
  static createExecuteSteps(executor: string, model?: string): void {
    if (model) {
      console.log(`[Validation] Execute: ${executor} using ${model}`);
    } else {
      console.log(`[Validation] Execute: ${executor} (no LLM)`);
    }
  }
  
  /**
   * Create validate phase validation steps
   */
  static createValidateSteps(validationType: string, result: boolean): void {
    const status = result ? '✓' : '✗';
    console.log(`[Validation] Validate: ${validationType} ${status}`);
  }
  
  /**
   * Create complete phase validation steps
   */
  static createCompleteSteps(duration: number, tokenCount?: number): void {
    const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`;
    if (tokenCount) {
      console.log(`[Validation] Complete: ${durationStr} (${tokenCount} tokens)`);
    } else {
      console.log(`[Validation] Complete: ${durationStr}`);
    }
  }
}

/**
 * Integration with workflow orchestrator
 * 
 * Usage example:
 * 
 * const validator = ValidationFlowTemplates.standardLLMCommand();
 * 
 * validator.subscribe((state) => {
 *   // Update UI with validation steps
 *   updateUI(validator.getSteps());
 * });
 * 
 * // Phase 1: Parse
 * validator.completePhase('parse', 'Intent: code_generation');
 * 
 * // Phase 2: Route
 * validator.startPhase('route');
 * const route = await bypassRouter.executeWithBypass(...);
 * validator.completePhase('route', `Using ${route.selected_model} (Tier ${route.selected_tier})`);
 * 
 * // Phase 3: Execute
 * validator.startPhase('execute', 'Generating code...');
 * const result = await backend.generate(...);
 * validator.completePhase('execute');
 * 
 * // Phase 4: Validate
 * validator.startPhase('validate', 'Checking syntax...');
 * const isValid = checkSyntax(result);
 * if (isValid) {
 *   validator.completePhase('validate', 'Syntax valid');
 * } else {
 *   validator.failPhase('validate', 'Syntax errors found');
 *   return;
 * }
 * 
 * // Phase 5: Complete
 * validator.completeWorkflow();
 */
