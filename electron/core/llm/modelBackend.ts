/**
 * Model Backend
 * 
 * Connects to local LLM servers (Ollama, LM Studio) and cloud APIs
 */

import { TokenStats } from '../tracking/tokenTracker';

export interface ModelConfig {
  name: string;
  tier: number;
  provider: 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'local';
  endpoint?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerationRequest {
  prompt: string;
  systemPrompt?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface GenerationResponse {
  text: string;
  tokenStats: TokenStats;
  model: string;
  finishReason: 'stop' | 'length' | 'error';
}

export class ModelBackend {
  private config: ModelConfig;
  
  constructor(config: ModelConfig) {
    this.config = config;
  }
  
  /**
   * Generate text using the model
   */
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const startTime = Date.now();
    
    try {
      switch (this.config.provider) {
        case 'ollama':
          return await this._generateOllama(request);
        case 'lmstudio':
          return await this._generateLMStudio(request);
        case 'openai':
          return await this._generateOpenAI(request);
        case 'anthropic':
          return await this._generateAnthropic(request);
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error: any) {
      throw new Error(`Model generation failed: ${error.message}`);
    }
  }
  
  /**
   * Generate using Ollama
   */
  private async _generateOllama(request: GenerationRequest): Promise<GenerationResponse> {
    const endpoint = this.config.endpoint || 'http://localhost:11434';
    
    // Build messages array
    const messages: any[] = [];
    
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }
    
    if (request.conversationHistory) {
      messages.push(...request.conversationHistory);
    }
    
    messages.push({
      role: 'user',
      content: request.prompt
    });
    
    // Call Ollama API
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.name,
        messages,
        stream: false,
        options: {
          temperature: request.temperature || this.config.temperature || 0.7,
          num_predict: request.maxTokens || this.config.maxTokens || 2048
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract token stats
    const promptTokens = data.prompt_eval_count || this._estimateTokens(request.prompt);
    const generatedTokens = data.eval_count || this._estimateTokens(data.message.content);
    
    return {
      text: data.message.content,
      tokenStats: {
        prompt_tokens: promptTokens,
        generated_tokens: generatedTokens,
        total_tokens: promptTokens + generatedTokens,
        prompt_chars: request.prompt.length,
        generated_chars: data.message.content.length,
        prompt_words: this._countWords(request.prompt),
        generated_words: this._countWords(data.message.content)
      },
      model: this.config.name,
      finishReason: data.done ? 'stop' : 'length'
    };
  }
  
  /**
   * Generate using LM Studio
   */
  private async _generateLMStudio(request: GenerationRequest): Promise<GenerationResponse> {
    const endpoint = this.config.endpoint || 'http://localhost:1234';
    
    // LM Studio uses OpenAI-compatible API
    const messages: any[] = [];
    
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }
    
    if (request.conversationHistory) {
      messages.push(...request.conversationHistory);
    }
    
    messages.push({
      role: 'user',
      content: request.prompt
    });
    
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.name,
        messages,
        temperature: request.temperature || this.config.temperature || 0.7,
        max_tokens: request.maxTokens || this.config.maxTokens || 2048,
        stop: request.stopSequences
      })
    });
    
    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const choice = data.choices[0];
    
    return {
      text: choice.message.content,
      tokenStats: {
        prompt_tokens: data.usage.prompt_tokens,
        generated_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens,
        prompt_chars: request.prompt.length,
        generated_chars: choice.message.content.length,
        prompt_words: this._countWords(request.prompt),
        generated_words: this._countWords(choice.message.content)
      },
      model: this.config.name,
      finishReason: choice.finish_reason
    };
  }
  
  /**
   * Generate using OpenAI API
   */
  private async _generateOpenAI(request: GenerationRequest): Promise<GenerationResponse> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const messages: any[] = [];
    
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }
    
    if (request.conversationHistory) {
      messages.push(...request.conversationHistory);
    }
    
    messages.push({
      role: 'user',
      content: request.prompt
    });
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.name,
        messages,
        temperature: request.temperature || this.config.temperature || 0.7,
        max_tokens: request.maxTokens || this.config.maxTokens || 2048,
        stop: request.stopSequences
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const choice = data.choices[0];
    
    return {
      text: choice.message.content,
      tokenStats: {
        prompt_tokens: data.usage.prompt_tokens,
        generated_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens,
        prompt_chars: request.prompt.length,
        generated_chars: choice.message.content.length,
        prompt_words: this._countWords(request.prompt),
        generated_words: this._countWords(choice.message.content)
      },
      model: this.config.name,
      finishReason: choice.finish_reason
    };
  }
  
  /**
   * Generate using Anthropic API
   */
  private async _generateAnthropic(request: GenerationRequest): Promise<GenerationResponse> {
    if (!this.config.apiKey) {
      throw new Error('Anthropic API key not configured');
    }
    
    const messages: any[] = [];
    
    if (request.conversationHistory) {
      messages.push(...request.conversationHistory);
    }
    
    messages.push({
      role: 'user',
      content: request.prompt
    });
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.name,
        messages,
        system: request.systemPrompt,
        max_tokens: request.maxTokens || this.config.maxTokens || 2048,
        temperature: request.temperature || this.config.temperature || 0.7,
        stop_sequences: request.stopSequences
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const text = data.content[0].text;
    
    // Anthropic doesn't provide token counts, estimate them
    const promptTokens = this._estimateTokens(request.prompt);
    const generatedTokens = this._estimateTokens(text);
    
    return {
      text,
      tokenStats: {
        prompt_tokens: promptTokens,
        generated_tokens: generatedTokens,
        total_tokens: promptTokens + generatedTokens,
        prompt_chars: request.prompt.length,
        generated_chars: text.length,
        prompt_words: this._countWords(request.prompt),
        generated_words: this._countWords(text)
      },
      model: this.config.name,
      finishReason: data.stop_reason
    };
  }
  
  /**
   * Estimate token count (rough approximation)
   */
  private _estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Count words in text
   */
  private _countWords(text: string): number {
    return text.trim().split(/\s+/).length;
  }
  
  /**
   * Test connection to model
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.generate({
        prompt: 'Hello',
        maxTokens: 5
      });
      return response.text.length > 0;
    } catch {
      return false;
    }
  }
}

export interface ModelInfo {
  name: string;
  tier: number;
  enabled: boolean;
  running: boolean;
  validated: boolean;
  provider: string;
}

/**
 * Model Backend Manager
 * Manages multiple model backends
 */
