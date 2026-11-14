/**
 * Code patterns for completions (steal #7 — Tabnine, patterns
 * only — 2026-11-14).
 *
 * Tabnine's stealable idea, reimplemented in TypeScript by
 * behavior (no code copied — Tabnine is closed-source; the
 * research is docs only, see ~/workspace/steal/notes/tabnine.md):
 * learn from the user's OWN code, locally, by retrieval — not
 * by training a model. Tabnine's layer 1 is "local code
 * awareness": a RAG index over the local workspace, built on
 * first run and incrementally updated, stored locally. Lucid's
 * version at this slice's scale is a deterministic pattern
 * index over the open files: no vectors, no model, no network,
 * no new dependency — just the repeated shapes the user
 * already writes.
 *
 * A pattern is one of two shapes, both extracted textually
 * from the open files' contents:
 *   - a repeated line: a trimmed source line that appears at
 *     least twice across the indexed files (twice in one file
 *     counts — a line the user writes twice is a line they
 *     will write a third time);
 *   - a repeated identifier chain: a dotted chain of two or
 *     more identifiers (`useFileStore.getState`,
 *     `terminalState.tabs.find`) that appears at least twice.
 *
 * Grounding: the offered text is verbatim text from the
 * user's own files, so a pattern cannot invent a name — it
 * can only repeat one. That is the Tabnine S5 promise in
 * Lucid's form (retrieval, not training). The composer path
 * adds the TS-LSP gate on top: a pattern's leading identifier
 * must be in the caller's verified structure list when that
 * list is non-empty (see completePattern) — the same gate
 * steal #3 puts on structure identifiers. In the editor the
 * LSP items already carry the verified symbols and sort
 * first; the pattern suggestions sort last and are deduped
 * against them.
 *
 * Priority: a pattern is the weakest signal in the ghost
 * chain (history → slash → file → structure → pattern) —
 * a repeated idiom, not an exact fact — so it only fires
 * when nothing more exact does, and it never outranks a
 * verified identifier.
 *
 * The index is lazy and in-memory only (Tabnine S5: built on
 * first run, incrementally updated). `sync` re-extracts only
 * the files whose fingerprint changed (path + length +
 * contentHash, the agent index's FNV-1a). Nothing is ever
 * written to disk — in guest the index is session-only, like
 * everything else the guest touches. The composer and the
 * editor share one module-level index via getPatternIndex()
 * so the open files are extracted once, not once per surface.
 *
 * Limits, stated honestly:
 *   - extraction is textual (regex), not syntactic: a chain
 *     inside a string literal or a comment still counts. A
 *     tree-sitter pass could exclude those; the slice does
 *     not — the offered text is still the user's own code.
 *   - the index covers the open files only. Workspace-wide
 *     RAG is the later Kite/docs-panel direction, not this
 *     slice — the pure extractPatterns() takes any file list,
 *     so the wider index is a caller change, not a rewrite.
 *   - comment-only lines, blank lines, brace-only lines and
 *     very long lines are never patterns.
 */

import { contentHash } from './agentIndex';

export interface PatternSourceFile {
  path: string;
  content: string;
}

export type PatternKind = 'line' | 'chain';

export interface CodePattern {
  /** The full text offered: a trimmed line, or a chain. */
  text: string;
  kind: PatternKind;
  /** Occurrences across the indexed files. */
  count: number;
  /** Up to three file paths the pattern came from (the
   *  references list, Tabnine S5 in minimal form). */
  sources: string[];
}

/** A line must be at least this long to be a pattern — a
 *  shorter line would ghost everywhere. */
const MIN_LINE_LENGTH = 10;
/** A pattern is never offered past this length — a 500-char
 *  line is not a completion. */
const MAX_PATTERN_LENGTH = 200;
/** A chain must be at least this long in total. */
const MIN_CHAIN_LENGTH = 5;
/** The merged index keeps at most this many patterns —
 *  the open files bound it in practice; the cap is insurance. */
const MAX_PATTERNS = 500;
/** Sources kept per pattern (a references list, not an audit). */
const MAX_SOURCES = 3;

