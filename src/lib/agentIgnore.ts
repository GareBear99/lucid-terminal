/**
 * Ignore files — the `.gitignore` / `.cursorignore` /
 * `.cursorindexingignore` reader.
 *
 * What Cursor actually does, from Cursor's own words
 * (staff post, forum.cursor.com, 2026-07-22 — "Semantic/
 * embeddings indexing is being turned down in favor of
 * grep-based retrieval. Both `.cursorignore` and
 * `.gitignore` are respected! This is true whether a
 * search is served by the Instant Grep index or by regular
 * ripgrep, and the Instant Grep index is built per-repo
 * and stored locally only."):
 * - `.cursorignore` blocks files from Agent, Tab, Inline
 *   Edit and @-mentions (and keeps them out of indexing);
 * - `.gitignore` is respected automatically — files git
 *   ignores are already out of AI context;
 * - `.cursorindexingignore` (Cursor 0.46) controls
 *   indexing only, without the chat/Tab block;
 * - the defaults already cover `.git/`, `.env` files,
 *   lock files, `node_modules/`, media and caches.
 *
 * Lucid's shape of that, local and deterministic: this
 * module is the gitignore-syntax matcher (a subset, stated
 * plainly — `*`, `**`, `?`, trailing `/` for directories,
 * leading `/` for anchored, `!` negation, `#` comments;
 * no character classes, no escaped-space handling, no
 * nested .gitignore files yet — the root files only).
 * The index (agentIndex.ts) loads the three root files
 * and applies them to the walk; @-reference resolution
 * (agentAtRefs.ts) applies the .cursorignore half, so an
 * ignored file cannot be attached even when named.
 *
 * Pure functions + one small class — no host, no stores,
 * no I/O — unit-testable. The index owns the file reads.
 */

/** One parsed ignore line, compiled to a regex. */
export interface IgnoreRule {
  /** The pattern as written (without `!`, without trailing `/`). */
  pattern: string;
  /** `!` — a later negation re-includes. */
  negated: boolean;
  /** Trailing `/` — directories only. */
  dirOnly: boolean;
  /** Leading `/`, or a `/` anywhere but the end — the
   *  pattern is anchored at the root instead of matching
   *  a basename at any depth. */
  anchored: boolean;
  regex: RegExp;
}

function escapeRegexChar(ch: string): string {
  return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile one gitignore pattern body (no `!`, no trailing
 * `/`) to a regex over a root-relative POSIX path.
 * `**` + `/` handling mirrors git: `**\/` matches zero or
 * more directories, `/**` matches everything under, a
 * bare `**` matches everything, `*` never crosses `/`,
 * `?` is one non-`/` char. An unanchored pattern matches
 * the basename at any depth — the regex allows a
 * directory prefix.
 */
function compilePattern(body: string, anchored: boolean): RegExp {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '*') {
      if (body[i + 1] === '*') {
        // `**`
        if (body[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
        } else if (i > 0 && body[i - 1] === '/') {
          out += '.*';
          i += 2;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escapeRegexChar(ch);
      i += 1;
    }
  }
  const prefix = anchored ? '' : '(?:.*/)?';
  return new RegExp(`^${prefix}${out}$`);
}

/** Parse ignore-file text into rules, in file order
 *  (order matters — the LAST matching rule wins). */
export function parseIgnoreText(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of text.split('\n')) {
    // A trailing '\r' (CRLF files) is not part of the
    // pattern; trailing spaces are (git strips them) —
    // the simple rule here strips both ends.
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    let body = line;
    let negated = false;
    if (body.startsWith('!')) {
      negated = true;
      body = body.slice(1);
    }
    if (!body) continue;
    let dirOnly = false;
    if (body.endsWith('/')) {
      dirOnly = true;
      body = body.slice(0, -1);
    }
    if (!body) continue;
    const anchored = body.startsWith('/') || body.slice(1).includes('/');
    if (body.startsWith('/')) body = body.slice(1);
    rules.push({ pattern: body, negated, dirOnly, anchored, regex: compilePattern(body, anchored) });
  }
  return rules;
}

/**
 * A set of ignore rules (one or more files, in load
 * order — later files' rules win over earlier ones, the
 * same as git's precedence within one directory level).
 */
export class IgnoreSet {
  private readonly rules: IgnoreRule[];

  constructor(rules: IgnoreRule[] = []) {
    this.rules = [...rules];
  }

  /** Build from several files' texts, in order. */
  static fromTexts(texts: string[]): IgnoreSet {
    const rules: IgnoreRule[] = [];
    for (const text of texts) rules.push(...parseIgnoreText(text));
    return new IgnoreSet(rules);
  }

  get size(): number {
    return this.rules.length;
  }

  get isEmpty(): boolean {
    return this.rules.length === 0;
  }

  /**
   * True when the path is ignored. The path may be
   * absolute or root-relative; matching is against the
   * root-relative form. A directory rule also ignores
   * everything under the directory (each ancestor is
   * tested), and a `!` negation re-includes. The LAST
   * matching rule decides.
   */
  isIgnored(path: string, isDirectory = false): boolean {
    const relative = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!relative) return false;
    // The path itself, then each ancestor (a file under
    // an ignored directory is ignored).
    const candidates: string[] = [relative];
    const segments = relative.split('/');
    for (let i = segments.length - 1; i >= 1; i--) {
      candidates.push(segments.slice(0, i).join('/'));
    }
    let ignored = false;
    for (const rule of this.rules) {
      for (const candidate of candidates) {
        const isAncestor = candidate !== relative;
        // A dir-only rule matches a directory itself or
        // an ancestor directory — never a bare file.
        if (rule.dirOnly && !isDirectory && !isAncestor) continue;
        if (rule.regex.test(candidate)) {
          ignored = !rule.negated;
          break;
        }
      }
    }
    return ignored;
  }
}
