/**
 * ValidationIndicator Component
 * 
 * Warp AI-style validation steps with checkmarks/crosses.
 * Integrated with LuciferAI's complete routing architecture.
 * 
 * Shows real-time validation for:
 * - Command parsing
 * - Route detection (15 categories)
 * - Model selection (tier-based bypass routing)
 * - FixNet operations (5-step workflow)
 * - Script creation (multi-step workflow)
 * - Execution and completion
 */

import { Check, X, Loader2, AlertCircle } from 'lucide-react';
import type { ValidationStep } from '../../types/plugin';

interface ValidationIndicatorProps {
  step: ValidationStep;
  compact?: boolean;
}

export function ValidationIndicator({ step, compact = false }: ValidationIndicatorProps) {
  const getIcon = () => {
    switch (step.status) {
      case 'pending':
        return <AlertCircle size={12} className="text-gray-400" />;
      case 'running':
        return <Loader2 size={12} className="animate-spin text-yellow-500" />;
      case 'success':
        return <Check size={12} className="text-green-500 font-bold" />;
      case 'error':
        return <X size={12} className="text-red-500 font-bold" />;
    }
  };
  
  const getStatusColor = () => {
    switch (step.status) {
      case 'pending': return 'text-gray-400';
      case 'running': return 'text-yellow-400';
      case 'success': return 'text-gray-300';
      case 'error': return 'text-red-400';
    }
  };
  
  if (compact) {
    // Compact mode: just icon
    return (
      <span className="inline-flex items-center" title={`${step.label}${step.message ? `: ${step.message}` : ''}`}>
        {getIcon()}
      </span>
    );
  }
  
  return (
    <div className={`flex items-start gap-2 text-xs font-mono py-1 transition-all duration-200 ${getStatusColor()}`}>
      <span className="flex-shrink-0 mt-0.5">
        {getIcon()}
      </span>
      <div className="flex-1 min-w-0">
        <span className="font-medium">{step.label}</span>
        {step.message && (
          <span className="ml-2 text-gray-500">
            → {step.message}
          </span>
        )}
      </div>
      {step.status === 'running' && (
        <span className="text-gray-600 text-xs animate-pulse">...</span>
      )}
    </div>
  );
}

/**
 * ValidationSteps Component
 * 
 * Displays a complete list of validation steps for a command block.
 * Matches LuciferAI's routing architecture with 15 route categories.
 */

interface ValidationStepsProps {
  steps: ValidationStep[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ValidationSteps({ steps, collapsed = false, onToggleCollapse }: ValidationStepsProps) {
  if (steps.length === 0) return null;
  
  const allComplete = steps.every(s => s.status === 'success' || s.status === 'error');
  const hasError = steps.some(s => s.status === 'error');
  
  return (
    <div className="validation-steps-container my-2">
      {/* Header with collapse toggle */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-500 font-medium">Validation:</span>
        {allComplete && (
          <button
            onClick={onToggleCollapse}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {collapsed ? 'Show' : 'Hide'} {steps.length} steps
          </button>
        )}
        <div className="flex-1 flex items-center gap-1">
          {steps.map((step, i) => (
            <ValidationIndicator key={step.id || i} step={step} compact={true} />
          ))}
        </div>
      </div>
      
      {/* Detailed steps (collapsible) */}
      {!collapsed && (
        <div className="border-l-2 border-gray-700 pl-3 space-y-0.5">
          {steps.map((step, i) => (
            <ValidationIndicator key={step.id || i} step={step} />
          ))}
        </div>
      )}
      
      {/* Final status message */}
      {allComplete && (
        <div className={`mt-1 text-xs font-medium ${hasError ? 'text-red-400' : 'text-green-400'}`}>
          {hasError ? '✗ Command failed' : '✓ Command completed'}
        </div>
      )}
    </div>
  );
}

/**
 * LuciferAI Validation Step Generators
 * 
 * Factory functions to create validation steps for different LuciferAI routes.
 * Matches the 15 route categories from COMPLETE_ROUTING_ARCHITECTURE.md
 */

export const ValidationStepFactory = {
  // Category 1: Direct System Commands (help, exit, clear)
  directSystemCommand: (command: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now(),
      message: `Detected: ${command}`
    },
    {
      id: 'route',
      label: 'Route to handler',
      status: 'success',
      timestamp: Date.now(),
      message: 'Direct system command (no LLM)'
    },
    {
      id: 'execute',
      label: 'Execute',
      status: 'running',
      timestamp: Date.now()
    }
  ],
  
  // Category 2: LLM Management (llm list, llm enable)
  llmManagement: (action: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now(),
      message: `LLM management: ${action}`
    },
    {
      id: 'route',
      label: 'Route to handler',
      status: 'success',
      timestamp: Date.now(),
      message: 'Direct handler (no LLM needed)'
    },
    {
      id: 'execute',
      label: 'Execute',
      status: 'running',
      timestamp: Date.now()
    }
  ],
  
  // Category 3: Model Installation
  modelInstallation: (modelName: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now(),
      message: `Install: ${modelName}`
    },
    {
      id: 'check',
      label: 'Check model availability',
      status: 'running',
      timestamp: Date.now()
    },
    {
      id: 'download',
      label: 'Download model',
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'verify',
      label: 'Verify installation',
      status: 'pending',
      timestamp: Date.now()
    }
  ],
  