export class ModelBackendManager {
  private backends: Map<string, ModelBackend> = new Map();
  private modelInfo: Map<string, ModelInfo> = new Map();
  
  /**
   * Register a model backend
   */
  register(name: string, config: ModelConfig): void {
    this.backends.set(name, new ModelBackend(config));
    
    // Add to model info registry
    this.modelInfo.set(name, {
      name,
      tier: config.tier,
      enabled: true, // Default enabled
      running: false, // Will be tested
      validated: false, // Will be validated
      provider: config.provider
    });
  }
  
  /**
   * Get model backend by name
   */
  get(name: string): ModelBackend | undefined {
    return this.backends.get(name);
  }
  
  /**
   * Test all connections
   */
  async testAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, backend] of this.backends) {
      const isRunning = await backend.testConnection();
      results.set(name, isRunning);
      
      // Update model info
      const info = this.modelInfo.get(name);
      if (info) {
        info.running = isRunning;
        info.validated = isRunning; // If running, assume validated
      }
    }
    
    return results;
  }
  
  /**
   * List all registered models
   */
  listModels(): ModelInfo[] {
    return Array.from(this.modelInfo.values());
  }
  
  /**
   * Get model info by name
   */
  getModel(name: string): ModelInfo | null {
    return this.modelInfo.get(name) || null;
  }
  
  /**
   * Update model enabled state
   */
  setModelEnabled(name: string, enabled: boolean): void {
    const info = this.modelInfo.get(name);
    if (info) {
      info.enabled = enabled;
    }
  }
  
  /**
   * Check if any models are available
   */
  hasAvailableModels(): boolean {
    return Array.from(this.modelInfo.values()).some(m => m.enabled && m.validated);
  }
}
