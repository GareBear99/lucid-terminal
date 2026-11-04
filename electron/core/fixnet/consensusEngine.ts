/**
 * ConsensusEngine - multi-factor scoring and trust for FixNet fixes.
 *
 * Grounding: FIXNET_IMPLEMENTATION.md Phase 1 — multi-factor scoring
 * (success 50%, network 20%, context 15%, recency 15%) and trust levels
 * (Highly Trusted 75%+, Trusted 51-74%, Experimental 30-50%,
 * Quarantined <30%), with cached consensus. FIXNET_AUDIT.md §2
 * (consensus_cache.json) for the trust-level vocabulary.
 *
 * The engine is pure scoring except for recordOutcome/vote, which
 * persist through an attached FixDictionary (or an in-memory map when
 * no dictionary is attached).
 */

import type { FixDictionary, FixEntry } from './fixDictionary';

export type TrustLevel =
  | 'highly_trusted'
  | 'trusted'
  | 'experimental'
  | 'quarantined';

export interface ConsensusFactors {
  /** Share of recorded attempts that succeeded (0.5 with no attempts). */
  success: number;
  /** Community confirmations (0.5 neutral when none are recorded). */
  network: number;
  /** How well the fix's error matches the query (matcher score, 0..1). */
  context: number;
  /** Freshness of the fix (1.0 under 7 days, decaying to 0 by 180 days). */
  recency: number;
}

export interface ConsensusGrade {
  /** Weighted score, 0..1. */
  score: number;
  trust_level: TrustLevel;
  factors: ConsensusFactors;
  /** False when quarantined — the fix must not be served. */
  safe_to_use: boolean;
}

const WEIGHTS = { success: 0.5, network: 0.2, context: 0.15, recency: 0.15 };
const RECENCY_FULL_DAYS = 7;
const RECENCY_ZERO_DAYS = 180;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class ConsensusEngine {
  private readonly dictionary?: FixDictionary;
  private readonly memoryOutcomes = new Map<
    string,
    { success: number; failure: number }
  >();

  constructor(dictionary?: FixDictionary) {
    this.dictionary = dictionary;
  }

  /** Freshness factor from an ISO timestamp. */
  recencyFactor(timestamp: string): number {
    const when = Date.parse(timestamp);
    if (Number.isNaN(when)) return 0.5;
    const ageDays = (Date.now() - when) / 86_400_000;
    if (ageDays <= RECENCY_FULL_DAYS) return 1;
    if (ageDays >= RECENCY_ZERO_DAYS) return 0;
    return (
      1 - (ageDays - RECENCY_FULL_DAYS) / (RECENCY_ZERO_DAYS - RECENCY_FULL_DAYS)
    );
  }

  /** Network factor from recorded community confirmations. */
  networkFactor(entry: FixEntry): number {
    const confirmations = entry.meta?.confirmations;
    if (typeof confirmations === 'number' && confirmations > 0) {
      return Math.min(1, confirmations / 5);
    }
    const uniqueUsers = entry.meta?.unique_users;
    if (typeof uniqueUsers === 'number' && uniqueUsers > 0) {
      return Math.min(1, uniqueUsers / 5);
    }
    return 0.5;
  }

  /** Trust level for a weighted score. */
  trustLevel(score: number): TrustLevel {
    if (score >= 0.75) return 'highly_trusted';
    if (score >= 0.51) return 'trusted';
    if (score >= 0.3) return 'experimental';
    return 'quarantined';
  }

  /**
   * Grade one candidate fix. `contextScore` is the matcher score for how
   * well the fix's error matches the query (0..1).
   */
  grade(entry: FixEntry, contextScore: number): ConsensusGrade {
    const attempts = entry.success_count + entry.failure_count;
    const success =
      attempts > 0 ? entry.success_count / attempts : 0.5;
    const factors: ConsensusFactors = {
      success: clamp01(success),
      network: clamp01(this.networkFactor(entry)),
      context: clamp01(contextScore),
      recency: clamp01(this.recencyFactor(entry.timestamp)),
    };
    const score =
      WEIGHTS.success * factors.success +
      WEIGHTS.network * factors.network +
      WEIGHTS.context * factors.context +
      WEIGHTS.recency * factors.recency;
    const trust_level = this.trustLevel(score);
    return {
      score,
      trust_level,
      factors,
      safe_to_use: trust_level !== 'quarantined',
    };
  }

  /** True unless the grade is quarantined. */
  isSafeToUse(grade: ConsensusGrade): boolean {
    return grade.safe_to_use;
  }

  /**
   * Record whether a served fix worked. Persists through the attached
   * dictionary when present; otherwise tracks in memory. Returns the
   * updated counts, or false when the fix hash is unknown.
   */
  recordOutcome(
    fixHash: string,
    success: boolean
  ): { success_count: number; failure_count: number } | false {
    if (this.dictionary) {
      const ok = this.dictionary.recordOutcome(fixHash, success);
      if (!ok) return false;
      const entry = this.dictionary.byHash(fixHash);
      if (!entry) return false;
      return {
        success_count: entry.success_count,
        failure_count: entry.failure_count,
      };
    }
    const counts = this.memoryOutcomes.get(fixHash) ?? {
      success: 0,
      failure: 0,
    };
    if (success) counts.success += 1;
    else counts.failure += 1;
    this.memoryOutcomes.set(fixHash, counts);
    return { success_count: counts.success, failure_count: counts.failure };
  }

  /** Community vote on a fix (up = it worked, down = it did not). */
  vote(
    fixHash: string,
    vote: 'up' | 'down'
  ): { success_count: number; failure_count: number } | false {
    return this.recordOutcome(fixHash, vote === 'up');
  }
}
