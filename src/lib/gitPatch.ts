/**
 * Unified-diff parsing + single-hunk patches (Atom steal #21 —
 * the git panel's local core, 2026-11-14).
 *
 * Atom's patch model (`lib/models/patch/`, ~2,700 lines) is a
 * hunk-level staging/diff model: a file's diff is hunks, and
 * staging a hunk means applying just that hunk to the index.
 * Lucid takes the same shape at a fraction of the size: this
 * module parses `git diff` output into files → hunks, and
 * builds a minimal patch for one hunk that `git apply
 * --cached` accepts (the same mechanism `git add -p` uses).
 * Pure functions — no Electron, no shell — unit-testable on
 * their own, and the round-trip (parse → build → real `git
 * apply --cached` in a throwaway repo) is covered in
 * tests/gitPatch.test.ts.
 *
 * What it does NOT do: the GitHub-remote half (PRs, issues,
 * reviews) — skipped per the steal — and binary diffs
 * ("Binary files differ"), which parse to a file with no
 * hunks (the panel stages them file-level only).
 */

/** One diff line: the marker and the text after it. */
export interface DiffLine {
  /** ' ' context, '+' added, '-' removed. */
  type: ' ' | '+' | '-';
  text: string;
  /** The line had no trailing newline in the file (`\ No newline at end of file`). */
  noNewline?: boolean;
}

/** One hunk: an `@@` header and its lines. */
export interface DiffHunk {
  /** The raw `@@ -a,b +c,d @@` header (plus any trailing context). */
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
  /**
   * Whether this hunk is staged — set by
   * `annotateStagedHunks`, never by the parser (the parser
   * reads one diff; staged-ness needs two: vs HEAD and
   * --cached). Undefined means unknown / not annotated.
   */
  staged?: boolean;
}

/** One file's diff. */
export interface DiffFile {
  /** The new path (`b/<path>` without the `b/`). */
  path: string;
  /** The old path when renamed (else the same as path). */
  oldPath: string;
  /** True when the file is new (`--- /dev/null`). */
  isNew: boolean;
  /** True when the file was deleted (`+++ /dev/null`). */
  isDeleted: boolean;
  /** The `---` line's target, for the patch header (`a/<path>` or `/dev/null`). */
  oldHeader: string;
  /** The `+++` line's target, for the patch header (`b/<path>` or `/dev/null`). */
  newHeader: string;
  hunks: DiffHunk[];
}

/** The header regex: `@@ -12,3 +12,4 @@ optional context`. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parse `git diff` output into files → hunks. Never throws. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  try {
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (line.startsWith('diff --git ')) {
        // The `a/<old> b/<new>` pair is the fallback path —
        // a binary file has no `---`/`+++` lines, so without
        // this it would parse as a nameless file.
        const pair = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
        current = {
          path: pair ? pair[2] : '',
          oldPath: pair ? pair[1] : '',
          isNew: false,
          isDeleted: false,
          oldHeader: '',
          newHeader: '',
          hunks: [],
        };
        files.push(current);
        hunk = null;
        continue;
      }
      if (!current) continue;
      if (line.startsWith('--- ')) {
        const target = line.slice(4).trim();
        current.oldHeader = target;
        current.isNew = target === '/dev/null';
        if (!current.isNew) current.oldPath = target.replace(/^a\//, '');
        continue;
      }
      if (line.startsWith('+++ ')) {
        const target = line.slice(4).trim();
        current.newHeader = target;
        current.isDeleted = target === '/dev/null';
        if (!current.isDeleted) current.path = target.replace(/^b\//, '');
        continue;
      }
      const header = HUNK_HEADER.exec(line);
      if (header) {
        hunk = {
          header: line,
          oldStart: Number(header[1]),
          oldCount: header[2] === undefined ? 1 : Number(header[2]),
          newStart: Number(header[3]),
          newCount: header[4] === undefined ? 1 : Number(header[4]),
          lines: [],
        };
        current.hunks.push(hunk);
        continue;
      }
      if (line.startsWith('\\ No newline at end of file')) {
        // Attaches to the previous line (the one without the
        // newline) — `git apply` needs the marker after it.
        const last = hunk?.lines[hunk.lines.length - 1];
        if (last) last.noNewline = true;
        continue;
      }
      if (hunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
        hunk.lines.push({ type: line[0] as DiffLine['type'], text: line.slice(1) });
      }
      // Anything else (index lines, "Binary files differ",
      // rename headers, mode lines) is ignored.
    }
  } catch {
    // A malformed diff yields what parsed so far, never a throw.
  }
  // A file whose `+++` never arrived (a pure rename with no
  // content change, or a binary file) keeps the old path.
  for (const file of files) {
    if (!file.path) file.path = file.oldPath;
    if (!file.oldPath) file.oldPath = file.path;
  }
  return files;
}

/**
 * Build the minimal patch for one hunk — the `---`/`+++`
 * headers plus the `@@` header and its lines — exactly what
 * `git apply --cached` (and `--reverse` for unstaging) takes.
 * The hunk's counts come from the parse, so the header is
 * already consistent with the lines.
 */
export function buildHunkPatch(file: DiffFile, hunk: DiffHunk): string {
  const out: string[] = [
    `diff --git a/${file.oldPath} b/${file.path}`,
    `--- ${file.oldHeader || `a/${file.oldPath}`}`,
    `+++ ${file.newHeader || `b/${file.path}`}`,
    hunk.header,
  ];
  for (const line of hunk.lines) {
    out.push(`${line.type}${line.text}`);
    if (line.noNewline) out.push('\\ No newline at end of file');
  }
  return `${out.join('\n')}\n`;
}

/**
 * Mark each hunk in the vs-HEAD files as staged when its
 * header appears among the --cached file's hunks for the same
 * path. A hunk partially staged (some lines staged, some not)
 * has different counts in the two diffs, so its header does
 * not match — it reads as unstaged, and staging it fails
 * cleanly in `git apply` with a refreshable error rather
 * than a wrong button. Pure; never throws.
 */
export function annotateStagedHunks(headFiles: DiffFile[], stagedFiles: DiffFile[]): DiffFile[] {
  const stagedByPath = new Map<string, Set<string>>();
  for (const file of stagedFiles) {
    stagedByPath.set(file.path, new Set(file.hunks.map((h) => h.header)));
  }
  return headFiles.map((file) => {
    const stagedHeaders = stagedByPath.get(file.path);
    if (!stagedHeaders) {
      return { ...file, hunks: file.hunks.map((hunk) => ({ ...hunk, staged: false })) };
    }
    return {
      ...file,
      hunks: file.hunks.map((hunk) => ({ ...hunk, staged: stagedHeaders.has(hunk.header) })),
    };
  });
}
