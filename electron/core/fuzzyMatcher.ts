/**
 * Fuzzy Matcher - Typo Correction and Command Suggestions
 * 
 * Uses Levenshtein distance for deterministic fuzzy matching.
 * NO LLM DEPENDENCY - pure algorithm.
 */

import { getAllCommandNames } from './helpGrammar';

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j] + 1       // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1, higher is more similar)
 */
export function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / maxLen);
}

export interface FuzzyMatch {
  command: string;
  distance: number;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Find closest matching commands for a given input
 */
export function findClosestCommands(
  input: string,
  maxResults: number = 3,
  maxDistance: number = 3
): FuzzyMatch[] {
  const inputLower = input.toLowerCase().trim();
  const allCommands = getAllCommandNames();
  
  const matches: FuzzyMatch[] = [];
  
  for (const cmd of allCommands) {
    const distance = levenshteinDistance(inputLower, cmd.toLowerCase());
    
    // Skip if distance is too large
    if (distance > maxDistance) continue;
    
    const similarity = similarityScore(inputLower, cmd.toLowerCase());
    
    let confidence: 'high' | 'medium' | 'low';
    if (distance === 1) {
      confidence = 'high';
    } else if (distance === 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
    
    matches.push({
      command: cmd,
      distance,
      similarity,
      confidence
    });
  }
  
  // Sort by distance (ascending) then similarity (descending)
  matches.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return b.similarity - a.similarity;
  });
  
  return matches.slice(0, maxResults);
}

/**
 * Get best match for typo correction
 */
export function getBestMatch(input: string): FuzzyMatch | null {
  const matches = findClosestCommands(input, 1, 2);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Format suggestion message
 */
export function formatSuggestion(input: string, match: FuzzyMatch): string {
  const emoji = match.confidence === 'high' ? '💡' : match.confidence === 'medium' ? '🤔' : '❓';
  return `${emoji} Did you mean '${match.command}'? (distance: ${match.distance})`;
}

/**
 * Check if input is likely a typo of a known command
 */
export function isLikelyTypo(input: string): boolean {
  const match = getBestMatch(input);
  return match !== null && match.distance <= 2;
}

/**
 * Auto-correct common typos
 * Returns corrected command or null if no confident match
 */
export function autoCorrect(input: string): string | null {
  const match = getBestMatch(input);
  
  // Only auto-correct if confidence is high (distance of 1)
  if (match && match.distance === 1) {
    return match.command;
  }
  
  return null;
}

/**
 * Prefix matching for autocomplete
 */
export function findCommandsByPrefix(prefix: string, maxResults: number = 10): string[] {
  if (!prefix) return [];
  
  const prefixLower = prefix.toLowerCase();
  const allCommands = getAllCommandNames();
  
  const matches = allCommands.filter(cmd => 
    cmd.toLowerCase().startsWith(prefixLower)
  );
  
  return matches.slice(0, maxResults);
}

/**
 * Substring matching for broader search
 */
export function findCommandsBySubstring(substring: string, maxResults: number = 10): string[] {
  if (!substring) return [];
  
  const substringLower = substring.toLowerCase();
  const allCommands = getAllCommandNames();
  
  const matches = allCommands.filter(cmd => 
    cmd.toLowerCase().includes(substringLower)
  );
  
  return matches.slice(0, maxResults);
}

/**
 * Get completion suggestions for partial input
 */
export interface CompletionSuggestion {
  command: string;
  type: 'prefix' | 'fuzzy';
  score: number;
}

export function getCompletions(input: string, maxResults: number = 5): CompletionSuggestion[] {
  const inputLower = input.toLowerCase().trim();
  
  // First try prefix matching
  const prefixMatches = findCommandsByPrefix(inputLower, maxResults);
  const suggestions: CompletionSuggestion[] = prefixMatches.map(cmd => ({
    command: cmd,
    type: 'prefix',
    score: 1.0
  }));
  
  // If we don't have enough, add fuzzy matches
  if (suggestions.length < maxResults) {
    const fuzzyMatches = findClosestCommands(inputLower, maxResults - suggestions.length, 2);
    
    for (const match of fuzzyMatches) {
      // Don't duplicate prefix matches
      if (!suggestions.find(s => s.command === match.command)) {
        suggestions.push({
          command: match.command,
          type: 'fuzzy',
          score: match.similarity
        });
      }
    }
  }
  
  return suggestions.slice(0, maxResults);
}
