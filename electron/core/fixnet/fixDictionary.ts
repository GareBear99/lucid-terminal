/**
 * FixDictionary - persistent local store for FixNet fixes.
 *
 * One JSON file (fix_dictionary.json) under the lucid dir, keyed by error
 * type, in the same shape the Python FixNet uses
 * (FIXNET_AUDIT.md §2 / LUCID-BACKEND/core/fixnet_uploader.py):
 * entries carry an error signature, a solution, a SHA-256 fix hash,
 * keywords, success/failure counts, a relevance score, a timestamp and
 * context. Script templates are tracked separately so the dictionary can
 * report how many distinct scripts it holds.
 *
 * Fail-loud by design: a corrupt dictionary file (invalid JSON, or the
 * wrong shape) throws on load instead of silently starting empty.
 * Delete the file to reset the dictionary.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { classifyError, normalizeError, tokenizeError } from './offlineMatcher';

export interface FixEntry {
  /** The original error text as stored. */
  error_signature: string;
  /** Classified error type (NameError, TypeError, ...). */
  error_type: string;
  /** The fix / solution text. */
  solution: string;
  /** SHA-256 of the canonical error+solution JSON (fix identity). */
  fix_hash: string;
  /** Caller-supplied context (line, function, model, ...). */
  context: Record<string, unknown>;
  /** ISO timestamp of the latest store. */
  timestamp: string;
  /** Normalized keywords extracted from the error text. */
  keywords: string[];
  /** Times this fix was reported to have worked. */
  success_count: number;
  /** Times this fix was reported to have failed. */
  failure_count: number;
  /** 0..1 relevance (successes / attempts, 0.5 with no attempts yet). */
  relevance_score: number;
  /** How the fix was produced ('generated_fix' | 'script_template' | 'error_fix' | ...). */
  kind: string;
  /** Caller-supplied metadata, stored verbatim. */
  meta: Record<string, unknown>;
}

interface DictionaryFile {
  version: number;
  entries: Record<string, FixEntry[]>;
  scripts: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** SHA-256 hex of the canonical error+solution pair (fix identity). */
export function hashFix(error: string, solution: string): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ error, solution }))
    .digest('hex');
}

export class FixDictionary {
  private readonly filePath: string;
  private data: DictionaryFile;

  constructor(lucidDir: string) {
    const dir = path.resolve(lucidDir);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'fix_dictionary.json');
    this.data = this.load();
  }

  /** Load the file. Throws a descriptive error on corrupt content. */
  private load(): DictionaryFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, entries: {}, scripts: [] };
    }
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `FixNet dictionary is corrupt (invalid JSON in ${this.filePath}): ` +
          `${(err as Error).message}. Refusing to start with a silently ` +
          `empty dictionary — fix or delete the file.`
      );
    }
    if (!isRecord(parsed) || !isRecord(parsed.entries)) {
      throw new Error(
        `FixNet dictionary is corrupt (unexpected shape in ${this.filePath}): ` +
          `expected an object with an "entries" map. Refusing to start ` +
          `with a silently empty dictionary — fix or delete the file.`
      );
    }
    const entries: Record<string, FixEntry[]> = {};
    for (const [type, list] of Object.entries(parsed.entries)) {
      if (Array.isArray(list)) {
        entries[type] = list.filter(isRecord) as unknown as FixEntry[];
      }
    }
    const scripts = Array.isArray(parsed.scripts)
      ? (parsed.scripts.filter((s) => typeof s === 'string') as string[])
      : [];
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      entries,
      scripts,
    };
  }

  /** Atomic-ish save: write a temp file, then rename over the real one. */
  private save(): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Store a fix. A repeat store of the same normalized error updates the
   * existing entry (new solution/timestamp) instead of duplicating it,
   * and keeps its success/failure counts.
   */
  add(
    kind: string,
    error: string,
    solution: string,
    meta: Record<string, unknown> = {}
  ): FixEntry {
    const errorType = classifyError(error);
    const list = this.data.entries[errorType] ?? [];
    const normalized = normalizeError(error);
    const existing = list.find(
      (e) => normalizeError(e.error_signature) === normalized
    );
    const now = new Date().toISOString();

    if (existing) {
      existing.solution = solution;
      existing.fix_hash = hashFix(error, solution);
      existing.timestamp = now;
      existing.kind = kind;
      existing.meta = meta;
      existing.context = meta;
      this.trackScript(kind, meta);
      this.save();
      return existing;
    }

    const entry: FixEntry = {
      error_signature: error,
      error_type: errorType,
      solution,
      fix_hash: hashFix(error, solution),
      context: meta,
      timestamp: now,
      keywords: [...new Set(tokenizeError(error))],
      success_count: 0,
      failure_count: 0,
      relevance_score: 0.5,
      kind,
      meta,
    };
    list.push(entry);
    this.data.entries[errorType] = list;
    this.trackScript(kind, meta);
    this.save();
    return entry;
  }

  /** Record a script filename from a script-template store. */
  private trackScript(kind: string, meta: Record<string, unknown>): void {
    if (kind !== 'script_template') return;
    const filename = meta.filename;
    if (typeof filename === 'string' && filename.length > 0) {
      if (!this.data.scripts.includes(filename)) {
        this.data.scripts.push(filename);
      }
    }
  }

  /** All stored entries, across all error types. */
  all(): FixEntry[] {
    return Object.values(this.data.entries).flat();
  }

  /** Entries for one error type. */
  byType(errorType: string): FixEntry[] {
    return this.data.entries[errorType] ?? [];
  }

  /** Find one entry by its fix hash. */
  byHash(fixHash: string): FixEntry | undefined {
    return this.all().find((e) => e.fix_hash === fixHash);
  }

  /**
   * Record whether a served fix actually worked. Updates the entry's
   * counts and relevance score and persists. Returns false if the hash
   * is unknown.
   */
  recordOutcome(fixHash: string, success: boolean): boolean {
    const entry = this.byHash(fixHash);
    if (!entry) return false;
    if (success) {
      entry.success_count += 1;
    } else {
      entry.failure_count += 1;
    }
    const attempts = entry.success_count + entry.failure_count;
    entry.relevance_score =
      attempts > 0 ? entry.success_count / attempts : 0.5;
    this.save();
    return true;
  }

  /** { total_fixes, total_scripts } for getStats(). */
  getStats(): { total_fixes: number; total_scripts: number } {
    return {
      total_fixes: this.all().length,
      total_scripts: this.data.scripts.length,
    };
  }
}
