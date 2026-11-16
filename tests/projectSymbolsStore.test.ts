// @vitest-environment jsdom
/**
 * Project symbol index store: the build walks
 * the warm project file index, parses TS/TSX files with the
 * real tree-sitter grammars, and flattens the definitions.
 * Open files contribute in-memory content; the rest is read
 * through the bridge.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  refreshProjectFileIndex,
  resetProjectFileIndexForTests,
} from '../src/lib/projectFileIndex';
import { useProjectSymbolsStore } from '../src/stores/projectSymbolsStore';
import type { FileEntry } from '../src/types';

const FILES: Record<string, string> = {
  '/Users/gary/project/src/a.ts': [
    'export function greet(name: string): string {',
    '  return `hi ${name}`;',
    '}',
    '',
    'export class User {',
    '  constructor(public name: string) {}',
    '}',
    '',
  ].join('\n'),
  '/Users/gary/project/src/b.tsx': [
    'export function Widget(): JSX.Element {',
    '  return <div />;',
    '}',
    '',
  ].join('\n'),
};

function entry(path: string): FileEntry {
  return {
    name: path.split('/').pop() ?? path,
    path,
    isDirectory: false,
    isFile: true,
    size: 0,
    modified: 0,
  };
}

describe('projectSymbolsStore', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    resetProjectFileIndexForTests();
    useProjectSymbolsStore.getState().resetForTests();
    (globalThis as unknown as { window?: unknown }).window = {
      lucidAPI: {
        fs: {
          readDir: vi.fn(async () => [
            entry('/Users/gary/project/src/a.ts'),
            entry('/Users/gary/project/src/b.tsx'),
            entry('/Users/gary/project/src/notes.md'),
          ]),
          readFile: vi.fn(async (path: string) => FILES[path] ?? ''),
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  async function seedIndex() {
    const listNames = async (dir: string) =>
      dir === '/Users/gary/project' ? ['package.json', 'src'] : [];
    await refreshProjectFileIndex('/Users/gary/project/src', listNames);
  }

  it('indexes TS/TSX definitions across the project, with 1-based lines', async () => {
    await seedIndex();
    await useProjectSymbolsStore.getState().buildIndex();
    const state = useProjectSymbolsStore.getState();
    expect(state.indexedFiles).toBe(2);
    expect(state.symbols).toEqual([
      { name: 'greet', kind: 'function', path: '/Users/gary/project/src/a.ts', line: 1 },
      { name: 'User', kind: 'class', path: '/Users/gary/project/src/a.ts', line: 5 },
      // The class constructor is a definition too (a method).
      { name: 'constructor', kind: 'method', path: '/Users/gary/project/src/a.ts', line: 6 },
      { name: 'Widget', kind: 'function', path: '/Users/gary/project/src/b.tsx', line: 1 },
    ]);
    expect(state.indexedAt).not.toBeNull();
    expect(state.error).toBeNull();
  });

  it('a second build while indexing is a no-op', async () => {
    await seedIndex();
    const first = useProjectSymbolsStore.getState().buildIndex();
    const second = useProjectSymbolsStore.getState().buildIndex();
    await Promise.all([first, second]);
    expect(useProjectSymbolsStore.getState().indexedFiles).toBe(2);
  });

  it('an open file contributes its in-memory content, not the disk read', async () => {
    await seedIndex();
    // Open a.ts with unsaved content that defines a different symbol.
    const { useFileStore } = await import('../src/stores/fileStore');
    useFileStore.setState({
      openFiles: [
        {
          path: '/Users/gary/project/src/a.ts',
          content: 'export function editedGreet() {}\n',
          isDirty: true,
        },
      ],
      activeFilePath: '/Users/gary/project/src/a.ts',
    });
    await useProjectSymbolsStore.getState().buildIndex();
    const names = useProjectSymbolsStore
      .getState()
      .symbols.filter((s) => s.path.endsWith('a.ts'))
      .map((s) => s.name);
    expect(names).toEqual(['editedGreet']);
    useFileStore.setState({ openFiles: [], activeFilePath: null });
  });
});
