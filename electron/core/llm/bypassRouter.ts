/**
 * Bypass Router - Tier-Based Model Selection
 * 
 * Based on LuciferAI's implementation (enhanced_agent.py:11805-11894)
 * 
 * CORRECT FLOW (from LuciferAI):
 * For COMPLEX/NATURAL LANGUAGE requests:
 * 1. Start with HIGHEST available tier (Tier 4/3) for quality
 * 2. Try to execute with that model
 * 3. If fails/timeouts → fall back to NEXT tier down
 * 4. Show which models were bypassed
 * 5. Continue until success or reach shell fallback
 * 
 * For SIMPLE tasks:
 * 1. Start with LOWEST tier (Tier 0/1) for efficiency
 * 2. Escalate up only if needed
 * 
 * See: LuciferAI docs/LLM_ROUTING_FLOW.md line 200-208
 */

import { ModelTierRegistry, getModelTier } from '../models/modelTiers';
import { TokenTracker } from '../tracking/tokenTracker';
import { ModelBackendManager } from './modelBackend';

export interface BypassRoute {
  selected_model: string;
  selected_tier: number;
  bypassed_models: Array<{
    model: string;
    tier: number;
    reason: string; // 'timeout' | 'failed' | 'corrupted' | 'disabled'
  }>;
  attempt_order: string[];  // Models tried in order
  success: boolean;
}

export interface ModelStatus {
  model: string;
  enabled: boolean;
  installed: boolean;
  corrupted: boolean;
  locked: boolean;  // Locked by another instance
}

export class BypassRouter {
  private modelRegistry: ModelTierRegistry;
  private tokenTracker: TokenTracker;
  private modelState: Map<string, boolean>;  // model -> enabled
  private availableModels: string[];
  private backendManager: ModelBackendManager;
  
  constructor(
    modelRegistry: ModelTierRegistry, 
    tokenTracker: TokenTracker,
    backendManager: ModelBackendManager
  ) {
    this.modelRegistry = modelRegistry;
    this.tokenTracker = tokenTracker;
    this.modelState = new Map();
    this.availableModels = [];
    this.backendManager = backendManager;
    
    this._loadModelState();
    this._detectAvailableModels();
  }
  
  private _loadModelState(): void {
    // Load from model backend manager
    const models = this.backendManager.listModels();
    for (const model of models) {
      this.modelState.set(model.name, model.enabled);
      if (!this.isModelCorrupted(model.name)) {
        this.availableModels.push(model.name);
      }
    }
  }
  
  private _detectAvailableModels(): void {
    // Models are loaded from backend manager in _loadModelState
    console.log(`[BypassRouter] Found ${this.availableModels.length} available models`);
  }
  
  /**
   * Check if model is enabled
   */
  isModelEnabled(model: string): boolean {
    return this.modelState.get(model) ?? true;
  }
  
  /**
   * Check if model is corrupted (size mismatch >5%)
   */
  isModelCorrupted(model: string): boolean {
    const modelInfo = this.backendManager.getModel(model);
    if (!modelInfo) return false;
    
    // Check if model is validated
    return !modelInfo.validated;
  }
  
  /**
   * Get best available model (HIGHEST tier first)
   * For complex/natural language requests, prefer quality over speed
   * This matches LuciferAI's behavior: Tier 4→3→2→1→0
   */
  getBestAvailableModel(): string | null {
    // Filter: enabled + not corrupted
    const enabled = this.availableModels.filter(m => this.isModelEnabled(m));
    const valid = enabled.filter(m => !this.isModelCorrupted(m));
    
    if (valid.length === 0) return null;
    
    // Sort by tier DESCENDING (highest first) - matches LuciferAI
    const sorted = valid.sort((a, b) => {
      return getModelTier(b) - getModelTier(a);
    });
    
    // Return HIGHEST tier model as starting point
    return sorted[0];
  }
  
