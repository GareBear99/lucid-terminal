/**
 * TypeScript language service tests.
 *
 * Runs the REAL TS 6.0.3 language service in the node test
 * environment (the same discipline as the tree-sitter tests:
 * no stubs for the engine — a stub would prove nothing about
 * the compiler). The engine loads lazily from the real
 * `typescript-lsp` package and the real generated lib bundle.
 * If it cannot load, the suite fails loudly here — a dead
 * engine is a fact, not a skip.
 *
 * Each test uses its own file path so the shared in-memory
 * documents never interfere with each other.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkEdit,
  closeDocument,
  ensureTsLsp,
  getCompletions,
  getDefinition,
  getDiagnostics,
  getDocumentSymbols,
  getHover,
  getReferences,
  getSignatureHelp,
  getTsVersion,
  getTypeDefinition,
  isTsLspReady,
  openDocument,
  resolveCompletion,
  verifyIdentifier,
  verifyIdentifiers,
} from '../src/lib/tsLanguageService';
import { LspCompletionItemKind } from '../src/lib/tsLspContract';

const DIR = '/ts-lsp-test';

beforeAll(async () => {
  expect(await ensureTsLsp()).toBe(true);
  expect(isTsLspReady()).toBe(true);
});

afterAll(() => {
  // Every test file is closed, so no test state leaks into
  // the next file (the engine itself is shared and stays up).
  for (const name of [
    'complete',
    'hover',
    'sig',
    'diag2304',
    'diag2322',
    'check',
    'verify',
    'auto-a',
    'auto-b',
    'symbols',
    'def',
    'imports',
    'ambient-def',
  ]) {
    closeDocument(`${DIR}/${name}.ts`);
  }
});

describe('engine', () => {
  it('runs the pinned TS 6.x (never 7 — TS 7 has no tsserver.js and the server cannot run against it)', () => {
    const version = getTsVersion();
    expect(version).toMatch(/^6\./);
  });
});

describe('getCompletions', () => {
  it('offers a defined symbol with the right kind and the service sort order', () => {
    const path = `${DIR}/complete.ts`;
    openDocument(path, 'const useFileStore = 1;\nconst x = useF');
    const list = getCompletions(path, { line: 1, character: 14 });
    expect(list).not.toBeNull();
    const item = list!.items.find((i) => i.label === 'useFileStore');
    expect(item).toBeDefined();
    expect(item!.kind).toBe(LspCompletionItemKind.Variable);
    // The resolve key is what completionItem/resolve needs.
    expect(item!.resolveKey).toMatch(/^lsp:/);
    // The service's own sort order is kept, never re-sorted.
    expect(list!.items.length).toBeGreaterThan(0);
  });

  it('returns null for a file that is not open (the provider falls back to tree-sitter)', () => {
    expect(getCompletions(`${DIR}/not-open.ts`, { line: 0, character: 0 })).toBeNull();
  });
});

describe('getHover', () => {
  it('returns the type as a fenced code block', () => {
    const path = `${DIR}/hover.ts`;
    openDocument(path, 'const answer: number = 42;\nanswer;');
    const hover = getHover(path, { line: 1, character: 1 });
    expect(hover).not.toBeNull();
    expect(hover!.contents).toContain('answer');
    expect(hover!.contents).toContain('number');
    expect(hover!.range).toBeDefined();
  });

  it('returns null where there is nothing to hover', () => {
    const path = `${DIR}/hover.ts`;
    expect(getHover(path, { line: 0, character: 0 })).toBeNull();
  });
});

describe('getSignatureHelp', () => {
  it('returns the full call label with parameters, the active parameter, and the docs', () => {
    const path = `${DIR}/sig.ts`;
    openDocument(
      path,
      '/** Greets someone. */\nfunction greet(name: string, loud: boolean): void {}\ngreet(',
    );
    const help = getSignatureHelp(path, { line: 2, character: 6 });
    expect(help).not.toBeNull();
    expect(help!.signatures).toHaveLength(1);
    // The label is the whole call text — the parameters are
    // the middle of it, not dropped (a regression here once
    // produced 'greet(, )') — and the return type is the tail.
    expect(help!.signatures[0].label).toBe('greet(name: string, loud: boolean): void');
    expect(help!.signatures[0].parameters).toHaveLength(2);
    expect(help!.signatures[0].parameters[0].label).toBe('name');
    expect(help!.signatures[0].parameters[1].label).toBe('loud');
    expect(help!.signatures[0].documentation).toContain('Greets someone.');
    expect(help!.activeSignature).toBe(0);
    expect(help!.activeParameter).toBe(0);
  });
});

