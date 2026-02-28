/**
 * TokenDisplay Component
 * 
 * Displays token statistics for LLM responses.
 * Matches LuciferAI's token tracking system from TOKEN_TRACKING_SYSTEM.md
 * 
 * Shows:
 * - Input tokens & characters
 * - Output tokens & characters
 * - Total tokens
 * - Chars-per-token ratio
 */

import type { TokenStats } from '../../types/plugin';

interface TokenDisplayProps {
  tokens: TokenStats;
  compact?: boolean;
}

export function TokenDisplay({ tokens, compact = false }: TokenDisplayProps) {
  if (!tokens || tokens.total_tokens === 0) return null;
  
  if (compact) {
    return (
      <span className="text-xs text-gray-600 font-mono">
        [{tokens.total_tokens} tokens]
      </span>
    );
  }
  
  return (
    <div className="token-display mt-2 pt-2 border-t border-gray-800">
      <div className="text-xs text-gray-500 font-mono">
        <span className="text-gray-600">[</span>
        <span className="text-blue-400">Input:</span> {tokens.prompt_tokens} tokens 
        <span className="text-gray-600"> (</span>
        <span className="text-gray-500">{tokens.prompt_chars} chars</span>
        <span className="text-gray-600">)</span>
        <span className="text-gray-600">, </span>
        <span className="text-green-400">Output:</span> {tokens.generated_tokens} tokens 
        <span className="text-gray-600"> (</span>
        <span className="text-gray-500">{tokens.output_chars} chars</span>
        <span className="text-gray-600">)</span>
        <span className="text-gray-600">, </span>
        <span className="text-purple-400">Total:</span> {tokens.total_tokens} tokens
        <span className="text-gray-600">]</span>
        
        {/* Chars-per-token ratio */}
        {tokens.chars_per_token > 0 && (
          <span className="ml-2 text-gray-700">
            ({tokens.chars_per_token.toFixed(2)} chars/token)
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * TokenSummary Component
 * 
 * Displays aggregate token statistics for a session.
 * Useful for showing cumulative usage across multiple commands.
 */

interface TokenSummaryProps {
  totalTokens: number;
  totalCommands: number;
  avgTokensPerCommand?: number;
}

export function TokenSummary({ totalTokens, totalCommands, avgTokensPerCommand }: TokenSummaryProps) {
  return (
    <div className="token-summary p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
      <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
        Session Token Usage
      </h4>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-[var(--accent)]">{totalTokens.toLocaleString()}</div>
          <div className="text-xs text-[var(--text-muted)]">Total Tokens</div>
        </div>
        <div>
          <div className="text-lg font-bold text-[var(--text-primary)]">{totalCommands}</div>
          <div className="text-xs text-[var(--text-muted)]">Commands</div>
        </div>
        <div>
          <div className="text-lg font-bold text-[var(--text-secondary)]">
            {avgTokensPerCommand ? avgTokensPerCommand.toFixed(0) : '-'}
          </div>
          <div className="text-xs text-[var(--text-muted)]">Avg/Command</div>
        </div>
      </div>
    </div>
  );
}

/**
 * ModelTokenInfo Component
 * 
 * Shows which model was used and its token consumption.
 * Matches LuciferAI's bypass routing display format.
 */

interface ModelTokenInfoProps {
  modelName: string;
  tier: number;
  tokens: TokenStats;
  bypassedModels?: string[];
}

export function ModelTokenInfo({ modelName, tier, tokens, bypassedModels }: ModelTokenInfoProps) {
  const tierNames = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'];
  
  return (
    <div className="model-token-info text-xs text-gray-500 font-mono space-y-1 my-2">
      {/* Bypassed models (if any) */}
      {bypassedModels && bypassedModels.length > 0 && (
        <div className="text-gray-600">
          <span className="text-gray-500">💡 Bypassed:</span>{' '}
          {bypassedModels.map((model, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span className="text-yellow-600">{model}</span>
            </span>
          ))}
        </div>
      )}
      
      {/* Active model */}
      <div>
        <span className="text-gray-500">🧠 Using:</span>{' '}
        <span className="text-cyan-400">{modelName}</span>{' '}
        <span className="text-gray-600">({tierNames[tier] || `Tier ${tier}`})</span>
      </div>
      
      {/* Token usage */}
      <TokenDisplay tokens={tokens} />
    </div>
  );
}

/**
 * Token efficiency indicator
 * 
 * Visual indicator of token efficiency (chars-per-token ratio).
 * Higher is generally better (more information per token).
 */

interface TokenEfficiencyProps {
  ratio: number;
}

export function TokenEfficiency({ ratio }: TokenEfficiencyProps) {
  // Typical ranges:
  // < 3.0: Very inefficient (mostly short words)
  // 3.0-4.0: Normal (English average)
  // 4.0-5.0: Good (longer words, technical terms)
  // > 5.0: Excellent (compressed, efficient)
  
  const getEfficiencyLevel = () => {
    if (ratio < 3.0) return { label: 'Low', color: 'text-red-400', emoji: '⚠️' };
    if (ratio < 4.0) return { label: 'Normal', color: 'text-yellow-400', emoji: '➡️' };
    if (ratio < 5.0) return { label: 'Good', color: 'text-green-400', emoji: '✓' };
    return { label: 'Excellent', color: 'text-blue-400', emoji: '⭐' };
  };
  
  const efficiency = getEfficiencyLevel();
  
  return (
    <span className={`text-xs font-medium ${efficiency.color}`} title={`${ratio.toFixed(2)} chars/token`}>
      {efficiency.emoji} {efficiency.label} efficiency
    </span>
  );
}

/**
 * Parse token stats from LuciferAI response
 * 
 * Extracts token statistics from various response formats.
 */
export function parseTokenStatsFromResponse(response: any): TokenStats | null {
  // Format 1: Direct stats object
  if (response.stats) {
    return {
      prompt_tokens: response.stats.prompt_tokens || 0,
      generated_tokens: response.stats.generated_tokens || 0,
      total_tokens: response.stats.total_tokens || 0,
      prompt_chars: response.stats.prompt_chars || 0,
      output_chars: response.stats.output_chars || 0,
      chars_per_token: response.stats.chars_per_token || 0
    };
  }
  
  // Format 2: Separate fields
  if (response.prompt_tokens !== undefined) {
    return {
      prompt_tokens: response.prompt_tokens || 0,
      generated_tokens: response.generated_tokens || 0,
      total_tokens: response.total_tokens || 0,
      prompt_chars: response.prompt_chars || 0,
      output_chars: response.output_chars || 0,
      chars_per_token: response.chars_per_token || 0
    };
  }
  
  // Format 3: Calculate from output
  if (response.output && response.command) {
    const outputChars = response.output.length;
    const promptChars = response.command?.length || 0;
    const estimatedOutputTokens = Math.ceil(outputChars / 4); // ~4 chars/token
    const estimatedPromptTokens = Math.ceil(promptChars / 4);
    
    return {
      prompt_tokens: estimatedPromptTokens,
      generated_tokens: estimatedOutputTokens,
      total_tokens: estimatedPromptTokens + estimatedOutputTokens,
      prompt_chars: promptChars,
      output_chars: outputChars,
      chars_per_token: outputChars > 0 ? outputChars / estimatedOutputTokens : 0
    };
  }
  
  return null;
}