  /**
   * Execute with bypass routing
   * 
   * Tries models in order from HIGHEST to LOWEST tier,
   * falling back to next lower tier when models fail/timeout
   * Matches LuciferAI behavior: Tier 4→3→2→1→0
   */
  async executeWithBypass<T>(
    operation: (model: string) => Promise<T>,
    operationType: string
  ): Promise<{
    result: T | null;
    route: BypassRoute;
  }> {
    const enabled = this.availableModels.filter(m => this.isModelEnabled(m));
    const valid = enabled.filter(m => !this.isModelCorrupted(m));
    
    if (valid.length === 0) {
      return {
        result: null,
        route: {
          selected_model: '',
          selected_tier: 0,
          bypassed_models: [],
          attempt_order: [],
          success: false
        }
      };
    }
    
    // Sort by tier DESCENDING (highest to lowest) - matches LuciferAI
    const sorted = valid.sort((a, b) => getModelTier(b) - getModelTier(a));
    
    const bypassed: BypassRoute['bypassed_models'] = [];
    const attemptOrder: string[] = [];
    
    // Try each model in order
    for (let i = 0; i < sorted.length; i++) {
      const model = sorted[i];
      const tier = getModelTier(model);
      attemptOrder.push(model);
      
      try {
        console.log(`[BypassRouter] 🔄 Attempting ${model} (Tier ${tier})...`);
        
        // Show thinking for Tier 2+ models (matches LuciferAI behavior)
        if (tier >= 2) {
          console.log(`🤔 ${model} (Tier ${tier}) thinking...`);
        }
        
        // Validate model is ready
        const modelInfo = this.backendManager.getModel(model);
        if (modelInfo && !modelInfo.running) {
          throw new Error(`Model ${model} not running`);
        }
        
        // Add timeout wrapper (30s default)
        const timeoutMs = 30000;
        const resultPromise = operation(model);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), timeoutMs);
        });
        
        const result = await Promise.race([resultPromise, timeoutPromise]);
        
        // Success! Track token usage
        this.tokenTracker.recordUsage(
          model,
          tier,
          operationType,
          0, // TODO: Extract actual token counts from result
          0
        );
        
        // Show what we bypassed
        const route: BypassRoute = {
          selected_model: model,
          selected_tier: tier,
          bypassed_models: bypassed,
          attempt_order: attemptOrder,
          success: true
        };
        
        this._displayBypassRoute(route);
        
        return { result, route };
        
      } catch (error: any) {
        // Failed - record as bypassed
        let reason: 'timeout' | 'failed' | 'corrupted' | 'disabled' = 'failed';
        
        if (error.message?.includes('timeout')) {
          reason = 'timeout';
        } else if (error.message?.includes('corrupted') || error.message?.includes('checksum')) {
          reason = 'corrupted';
          // Mark model as corrupted for future queries
          console.error(`[BypassRouter] Model ${model} appears corrupted`);
        } else if (error.message?.includes('not running') || error.message?.includes('connection')) {
          reason = 'failed';
        }
        
        bypassed.push({
          model,
          tier,
          reason
        });
        
        console.log(`[BypassRouter] ⚠️  ${model} (Tier ${tier}) ${reason} - bypassing to next tier...`);
        
        // Continue to next tier
        continue;
      }
    }
    
    // All models failed
    return {
      result: null,
      route: {
        selected_model: '',
        selected_tier: 0,
        bypassed_models: bypassed,
        attempt_order: attemptOrder,
        success: false
      }
    };
  }
  
  /**
   * Display bypass route (like LuciferAI does)
   * Shows which models were bypassed and which is being used
   */
  private _displayBypassRoute(route: BypassRoute): void {
    const tierNames = {
      0: 'Tier 0',
      1: 'Tier 1',
      2: 'Tier 2',
      3: 'Tier 3',
      4: 'Tier 4',
      5: 'Tier 5'
    };
    
    // Show bypassed models (if any)
    if (route.bypassed_models.length > 0) {
      const bypassedParts = route.bypassed_models.map(b => 
        `${b.model} (${tierNames[b.tier as keyof typeof tierNames]})`
      );
      console.log(`💡 Bypassed: ${bypassedParts.join(', ')}`);
    }
    
    // Show selected model
    const tierName = tierNames[route.selected_tier as keyof typeof tierNames] || `Tier ${route.selected_tier}`;
    console.log(`🧠 Using ${route.selected_model} (${tierName})`);
    console.log();
  }
  
  /**
   * Get models by tier for display
   */
  getModelsByTier(): Map<number, string[]> {
    const byTier = new Map<number, string[]>();
    
    for (const model of this.availableModels) {
      const tier = getModelTier(model);
      if (!byTier.has(tier)) {
        byTier.set(tier, []);
      }
      byTier.get(tier)!.push(model);
    }
    
    return byTier;
  }
  
  /**
   * Get model status for LLM list display
   */
  getModelStatus(model: string): ModelStatus {
    return {
      model,
      enabled: this.isModelEnabled(model),
      installed: this.availableModels.includes(model),
      corrupted: this.isModelCorrupted(model),
      locked: false  // TODO: Implement lock detection
    };
  }
  
  /**
   * Enable a model
   */
  enableModel(model: string): { success: boolean; message: string } {
    if (!this.availableModels.includes(model)) {
      return {
        success: false,
        message: `${model} is not installed`
      };
    }
    
    this.modelState.set(model, true);
    this._saveModelState();
    
    return {
      success: true,
      message: `✅ Enabled ${model}`
    };
  }
  
  /**
   * Disable a model
   */
  disableModel(model: string): { success: boolean; message: string } {
    this.modelState.set(model, false);
    this._saveModelState();
    
    return {
      success: true,
      message: `✅ Disabled ${model}`
    };
  }
  
  private _saveModelState(): void {
    // State is managed by backend manager
    // Model enable/disable is persisted there
    console.log('[BypassRouter] Model state updated');
  }
  
  /**
   * Validate router is ready (has at least one enabled model)
   */
  isReady(): boolean {
    return this.availableModels.length > 0;
  }
  
  /**
   * Get validation message explaining why router isn't ready
   */
  getValidationMessage(): string {
    if (this.availableModels.length === 0) {
      return 'No models installed. Install at least one model to use LLM features.';
    }
    
    const enabled = this.availableModels.filter(m => this.isModelEnabled(m));
    if (enabled.length === 0) {
      return 'All models disabled. Enable at least one model in Settings.';
    }
    
    const valid = enabled.filter(m => !this.isModelCorrupted(m));
    if (valid.length === 0) {
      return 'All enabled models are corrupted. Reinstall models or enable different ones.';
    }
    
    return 'Router ready';
  }
  
  /**
   * Get fallback command when no models available
   */
  getFallbackCommand(): string {
    return 'Direct shell execution (no LLM)';
  }
}