describe('getDiagnostics', () => {
  it('flags an undefined variable (2304)', () => {
    const path = `${DIR}/diag2304.ts`;
    // 'zzzqqq' has no near-match global — 'notDefined' reports
    // as 2552 ("Did you mean 'undefined'?"), not plain 2304.
    openDocument(path, 'const x = zzzqqq;\n');
    const diagnostics = getDiagnostics(path);
    expect(diagnostics.some((d) => d.code === 2304)).toBe(true);
    expect(diagnostics[0].source).toBe('ts');
  });

  it('flags a type error (2322)', () => {
    const path = `${DIR}/diag2322.ts`;
    openDocument(path, 'const n: number = "hello";\n');
    const diagnostics = getDiagnostics(path);
    expect(diagnostics.some((d) => d.code === 2322)).toBe(true);
  });

  it('returns [] for a clean file — clean is a fact, not an absence', () => {
    const path = `${DIR}/diag2322.ts`;
    openDocument(path, 'const n: number = 42;\n');
    expect(getDiagnostics(path)).toEqual([]);
  });
});

describe('checkEdit', () => {
  it('says a good edit is clean and a bad edit is not — and restores the original either way', () => {
    const path = `${DIR}/check.ts`;
    openDocument(path, 'const y = 1;\n');
    expect(checkEdit(path, 'const y = 2;\n').clean).toBe(true);
    const bad = checkEdit(path, 'const y: number = "no";\n');
    expect(bad.clean).toBe(false);
    expect(bad.diagnostics.some((d) => d.code === 2322)).toBe(true);
    // The original is back: no diagnostics, and the edit that
    // was checked never landed in the document.
    expect(getDiagnostics(path)).toEqual([]);
  });
});

describe('verifyIdentifier / verifyIdentifiers', () => {
  it('resolves a defined name and rejects a made-up one, a keyword, and a primitive', () => {
    const path = `${DIR}/verify.ts`;
    openDocument(path, 'export function helper() { return 1; }\nconst x = helper();\n');
    const resolved = verifyIdentifier(path, 'helper');
    expect(resolved).not.toBeNull();
    expect(resolved!.kind).toBe('function');
    expect(verifyIdentifier(path, 'madeUpName')).toBeNull();
    expect(verifyIdentifier(path, 'if')).toBeNull();
    expect(verifyIdentifier(path, 'string')).toBeNull();
  });

  it('verifyIdentifiers keeps the resolvable candidates and drops the rest; passes through unchanged when the engine is not ready', () => {
    const path = `${DIR}/verify.ts`;
    const kept = verifyIdentifiers(path, ['helper', 'x', 'madeUpName', 'if']);
    expect(kept).toContain('helper');
    expect(kept).toContain('x');
    expect(kept).not.toContain('madeUpName');
    expect(kept).not.toContain('if');
  });
});

