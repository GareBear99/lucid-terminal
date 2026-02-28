/**
 * LuciferAI Models Database
 * Complete model catalog with tiers for native installation
 * Synced with LUCID-BACKEND/core/command_keywords.py
 */

export interface AIModel {
  name: string;
  displayName: string;
  tier: number;
  size: string;
  description: string;
  tags: string[];
  recommended?: boolean;
}

export interface ModelTier {
  tier: number;
  name: string;
  description: string;
  sizeRange: string;
  color: string;
  models: AIModel[];
}

/**
 * Complete model database organized by tier
 */
export const modelTiers: ModelTier[] = [
  {
    tier: 0,
    name: 'Basic',
    description: 'Lightweight models for quick responses',
    sizeRange: '1-2B',
    color: '#84cc16',
    models: [
      {
        name: 'tinyllama',
        displayName: 'TinyLlama',
        tier: 0,
        size: '1.1B',
        description: 'Ultra-lightweight, fastest responses',
        tags: ['fast', 'basic', 'lightweight'],
        recommended: true
      },
      {
        name: 'phi-2',
        displayName: 'Phi-2',
        tier: 0,
        size: '2.7B',
        description: 'Microsoft Phi-2, efficient and capable',
        tags: ['microsoft', 'efficient', 'basic']
      },
      {
        name: 'stablelm',
        displayName: 'StableLM',
        tier: 0,
        size: '1.6B',
        description: 'Stable diffusion team language model',
        tags: ['stable', 'basic']
      },
      {
        name: 'orca-mini',
        displayName: 'Orca Mini',
        tier: 0,
        size: '1.9B',
        description: 'Compact Orca model',
        tags: ['mini', 'basic']
      }
    ]
  },
  {
    tier: 1,
    name: 'General',
    description: 'Balanced models for everyday use',
    sizeRange: '3-8B',
    color: '#3b82f6',
    models: [
      {
        name: 'llama3.2',
        displayName: 'Llama 3.2',
        tier: 1,
        size: '3B',
        description: 'Meta Llama 3.2, latest generation',
        tags: ['meta', 'general', 'latest'],
        recommended: true
      },
      {
        name: 'llama2',
        displayName: 'Llama 2',
        tier: 1,
        size: '7B',
        description: 'Meta Llama 2, proven performance',
        tags: ['meta', 'general', 'stable']
      },
      {
        name: 'phi-3',
        displayName: 'Phi-3',
        tier: 1,
        size: '3.8B',
        description: 'Microsoft Phi-3, enhanced capabilities',
        tags: ['microsoft', 'enhanced']
      },
      {
        name: 'gemma',
        displayName: 'Gemma',
        tier: 1,
        size: '2B',
        description: 'Google Gemma, efficient and smart',
        tags: ['google', 'efficient']
      },
      {
        name: 'gemma2',
        displayName: 'Gemma 2',
        tier: 1,
        size: '2B',
        description: 'Google Gemma 2nd generation',
        tags: ['google', 'latest']
      },
      {
        name: 'vicuna',
        displayName: 'Vicuna',
        tier: 1,
        size: '7B',
        description: 'LMSYS Vicuna, chat-optimized',
        tags: ['chat', 'general']
      },
      {
        name: 'orca-2',
        displayName: 'Orca 2',
        tier: 1,
        size: '7B',
        description: 'Microsoft Orca 2, reasoning focused',
        tags: ['microsoft', 'reasoning']
      },
      {
        name: 'openchat',
        displayName: 'OpenChat',
        tier: 1,
        size: '7B',
        description: 'OpenChat, open-source chat model',
        tags: ['chat', 'opensource']
      },
      {
        name: 'starling',
        displayName: 'Starling',
        tier: 1,
        size: '7B',
        description: 'Starling, RLHF-trained',
        tags: ['rlhf', 'chat']
      }
    ]
  },
  {
    tier: 2,
    name: 'Advanced',
    description: 'Powerful models for complex tasks',
    sizeRange: '7-13B',
    color: '#8b5cf6',
    models: [
      {
        name: 'mistral',
        displayName: 'Mistral',
        tier: 2,
        size: '7B',
        description: 'Mistral AI flagship, excellent performance',
        tags: ['mistral', 'advanced', 'flagship'],
        recommended: true
      },
      {
        name: 'mixtral',
        displayName: 'Mixtral 8x7B',
        tier: 2,
        size: '47B (8x7B MoE)',
        description: 'Mistral Mixtral, mixture of experts',
        tags: ['mistral', 'moe', 'advanced']
      },
      {
        name: 'llama3',
        displayName: 'Llama 3',
        tier: 2,
        size: '8B',
        description: 'Meta Llama 3, powerful and capable',
        tags: ['meta', 'advanced'],
        recommended: true
      },
      {
        name: 'llama3.1',
        displayName: 'Llama 3.1',
        tier: 2,
        size: '8B',
        description: 'Meta Llama 3.1, enhanced version',
        tags: ['meta', 'latest', 'advanced']
      },
      {
        name: 'codellama',
        displayName: 'Code Llama',
        tier: 2,
        size: '7B',
        description: 'Meta Code Llama, coding specialist',
        tags: ['meta', 'coding', 'specialized']
      },
      {
        name: 'qwen',
        displayName: 'Qwen',
        tier: 2,
        size: '7B',
        description: 'Alibaba Qwen, multilingual',
        tags: ['alibaba', 'multilingual']
      },
      {
        name: 'qwen2',
        displayName: 'Qwen 2',
        tier: 2,
        size: '7B',
        description: 'Alibaba Qwen 2nd generation',
        tags: ['alibaba', 'latest', 'multilingual']
      },
      {
        name: 'yi',
        displayName: 'Yi',
        tier: 2,
        size: '6B',
        description: '01.AI Yi, efficient Chinese-English model',
        tags: ['chinese', 'multilingual']
      },
      {
        name: 'solar',
        displayName: 'Solar',
        tier: 2,
        size: '10.7B',
        description: 'Upstage Solar, depth-upscaled',
        tags: ['upstage', 'advanced']
      },
      {
        name: 'neural-chat',
        displayName: 'Neural Chat',
        tier: 2,
        size: '7B',
        description: 'Intel Neural Chat, optimized',
        tags: ['intel', 'chat', 'optimized']
      }
    ]
  },
  {
    tier: 3,
    name: 'Expert',
    description: 'High-capability models for demanding tasks',
    sizeRange: '13-34B',
    color: '#ec4899',
    models: [
      {
        name: 'deepseek',
        displayName: 'DeepSeek',
        tier: 3,
        size: '33B',
        description: 'DeepSeek AI, reasoning expert',
        tags: ['deepseek', 'reasoning', 'expert']
      },
      {
        name: 'deepseek-coder-33b',
        displayName: 'DeepSeek Coder 33B',
        tier: 3,
        size: '33B',
        description: 'DeepSeek Coder, coding expert',
        tags: ['deepseek', 'coding', 'expert'],
        recommended: true
      },
      {
        name: 'codellama-13b',
        displayName: 'Code Llama 13B',
        tier: 3,
        size: '13B',
        description: 'Meta Code Llama larger variant',
        tags: ['meta', 'coding', 'expert']
      },
      {
        name: 'codellama-34b',
        displayName: 'Code Llama 34B',
        tier: 3,
        size: '34B',
        description: 'Meta Code Llama largest variant',
        tags: ['meta', 'coding', 'expert']
      },
      {
        name: 'wizardcoder',
        displayName: 'WizardCoder',
        tier: 3,
        size: '15B',
        description: 'WizardLM Coder, instruction-tuned',
        tags: ['wizardlm', 'coding']
      },
      {
        name: 'wizardcoder-33b',
        displayName: 'WizardCoder 33B',
        tier: 3,
        size: '33B',
        description: 'WizardLM Coder large variant',
        tags: ['wizardlm', 'coding', 'expert']
      },
      {
        name: 'wizardlm',
        displayName: 'WizardLM',
        tier: 3,
        size: '13B',
        description: 'WizardLM, general purpose expert',
        tags: ['wizardlm', 'general']
      },
      {
        name: 'yi-34b',
        displayName: 'Yi 34B',
        tier: 3,
        size: '34B',
        description: '01.AI Yi large variant',
        tags: ['chinese', 'multilingual', 'expert']
      },
      {
        name: 'qwen-14b',
        displayName: 'Qwen 14B',
        tier: 3,
        size: '14B',
        description: 'Alibaba Qwen large variant',
        tags: ['alibaba', 'multilingual']
      },
      {
        name: 'dolphin',
        displayName: 'Dolphin',
        tier: 3,
        size: '33B',
        description: 'Dolphin, uncensored variant',
        tags: ['uncensored', 'expert']
      },
      {
        name: 'nous-hermes',
        displayName: 'Nous Hermes',
        tier: 3,
        size: '13B',
        description: 'Nous Research Hermes',
        tags: ['nous', 'reasoning']
      },
      {
        name: 'phind-codellama',
        displayName: 'Phind CodeLlama',
        tier: 3,
        size: '34B',
        description: 'Phind CodeLlama, code-optimized',
        tags: ['phind', 'coding', 'expert']
      }
    ]
  },
  {
    tier: 4,
    name: 'Ultra',
    description: 'Cutting-edge models for ultimate performance',
    sizeRange: '70B+',
    color: '#ef4444',
    models: [
      {
        name: 'llama3-70b',
        displayName: 'Llama 3 70B',
        tier: 4,
        size: '70B',
        description: 'Meta Llama 3 largest variant',
        tags: ['meta', 'ultra', 'flagship'],
        recommended: true
      },
      {
        name: 'llama3.1-70b',
        displayName: 'Llama 3.1 70B',
        tier: 4,
        size: '70B',
        description: 'Meta Llama 3.1 largest variant',
        tags: ['meta', 'ultra', 'latest']
      },
      {
        name: 'mixtral-8x22b',
        displayName: 'Mixtral 8x22B',
        tier: 4,
        size: '176B (8x22B MoE)',
        description: 'Mistral Mixtral ultra-large MoE',
        tags: ['mistral', 'moe', 'ultra']
      },
      {
        name: 'qwen-72b',
        displayName: 'Qwen 72B',
        tier: 4,
        size: '72B',
        description: 'Alibaba Qwen largest variant',
        tags: ['alibaba', 'multilingual', 'ultra']
      },
      {
        name: 'qwen2-72b',
        displayName: 'Qwen 2 72B',
        tier: 4,
        size: '72B',
        description: 'Alibaba Qwen 2 largest variant',
        tags: ['alibaba', 'latest', 'ultra']
      }
    ]
  }
];

