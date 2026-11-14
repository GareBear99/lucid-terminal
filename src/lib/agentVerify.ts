/**
 * The verify loop — reflect on diagnostics, fix, re-check
 * (steal #5 — Aider, 2026-11-14).
 *
 * Shape stolen from Aider's reflection loop
 * (`aider/coders/base_coder.py`): after an edit, lint the
 * edited files (`lint_edited`); when there are lint
 * errors, ask "Attempt to fix lint errors?" and, when
 * the answer is yes, send the errors back as the next
 * message (`reflected_message = lint_errors`) — up to
 * `max_reflections = 3`, then stop ("Only 3 reflections
 * allowed, stopping."). The loop in Lucid (agentLoop.ts)
 * is the one asking: it calls `fix_diagnostics` after
 * any edit that leaves diagnostics behind, and the tool
 * below is what reflects.
 *
 * The reflection here is DETERMINISTIC, not a model:
 * the fixer only repairs a diagnostic when the repair
 * is forced by the diagnostic itself or by a unique
 * workspace fact — never a guess, never an invention.
 * The rules, in order of safety:
 * - 2552 "Cannot find name 'X'. Did you mean 'Y'?" —
 *   the compiler names the correction: rename the usage
 *   on the diagnostic line to Y.
 * - 2304 "Cannot find name 'X'" — the workspace index
 *   names exactly ONE file that exports X as a named
 *   export: add the import for it. Zero or two+ hits is
 *   no repair (an ambiguous import is a guess).
 * - 2307 "Cannot find module 'X'" — the import line
 *   names a symbol the index resolves to exactly one
 *   file: rewrite the specifier to the correct relative
 *   path. A bare specifier (a package) is never rewritten.
 * - 6133 "'X' is declared but its value is never read"
 *   — only for an unused IMPORT specifier: drop it from
 *   the import line (the whole import line when it was
 *   the only specifier). An unused import is provably
 *   dead — the symbol is referenced nowhere in the file.
 *   An unused LOCAL variable is deliberately NOT
 *   deleted: the fixer cannot tell the agent's leftover
 *   from a variable the user is about to wire up, and
 *   deleting code the user wrote is a review decision
 *   (Zed #6), not a silent autofix. It stays reported.
 * Everything else (2322 type mismatches, syntax errors,
 * implicit-any, argument mismatches) has no safe
 * automatic repair: the loop reports it honestly and
 * stops. A repair that does not verify clean is not
 * kept — the round re-checks, and the cap stops the run
 * instead of looping forever.
 *
 * Pure string work + the deps seam: no React, no stores,
 * no IPC — the engine is reached through `checkEdit`
 * (the TS-LSP hook), the workspace through the index.
 * The caller owns the write: this module transforms
 * strings and returns the verified content; the tool
 * (agentToolsImpl.ts) persists it.
 */

import { applyEditOperation, EditError, type EditOperation } from './agentMultiEdit';
import { getEngineClient } from './engineClient';

/** Aider's number — three reflections, then stop. */
export const MAX_REFLECTIONS = 3;

/** One diagnostic, in the loop's own shape (the same
 *  shape AgentToolResult.diagnostics carries). */
export interface VerifyDiagnostic {
  path: string;
  line: number;
  message: string;
  code?: string | number;
}

/** One repair: an old_string → new_string pair the
 *  multi-edit engine applies, plus the human reason. */
export interface VerifyRepair {
  oldText: string;
  newText: string;
  description: string;
}

/** What the fixer needs from the outside world. The
 *  real deps come from the TS-LSP engine + the loop's
 *  index + host (makeLspVerifyDeps below); tests pass a
 *  stub. */
export interface VerifyDeps {
  /** Swap the content in, read the diagnostics, restore
   *  — the TS-LSP `checkEdit` contract. */
  checkEdit: (path: string, content: string) => { clean: boolean; diagnostics: VerifyDiagnostic[] };
  /** The index's symbol table (name → definitions). */
  findSymbol: (name: string) => Array<{ path: string; line: number; kind: string }>;
  /** The index's glob (path patterns → files). */
  glob: (pattern: string) => string[];
  /** Read a file's current content (disk or open file). */
  readFile: (path: string) => Promise<string | null>;
  /** Open a file in the language engine so later checks
   *  see it (an imported file the editor never opened). */
  openDocument?: (path: string, content: string) => void;
}

