/**
 * Project symbols: the tree-sitter index —
 * pure build + search.
 */

import { describe, it, expect } from 'vitest';
import {
  buildProjectSymbolIndex,
  isIndexableSymbolPath,
  searchProjectSymbols,
  symbolsFromDefinitions,
} from '../src/lib/projectSymbols';
import type { FileDefinition } from '../src/lib/fileStructure';

function def(name: string, kind: FileDefinition['kind'], startRow: number): FileDefinition {
  return { name, kind, startIndex: 0, endIndex: 10, startRow, endRow: startRow };
}

describe('isIndexableSymbolPath', () => {
  it('indexes TS/TSX/JS/JSX — the grammars Lucid has', () => {
    expect(isIndexableSymbolPath('/p/a.ts')).toBe(true);
    expect(isIndexableSymbolPath('/p/a.tsx')).toBe(true);
    expect(isIndexableSymbolPath('/p/a.js')).toBe(true);
    expect(isIndexableSymbolPath('/p/a.jsx')).toBe(true);
  });

  it('does not index other languages (no grammar in Lucid)', () => {
    expect(isIndexableSymbolPath('/p/a.py')).toBe(false);
    expect(isIndexableSymbolPath('/p/a.rs')).toBe(false);
    expect(isIndexableSymbolPath('/p/a.md')).toBe(false);
    expect(isIndexableSymbolPath('/p/a.json')).toBe(false);
  });
});

describe('symbolsFromDefinitions', () => {
  it('maps startRow (0-based) to a 1-based line', () => {
    expect(
      symbolsFromDefinitions('/p/a.ts', [def('greet', 'function', 0), def('User', 'class', 9)]),
    ).toEqual([
      { name: 'greet', kind: 'function', path: '/p/a.ts', line: 1 },
      { name: 'User', kind: 'class', path: '/p/a.ts', line: 10 },
    ]);
  });
});

describe('buildProjectSymbolIndex', () => {
  it('flattens per-file definitions, file order kept', () => {
    const index = buildProjectSymbolIndex([
      { path: '/p/a.ts', definitions: [def('alpha', 'function', 0)] },
      { path: '/p/b.ts', definitions: [def('beta', 'class', 4), def('gamma', 'function', 8)] },
    ]);
    expect(index.map((s) => `${s.name}@${s.path}:${s.line}`)).toEqual([
      'alpha@/p/a.ts:1',
      'beta@/p/b.ts:5',
      'gamma@/p/b.ts:9',
    ]);
  });
});

describe('searchProjectSymbols', () => {
  const symbols = buildProjectSymbolIndex([
    {
      path: '/p/b.ts',
      definitions: [def('openFile', 'function', 0), def('closeFile', 'function', 5)],
    },
    {
      path: '/p/a.ts',
      definitions: [def('openFile', 'function', 2), def('openProject', 'function', 7)],
    },
  ]);

  it('empty query returns the whole index, in order', () => {
    expect(searchProjectSymbols(symbols, '')).toEqual(symbols);
  });

  it('exact name match ranks first', () => {
    const found = searchProjectSymbols(symbols, 'openFile');
    expect(found.map((s) => `${s.path}:${s.line}`)).toEqual(['/p/a.ts:3', '/p/b.ts:1']);
  });

  it('a prefix ranks above a fuzzy match', () => {
    // 'open' prefixes openFile (both files) and openProject;
    // all three are rank 1, so the path tie-break orders them:
    // /p/a.ts first (openFile, then openProject), then /p/b.ts.
    const found = searchProjectSymbols(symbols, 'open');
    expect(found.map((s) => `${s.name}@${s.path}:${s.line}`)).toEqual([
      'openFile@/p/a.ts:3',
      'openProject@/p/a.ts:8',
      'openFile@/p/b.ts:1',
    ]);
  });

  it('fuzzy-matches across the name', () => {
    // 'oFl' is a subsequence of openFile — and of closeFile
    // (o…F…l) — so all three match; the earlier match in
    // openFile scores higher.
    const found = searchProjectSymbols(symbols, 'oFl');
    expect(found.map((s) => s.name)).toEqual(['openFile', 'openFile', 'closeFile']);
  });

  it('no match returns an empty list', () => {
    expect(searchProjectSymbols(symbols, 'zzz')).toEqual([]);
  });

  it('same name in two files orders by path, then line', () => {
    const found = searchProjectSymbols(symbols, 'openFile');
    expect(found[0].path).toBe('/p/a.ts');
  });
});
