/**
 * Fuzzy String Matching Utilities
 * 
 * Levenshtein distance and fuzzy matching for better typo tolerance
 * Goes beyond hardcoded typo list for dynamic correction
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns number of edits (insertions, deletions, substitutions) needed
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create 2D array
  const matrix: number[][] = [];
  
  // Initialize first column
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  // Initialize first row
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity ratio (0-1) between two strings
 * 1.0 = identical, 0.0 = completely different
 */
export function similarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - (distance / maxLen);
}

/**
 * Find closest match from a list of candidates
 * Returns { match: string, score: number, distance: number }
 */
export function findClosestMatch(
  input: string,
  candidates: string[],
  threshold: number = 0.6
): { match: string; score: number; distance: number } | null {
  let bestMatch: string | null = null;
  let bestScore = 0;
  let bestDistance = Infinity;
  
  const inputLower = input.toLowerCase();
  
  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    const score = similarity(inputLower, candidateLower);
    const distance = levenshteinDistance(inputLower, candidateLower);
    
    if (score > bestScore && score >= threshold) {
      bestMatch = candidate;
      bestScore = score;
      bestDistance = distance;
    }
  }
  
  if (bestMatch) {
    return { match: bestMatch, score: bestScore, distance: bestDistance };
  }
  
  return null;
}

/**
 * Fuzzy search in an array of strings
 * Returns all matches above threshold, sorted by score
 */
export function fuzzySearch(
  query: string,
  items: string[],
  threshold: number = 0.5
): Array<{ item: string; score: number; distance: number }> {
  const queryLower = query.toLowerCase();
  const results: Array<{ item: string; score: number; distance: number }> = [];
  
  for (const item of items) {
    const itemLower = item.toLowerCase();
    
    // Exact substring match gets perfect score
    if (itemLower.includes(queryLower) || queryLower.includes(itemLower)) {
      results.push({ item, score: 1.0, distance: 0 });
      continue;
    }
    
    // Fuzzy match
    const score = similarity(queryLower, itemLower);
    const distance = levenshteinDistance(queryLower, itemLower);
    
    if (score >= threshold) {
      results.push({ item, score, distance });
    }
  }
  
  // Sort by score (descending) then distance (ascending)
  return results.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.01) {
      return a.distance - b.distance;
    }
    return b.score - a.score;
  });
}

/**
 * Check if a string matches any pattern with fuzzy tolerance
 */
export function fuzzyMatchesAny(
  input: string,
  patterns: string[],
  threshold: number = 0.7
): boolean {
  const match = findClosestMatch(input, patterns, threshold);
  return match !== null;
}

/**
 * Get suggested corrections for a typo
 * Returns up to 3 suggestions
 */
export function getSuggestions(
  typo: string,
  dictionary: string[],
  maxSuggestions: number = 3,
  threshold: number = 0.6
): string[] {
  const results = fuzzySearch(typo, dictionary, threshold);
  return results.slice(0, maxSuggestions).map(r => r.item);
}
