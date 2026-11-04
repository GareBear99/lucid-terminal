/**
 * Lucid Terminal Core - Public API
 * 
 * Main entry point for importing Lucid Terminal components
 */

// Main system
export { default as LucidCore, createCLI } from './lucidCore';
export type { LucidConfig } from './lucidCore';

// Workflow
export { WorkflowOrchestrator } from './workflow/workflowOrchestrator';
export type { WorkflowContext, WorkflowResult } from './workflow/workflowOrchestrator';

// FixNet
export { FixNetRouter } from './fixnet/fixnetRouter';
export type { FixRequest, FixResponse } from './fixnet/fixnetRouter';
export { FixDictionary } from './fixnet/fixDictionary';
export { ConsensusEngine } from './fixnet/consensusEngine';
export { OfflineMatcher } from './fixnet/offlineMatcher';

// LLM
export { BypassRouter } from './llm/bypassRouter';
export type { BypassRoute, ModelStatus } from './llm/bypassRouter';
export { ModelBackend, ModelBackendManager } from './llm/modelBackend';
export type { ModelConfig, GenerationRequest, GenerationResponse } from './llm/modelBackend';

// Tracking
export { TokenTracker } from './tracking/tokenTracker';
export type { TokenStats, SessionStats } from './tracking/tokenTracker';

// Display
export { CommandDisplay } from './display/commandDisplay';
export type { CommandBlock } from './display/commandDisplay';

// Parser
export { IntentParser } from './parser/intentParser';
export type { ParsedIntent } from './parser/intentParser';

// Models
export { ModelTierRegistry, getModelTier, getTierName } from './models/modelTiers';
export type { ModelTier } from './models/modelTiers';

// Tools
export { ToolRegistry } from './tools/toolRegistry';
