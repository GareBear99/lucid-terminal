/**
 * Snippets + the snippet bridge (Atom steal #10 — 2026-11-14).
 *
 * Atom's snippets package: a snippet is a named body with a
 * prefix and an optional scope (`.source.ts`, `.source.js`),
 * stored in `snippets.cson`; typing the prefix and pressing
 * Tab expands it, and `autocomplete-snippets` also offers
 * snippets in the completion list (inclusionPriority 1,
 * suggestionPriority 2). Lucid's shape: the same data, JSON
 * instead of CSON (the settings store holds user snippets
 * as `customSnippets`, edited in Settings > Editor), and the
 * bridge is the snippet completion provider — choosing a
 * snippet in the list inserts its body with Monaco's snippet
 * syntax expanded (`${1:placeholder}` tabstops work, because
 * the item carries InsertAsSnippet). Tab-expansion of a bare
 * prefix is the same provider's job through the completion
 * list; there is no separate Tab handler (Monaco's Tab is
 * accept-suggestion, so the list IS the expansion path).
 *
 * Bodies use Atom/Monaco snippet syntax: `${1:default}` and
 * `$1` tabstops, `${2:...}` for the next stop. The body is
 * stored verbatim; `snippetPreview` strips the tabstop
 * syntax to plain text for display, and `validateSnippetBody`
 * catches unbalanced braces before a snippet is saved.
 *
 * Built-ins are a small TypeScript/JavaScript set (the
 * shapes Lucid's own code repeats); user snippets win over a
 * built-in with the same prefix and scope. Nothing here
 * touches the terminal, the agent loop, or the driving
 * intelligence. The Kite Atom plugin is proprietary — these
 * bodies are Lucid's own, written from the language, not
 * lifted from any plugin.
 */

import {
  type CompletionItem,
  type CompletionProvider,
  type CompletionRequest,
  INSERT_TEXT_RULE_SNIPPET,
  EDITOR_LANGUAGE_IDS,
} from './completionProviders';

/** One snippet: a prefix that triggers it, a body in
 *  Atom/Monaco snippet syntax, an optional description
 *  (shown in the completion list), and an optional scope
 *  (language ids — unset means the editor's languages). */
export interface Snippet {
  prefix: string;
  body: string;
  description?: string;
  scope?: string[];
}

/** The editor languages a snippet serves when it has no
 *  explicit scope. */
export const SNIPPET_DEFAULT_SCOPE = EDITOR_LANGUAGE_IDS;

/** The built-in library — the shapes Lucid's own code
 *  repeats. Bodies are Lucid's own, written from the
 *  language. */
