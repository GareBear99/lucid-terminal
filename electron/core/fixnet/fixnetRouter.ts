/**
 * FixNetRouter - main orchestrator for offline-first error fixing.
 *
 * Wires FixDictionary (persistent store) + OfflineMatcher (normalized
 * matching) + ConsensusEngine (multi-factor trust) into the API the
 * Electron app imports:
 *   - findFix({ error }) -> FixResponse
 *   - storeFix(kind, error, solution, meta) — safe to call without await
 *   - getStats() -> { dictionary: { total_fixes, total_scripts },
 *                     performance: { offline_success_rate } }
 *   - searchDictionary(query) -> stored entries matching the query
 *
 * LOCAL-ONLY (Gary, 2026-11-04): FixNet stores fixes on this machine
 * and never sends them anywhere. Sharing comes later with the causal
 * cloud sync — Gary's term, design open, to be explained later. There
 * is no sync path in this module, and none may claim to implement it.
 *
 * offline_success_rate is COMPUTED from real lookup outcomes
 * (offline hits / total findFix calls, persisted in fixnet_stats.json
 * under the lucid dir). It is 0 when there have been no lookups yet.
 * It is never a hardcoded constant. It is a DICTIONARY HIT RATE, not
 * a fix success rate — the outcome-based rate (recorded successes /
 * recorded attempts) is reported separately as
 * outcome_success_rate, and is null until any outcome is recorded.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FixDictionary } from './fixDictionary';
import type { FixEntry } from './fixDictionary';
import { OfflineMatcher } from './offlineMatcher';
import { ConsensusEngine } from './consensusEngine';
import type { ConsensusGrade } from './consensusEngine';

export interface FixRequest {
  error: string;
}

export interface FixResponse {
  success: boolean;
  needs_llm: boolean;
  fix?: { solution: string; fix_hash: string };
  /**
   * Confidence (0..1) that this is the right fix. Always present: the
   * match score on a hit, 0 on a miss. Callers multiply it by 100, so
   * it must never be undefined.
   */
  confidence: number;
  source?: string;
  quality?: ConsensusGrade | any;
  execution_time_ms?: number;
}

interface RouterStats {
  total_lookups: number;
  offline_hits: number;
}

export interface FixNetStats {
  dictionary: {
    total_fixes: number;
    total_scripts: number;
  };
  performance: {
    /** Real measured rate: offline hits / total findFix calls (0 if none).
     * This is a dictionary HIT rate, not a fix success rate. */
    offline_success_rate: number;
    /** Outcome-based rate: recorded successes / recorded attempts across
     * all entries, or null when no outcome has ever been recorded. */
    outcome_success_rate: number | null;
    /** Total recorded outcomes (successes + failures) across all entries. */
    total_attempts: number;
  };
}

export class FixNetRouter {
  private readonly dictionary: FixDictionary;
  private readonly matcher: OfflineMatcher;
  private readonly consensus: ConsensusEngine;
  private readonly statsPath: string;
  private stats: RouterStats;

  /**
   * @param lucidDir directory the dictionary + stats files live under
   * (e.g. ~/.lucid). Created if missing. A corrupt dictionary file
   * throws here — loudly, instead of starting with an empty store.
   */
  constructor(lucidDir: string) {
    const dir = path.resolve(lucidDir);
    fs.mkdirSync(dir, { recursive: true });
    this.dictionary = new FixDictionary(dir);
    this.matcher = new OfflineMatcher();
    this.consensus = new ConsensusEngine(this.dictionary);
    this.statsPath = path.join(dir, 'fixnet_stats.json');
    this.stats = this.loadStats();
  }