export type VerifyStopReason = 'clean' | 'no-repair' | 'max-reflections';

export interface VerifyContentResult {
  /** The content after all applied repairs. */
  content: string;
  /** Reflection rounds that applied at least one repair. */
  reflections: number;
  /** Total repairs applied across all rounds. */
  fixed: number;
  /** Diagnostics left on the final content. */
  diagnostics: VerifyDiagnostic[];
  /** Why the loop stopped. */
  stopped: VerifyStopReason;
  /** Every repair applied, in order (the caller persists
   *  the content — this list is the audit trail). */
  repairs: VerifyRepair[];
}

/** The import specifier a file at `fromFile` uses to
 *  reach `toFile` — './util' for a sibling, '../x' for
 *  a parent, './nested/deep' deeper. Extensions are
 *  dropped (TS resolves them). */
export function relativeImportSpecifier(fromFile: string, toFile: string): string {
  const fromDir = fromFile.slice(0, fromFile.lastIndexOf('/')) || '/';
  const fromParts = fromDir.split('/').filter(Boolean);
  const toParts = toFile.split('/').filter(Boolean);
  // Strip the extension from the target's last segment.
  const last = toParts[toParts.length - 1] ?? '';
  toParts[toParts.length - 1] = last.replace(/\.(ts|tsx|js|jsx|mts|cts)$/i, '');
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length - 1 &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.length - common;
  const rel = [...Array<string>(up).fill('..'), ...toParts.slice(common)].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** Replace one whole-word occurrence on one line (the
 *  diagnostic's line) — the rename never touches other
 *  lines, so a same-named symbol elsewhere is safe. */
function replaceWordOnLine(
  lines: string[],
  lineNumber: number,
  word: string,
  replacement: string,
): string | null {
  const idx = lineNumber - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx];
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`);
  if (!re.test(line)) return null;
  const next = line.replace(re, replacement);
  if (next === line) return null;
  const out = [...lines];
  out[idx] = next;
  return out.join('\n');
}

/** The line's import specifiers: `import { a, b } from
 *  'x'` → ['a', 'b']. Returns null when the line is not
 *  a named import. */
function namedImportSpecifiers(line: string): string[] | null {
  const match = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/.exec(line);
  if (!match) return null;
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+as\s+/)[0]?.trim() ?? s);
}

/** Does this file line declare a named export of `name`?
 *  (`export function name`, `export const name`, `export
 *  class name`, `export interface name`, `export type
 *  name`, `export enum name`, or `export { name }`.) A
 *  default export is never a named export — the fixer
 *  never invents a named import for one. */
function isNamedExportLine(line: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^\\s*export\\s+(?:declare\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+${escaped}\\b`).test(line)) {
    return true;
  }
  const brace = /^\s*export\s*\{([^}]*)\}/.exec(line);
  if (!brace) return false;
  return brace[1].split(',').some((s) => s.trim().split(/\s+as\s+/)[0]?.trim() === name);
}

/**
 * Compute the repairs for one round of diagnostics.
 * Returns at most one repair per diagnostic (a line
 * repaired twice in one round would fight itself), and
 * never a repair it cannot verify from the diagnostic
 * text or a unique workspace fact. A diagnostic with no
 * safe repair contributes nothing — the caller reports
 * it instead of guessing.
 */
