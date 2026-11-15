import { describe, test, expect } from 'vitest';
import { fuzzyMatch, fuzzyScore, fuzzyFilter } from '../src/lib/fuzzyMatch';

describe('fuzzyMatch', () => {
  test('an empty query matches everything with score 0', () => {
    expect(fuzzyMatch('', 'src/App.tsx')).toEqual({ score: 0, indices: [] });
  });

  test('a non-subsequence does not match', () => {
    expect(fuzzyMatch('zx', 'src/App.tsx')).toBeNull();
    expect(fuzzyMatch('app.tsx!', 'src/App.tsx')).toBeNull();
  });

  test('an exact match scores higher than a scattered one', () => {
    const exact = fuzzyScore('app', 'app.tsx');
    const scattered = fuzzyScore('app', 'a-x-p-p.tsx');
    expect(exact).toBeGreaterThan(scattered);
  });

  test('a word-start match scores higher than a mid-word match', () => {
    const start = fuzzyScore('app', 'src/App.tsx');
    const mid = fuzzyScore('app', 'src/snapple.tsx');
    expect(start).toBeGreaterThan(mid);
  });

  test('consecutive runs beat the same letters spread out', () => {
    const run = fuzzyScore('com', 'command.ts');
    const spread = fuzzyScore('com', 'c-o-m.ts');
    expect(run).toBeGreaterThan(spread);
  });

  test('matching is case-insensitive but exact case scores higher', () => {
    const exact = fuzzyScore('App', 'App.tsx');
    const lower = fuzzyScore('app', 'App.tsx');
    expect(exact).toBeGreaterThan(lower);
    expect(fuzzyScore('app', 'APP.tsx')).toBeGreaterThan(-Infinity);
  });

  test('camelCase transitions count as word starts', () => {
    const camel = fuzzyScore('cp', 'CommandPalette.tsx');
    const plain = fuzzyScore('cp', 'compalette.tsx');
    expect(camel).toBeGreaterThan(plain);
  });

  test('indices point at the matched characters in order', () => {
    const match = fuzzyMatch('ft', 'src/fileStructure.ts');
    expect(match).not.toBeNull();
    const chars = match!.indices.map((i) => 'src/fileStructure.ts'[i]);
    expect(chars.join('')).toBe('ft');
  });

  test('a query longer than the candidate never matches', () => {
    expect(fuzzyMatch('abcdefghij', 'abc')).toBeNull();
  });
});

describe('fuzzyFilter', () => {
  const files = [
    'src/App.tsx',
    'src/components/Editor/CodeEditor.tsx',
    'src/lib/fuzzyMatch.ts',
    'src/lib/commandRegistry.ts',
  ];

  test('an empty query returns the input unchanged', () => {
    expect(fuzzyFilter(files, '', (f) => f)).toEqual(files);
  });

  test('non-matches drop out', () => {
    expect(fuzzyFilter(files, 'zzz', (f) => f)).toEqual([]);
  });

  test('results rank by score, best first', () => {
    const ranked = fuzzyFilter(files, 'code', (f) => f);
    expect(ranked[0]).toBe('src/components/Editor/CodeEditor.tsx');
  });

  test('a basename match wins over a directory-only match', () => {
    const ranked = fuzzyFilter(
      ['src/notes/other.ts', 'src/lib/notes.ts'],
      'notes',
      (f) => f,
    );
    expect(ranked[0]).toBe('src/lib/notes.ts');
  });
});
