/**
 * Model Backend
 * 
 * Connects to local LLM servers (Ollama, LM Studio) and cloud APIs
 */

import { TokenStats } from '../tracking/tokenTracker';

export interface ModelConfig {
  name: string;
  tier: number;
  provider: 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'llamafile' | 'local';
  endpoint?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  llamafilePath?: string; // Path to llamafile binary for this model
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
        case 'llamafile':
          return await this._generateLlamafile(request);
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
   * Generate using llamafile (local binary)
   */
  private async _generateLlamafile(request: GenerationRequest): Promise<GenerationResponse> {
    // Llamafile uses OpenAI-compatible API on local port
    const endpoint = this.config.endpoint || 'http://localhost:8080';
    
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
    
    // Call llamafile OpenAI-compatible API
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: false,
        temperature: request.temperature || this.config.temperature || 0.7,
        max_tokens: request.maxTokens || this.config.maxTokens || 2048,
        stop: request.stopSequences
      })
    });
    
    if (!response.ok) {
      throw new Error(`Llamafile API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const choice = data.choices?.[0];
    
    if (!choice) {
      throw new Error('No response from llamafile');
    }
    
    // Extract token stats
    const promptTokens = data.usage?.prompt_tokens || this._estimateTokens(request.prompt);
    const generatedTokens = data.usage?.completion_tokens || this._estimateTokens(choice.message.content);
    
    return {
      text: choice.message.content,
      tokenStats: {
        prompt_tokens: promptTokens,
        generated_tokens: generatedTokens,
        total_tokens: promptTokens + generatedTokens,
        prompt_chars: request.prompt.length,
        generated_chars: choice.message.content.length,
        prompt_words: this._countWords(request.prompt),
        generated_words: this._countWords(choice.message.content)
      },
      model: this.config.name,
      finishReason: choice.finish_reason || 'stop'
    };
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
   * Cheap health probe: is the server answering? A plain GET against
   * the provider's model-list / tags endpoint — no prompt, no tokens,
   * no inference. This is what the status dots actually display
   * ("server answering"), and it is what the 30 s pollers call.
   *
   * Zero-latency standard (FreeEQ8 paper, variable cadence): never
   * do model work on a timer. The old implementation ran a real
   * `generate({ prompt: 'Hello', maxTokens: 5 })` per backend per
   * tick — a full inference request every 30 s from up to three
   * simultaneous pollers. A dead endpoint used to hang until the OS
   * TCP timeout; the probe aborts after HEALTH_PROBE_TIMEOUT_MS.
   */
  static readonly HEALTH_PROBE_TIMEOUT_MS = 3000;

  async healthCheck(): Promise<boolean> {
    const timeout = AbortSignal.timeout(ModelBackend.HEALTH_PROBE_TIMEOUT_MS);
    try {
      switch (this.config.provider) {
        case 'llamafile': {
          const endpoint = this.config.endpoint || 'http://localhost:8080';
          const res = await fetch(`${endpoint}/v1/models`, { signal: timeout });
          return res.ok;
        }
        case 'ollama': {
          const endpoint = this.config.endpoint || 'http://localhost:11434';
          const res = await fetch(`${endpoint}/api/tags`, { signal: timeout });
          return res.ok;
        }
        case 'lmstudio': {
          const endpoint = this.config.endpoint || 'http://localhost:1234';
          const res = await fetch(`${endpoint}/v1/models`, { signal: timeout });
          return res.ok;
        }
        case 'local': {
          // No fixed local protocol: probe the OpenAI-compatible list
          // endpoint when one is configured, else nothing to probe.
          if (!this.config.endpoint) return false;
          const res = await fetch(`${this.config.endpoint}/v1/models`, { signal: timeout });
          return res.ok;
        }
        case 'openai': {
          if (!this.config.apiKey) return false;
          const res = await fetch('https://api.openai.com/v1/models', {
            signal: timeout,
            headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
          });
          return res.ok;
        }
        case 'anthropic': {
          if (!this.config.apiKey) return false;
          const res = await fetch('https://api.anthropic.com/v1/models', {
            signal: timeout,
            headers: {
              'x-api-key': this.config.apiKey,
              'anthropic-version': '2023-06-01',
            },
          });
          return res.ok;
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Test connection to model — now the cheap health probe (see
   * healthCheck). Kept as the public name because every caller
   * (testAll, the status pipeline) means "is this backend up", not
   * "can it generate". Never runs inference on a timer.
   */
  async testConnection(): Promise<boolean> {
    return this.healthCheck();
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
   * Test all connections — in PARALLEL (Promise.all), not one backend
   * at a time. A dead backend used to stall every backend behind it
   * (sequential await, no timeout); each probe now aborts after
   * HEALTH_PROBE_TIMEOUT_MS, so the whole sweep costs at most one
   * probe timeout, not the sum of them.
   */
  async testAll(): Promise<Map<string, boolean>> {
    const entries = Array.from(this.backends.entries());
    const results = await Promise.all(
      entries.map(async ([name, backend]) => {
        const isRunning = await backend.testConnection();
        return [name, isRunning] as const;
      }),
    );
    const out = new Map<string, boolean>();
    for (const [name, isRunning] of results) {
      out.set(name, isRunning);
      // Update model info
      const info = this.modelInfo.get(name);
      if (info) {
        info.running = isRunning;
        info.validated = isRunning; // If running, assume validated
      }
    }
    return out;
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
   * Update a model's validated state. Validated means "a real model file
   * for this model was found on disk" (set by the bypass router's file
   * scan) or "the endpoint answered a health probe" (set by testAll).
   * Mirrors setModelEnabled; the router owns the file-derived value.
   */
  setModelValidated(name: string, validated: boolean): void {
    const info = this.modelInfo.get(name);
    if (info) {
      info.validated = validated;
    }
  }

  /**
   * Update a model's running state (a llamafile server is answering on
   * its endpoint). Set by testAll(); exposed so tests — and a future
   * server manager — can mark a model running without a live probe.
   */
  setModelRunning(name: string, running: boolean): void {
    const info = this.modelInfo.get(name);
    if (info) {
      info.running = running;
    }
  }
  
  /**
   * Check if any models are available
   */
  hasAvailableModels(): boolean {
    return Array.from(this.modelInfo.values()).some(m => m.enabled && m.validated);
  }
}