export async function computeRepairs(
  path: string,
  content: string,
  diagnostics: VerifyDiagnostic[],
  deps: VerifyDeps,
): Promise<VerifyRepair[]> {
  const lines = content.split('\n');
  const repairs: VerifyRepair[] = [];
  const repairedLines = new Set<number>();

  for (const diagnostic of diagnostics) {
    if (repairs.length >= 5) break;
    if (repairedLines.has(diagnostic.line)) continue;
    const code = diagnostic.code;
    const message = diagnostic.message;
    const line = lines[diagnostic.line - 1] ?? '';

    // 2552 — the compiler names the correction.
    if (code === 2552) {
      const nameMatch = /Cannot find name '([^']+)'/.exec(message);
      const suggestionMatch = /Did you mean '([^']+)'/.exec(message);
      if (nameMatch && suggestionMatch) {
        const fixed = replaceWordOnLine(lines, diagnostic.line, nameMatch[1], suggestionMatch[1]);
        if (fixed !== null) {
          repairs.push({
            oldText: line,
            newText: fixed.split('\n')[diagnostic.line - 1] ?? line,
            description: `renamed '${nameMatch[1]}' to '${suggestionMatch[1]}' (TS 2552)`,
          });
          repairedLines.add(diagnostic.line);
        }
      }
      continue;
    }

    // 2304 — exactly one named export in the workspace.
    if (code === 2304) {
      const nameMatch = /Cannot find name '([^']+)'/.exec(message);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      // Already imported on this line? The diagnostic is
      // stale — nothing to do.
      if (namedImportSpecifiers(line)?.includes(name)) continue;
      const hits = deps.findSymbol(name).filter((h) => h.path !== path);
      if (hits.length !== 1) continue;
      const hit = hits[0];
      const hitContent = await deps.readFile(hit.path);
      if (hitContent === null) continue;
      const hitLine = hitContent.split('\n')[hit.line - 1] ?? '';
      if (!isNamedExportLine(hitLine, name)) continue;
      // The imported file must be visible to the engine
      // for the next check to pass — open it.
      if (deps.openDocument) deps.openDocument(hit.path, hitContent);
      const specifier = relativeImportSpecifier(path, hit.path);
      const importLine = `import { ${name} } from '${specifier}';`;
      // Anchor after the last import, else at the top.
      let anchorIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\s/.test(lines[i])) anchorIdx = i;
        else if (lines[i].trim() !== '' && !lines[i].trim().startsWith('//')) break;
      }
      if (anchorIdx >= 0) {
        repairs.push({
          oldText: lines[anchorIdx],
          newText: `${lines[anchorIdx]}\n${importLine}`,
          description: `added import of '${name}' from '${specifier}' (TS 2304)`,
        });
        repairedLines.add(anchorIdx + 1);
      } else {
        repairs.push({
          oldText: lines[0] ?? '',
          newText: `${importLine}\n${lines[0] ?? ''}`,
          description: `added import of '${name}' from '${specifier}' (TS 2304)`,
        });
        repairedLines.add(1);
      }
      continue;
    }

    // 2307 — the module specifier is wrong; the symbol
    // the import line names resolves to exactly one file.
    if (code === 2307) {
      const specifiers = namedImportSpecifiers(line);
      if (!specifiers || specifiers.length === 0) continue;
      const symbol = specifiers[0];
      const hits = deps.findSymbol(symbol).filter((h) => h.path !== path);
      if (hits.length !== 1) continue;
      const hit = hits[0];
      const specifier = relativeImportSpecifier(path, hit.path);
      const fixed = line.replace(/from\s*['"][^'"]+['"]/, `from '${specifier}'`);
      if (fixed === line) continue;
      if (deps.openDocument) {
        const hitContent = await deps.readFile(hit.path);
        if (hitContent !== null) deps.openDocument(hit.path, hitContent);
      }
      repairs.push({
        oldText: line,
        newText: fixed,
        description: `fixed import specifier to '${specifier}' (TS 2307)`,
      });
      repairedLines.add(diagnostic.line);
      continue;
    }

    // 6133 — only an unused IMPORT specifier is dropped.
    // A local variable is never deleted here (see the
    // header): the fixer cannot tell the agent's leftover
    // from a variable the user is about to wire up.
    if (code === 6133) {
      const nameMatch = /'([^']+)' is declared but/.exec(message);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      // An unused import specifier, dropped (or the whole
      // import line when it was the only specifier).
      const specifiers = namedImportSpecifiers(line);
      if (specifiers && specifiers.includes(name)) {
        if (specifiers.length === 1) {
          repairs.push({
            oldText: line,
            newText: '',
            description: `removed unused import '${name}' (TS 6133)`,
          });
        } else {
          const remaining = specifiers.filter((s) => s !== name);
          const fixed = line.replace(/\{[^}]*\}/, `{ ${remaining.join(', ')} }`);
          if (fixed !== line) {
            repairs.push({
              oldText: line,
              newText: fixed,
              description: `removed unused import '${name}' (TS 6133)`,
            });
          }
        }
        repairedLines.add(diagnostic.line);
        continue;
      }
    }
  }
  return repairs;
}

