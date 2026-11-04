/**
 * OfflineMatcher - normalized error matching for FixNet.
 *
 * Matches a new error against stored fixes using normalized token overlap,
 * not exact-string equality and not match-everything. An unrelated error
 * must score below threshold; a reworded variant of a stored error should
 * still match.
 *
 * Grounding: FIXNET_AUDIT.md §2 (fix_dictionary.json, keyword-indexed
 * entries) and the Python FixNet error classifier in
 * LUCID-BACKEND/core/fixnet_uploader.py (_classify_error).
 *
 * Note on crypto claims: the Python FixNet encrypts with Fernet
 * (AES-128-CBC + HMAC-SHA256) and signs with SHA-256. This module does
 * not encrypt anything and makes no encryption claim.
 */

/** Minimum score for a match to count. */
export const MATCH_THRESHOLD = 0.5;

/** Minimal structural shape the matcher needs from a stored entry. */
export interface MatchableEntry {
  error_signature: string;
  error_type: string;
  solution: string;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'them', 'his', 'her', 'their', 'our', 'your', 'my',
  'if', 'then', 'else', 'when', 'while', 'but', 'so', 'such', 'than',
  'into', 'over', 'under', 'out', 'up', 'down', 'off', 'again',
]);

/**
 * Split camelCase / PascalCase boundaries so "NameError" becomes
 * "Name Error" (tokens "name", "error") instead of one opaque token.
 */
function splitCamelCase(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * Tokenize an error string: split camelCase, lowercase, split on
 * non-alphanumerics, drop stopwords. Returns the meaningful tokens.
 */
export function tokenizeError(text: string): string[] {
  const spaced = splitCamelCase(text);
  const tokens = spaced.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.filter((t) => !STOPWORDS.has(t));
}

/** Normalized form of an error string (space-joined tokens). */
export function normalizeError(text: string): string {
  return tokenizeError(text).join(' ');
}

/**
 * Classify an error into a type by keyword, mirroring the Python
 * FixNet _classify_error (NameError, SyntaxError, ImportError, TypeError,
 * AttributeError, KeyError, IndexError, ValueError, Unknown).
 */
export function classifyError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('nameerror')) return 'NameError';
  if (lower.includes('syntaxerror')) return 'SyntaxError';
  if (
    lower.includes('importerror') ||
    lower.includes('modulenotfounderror') ||
    lower.includes('module not found')
  ) {
    return 'ImportError';
  }
  if (lower.includes('typeerror')) return 'TypeError';
  if (lower.includes('attributeerror')) return 'AttributeError';
  if (lower.includes('keyerror')) return 'KeyError';
  if (lower.includes('indexerror')) return 'IndexError';
  if (lower.includes('valueerror')) return 'ValueError';
  return 'Unknown';
}

/**
 * Score how well a query error matches a stored entry, 0..1.
 *
 * score = 0.5 * containment + 0.5 * jaccard, plus a small bonus for an
 * exact normalized match and for a matching error type (capped at 1).
 * Containment is measured against the smaller token set, so a short
 * query ("NameError") can still match a longer stored error.
 */
export function scoreMatch(
  query: string,
  entry: MatchableEntry
): number {
  const qTokens = new Set(tokenizeError(query));
  const eTokens = new Set(tokenizeError(entry.error_signature));
  if (qTokens.size === 0 || eTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of qTokens) {
    if (eTokens.has(t)) overlap++;
  }
  if (overlap === 0) return 0;

  const containment = overlap / Math.min(qTokens.size, eTokens.size);
  const union = new Set([...qTokens, ...eTokens]);
  const jaccard = overlap / union.size;

  let score = 0.5 * containment + 0.5 * jaccard;
  if (normalizeError(query) === normalizeError(entry.error_signature)) {
    score += 0.15;
  }
  const queryType = classifyError(query);
  if (queryType !== 'Unknown' && queryType === entry.error_type) {
    score += 0.1;
  }
  return Math.min(1, score);
}

export interface MatchResult<T extends MatchableEntry> {
  entry: T;
  score: number;
}

/**
 * OfflineMatcher - finds the best stored fix for a new error, offline.
 */
export class OfflineMatcher {
  readonly threshold: number;

  constructor(threshold: number = MATCH_THRESHOLD) {
    this.threshold = threshold;
  }

  /** Score a single query/entry pair, 0..1. */
  score(query: string, entry: MatchableEntry): number {
    return scoreMatch(query, entry);
  }

  /** Best matching entry at or above threshold, or null. */
  match<T extends MatchableEntry>(
    query: string,
    entries: T[]
  ): MatchResult<T> | null {
    let best: MatchResult<T> | null = null;
    for (const entry of entries) {
      const score = this.score(query, entry);
      if (score >= this.threshold && (!best || score > best.score)) {
        best = { entry, score };
      }
    }
    return best;
  }

  /** All matching entries at or above threshold, best first. */
  search<T extends MatchableEntry>(
    query: string,
    entries: T[]
  ): MatchResult<T>[] {
    return entries
      .map((entry) => ({ entry, score: this.score(query, entry) }))
      .filter((r) => r.score >= this.threshold)
      .sort((a, b) => b.score - a.score);
  }
}
