/**
 * Settings smalls (Atom steal #20 — 2026-11-14): the
 * whitespace package, wrap-guide rulers, and the bracket
 * config — all settings + hooks in Lucid terms, not engines.
 *
 * Whitespace (Atom's `whitespace` package): on save, strip
 * trailing whitespace and ensure exactly one trailing newline.
 * Two edges carried over verbatim:
 * - Markdown: a line ending in 2+ spaces is a hard line break —
 *   its trailing spaces are preserved, never stripped.
 * - CRLF files: a line ends in `\r`, so the trailing-space
 *   match never fires — CRLF content passes through untouched
 *   (the EOL tile owns line endings, not the save hook).
 * Both transforms are opt-in (off by default): trimming on
 * save rewrites file contents, and a surprise rewrite is
 * worse than a trailing space.
 *
 * Wrap-guide (Atom's `wrap-guide` package): vertical lines at
 * configured columns. In Monaco that is one setting, `rulers`
 * — the columns are parsed here (comma/space separated,
 * sorted, unique, 1..1000, like Atom's sorted/unique columns).
 *
 * Bracket-matcher (Atom's `bracket-matcher` package): Monaco
 * does the matching natively (pair colorization is already
 * on); the steal is the config — autoclose, auto-surround,
 * and match-bracket highlighting as Monaco options, read live
 * from Settings. The mapping is pure so the editor options
 * stay testable without Monaco.
 *
 * Deferred (documented, not built): `TreeIndenter` — the
 * 155-line tree-sitter auto-indent port is the easy half;
 * Monaco exposes no pluggable indenter hook to wire it into,
 * and its own autoIndent covers the common case. Same for
 * the editor-core leftovers (copy-line-when-selection-empty,
 * multi-cursor paste, `foldAllAtIndentLevel`, NullGrammar):
 * each needs its own surface; none fits this slice cleanly.
 */

/** A Markdown file — its hard-break trailing spaces survive the trim. */
export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/**
 * Strip trailing spaces/tabs from every line. In Markdown, a
 * line ending in 2+ spaces keeps them (hard line break).
 */
export function trimTrailingWhitespace(content: string, path: string): string {
  const markdown = isMarkdownPath(path);
  return content
    .split('\n')
    .map((line) => {
      if (markdown && / {2,}$/.test(line)) return line;
      return line.replace(/[ \t]+$/, '');
    })
    .join('\n');
}

/**
 * Ensure exactly one trailing newline. An empty file stays
 * empty (there is nothing to terminate); otherwise strip all
 * trailing newlines and add one back.
 */
export function ensureSingleTrailingNewline(content: string): string {
  if (content.length === 0) return content;
  return `${content.replace(/\n+$/, '')}\n`;
}

/** The save-hook options — which transforms are on. */
export interface WhitespaceOnSaveOptions {
  trimTrailingWhitespace: boolean;
  ensureTrailingNewline: boolean;
}

/** Apply the enabled on-save transforms, in Atom's order (trim, then newline). */
export function applyWhitespaceOnSave(
  content: string,
  path: string,
  opts: WhitespaceOnSaveOptions,
): string {
  let next = content;
  if (opts.trimTrailingWhitespace) next = trimTrailingWhitespace(next, path);
  if (opts.ensureTrailingNewline) next = ensureSingleTrailingNewline(next);
  return next;
}

/**
 * Parse a wrap-guide column list ("80, 120"): integers 1..1000,
 * sorted, unique. Unparseable parts are dropped; empty means no
 * guides.
 */
export function parseRulers(value: string): number[] {
  const columns = value
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 1000);
  return [...new Set(columns)].sort((a, b) => a - b);
}

/** The four Monaco editor options the bracket/ruler settings drive. */
export interface EditorBracketOptions {
  autoClosingBrackets: 'always' | 'never';
  autoSurround: 'languageDefined' | 'never';
  matchBrackets: 'always' | 'never';
  rulers: number[];
}

/**
 * Map the settings onto Monaco's editor options. Missing keys
 * in older persisted settings count as the defaults (autoclose
 * on, surround on, match on, no rulers) — the same merge rule
 * loadSettings uses.
 */
export function editorOptionsForSettings(settings: {
  editorAutoClosingBrackets?: boolean;
  editorAutoSurround?: boolean;
  editorMatchBrackets?: boolean;
  editorRulers?: number[];
}): EditorBracketOptions {
  return {
    autoClosingBrackets: settings.editorAutoClosingBrackets !== false ? 'always' : 'never',
    autoSurround: settings.editorAutoSurround !== false ? 'languageDefined' : 'never',
    matchBrackets: settings.editorMatchBrackets !== false ? 'always' : 'never',
    rulers: Array.isArray(settings.editorRulers) ? settings.editorRulers : [],
  };
}