/**
 * Apply repairs to content, one at a time, in order —
 * a repair whose old text no longer matches (content
 * drifted under an earlier repair) is skipped, never
 * forced. Returns the new content + how many applied.
 * A repair that deletes a line leaves an empty line
 * behind (the multi-edit engine replaces the line with
 * '' — the blank line is harmless and keeps line numbers
 * stable for the next round's diagnostics).
 */
export function applyRepairs(
  content: string,
  repairs: VerifyRepair[],
): { content: string; applied: VerifyRepair[] } {
  let next = content;
  const applied: VerifyRepair[] = [];
  for (const repair of repairs) {
    const operation: EditOperation = { old_string: repair.oldText, new_string: repair.newText };
    try {
      const result = applyEditOperation(next, operation);
      next = result.content;
      applied.push(repair);
    } catch (error) {
      if (error instanceof EditError) continue;
      throw error;
    }
  }
  return { content: next, applied };
}

/**
 * The reflection loop, in memory: check → repair →
 * re-check, up to maxReflections rounds. Stops clean,
 * stops when no repair applies, stops at the cap. The
 * caller persists `content` when fixed > 0.
 */
export async function verifyContent(
  path: string,
  content: string,
  deps: VerifyDeps,
  maxReflections: number = MAX_REFLECTIONS,
): Promise<VerifyContentResult> {
  let current = content;
  let reflections = 0;
  let fixed = 0;
  const repairs: VerifyRepair[] = [];
  let check = deps.checkEdit(path, current);
  while (!check.clean && reflections < maxReflections) {
    const roundRepairs = await computeRepairs(path, current, check.diagnostics, deps);
    if (roundRepairs.length === 0) {
      return { content: current, reflections, fixed, diagnostics: check.diagnostics, stopped: 'no-repair', repairs };
    }
    const applied = applyRepairs(current, roundRepairs);
    if (applied.applied.length === 0) {
      return { content: current, reflections, fixed, diagnostics: check.diagnostics, stopped: 'no-repair', repairs };
    }
    current = applied.content;
    repairs.push(...applied.applied);
    fixed += applied.applied.length;
    reflections += 1;
    check = deps.checkEdit(path, current);
  }
  return {
    content: current,
    reflections,
    fixed,
    diagnostics: check.diagnostics,
    stopped: check.clean ? 'clean' : 'max-reflections',
    repairs,
  };
}

/**
 * The real deps: the engine client (Kite mapping #2 — the
 * client split; the client never pulls the compiler in
 * statically) + the loop's index + host. Returns null when
 * the engine is unavailable — the caller reports
 * "diagnostics unavailable" instead of faking a clean check.
 */
export async function makeLspVerifyDeps(
  path: string,
  content: string,
  index: { findSymbol: VerifyDeps['findSymbol']; glob: VerifyDeps['glob'] },
  host: { readFile: (path: string) => Promise<string> },
): Promise<VerifyDeps | null> {
  try {
    const client = getEngineClient();
    const ready = await client.ensureReady();
    if (!ready) return null;
    client.openDocument(path, content);
    return {
      checkEdit: (checkPath: string, checkContent: string) => {
        const result = client.checkEdit(checkPath, checkContent);
        return {
          clean: result.clean,
          diagnostics: result.diagnostics.map((d) => ({
            path: checkPath,
            line: d.range.start.line + 1,
            message: d.message,
            code: d.code,
          })),
        };
      },
      findSymbol: (name: string) => index.findSymbol(name),
      glob: (pattern: string) => index.glob(pattern),
      readFile: async (readPath: string) => {
        try {
          return await host.readFile(readPath);
        } catch {
          return null;
        }
      },
      openDocument: (docPath: string, docContent: string) => {
        client.openDocument(docPath, docContent);
      },
    };
  } catch {
    return null;
  }
}
