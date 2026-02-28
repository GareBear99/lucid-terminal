/**
 * Token/Word/Character Tracking System
 * 
 * Tracks LLM usage statistics for all tiers including cloud APIs.
 * Based on LuciferAI's token tracking implementation.
 * 
 * Features:
 * - Token counting (prompt + generated)
 * - Character estimation (~4 chars per token)
 * - Word estimation (~0.75 words per token)
 * - Session-level aggregation
 * - Per-model breakdown
 * - Cost estimation for cloud APIs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TokenStats {
  prompt_tokens: number;
  generated_tokens: number;
  total_tokens: number;
  prompt_chars: number;
  generated_chars: number;
  prompt_words: number;
  generated_words: number;
}

export interface UsageEntry {
  timestamp: string;
  model: string;
  tier: number;
  operation: string; // 'fix_generation' | 'query' | 'planning' | 'validation'
  stats: TokenStats;
  cost_usd?: number; // For cloud APIs
}

export interface SessionStats {
  session_id: string;
  started_at: string;
  ended_at?: string;
  total_tokens: number;
  total_chars: number;
  total_words: number;
  by_tier: {
    [tier: number]: {
      tokens: number;
      chars: number;
      operations: number;
    };
  };
  by_model: {
    [model: string]: {
      tokens: number;
      operations: number;
    };
  };
  cloud_cost_usd: number;
  entries: UsageEntry[];
}

// Cloud API pricing (per 1K tokens) - Update these as needed
const CLOUD_PRICING = {
  'gpt-4': {
    input: 0.03,   // $0.03 per 1K input tokens
    output: 0.06   // $0.06 per 1K output tokens
  },
  'gpt-4-turbo': {
    input: 0.01,
    output: 0.03
  },
  'gpt-3.5-turbo': {
    input: 0.0015,
    output: 0.002
  },
  'claude-3-opus': {
    input: 0.015,
    output: 0.075
  },
  'claude-3-sonnet': {
    input: 0.003,
    output: 0.015
  },
  'claude-3-haiku': {
    input: 0.00025,
    output: 0.00125
  }
};

export class TokenTracker {
  private dataDir: string;
  private sessionFile: string;
  private currentSession: SessionStats;
  
  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(os.homedir(), '.lucid', 'tracking');
    this._ensureDataDir();
    
    // Load or create current session
    const sessionId = this._generateSessionId();
    this.sessionFile = path.join(this.dataDir, `session_${sessionId}.json`);
    this.currentSession = this._loadOrCreateSession(sessionId);
  }
  
  private _ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  private _generateSessionId(): string {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  }
  
  private _loadOrCreateSession(sessionId: string): SessionStats {
    if (fs.existsSync(this.sessionFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8'));
      } catch (err) {
        console.error('Failed to load session:', err);
      }
    }
    
    return {
      session_id: sessionId,
      started_at: new Date().toISOString(),
      total_tokens: 0,
      total_chars: 0,
      total_words: 0,
      by_tier: {},
      by_model: {},
      cloud_cost_usd: 0,
      entries: []
    };
  }
  
  private _saveSession(): void {
    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify(this.currentSession, null, 2));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }
  
  /**
   * Calculate token stats from text
   * Uses LuciferAI's estimation: ~4 chars per token, ~0.75 words per token
   */
  private _calculateTokenStats(prompt: string, generated: string): TokenStats {
    const promptChars = prompt.length;
    const generatedChars = generated.length;
    
    const promptWords = prompt.split(/\s+/).length;
    const generatedWords = generated.split(/\s+/).length;
    
    // Estimate tokens (use max of char-based and word-based estimates)
    const promptTokensFromChars = Math.ceil(promptChars / 4);
    const promptTokensFromWords = Math.ceil(promptWords / 0.75);
    const promptTokens = Math.max(promptTokensFromChars, promptTokensFromWords);
    
    const generatedTokensFromChars = Math.ceil(generatedChars / 4);
    const generatedTokensFromWords = Math.ceil(generatedWords / 0.75);
    const generatedTokens = Math.max(generatedTokensFromChars, generatedTokensFromWords);
    
    return {
      prompt_tokens: promptTokens,
      generated_tokens: generatedTokens,
      total_tokens: promptTokens + generatedTokens,
      prompt_chars: promptChars,
      generated_chars: generatedChars,
      prompt_words: promptWords,
      generated_words: generatedWords
    };
  }
  
  /**
   * Calculate cost for cloud API usage
   */
  private _calculateCloudCost(model: string, stats: TokenStats): number {
    const modelKey = Object.keys(CLOUD_PRICING).find(key => 
      model.toLowerCase().includes(key.toLowerCase())
    );
    
    if (!modelKey) return 0;
    
    const pricing = CLOUD_PRICING[modelKey as keyof typeof CLOUD_PRICING];
    const inputCost = (stats.prompt_tokens / 1000) * pricing.input;
    const outputCost = (stats.generated_tokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }
  
  /**
   * Track usage from actual token stats (when available from LLM backend)
   */
  trackUsage(
    model: string,
    tier: number,
    operation: string,
    tokenStats: {
      prompt_tokens: number;
      generated_tokens: number;
      total_tokens: number;
    }
  ): void {
    // Convert token stats to full stats with character estimates
    const stats: TokenStats = {
      prompt_tokens: tokenStats.prompt_tokens,
      generated_tokens: tokenStats.generated_tokens,
      total_tokens: tokenStats.total_tokens,
      prompt_chars: tokenStats.prompt_tokens * 4,
      generated_chars: tokenStats.generated_tokens * 4,
      prompt_words: Math.ceil(tokenStats.prompt_tokens * 0.75),
      generated_words: Math.ceil(tokenStats.generated_tokens * 0.75)
    };
    
    this._recordUsage(model, tier, operation, stats);
  }
  
  /**
   * Track usage from text (when token stats not available)
   */
  trackUsageFromText(
    model: string,
    tier: number,
    operation: string,
    prompt: string,
    generated: string
  ): void {
    const stats = this._calculateTokenStats(prompt, generated);
    this._recordUsage(model, tier, operation, stats);
  }
  
  /**
   * Internal method to record usage
   */
  private _recordUsage(
    model: string,
    tier: number,
    operation: string,
    stats: TokenStats
  ): void {
    // Calculate cost if cloud API (Tier 5)
    const cost = tier === 5 ? this._calculateCloudCost(model, stats) : undefined;
    
    // Create entry
    const entry: UsageEntry = {
      timestamp: new Date().toISOString(),
      model,
      tier,
      operation,
      stats,
      cost_usd: cost
    };
    
    // Update session totals
    this.currentSession.total_tokens += stats.total_tokens;
    this.currentSession.total_chars += stats.prompt_chars + stats.generated_chars;
    this.currentSession.total_words += stats.prompt_words + stats.generated_words;
    
    // Update by-tier stats
    if (!this.currentSession.by_tier[tier]) {
      this.currentSession.by_tier[tier] = {
        tokens: 0,
        chars: 0,
        operations: 0
      };
    }
    this.currentSession.by_tier[tier].tokens += stats.total_tokens;
    this.currentSession.by_tier[tier].chars += stats.prompt_chars + stats.generated_chars;
    this.currentSession.by_tier[tier].operations++;
    
    // Update by-model stats
    if (!this.currentSession.by_model[model]) {
      this.currentSession.by_model[model] = {
        tokens: 0,
        operations: 0
      };
    }
    this.currentSession.by_model[model].tokens += stats.total_tokens;
    this.currentSession.by_model[model].operations++;
    
    // Update cloud cost
    if (cost) {
      this.currentSession.cloud_cost_usd += cost;
    }
    
    // Add entry
    this.currentSession.entries.push(entry);
    
    // Save session
    this._saveSession();
  }
  
  /**
   * Get current session stats
   */
  getSessionStats(): SessionStats {
    return { ...this.currentSession };
  }
  
  /**
   * Format stats for display (like LuciferAI)
   */
  formatStatsDisplay(stats: TokenStats, model?: string): string {
    const lines = [];
    
    lines.push(`   [Input: ${stats.prompt_tokens} tokens (${stats.prompt_chars} chars, ${stats.prompt_words} words)]`);
    lines.push(`   [Output: ${stats.generated_tokens} tokens (${stats.generated_chars} chars, ${stats.generated_words} words)]`);
    lines.push(`   [Total: ${stats.total_tokens} tokens]`);
    
    if (model) {
      const cost = this._calculateCloudCost(model, stats);
      if (cost > 0) {
        lines.push(`   [Cost: $${cost.toFixed(4)} USD]`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get summary of current session
   */
  getSessionSummary(): string {
    const lines = [];
    
    lines.push('📊 Session Usage Summary');
    lines.push('═'.repeat(60));
    lines.push('');
    
    lines.push(`Session ID: ${this.currentSession.session_id}`);
    lines.push(`Started: ${new Date(this.currentSession.started_at).toLocaleString()}`);
    lines.push('');
    
    lines.push('Total Usage:');
    lines.push(`  • Tokens: ${this.currentSession.total_tokens.toLocaleString()}`);
    lines.push(`  • Characters: ${this.currentSession.total_chars.toLocaleString()}`);
    lines.push(`  • Words: ${this.currentSession.total_words.toLocaleString()}`);
    
    if (this.currentSession.cloud_cost_usd > 0) {
      lines.push(`  • Cloud Cost: $${this.currentSession.cloud_cost_usd.toFixed(4)} USD`);
    }
    lines.push('');
    
    // By tier breakdown
    lines.push('By Tier:');
    const tierNames = {
      0: 'Tier 0 (Offline)',
      1: 'Tier 1 (Basic)',
      2: 'Tier 2 (Advanced)',
      3: 'Tier 3 (Expert)',
      4: 'Tier 4 (Ultra-Expert)',
      5: 'Tier 5 (Cloud API)'
    };
    
    for (const [tierStr, data] of Object.entries(this.currentSession.by_tier)) {
      const tier = parseInt(tierStr);
      const tierName = tierNames[tier as keyof typeof tierNames] || `Tier ${tier}`;
      lines.push(`  • ${tierName}: ${data.tokens.toLocaleString()} tokens (${data.operations} ops)`);
    }
    lines.push('');
    
    // By model breakdown
    if (Object.keys(this.currentSession.by_model).length > 0) {
      lines.push('By Model:');
      for (const [model, data] of Object.entries(this.currentSession.by_model)) {
        lines.push(`  • ${model}: ${data.tokens.toLocaleString()} tokens (${data.operations} ops)`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * End current session
   */
  endSession(): void {
    this.currentSession.ended_at = new Date().toISOString();
    this._saveSession();
  }
}