  // Category 11: Multi-Step Script Creation (make script that...)
  multiStepScriptCreation: (scriptName: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now(),
      message: 'Script creation request detected'
    },
    {
      id: 'route',
      label: 'Route to handler',
      status: 'success',
      timestamp: Date.now(),
      message: 'Multi-step script creation workflow'
    },
    {
      id: 'checklist',
      label: 'Generate task checklist',
      status: 'running',
      timestamp: Date.now()
    },
    {
      id: 'model',
      label: 'Select model (bypass routing)',
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'create',
      label: `Create ${scriptName}`,
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'write',
      label: 'Write code to file',
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'verify',
      label: 'Verify file exists',
      status: 'pending',
      timestamp: Date.now()
    }
  ],
  
  // Category 5: FixNet Auto-Fix (5-step workflow)
  fixNetAutoFix: (scriptName: string): ValidationStep[] => [
    {
      id: 'detect',
      label: 'Detect error',
      status: 'success',
      timestamp: Date.now()
    },
    {
      id: 'search',
      label: 'Step 1/5: Search similar fixes',
      status: 'running',
      timestamp: Date.now(),
      message: 'Checking local dictionary'
    },
    {
      id: 'apply_known',
      label: 'Step 2/5: Apply known fix',
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'generate',
      label: 'Step 3/5: Generate new fix',
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'apply_new',
      label: 'Step 4/5: Apply new fix',
      status: 'pending',
      timestamp: Date.now()
    },
    {
      id: 'upload',
      label: 'Step 5/5: Upload to FixNet',
      status: 'pending',
      timestamp: Date.now(),
      message: 'Smart filter will decide'
    }
  ],
  
  // Category 14: General LLM Query
  generalLLMQuery: (modelName?: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now(),
      message: 'Natural language query'
    },
    {
      id: 'check_llm',
      label: 'Check LLM availability',
      status: 'running',
      timestamp: Date.now()
    },
    {
      id: 'select_model',
      label: 'Select best model',
      status: 'pending',
      timestamp: Date.now(),
      message: modelName || 'Bypass routing'
    },
    {
      id: 'generate',
      label: 'Generate response',
      status: 'pending',
      timestamp: Date.now()
    }
  ],
  
  // Generic shell command (for terminal direct execution)
  shellCommand: (command: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now(),
      message: command.split(' ')[0]
    },
    {
      id: 'route',
      label: 'Route to handler',
      status: 'success',
      timestamp: Date.now(),
      message: 'Direct shell execution'
    },
    {
      id: 'execute',
      label: 'Execute in PTY',
      status: 'running',
      timestamp: Date.now()
    }
  ],
  
  // Plugin-based command (for future plugin system)
  pluginCommand: (pluginName: string, capability: string): ValidationStep[] => [
    {
      id: 'parse',
      label: 'Parse command',
      status: 'success',
      timestamp: Date.now()
    },
    {
      id: 'find_plugin',
      label: 'Find capable plugin',
      status: 'running',
      timestamp: Date.now(),
      message: `Needs: ${capability}`
    },
    {
      id: 'route',
      label: 'Route to plugin',
      status: 'pending',
      timestamp: Date.now(),
      message: pluginName
    },
    {
      id: 'execute',
      label: 'Execute via plugin',
      status: 'pending',
      timestamp: Date.now()
    }
  ]
};

/**
 * Update validation step status
 * 
 * Helper function to update a specific step's status in a validation array.
 */
export function updateValidationStep(
  steps: ValidationStep[],
  stepId: string,
  updates: Partial<ValidationStep>
): ValidationStep[] {
  return steps.map(step =>
    step.id === stepId
      ? { ...step, ...updates, timestamp: Date.now() }
      : step
  );
}

/**
 * Auto-progress validation steps
 * 
 * Automatically progress through pending steps when previous completes.
 */
export function autoProgressValidation(steps: ValidationStep[]): ValidationStep[] {
  let newSteps = [...steps];
  
  // Find first running step
  const runningIndex = newSteps.findIndex(s => s.status === 'running');
  
  if (runningIndex === -1) {
    // No running step, find first pending and start it
    const pendingIndex = newSteps.findIndex(s => s.status === 'pending');
    if (pendingIndex !== -1) {
      newSteps[pendingIndex] = {
        ...newSteps[pendingIndex],
        status: 'running',
        timestamp: Date.now()
      };
    }
  }
  
  return newSteps;
}