/** Dotted identifier chains: two or more identifiers joined
 *  by dots. Greedy — `a.b.c` matches as one chain, never as
 *  `a.b` plus `c`. */
const CHAIN_RE = /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/g;

/** The leading identifier of a pattern — the gate checks
 *  this name against the verified list. */
const LEADING_IDENTIFIER_RE = /^[A-Za-z_$][\w$]*/;

/** Lines that are never patterns: comment-only, or with no
 *  identifier character at all (braces, punctuation). */
function isPatternLine(line: string): boolean {
  if (line.length < MIN_LINE_LENGTH) return false;
  if (line.length > MAX_PATTERN_LENGTH) return false;
  if (line.startsWith('//') || line.startsWith('*') || line.startsWith('#')) {
    return false;
  }
  return /[A-Za-z_$]/.test(line);
}

/**
 * Extract the patterns from a list of files — pure, no I/O.
 * Counts every occurrence (a line twice in one file counts
 * twice); merges across files; ranks by count desc, then
 * length desc, then first-seen order (stable).
 */
export function extractPatterns(files: ReadonlyArray<PatternSourceFile>): CodePattern[] {
  const counts = new Map<string, { kind: PatternKind; count: number; sources: string[] }>();
  const key = (kind: PatternKind, text: string) => `${kind}:${text}`;

  for (const file of files) {
    for (const rawLine of file.content.split('\n')) {
      const line = rawLine.trim();
      if (isPatternLine(line)) {
        const entry = counts.get(key('line', line));
        if (entry) {
          entry.count += 1;
          if (!entry.sources.includes(file.path) && entry.sources.length < MAX_SOURCES) {
            entry.sources.push(file.path);
          }
        } else {
          counts.set(key('line', line), {
            kind: 'line',
            count: 1,
            sources: [file.path],
          });
        }
      }
      // Chains are counted per occurrence, not per line — a
      // line with two chains counts both.
      CHAIN_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CHAIN_RE.exec(rawLine)) !== null) {
        const chain = match[0];
        if (chain.length < MIN_CHAIN_LENGTH || chain.length > MAX_PATTERN_LENGTH) continue;
        const entry = counts.get(key('chain', chain));
        if (entry) {
          entry.count += 1;
          if (!entry.sources.includes(file.path) && entry.sources.length < MAX_SOURCES) {
            entry.sources.push(file.path);
          }
        } else {
          counts.set(key('chain', chain), {
            kind: 'chain',
            count: 1,
            sources: [file.path],
          });
        }
      }
    }
  }

  const patterns: CodePattern[] = [];
  for (const [k, entry] of counts) {
    // A pattern is a REPEAT — a single occurrence is just a
    // line the user wrote once, not a shape to offer back.
    if (entry.count < 2) continue;
    const text = k.slice(k.indexOf(':') + 1);
    patterns.push({ text, kind: entry.kind, count: entry.count, sources: entry.sources });
  }
  // Frequency first (the most-repeated shape is the most
  // likely one), then the longest text (a longer match is a
  // more specific one). The sort is stable, so equal
  // patterns keep first-seen order.
  patterns.sort((a, b) => b.count - a.count || b.text.length - a.text.length);
  return patterns.slice(0, MAX_PATTERNS);
}

/**
 * The patterns whose text starts with the prefix and is
 * strictly longer — the ranked candidates, capped. A prefix
 * shorter than two characters would match everywhere.
 */
