/**
 * The cross-file multi-edit plan — Composer's one-pass
 * edit, local and atomic.
 *
 * What Cursor actually does (cursor.com/help/ai-features/
 * agent — "Agent is Cursor's AI assistant. It searches
 * your codebase, edits multiple files, runs terminal
 * commands, and fixes errors on its own. Give it a task
 * in plain language and it figures out which files to
 * read, what changes to make, and how to verify the
 * result."; "Agent's edits are applied as it works.
 * Review them in the diff view and reject anything you
 * don't want."):
 * one task → changes across several files → one diff
 * view → accept / reject → a checkpoint rolls back.
 *
 * Lucid's shape of that: a plan is a list of per-file
 * entries — edits to an existing file (the atomic
 * multi_edit primitive, agentMultiEdit.ts) or a create
 * (content instead of edits). The pure core here
 * validates and applies the WHOLE plan in memory first:
 * every file's edits must match, or NOTHING applies —
 * the caller keeps the original contents, so a failure
 * in the last file never leaves the first files half-
 * edited. The tool (agentToolsImpl.ts) owns the read,
 * the checkEdit pre-flight per file, the write, and the
 * index update; the review (agentReview.ts) owns the
 * single Keep over the whole plan, with one checkpoint
 * per touched file, reverted together.
 *
 * Pure functions — no host, no stores, no I/O — the
 * tool is the only thing that touches disk.
 */

import {
  executeMultiEdit,
  type EditOperation,
} from './agentMultiEdit';

/** One file in the plan: edits to an existing file, OR
 *  a create (content, no edits) — never both. */
export interface MultiFileEditEntry {
  filepath: string;
  edits?: EditOperation[];
  content?: string;
}

export interface MultiFilePlan {
  files: MultiFileEditEntry[];
}

export interface AppliedMultiFileEdit {
  /** The entry, as applied. */
  entry: MultiFileEditEntry;
  /** 'created' when the entry carried content. */
  kind: 'created' | 'edited';
  /** Replacements applied (multi_edit) or 1 (create). */
  replacements: number;
}

/** Why a plan is invalid — the loop returns this as
 *  context to the brain, never as a thrown error. */
export type MultiFilePlanError =
  | 'empty-plan'
  | 'malformed'
  | 'duplicate-file'
  | 'both-edits-and-content'
  | 'neither-edits-nor-content';

/** Parse + validate the tool argument. A plan that
 *  fails here never reaches a file. */
export function parseMultiFilePlan(
  raw: unknown,
): { plan: MultiFilePlan } | { error: string } {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { files?: unknown }).files)) {
    return { error: 'multi_file_edit needs a files array.' };
  }
  const rawFiles = (raw as { files: unknown[] }).files;
  if (rawFiles.length === 0) {
    return { error: 'multi_file_edit needs a non-empty files array.' };
  }
  const files: MultiFileEditEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of rawFiles) {
    if (typeof rawEntry !== 'object' || rawEntry === null) {
      return { error: 'Each file entry needs a filepath string.' };
    }
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.filepath !== 'string' || !entry.filepath.trim()) {
      return { error: 'Each file entry needs a filepath string.' };
    }
    const filepath = entry.filepath;
    if (seen.has(filepath)) {
      return { error: `The plan touches ${filepath} twice — one entry per file.` };
    }
    seen.add(filepath);
    const hasEdits = Array.isArray(entry.edits);
    const hasContent = typeof entry.content === 'string';
    if (hasEdits && hasContent) {
      return {
        error: `The ${filepath} entry has both edits and content — one or the other.`,
      };
    }
    if (!hasEdits && !hasContent) {
      return { error: `The ${filepath} entry needs edits or content.` };
    }
    if (hasEdits) {
      const edits = entry.edits as unknown[];
      if (edits.length === 0) {
        return { error: `The ${filepath} entry needs a non-empty edits array.` };
      }
      for (const rawEdit of edits) {
        if (
          typeof rawEdit !== 'object' ||
          rawEdit === null ||
          typeof (rawEdit as Record<string, unknown>).old_string !== 'string' ||
          typeof (rawEdit as Record<string, unknown>).new_string !== 'string'
        ) {
          return { error: `Each edit in ${filepath} needs old_string and new_string strings.` };
        }
      }
      files.push({
        filepath,
        edits: (edits as Array<Record<string, unknown>>).map((e) => ({
          old_string: e.old_string as string,
          new_string: e.new_string as string,
          replace_all: e.replace_all === true,
        })),
      });
    } else {
      files.push({ filepath, content: entry.content as string });
    }
  }
  return { plan: { files } };
}

/**
 * Apply a whole plan to a map of current contents
 * (null = the file does not exist). ATOMIC: a failure
 * anywhere throws before anything is returned — the
 * caller keeps the original map, so no file is
 * half-edited. Returns a NEW map; the input is never
 * mutated.
 */
export function executeMultiFileEdit(
  contents: Map<string, string | null>,
  plan: MultiFilePlan,
): { contents: Map<string, string>; applied: AppliedMultiFileEdit[] } {
  const next = new Map<string, string>();
  for (const [path, content] of contents) {
    if (content !== null) next.set(path, content);
  }
  const applied: AppliedMultiFileEdit[] = [];
  for (const entry of plan.files) {
    const current = contents.get(entry.filepath) ?? null;
    if (entry.content !== undefined) {
      // A create: the file must not exist already.
      if (current !== null) {
        throw new Error(`multi_file_edit: ${entry.filepath} already exists.`);
      }
      next.set(entry.filepath, entry.content);
      applied.push({ entry, kind: 'created', replacements: 1 });
      continue;
    }
    if (current === null) {
      throw new Error(
        `multi_file_edit: ${entry.filepath} does not exist — create it with content instead.`,
      );
    }
    // executeMultiEdit throws EditError on the first bad
    // op — nothing is returned, so the whole plan fails.
    const result = executeMultiEdit(current, entry.edits ?? []);
    next.set(entry.filepath, result.content);
    applied.push({
      entry,
      kind: 'edited',
      replacements: result.applied.reduce((sum, a) => sum + a.replacements, 0),
    });
  }
  return { contents: next, applied };
}