describe('resolveCompletion (auto-import)', () => {
  it('resolves docs and the import edit for a symbol exported by another open file', () => {
    const aPath = `${DIR}/auto-a.ts`;
    const bPath = `${DIR}/auto-b.ts`;
    // 'autoHelper' is unique across the suite's fixtures — the
    // verify.ts fixture also exports a 'helper', and the
    // completion list offers both; find() would return
    // whichever sorts first, not necessarily this one.
    openDocument(aPath, '/** Helps. */\nexport function autoHelper() { return 1; }\n');
    openDocument(bPath, 'const x = aut');
    const list = getCompletions(bPath, { line: 0, character: 13 });
    expect(list).not.toBeNull();
    const item = list!.items.find((i) => i.label === 'autoHelper');
    expect(item).toBeDefined();
    // An auto-import candidate carries its module.
    expect(item!.source).toBe('./auto-a');
    const resolved = resolveCompletion(bPath, item!);
    expect(resolved).not.toBeNull();
    expect(resolved!.documentation).toContain('Helps.');
    // The import edit is for the current file only.
    expect(resolved!.additionalTextEdits).toBeDefined();
    expect(resolved!.additionalTextEdits!.length).toBeGreaterThan(0);
    expect(resolved!.additionalTextEdits![0].newText).toContain('import');
    expect(resolved!.additionalTextEdits![0].newText).toContain('autoHelper');
  });
});

describe('document symbols, definition, references', () => {
  it('lists the file definitions (the navtree outline)', () => {
    const path = `${DIR}/symbols.ts`;
    openDocument(
      path,
      'interface Shape { area(): number; }\nfunction areaOf(s: Shape) { return s.area(); }\nconst unit = 1;\n',
    );
    const symbols = getDocumentSymbols(path);
    const names = symbols.map((s) => s.name);
    expect(names).toContain('Shape');
    expect(names).toContain('areaOf');
    expect(names).toContain('unit');
  });

  it('resolves a definition and its references across the file', () => {
    const path = `${DIR}/def.ts`;
    openDocument(path, 'function target() { return 1; }\nconst y = target();\n');
    const definitions = getDefinition(path, { line: 1, character: 11 });
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions[0].uri).toBe(path);
    // The definition range covers the declared name.
    expect(definitions[0].range.start.line).toBe(0);
    const references = getReferences(path, { line: 0, character: 11 });
    expect(references.length).toBeGreaterThanOrEqual(2);
    // Type definition of a plain function resolves to itself.
    const typeDefinitions = getTypeDefinition(path, { line: 1, character: 11 });
    expect(typeDefinitions.length).toBeGreaterThan(0);
  });
});

describe('imports', () => {
  it('a clean file with a bare import and a relative import between two open files has zero diagnostics', () => {
    const aPath = `${DIR}/auto-a.ts`;
    openDocument(aPath, 'export function autoHelper() { return 1; }\n');
    const path = `${DIR}/imports.ts`;
    // The bare import resolves through the synthetic
    // `declare module '*'` ambient file (no TS2307); the
    // relative import resolves between the two open files.
    openDocument(
      path,
      "import { useState } from 'react';\nimport { autoHelper } from './auto-a';\nconst x = autoHelper();\nexport const y = useState(x);\n",
    );
    expect(getDiagnostics(path)).toEqual([]);
  });

  it('a bare-imported symbol never resolves to the synthetic ambient file', () => {
    // Regression: Kite Docs panel showed "DEFINED IN ambient.d.ts:1"
    // for a symbol whose defining file was not open — the bare import
    // fell through to the `declare module '*'` shim. The ambient file
    // is never a real definition, so getDefinition must not surface it
    // (honest "no definition" instead of a bogus one).
    const path = `${DIR}/ambient-def.ts`;
    openDocument(
      path,
      "import { useState } from 'react';\nexport const y = useState(0);\n",
    );
    // `useState` on line 1 starts at character 17.
    expect(getDefinition(path, { line: 1, character: 19 })).toEqual([]);
    expect(getTypeDefinition(path, { line: 1, character: 19 })).toEqual([]);
    expect(
      getReferences(path, { line: 1, character: 19 }).some((r) =>
        r.uri.endsWith('ambient.d.ts'),
      ),
    ).toBe(false);
  });
});