export function matchPatterns(
  prefix: string,
  patterns: ReadonlyArray<CodePattern>,
  limit = 5,
): CodePattern[] {
  if (prefix.length < 2) return [];
  const out: CodePattern[] = [];
  for (const pattern of patterns) {
    if (pattern.text.length > prefix.length && pattern.text.startsWith(prefix)) {
      out.push(pattern);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Complete the draft's last token to a pattern (the
 * composer-facing helper — same rules as
 * completeStructureIdentifier: case-sensitive, at least two
 * characters, first ranked match wins).
 *
 * The gate: when `verifiedIdentifiers` is a non-empty list,
 * the pattern's leading identifier must be in it — the
 * TS-LSP fact-check (steal #3) applied to patterns, so a
 * pattern never offers a name the language service cannot
 * resolve for the file being edited. When the list is empty
 * or absent the gate is open (no active file, or the engine
 * not up yet — the same degradation as the structure source
 * itself); the text is still verbatim from the user's own
 * files, so nothing is invented either way.
 */
export function completePattern(
  draft: string,
  patterns: ReadonlyArray<CodePattern>,
  verifiedIdentifiers?: ReadonlyArray<string>,
): string | null {
  const tokenMatch = draft.match(/(\S+)$/);
  if (!tokenMatch) return null;
  const token = tokenMatch[1];
  if (token.length < 2) return null;
  const head = draft.slice(0, draft.length - token.length);
  const gated = verifiedIdentifiers !== undefined && verifiedIdentifiers.length > 0;
  for (const pattern of matchPatterns(token, patterns)) {
    if (gated) {
      const leading = LEADING_IDENTIFIER_RE.exec(pattern.text)?.[0];
      if (!leading || !verifiedIdentifiers!.includes(leading)) continue;
    }
    return head + pattern.text;
  }
  return null;
}

export interface PatternIndex {
  /** Re-extract the files whose fingerprint changed, drop
   *  the files no longer present, return the merged list. */
  sync(files: ReadonlyArray<PatternSourceFile>): CodePattern[];
  /** The merged list from the last sync (empty before the
   *  first sync — the index builds on first use). */
  patterns(): CodePattern[];
  /** The composer's one-shot completion over the index. */
  complete(draft: string, verifiedIdentifiers?: ReadonlyArray<string>): string | null;
  /** The editor's ranked candidates for a line prefix. */
  match(prefix: string, limit?: number): CodePattern[];
  /** How many files are currently indexed. */
  readonly size: number;
}

/** A file's fingerprint: path + length + content hash. The
 *  hash runs only over the file's text, and only the changed
 *  files are re-extracted — typing in one file never
 *  re-indexes the rest. */
function fingerprint(file: PatternSourceFile): string {
  return `${file.path}:${file.content.length}:${contentHash(file.content)}`;
}

/** The lazy in-memory index. One instance per caller; the
 *  shared singleton is getPatternIndex() below. */
export function createPatternIndex(): PatternIndex {
  // Per-file raw texts, keyed by path. The merged list is
  // re-extracted from these on read when dirty — the open
  // files are a handful of files, the re-extract is a regex
  // pass over their text, and it runs only after a change.
  // (A pattern's per-file count cannot be recovered from
  // the merged list alone, which is why the raw texts are
  // kept instead of the per-file patterns.)
  const rawFiles = new Map<string, { fingerprint: string; content: string }>();
  let merged: CodePattern[] = [];
  let dirty = false;

  return {
    sync(files) {
      const present = new Set<string>();
      for (const file of files) {
        present.add(file.path);
        const fp = fingerprint(file);
        const existing = rawFiles.get(file.path);
        if (!existing || existing.fingerprint !== fp) {
          rawFiles.set(file.path, { fingerprint: fp, content: file.content });
          dirty = true;
        }
      }
      for (const path of [...rawFiles.keys()]) {
        if (!present.has(path)) {
          rawFiles.delete(path);
          dirty = true;
        }
      }
      if (dirty) {
        merged = extractPatterns(
          [...rawFiles.entries()].map(([path, entry]) => ({
            path,
            content: entry.content,
          })),
        );
        dirty = false;
      }
      return merged;
    },
    patterns() {
      return merged;
    },
    complete(draft, verifiedIdentifiers) {
      return completePattern(draft, merged, verifiedIdentifiers);
    },
    match(prefix, limit) {
      return matchPatterns(prefix, merged, limit);
    },
    get size() {
      return rawFiles.size;
    },
  };
}

/** The shared index the composer and the editor both read —
 *  created on first use, never persisted. */
let sharedIndex: PatternIndex | null = null;

export function getPatternIndex(): PatternIndex {
  if (!sharedIndex) sharedIndex = createPatternIndex();
  return sharedIndex;
}