export const BUILTIN_SNIPPETS: Snippet[] = [
  {
    prefix: 'cl',
    body: "console.log(${1:value});",
    description: 'console.log',
  },
  {
    prefix: 'fn',
    body: 'function ${1:name}(${2:args}) {\n\t${3:// body}\n}',
    description: 'function declaration',
  },
  {
    prefix: 'af',
    body: 'const ${1:name} = (${2:args}) => {\n\t${3:// body}\n};',
    description: 'arrow function',
  },
  {
    prefix: 'if',
    body: 'if (${1:condition}) {\n\t${2:// body}\n}',
    description: 'if statement',
  },
  {
    prefix: 'ife',
    body: 'if (${1:condition}) {\n\t${2:// body}\n} else {\n\t${3:// body}\n}',
    description: 'if / else statement',
  },
  {
    prefix: 'for',
    body: 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t${3:// body}\n}',
    description: 'for loop',
  },
  {
    prefix: 'forof',
    body: 'for (const ${1:item} of ${2:items}) {\n\t${3:// body}\n}',
    description: 'for…of loop',
  },
  {
    prefix: 'try',
    body: 'try {\n\t${1:// body}\n} catch (${2:error}) {\n\t${3:// handle}\n}',
    description: 'try / catch',
  },
  {
    prefix: 'imp',
    body: "import { ${1:name} } from '${2:module}';",
    description: 'named import',
  },
  {
    prefix: 'exp',
    body: 'export const ${1:name} = ${2:value};',
    description: 'export const',
  },
  {
    prefix: 'us',
    body: 'const [${1:value}, set${2:Value}] = useState(${3:initial});',
    description: 'useState (React)',
    scope: ['typescript', 'tsx', 'javascript', 'javascriptreact'],
  },
  {
    prefix: 'ue',
    body: 'useEffect(() => {\n\t${1:// effect}\n}, [${2:deps}]);',
    description: 'useEffect (React)',
    scope: ['typescript', 'tsx', 'javascript', 'javascriptreact'],
  },
  {
    prefix: 'test',
    body: "test('${1:does something}', () => {\n\t${2:// assert}\n});",
    description: 'vitest test',
  },
  {
    prefix: 'desc',
    body: "describe('${1:thing}', () => {\n\t${2:// tests}\n});",
    description: 'vitest describe',
  },
];

/**
 * Merge built-ins with user snippets: a user snippet with
 * the same prefix and scope replaces the built-in. The
 * result is in built-in order, user additions appended.
 */
export function mergeSnippets(
  builtin: Snippet[],
  user: Snippet[],
): Snippet[] {
  const out = [...builtin];
  for (const snippet of user) {
    const scopeKey = (s: Snippet) =>
      `${s.prefix}\n${(s.scope ?? SNIPPET_DEFAULT_SCOPE).join(',')}`;
    const index = out.findIndex((s) => scopeKey(s) === scopeKey(snippet));
    if (index >= 0) out[index] = snippet;
    else out.push(snippet);
  }
  return out;
}

/** Does this snippet serve this language? */
export function snippetServesLanguage(
  snippet: Snippet,
  languageId: string,
): boolean {
  const scope = snippet.scope ?? SNIPPET_DEFAULT_SCOPE;
  return scope.includes('*') || scope.includes(languageId);
}

/** Does the typed word trigger this snippet's prefix
 *  (case-insensitive prefix match, Atom's rule)? */
export function snippetMatchesWord(snippet: Snippet, word: string): boolean {
  if (!word) return false;
  return snippet.prefix.toLowerCase().startsWith(word.toLowerCase());
}

/** Strip tabstop syntax to plain text for display:
 *  `${1:default}` → `default`, `${1}` / `$1` → ``. */
export function snippetPreview(body: string): string {
  return body
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

/**
 * Validate a snippet body: balanced `${...}` braces and no
 * stray `$` followed by a non-digit, non-`{` character.
 * Returns the errors (empty = valid). Monaco tolerates a
 * bad body silently, so the settings UI calls this before
 * saving.
 */
export function validateSnippetBody(body: string): string[] {
  const errors: string[] = [];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '$' && body[i + 1] === '{') {
      depth += 1;
      i += 1;
    } else if (ch === '}') {
      // A '}' closes a tabstop only when one is open; at
      // depth 0 it is a plain code brace (the '}' closing an
      // if-block, a function body, …) — not an error.
      if (depth > 0) depth -= 1;
    } else if (ch === '$' && body[i + 1] !== undefined && !/[\d{$]/.test(body[i + 1])) {
      errors.push(`Stray '$' at character ${i} (use $$ for a literal dollar)`);
    }
  }
  if (depth > 0) errors.push(`Unclosed '\${' (${depth} open)`);
  return errors;
}

/** Build the completion items for the snippets matching the
 *  typed word in this language. The item's insertText is the
 *  body with InsertAsSnippet, so Monaco expands the
 *  tabstops on accept. */
export function snippetSuggestions(
  snippets: Snippet[],
  request: CompletionRequest,
  snippetKind: number,
): CompletionItem[] {
  const out: CompletionItem[] = [];
  for (const snippet of snippets) {
    if (!snippetServesLanguage(snippet, request.languageId)) continue;
    if (!snippetMatchesWord(snippet, request.word)) continue;
    out.push({
      label: snippet.prefix,
      kind: snippetKind,
      detail: snippet.description ?? snippetPreview(snippet.body),
      documentation: snippet.description
        ? { value: snippetPreview(snippet.body) }
        : undefined,
      sortText: `snippet-${snippet.prefix}`,
      insertText: snippet.body,
      insertTextRules: INSERT_TEXT_RULE_SNIPPET,
      range: request.wordRange,
      source: 'snippet',
    });
  }
  return out;
}

/**
 * The snippet completion provider (Atom's
 * autocomplete-snippets, suggestionPriority 2 in Atom — 3
 * here, so a snippet the user named beats a repeated
 * pattern but never a verified LSP symbol). `getSnippets`
 * is read at request time (the settings store's
 * customSnippets), so a saved snippet is live without a
 * reload. `snippetKind` is the Monaco Snippet kind number
 * (the live monaco enum, or the contract table's fallback).
 */
export function createSnippetCompletionProvider(
  getSnippets: () => Snippet[],
  snippetKind: number,
): CompletionProvider {
  return {
    id: 'snippet',
    suggestionPriority: 3,
    selector: ['*'],
    getSuggestions: (request) => {
      if (request.word.length < 1) return [];
      const snippets = mergeSnippets(BUILTIN_SNIPPETS, getSnippets() ?? []);
      return snippetSuggestions(snippets, request, snippetKind);
    },
  };
}
