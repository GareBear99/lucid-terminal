/**
 * Search IPC tests.
 *
 * The main process runs `rg --json` (or the Node fallback
 * when ripgrep is missing) and replaces only inside the
 * searched root, which must sit inside the home directory.
 * These tests drive the real handlers against temp
 * directories: the Node fallback end to end, ripgrep end
 * to end (the VM has rg 14.1.0), the ripgrep JSON parser,
 * and the replace containment rules.
 *
 * Run with: npx vitest run tests/searchIpc.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

vi.mock('electron', () => ({
  app: { getPath: () => '/nonexistent-home' },
}));

import {
  setupSearchHandlers,
  parseRipgrepJson,
  nodeSearch,
} from '../electron/ipc/search';
import type { SearchOptions } from '../src/lib/projectSearch';

let tmpHome: string;
let tmpProject: string;

async function makeProject(): Promise<void> {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-search-home-'));
  tmpProject = path.join(tmpHome, 'project');
  await fs.mkdir(tmpProject, { recursive: true });
  await fs.writeFile(
    path.join(tmpProject, 'a.ts'),
    'const foo = 1;\nconst bar = 2;\n// foo again\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(tmpProject, 'b.ts'),
    'function foo() { return "foo"; }\n',
    'utf8',
  );
  await fs.mkdir(path.join(tmpProject, 'node_modules', 'dep'), { recursive: true });
  await fs.writeFile(
    path.join(tmpProject, 'node_modules', 'dep', 'c.js'),
    'const foo = "hidden";\n',
    'utf8',
  );
  await fs.writeFile(path.join(tmpProject, 'binary.bin'), Buffer.from([0x00, 0x01, 0x66, 0x6f, 0x6f]));
}

async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

function captureHandlers(): {
  ipcMain: { handle: ReturnType<typeof vi.fn> };
  handlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
} {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
  };
  return { ipcMain, handlers };
}

describe('parseRipgrepJson', () => {
  test('parses match lines with submatches', () => {
    const stdout = [
      JSON.stringify({ type: 'begin', data: { path: { text: '/p/a.ts' } } }),
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/p/a.ts' },
          line_number: 3,
          lines: { text: 'const foo = 1;\n' },
          submatches: [
            { match: { text: 'foo' }, start: 6, end: 9 },
            { match: { text: 'foo' }, start: 6, end: 9 },
          ],
        },
      }),
      JSON.stringify({ type: 'summary', data: {} }),
    ].join('\n');
    const { matches, truncated } = parseRipgrepJson(stdout);
    expect(truncated).toBe(false);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      file: '/p/a.ts',
      line: 3,
      column: 7,
      text: 'const foo = 1;',
      matchText: 'foo',
    });
  });

  test('stops at the cap and reports truncation', () => {
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: '/p/a.ts' },
        line_number: 1,
        lines: { text: 'foo\n' },
        submatches: [{ match: { text: 'foo' }, start: 0, end: 3 }],
      },
    });
    const { matches, truncated } = parseRipgrepJson(
      Array.from({ length: 5 }, () => line).join('\n'),
      3,
    );
    expect(matches).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  test('ignores malformed lines', () => {
    const { matches } = parseRipgrepJson('not json\n{"type":"match"}\n');
    expect(matches).toEqual([]);
  });
});

describe('nodeSearch', () => {
  beforeEach(makeProject);
  afterEach(async () => {
    await removeDir(tmpHome);
  });

  const opts = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({
    query: 'foo',
    regex: false,
    caseSensitive: false,
    wholeWord: false,
    scope: 'project',
    ...overrides,
  });

  test('finds literal matches across files, skipping node_modules', async () => {
    const { matches, truncated } = await nodeSearch(tmpProject, opts());
    expect(truncated).toBe(false);
    // a.ts: line 1 + line 3; b.ts: two on line 1. node_modules skipped.
    expect(matches).toHaveLength(4);
    expect(matches.map((m) => `${path.basename(m.file)}:${m.line}`)).toEqual([
      'a.ts:1',
      'a.ts:3',
      'b.ts:1',
      'b.ts:1',
    ]);
  });

  test('regex mode matches patterns', async () => {
    const { matches } = await nodeSearch(
      tmpProject,
      opts({ query: 'foo|bar', regex: true }),
    );
    expect(matches).toHaveLength(5);
  });

  test('case-sensitive mode skips the wrong case', async () => {
    const { matches } = await nodeSearch(
      tmpProject,
      opts({ query: 'FOO', caseSensitive: true }),
    );
    expect(matches).toHaveLength(0);
    const { matches: insensitive } = await nodeSearch(
      tmpProject,
      opts({ query: 'FOO' }),
    );
    expect(insensitive).toHaveLength(4);
  });

  test('whole-word mode skips substrings', async () => {
    const { matches } = await nodeSearch(
      tmpProject,
      opts({ query: 'bar', wholeWord: true }),
    );
    expect(matches.map((m) => m.line)).toEqual([2]);
  });

  test('file scope searches one file only', async () => {
    const { matches } = await nodeSearch(
      tmpProject,
      opts({ scope: 'file', file: path.join(tmpProject, 'b.ts') }),
    );
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.file.endsWith('b.ts'))).toBe(true);
  });

  test('binary files are skipped', async () => {
    const { matches } = await nodeSearch(tmpProject, opts());
    expect(matches.some((m) => m.file.endsWith('binary.bin'))).toBe(false);
  });
});

describe('setupSearchHandlers', () => {
  beforeEach(makeProject);
  afterEach(async () => {
    await removeDir(tmpHome);
  });

  const searchOpts = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({
    query: 'foo',
    regex: false,
    caseSensitive: false,
    wholeWord: false,
    scope: 'project',
    ...overrides,
  });

  test('search:search with the Node fallback (ripgrep forced off)', async () => {
    const { ipcMain, handlers } = captureHandlers();
    setupSearchHandlers(ipcMain as never, {
      getHomeDir: () => tmpHome,
      checkRipgrep: async () => false,
    });
    const search = handlers.get('search:search')!;
    const result = (await search(null, {
      root: tmpProject,
      options: searchOpts(),
    })) as { matches: unknown[]; engine: string; truncated: boolean };
    expect(result.engine).toBe('node');
    expect(result.matches).toHaveLength(4);
    expect(result.truncated).toBe(false);
  });

  test('search:search with real ripgrep', async () => {
    const { ipcMain, handlers } = captureHandlers();
    setupSearchHandlers(ipcMain as never, {
      getHomeDir: () => tmpHome,
      checkRipgrep: async () => true,
    });
    const search = handlers.get('search:search')!;
    const result = (await search(null, {
      root: tmpProject,
      options: searchOpts(),
    })) as { matches: { file: string; line: number }[]; engine: string };
    expect(result.engine).toBe('ripgrep');
    expect(result.matches).toHaveLength(4);
    expect(result.matches[0].file).toBe(path.join(tmpProject, 'a.ts'));
  });

  test('search:search refuses a root outside the home directory', async () => {
    const { ipcMain, handlers } = captureHandlers();
    setupSearchHandlers(ipcMain as never, {
      getHomeDir: () => tmpHome,
      checkRipgrep: async () => false,
    });
    const search = handlers.get('search:search')!;
    await expect(
      search(null, { root: '/etc', options: searchOpts() }),
    ).rejects.toThrow('inside the home directory');
  });

  test('search:search rejects an invalid regex with the engine message', async () => {
    const { ipcMain, handlers } = captureHandlers();
    setupSearchHandlers(ipcMain as never, {
      getHomeDir: () => tmpHome,
      checkRipgrep: async () => false,
    });
    const search = handlers.get('search:search')!;
    await expect(
      search(null, {
        root: tmpProject,
        options: searchOpts({ query: '(unclosed', regex: true }),
      }),
    ).rejects.toThrow();
  });

  test('search:replace rewrites only the matched spans, inside the root', async () => {
    const { ipcMain, handlers } = captureHandlers();
    setupSearchHandlers(ipcMain as never, {
      getHomeDir: () => tmpHome,
      checkRipgrep: async () => false,
    });
    const search = handlers.get('search:search')!;
    const replace = handlers.get('search:replace')!;
    const result = (await search(null, {
      root: tmpProject,
      options: searchOpts(),
    })) as { matches: { file: string; line: number; column: number; text: string; matchText: string }[] };
    const replaced = (await replace(null, {
      root: tmpProject,
      replacement: 'baz',
      matches: result.matches,
    })) as { filesChanged: number; replacedCount: number };
    expect(replaced).toEqual({ filesChanged: 2, replacedCount: 4 });
    expect(await fs.readFile(path.join(tmpProject, 'a.ts'), 'utf8')).toBe(
      'const baz = 1;\nconst bar = 2;\n// baz again\n',
    );
    expect(await fs.readFile(path.join(tmpProject, 'b.ts'), 'utf8')).toBe(
      'function baz() { return "baz"; }\n',
    );
  });

  test('search:replace refuses a file outside the root', async () => {
    const { ipcMain, handlers } = captureHandlers();
    setupSearchHandlers(ipcMain as never, {
      getHomeDir: () => tmpHome,
      checkRipgrep: async () => false,
    });
    const replace = handlers.get('search:replace')!;
    await expect(
      replace(null, {
        root: tmpProject,
        replacement: 'x',
        matches: [
          {
            file: path.join(tmpHome, 'outside.ts'),
            line: 1,
            column: 1,
            text: 'foo',
            matchText: 'foo',
          },
        ],
      }),
    ).rejects.toThrow('outside the search root');
  });
});
