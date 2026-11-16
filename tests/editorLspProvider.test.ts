/**
 * Adapter tests for the Monaco LSP providers (*). The provider is driven directly against
 * stubbed monaco / model / position objects — no React, no
 * real Monaco, no real engine. The callbacks are stubs, so
 * these tests pin the ADAPTER: the kind translation, the
 * prefix filter, the trigger rule, the tree-sitter fallback,
 * the resolve mapping, and the never-throw guarantee.
 *
 * The style mirrors the composer provider tests
 * (tests/composerInlineProvider.test.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { registerEditorLspProviders } from '../src/lib/editorLspProvider';
import {
  LspCompletionItemKind,
  MONACO_COMPLETION_ITEM_KIND,
  type LspCompletionItem,
  type LspHover,
  type LspSignatureHelp,
} from '../src/lib/tsLspContract';

function makeModel(word: string | null, startColumn = 1) {
  const endColumn = startColumn + (word?.length ?? 0);
  return {
    getWordAtPosition: (_position: { lineNumber: number; column: number }) =>
      word === null
        ? null
        : { word, startColumn, endColumn },
  };
}

function makePosition(lineNumber = 1, column = 1) {
  return { lineNumber, column };
}

function makeMonaco() {
  const captured: { language: string; kind: string; provider: any }[] = [];
  let disposeCount = 0;
  const monaco: any = {
    languages: {
      registerCompletionItemProvider: (language: string, provider: any) => {
        captured.push({ language, kind: 'completion', provider });
        return { dispose: () => { disposeCount += 1; } };
      },
      registerHoverProvider: (language: string, provider: any) => {
        captured.push({ language, kind: 'hover', provider });
        return { dispose: () => { disposeCount += 1; } };
      },
      registerSignatureHelpProvider: (language: string, provider: any) => {
        captured.push({ language, kind: 'signature', provider });
        return { dispose: () => { disposeCount += 1; } };
      },
    },
  };
  return { monaco, captured, disposeCount: () => disposeCount };
}

const lspItem = (
  partial: Partial<LspCompletionItem> = {},
): LspCompletionItem => ({
  label: 'useFileStore',
  kind: LspCompletionItemKind.Variable,
  detail: 'const useFileStore: ...',
  sortText: '0',
  resolveKey: 'lsp:1',
  ...partial,
});

function opts(partial: Record<string, unknown> = {}) {
  return {
    getCompletions: () => [lspItem()],
    resolveCompletion: (item: LspCompletionItem) => item,
    getStructureIdentifiers: () => ['useFileStore', 'useSettings'],
    getHover: (): LspHover | null => null,
    getSignatureHelp: (): LspSignatureHelp | null => null,
    ...partial,
  };
}

describe('registerEditorLspProviders', () => {
  it('registers completion, hover, and signature help for the language and returns one dispose', () => {
    const { monaco, captured, disposeCount } = makeMonaco();
    const dispose = registerEditorLspProviders(monaco, 'typescript', opts());
    expect(captured).toHaveLength(3);
    expect(captured.map((c) => c.kind).sort()).toEqual([
      'completion',
      'hover',
      'signature',
    ]);
    expect(captured.every((c) => c.language === 'typescript')).toBe(true);
    expect(typeof dispose).toBe('function');
    dispose();
    expect(disposeCount()).toBe(3);
  });

  it('a second registration for the same monaco + language disposes the first', () => {
    const { monaco, disposeCount } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    registerEditorLspProviders(monaco, 'typescript', opts());
    expect(disposeCount()).toBe(3);
  });

  it('registers nothing on a stubbed monaco without languages and the dispose is a no-op', () => {
    const dispose = registerEditorLspProviders({} as any, 'typescript', opts());
    expect(typeof dispose).toBe('function');
    expect(() => dispose()).not.toThrow();
  });
});

describe('completion provider', () => {
  const completion = (monaco: any, captured: any[]) =>
    captured.find((c) => c.kind === 'completion').provider;

  it('offers LSP items with the translated Monaco kind, the detail, and the word range', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useF', 1),
      makePosition(1, 5),
      {},
    );
    expect(list.suggestions).toHaveLength(1);
    const suggestion = list.suggestions[0];
    expect(suggestion.label).toBe('useFileStore');
    // LSP Variable=6 is Monaco Variable=4 — never the raw 6
    // (Monaco 6 is Struct).
    expect(suggestion.kind).toBe(MONACO_COMPLETION_ITEM_KIND.Variable);
    expect(suggestion.kind).not.toBe(LspCompletionItemKind.Variable);
    // The merge badges every item's detail with its source
    // (the source is visible in the list).
    expect(suggestion.detail).toBe('LSP · const useFileStore: ...');
    expect(suggestion.range).toEqual({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 5,
    });
  });

  it('prefix-filters by the typed word (the structure provider rule)', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => [
          lspItem({ label: 'useFileStore' }),
          lspItem({ label: 'useFileTree', resolveKey: 'lsp:2' }),
          lspItem({ label: 'somethingElse', resolveKey: 'lsp:3' }),
        ],
      }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useF', 1),
      makePosition(1, 5),
      {},
    );
    expect(list.suggestions.map((s: any) => s.label)).toEqual([
      'useFileStore',
      'useFileTree',
    ]);
  });

  it('requires a two-character stem — a single character offers everywhere', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('u', 1),
      makePosition(1, 2),
      {},
    );
    expect(list.suggestions).toHaveLength(0);
  });

  it('offers after a trigger character even with no word (member access after a dot)', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel(null),
      makePosition(1, 5),
      { triggerCharacter: '.' },
    );
    expect(list.suggestions).toHaveLength(1);
    expect(list.suggestions[0].label).toBe('useFileStore');
  });

  it('falls back to tree-sitter structure names when the engine is dead (getCompletions null)', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => null,
        getStructureIdentifiers: () => ['useFileStore', 'useFileTree'],
      }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useF', 1),
      makePosition(1, 5),
      {},
    );
    expect(list.suggestions.map((s: any) => s.label)).toEqual([
      'useFileStore',
      'useFileTree',
    ]);
    // Structure names only — Variable kind, no docs.
    expect(list.suggestions[0].kind).toBe(MONACO_COMPLETION_ITEM_KIND.Variable);
    expect(list.suggestions[0].documentation).toBeUndefined();
  });

  it('does NOT fall back when the engine answers empty — the service said nothing is valid here', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({ getCompletions: () => [] }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useF', 1),
      makePosition(1, 5),
      {},
    );
    expect(list.suggestions).toHaveLength(0);
  });

  it('never throws when a callback throws — a dead engine returns no completions, never an error', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => {
          throw new Error('engine exploded');
        },
      }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useF', 1),
      makePosition(1, 5),
      {},
    );
    expect(list.suggestions).toHaveLength(0);
  });
});

describe('resolveCompletionItem', () => {
  const resolve = (monaco: any, captured: any[]) =>
    captured.find((c) => c.kind === 'completion').provider.resolveCompletionItem;

  it('fills in the docs and the auto-import edits, converting LSP ranges to Monaco ranges', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        resolveCompletion: (item: LspCompletionItem) => ({
          ...item,
          documentation: 'The file store.',
          additionalTextEdits: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              newText: "import { helper } from './a';\n",
            },
          ],
        }),
      }),
    );
    const out = resolve(monaco, captured)({
      label: 'helper',
      kind: MONACO_COMPLETION_ITEM_KIND.Function,
      insertText: 'helper',
      __lspItem: lspItem({ label: 'helper', resolveKey: 'lsp:9' }),
    });
    expect(out.documentation).toEqual({ value: 'The file store.' });
    expect(out.additionalTextEdits).toHaveLength(1);
    expect(out.additionalTextEdits[0].text).toContain("import { helper }");
    // LSP 0-based -> Monaco 1-based.
    expect(out.additionalTextEdits[0].range).toEqual({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    });
  });

  it('returns the item unchanged when there is no resolve key (a structure fallback item)', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    const item = { label: 'useFileStore', kind: 4, insertText: 'useFileStore' };
    expect(resolve(monaco, captured)(item)).toBe(item);
  });

  it('returns the item unchanged when the entry is gone (stale resolve key)', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({ resolveCompletion: () => null }),
    );
    const item = {
      label: 'useFileStore',
      kind: 4,
      insertText: 'useFileStore',
      __lspItem: lspItem(),
    };
    expect(resolve(monaco, captured)(item)).toBe(item);
  });
});

describe('hover provider', () => {
  const hover = (monaco: any, captured: any[]) =>
    captured.find((c) => c.kind === 'hover').provider;

  it('returns the markdown contents and the converted range', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getHover: () => ({
          contents: '```typescript\nconst answer: number\n```',
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 6 },
          },
        }),
      }),
    );
    const out = hover(monaco, captured).provideHover(null, makePosition(2, 2));
    expect(out).not.toBeNull();
    expect(out.contents).toEqual([
      { value: '```typescript\nconst answer: number\n```' },
    ]);
    expect(out.range).toEqual({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 7,
    });
  });

  it('returns null when there is no hover', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    expect(hover(monaco, captured).provideHover(null, makePosition(1, 1))).toBeNull();
  });
});

describe('signature help provider', () => {
  const signature = (monaco: any, captured: any[]) =>
    captured.find((c) => c.kind === 'signature').provider;

  it('declares the clone trigger and retrigger characters and returns the help', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getSignatureHelp: () => ({
          signatures: [
            {
              label: 'greet(name: string, loud: boolean)',
              documentation: 'Greets someone.',
              parameters: [
                { label: 'name', documentation: 'The name.' },
                { label: 'loud', documentation: 'Whether to shout.' },
              ],
            },
          ],
          activeSignature: 0,
          activeParameter: 1,
        }),
      }),
    );
    const provider = signature(monaco, captured);
    expect(provider.signatureHelpTriggerCharacters).toEqual(['(', ',', '<']);
    expect(provider.signatureHelpRetriggerCharacters).toEqual([')']);
    const out = provider.provideSignatureHelp(null, makePosition(1, 7), {
      triggerCharacter: '(',
    });
    expect(out).not.toBeNull();
    expect(out.value.signatures[0].label).toBe('greet(name: string, loud: boolean)');
    expect(out.value.signatures[0].parameters).toHaveLength(2);
    expect(out.value.activeParameter).toBe(1);
    expect(typeof out.dispose).toBe('function');
  });

  it('returns null when there is no signature help', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(monaco, 'typescript', opts());
    expect(
      signature(monaco, captured).provideSignatureHelp(null, makePosition(1, 1), {}),
    ).toBeNull();
  });

  it('augments the active signature with a Docs link and common invocations', () => {
    const { monaco, captured } = makeMonaco();
    // The model the signature provider reads the line from
    // (makeLineModel lives in the pattern describe below).
    const model = { getLineContent: () => 'greet(name, ' };
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getSignatureHelp: () => ({
          signatures: [
            {
              label: 'greet(name: string, loud: boolean)',
              documentation: 'Greets someone.',
              parameters: [{ label: 'name', documentation: 'The name.' }],
            },
            {
              label: 'greet(name: string)',
              documentation: 'Greets quietly.',
              parameters: [{ label: 'name', documentation: 'The name.' }],
            },
          ],
          activeSignature: 0,
          activeParameter: 0,
        }),
        hoverLinks: (word) => ({ docs: `lucid-docs://${word}` }),
        getCommonInvocations: (callee) => [`${callee}("a", true)`, `${callee}("b", false)`],
      }),
    );
    const out = signature(monaco, captured).provideSignatureHelp(model, makePosition(1, 12), {
      triggerCharacter: '(',
    });
    expect(out).not.toBeNull();
    // Active signature: Docs link + the invocations block.
    expect(out.value.signatures[0].documentation).toContain('[Docs](lucid-docs://greet)');
    expect(out.value.signatures[0].documentation).toContain('**How others used this:**');
    expect(out.value.signatures[0].documentation).toContain('- `greet("a", true)`');
    expect(out.value.signatures[0].documentation).toContain('Greets someone.');
    // The inactive signature is untouched.
    expect(out.value.signatures[1].documentation).toBe('Greets quietly.');
  });

  it('leaves the signature unchanged with no callee, no links, and no invocations', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getSignatureHelp: () => ({
          signatures: [
            {
              label: 'greet(name: string)',
              documentation: 'Greets someone.',
              parameters: [{ label: 'name', documentation: 'The name.' }],
            },
          ],
          activeSignature: 0,
          activeParameter: 0,
        }),
      }),
    );
    // Null model: no line text, so no callee — and no opts
    // for links or invocations either.
    const out = signature(monaco, captured).provideSignatureHelp(null, makePosition(1, 7), {
      triggerCharacter: '(',
    });
    expect(out.value.signatures[0].documentation).toBe('Greets someone.');
  });
});

describe('pattern suggestions (Tabnine, patterns only)', () => {
  const completion = (monaco: any, captured: any[]) =>
    captured.find((c) => c.kind === 'completion').provider;

  // A model with a line: the word is the last token under
  // the cursor (Monaco splits on '.'), the line is the full
  // text — the pattern matches the line prefix, not the word.
  function makeLineModel(word: string | null, startColumn: number, lineText: string) {
    const endColumn = startColumn + (word?.length ?? 0);
    return {
      getWordAtPosition: (_position: { lineNumber: number; column: number }) =>
        word === null
          ? null
          : { word, startColumn, endColumn },
      getLineContent: (_lineNumber: number) => lineText,
    };
  }

  const PATTERN_TEXT = 'useFileStore.getState().openFiles';

  it('appends a pattern after the LSP items, Snippet kind, sort-last', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => [lspItem({ label: 'getState' })],
        getPatternCompletions: (prefix: string) =>
          prefix === 'useFileStore.getState' ? [PATTERN_TEXT] : [],
      }),
    );
    // Line '  useFileStore.getState' — word 'getState' at
    // columns 17–24, cursor at column 25.
    const list = completion(monaco, captured).provideCompletionItems(
      makeLineModel('getState', 17, '  useFileStore.getState'),
      makePosition(1, 25),
      {},
    );
    expect(list.suggestions).toHaveLength(2);
    expect(list.suggestions[0].label).toBe('getState');
    const pattern = list.suggestions[1];
    expect(pattern.label).toBe(PATTERN_TEXT);
    expect(pattern.kind).toBe(MONACO_COMPLETION_ITEM_KIND.Snippet);
    expect(pattern.detail).toBe('Pattern');
    expect(pattern.sortText).toBe('zz-pattern-0');
    expect(pattern.insertText).toBe(PATTERN_TEXT);
    // The range replaces the typed line prefix (first
    // non-whitespace column to the cursor).
    expect(pattern.range).toEqual({
      startLineNumber: 1,
      startColumn: 3,
      endLineNumber: 1,
      endColumn: 25,
    });
  });

  it('dedupes a pattern whose text equals an LSP label', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => [lspItem({ label: PATTERN_TEXT })],
        getPatternCompletions: () => [PATTERN_TEXT],
      }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useFileStore.getSt', 1),
      makePosition(1, 19),
      {},
    );
    expect(list.suggestions).toHaveLength(1);
    expect(list.suggestions[0].label).toBe(PATTERN_TEXT);
  });

  it('offers patterns in the dead-engine fallback, before the structure names', () => {
    // the merged list is in provider-priority
    // order — pattern (2) before structure (1). The widget
    // still shows patterns last: their sortText is
    // `zz-pattern-…`, which sorts after the structure names.
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => null,
        getStructureIdentifiers: () => ['getState', 'getStore'],
        getPatternCompletions: (prefix: string) =>
          prefix === 'useFileStore.getSt' ? [PATTERN_TEXT] : [],
      }),
    );
    // Line '  useFileStore.getSt' — word 'getSt' at columns
    // 17–21, cursor at column 22.
    const list = completion(monaco, captured).provideCompletionItems(
      makeLineModel('getSt', 17, '  useFileStore.getSt'),
      makePosition(1, 22),
      {},
    );
    expect(list.suggestions.map((s: any) => s.label)).toEqual([
      PATTERN_TEXT,
      'getState',
      'getStore',
    ]);
    expect(list.suggestions[0].kind).toBe(MONACO_COMPLETION_ITEM_KIND.Snippet);
  });

  it('falls back to the word when the model has no getLineContent', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => [],
        getPatternCompletions: (prefix: string) =>
          prefix === 'useFileStore.getSt' ? [PATTERN_TEXT] : [],
      }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeModel('useFileStore.getSt', 1),
      makePosition(1, 19),
      {},
    );
    expect(list.suggestions).toHaveLength(1);
    expect(list.suggestions[0].label).toBe(PATTERN_TEXT);
    // The range is the word range when there is no line.
    expect(list.suggestions[0].range).toEqual({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 19,
    });
  });

  it('offers nothing when no pattern callback is given', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({ getCompletions: () => [lspItem({ label: 'getState' })] }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeLineModel('getState', 17, '  useFileStore.getState'),
      makePosition(1, 25),
      {},
    );
    expect(list.suggestions).toHaveLength(1);
    expect(list.suggestions[0].label).toBe('getState');
    expect(
      list.suggestions.some(
        (s: any) => s.kind === MONACO_COMPLETION_ITEM_KIND.Snippet,
      ),
    ).toBe(false);
  });

  it('does not offer a pattern no longer than the prefix, or for a one-character prefix', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => [],
        getPatternCompletions: (prefix: string) =>
          prefix === 'useFileStore.getState' ? ['useFileStore.getState'] : [],
      }),
    );
    // The pattern equals the prefix — not strictly longer.
    const list = completion(monaco, captured).provideCompletionItems(
      makeLineModel('getState', 17, '  useFileStore.getState'),
      makePosition(1, 25),
      {},
    );
    expect(list.suggestions).toHaveLength(0);
    // A one-character prefix never offers, like the word rule.
    const short = completion(monaco, captured).provideCompletionItems(
      makeLineModel('u', 1, 'u'),
      makePosition(1, 2),
      {},
    );
    expect(short.suggestions).toHaveLength(0);
  });

  it('never throws when the pattern callback throws', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getCompletions: () => [lspItem()],
        getPatternCompletions: () => {
          throw new Error('index exploded');
        },
      }),
    );
    const list = completion(monaco, captured).provideCompletionItems(
      makeLineModel('useF', 1, 'useFileStore'),
      makePosition(1, 5),
      {},
    );
    // The throwing pattern provider contributes nothing — but
    // the merge still offers the match. No pattern items, no throw.
    expect(list.suggestions.map((s: any) => s.label)).toEqual(['useFileStore']);
    expect(list.suggestions[0].source).toBe('lsp');
  });
});

describe("Kite's settings toggles", () => {
  it('completions off returns an empty list without calling the service', () => {
    const { monaco, captured } = makeMonaco();
    const getCompletions = vi.fn(() => [lspItem()]);
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({ getCompletions, isCompletionsEnabled: () => false }),
    );
    const list = captured
      .find((c) => c.kind === 'completion')
      .provider.provideCompletionItems(makeModel('useF', 1), makePosition(1, 5), {});
    expect(list.suggestions).toEqual([]);
    expect(getCompletions).not.toHaveBeenCalled();
  });

  it('hover off returns null without calling the service', () => {
    const { monaco, captured } = makeMonaco();
    const getHover = vi.fn(() => ({ contents: 'x' }));
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({ getHover, isHoverEnabled: () => false }),
    );
    const out = captured
      .find((c) => c.kind === 'hover')
      .provider.provideHover(null, makePosition(1, 1));
    expect(out).toBeNull();
    expect(getHover).not.toHaveBeenCalled();
  });

  it('signature help off returns null without calling the service', () => {
    const { monaco, captured } = makeMonaco();
    const getSignatureHelp = vi.fn(() => ({
      signatures: [{ label: 'f()', parameters: [] }],
      activeSignature: 0,
      activeParameter: 0,
    }));
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({ getSignatureHelp, isSignatureHelpEnabled: () => false }),
    );
    const out = captured
      .find((c) => c.kind === 'signature')
      .provider.provideSignatureHelp(null, makePosition(1, 7), { triggerCharacter: '(' });
    expect(out).toBeNull();
    expect(getSignatureHelp).not.toHaveBeenCalled();
  });

  it('absent toggles mean on (the old behaviour)', () => {
    const { monaco, captured } = makeMonaco();
    registerEditorLspProviders(
      monaco,
      'typescript',
      opts({
        getHover: () => ({ contents: '```typescript\nconst answer: number\n```' }),
      }),
    );
    expect(
      captured.find((c) => c.kind === 'hover').provider.provideHover(null, makePosition(1, 1)),
    ).not.toBeNull();
  });
});
