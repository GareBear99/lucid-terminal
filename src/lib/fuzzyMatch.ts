/**
 * Fuzzy matching for the shared modal (#2).
 *
 * Atom's fuzzy finder scores with fuzzaldrin / fuzzaldrin-plus
 * (Smith–Waterman-style: runs of consecutive characters, acronyms,
 * word-starts) behind the common API `score(string, query)` /
 * `match(string, query) → indices` / `filter(candidates, query)`.
 * The scorer source was not in the clones (no node_modules), so
 * this is Lucid's own implementation of the same *shape*: a
 * subsequence match scored for consecutive runs, word starts,
 * camel transitions and exact case, with a small penalty for
 * skipped characters between the first and last match and for a
 * late first match. No new dependency.
 *
 * Pure functions — no Electron, no DOM — unit-tested on their own.
 */

/** The matched character indices in the candidate, in order. */
export interface FuzzyMatch {
  /** The score — higher is better. -Infinity when not a match. */
  score: number;
  /** Candidate indices matched by the query, in order. */
  indices: number[];
}

const SEPARATORS = new Set(['/', '-', '_', ' ', '.', '\\', ':', "'", '"']);

/**
 * The word-start bonus at a position: 0 when the character is
 * mid-word, 12 at the start or after a separator, 16 at a
 * camelCase transition — an acronym boundary (the `C` in
 * `CommandPalette` for the query `cp`) is the strongest word
 * start, the way fuzzaldrin's acronym scoring prizes it.
 */
function wordStartBonus(candidate: string, index: number): number {
  if (index === 0) return 12;
  const prev = candidate[index - 1];
  if (prev === undefined) return 12;
  if (SEPARATORS.has(prev)) return 12;
  const ch = candidate[index];
  if (
    ch !== undefined &&
    prev >= 'a' &&
    prev <= 'z' &&
    ch >= 'A' &&
    ch <= 'Z'
  ) {
    return 16;
  }
  return 0;
}

/**
 * Score `query` against `candidate` and return the matched indices.
 * Returns null when the query is not a subsequence of the candidate
 * (case-insensitive). An empty query matches everything with score 0
 * and no indices — the modal shows the unfiltered list.
 */
export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, indices: [] };
  if (query.length > candidate.length) return null;

  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  const m = q.length;
  const n = c.length;
  // The basename starts after the last '/' (0 when there is
  // no '/' — the whole candidate is the basename).
  const basenameStart = candidate.lastIndexOf('/') + 1;

  // bestEndingAt[i][j] — best score matching query[0..i) with
  // query[i-1] matched exactly at candidate[j-1]. dp[i][j] — best
  // score matching query[0..i) anywhere in candidate[0..j).
  const bestEndingAt: number[][] = [];
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    bestEndingAt.push(new Array<number>(n + 1).fill(-Infinity));
    dp.push(new Array<number>(n + 1).fill(-Infinity));
  }
  for (let j = 0; j <= n; j++) dp[0][j] = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // Carry the best score that does not use candidate[j-1].
      dp[i][j] = dp[i][j - 1];
      if (q[i - 1] !== c[j - 1]) continue;
      // Match query[i-1] at candidate[j-1].
      let charScore = 10;
      charScore += wordStartBonus(candidate, j - 1);
      if (query[i - 1] === candidate[j - 1]) charScore += 2;
      // Matches in the basename (after the last '/') score
      // higher — the file's name matters more than its
      // directory, the way VS Code's scorer prefers it.
      if (j - 1 >= basenameStart) charScore += 4;
      // Start a new run here, or continue the run that ended at j-2.
      const startRun = dp[i - 1][j - 1] + charScore;
      const continueRun = bestEndingAt[i - 1][j - 1] + charScore + 15;
      const best = Math.max(startRun, continueRun);
      bestEndingAt[i][j] = best;
      if (best > dp[i][j]) dp[i][j] = best;
    }
  }

  if (!Number.isFinite(dp[m][n])) return null;

  // Backtrack the best alignment for the indices.
  const indices: number[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (dp[i][j] === dp[i][j - 1]) {
      j--;
      continue;
    }
    // query[i-1] matched at candidate[j-1].
    indices.unshift(j - 1);
    i--;
    j--;
  }
  if (i !== 0) return null;

  // Penalties: skipped characters between the first and last
  // match, and a late first match — a tight early match wins
  // over a scattered late one.
  const first = indices[0] ?? 0;
  const last = indices[indices.length - 1] ?? 0;
  const skipped = last - first + 1 - indices.length;
  const score = dp[m][n] - 2 * skipped - first;
  return { score, indices };
}

/** The score only — -Infinity when the query does not match. */
export function fuzzyScore(query: string, candidate: string): number {
  const match = fuzzyMatch(query, candidate);
  return match ? match.score : -Infinity;
}

/**
 * Filter + rank candidates by a query. Each candidate is scored
 * against `key(candidate)`; non-matches drop out, the rest sort
 * by score descending (ties keep input order — the sort is
 * stable). An empty query returns the input unchanged.
 */
export function fuzzyFilter<T>(
  candidates: readonly T[],
  query: string,
  key: (item: T) => string,
): T[] {
  if (query.length === 0) return [...candidates];
  const scored: { item: T; score: number; index: number }[] = [];
  candidates.forEach((item, index) => {
    const score = fuzzyScore(query, key(item));
    if (Number.isFinite(score)) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.item);
}