  /** Load persisted lookup counters. A corrupt stats file resets the
   * counters to zero with a loud warning (counters only — the dictionary
   * itself is unaffected and still fails loudly on corruption). */
  private loadStats(): RouterStats {
    if (!fs.existsSync(this.statsPath)) {
      return { total_lookups: 0, offline_hits: 0 };
    }
    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.statsPath, 'utf-8')
      ) as Partial<RouterStats>;
      return {
        total_lookups:
          typeof parsed.total_lookups === 'number'
            ? parsed.total_lookups
            : 0,
        offline_hits:
          typeof parsed.offline_hits === 'number' ? parsed.offline_hits : 0,
      };
    } catch {
      console.warn(
        `[FixNet] fixnet_stats.json is corrupt; resetting lookup counters ` +
          `to zero (${this.statsPath}).`
      );
      return { total_lookups: 0, offline_hits: 0 };
    }
  }

  /** Atomic-ish save of the lookup counters. */
  private saveStats(): void {
    const tmp = `${this.statsPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.stats, null, 2), 'utf-8');
    fs.renameSync(tmp, this.statsPath);
  }

  private recordLookup(hit: boolean): void {
    this.stats.total_lookups += 1;
    if (hit) this.stats.offline_hits += 1;
    this.saveStats();
  }

  /**
   * Find an offline fix for an error. Returns success + the fix when a
   * stored entry matches and the consensus engine rates it safe to use;
   * otherwise success=false + needs_llm=true (the caller falls back to
   * the LLM). A matched-but-quarantined fix is also a miss.
   */
  async findFix(request: FixRequest): Promise<FixResponse> {
    const started = Date.now();
    const error = (request && request.error) || '';
    if (!error.trim()) {
      this.recordLookup(false);
      return {
        success: false,
        needs_llm: true,
        confidence: 0,
        execution_time_ms: Date.now() - started,
      };
    }

    const match = this.matcher.match(error, this.dictionary.all());
    if (!match) {
      this.recordLookup(false);
      return {
        success: false,
        needs_llm: true,
        confidence: 0,
        execution_time_ms: Date.now() - started,
      };
    }

    const grade = this.consensus.grade(match.entry, match.score);
    if (!grade.safe_to_use) {
      this.recordLookup(false);
      return {
        success: false,
        needs_llm: true,
        confidence: 0,
        execution_time_ms: Date.now() - started,
      };
    }

    this.recordLookup(true);
    return {
      success: true,
      needs_llm: false,
      fix: { solution: match.entry.solution, fix_hash: match.entry.fix_hash },
      confidence: match.score,
      source: 'fixnet_dictionary',
      quality: grade,
      execution_time_ms: Date.now() - started,
    };
  }

  /**
   * Store a fix for future offline use. The write is synchronous, so
   * callers that do NOT await this (workflowOrchestrator calls it
   * fire-and-forget) still get a durable fix. Returns a resolved
   * promise so it can also be awaited.
   *
   * Stores nothing for an empty error (F12): the dictionary refuses
   * empty error signatures.
   */
  storeFix(
    kind: string,
    error: string,
    solution: string,
    meta: Record<string, unknown> = {}
  ): Promise<void> {
    if (!error || !error.trim()) return Promise.resolve();
    this.dictionary.add(kind, error, solution, meta || {});
    return Promise.resolve();
  }

  /** Dictionary totals + the real measured rates (hit rate and,
   * once outcomes exist, the outcome-based success rate). */
  async getStats(): Promise<FixNetStats> {
    const dictionary = this.dictionary.getStats();
    const offline_success_rate =
      this.stats.total_lookups > 0
        ? this.stats.offline_hits / this.stats.total_lookups
        : 0;
    let successes = 0;
    let failures = 0;
    for (const entry of this.dictionary.all()) {
      successes += entry.success_count;
      failures += entry.failure_count;
    }
    const total_attempts = successes + failures;
    return {
      dictionary,
      performance: {
        offline_success_rate,
        outcome_success_rate:
          total_attempts > 0 ? successes / total_attempts : null,
        total_attempts,
      },
    };
  }

  /** Stored entries matching a free-text query, best match first. */
  async searchDictionary(query: string): Promise<any[]> {
    const results = this.matcher.search(query, this.dictionary.all());
    return results.map((r) => ({
      ...(r.entry as unknown as Record<string, unknown>),
      match_score: r.score,
    }));
  }

  /**
   * Record whether a served fix actually worked (drives the consensus
   * success factor). Returns false when the fix hash is unknown.
   */
  recordOutcome(fixHash: string, success: boolean): boolean {
    return this.dictionary.recordOutcome(fixHash, success);
  }

  /** Delete a stored fix by hash. Returns false when unknown. */
  deleteByHash(fixHash: string): boolean {
    return this.dictionary.deleteByHash(fixHash);
  }

  /** One stored entry by hash, or undefined when unknown. */
  getEntry(fixHash: string): FixEntry | undefined {
    return this.dictionary.byHash(fixHash);
  }

  /**
   * Grade one stored entry by hash (context score 1.0: the user chose
   * this fix explicitly, e.g. via `fixnet apply` / `fixnet report`).
   * Returns null when the hash is unknown.
   */
  gradeEntry(fixHash: string): ConsensusGrade | null {
    const entry = this.dictionary.byHash(fixHash);
    if (!entry) return null;
    return this.consensus.grade(entry, 1.0);
  }

  /** Direct access to the underlying entry list (debugging / tests). */
  listEntries(): FixEntry[] {
    return this.dictionary.all();
  }
}
