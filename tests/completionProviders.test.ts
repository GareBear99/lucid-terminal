/**
 * Merged completion tests.
 *
 * One completion list, fed by many providers: the registry
 * fans one request out in priority order, dedups by
 * (label, insertText) keeping the higher-priority item,
 * badges every item's detail with its source, and stops the
 * fan-out below an `excludeLowerPriority` provider that
 * returned items. The word provider is the bottom of the
 * list — subsequence matches over the current file's words,
 * never above a real symbol.
 *
 * Run with: npx vitest run tests/completionProviders.test.ts
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  mergeCompletions,
  registerCompletionProvider,
  unregisterCompletionProvider,
  getCompletionProviders,
  resetCompletionProvidersForTests,
  createWordCompletionProvider,
  type CompletionItem,
  type CompletionProvider,
  type CompletionRequest,
} from '../src/lib/completionProviders';

function request(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    word: 'con',
    linePrefix: 'con',
    lineNumber: 1,
    column: 4,
    languageId: 'typescript',
    modelText: 'const config = {};\nconst console = 1;',
    identifiers: ['config', 'console'],
    wordRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 },
    prefixRange: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 },
    ...overrides,
  };
}

function item(
  source: CompletionItem['source'],
  label: string,
  extra: Partial<CompletionItem> = {},
): CompletionItem {
  return {
    label,
    kind: 4,
    insertText: label,
    range: request().wordRange,
    source,
    ...extra,
  };
}

function provider(
  id: CompletionProvider['id'],
  priority: number,
  items: CompletionItem[],
  extra: Partial<CompletionProvider> = {},
): CompletionProvider {
  return {
    id,
    suggestionPriority: priority,
    selector: ['*'],
    getSuggestions: () => items,
    ...extra,
  };
}

describe('mergeCompletions', () => {
  beforeEach(() => {
    resetCompletionProvidersForTests();
  });

  test('merges providers in priority order', () => {
    const merged = mergeCompletions(request(), [
      provider('word', 0, [item('word', 'console')]),
      provider('lsp', 5, [item('lsp', 'config', { detail: 'const config' })]),
      provider('pattern', 2, [item('pattern', 'console.log')]),
    ]);
    expect(merged.map((i) => i.label)).toEqual([
      'config',
      'console.log',
      'console',
    ]);
  });

  test('every item is badged with its source', () => {
    const merged = mergeCompletions(request(), [
      provider('lsp', 5, [
        item('lsp', 'config', { detail: 'const config: {}' }),
      ]),
      provider('word', 0, [item('word', 'console')]),
    ]);
    expect(merged[0].detail).toBe('LSP · const config: {}');
    expect(merged[1].detail).toBe('Word');
  });

  test('dedups by (label, insertText), keeping the higher-priority item', () => {
    const merged = mergeCompletions(request(), [
      provider('lsp', 5, [item('lsp', 'console', { detail: 'var console' })]),
      provider('word', 0, [item('word', 'console')]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('lsp');
    expect(merged[0].detail).toBe('LSP · var console');
  });

  test('the same label with a different insertText is not a dupe', () => {
    const merged = mergeCompletions(request(), [
      provider('snippet', 3, [
        item('snippet', 'cl', { insertText: 'console.log($1);' }),
      ]),
      provider('word', 0, [item('word', 'cl')]),
    ]);
    expect(merged).toHaveLength(2);
  });

  test('excludeLowerPriority stops the fan-out below it', () => {
    const merged = mergeCompletions(request(), [
      provider('lsp', 5, [item('lsp', 'config')], {
        excludeLowerPriority: true,
      }),
      provider('word', 0, [item('word', 'console')]),
    ]);
    expect(merged.map((i) => i.label)).toEqual(['config']);
  });

  test('excludeLowerPriority with no items lets lower providers through', () => {
    const merged = mergeCompletions(request(), [
      provider('lsp', 5, [], { excludeLowerPriority: true }),
      provider('word', 0, [item('word', 'console')]),
    ]);
    expect(merged.map((i) => i.label)).toEqual(['console']);
  });

  test('a failing provider contributes nothing', () => {
    const failing: CompletionProvider = {
      id: 'lsp',
      suggestionPriority: 5,
      selector: ['*'],
      getSuggestions: () => {
        throw new Error('engine dead');
      },
    };
    const merged = mergeCompletions(request(), [
      failing,
      provider('word', 0, [item('word', 'console')]),
    ]);
    expect(merged.map((i) => i.label)).toEqual(['console']);
  });

  test('selector filters by language', () => {
    const merged = mergeCompletions(request({ languageId: 'python' }), [
      provider('lsp', 5, [item('lsp', 'config')], {
        selector: ['typescript', 'tsx'],
      }),
      provider('word', 0, [item('word', 'console')]),
    ]);
    expect(merged.map((i) => i.label)).toEqual(['console']);
  });

  test('the registry upserts by source id', () => {
    registerCompletionProvider(provider('word', 0, [item('word', 'a')]));
    registerCompletionProvider(provider('word', 0, [item('word', 'b')]));
    expect(getCompletionProviders()).toHaveLength(1);
    expect(mergeCompletions(request()).map((i) => i.label)).toEqual(['b']);
    unregisterCompletionProvider('word');
    expect(getCompletionProviders()).toHaveLength(0);
  });
});

describe('createWordCompletionProvider', () => {
  test('offers subsequence matches over the current file, capped at 10', () => {
    const provider = createWordCompletionProvider();
    const items = provider.getSuggestions(
      request({
        word: 'con',
        modelText:
          'const config = {};\nconst console = 1;\nconst connection = 2;\nconst container = 3;',
      }),
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain('config');
    expect(labels).toContain('console');
    expect(labels).toContain('connection');
    expect(labels).not.toContain('con');
    expect(items.length).toBeLessThanOrEqual(10);
    expect(items.every((i) => i.source === 'word')).toBe(true);
  });

  test('needs a stem of at least two characters', () => {
    const provider = createWordCompletionProvider();
    expect(
      provider.getSuggestions(request({ word: 'c' })),
    ).toEqual([]);
  });

  test('never offers the typed word itself', () => {
    const provider = createWordCompletionProvider();
    const items = provider.getSuggestions(
      request({ word: 'config', modelText: 'const config = {}; ' }),
    );
    expect(items.map((i) => i.label)).not.toContain('config');
  });
});