/**
 * Flatten all models into a single list
 */
export const allModels: AIModel[] = modelTiers.flatMap(tier => tier.models);

/**
 * Get model by name
 */
export function getModelByName(name: string): AIModel | undefined {
  const normalized = name.toLowerCase().trim();
  return allModels.find(m => m.name.toLowerCase() === normalized);
}

/**
 * Get all models in a tier
 */
export function getModelsByTier(tier: number): AIModel[] {
  const tierData = modelTiers.find(t => t.tier === tier);
  return tierData ? tierData.models : [];
}

/**
 * Check if a string is a valid model name
 */
export function isValidModelName(name: string): boolean {
  return getModelByName(name) !== undefined;
}

/**
 * Get tier information
 */
export function getTierInfo(tier: number): ModelTier | undefined {
  return modelTiers.find(t => t.tier === tier);
}

/**
 * Search models by query
 */
export function searchModels(query: string): AIModel[] {
  const lowerQuery = query.toLowerCase();
  return allModels.filter(model =>
    model.name.toLowerCase().includes(lowerQuery) ||
    model.displayName.toLowerCase().includes(lowerQuery) ||
    model.description.toLowerCase().includes(lowerQuery) ||
    model.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get recommended models
 */
export function getRecommendedModels(): AIModel[] {
  return allModels.filter(m => m.recommended);
}

/**
 * Get core models (recommended from tiers 0-2)
 */
export function getCoreModels(): AIModel[] {
  return allModels.filter(m => m.recommended && m.tier <= 2);
}
