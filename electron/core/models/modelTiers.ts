/**
 * Model Tier System - Complete LLM Model Registry
 * 
 * Ported from LuciferAI's model_tiers.py
 * Maps 85+ models to capability tiers (0-4)
 * 
 * Tier 0: Basic/Emergency (1-2B params) - Bundled, works offline
 * Tier 1: General Purpose (3-8B params) - Fast, efficient
 * Tier 2: Advanced (7-13B params) - Coding, reasoning
 * Tier 3: Expert (13-34B params) - Complex tasks
 * Tier 4: Ultra-Expert (70B+ params) - Research-grade
 */

export interface ModelInfo {
  name: string;
  tier: number;
  params: string;
  size: string;
  description: string;
  useCase: string[];
  provider: 'ollama' | 'llamafile' | 'openai' | 'custom';
  isCore?: boolean;  // Highlighted on install page
  isBundled?: boolean;  // Comes pre-installed
}

export interface TierCapabilities {
  name: string;
  params: string;
  ram: string;
  description: string;
  goodFor: string[];
  limitations: string[];
}

/**
 * Model tier number (0-4)
 */
export type ModelTier = 0 | 1 | 2 | 3 | 4;

/**
 * Core Models - Featured on install page
 * These are the recommended models for each tier
 */
export const CORE_MODELS: ModelInfo[] = [
  // Tier 0 - Bundled/Emergency
  {
    name: 'tinyllama',
    tier: 0,
    params: '1.1B',
    size: '600MB',
    description: 'Ultra-lightweight bundled model - works offline',
    useCase: ['Emergency fallback', 'Legacy systems', 'Basic chat', 'Offline use'],
    provider: 'llamafile',
    isCore: true,
    isBundled: true
  },
  {
    name: 'phi-2',
    tier: 0,
    params: '2.7B',
    size: '1.7GB',
    description: 'Microsoft\'s compact model with strong reasoning',
    useCase: ['Code snippets', 'Basic reasoning', 'Quick responses'],
    provider: 'ollama',
    isCore: true
  },
  
  // Tier 1 - Lightweight
  {
    name: 'llama3.2',
    tier: 1,
    params: '3B',
    size: '2GB',
    description: 'Meta\'s latest lightweight model',
    useCase: ['General chat', 'Basic coding', 'Fast responses'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'gemma',
    tier: 1,
    params: '2B',
    size: '1.4GB',
    description: 'Google\'s efficient lightweight model',
    useCase: ['Conversation', 'Quick tasks', 'Mobile-friendly'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'phi-3',
    tier: 1,
    params: '3.8B',
    size: '2.3GB',
    description: 'Microsoft Phi-3 - strong for its size',
    useCase: ['Code understanding', 'General purpose', 'Fast inference'],
    provider: 'ollama',
    isCore: true
  },
  
  // Tier 2 - Balanced
  {
    name: 'mistral',
    tier: 2,
    params: '7B',
    size: '4.1GB',
    description: 'Excellent balanced performance - recommended',
    useCase: ['Coding', 'Reasoning', 'Production dev', 'Debugging'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'llama3.1',
    tier: 2,
    params: '8B',
    size: '4.7GB',
    description: 'Meta\'s latest - great instruction following',
    useCase: ['Advanced coding', 'Multi-step tasks', 'Reasoning'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'qwen2.5',
    tier: 2,
    params: '7B',
    size: '4.7GB',
    description: 'Multilingual coding specialist',
    useCase: ['Multilingual', 'Coding', 'International projects'],
    provider: 'ollama',
    isCore: true
  },
  
  // Tier 3 - Expert
  {
    name: 'deepseek-coder',
    tier: 3,
    params: '6.7B',
    size: '3.8GB',
    description: 'Specialized coding expert',
    useCase: ['Expert debugging', 'Code generation', 'Refactoring'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'codellama',
    tier: 3,
    params: '13B',
    size: '7.4GB',
    description: 'Meta\'s code specialist',
    useCase: ['Code completion', 'Architecture', 'Full applications'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'mixtral',
    tier: 3,
    params: '8x7B',
    size: '26GB',
    description: 'Mixture of Experts - high performance',
    useCase: ['Complex reasoning', 'Multi-step tasks', 'Expert analysis'],
    provider: 'ollama',
    isCore: true
  },
  
  // Tier 4 - Ultra-Expert
  {
    name: 'llama3.1:70b',
    tier: 4,
    params: '70B',
    size: '40GB',
    description: 'Meta\'s ultra-expert model',
    useCase: ['Enterprise', 'Research', 'Production apps', 'Advanced reasoning'],
    provider: 'ollama',
    isCore: true
  },
  {
    name: 'qwen2.5:72b',
    tier: 4,
    params: '72B',
    size: '41GB',
    description: 'Massive multilingual expert',
    useCase: ['Research-grade', 'Large-scale', 'International enterprise'],
    provider: 'ollama',
    isCore: true
  }
];

/**
 * All Supported Models - Complete Registry
 * Organized by tier for performance
 */
export const ALL_MODELS: Record<string, ModelInfo> = {
  // ═══════════════════════════════════════════════════════════
  // TIER 0: Basic/Emergency (1-2B params)
  // ═══════════════════════════════════════════════════════════
  'tinyllama': CORE_MODELS[0],
  'tiny': CORE_MODELS[0],
  'tinyllama-1.1b': CORE_MODELS[0],
  'phi-2': CORE_MODELS[1],
  'phi2': CORE_MODELS[1],
  'stablelm': { name: 'stablelm', tier: 0, params: '3B', size: '1.6GB', description: 'Stability AI lightweight model', useCase: ['Chat', 'Basic tasks'], provider: 'ollama' },
  'stablelm-2': { name: 'stablelm-2', tier: 0, params: '1.6B', size: '934MB', description: 'StableLM v2', useCase: ['Ultra-light', 'Basic chat'], provider: 'ollama' },
  'orca-mini': { name: 'orca-mini', tier: 0, params: '3B', size: '1.9GB', description: 'Microsoft Orca mini', useCase: ['Quick responses', 'Chat'], provider: 'ollama' },
  
  // ═══════════════════════════════════════════════════════════
  // TIER 1: General Purpose (3-8B params)
  // ═══════════════════════════════════════════════════════════
  'llama3.2': CORE_MODELS[2],
  'llama-3.2': CORE_MODELS[2],
  'llama3.2:1b': { name: 'llama3.2:1b', tier: 1, params: '1B', size: '1.3GB', description: 'Ultra-fast Llama variant', useCase: ['Mobile', 'Fast responses'], provider: 'ollama' },
  'gemma': CORE_MODELS[3],
  'gemma:2b': CORE_MODELS[3],
  'gemma-7b': { name: 'gemma-7b', tier: 1, params: '7B', size: '4.8GB', description: 'Google Gemma 7B', useCase: ['Reasoning', 'General purpose'], provider: 'ollama' },
  'gemma2': { name: 'gemma2', tier: 1, params: '9B', size: '5.5GB', description: 'Google Gemma 2', useCase: ['Advanced chat', 'Reasoning'], provider: 'ollama' },
  'gemma-2-9b': { name: 'gemma-2-9b', tier: 1, params: '9B', size: '5.5GB', description: 'Gemma 2 9B', useCase: ['Balanced performance'], provider: 'ollama' },
  'phi-3': CORE_MODELS[4],
  'phi3': CORE_MODELS[4],
  'phi-3-mini': CORE_MODELS[4],
  'llama2': { name: 'llama2', tier: 1, params: '7B', size: '3.8GB', description: 'Meta Llama 2', useCase: ['General chat', 'Code', 'Explanations'], provider: 'ollama' },
  'llama-2': { name: 'llama-2', tier: 1, params: '7B', size: '3.8GB', description: 'Meta Llama 2', useCase: ['General purpose'], provider: 'ollama' },
  'llama2-7b': { name: 'llama2-7b', tier: 1, params: '7B', size: '3.8GB', description: 'Llama 2 7B', useCase: ['Balanced performance'], provider: 'ollama' },
  'vicuna': { name: 'vicuna', tier: 1, params: '7B', size: '3.8GB', description: 'Fine-tuned Llama', useCase: ['Chat', 'Conversation'], provider: 'ollama' },
  'vicuna-7b': { name: 'vicuna-7b', tier: 1, params: '7B', size: '3.8GB', description: 'Vicuna 7B', useCase: ['Chat specialist'], provider: 'ollama' },
  'orca-2': { name: 'orca-2', tier: 1, params: '7B', size: '3.8GB', description: 'Microsoft Orca 2', useCase: ['Reasoning', 'Problem solving'], provider: 'ollama' },
  'orca-2-7b': { name: 'orca-2-7b', tier: 1, params: '7B', size: '3.8GB', description: 'Orca 2 7B', useCase: ['Advanced reasoning'], provider: 'ollama' },
  'openchat': { name: 'openchat', tier: 1, params: '7B', size: '4.1GB', description: 'OpenChat 3.5', useCase: ['Chat', 'Conversation'], provider: 'ollama' },
  'openchat-3.5': { name: 'openchat-3.5', tier: 1, params: '7B', size: '4.1GB', description: 'OpenChat 3.5', useCase: ['Fast chat'], provider: 'ollama' },
  'starling': { name: 'starling', tier: 1, params: '7B', size: '4.1GB', description: 'Berkeley Starling', useCase: ['Chat', 'Instructions'], provider: 'ollama' },
  'starling-7b': { name: 'starling-7b', tier: 1, params: '7B', size: '4.1GB', description: 'Starling 7B', useCase: ['Chat specialist'], provider: 'ollama' },
  
  // ═══════════════════════════════════════════════════════════
  // TIER 2: Advanced (7-13B params)
  // ═══════════════════════════════════════════════════════════
  'mistral': CORE_MODELS[5],
  'mistral-7b': CORE_MODELS[5],
  'mistral-7b-instruct': CORE_MODELS[5],
  'llama3': { name: 'llama3', tier: 2, params: '8B', size: '4.7GB', description: 'Meta Llama 3', useCase: ['Coding', 'Reasoning', 'Multi-step'], provider: 'ollama' },
  'llama-3': { name: 'llama-3', tier: 2, params: '8B', size: '4.7GB', description: 'Llama 3', useCase: ['Advanced tasks'], provider: 'ollama' },
  'llama3-8b': { name: 'llama3-8b', tier: 2, params: '8B', size: '4.7GB', description: 'Llama 3 8B', useCase: ['Coding specialist'], provider: 'ollama' },
  'llama3.1': CORE_MODELS[6],
  'llama-3.1': CORE_MODELS[6],
  'llama3.1-8b': CORE_MODELS[6],
  'qwen2.5': CORE_MODELS[7],
  'qwen': { name: 'qwen', tier: 2, params: '7B', size: '4.5GB', description: 'Alibaba Qwen', useCase: ['Multilingual', 'Coding'], provider: 'ollama' },
  'qwen-7b': { name: 'qwen-7b', tier: 2, params: '7B', size: '4.5GB', description: 'Qwen 7B', useCase: ['Chinese/English'], provider: 'ollama' },
  'qwen2': { name: 'qwen2', tier: 2, params: '7B', size: '4.4GB', description: 'Qwen 2', useCase: ['Multilingual coding'], provider: 'ollama' },
  'qwen2-7b': { name: 'qwen2-7b', tier: 2, params: '7B', size: '4.4GB', description: 'Qwen 2 7B', useCase: ['International'], provider: 'ollama' },
  'codellama-7b': { name: 'codellama-7b', tier: 2, params: '7B', size: '3.8GB', description: 'Code Llama 7B', useCase: ['Code completion', 'Programming'], provider: 'ollama' },
  'neural-chat': { name: 'neural-chat', tier: 2, params: '7B', size: '4.1GB', description: 'Intel Neural Chat', useCase: ['Conversation', 'Reasoning'], provider: 'ollama' },
  'neural-chat-7b': { name: 'neural-chat-7b', tier: 2, params: '7B', size: '4.1GB', description: 'Neural Chat 7B', useCase: ['Chat specialist'], provider: 'ollama' },
  'solar': { name: 'solar', tier: 2, params: '10.7B', size: '6.1GB', description: 'Upstage Solar', useCase: ['Reasoning', 'Coding'], provider: 'ollama' },
  'solar-10.7b': { name: 'solar-10.7b', tier: 2, params: '10.7B', size: '6.1GB', description: 'Solar 10.7B', useCase: ['Advanced reasoning'], provider: 'ollama' },
  'yi': { name: 'yi', tier: 2, params: '6B', size: '3.5GB', description: '01.AI Yi model', useCase: ['Multilingual', 'Chat'], provider: 'ollama' },
  'yi-6b': { name: 'yi-6b', tier: 2, params: '6B', size: '3.5GB', description: 'Yi 6B', useCase: ['Chinese/English'], provider: 'ollama' },
  
  // ═══════════════════════════════════════════════════════════
  // TIER 3: Expert (13-34B params)
  // ═══════════════════════════════════════════════════════════
  'deepseek-coder': CORE_MODELS[8],
  'deepseek': CORE_MODELS[8],
  'deepseek-coder-6.7b': CORE_MODELS[8],
  'deepseek-coder-33b': { name: 'deepseek-coder-33b', tier: 3, params: '33B', size: '19GB', description: 'DeepSeek 33B - expert coder', useCase: ['Enterprise code', 'Complex refactoring', 'Architecture'], provider: 'ollama' },
  'codellama': CORE_MODELS[9],
  'code-llama': CORE_MODELS[9],
  'codellama-13b': CORE_MODELS[9],
  'codellama-34b': { name: 'codellama-34b', tier: 3, params: '34B', size: '19GB', description: 'Code Llama 34B - expert', useCase: ['Full applications', 'Architecture design'], provider: 'ollama' },
  'mixtral': CORE_MODELS[10],
  'mixtral-8x7b': CORE_MODELS[10],
  'wizardcoder': { name: 'wizardcoder', tier: 3, params: '15B', size: '8.6GB', description: 'WizardCoder - Python specialist', useCase: ['Python', 'Code optimization'], provider: 'ollama' },
  'wizardcoder-15b': { name: 'wizardcoder-15b', tier: 3, params: '15B', size: '8.6GB', description: 'WizardCoder 15B', useCase: ['Python expert'], provider: 'ollama' },
  'wizardcoder-33b': { name: 'wizardcoder-33b', tier: 3, params: '33B', size: '19GB', description: 'WizardCoder 33B', useCase: ['Enterprise Python'], provider: 'ollama' },
  'wizardlm': { name: 'wizardlm', tier: 3, params: '13B', size: '7.4GB', description: 'WizardLM', useCase: ['Complex reasoning', 'Multi-step'], provider: 'ollama' },
  'wizardlm-13b': { name: 'wizardlm-13b', tier: 3, params: '13B', size: '7.4GB', description: 'WizardLM 13B', useCase: ['Advanced tasks'], provider: 'ollama' },
  'yi-34b': { name: 'yi-34b', tier: 3, params: '34B', size: '19GB', description: 'Yi 34B - multilingual expert', useCase: ['International enterprise', 'Complex tasks'], provider: 'ollama' },
  'qwen-14b': { name: 'qwen-14b', tier: 3, params: '14B', size: '8.2GB', description: 'Qwen 14B', useCase: ['Multilingual expert', 'Complex coding'], provider: 'ollama' },
  'dolphin': { name: 'dolphin', tier: 3, params: 'Various', size: 'Varies', description: 'Dolphin uncensored models', useCase: ['Unrestricted', 'Research'], provider: 'ollama' },
  'dolphin-mixtral': { name: 'dolphin-mixtral', tier: 3, params: '8x7B', size: '26GB', description: 'Dolphin Mixtral', useCase: ['Unrestricted reasoning'], provider: 'ollama' },
  'nous-hermes': { name: 'nous-hermes', tier: 3, params: '13B', size: '7.4GB', description: 'Nous Hermes', useCase: ['Reasoning', 'Complex tasks'], provider: 'ollama' },
  'nous-hermes-2': { name: 'nous-hermes-2', tier: 3, params: '13B', size: '7.4GB', description: 'Nous Hermes 2', useCase: ['Advanced reasoning'], provider: 'ollama' },
  'phind-codellama': { name: 'phind-codellama', tier: 3, params: '34B', size: '19GB', description: 'Phind CodeLlama', useCase: ['Code search', 'Expert coding'], provider: 'ollama' },
  'phind-codellama-34b': { name: 'phind-codellama-34b', tier: 3, params: '34B', size: '19GB', description: 'Phind CodeLlama 34B', useCase: ['Enterprise code'], provider: 'ollama' },
  
  // ═══════════════════════════════════════════════════════════
  // TIER 4: Ultra-Expert (70B+ params)
  // ═══════════════════════════════════════════════════════════
  'llama3.1:70b': CORE_MODELS[11],
  'llama3-70b': CORE_MODELS[11],
  'llama3.1-70b': CORE_MODELS[11],
  'qwen2.5:72b': CORE_MODELS[12],
  'qwen-72b': CORE_MODELS[12],
  'qwen2-72b': CORE_MODELS[12],
  'mixtral-8x22b': { name: 'mixtral-8x22b', tier: 4, params: '8x22B', size: '176GB', description: 'Mixtral 8x22B - massive expert', useCase: ['Research', 'Enterprise', 'Maximum capability'], provider: 'ollama' }
};

/**
 * Tier capabilities descriptions
 */
export const TIER_CAPABILITIES: Record<number, TierCapabilities> = {
  0: {
    name: 'Basic/Emergency',
    params: '1-2B',
    ram: '<8GB',
    description: 'Ultra-lightweight models - works offline, bundled',
    goodFor: ['Emergency fallback', 'Legacy systems', 'Basic chat', 'Offline use', 'macOS Catalina+'],
    limitations: ['Complex reasoning', 'Multi-step tasks', 'Large code generation']
  },
  1: {
    name: 'General Purpose',
    params: '3-8B',
    ram: '8-16GB',
    description: 'Fast and efficient - good for most tasks',
    goodFor: ['General chat', 'Basic coding', 'Fast responses', 'Mobile/laptop dev', 'Explanations'],
    limitations: ['Advanced reasoning', 'Large projects', 'Deep analysis', 'Complex refactoring']
  },
  2: {
    name: 'Advanced',
    params: '7-13B',
    ram: '16-32GB',
    description: 'Balanced performance - recommended for development',
    goodFor: ['Coding', 'Debugging', 'Multi-step tasks', 'Reasoning', 'Production dev', 'Multilingual'],
    limitations: ['Very complex architectures', 'Large-scale refactoring', 'Enterprise systems']
  },
  3: {
    name: 'Expert',
    params: '13-34B',
    ram: '32GB+',
    description: 'Expert-level coding and reasoning',
    goodFor: ['Full applications', 'Architecture design', 'Complex algorithms', 'Code review', 'Refactoring', 'Enterprise'],
    limitations: ['Requires high-end hardware', 'Slower inference', 'Large disk space']
  },
  4: {
    name: 'Ultra-Expert',
    params: '70B+',
    ram: '64GB+',
    description: 'Research-grade, maximum capability',
    goodFor: ['Enterprise systems', 'Research projects', 'Production apps', 'Advanced reasoning', 'Maximum quality'],
    limitations: ['Requires 64GB+ RAM', 'Very slow inference', 'Massive disk space (40GB+)']
  }
};

/**
 * Get model tier from name
 */
export function getModelTier(modelName: string): number {
  if (!modelName) return 0;
  
  const normalized = modelName.toLowerCase().trim()
    .replace(/_/g, '-')
    .replace(/ /g, '-');
  
  // Direct lookup
  const model = ALL_MODELS[normalized];
  if (model) return model.tier;
  
  // Fuzzy matching
  for (const [key, value] of Object.entries(ALL_MODELS)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return value.tier;
    }
  }
  
  // Check size indicators
  if (/70b|72b|8x22b/i.test(normalized)) return 4;
  if (/34b|33b|13b|14b|15b/i.test(normalized)) return 3;
  if (/7b|8b|9b|10b|8x7b/i.test(normalized)) return 2;
  if (/3b|4b|6b/i.test(normalized)) return 1;
  if (/1b|2b/i.test(normalized)) return 0;
  
  return 0; // Default to basic
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: number): ModelInfo[] {
  return Object.values(ALL_MODELS).filter(m => m.tier === tier);
}

/**
 * Get core models only
 */
export function getCoreModels(): ModelInfo[] {
  return CORE_MODELS;
}

/**
 * Get core models by tier
 */
export function getCoreModelsByTier(tier: number): ModelInfo[] {
  return CORE_MODELS.filter(m => m.tier === tier);
}

/**
 * Get tier capabilities
 */
export function getTierCapabilities(tier: number): TierCapabilities {
  return TIER_CAPABILITIES[tier] || TIER_CAPABILITIES[0];
}

/**
 * Get all tiers info
 */
export function getAllTiers(): Record<number, TierCapabilities> {
  return TIER_CAPABILITIES;
}

/**
 * Format model for display
 */
export function formatModelInfo(model: ModelInfo): string {
  const coreFlag = model.isCore ? ' ⭐' : '';
  const bundledFlag = model.isBundled ? ' 🎁' : '';
  return `${model.name} (${model.params}, ${model.size})${coreFlag}${bundledFlag}\n  ${model.description}\n  Use: ${model.useCase.join(', ')}`;
}

/**
 * Get tier name
 */
export function getTierName(tier: number): string {
  const capabilities = getTierCapabilities(tier);
  return capabilities.name;
}

/**
 * ModelTierRegistry class
 * Wrapper around model tier functions for dependency injection
 */
export class ModelTierRegistry {
  /**
   * Get model tier from name
   */
  getModelTier(modelName: string): number {
    return getModelTier(modelName);
  }

  /**
   * Get models by tier
   */
  getModelsByTier(tier: number): ModelInfo[] {
    return getModelsByTier(tier);
  }

  /**
   * Get core models
   */
  getCoreModels(): ModelInfo[] {
    return getCoreModels();
  }

  /**
   * Get core models by tier
   */
  getCoreModelsByTier(tier: number): ModelInfo[] {
    return getCoreModelsByTier(tier);
  }

  /**
   * Get tier capabilities
   */
  getTierCapabilities(tier: number): TierCapabilities {
    return getTierCapabilities(tier);
  }

  /**
   * Get all tiers info
   */
  getAllTiers(): Record<number, TierCapabilities> {
    return getAllTiers();
  }

  /**
   * Get tier name
   */
  getTierName(tier: number): string {
    return getTierName(tier);
  }

  /**
   * Format model info
   */
  formatModelInfo(model: ModelInfo): string {
    return formatModelInfo(model);
  }

  /**
   * Get all models
   */
  getAllModels(): Record<string, ModelInfo> {
    return ALL_MODELS;
  }

  /**
   * Get model info by name
   */
  getModelInfo(modelName: string): ModelInfo | undefined {
    const normalized = modelName.toLowerCase().trim()
      .replace(/_/g, '-')
      .replace(/ /g, '-');
    return ALL_MODELS[normalized];
  }
}
