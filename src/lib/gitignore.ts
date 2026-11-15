/**
 * Minimal .gitignore matcher — pure module, no Electron, no fs.
 *
 * Step 5 of the files-section fix (2026-11-15): the directory walk
 * (`electron/ipc/readDirTree.ts`) reads each directory's .gitignore
 * and skips entries its patterns match, so cache/build/output dirs
 * a project already ignores stop being walked. The matcher lives
 * here so the main-process walk, the worker-thread walk, and tests
 * all share the one implementation.
 *
 * Supported subset of gitignore(5) — enough for the patterns real
 * .gitignore files use:
 * - blank lines and `#` comments are ignored (`\#` / `\!` escape
 *   a leading hash / bang);
 * - trailing spaces are ignored unless backslash-escaped;
 * - `!` negates: a negated match re-includes (last match wins);
 * - a trailing `/` matches directories only;
 * - a pattern with NO `/` (other than a trailing one) matches the
 *   basename at any depth below the .gitignore's directory;
 * - a pattern WITH a `/` (or a leading `/`, which is stripped)
 *   matches relative to the .gitignore's directory;
 * - `*` / `**` / `?` / `[...]` go through minimatch with
 *   `{ dot: true }` (already a dependency — used by agentIndex and
 *   fileTools), so dotfiles match `*` like git does.
 *
 * NOT supported (deliberately — git's rarer corners): `**` mid
 * pattern subtleties beyond what minimatch does, character-class
 * ranges beyond minimatch, and per-pattern `**` anchoring
 * differences that only matter for paths git itself would treat
 * identically in a walk that prunes ignored directories at the
 * level it lists them.
 *
 * Stacking: each directory level's rules apply to its subtree and
 * deeper rules win — a .gitignore in a subdir can re-include what
 * a parent ignored, and vice versa. A directory matched as ignored
 * is pruned whole (git cannot re-include a file whose parent
 * directory is excluded, so pruning at the listing level is
 * git-correct).
 */
import { minimatch } from 'minimatch';
import path from 'path';

export interface GitignorePattern {
  /** The glob as minimatch sees it: no `!`, no trailing `/`, no leading `/`. */
  glob: string;
  /** `!`-negated: a match re-includes instead of ignoring. */
  negated: boolean;
  /** Trailing `/`: directories only. */
  dirOnly: boolean;
  /**
   * Contains a `/` (or had a leading one): match relative to the
   * .gitignore's directory. Otherwise match the basename at any
   * depth below it.
   */
  anchored: boolean;
}

/**
 * Parse a .gitignore file's contents into patterns, in file order
 * (later patterns win over earlier ones when both match).
 */
export function parseGitignore(content: string): GitignorePattern[] {
  const patterns: GitignorePattern[] = [];
  for (const rawLine of content.split('\n')) {
    // CRLF files: the \r is not part of the pattern.
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    // Trailing spaces are ignored unless backslash-escaped.
    line = line.replace(/(?<!\\) +$/, '');
    if (line === '') continue; // blank line
    if (line.startsWith('#')) continue; // comment
    // An escaped leading # / ! is a literal character, not a
    // comment / negation — remember it so the checks below do not
    // reinterpret the unescaped character.
    let literalLead = false;
    if (line.startsWith('\\#') || line.startsWith('\\!')) {
      line = line.slice(1);
      literalLead = true;
    }
    let negated = false;
    if (!literalLead && line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    let anchored = false;
    if (line.startsWith('/')) {
      anchored = true;
      line = line.slice(1);
    }
    if (line === '') continue; // pattern was only "!", "/", or "!/"
    if (line.includes('/')) anchored = true;
    patterns.push({ glob: line, negated, dirOnly, anchored });
  }
  return patterns;
}

/**
 * Test one entry (given as a path relative to the .gitignore's
 * directory, `/`-separated) against a pattern list. Returns true
 * when the last matching pattern ignores it, false when the last
 * matching pattern negates it, undefined when nothing matches.
 */
export function matchGitignorePatterns(
  patterns: readonly GitignorePattern[],
  relPath: string,
  isDirectory: boolean,
): boolean | undefined {
  const basename = relPath.split('/').pop() ?? relPath;
  let ignored: boolean | undefined;
  for (const pattern of patterns) {
    if (pattern.dirOnly && !isDirectory) continue;
    const hit = pattern.anchored
      ? minimatch(relPath, pattern.glob, { dot: true })
      : minimatch(basename, pattern.glob, { dot: true });
    if (hit) ignored = !pattern.negated;
  }
  return ignored;
}

export interface GitignoreRuleset {
  /** Absolute path of the directory the .gitignore lives in. */
  base: string;
  patterns: GitignorePattern[];
}

/**
 * Test an absolute path against a stack of rulesets, outermost
 * (walk root) first, deepest last — the last matching pattern
 * anywhere in the stack wins. The directory a .gitignore lives in
 * is never ignored by its own rules (rel === ''), and a ruleset
 * only applies below its own base.
 */
export function isIgnoredByRulesets(
  rulesets: readonly GitignoreRuleset[],
  absPath: string,
  isDirectory: boolean,
): boolean {
  let ignored = false;
  for (const ruleset of rulesets) {
    const rel = path.relative(ruleset.base, absPath);
    if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`)) {
      continue;
    }
    const relPosix = rel.split(path.sep).join('/');
    const decision = matchGitignorePatterns(
      ruleset.patterns,
      relPosix,
      isDirectory,
    );
    if (decision !== undefined) ignored = decision;
  }
  return ignored;
}
