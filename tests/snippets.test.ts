/**
 * Snippet tests.
 *
 * A snippet is a prefix + a body in Atom/Monaco snippet
 * syntax + an optional description and scope. User snippets
 * win over a built-in with the same prefix and scope; the
 * bridge is the snippet completion provider, which offers
 * matching snippets for the typed word with InsertAsSnippet
 * so Monaco expands the tabstops on accept. Bodies are
 * validated before saving (balanced `${...}` braces, no
 * stray `$`).
 *
 * Run with: npx vitest run tests/snippets.test.ts
 */
import { describe, test, expect } from 'vitest';
import {
  BUILTIN_SNIPPETS,
  mergeSnippets,
  snippetServesLanguage,
  snippetMatchesWord,
  snippetPreview,
  validateSnippetBody,
  snippetSuggestions,
  createSnippetCompletionProvider,
  type Snippet,
} from '../src/lib/snippets';
import type { CompletionRequest } from '../src/lib/completionProviders';

function request(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    word: 'cl',
    linePrefix: 'cl',
    lineNumber: 1,
    column: 3,
    languageId: 'typescript',
    modelText: '',
    identifiers: [],
    wordRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 },
    prefixRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 },
    ...overrides,
  };
}

describe('BUILTIN_SNIPPETS', () => {
  test('every built-in body validates', () => {
    for (const snippet of BUILTIN_SNIPPETS) {
      expect(validateSnippetBody(snippet.body)).toEqual([]);
    }
  });

  test('prefixes are unique per scope', () => {
    const keys = BUILTIN_SNIPPETS.map(
      (s) => `${s.prefix}\n${(s.scope ?? ['*']).join(',')}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('mergeSnippets', () => {
  test('a user snippet replaces the built-in with the same prefix', () => {
    const user: Snippet = {
      prefix: 'cl',
      body: "console.log('DEBUG', ${1:value});",
      description: 'my log',
    };
    const merged = mergeSnippets(BUILTIN_SNIPPETS, [user]);
    expect(merged.filter((s) => s.prefix === 'cl')).toHaveLength(1);
    expect(merged.find((s) => s.prefix === 'cl')?.body).toBe(
      "console.log('DEBUG', ${1:value});",
    );
    expect(merged.length).toBe(BUILTIN_SNIPPETS.length);
  });

  test('a new user snippet is appended', () => {
    const merged = mergeSnippets(BUILTIN_SNIPPETS, [
      { prefix: 'zz', body: 'zebra' },
    ]);
    expect(merged.length).toBe(BUILTIN_SNIPPETS.length + 1);
    expect(merged[merged.length - 1].prefix).toBe('zz');
  });
});

describe('snippetServesLanguage / snippetMatchesWord', () => {
  test('scope restricts the languages', () => {
    const scoped: Snippet = {
      prefix: 'us',
      body: 'useState',
      scope: ['tsx'],
    };
    expect(snippetServesLanguage(scoped, 'tsx')).toBe(true);
    expect(snippetServesLanguage(scoped, 'typescript')).toBe(false);
    expect(snippetServesLanguage({ prefix: 'cl', body: 'x' }, 'python')).toBe(false);
  });

  test('prefix match is a case-insensitive startsWith', () => {
    const snippet: Snippet = { prefix: 'console', body: 'x' };
    expect(snippetMatchesWord(snippet, 'con')).toBe(true);
    expect(snippetMatchesWord(snippet, 'CON')).toBe(true);
    expect(snippetMatchesWord(snippet, 'sole')).toBe(false);
    expect(snippetMatchesWord(snippet, '')).toBe(false);
  });
});

describe('snippetPreview', () => {
  test('strips tabstop syntax to plain text', () => {
    expect(snippetPreview('console.log(${1:value});')).toBe('console.log(value);');
    expect(snippetPreview('function ${1:name}(${2:args}) {\n\t$3\n}')).toBe(
      'function name(args) {\n\t\n}',
    );
    expect(snippetPreview('${1} and $2')).toBe(' and ');
  });
});

describe('validateSnippetBody', () => {
  test('balanced bodies pass', () => {
    expect(validateSnippetBody('if (${1:cond}) {\n\t$2\n}')).toEqual([]);
    expect(validateSnippetBody('cost is $$5')).toEqual([]);
  });

  test('unclosed ${ is an error', () => {
    expect(validateSnippetBody('console.log(${1:value);')).toHaveLength(1);
  });

  test('unmatched } is a plain code brace, not an error', () => {
    expect(validateSnippetBody('a } b')).toEqual([]);
  });

  test('a stray $ is an error', () => {
    // '$5' is a valid tabstop reference; '$x' is not.
    expect(validateSnippetBody('price $5')).toEqual([]);
    expect(validateSnippetBody('price $x')).toHaveLength(1);
  });
});

describe('snippetSuggestions', () => {
  test('offers matching snippets with InsertAsSnippet', () => {
    const items = snippetSuggestions(BUILTIN_SNIPPETS, request(), 28);
    expect(items.map((i) => i.label)).toContain('cl');
    const cl = items.find((i) => i.label === 'cl')!;
    expect(cl.insertText).toBe('console.log(${1:value});');
    expect(cl.insertTextRules).toBe(4);
    expect(cl.kind).toBe(28);
    expect(cl.source).toBe('snippet');
  });

  test('a non-matching word offers nothing', () => {
    expect(
      snippetSuggestions(BUILTIN_SNIPPETS, request({ word: 'zzz' }), 28),
    ).toEqual([]);
  });

  test('a snippet outside its scope is not offered', () => {
    const items = snippetSuggestions(
      BUILTIN_SNIPPETS,
      request({ word: 'us', languageId: 'python' }),
      28,
    );
    expect(items.map((i) => i.label)).not.toContain('us');
  });
});

describe('createSnippetCompletionProvider', () => {
  test('merges user snippets over built-ins at request time', () => {
    const provider = createSnippetCompletionProvider(
      () => [{ prefix: 'cl', body: "console.log('MINE', ${1:v});" }],
      28,
    );
    expect(provider.id).toBe('snippet');
    expect(provider.suggestionPriority).toBe(3);
    const items = provider.getSuggestions(request());
    expect(items.filter((i) => i.label === 'cl')).toHaveLength(1);
    expect(items.find((i) => i.label === 'cl')?.insertText).toBe(
      "console.log('MINE', ${1:v});",
    );
  });
});
